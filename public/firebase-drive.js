/**
 * SIGAP-BOSP Minahasa Tenggara — Firebase (Firestore & Auth) + Google Drive Integration
 * - Database: Cloud Firestore (ai-studio-sigapbosp-295b56ae-42fb-402e-a2e5-e08e50d341ab)
 * - File Storage: Google Drive API v3 (https://www.googleapis.com/auth/drive.file)
 * - Security: OAuth access token disimpan HANYA di memori (tidak pernah di localStorage/sessionStorage)
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

// ============================================================================
// 1. CONSTANTS & IN-MEMORY TOKEN STATE
// ============================================================================
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const BOOTSTRAPPED_ADMIN_EMAIL = 'artygigiron98@gmail.com';
const VALID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agus', 'Sep', 'Okt', 'Nov', 'Des'];
const VALID_VERIF_STATUS = ['Draft', 'Diajukan Sekolah', 'Diverifikasi Dinas', 'Disahkan BUD'];
const VALID_ANG_STATUS = ['Draft', 'Diajukan', 'Terverifikasi', 'Ditolak'];
const VALID_TAHAP = ['induk', 'perubahan'];
const VALID_SUMBER = ['reguler', 'kinerja', 'prestasi', 'silpaKinerja'];

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write'
});

// CRITICAL: Access token disimpan HANYA di memori JS, tidak pernah di localStorage/sessionStorage
let cachedAccessToken = null;
let cachedIdToken = null;
let needsAuth = true;
let firebaseConfig = null;
let app = null;
export let db = null;
export let auth = null;
let isInitialized = false;
let initPromise = null;

// ============================================================================
// 2. STRUCTURED FIRESTORE ERROR HANDLER
// ============================================================================
export function handleFirestoreError(error, operationType, path) {
  const currentUser = auth ? auth.currentUser : null;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser ? currentUser.uid : undefined,
      email: currentUser ? currentUser.email : undefined,
      emailVerified: currentUser ? currentUser.emailVerified : undefined,
      isAnonymous: currentUser ? currentUser.isAnonymous : undefined,
      tenantId: currentUser ? currentUser.tenantId : undefined,
      providerInfo: currentUser && currentUser.providerData
        ? currentUser.providerData.map((provider) => ({
            providerId: provider.providerId,
            displayName: provider.displayName,
            email: provider.email,
            photoUrl: provider.photoURL
          }))
        : []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// 3. INITIALIZATION & CONNECTION TEST
// ============================================================================
async function loadFirebaseConfig() {
  if (firebaseConfig) return firebaseConfig;
  const resp = await fetch('/firebase-applet-config.json', { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error('Gagal memuat konfigurasi Firebase (/firebase-applet-config.json)');
  }
  firebaseConfig = await resp.json();
  return firebaseConfig;
}

export async function initFirebase() {
  if (isInitialized) return { app, db, auth };
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const cfg = await loadFirebaseConfig();
    app = initializeApp(cfg);
    db = getFirestore(app, cfg.firestoreDatabaseId);
    auth = getAuth(app);

    // Test connection to Firestore as required by guidelines
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration. The client is offline.');
      }
      // Lanjutkan; error permission_denied pada /test/connection wajar karena default deny rules
    }

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        cachedAccessToken = null;
        cachedIdToken = null;
        needsAuth = true;
        updateCloudStatusUI();
        return;
      }
      try {
        cachedIdToken = await user.getIdToken();
      } catch (e) {
        console.warn('Gagal mengambil Firebase ID Token:', e);
      }
      // Setelah refresh halaman, user Firebase tetap ada tetapi cachedAccessToken di memori kosong
      needsAuth = !cachedAccessToken;
      updateCloudStatusUI();
    });

    isInitialized = true;
    injectGoogleAuthStyles();
    injectGoogleLoginButton();
    injectCloudStatusBanner();
    updateCloudStatusUI();
    return { app, db, auth };
  })();

  return initPromise;
}

// ============================================================================
// 4. GOOGLE SIGN-IN & OAUTH DRIVE SCOPE (POPUP FLOW)
// ============================================================================
export async function signInWithGoogle(options = {}) {
  await initFirebase();
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'consent' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedAccessToken = credential ? credential.accessToken : null;
  cachedIdToken = await result.user.getIdToken();
  needsAuth = !cachedAccessToken;
  updateCloudStatusUI();

  // Pastikan profil user & admin tercatat di Firestore
  await ensureFirestoreUserRecord(result.user);

  if (options.loginToApp) {
    await completeAppLoginWithGoogle(result.user);
  }

  return {
    user: result.user,
    accessToken: cachedAccessToken,
    idToken: cachedIdToken
  };
}

export async function ensureGoogleDriveToken() {
  await initFirebase();
  if (cachedAccessToken && auth && auth.currentUser) {
    return cachedAccessToken;
  }
  const { accessToken } = await signInWithGoogle({ loginToApp: false });
  if (!accessToken) {
    throw new Error('Izin akses Google Drive belum diberikan. Silakan klik tombol Sign in with Google.');
  }
  return accessToken;
}

export async function getFirebaseIdToken() {
  await initFirebase();
  if (auth && auth.currentUser) {
    try {
      cachedIdToken = await auth.currentUser.getIdToken();
      return cachedIdToken;
    } catch (_) {}
  }
  return cachedIdToken;
}

export function getGoogleAccessTokenInMemory() {
  return cachedAccessToken;
}

export async function signOutFirebase() {
  cachedAccessToken = null;
  cachedIdToken = null;
  needsAuth = true;
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Gagal signOut Firebase:', e);
    }
  }
  updateCloudStatusUI();
}

// ============================================================================
// 5. SANITIZERS & FIRESTORE BLUEPRINT HELPERS
// ============================================================================
function cleanStr(val, maxLen, fallback = '') {
  const s = String(val == null ? fallback : val).trim();
  return s.slice(0, maxLen);
}

function safeId(raw) {
  const s = String(raw || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  return s || 'doc_' + Date.now();
}

function cleanMap(obj, maxKeys = 20) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  const keys = Object.keys(obj).slice(0, maxKeys);
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

async function ensureFirestoreUserRecord(fbUser) {
  if (!fbUser || !db) return;
  const uid = safeId(fbUser.uid);
  const email = cleanStr(fbUser.email || '', 160);
  const isBootAdmin = email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  if (isBootAdmin) {
    const adminPath = `admins/${uid}`;
    try {
      const snap = await getDoc(doc(db, 'admins', uid));
      if (!snap.exists()) {
        await setDoc(doc(db, 'admins', uid), {
          uid,
          email,
          role: 'Admin Dinas',
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      try { handleFirestoreError(err, OperationType.WRITE, adminPath); } catch (_) {}
    }
  }

  const userPath = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      const payload = {
        uid,
        username: cleanStr(email ? email.split('@')[0] : uid, 80, 'user'),
        name: cleanStr(fbUser.displayName || (isBootAdmin ? 'Administrator Dinas' : 'Pengguna Google'), 140, 'Pengguna'),
        email,
        role: isBootAdmin ? 'Admin Dinas' : 'Operator Sekolah',
        status: isBootAdmin ? 'Aktif' : 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', uid), payload);
    }
  } catch (err) {
    try { handleFirestoreError(err, OperationType.WRITE, userPath); } catch (_) {}
  }
}

async function completeAppLoginWithGoogle(fbUser) {
  const yearSel = document.getElementById('loginYearSelect');
  const selectedYear = yearSel ? parseInt(yearSel.value, 10) : (window.activeYear || 2024);

  const resp = await fetch('/api/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cachedIdToken ? { 'X-Firebase-Token': cachedIdToken } : {})
    },
    credentials: 'include',
    body: JSON.stringify({
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || '',
      emailVerified: !!fbUser.emailVerified
    })
  });

  const data = await resp.json();
  if (!resp.ok || data.status !== 'success') {
    throw new Error(data.message || 'Gagal masuk dengan akun Google.');
  }

  if (data.token) {
    sessionStorage.setItem('rekon_node_token', data.token);
  }
  localStorage.setItem('bosp_currentUser', JSON.stringify(data.user));
  localStorage.setItem('bosp_activeYear', String(selectedYear));

  // Jika akun Admin Dinas baru pertama kali terhubung, seed data sekolah ke Firestore di latar belakang
  if (data.user && data.user.role === 'Admin Dinas') {
    seedSchoolsToFirestoreIfNeeded().catch((e) => console.warn('Seed schools:', e));
  }

  window.location.reload();
}

// ============================================================================
// 6. GOOGLE DRIVE API v3 HELPERS (FOLDER HIERARCHY, UPLOAD, DELETE WITH CONFIRM)
// ============================================================================
const folderIdCache = new Map();

async function findOrCreateDriveFolder(folderName, parentId, accessToken) {
  const safeName = String(folderName || 'SIGAP-BOSP').replace(/['\\]/g, '_').trim();
  const cacheKey = `${parentId || 'root'}::${safeName}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey);
  }

  let q = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
  const searchResp = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (searchResp.status === 401 || searchResp.status === 403) {
    cachedAccessToken = null;
    needsAuth = true;
    updateCloudStatusUI();
    throw new Error('Sesi Google Drive berakhir atau belum diizinkan. Silakan klik tombol Sign in with Google.');
  }

  if (searchResp.ok) {
    const searchData = await searchResp.json();
    if (searchData.files && searchData.files.length > 0) {
      const existingId = searchData.files[0].id;
      folderIdCache.set(cacheKey, existingId);
      return existingId;
    }
  }

  // Buat folder baru di Google Drive
  const createMeta = {
    name: safeName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {})
  };
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(createMeta)
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Gagal membuat folder Google Drive (${createResp.status}): ${errText}`);
  }

  const created = await createResp.json();
  folderIdCache.set(cacheKey, created.id);
  return created.id;
}

function base64ToBlob(base64Data, contentType = 'application/pdf') {
  const commaIdx = base64Data.indexOf(',');
  const rawBase64 = commaIdx >= 0 ? base64Data.slice(commaIdx + 1) : base64Data;
  const byteChars = atob(rawBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}

/**
 * Menghapus file dari Google Drive & Firestore — WAJIB meminta konfirmasi pengguna terlebih dahulu
 */
