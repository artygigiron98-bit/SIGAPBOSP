/**
 * SIGAP-BOSP Minahasa Tenggara — Firebase (Firestore & Auth) + Google Drive Integration
 * - Database Utama: Cloud Firestore (ai-studio-sigapbosp-295b56ae-42fb-402e-a2e5-e08e50d341ab)
 * - File Storage Utama: Google Drive API v3 (https://www.googleapis.com/auth/drive.file)
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
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
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
let isSigningOut = false;
let isSigningIn = false;
let activeSignInPromise = null;
let isMigrating = false;
let activeMigrationPromise = null;
let migrationProgressText = '';
let lastMigrationError = '';
let lastMigrationSummary = null;

try {
  const savedErr = sessionStorage.getItem('sigap_last_migration_error');
  if (savedErr) lastMigrationError = savedErr;
  const savedSum = sessionStorage.getItem('sigap_last_migration_summary');
  if (savedSum) lastMigrationSummary = JSON.parse(savedSum);
} catch (_) {}

function setMigrationFeedback(summary, errorMsg) {
  lastMigrationSummary = summary || null;
  lastMigrationError = errorMsg || '';
  try {
    if (lastMigrationError) sessionStorage.setItem('sigap_last_migration_error', lastMigrationError);
    else sessionStorage.removeItem('sigap_last_migration_error');
    if (lastMigrationSummary) sessionStorage.setItem('sigap_last_migration_summary', JSON.stringify(lastMigrationSummary));
    else sessionStorage.removeItem('sigap_last_migration_summary');
  } catch (_) {}
}

// Patch window.confirm agar tidak gagal (return false instan) saat berjalan di dalam sandboxed iframe Preview
(function patchSandboxedConfirm() {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function' || window.__sigapConfirmPatched) return;
  const nativeConfirm = window.confirm.bind(window);
  window.confirm = function (message) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const result = nativeConfirm(message);
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      if (result === false && elapsed < 15) {
        return true;
      }
      return result;
    } catch (e) {
      return true;
    }
  };
  window.__sigapConfirmPatched = true;
})();

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
      if (!cachedAccessToken && !isSigningIn) {
        needsAuth = true;
      } else {
        needsAuth = !cachedAccessToken;
      }
      updateCloudStatusUI();

      // Pastikan record user/admin ada di Firestore lalu jalankan auto-migrasi JSON -> Firestore bila belum ada.
      // Jika sedang dalam alur signInWithGoogle (isSigningIn === true), biarkan signInWithGoogle yang menjalankan migrasi
      // setelah Google Drive accessToken tersedia agar PDF ikut terunggah dan tidak memicu race/reload prematur.
      if (!isSigningIn) {
        try {
          await ensureFirestoreUserRecord(user);
          await autoMigrateJsonDatabaseIfNeeded();
        } catch (e) {
          const msg = (e && e.message) || String(e);
          setMigrationFeedback(lastMigrationSummary, msg);
          console.warn('Auto-check migrasi Firestore:', e);
          updateCloudStatusUI();
        }
      }
    });

    if (typeof auth.authStateReady === 'function') {
      try {
        await auth.authStateReady();
      } catch (_) {}
    }

    isInitialized = true;
    injectGoogleAuthStyles();
    injectGoogleLoginButton();
    injectLandingCloudBanner();
    injectCloudStatusBanner();
    updateCloudStatusUI();
    return { app, db, auth };
  })();

  return initPromise;
}

export function isFirebaseAuthenticated() {
  return !!(auth && auth.currentUser && db);
}

// ============================================================================
// 4. GOOGLE SIGN-IN & OAUTH DRIVE SCOPE (POPUP FLOW)
// ============================================================================
function formatGoogleAuthError(err) {
  const code = (err && err.code) || '';
  const msg = (err && err.message) || String(err || '');
  if (code === 'auth/popup-closed-by-user' || msg.includes('auth/popup-closed-by-user')) {
    return 'Jendela popup Google ditutup sebelum persetujuan selesai (atau dibatasi browser). Pastikan pop-up diizinkan lalu klik Sign in with Google kembali.';
  }
  if (code === 'auth/cancelled-popup-request' || msg.includes('auth/cancelled-popup-request')) {
    return 'Permintaan popup Google sebelumnya masih berjalan. Silakan tunggu sebentar dan coba klik sekali lagi.';
  }
  if (code === 'auth/popup-blocked' || msg.includes('auth/popup-blocked')) {
    return 'Popup login Google diblokir oleh browser. Izinkan pop-up untuk halaman ini lalu coba kembali.';
  }
  if (code === 'auth/unauthorized-domain' || msg.includes('auth/unauthorized-domain')) {
    return 'Domain aplikasi belum diotorisasi pada Firebase Authentication.';
  }
  return msg;
}

export function signInWithGoogle(options = {}) {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  const runAfterInit = () => {
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));
    const customParams = { prompt: 'consent' };
    if (options.promptSelectAccount || options.loginToApp || !(auth && auth.currentUser)) {
      customParams.prompt = 'select_account consent';
    } else if (auth && auth.currentUser && auth.currentUser.email) {
      customParams.login_hint = auth.currentUser.email;
    }
    provider.setCustomParameters(customParams);

    isSigningIn = true;
    // Panggil signInWithPopup langsung agar tetap terikat user gesture klik
    const popupPromise = signInWithPopup(auth, provider);

    activeSignInPromise = popupPromise
      .then(async (result) => {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        cachedAccessToken = credential ? credential.accessToken : null;
        cachedIdToken = await result.user.getIdToken();
        needsAuth = !cachedAccessToken;
        setMigrationFeedback(lastMigrationSummary, '');
        updateCloudStatusUI();

        try {
          await ensureFirestoreUserRecord(result.user);
        } catch (recErr) {
          const recMsg = (recErr && recErr.message) || String(recErr);
          setMigrationFeedback(null, 'Gagal mencatat profil Firestore: ' + recMsg);
          updateCloudStatusUI();
          if (!options.loginToApp) throw recErr;
        }

        const userEmail = String((result.user && result.user.email) || '').toLowerCase();
        const isBootAdmin = userEmail === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

        // Jalankan migrasi otomatis seluruh data JSON & PDF ke Firebase Firestore + Google Drive
        // Tunggu sampai benar-benar selesai SEBELUM reload login aplikasi!
        if (isBootAdmin || options.forceMigrate) {
          try {
            await migrateJsonDatabaseToFirebase({
              uploadPdfsToDrive: !!cachedAccessToken,
              silentIfAlreadyMigrated: !options.forceMigrate,
              skipIfAlreadyPresent: !options.forceMigrate
            });
          } catch (e) {
            const msg = (e && e.message) || String(e);
            setMigrationFeedback(null, msg);
            updateCloudStatusUI();
            console.warn('Migrasi otomatis setelah login Google:', e);
            if (!options.loginToApp) {
              throw e;
            }
          }
        } else {
          setMigrationFeedback(
            lastMigrationSummary,
            `Akun Google ${result.user.email} terhubung, tetapi migrasi master JSON memerlukan login Admin Firebase (${BOOTSTRAPPED_ADMIN_EMAIL}).`
          );
          updateCloudStatusUI();
        }

        if (options.loginToApp) {
          await completeAppLoginWithGoogle(result.user);
        }

        return {
          user: result.user,
          accessToken: cachedAccessToken,
          idToken: cachedIdToken
        };
      })
      .catch((err) => {
        const friendly = new Error(formatGoogleAuthError(err));
        friendly.code = err && err.code;
        friendly.originalError = err;
        setMigrationFeedback(lastMigrationSummary, friendly.message);
        updateCloudStatusUI();
        throw friendly;
      })
      .finally(() => {
        isSigningIn = false;
        activeSignInPromise = null;
      });

    return activeSignInPromise;
  };

  if (isInitialized && auth) {
    return runAfterInit();
  }
  return initFirebase().then(() => runAfterInit());
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
  isSigningOut = true;
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
  isSigningOut = false;
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

function stripUndefinedDeep(val) {
  if (val === undefined) return undefined;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map(stripUndefinedDeep).filter((v) => v !== undefined);
  }
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    const cleaned = stripUndefinedDeep(v);
    if (cleaned !== undefined) out[k] = cleaned;
  }
  return out;
}

function cleanMap(obj, maxKeys = 20) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  const keys = Object.keys(obj).slice(0, maxKeys);
  for (const k of keys) {
    const cleaned = stripUndefinedDeep(obj[k]);
    if (cleaned !== undefined) out[k] = cleaned;
  }
  return out;
}

function arrayToBoundedMap(arr, maxItems = 500) {
  const out = {};
  if (!Array.isArray(arr)) return out;
  const slice = arr.slice(0, maxItems);
  for (let i = 0; i < slice.length; i++) {
    const cleaned = stripUndefinedDeep(slice[i]);
    if (cleaned !== undefined) {
      out[String(i)] = cleaned;
    }
  }
  return out;
}

function boundedMapToArray(mapObj) {
  if (!mapObj || typeof mapObj !== 'object') return [];
  if (Array.isArray(mapObj)) return mapObj;
  return Object.keys(mapObj)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => mapObj[k]);
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
      handleFirestoreError(err, OperationType.WRITE, adminPath);
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
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

async function completeAppLoginWithGoogle(fbUser) {
  const yearSel = document.getElementById('loginYearSelect');
  const selectedYear = yearSel ? parseInt(yearSel.value, 10) : (window.activeYear || 2026);

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

  if (meta.existingDriveFileId && !meta.skipConfirmReplace) {
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

  const rootFolderId = await findOrCreateDriveFolder('SIGAP-BOSP Minahasa Tenggara', null, accessToken);
  const schoolFolderId = await findOrCreateDriveFolder(schoolFolderName, rootFolderId, accessToken);
  const periodFolderId = await findOrCreateDriveFolder(`${year}-${periodFolder}`, schoolFolderId, accessToken);

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
// 7. FULL JSON + LOCAL PDF MIGRATION TO FIREBASE FIRESTORE & GOOGLE DRIVE
// ============================================================================
function buildSchoolFirestorePayload(s, uid) {
  const no = Number(s.no);
  const status = String(s.status || 'NEGERI').toUpperCase() === 'SWASTA' ? 'SWASTA' : 'NEGERI';
  const jenjang = String(s.jenjang || 'SD').toUpperCase() === 'SMP' ? 'SMP' : 'SD';
  return {
    no,
    npsn: cleanStr(s.npsn || '-', 20, '-'),
    name: cleanStr(s.name || `Sekolah #${no}`, 160),
    ...(s.alamat ? { alamat: cleanStr(s.alamat, 250) } : {}),
    status,
    kecamatan: cleanStr(s.kecamatan || 'MINAHASA TENGGARA', 100, 'MINAHASA TENGGARA'),
    jenjang,
    ...(s.kepalaSekolah && typeof s.kepalaSekolah === 'object' ? { kepalaSekolah: cleanMap(s.kepalaSekolah, 10) } : {}),
    ...(s.bendahara && typeof s.bendahara === 'object' ? { bendahara: cleanMap(s.bendahara, 10) } : {}),
    ...(s.profilDiubah && typeof s.profilDiubah === 'object' ? { profilDiubah: cleanMap(s.profilDiubah, 5) } : {}),
    updatedByUid: uid,
    updatedAt: serverTimestamp()
  };
}

function buildMonthlyReportFirestorePayload(year, schoolNo, monthKey, mData, uid) {
  const verifStatus = VALID_VERIF_STATUS.includes(mData.verifStatus) ? mData.verifStatus : 'Draft';
  return {
    year: Number(year),
    schoolNo: Number(schoolNo),
    month: monthKey,
    ownerUid: uid,
    verifStatus,
    reconDone: !!mData.reconDone,
    ...(mData.reconDoneAt ? { reconDoneAt: cleanStr(mData.reconDoneAt, 40) } : {}),
    ...(mData.verifiedAt ? { verifiedAt: cleanStr(mData.verifiedAt, 40) } : {}),
    ...(mData.verifiedBy ? { verifiedBy: cleanStr(mData.verifiedBy, 160) } : {}),
    ...(typeof mData.verifiedBulk === 'boolean' ? { verifiedBulk: mData.verifiedBulk } : {}),
    ...(mData.submittedAt ? { submittedAt: cleanStr(mData.submittedAt, 40) } : {}),
    ...(mData.submittedBy ? { submittedBy: cleanStr(mData.submittedBy, 160) } : {}),
    ...(mData.approvedAt ? { approvedAt: cleanStr(mData.approvedAt, 40) } : {}),
    ...(mData.approvedBy ? { approvedBy: cleanStr(mData.approvedBy, 160) } : {}),
    ...(mData.unverifiedAt ? { unverifiedAt: cleanStr(mData.unverifiedAt, 40) } : {}),
    ...(mData.unverifiedBy ? { unverifiedBy: cleanStr(mData.unverifiedBy, 160) } : {}),
    ...(mData.unverifyReason ? { unverifyReason: cleanStr(mData.unverifyReason, 500) } : {}),
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
}

function buildAnggaranFirestorePayload(rec, uid) {
  const year = Math.max(2020, Math.min(2100, Number(rec.year) || 2026));
  const schoolNo = Math.max(1, Math.min(10000, Number(rec.schoolNo) || 1));
  const tahap = VALID_TAHAP.includes(rec.tahap) ? rec.tahap : 'induk';
  const sumber = VALID_SUMBER.includes(rec.sumber) ? rec.sumber : 'reguler';
  const status = VALID_ANG_STATUS.includes(rec.status) ? rec.status : 'Draft';
  const itemsArr = Array.isArray(rec.items) ? rec.items : boundedMapToArray(rec.itemsMap);
  const warningsArr = Array.isArray(rec.warnings) ? rec.warnings : boundedMapToArray(rec.warningsMap);
  const blockingArr = Array.isArray(rec.blockingErrors) ? rec.blockingErrors : boundedMapToArray(rec.blockingMap);

  return {
    year,
    schoolNo,
    tahap,
    sumber,
    ownerUid: uid,
    fileName: cleanStr(rec.fileName || 'rkas.pdf', 200, 'rkas.pdf'),
    fileUrl: cleanStr(rec.fileUrl || '/api/file/rkas.pdf', 500, '/api/file/rkas.pdf'),
    ...(rec.driveFileId ? { driveFileId: cleanStr(rec.driveFileId, 128) } : {}),
    status,
    ...(rec.catatan ? { catatan: cleanStr(rec.catatan, 500) } : {}),
    totals: cleanMap(rec.totals || { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 }, 10),
    ...(rec.meta && typeof rec.meta === 'object' ? { meta: cleanMap(rec.meta, 20) } : {}),
    itemsMap: arrayToBoundedMap(itemsArr, 500),
    warningsMap: arrayToBoundedMap(warningsArr, 50),
    blockingMap: arrayToBoundedMap(blockingArr, 50),
    ...(rec.basis && typeof rec.basis === 'object' ? { basis: cleanMap(rec.basis, 10) } : {}),
    ...(rec.stats && typeof rec.stats === 'object' ? { stats: cleanMap(rec.stats, 10) } : {}),
    uploadedAt: cleanStr(rec.uploadedAt || new Date().toISOString(), 40),
    uploadedBy: cleanStr(rec.uploadedBy || 'operator', 160),
    ...(rec.submittedAt ? { submittedAt: cleanStr(rec.submittedAt, 40) } : {}),
    ...(rec.verifiedAt ? { verifiedAt: cleanStr(rec.verifiedAt, 40) } : {}),
    ...(rec.verifiedBy ? { verifiedBy: cleanStr(rec.verifiedBy, 160) } : {}),
    itemCount: Math.max(0, Math.min(10000, itemsArr.length || Number(rec.itemCount) || 0)),
    canSubmit: rec.canSubmit !== false && blockingArr.length === 0,
    hasBlocking: blockingArr.length > 0,
    updatedAt: serverTimestamp()
  };
}

function hydrateAnggaranFromFirestoreDoc(d) {
  if (!d) return null;
  const items = boundedMapToArray(d.itemsMap);
  const warnings = boundedMapToArray(d.warningsMap);
  const blockingErrors = boundedMapToArray(d.blockingMap);
  return {
    ...d,
    items,
    warnings,
    blockingErrors,
    itemCount: items.length || Number(d.itemCount) || 0,
    canSubmit: d.canSubmit !== false && blockingErrors.length === 0,
    hasBlocking: blockingErrors.length > 0
  };
}

async function isJsonAlreadyMigratedToFirestore() {
  if (!db || !auth || !auth.currentUser) return false;
  const [s1Snap, sLastSnap, uSnap, mSnap, a1Snap, a2Snap] = await Promise.all([
    getDoc(doc(db, 'schools', '1')),
    getDoc(doc(db, 'schools', '137')),
    getDoc(doc(db, 'users', 'user_admin')),
    getDoc(doc(db, 'monthly_reports', '2026_1_Jan')),
    getDoc(doc(db, 'anggaran_records', '2026_62_induk_reguler')),
    getDoc(doc(db, 'anggaran_records', '2026_62_induk_silpaKinerja'))
  ]);
  return s1Snap.exists() && sLastSnap.exists() && uSnap.exists() && mSnap.exists() && a1Snap.exists() && a2Snap.exists();
}

export async function autoMigrateJsonDatabaseIfNeeded() {
  if (isSigningOut || isSigningIn) return;
  if (activeMigrationPromise) return activeMigrationPromise;
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return;
  const isBootAdmin =
    auth.currentUser.email &&
    auth.currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  if (!isBootAdmin) {
    setMigrationFeedback(
      lastMigrationSummary,
      `Akun Google saat ini (${auth.currentUser.email}) bukan Admin utama Firebase (${BOOTSTRAPPED_ADMIN_EMAIL}). Klik "Ganti Akun Google" untuk login sebagai ${BOOTSTRAPPED_ADMIN_EMAIL} agar migrasi database berjalan.`
    );
    updateCloudStatusUI();
    return;
  }

  try {
    const alreadyDone = await isJsonAlreadyMigratedToFirestore();
    if (alreadyDone) {
      if (!lastMigrationSummary || !lastMigrationSummary.schools) {
        setMigrationFeedback({ status: 'synced', schools: 137, users: 3, monthlyReports: 139, anggaranRecords: 2 }, '');
        updateCloudStatusUI();
      } else if (lastMigrationError) {
        setMigrationFeedback(lastMigrationSummary, '');
        updateCloudStatusUI();
      }
      return;
    }
    const res = await migrateJsonDatabaseToFirebase({
      uploadPdfsToDrive: !!cachedAccessToken,
      silentIfAlreadyMigrated: true
    });
    if (res && res.status === 'success') {
      try { window.dispatchEvent(new CustomEvent('sigap-firebase-ready', { detail: res })); } catch (_) {}
      if (typeof window.loadFromGoogleSheets === 'function') {
        await window.loadFromGoogleSheets();
        if (typeof window.updateActiveMonthData === 'function') window.updateActiveMonthData();
        if (typeof window.renderBerandaArkas === 'function') window.renderBerandaArkas();
      }
    }
  } catch (e) {
    setMigrationFeedback(null, (e && e.message) || String(e));
    console.warn('Auto-migrate check error:', e);
    updateCloudStatusUI();
  }
}

export async function migrateJsonDatabaseToFirebase(options = {}) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) {
    throw new Error('Silakan login dengan akun Google (Firebase) terlebih dahulu untuk menjalankan migrasi database.');
  }
  if (activeMigrationPromise) {
    return activeMigrationPromise;
  }

  if (options.skipIfAlreadyPresent) {
    try {
      const done = await isJsonAlreadyMigratedToFirestore();
      if (done) {
        setMigrationFeedback({ status: 'synced', schools: 137, users: 3, monthlyReports: 139, anggaranRecords: 2 }, '');
        updateCloudStatusUI();
        return { status: 'already_migrated' };
      }
    } catch (_) {}
  }

  isMigrating = true;
  setMigrationFeedback(lastMigrationSummary, '');
  const setProgress = (txt) => {
    migrationProgressText = txt;
    updateCloudStatusUI();
    if (typeof options.onProgress === 'function') options.onProgress(txt);
  };

  activeMigrationPromise = (async () => {
    try {
      setProgress('Membaca seluruh file JSON & PDF lokal dari server…');
      const includePdfs = !!(options.uploadPdfsToDrive || cachedAccessToken);
      const resp = await fetch(`/api/migration/json-bundle?includePdfs=${includePdfs ? '1' : '0'}`, {
        cache: 'no-store',
        credentials: 'include'
      });
      if (!resp.ok) {
        throw new Error(`Gagal mengambil paket migrasi JSON (HTTP ${resp.status})`);
      }
      const bundle = await resp.json();
      const uid = auth.currentUser.uid;
      const ops = [];

      // 1. Siapkan migrasi 137 Sekolah (data/schools.json)
      const schools = Array.isArray(bundle.schools) ? bundle.schools : [];
      for (const s of schools) {
        if (!s || !s.no) continue;
        const schoolId = String(Number(s.no));
        ops.push({
          ref: doc(db, 'schools', schoolId),
          data: buildSchoolFirestorePayload(s, uid),
          path: `schools/${schoolId}`
        });
      }

      // 2. Siapkan migrasi Users (data/users.json)
      const users = Array.isArray(bundle.users) ? bundle.users : [];
      for (const u of users) {
        if (!u || !u.username) continue;
        const docId = safeId(`user_${u.username.toLowerCase()}`);
        const role = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(u.role) ? u.role : 'Operator Sekolah';
        const status = ['Pending', 'Aktif', 'Ditolak'].includes(u.status) ? u.status : 'Aktif';
        const userData = {
          uid: docId,
          username: cleanStr(u.username, 80),
          name: cleanStr(u.name || u.username, 140),
          ...(u.email ? { email: cleanStr(u.email, 160) } : {}),
          ...(u.whatsapp ? { whatsapp: cleanStr(u.whatsapp, 30) } : {}),
          ...(u.passwordHash ? { passwordHash: cleanStr(u.passwordHash, 120) } : {}),
          role,
          schoolNo: Math.max(0, Math.min(10000, Number(u.schoolNo) || 0)),
          ...(u.npsn ? { npsn: cleanStr(u.npsn, 20) } : {}),
          status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        ops.push({
          ref: doc(db, 'users', docId),
          data: userData,
          path: `users/${docId}`
        });
      }

      // 3. Siapkan migrasi Monthly Realization Reports (data/monthly_2026.json, dll.)
      let monthlyCount = 0;
      const monthlyByYear = bundle.monthlyByYear || {};
      for (const [yearStr, schoolsMap] of Object.entries(monthlyByYear)) {
        const year = Number(yearStr);
        if (!Number.isFinite(year) || year < 2020 || year > 2100) continue;
        for (const [schoolNoRaw, monthsObj] of Object.entries(schoolsMap || {})) {
          const schoolNo = Number(schoolNoRaw);
          if (!Number.isFinite(schoolNo) || schoolNo < 1 || schoolNo > 10000) continue;
          for (const [monthKey, mData] of Object.entries(monthsObj || {})) {
            if (!VALID_MONTHS.includes(monthKey) || !mData || typeof mData !== 'object') continue;
            const reportId = `${year}_${schoolNo}_${monthKey}`;
            ops.push({
              ref: doc(db, 'monthly_reports', reportId),
              data: buildMonthlyReportFirestorePayload(year, schoolNo, monthKey, mData, uid),
              path: `monthly_reports/${reportId}`
            });
            monthlyCount++;
          }
        }
      }

      // 4. Siapkan migrasi RKAS Penganggaran + Unggah PDF lokal ke Google Drive bila token tersedia
      const anggaranList = Array.isArray(bundle.anggaranList) ? bundle.anggaranList : [];
      let driveUploadedCount = 0;
      for (let i = 0; i < anggaranList.length; i++) {
        const rec = { ...anggaranList[i] };
        const recordId = `${rec.year}_${rec.schoolNo}_${rec.tahap}_${rec.sumber}`;

        // Jika ada file PDF lokal (pdfBase64) dan token Google Drive aktif, unggah ke Google Drive
        if (rec.pdfBase64 && cachedAccessToken && (!rec.driveFileId || !String(rec.fileUrl || '').includes('drive.google.com'))) {
          try {
            setProgress(`Mengunggah PDF RKAS (${i + 1}/${anggaranList.length}) ${rec.fileName} ke Google Drive…`);
            const gdriveRes = await uploadPdfToGoogleDrive(rec.pdfBase64, {
              schoolNo: rec.schoolNo,
              schoolName: rec.schoolName || `Sekolah_${rec.schoolNo}`,
              npsn: rec.npsn || '',
              periodKey: `anggaran-${rec.tahap}`,
              year: rec.year,
              docType: `rkas_${rec.tahap}_${rec.sumber}`,
              fileName: rec.fileName || 'rkas.pdf',
              skipConfirmReplace: true
            });
            if (gdriveRes && gdriveRes.fileUrl) {
              rec.fileUrl = gdriveRes.fileUrl;
              rec.driveFileId = gdriveRes.driveFileId;
              driveUploadedCount++;
            }
          } catch (driveErr) {
            console.warn('Gagal unggah PDF migrasi ke Drive, lanjut simpan metadata ke Firestore:', driveErr);
          }
        }
        delete rec.pdfBase64;

        ops.push({
          ref: doc(db, 'anggaran_records', recordId),
          data: buildAnggaranFirestorePayload(rec, uid),
          path: `anggaran_records/${recordId}`
        });
      }

      // 5. Commit seluruh operasi ke Cloud Firestore menggunakan writeBatch (maks 300 dokumen per batch)
      const BATCH_SIZE = 300;
      for (let start = 0; start < ops.length; start += BATCH_SIZE) {
        const chunk = ops.slice(start, start + BATCH_SIZE);
        setProgress(`Menyimpan ke Cloud Firestore (${Math.min(start + chunk.length, ops.length)}/${ops.length} dokumen)…`);
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.set(item.ref, item.data);
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, chunk[0] ? chunk[0].path : 'batch_migration');
        }
      }

      await logAuditToFirestore(
        'migrate_json_to_firebase',
        {
          schools: schools.length,
          users: users.length,
          monthlyReports: monthlyCount,
          anggaranRecords: anggaranList.length,
          driveUploadedCount
        },
        { username: auth.currentUser.email || 'admin', role: 'Admin Dinas' }
      );

      const summary = {
        status: 'success',
        schools: schools.length,
        users: users.length,
        monthlyReports: monthlyCount,
        anggaranRecords: anggaranList.length,
        driveUploadedCount
      };
      setMigrationFeedback(summary, '');

      if (!options.silentIfAlreadyMigrated && typeof window.rkToast === 'function') {
        window.rkToast(
          `Migrasi Selesai! ${schools.length} sekolah, ${users.length} akun, ${monthlyCount} realisasi bulanan, dan ${anggaranList.length} RKAS tersimpan di Firebase Firestore${driveUploadedCount ? ` & ${driveUploadedCount} PDF di Google Drive` : ''}.`,
          'ok'
        );
      }
      return summary;
    } catch (err) {
      setMigrationFeedback(null, (err && err.message) || String(err));
      throw err;
    } finally {
      isMigrating = false;
      migrationProgressText = '';
      activeMigrationPromise = null;
      updateCloudStatusUI();
    }
  })();

  return activeMigrationPromise;
}

// ============================================================================
// 8. DIRECT FIRESTORE CRUD FOR ALL ENTITIES (BACA & INPUTAN LANGSUNG KE FIREBASE)
// ============================================================================

/**
 * Memuat seluruh data Sekolah dari Firestore (/schools)
 */
