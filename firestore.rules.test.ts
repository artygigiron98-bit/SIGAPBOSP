/**
 * Firestore Security Rules Test Suite — Dirty Dozen Verification
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Self-Assigned Admin Role on User Creation (Privilege Escalation)',
    collectionPath: '/users/attacker_uid_1',
    operation: 'create',
    auth: { uid: 'attacker_uid_1', email: 'evil@example.com', email_verified: true },
    payload: {
      uid: 'attacker_uid_1',
      username: 'evil_user',
      name: 'Attacker',
      role: 'Admin Dinas',
      status: 'Aktif',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoofing Bootstrapped Admin',
    collectionPath: '/admins/spoof_uid',
    operation: 'create',
    auth: { uid: 'spoof_uid', email: 'artygigiron98@gmail.com', email_verified: false },
    payload: {
      uid: 'spoof_uid',
      email: 'artygigiron98@gmail.com',
      role: 'Admin Dinas',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User PII Read on /users/{userId}',
    collectionPath: '/users/victim_uid_99',
    operation: 'get',
    auth: { uid: 'attacker_uid_1', email: 'attacker@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection ("Ghost Field") on MonthlyReport Update',
    collectionPath: '/monthly_reports/2026_1_Jan',
    operation: 'update',
    auth: { uid: 'op_uid_1', email: 'op1@example.com', email_verified: true },
    payload: {
      verifStatus: 'Diajukan Sekolah',
      isVerifiedByBypass: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Terminal State Mutation on Locked MonthlyReport (Disahkan BUD)',
    collectionPath: '/monthly_reports/2026_1_Jan',
    operation: 'update',
    auth: { uid: 'op_uid_1', email: 'op1@example.com', email_verified: true },
    payload: {
      verifStatus: 'Draft',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'State Shortcutting by Operator on AnggaranRecord (Directly Setting Terverifikasi)',
    collectionPath: '/anggaran_records/2026_1_induk_reguler',
    operation: 'update',
    auth: { uid: 'op_uid_1', email: 'op1@example.com', email_verified: true },
    payload: {
      status: 'Terverifikasi',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Identity Spoofing (ownerUid Mismatch) on AnggaranRecord Creation',
    collectionPath: '/anggaran_records/2026_2_induk_reguler',
    operation: 'create',
    auth: { uid: 'attacker_uid_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      year: 2026,
      schoolNo: 2,
      tahap: 'induk',
      sumber: 'reguler',
      ownerUid: 'victim_uid_2',
      fileName: 'rkas.pdf',
      fileUrl: 'https://drive.google.com/file/d/123/view',
      status: 'Draft',
      totals: { total: 1000000 },
      canSubmit: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning / Resource Exhaustion on Path Variable',
    collectionPath: '/schools/invalid$id#with!special*chars',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'artygigiron98@gmail.com', email_verified: true },
    payload: {
      no: 999,
      npsn: '40109999',
      name: 'SD Test',
      status: 'NEGERI',
      kecamatan: 'RATAHAN',
      jenjang: 'SD',
      updatedByUid: 'admin_uid',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning (Wrong Type on Whitelisted Key)',
    collectionPath: '/users/op_uid_1',
    operation: 'update',
    auth: { uid: 'op_uid_1', email: 'op1@example.com', email_verified: true },
    payload: {
      name: 999999999,
      whatsapp: '081234567890',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Client-Forged Timestamp (createdAt != request.time) on DriveFileRecord',
    collectionPath: '/drive_files/file_123',
    operation: 'create',
    auth: { uid: 'op_uid_1', email: 'op1@example.com', email_verified: true },
    payload: {
      driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
      fileName: 'bku_jan.pdf',
      webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
      docType: 'bku',
      schoolNo: 1,
      year: 2026,
      periodKey: 'Jan',
      uploadedByUid: 'op_uid_1',
      uploadedBy: 'operator',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unauthorized Mutation / Deletion of Immutable Audit Log',
    collectionPath: '/audit_logs/log_001',
    operation: 'delete',
    auth: { uid: 'admin_uid', email: 'artygigiron98@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized Blanket List Scraping of Another School MonthlyReport',
    collectionPath: '/monthly_reports',
    operation: 'list',
    auth: { uid: 'op_uid_1', email: 'op1@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