export async function deleteFileFromGoogleDrive(driveFileId, fileName = 'dokumen PDF', skipConfirm = false) {
  if (!driveFileId) return false;
  if (!skipConfirm) {
    const confirmed = window.confirm(
      `Konfirmasi Penghapusan Google Drive:\n\nApakah Anda yakin ingin menghapus berkas "${fileName}" (ID: ${driveFileId}) dari Google Drive?`
    );
    if (!confirmed) {
      return false;
    }
  }

  const accessToken = await ensureGoogleDriveToken();
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!resp.ok && resp.status !== 404) {
    const errText = await resp.text();
    throw new Error(`Gagal menghapus file dari Google Drive (${resp.status}): ${errText}`);
  }

  if (db && auth && auth.currentUser) {
    const path = `drive_files/${safeId(driveFileId)}`;
    try {
      await deleteDoc(doc(db, 'drive_files', safeId(driveFileId)));
    } catch (err) {
      try { handleFirestoreError(err, OperationType.DELETE, path); } catch (_) {}
    }
  }
  return true;
}

/**
 * Mengunggah file PDF ke Google Drive dalam struktur folder:
 * SIGAP-BOSP Minahasa Tenggara / {NPSN}_{NamaSekolah} / {Tahun}-{Bulan atau Anggaran}
 * Lalu menyimpan metadata file ke koleksi Firestore /drive_files/{driveFileId}
 */
