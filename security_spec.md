# SIGAP-BOSP Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Global Default-Deny & Verified Identity**:
   - All collections default to `allow read, write: if false;`.
   - Every write operation across all collections requires `isSignedIn()` and `isVerifiedUser()` (`request.auth.token.email_verified == true`).
   - Bootstrapped Administrator (`artygigiron98@gmail.com`) is only recognized as admin if `request.auth.token.email_verified == true`, or if their UID exists in `/admins/$(request.auth.uid)`.

2. **PII Isolation & Self-Assigned Role Prevention (`/users/{userId}`)**:
   - `userId` must match `^[a-zA-Z0-9_\-]+$` (`isValidId(userId)`) and <= 128 chars.
   - Because `/users/{userId}` stores PII (`email`, `whatsapp`), `get` and `list` are strictly restricted to the document owner (`resource.data.uid == request.auth.uid`) or `isAdmin()`. Blanket `isSignedIn()` reads are forbidden.
   - Non-admin users creating their own profile (`userId == request.auth.uid`) MUST set `role == 'Operator Sekolah'` and `status == 'Pending'` (preventing privilege escalation to `'Admin Dinas'`).
   - Non-admin users cannot modify `role`, `status`, or `uid` on update; only `name` and `whatsapp` may be updated via an explicit `affectedKeys().hasOnly(['name', 'whatsapp', 'updatedAt'])` action gate.

3. **Master Data Integrity (`/schools/{schoolId}`)**:
   - `schoolId` must pass `isValidId(schoolId)`.
   - Only `isAdmin()` can create or delete schools.
   - Updates to `/schools/{schoolId}` require `isValidSchool(incoming())` and either `isAdmin()` or an operator updating only `kepalaSekolah`, `bendahara`, `updatedByUid`, and `updatedAt` via `affectedKeys().hasOnly(['kepalaSekolah', 'bendahara', 'updatedByUid', 'updatedAt'])`.

4. **Terminal State Locking & Relational Ownership (`/monthly_reports/{reportId}` & `/anggaran_records/{recordId}`)**:
   - `ownerUid` must equal `request.auth.uid` on creation and is immutable on update (`incoming().ownerUid == existing().ownerUid`) unless updated by `isAdmin()`.
   - Once a `MonthlyReport` reaches terminal state `verifStatus == 'Disahkan BUD'`, or an `AnggaranRecord` reaches terminal state `status == 'Terverifikasi'`, non-admin users are strictly blocked from performing any further updates or deletes (`existing().verifStatus != 'Disahkan BUD'`, `existing().status != 'Terverifikasi'`).
   - List queries (`allow list`) on `/monthly_reports` and `/anggaran_records` strictly enforce `resource.data.ownerUid == request.auth.uid || isAdmin()` without using `get()` or `exists()` on the resource path to prevent O(n) read cost explosions.

5. **Google Drive File Registry & Audit Trail Immutability (`/drive_files/{fileId}` & `/audit_logs/{logId}`)**:
   - `uploadedByUid` in `/drive_files/{fileId}` and `userUid` in `/audit_logs/{logId}` must strictly match `request.auth.uid` upon creation.
   - `createdAt` must strictly equal server timestamp `request.time`.
   - `/audit_logs/{logId}` documents are strictly immutable (`allow update, delete: if false;`).

---

## 2. The "Dirty Dozen" Payloads