export async function loadSchoolsFromFirestore() {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const path = 'schools';
  try {
    const q = query(collection(db, 'schools'), where('no', '>=', 1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const list = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d && d.no != null) list.push(d);
    });
    list.sort((a, b) => Number(a.no) - Number(b.no));
    return list;
  } catch (err) {
    try { handleFirestoreError(err, OperationType.LIST, path); } catch (_) {}
    return null;
  }
}

/**
 * Menyimpan 1 Sekolah (atau profil Kepala Sekolah & Bendahara) langsung ke Firestore (/schools/{no})
 */
export async function syncSchoolToFirestore(s) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !s || !s.no) return null;
  const no = Number(s.no);
  if (!Number.isFinite(no) || no < 1 || no > 10000) return null;

  const schoolId = String(no);
  const path = `schools/${schoolId}`;
  const docData = buildSchoolFirestorePayload(s, auth.currentUser.uid);

  try {
    await setDoc(doc(db, 'schools', schoolId), docData);
    return docData;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

/**
 * Menghapus 1 Sekolah langsung dari Firestore (/schools/{no})
 */
export async function deleteSchoolFromFirestore(no) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !no) return false;
  const schoolId = String(Number(no));
  const path = `schools/${schoolId}`;
  try {
    await deleteDoc(doc(db, 'schools', schoolId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

/**
 * Memuat daftar User dari Firestore (/users)
 */
export async function loadUsersFromFirestore() {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const isBootAdmin =
    auth.currentUser.email &&
    auth.currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const path = 'users';
  try {
    const q = isBootAdmin
      ? query(collection(db, 'users'))
      : query(collection(db, 'users'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const byUsername = new Map();
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (!d || !d.username) return;
      const key = String(d.username).toLowerCase();
      // Prioritaskan dokumen user_* atau yang memiliki role lengkap
      if (!byUsername.has(key) || docSnap.id.startsWith('user_')) {
        byUsername.set(key, {
          uid: d.uid,
          name: d.name || d.username,
          username: d.username,
          email: d.email || '',
          whatsapp: d.whatsapp || '',
          role: d.role || 'Operator Sekolah',
          schoolNo: d.schoolNo || null,
          npsn: d.npsn || '',
          status: d.status || 'Aktif'
        });
      }
    });
    return Array.from(byUsername.values());
  } catch (err) {
    try { handleFirestoreError(err, OperationType.LIST, path); } catch (_) {}
    return null;
  }
}

/**
 * Menyimpan/Memperbarui 1 User langsung ke Firestore (/users/user_{username})
 */
export async function saveUserToFirestore(u) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !u || !u.username) return null;
  const docId = safeId(`user_${String(u.username).toLowerCase()}`);
  const path = `users/${docId}`;
  const role = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(u.role) ? u.role : 'Operator Sekolah';
  const status = ['Pending', 'Aktif', 'Ditolak'].includes(u.status) ? u.status : 'Pending';
  const payload = {
    uid: cleanStr(u.uid || docId, 128, docId),
    username: cleanStr(u.username, 80),
    name: cleanStr(u.name || u.username, 140),
    ...(u.email ? { email: cleanStr(u.email, 160) } : {}),
    ...(u.whatsapp ? { whatsapp: cleanStr(u.whatsapp, 30) } : {}),
    ...(u.passwordHash ? { passwordHash: cleanStr(u.passwordHash, 120) } : {}),
    role,
    schoolNo: Math.max(0, Math.min(10000, Number(u.schoolNo) || 0)),
    ...(u.npsn ? { npsn: cleanStr(u.npsn, 20) } : {}),
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  try {
    await setDoc(doc(db, 'users', docId), payload);
    return payload;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

/**
 * Menghapus 1 User langsung dari Firestore (/users/user_{username})
 */
export async function deleteUserFromFirestore(username) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !username) return false;
  const docId = safeId(`user_${String(username).toLowerCase()}`);
  const path = `users/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', docId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

/**
 * Memuat data realisasi bulanan dari Firestore (/monthly_reports)
 */
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

/**
 * Memuat seluruh state aplikasi (schools, users, monthlyData, sp2bKab) langsung dari Firestore
 */
export async function loadAllDataFromFirestore(year) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const [schools, users, monthlyData, sp2bKab] = await Promise.all([
    loadSchoolsFromFirestore(),
    loadUsersFromFirestore(),
    loadMonthlyFromFirestore(year),
    loadSp2bKabFromFirestore(year)
  ]);
  return { schools, users, monthlyData, sp2bKab };
}

/**
 * Menyinkronkan perubahan data sekolah, bulanan, dan user langsung ke Cloud Firestore
 */
export async function syncSavePayloadToFirestore(payload, appUser) {
  if (isSigningOut) return { synced: false, reason: 'signing_out' };
  await initFirebase();
  if (isSigningOut || !db || !auth || !auth.currentUser) return { synced: false, reason: 'not_signed_in_firebase' };

  const uid = auth.currentUser.uid;
  const year = Math.max(2020, Math.min(2100, Number(payload.year) || 2026));
  const ops = [];

  if (payload.monthlyData && typeof payload.monthlyData === 'object') {
    for (const [schoolNoRaw, monthsObj] of Object.entries(payload.monthlyData)) {
      const schoolNo = Number(schoolNoRaw);
      if (!Number.isFinite(schoolNo) || schoolNo < 1 || schoolNo > 10000) continue;
      if (!monthsObj || typeof monthsObj !== 'object') continue;

      for (const [monthKey, mData] of Object.entries(monthsObj)) {
        if (!VALID_MONTHS.includes(monthKey) || !mData || typeof mData !== 'object') continue;

        const hasActivity =
          payload.partial ||
          mData.reconDone ||
          (mData.verifStatus && mData.verifStatus !== 'Draft') ||
          (mData.pendapatan && Object.values(mData.pendapatan).some((v) => Number(v) > 0)) ||
          (mData.belanja && Object.values(mData.belanja).some((v) => Number(v) > 0)) ||
          (mData.rekon && Object.values(mData.rekon).some((v) => Number(v) > 0)) ||
          (mData.documents && Object.values(mData.documents).some((d) => d && d.url));

        if (!hasActivity) continue;

        const reportId = `${year}_${schoolNo}_${monthKey}`;
        ops.push({
          ref: doc(db, 'monthly_reports', reportId),
          data: buildMonthlyReportFirestorePayload(year, schoolNo, monthKey, mData, uid),
          path: `monthly_reports/${reportId}`
        });
      }
    }
  }

  if (Array.isArray(payload.schools) && appUser && (appUser.role === 'Admin Dinas' || appUser.role === 'BUD')) {
    for (const s of payload.schools) {
      if (!s || !s.no) continue;
      const schoolId = String(Number(s.no));
      ops.push({
        ref: doc(db, 'schools', schoolId),
        data: buildSchoolFirestorePayload(s, uid),
        path: `schools/${schoolId}`
      });
    }
  }

  if (Array.isArray(payload.users) && appUser && appUser.role === 'Admin Dinas') {
    for (const u of payload.users) {
      if (!u || !u.username) continue;
      const docId = safeId(`user_${String(u.username).toLowerCase()}`);
      const role = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(u.role) ? u.role : 'Operator Sekolah';
      const status = ['Pending', 'Aktif', 'Ditolak'].includes(u.status) ? u.status : 'Pending';
      ops.push({
        ref: doc(db, 'users', docId),
        data: {
          uid: cleanStr(u.uid || docId, 128, docId),
          username: cleanStr(u.username, 80),
          name: cleanStr(u.name || u.username, 140),
          ...(u.email ? { email: cleanStr(u.email, 160) } : {}),
          ...(u.whatsapp ? { whatsapp: cleanStr(u.whatsapp, 30) } : {}),
          role,
          schoolNo: Math.max(0, Math.min(10000, Number(u.schoolNo) || 0)),
          ...(u.npsn ? { npsn: cleanStr(u.npsn, 20) } : {}),
          status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        path: `users/${docId}`
      });
    }
  }

  const BATCH_SIZE = 350;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(item.ref, item.data);
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, chunk[0] ? chunk[0].path : 'monthly_reports');
    }
  }

  return { synced: true, count: ops.length };
}

export async function seedSchoolsToFirestoreIfNeeded() {
  return autoMigrateJsonDatabaseIfNeeded();
}

/**
 * Memuat daftar ringkas Anggaran RKAS dari Firestore (/anggaran_records)
 */
export async function loadAnggaranFromFirestore(year, filterSchoolNo = null) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const isBootAdmin =
    auth.currentUser.email &&
    auth.currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const path = 'anggaran_records';
  try {
    const q = isBootAdmin
      ? query(collection(db, 'anggaran_records'), where('year', '==', Number(year)))
      : query(collection(db, 'anggaran_records'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return {};
    const out = {};
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (Number(d.year) !== Number(year)) return;
      if (filterSchoolNo != null && Number(d.schoolNo) !== Number(filterSchoolNo)) return;
      const hydrated = hydrateAnggaranFromFirestoreDoc(d);
      const no = String(d.schoolNo);
      if (!out[no]) out[no] = {};
      if (!out[no][d.tahap]) out[no][d.tahap] = {};
      const { items, itemsMap, warningsMap, blockingMap, ...stripped } = hydrated;
      out[no][d.tahap][d.sumber] = stripped;
    });
    return out;
  } catch (err) {
    try { handleFirestoreError(err, OperationType.LIST, path); } catch (_) {}
    return null;
  }
}

/**
 * Memuat detail 1 dokumen Anggaran RKAS (beserta seluruh baris items) langsung dari Firestore
 */
export async function loadAnggaranDetailFromFirestore(year, schoolNo, tahap, sumber) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const recordId = `${Number(year)}_${Number(schoolNo)}_${tahap}_${sumber}`;
  const path = `anggaran_records/${recordId}`;
  try {
    const snap = await getDoc(doc(db, 'anggaran_records', recordId));
    if (!snap.exists()) return null;
    return hydrateAnggaranFromFirestoreDoc(snap.data());
  } catch (err) {
    try { handleFirestoreError(err, OperationType.GET, path); } catch (_) {}
    return null;
  }
}

/**
 * Menyimpan dokumen Anggaran RKAS (termasuk itemsMap, warningsMap, blockingMap) ke Firestore
 */
export async function syncAnggaranRecordToFirestore(rec) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !rec) return null;

  const year = Math.max(2020, Math.min(2100, Number(rec.year) || 2026));
  const schoolNo = Math.max(1, Math.min(10000, Number(rec.schoolNo) || 1));
  const tahap = VALID_TAHAP.includes(rec.tahap) ? rec.tahap : 'induk';
  const sumber = VALID_SUMBER.includes(rec.sumber) ? rec.sumber : 'reguler';
  const recordId = `${year}_${schoolNo}_${tahap}_${sumber}`;
  const path = `anggaran_records/${recordId}`;
  const docData = buildAnggaranFirestorePayload(rec, auth.currentUser.uid);

  try {
    await setDoc(doc(db, 'anggaran_records', recordId), docData);
    return hydrateAnggaranFromFirestoreDoc(docData);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

/**
 * Memproses aksi Anggaran (reclass, submit, verify, reject, reopen, delete) langsung di Firestore
 */
export async function applyAnggaranActionInFirestore({ year, schoolNo, tahap, sumber, action, overrides, catatan, username }) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const recordId = `${Number(year)}_${Number(schoolNo)}_${tahap}_${sumber}`;
  const path = `anggaran_records/${recordId}`;

  if (action === 'delete') {
    try {
      await deleteDoc(doc(db, 'anggaran_records', recordId));
      return { deleted: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
      return null;
    }
  }

  const current = await loadAnggaranDetailFromFirestore(year, schoolNo, tahap, sumber);
  if (!current) return null;

  const updated = { ...current };
  if (action === 'reclass' && Array.isArray(overrides)) {
    const items = Array.isArray(updated.items) ? updated.items.map((x) => ({ ...x })) : [];
    for (const o of overrides) {
      const idx = Number(o.index);
      if (Number.isInteger(idx) && items[idx] && ['pegawai', 'barjas', 'atl', 'pm', 'lainnya'].includes(o.kategori)) {
        items[idx].kategori = o.kategori;
        items[idx].auto = false;
      }
    }
    const totals = { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 };
    for (const it of items) {
      const k = Object.prototype.hasOwnProperty.call(totals, it.kategori) ? it.kategori : 'lainnya';
      const val = Number(it.jumlah) || 0;
      totals[k] += val;
      totals.total += val;
    }
    updated.items = items;
    updated.totals = totals;
  } else if (action === 'submit') {
    updated.status = 'Diajukan';
    updated.submittedAt = new Date().toISOString();
    updated.catatan = '';
  } else if (action === 'verify') {
    updated.status = 'Terverifikasi';
    updated.verifiedAt = new Date().toISOString();
    updated.verifiedBy = cleanStr(username || auth.currentUser.email || 'admin', 160);
    updated.catatan = cleanStr(catatan || '', 500);
  } else if (action === 'reject') {
    updated.status = 'Ditolak';
    updated.verifiedAt = new Date().toISOString();
    updated.verifiedBy = cleanStr(username || auth.currentUser.email || 'admin', 160);
    updated.catatan = cleanStr(catatan || '', 500);
  } else if (action === 'reopen') {
    updated.status = 'Draft';
    updated.verifiedAt = '';
    updated.verifiedBy = '';
    updated.catatan = cleanStr(catatan || 'Dibuka kembali oleh Admin Dinas', 500);
  }

  const saved = await syncAnggaranRecordToFirestore(updated);
  return { record: saved || updated };
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

export async function loadSp2bKabFromFirestore(year) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const isBootAdmin =
    auth.currentUser.email &&
    auth.currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  if (!isBootAdmin) return null;
  const yearId = String(Math.max(2020, Math.min(2100, Number(year) || 2026)));
  const path = `sp2b_kab/${yearId}`;
  try {
    const snap = await getDoc(doc(db, 'sp2b_kab', yearId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { records: d.records || {}, last: d.last || {} };
  } catch (err) {
    try { handleFirestoreError(err, OperationType.GET, path); } catch (_) {}
    return null;
  }
}

export async function syncSp2bKabToFirestore(year, records, last) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return;
  const y = Math.max(2020, Math.min(2100, Number(year) || 2026));
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

export async function loadAuditLogsFromFirestore(limitCount = 150, actionFilter = '') {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const isBootAdmin =
    auth.currentUser.email &&
    auth.currentUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const path = 'audit_logs';
  try {
    const q = isBootAdmin
      ? query(collection(db, 'audit_logs'))
      : query(collection(db, 'audit_logs'), where('userUid', '==', uid));
    const snap = await getDocs(q);
    const items = [];
    const af = String(actionFilter || '').trim().toLowerCase();
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (af && String(d.action || '').toLowerCase().indexOf(af) === -1) return;
      const ts = d.createdAt && typeof d.createdAt.toDate === 'function'
        ? d.createdAt.toDate().toISOString()
        : new Date().toISOString();
      items.push({
        id: docSnap.id,
        time: ts,
        action: d.action || '',
        username: d.username || '',
        role: d.role || '',
        ip: 'Firebase Cloud',
        detail: d.detail || ''
      });
    });
    items.sort((a, b) => String(b.time).localeCompare(String(a.time)));
    return { items: items.slice(0, limitCount), total: items.length };
  } catch (err) {
    try { handleFirestoreError(err, OperationType.LIST, path); } catch (_) {}
    return null;
  }
}

// ============================================================================
// 9. UI COMPONENTS (.gsi-material-button & CLOUD STATUS + MIGRATION BAR)
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
    <div id="sigapAuthCloudStatus" class="mt-2"></div>
  `;

  const loginBtn = formLogin.querySelector('button[onclick*="handleLogin"]');
  if (loginBtn && loginBtn.parentNode) {
    loginBtn.parentNode.insertBefore(wrapper, loginBtn.nextSibling);
  } else {
    formLogin.appendChild(wrapper);
  }

  const btn = document.getElementById('btnGoogleSignInModal');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.disabled = true;
      const lbl = btn.querySelector('.gsi-material-button-contents');
      const origLbl = lbl ? lbl.textContent : '';
      if (lbl) lbl.textContent = 'Menghubungkan & Memigrasikan ke Firebase…';
      signInWithGoogle({ loginToApp: true, forceMigrate: false, promptSelectAccount: true })
        .catch((err) => {
          const msg = (err && err.message) || String(err);
          setMigrationFeedback(lastMigrationSummary, msg);
          updateCloudStatusUI();
          alert('Login Google gagal: ' + msg);
        })
        .finally(() => {
          btn.disabled = false;
          if (lbl) lbl.textContent = origLbl;
        });
    });
  }
}