export async function uploadPdfToGoogleDrive(fileOrBase64, meta = {}) {
  const accessToken = await ensureGoogleDriveToken();

  // Jika ada file lama di Google Drive yang akan diganti/ditimpa, minta konfirmasi pengguna
  if (meta.existingDriveFileId) {
    const confirmed = window.confirm(
      `Berkas sebelumnya sudah tersimpan di Google Drive.\nApakah Anda ingin mengganti dan menghapus berkas lama di Google Drive dengan "${meta.fileName || 'dokumen baru.pdf'}"?`
    );
    if (confirmed) {
      try {
        await deleteFileFromGoogleDrive(meta.existingDriveFileId, meta.fileName || 'berkas lama', true);
      } catch (e) {
        console.warn('Gagal menghapus file lama di Google Drive:', e);
      }
    }
  }

  let pdfBlob;
  if (fileOrBase64 instanceof Blob || fileOrBase64 instanceof File) {
    pdfBlob = fileOrBase64;
  } else if (typeof fileOrBase64 === 'string') {
    pdfBlob = base64ToBlob(fileOrBase64, 'application/pdf');
  } else {
    throw new Error('Format file PDF tidak dikenali.');
  }

  const schoolNo = Number(meta.schoolNo) || 0;
  const year = Number(meta.year) || new Date().getFullYear();
  const npsn = cleanStr(meta.npsn || '', 20, `NO${schoolNo}`);
  const schoolName = cleanStr(meta.schoolName || `Sekolah_${schoolNo}`, 80).replace(/[^a-zA-Z0-9._\-\s]/g, '');
  const schoolFolderName = `${npsn || 'NO' + schoolNo}_${schoolName.replace(/\s+/g, '_')}`;
  const periodFolder = cleanStr(meta.periodKey || meta.month || `TA-${year}`, 32);
  const docType = cleanStr(meta.docType || 'dokumen', 64);
  const origName = cleanStr(meta.fileName || 'dokumen.pdf', 150);
  const finalFileName = `${docType}_${year}_${periodFolder}_${origName.endsWith('.pdf') ? origName : origName + '.pdf'}`;

  // 1. Pastikan hierarki folder di Google Drive tersedia
  const rootFolderId = await findOrCreateDriveFolder('SIGAP-BOSP Minahasa Tenggara', null, accessToken);
  const schoolFolderId = await findOrCreateDriveFolder(schoolFolderName, rootFolderId, accessToken);
  const periodFolderId = await findOrCreateDriveFolder(`${year}-${periodFolder}`, schoolFolderId, accessToken);

  // 2. Upload multipart ke Google Drive API v3
  const driveMetadata = {
    name: finalFileName,
    mimeType: 'application/pdf',
    parents: [periodFolderId],
    description: `Dokumen SIGAP-BOSP Minahasa Tenggara - ${schoolName} (${docType} ${periodFolder} ${year})`
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(driveMetadata)], { type: 'application/json' }));
  form.append('file', pdfBlob, finalFileName);

  const uploadResp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    }
  );

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    throw new Error(`Gagal mengunggah PDF ke Google Drive (${uploadResp.status}): ${errText}`);
  }

  const driveFile = await uploadResp.json();
  const driveFileId = cleanStr(driveFile.id, 128);
  const webViewLink = cleanStr(
    driveFile.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
    500
  );

  // 3. Simpan indeks file ke Firestore (/drive_files/{driveFileId})
  if (db && auth && auth.currentUser) {
    const path = `drive_files/${safeId(driveFileId)}`;
    const record = {
      driveFileId: safeId(driveFileId),
      fileName: cleanStr(finalFileName, 200),
      webViewLink,
      docType,
      schoolNo: Math.max(0, Math.min(10000, schoolNo)),
      year: Math.max(2020, Math.min(2100, year)),
      periodKey: cleanStr(periodFolder, 32, 'Jan'),
      uploadedByUid: auth.currentUser.uid,
      uploadedBy: cleanStr(auth.currentUser.email || auth.currentUser.displayName || 'user', 160),
      createdAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'drive_files', safeId(driveFileId)), record);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  return {
    status: 'success',
    driveFileId,
    fileName: origName,
    fileUrl: webViewLink,
    webViewLink,
    webContentLink: driveFile.webContentLink || webViewLink,
    path: `gdrive://${driveFileId}`
  };
}