### Payload 1: Self-Assigned Admin Role on User Creation (Privilege Escalation)
```json
{
  "collection": "/users/attacker_uid_1",
  "auth": { "uid": "attacker_uid_1", "email": "evil@example.com", "email_verified": true },
  "operation": "create",
  "payload": {
    "uid": "attacker_uid_1",
    "username": "evil_user",
    "name": "Attacker",
    "role": "Admin Dinas",
    "status": "Aktif",
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 2: Unverified Email Spoofing Bootstrapped Admin
```json
{
  "collection": "/admins/spoof_admin",
  "auth": { "uid": "spoof_uid", "email": "artygigiron98@gmail.com", "email_verified": false },
  "operation": "create",
  "payload": {
    "uid": "spoof_uid",
    "email": "artygigiron98@gmail.com",
    "role": "Admin Dinas",
    "createdAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 3: Cross-User PII Read on `/users/{userId}`
```json
{
  "collection": "/users/victim_uid_99",
  "auth": { "uid": "attacker_uid_1", "email": "attacker@example.com", "email_verified": true },
  "operation": "get"
}
```

### Payload 4: Shadow Field Injection ("Ghost Field") on `MonthlyReport` Update
```json
{
  "collection": "/monthly_reports/2026_1_Jan",
  "auth": { "uid": "op_uid_1", "email": "op1@example.com", "email_verified": true },
  "operation": "update",
  "payload": {
    "verifStatus": "Diajukan Sekolah",
    "isVerifiedByBypass": true,
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 5: Terminal State Mutation on Locked `MonthlyReport` (`Disahkan BUD`)
```json
{
  "collection": "/monthly_reports/2026_1_Jan",
  "existingState": { "verifStatus": "Disahkan BUD", "ownerUid": "op_uid_1" },
  "auth": { "uid": "op_uid_1", "email": "op1@example.com", "email_verified": true },
  "operation": "update",
  "payload": {
    "verifStatus": "Draft",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 6: State Shortcutting by Operator on `AnggaranRecord` (Directly Setting `Terverifikasi`)
```json
{
  "collection": "/anggaran_records/2026_1_induk_reguler",
  "existingState": { "status": "Draft", "ownerUid": "op_uid_1" },
  "auth": { "uid": "op_uid_1", "email": "op1@example.com", "email_verified": true },
  "operation": "update",
  "payload": {
    "status": "Terverifikasi",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 7: Identity Spoofing (`ownerUid` Mismatch) on `AnggaranRecord` Creation
```json
{
  "collection": "/anggaran_records/2026_2_induk_reguler",
  "auth": { "uid": "attacker_uid_1", "email": "attacker@example.com", "email_verified": true },
  "operation": "create",
  "payload": {
    "year": 2026,
    "schoolNo": 2,
    "tahap": "induk",
    "sumber": "reguler",
    "ownerUid": "victim_uid_2",
    "fileName": "rkas.pdf",
    "fileUrl": "https://drive.google.com/file/d/123/view",
    "status": "Draft",
    "totals": { "total": 1000000 },
    "canSubmit": true,
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 8: ID Poisoning / Resource Exhaustion on Path Variable
```json
{
  "collection": "/schools/invalid$id#with!special*chars",
  "auth": { "uid": "admin_uid", "email": "artygigiron98@gmail.com", "email_verified": true },
  "operation": "create",
  "payload": {
    "no": 999,
    "npsn": "40109999",
    "name": "SD Test",
    "status": "NEGERI",
    "kecamatan": "RATAHAN",
    "jenjang": "SD",
    "updatedByUid": "admin_uid",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 9: Value Poisoning (Oversized String / Wrong Type on Whitelisted Key)
```json
{
  "collection": "/users/op_uid_1",
  "auth": { "uid": "op_uid_1", "email": "op1@example.com", "email_verified": true },
  "operation": "update",
  "payload": {
    "name": 999999999,
    "whatsapp": "081234567890",
    "updatedAt": "SERVER_TIMESTAMP"
  }
}
```

### Payload 10: Client-Forged Timestamp (`createdAt` != `request.time`) on `DriveFileRecord`
```json
{
  "collection": "/drive_files/file_123",
  "auth": { "uid": "op_uid_1", "email": "op1@example.com", "email_verified": true },
  "operation": "create",
  "payload": {
    "driveFileId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
    "fileName": "bku_jan.pdf",
    "webViewLink": "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view",
    "docType": "bku",
    "schoolNo": 1,
    "year": 2026,
    "periodKey": "Jan",
    "uploadedByUid": "op_uid_1",
    "uploadedBy": "operator",
    "createdAt": "2020-01-01T00:00:00.000Z"
  }
}
```

### Payload 11: Unauthorized Mutation / Deletion of Immutable Audit Log
```json
{
  "collection": "/audit_logs/log_001",
  "auth": { "uid": "admin_uid", "email": "artygigiron98@gmail.com", "email_verified": true },
  "operation": "delete"
}
```

### Payload 12: Unauthorized Blanket List Scraping of Another School's `MonthlyReport`
```json
{
  "collection": "/monthly_reports",
  "auth": { "uid": "op_uid_1", "email": "op1@example.com", "email_verified": true },
  "operation": "list",
  "query": "where('schoolNo', '==', 2)"
}
```

---

## 3. Test Runner Reference
See `/firestore.rules.test.ts` for the complete test suite verifying all 12 Dirty Dozen payloads return `PERMISSION_DENIED`.