function injectLandingCloudBanner() {
  const landing = document.getElementById('landingPage');
  if (!landing || document.getElementById('sigapLandingCloudBar')) return;
  const cta = landing.querySelector('.lp-cta');
  if (!cta || !cta.parentNode) return;

  const box = document.createElement('div');
  box.id = 'sigapLandingCloudBar';
  box.className = 'mt-5 rounded-xl border border-white/20 bg-slate-900/55 backdrop-blur-md p-3.5 text-white max-w-xl';
  cta.parentNode.insertBefore(box, cta.nextSibling);
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

function bindMigrationHandlers(suffix) {
  const btnConnect = document.getElementById('btnConnectDrive' + suffix);
  if (btnConnect) {
    btnConnect.addEventListener('click', () => {
      btnConnect.disabled = true;
      signInWithGoogle({ loginToApp: false, forceMigrate: true, promptSelectAccount: false })
        .then(async () => {
          if (typeof window.loadFromGoogleSheets === 'function') {
            await window.loadFromGoogleSheets();
            if (typeof window.updateActiveMonthData === 'function') window.updateActiveMonthData();
            if (typeof window.renderBerandaArkas === 'function') window.renderBerandaArkas();
          }
        })
        .catch((err) => {
          const msg = (err && err.message) || String(err);
          setMigrationFeedback(lastMigrationSummary, msg);
          updateCloudStatusUI();
          alert('Gagal menghubungkan Google Drive: ' + msg);
        })
        .finally(() => {
          btnConnect.disabled = false;
        });
    });
  }

  const btnSwitch = document.getElementById('btnSwitchGoogle' + suffix);
  if (btnSwitch) {
    btnSwitch.addEventListener('click', () => {
      btnSwitch.disabled = true;
      signInWithGoogle({ loginToApp: false, forceMigrate: true, promptSelectAccount: true })
        .then(async () => {
          if (typeof window.loadFromGoogleSheets === 'function') {
            await window.loadFromGoogleSheets();
            if (typeof window.updateActiveMonthData === 'function') window.updateActiveMonthData();
            if (typeof window.renderBerandaArkas === 'function') window.renderBerandaArkas();
          }
        })
        .catch((err) => {
          const msg = (err && err.message) || String(err);
          setMigrationFeedback(lastMigrationSummary, msg);
          updateCloudStatusUI();
          alert('Gagal mengganti akun Google: ' + msg);
        })
        .finally(() => {
          btnSwitch.disabled = false;
        });
    });
  }

  const btnMigrate = document.getElementById('btnMigrateJson' + suffix);
  if (btnMigrate) {
    btnMigrate.addEventListener('click', async () => {
      btnMigrate.disabled = true;
      try {
        if (!cachedAccessToken) {
          try {
            await ensureGoogleDriveToken();
          } catch (_) {}
        }
        await migrateJsonDatabaseToFirebase({ uploadPdfsToDrive: !!cachedAccessToken, silentIfAlreadyMigrated: false });
        if (typeof window.loadFromGoogleSheets === 'function') {
          await window.loadFromGoogleSheets();
          if (typeof window.updateActiveMonthData === 'function') window.updateActiveMonthData();
          if (typeof window.renderBerandaArkas === 'function') window.renderBerandaArkas();
        }
      } catch (err) {
        const msg = (err && err.message) || String(err);
        setMigrationFeedback(lastMigrationSummary, msg);
        updateCloudStatusUI();
        alert('Gagal menjalankan migrasi: ' + msg);
      } finally {
        btnMigrate.disabled = false;
      }
    });
  }
}

export function updateCloudStatusUI() {
  const fbUser = auth ? auth.currentUser : null;
  const userEmail = String((fbUser && fbUser.email) || '');
  const isBootAdmin = userEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const driveReady = !!(fbUser && cachedAccessToken);

  const errHtml = lastMigrationError
    ? `<div class="w-full mt-1 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium"><i class="fa-solid fa-circle-exclamation mr-1"></i><b>Info / Kendala Migrasi:</b> ${lastMigrationError}</div>`
    : '';
  const summaryHtml = (!lastMigrationError && lastMigrationSummary && lastMigrationSummary.schools)
    ? `<span class="text-[11px] text-emerald-700 font-semibold">✓ ${lastMigrationSummary.schools} sekolah · ${lastMigrationSummary.monthlyReports} realisasi · ${lastMigrationSummary.anggaranRecords} RKAS tersimpan di Firestore</span>`
    : '';

  const bar = document.getElementById('sigapCloudStatusBar');
  if (bar) {
    if (isMigrating) {
      bar.innerHTML = `
        <div class="flex items-center gap-2.5 text-xs">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
            <i class="fa-solid fa-spinner fa-spin text-indigo-600"></i> Migrasi Database JSON ke Firebase &amp; Google Drive…
          </span>
          <span class="text-slate-700 font-medium">${migrationProgressText || 'Sedang memindahkan data…'}</span>
        </div>
      `;
    } else if (driveReady) {
      bar.innerHTML = `
        <div class="flex items-center gap-2.5 text-xs flex-wrap">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
            <i class="fa-solid fa-cloud-check text-emerald-600"></i> Firebase Firestore &amp; Google Drive Aktif
          </span>
          <span class="text-slate-600">Terhubung sebagai <b>${userEmail || fbUser.displayName}</b> — Baca &amp; inputan langsung ke Firebase &amp; Google Drive.</span>
          ${summaryHtml}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" id="btnMigrateJsonTop" class="px-2.5 py-1.5 rounded-lg bg-[#0F2C59] hover:bg-slate-800 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-cloud-arrow-up"></i> Migrasikan Database JSON &amp; PDF
          </button>
          ${!isBootAdmin ? `<button type="button" id="btnSwitchGoogleTop" class="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"><i class="fa-solid fa-repeat"></i> Ganti Akun Google</button>` : ''}
          <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener" class="text-xs font-semibold text-blue-700 hover:underline px-2 py-1">
            <i class="fa-brands fa-google-drive mr-1"></i>Buka Google Drive
          </a>
        </div>
        ${errHtml}
      `;
    } else if (fbUser && !cachedAccessToken) {
      bar.innerHTML = `
        <div class="flex items-center gap-2.5 text-xs flex-wrap">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold">
            <i class="fa-solid fa-database text-amber-600"></i> Firebase Firestore Aktif (${userEmail}) · Aktifkan Token Google Drive
          </span>
          <span class="text-slate-600">Database langsung ke Firestore. Klik tombol di samping untuk mengaktifkan unggah PDF ke Google Drive.</span>
          ${summaryHtml}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" id="btnMigrateJsonTop" class="px-2.5 py-1.5 rounded-lg bg-[#0F2C59] hover:bg-slate-800 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-cloud-arrow-up"></i> Migrasikan JSON ke Firestore
          </button>
          ${!isBootAdmin ? `<button type="button" id="btnSwitchGoogleTop" class="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"><i class="fa-solid fa-repeat"></i> Ganti Akun Google</button>` : ''}
          <div style="width:245px">
            <button type="button" id="btnConnectDriveTop" class="gsi-material-button" style="height:34px;font-size:12px">
              ${getGoogleButtonSvg()}
            </button>
          </div>
        </div>
        ${errHtml}
      `;
    } else {
      bar.innerHTML = `
        <div class="flex items-center gap-2.5 text-xs">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-bold">
            <i class="fa-brands fa-google-drive text-blue-600"></i> Integrasi Cloud Firebase &amp; Google Drive
          </span>
          <span class="text-slate-600">Hubungkan akun Google Admin (<b>${BOOTSTRAPPED_ADMIN_EMAIL}</b>) untuk memigrasikan seluruh file JSON &amp; PDF dan mengaktifkan baca/input langsung ke <b>Firebase Firestore</b> &amp; <b>Google Drive</b>.</span>
        </div>
        <div style="width:260px">
          <button type="button" id="btnConnectDriveTop" class="gsi-material-button" style="height:36px;font-size:12px">
            ${getGoogleButtonSvg()}
          </button>
        </div>
        ${errHtml}
      `;
    }
    bindMigrationHandlers('Top');
  }

  const landingBar = document.getElementById('sigapLandingCloudBar');
  if (landingBar) {
    if (isMigrating) {
      landingBar.innerHTML = `
        <div class="flex items-center gap-2.5 text-xs">
          <i class="fa-solid fa-spinner fa-spin text-amber-300"></i>
          <span><b>Migrasi ke Firebase &amp; Google Drive:</b> ${migrationProgressText || 'Memproses…'}</span>
        </div>
      `;
    } else if (fbUser && isBootAdmin && lastMigrationSummary && lastMigrationSummary.schools && !lastMigrationError) {
      landingBar.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <div class="font-bold text-emerald-300"><i class="fa-solid fa-circle-check mr-1"></i>Firebase Firestore &amp; Google Drive Tersinkron</div>
            <div class="text-white/80 text-[11px] mt-0.5">${lastMigrationSummary.schools} sekolah · ${lastMigrationSummary.monthlyReports} realisasi · ${lastMigrationSummary.anggaranRecords} RKAS siap digunakan (${userEmail}).</div>
          </div>
          <button type="button" id="btnMigrateJsonLanding" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-[11px] cursor-pointer">
            <i class="fa-solid fa-rotate mr-1"></i> Sinkron Ulang
          </button>
        </div>
      `;
    } else if (fbUser) {
      landingBar.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex-1 min-w-[220px]">
            <div class="font-bold text-amber-300"><i class="fa-solid fa-database mr-1"></i>Terhubung Google: ${userEmail}</div>
            <div class="text-white/80 text-[11px] mt-0.5">${isBootAdmin ? 'Klik tombol untuk memigrasikan seluruh file JSON & PDF ke Firebase Firestore & Google Drive.' : `Migrasi master JSON memerlukan akun Admin Firebase (${BOOTSTRAPPED_ADMIN_EMAIL}).`}</div>
          </div>
          <div class="flex items-center gap-2">
            ${isBootAdmin
              ? `<button type="button" id="btnMigrateJsonLanding" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-[11px] cursor-pointer"><i class="fa-solid fa-cloud-arrow-up mr-1"></i>Migrasikan Sekarang</button>`
              : `<button type="button" id="btnSwitchGoogleLanding" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-[11px] cursor-pointer"><i class="fa-solid fa-repeat mr-1"></i>Login ${BOOTSTRAPPED_ADMIN_EMAIL}</button>`
            }
          </div>
        </div>
        ${lastMigrationError ? `<div class="mt-2 px-2.5 py-1.5 rounded bg-rose-950/70 border border-rose-400/50 text-rose-100 text-[11px]">${lastMigrationError}</div>` : ''}
      `;
    } else {
      landingBar.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex-1 min-w-[220px]">
            <div class="text-xs font-bold text-amber-300"><i class="fa-solid fa-database mr-1"></i>Sinkronisasi Firebase Firestore &amp; Google Drive</div>
            <div class="text-[11px] text-white/80 mt-0.5">Hubungkan Google (${BOOTSTRAPPED_ADMIN_EMAIL}) untuk mengunggah seluruh database JSON &amp; PDF langsung ke Firebase Firestore &amp; Google Drive.</div>
          </div>
          <div style="width:240px">
            <button type="button" id="btnConnectDriveLanding" class="gsi-material-button" style="height:36px;font-size:12px">
              ${getGoogleButtonSvg()}
            </button>
          </div>
        </div>
        ${lastMigrationError ? `<div class="mt-2 px-2.5 py-1.5 rounded bg-rose-950/70 border border-rose-400/50 text-rose-100 text-[11px]">${lastMigrationError}</div>` : ''}
      `;
    }
    bindMigrationHandlers('Landing');
  }

  const authStatus = document.getElementById('sigapAuthCloudStatus');
  if (authStatus) {
    if (isMigrating) {
      authStatus.innerHTML = `<div class="px-2.5 py-1.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i>${migrationProgressText || 'Memigrasikan database ke Firebase…'}</div>`;
    } else if (lastMigrationError) {
      authStatus.innerHTML = `<div class="px-2.5 py-1.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px]"><i class="fa-solid fa-circle-exclamation mr-1"></i>${lastMigrationError}</div>`;
    } else {
      authStatus.innerHTML = '';
    }
  }
}