// ============================================================================
// 7. FIRESTORE DATABASE SYNC HELPERS
// ============================================================================

/**
 * Menyinkronkan data sekolah, bulanan, dan user ke Cloud Firestore
 */
export async function syncSavePayloadToFirestore(payload, appUser) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return { synced: false, reason: 'not_signed_in_firebase' };

  const uid = auth.currentUser.uid;
  const year = Math.max(2020, Math.min(2100, Number(payload.year) || 2024));

  // 1. Sinkronkan monthlyData ke /monthly_reports/{year}_{schoolNo}_{month}
  if (payload.monthlyData && typeof payload.monthlyData === 'object') {
    for (const [schoolNoRaw, monthsObj] of Object.entries(payload.monthlyData)) {
      const schoolNo = Number(schoolNoRaw);
      if (!Number.isFinite(schoolNo) || schoolNo < 1 || schoolNo > 10000) continue;
      if (!monthsObj || typeof monthsObj !== 'object') continue;

      for (const [monthKey, mData] of Object.entries(monthsObj)) {
        if (!VALID_MONTHS.includes(monthKey) || !mData || typeof mData !== 'object') continue;

        // Hanya simpan bulan yang punya aktivitas / perubahan atau jika partial save untuk sekolah tersebut
        const hasActivity =
          payload.partial ||
          mData.reconDone ||
          (mData.verifStatus && mData.verifStatus !== 'Draft') ||
          (mData.pendapatan && Object.values(mData.pendapatan).some((v) => Number(v) > 0)) ||
          (mData.belanja && Object.values(mData.belanja).some((v) => Number(v) > 0)) ||
          (mData.documents && Object.values(mData.documents).some((d) => d && d.url));

        if (!hasActivity) continue;

        const reportId = `${year}_${schoolNo}_${monthKey}`;
        const path = `monthly_reports/${reportId}`;
        const verifStatus = VALID_VERIF_STATUS.includes(mData.verifStatus) ? mData.verifStatus : 'Draft';

        const docData = {
          year,
          schoolNo,
          month: monthKey,
          ownerUid: uid,
          verifStatus,
          reconDone: !!mData.reconDone,
          ...(mData.reconDoneAt ? { reconDoneAt: cleanStr(mData.reconDoneAt, 40) } : {}),
          pendapatan: cleanMap(mData.pendapatan || {}, 20),
          belanja: cleanMap(mData.belanja || {}, 20),
          rekon: cleanMap(mData.rekon || {}, 20),
          documents: cleanMap(mData.documents || {}, 20),
          ...(typeof mData.saldoAwalCustom === 'number' ? { saldoAwalCustom: mData.saldoAwalCustom } : {}),
          ...(typeof mData.saldoReguler === 'number' ? { saldoReguler: mData.saldoReguler } : {}),
          ...(typeof mData.saldoKinerja === 'number' ? { saldoKinerja: mData.saldoKinerja } : {}),
          ...(typeof mData.saldoNonBOS === 'number' ? { saldoNonBOS: mData.saldoNonBOS } : {}),
          ...(typeof mData.saldoTunai === 'number' ? { saldoTunai: mData.saldoTunai } : {}),
          updatedAt: serverTimestamp()
        };

        try {
          await setDoc(doc(db, 'monthly_reports', reportId), docData);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
    }
  }

  // 2. Sinkronkan perubahan sekolah (jika dikirim oleh Admin)
  if (Array.isArray(payload.schools) && appUser && (appUser.role === 'Admin Dinas' || appUser.role === 'BUD')) {
    for (const s of payload.schools) {
      await syncSchoolToFirestore(s);
    }
  }

  return { synced: true };
}

export async function syncSchoolToFirestore(s) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !s || !s.no) return;
  const no = Number(s.no);
  if (!Number.isFinite(no) || no < 1 || no > 10000) return;

  const schoolId = String(no);
  const path = `schools/${schoolId}`;
  const status = String(s.status || 'NEGERI').toUpperCase() === 'SWASTA' ? 'SWASTA' : 'NEGERI';
  const jenjang = String(s.jenjang || 'SD').toUpperCase() === 'SMP' ? 'SMP' : 'SD';

  const docData = {
    no,
    npsn: cleanStr(s.npsn || '-', 20, '-'),
    name: cleanStr(s.name || `Sekolah #${no}`, 160),
    ...(s.alamat ? { alamat: cleanStr(s.alamat, 250) } : {}),
    status,
    kecamatan: cleanStr(s.kecamatan || 'MINAHASA TENGGARA', 100, 'MINAHASA TENGGARA'),
    jenjang,
    ...(s.kepalaSekolah && typeof s.kepalaSekolah === 'object' ? { kepalaSekolah: cleanMap(s.kepalaSekolah, 10) } : {}),
    ...(s.bendahara && typeof s.bendahara === 'object' ? { bendahara: cleanMap(s.bendahara, 10) } : {}),
    updatedByUid: auth.currentUser.uid,
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'schools', schoolId), docData);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function seedSchoolsToFirestoreIfNeeded() {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return;
  try {
    const firstDoc = await getDoc(doc(db, 'schools', '1'));
    if (firstDoc.exists()) return; // Sudah di-seed
    const resp = await fetch('/api/public/schools', { cache: 'no-store' });
    const data = await resp.json();
    if (data && Array.isArray(data.schools)) {
      for (const s of data.schools) {
        await syncSchoolToFirestore(s);
      }
    }
  } catch (e) {
    console.warn('Seed schools ke Firestore dilewati:', e);
  }
}

export async function syncAnggaranRecordToFirestore(rec) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !rec) return;

  const year = Math.max(2020, Math.min(2100, Number(rec.year) || new Date().getFullYear()));
  const schoolNo = Math.max(1, Math.min(10000, Number(rec.schoolNo) || 1));
  const tahap = VALID_TAHAP.includes(rec.tahap) ? rec.tahap : 'induk';
  const sumber = VALID_SUMBER.includes(rec.sumber) ? rec.sumber : 'reguler';
  const status = VALID_ANG_STATUS.includes(rec.status) ? rec.status : 'Draft';
  const recordId = `${year}_${schoolNo}_${tahap}_${sumber}`;
  const path = `anggaran_records/${recordId}`;

  const docData = {
    year,
    schoolNo,
    tahap,
    sumber,
    ownerUid: auth.currentUser.uid,
    fileName: cleanStr(rec.fileName || 'rkas.pdf', 200, 'rkas.pdf'),
    fileUrl: cleanStr(rec.fileUrl || '/api/file/rkas.pdf', 500, '/api/file/rkas.pdf'),
    ...(rec.driveFileId ? { driveFileId: cleanStr(rec.driveFileId, 128) } : {}),
    status,
    ...(rec.catatan ? { catatan: cleanStr(rec.catatan, 500) } : {}),
    totals: cleanMap(rec.totals || { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 }, 10),
    ...(rec.meta && typeof rec.meta === 'object' ? { meta: cleanMap(rec.meta, 20) } : {}),
    itemCount: Math.max(0, Math.min(10000, Array.isArray(rec.items) ? rec.items.length : (Number(rec.itemCount) || 0))),
    canSubmit: rec.canSubmit !== false,
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'anggaran_records', recordId), docData);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteAnggaranRecordFromFirestore(year, schoolNo, tahap, sumber, driveFileId, fileName) {
  await initFirebase();
  if (driveFileId) {
    await deleteFileFromGoogleDrive(driveFileId, fileName || `RKAS ${sumber} ${tahap}`, false);
  }
  if (!db || !auth || !auth.currentUser) return;
  const recordId = `${year}_${schoolNo}_${tahap}_${sumber}`;
  const path = `anggaran_records/${recordId}`;
  try {
    await deleteDoc(doc(db, 'anggaran_records', recordId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncSp2bKabToFirestore(year, records, last) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return;
  const y = Math.max(2020, Math.min(2100, Number(year) || 2024));
  const yearId = String(y);
  const path = `sp2b_kab/${yearId}`;
  try {
    await setDoc(doc(db, 'sp2b_kab', yearId), {
      year: y,
      records: cleanMap(records || {}, 200),
      last: cleanMap(last || {}, 30),
      updatedByUid: auth.currentUser.uid,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function logAuditToFirestore(action, detail, appUser) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return;
  const logId = `${Date.now()}_${auth.currentUser.uid.slice(0, 12)}`;
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      action: cleanStr(action || 'activity', 80, 'activity'),
      userUid: auth.currentUser.uid,
      username: cleanStr((appUser && appUser.username) || auth.currentUser.email || 'user', 160, 'user'),
      role: cleanStr((appUser && appUser.role) || 'Operator Sekolah', 40, 'Operator Sekolah'),
      detail: cleanStr(typeof detail === 'string' ? detail : JSON.stringify(detail || {}), 500, '{}'),
      createdAt: serverTimestamp()
    });
  } catch (err) {
    try { handleFirestoreError(err, OperationType.CREATE, path); } catch (_) {}
  }
}

export async function loadMonthlyFromFirestore(year) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const isBootAdmin =
    auth.currentUser.email &&
    auth.currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const path = 'monthly_reports';
  try {
    const q = isBootAdmin
      ? query(collection(db, 'monthly_reports'), where('year', '==', Number(year)))
      : query(collection(db, 'monthly_reports'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    const out = {};
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (Number(d.year) !== Number(year)) return;
      const no = String(d.schoolNo);
      if (!out[no]) out[no] = {};
      out[no][d.month] = d;
    });
    return out;
  } catch (err) {
    try { handleFirestoreError(err, OperationType.LIST, path); } catch (_) {}
    return null;
  }
}

// ============================================================================
// 8. UI COMPONENTS (.gsi-material-button & CLOUD STATUS BAR)
// ============================================================================
function injectGoogleAuthStyles() {
  if (document.getElementById('gsiMaterialBtnStyles')) return;
  const style = document.createElement('style');
  style.id = 'gsiMaterialBtnStyles';
  style.textContent = `
    .gsi-material-button {
      -moz-user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
      -webkit-appearance: none;
      background-color: WHITE;
      background-image: none;
      border: 1px solid #747775;
      -webkit-border-radius: 8px;
      border-radius: 8px;
      -webkit-box-sizing: border-box;
      box-sizing: border-box;
      color: #1f1f1f;
      cursor: pointer;
      font-family: 'Plus Jakarta Sans', 'Roboto', arial, sans-serif;
      font-size: 14px;
      height: 42px;
      letter-spacing: 0.25px;
      outline: none;
      overflow: hidden;
      padding: 0 14px;
      position: relative;
      text-align: center;
      -webkit-transition: background-color .218s, border-color .218s, box-shadow .218s;
      transition: background-color .218s, border-color .218s, box-shadow .218s;
      vertical-align: middle;
      white-space: nowrap;
      width: 100%;
      max-width: 100%;
      min-width: min-content;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .gsi-material-button .gsi-material-button-icon {
      height: 20px;
      margin-right: 10px;
      min-width: 20px;
      width: 20px;
      display: flex;
      align-items: center;
    }
    .gsi-material-button .gsi-material-button-content-wrapper {
      -webkit-align-items: center;
      align-items: center;
      display: flex;
      -webkit-flex-direction: row;
      flex-direction: row;
      -webkit-flex-wrap: nowrap;
      flex-wrap: nowrap;
      height: 100%;
      justify-content: center;
      position: relative;
      width: 100%;
    }
    .gsi-material-button .gsi-material-button-contents {
      -webkit-flex-grow: 0;
      flex-grow: 0;
      font-family: 'Plus Jakarta Sans', 'Roboto', arial, sans-serif;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: top;
    }
    .gsi-material-button .gsi-material-button-state {
      -webkit-transition: opacity .218s;
      transition: opacity .218s;
      bottom: 0;
      left: 0;
      opacity: 0;
      position: absolute;
      right: 0;
      top: 0;
    }
    .gsi-material-button:disabled {
      cursor: default;
      background-color: #ffffff61;
      border-color: #1f1f1f1f;
    }
    .gsi-material-button:not(:disabled):hover {
      -webkit-box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
      box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
      background-color: #f8fafc;
    }
  `;
  document.head.appendChild(style);
}

function getGoogleButtonSvg() {
  return `
    <div class="gsi-material-button-state"></div>
    <div class="gsi-material-button-content-wrapper">
      <div class="gsi-material-button-icon">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="display: block;">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
          <path fill="none" d="M0 0h48v48H0z"></path>
        </svg>
      </div>
      <span class="gsi-material-button-contents">Sign in with Google (Firebase &amp; Drive)</span>
    </div>
  `;
}

function injectGoogleLoginButton() {
  const formLogin = document.getElementById('formLogin');
  if (!formLogin || document.getElementById('googleSignInLoginBlock')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'googleSignInLoginBlock';
  wrapper.className = 'mt-3 pt-3 border-t border-slate-200';
  wrapper.innerHTML = `
    <p class="text-[11px] text-slate-500 text-center mb-2">Atau masuk langsung dengan Google untuk akses <b>Firebase Database &amp; Google Drive</b>:</p>
    <button type="button" id="btnGoogleSignInModal" class="gsi-material-button">
      ${getGoogleButtonSvg()}
    </button>
  `;

  const loginBtn = formLogin.querySelector('button[onclick*="handleLogin"]');
  if (loginBtn && loginBtn.parentNode) {
    loginBtn.parentNode.insertBefore(wrapper, loginBtn.nextSibling);
  } else {
    formLogin.appendChild(wrapper);
  }

  const btn = document.getElementById('btnGoogleSignInModal');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await signInWithGoogle({ loginToApp: true });
      } catch (err) {
        alert('Login Google dibatalkan atau gagal: ' + (err.message || err));
      } finally {
        btn.disabled = false;
      }
    });
  }
}