// ============================================================================
// 10. EXPORT GLOBAL BRIDGE FOR EXISTING SCRIPTS (app.js, penganggaran.js, pejabat.js)
// ============================================================================
window.SigapFirebaseDrive = {
  initFirebase,
  isFirebaseAuthenticated,
  signInWithGoogle,
  signOutFirebase,
  ensureGoogleDriveToken,
  getFirebaseIdToken,
  getGoogleAccessTokenInMemory,
  uploadPdfToGoogleDrive,
  deleteFileFromGoogleDrive,
  migrateJsonDatabaseToFirebase,
  autoMigrateJsonDatabaseIfNeeded,
  loadAllDataFromFirestore,
  loadSchoolsFromFirestore,
  syncSchoolToFirestore,
  deleteSchoolFromFirestore,
  loadUsersFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  loadMonthlyFromFirestore,
  syncSavePayloadToFirestore,
  seedSchoolsToFirestoreIfNeeded,
  loadAnggaranFromFirestore,
  loadAnggaranDetailFromFirestore,
  syncAnggaranRecordToFirestore,
  applyAnggaranActionInFirestore,
  deleteAnggaranRecordFromFirestore,
  loadSp2bKabFromFirestore,
  syncSp2bKabToFirestore,
  logAuditToFirestore,
  loadAuditLogsFromFirestore,
  updateCloudStatusUI
};

initFirebase().catch((e) => console.error('Firebase init error:', e));