function injectCloudStatusBanner() {
  if (document.getElementById('sigapCloudStatusBar')) return;
  const target =
    document.querySelector('#pageMain') ||
    document.querySelector('main') ||
    document.querySelector('#mainAppContainer .app-content-wrap');
  if (!target) return;

  const bar = document.createElement('div');
  bar.id = 'sigapCloudStatusBar';
  bar.className = 'no-print mb-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-3';
  target.insertBefore(bar, target.firstChild);
  updateCloudStatusUI();
}

export function updateCloudStatusUI() {
  const bar = document.getElementById('sigapCloudStatusBar');
  if (!bar) return;

  const fbUser = auth ? auth.currentUser : null;
  const driveReady = !!(fbUser && cachedAccessToken);

  if (driveReady) {
    bar.innerHTML = `
      <div class="flex items-center gap-2.5 text-xs">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
          <i class="fa-solid fa-cloud-check text-emerald-600"></i> Firebase Firestore &amp; Google Drive Aktif
        </span>
        <span class="text-slate-600">Terhubung sebagai <b>${fbUser.email || fbUser.displayName}</b> — Unggahan PDF otomatis tersimpan di Google Drive Anda.</span>
      </div>
      <div class="flex items-center gap-2">
        <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener" class="text-xs font-semibold text-blue-700 hover:underline">
          <i class="fa-brands fa-google-drive mr-1"></i>Buka Google Drive
        </a>
      </div>
    `;
  } else if (fbUser && !cachedAccessToken) {
    bar.innerHTML = `
      <div class="flex items-center gap-2.5 text-xs">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold">
          <i class="fa-solid fa-database text-amber-600"></i> Firebase Terhubung (${fbUser.email}) · Izin Sesi Google Drive Diperlukan
        </span>
        <span class="text-slate-600">Klik tombol di samping untuk mengaktifkan kembali token unggah Google Drive pada sesi ini.</span>
      </div>
      <div style="width:260px">
        <button type="button" id="btnConnectDriveTop" class="gsi-material-button" style="height:36px;font-size:12px">
          ${getGoogleButtonSvg()}
        </button>
      </div>
    `;
  } else {
    bar.innerHTML = `
      <div class="flex items-center gap-2.5 text-xs">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-bold">
          <i class="fa-brands fa-google-drive text-blue-600"></i> Integrasi Cloud Firebase &amp; Google Drive
        </span>
        <span class="text-slate-600">Hubungkan akun Google Anda agar database tersinkron ke <b>Firebase Firestore</b> &amp; unggahan PDF tersimpan ke <b>Google Drive</b>.</span>
      </div>
      <div style="width:260px">
        <button type="button" id="btnConnectDriveTop" class="gsi-material-button" style="height:36px;font-size:12px">
          ${getGoogleButtonSvg()}
        </button>
      </div>
    `;
  }

  const btn = document.getElementById('btnConnectDriveTop');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await signInWithGoogle({ loginToApp: false });
      } catch (err) {
        alert('Gagal menghubungkan Google Drive: ' + (err.message || err));
      } finally {
        btn.disabled = false;
      }
    });
  }
}

// ============================================================================
// 9. EXPORT GLOBAL BRIDGE FOR EXISTING SCRIPTS (app.js, penganggaran.js, pejabat.js)
// ============================================================================
window.SigapFirebaseDrive = {
  initFirebase,
  signInWithGoogle,
  signOutFirebase,
  ensureGoogleDriveToken,
  getFirebaseIdToken,
  getGoogleAccessTokenInMemory,
  uploadPdfToGoogleDrive,
  deleteFileFromGoogleDrive,
  syncSavePayloadToFirestore,
  syncSchoolToFirestore,
  seedSchoolsToFirestoreIfNeeded,
  syncAnggaranRecordToFirestore,
  deleteAnggaranRecordFromFirestore,
  syncSp2bKabToFirestore,
  logAuditToFirestore,
  loadMonthlyFromFirestore,
  updateCloudStatusUI
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initFirebase().catch((e) => console.error('Firebase init error:', e));
  });
} else {
  initFirebase().catch((e) => console.error('Firebase init error:', e));
}
