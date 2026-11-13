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
  signInWithCredential,
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
  arrayUnion,
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
const FIRESTORE_DATABASE_ID = 'ai-studio-sigapbosp-295b56ae-42fb-402e-a2e5-e08e50d341ab';
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
let cachedAdminFlag = null;
let cachedAdminUid = null;
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
  // Bersihkan error pop-up lama agar tidak pernah nyangkut saat halaman dimuat ulang
  sessionStorage.removeItem('sigap_last_migration_error');
  const savedSum = sessionStorage.getItem('sigap_last_migration_summary');
  if (savedSum) lastMigrationSummary = JSON.parse(savedSum);
} catch (_) {}

function setMigrationFeedback(summary, errorMsg) {
  lastMigrationSummary = summary || null;
  lastMigrationError = errorMsg || '';
  try {
    sessionStorage.removeItem('sigap_last_migration_error');
    if (lastMigrationSummary) sessionStorage.setItem('sigap_last_migration_summary', JSON.stringify(lastMigrationSummary));
    else sessionStorage.removeItem('sigap_last_migration_summary');
  } catch (_) {}
}

function ensureGisClientScript() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (!existing) {
      existing = document.createElement('script');
      existing.src = 'https://accounts.google.com/gsi/client';
      existing.async = true;
      existing.defer = true;
      document.head.appendChild(existing);
    }
    let checks = 0;
    const timer = setInterval(() => {
      checks++;
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        clearInterval(timer);
        resolve(true);
      } else if (checks > 50) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

// ============================================================================
// 2. NON-BLOCKING UI HELPERS (TOAST, CONFIRM MODAL, PROMPT MODAL)
// ============================================================================
export function showDriveToast(msg, type = 'info') {
  const text = String(msg == null ? '' : msg);
  if (typeof window.rkToast === 'function') {
    window.rkToast(text, type);
    return;
  }
  const el = document.createElement('div');
  const bg = type === 'ok' ? '#059669' : type === 'err' ? '#e11d48' : '#0F2C59';
  el.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999;max-width:400px;padding:12px 16px;border-radius:12px;color:#fff;background:${bg};font-size:12px;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,.22);line-height:1.45`;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => { try { el.remove(); } catch (_) {} }, 5000);
}

export function showDriveConfirmModal(opts = {}) {
  const options = typeof opts === 'string' ? { message: opts } : (opts || {});
  const title = options.title || 'Konfirmasi';
  const message = options.message || 'Lanjutkan tindakan ini?';
  const confirmText = options.confirmText || 'Ya, Lanjutkan';
  const cancelText = options.cancelText || 'Batal';
  const danger = !!options.danger;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-4';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div class="px-5 py-3.5 text-white font-bold text-sm flex items-center justify-between" style="background:${danger ? '#be123c' : '#0F2C59'}">
          <span><i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'} mr-2"></i><span data-cm-title></span></span>
          <button type="button" data-cm-cancel class="text-white/80 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div class="p-5 text-xs text-slate-700 leading-relaxed whitespace-pre-line" data-cm-msg></div>
        <div class="bg-slate-100 px-5 py-3 flex justify-end gap-2 border-t border-slate-200">
          <button type="button" data-cm-cancel class="px-4 py-2 rounded-lg bg-slate-300 hover:bg-slate-400 text-slate-800 text-xs font-semibold"></button>
          <button type="button" data-cm-ok class="px-4 py-2 rounded-lg text-white text-xs font-semibold" style="background:${danger ? '#e11d48' : '#0F2C59'}"></button>
        </div>
      </div>
    `;
    overlay.querySelector('[data-cm-title]').textContent = title;
    overlay.querySelector('[data-cm-msg]').textContent = message;
    const cancelBtns = overlay.querySelectorAll('[data-cm-cancel]');
    cancelBtns[1].textContent = cancelText;
    const okBtn = overlay.querySelector('[data-cm-ok]');
    okBtn.textContent = confirmText;

    const cleanup = (val) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    cancelBtns.forEach((b) => b.addEventListener('click', () => cleanup(false)));
    okBtn.addEventListener('click', () => cleanup(true));
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

export function showDrivePromptModal(opts = {}) {
  const options = typeof opts === 'string' ? { message: opts } : (opts || {});
  const title = options.title || 'Input Data';
  const message = options.message || 'Masukkan nilai:';
  const placeholder = options.placeholder || '';
  const defaultValue = options.defaultValue != null ? String(options.defaultValue) : '';
  const required = !!options.required;
  const confirmText = options.confirmText || 'Simpan';

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-4';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div class="px-5 py-3.5 text-white font-bold text-sm flex items-center justify-between" style="background:#0F2C59">
          <span><i class="fa-solid fa-pen-to-square mr-2"></i><span data-pm-title></span></span>
          <button type="button" data-pm-cancel class="text-white/80 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div class="p-5 space-y-3 text-xs text-slate-700">
          <div class="whitespace-pre-line leading-relaxed" data-pm-msg></div>
          <input type="text" data-pm-input class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0F2C59]" />
          <div data-pm-err class="hidden text-rose-600 text-[11px] font-semibold"></div>
        </div>
        <div class="bg-slate-100 px-5 py-3 flex justify-end gap-2 border-t border-slate-200">
          <button type="button" data-pm-cancel class="px-4 py-2 rounded-lg bg-slate-300 hover:bg-slate-400 text-slate-800 text-xs font-semibold">Batal</button>
          <button type="button" data-pm-ok class="px-4 py-2 rounded-lg bg-[#0F2C59] hover:bg-blue-900 text-white text-xs font-semibold"></button>
        </div>
      </div>
    `;
    overlay.querySelector('[data-pm-title]').textContent = title;
    overlay.querySelector('[data-pm-msg]').textContent = message;
    const inp = overlay.querySelector('[data-pm-input]');
    inp.placeholder = placeholder;
    inp.value = defaultValue;
    const errEl = overlay.querySelector('[data-pm-err]');
    const okBtn = overlay.querySelector('[data-pm-ok]');
    okBtn.textContent = confirmText;

    const cleanup = (val) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(val);
    };
    const submit = () => {
      const val = inp.value;
      if (required && !String(val).trim()) {
        errEl.textContent = 'Kolom ini wajib diisi.';
        errEl.classList.remove('hidden');
        inp.focus();
        return;
      }
      cleanup(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(null);
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });
    overlay.querySelectorAll('[data-pm-cancel]').forEach((b) => b.addEventListener('click', () => cleanup(null)));
    okBtn.addEventListener('click', submit);
    document.body.appendChild(overlay);
    inp.focus();
    inp.select();
  });
}

// ============================================================================
// 3. STRUCTURED FIRESTORE ERROR HANDLER
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
// 4. INITIALIZATION & CONNECTION TEST
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
    ensureGisClientScript().catch(() => {});
    app = initializeApp(cfg);
    db = getFirestore(app, cfg.firestoreDatabaseId || FIRESTORE_DATABASE_ID);
    auth = getAuth(app);

    // Test connection to Firestore non-blocking so auth readiness stays immediate for popups
    getDocFromServer(doc(db, 'test', 'connection')).catch((error) => {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration. The client is offline.');
      }
    });

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        cachedAccessToken = null;
        cachedIdToken = null;
        cachedAdminFlag = null;
        cachedAdminUid = null;
        needsAuth = true;
        updateCloudStatusUI();
        return;
      }
      if (cachedAdminUid !== user.uid) {
        cachedAdminFlag = null;
        cachedAdminUid = user.uid;
      }
      try {
        cachedIdToken = await user.getIdToken();
      } catch (e) {
        console.warn('Gagal mengambil Firebase ID Token:', e);
      }
      needsAuth = !cachedAccessToken;
      updateCloudStatusUI();

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
    injectCloudStatusBanner();
    updateCloudStatusUI();
    return { app, db, auth };
  })();

  return initPromise;
}

export function whenReady() {
  return initFirebase();
}

export function isFirebaseAuthenticated() {
  return !!(auth && auth.currentUser && db);
}

function isBootstrappedAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
}

export function isBootstrappedAdminUser() {
  return !!(auth && auth.currentUser && isBootstrappedAdminEmail(auth.currentUser.email));
}

export async function isCurrentUserAdmin() {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return false;
  const user = auth.currentUser;
  if (isBootstrappedAdminEmail(user.email)) {
    cachedAdminUid = user.uid;
    cachedAdminFlag = true;
    return true;
  }
  if (cachedAdminUid === user.uid && cachedAdminFlag !== null) {
    return cachedAdminFlag;
  }
  const uid = safeId(user.uid);
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    cachedAdminUid = user.uid;
    cachedAdminFlag = snap.exists();
    return cachedAdminFlag;
  } catch (err) {
    cachedAdminUid = user.uid;
    cachedAdminFlag = false;
    return false;
  }
}

// ============================================================================
// 5. GOOGLE SIGN-IN & OAUTH DRIVE SCOPE (GIS TOKEN CLIENT + FIREBASE CREDENTIAL)
// ============================================================================
function formatGoogleAuthError(err) {
  const code = (err && (err.code || err.type || err.error)) || '';
  const msg = (err && (err.message || err.error_description)) || String(err || '');
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'popup_closed' ||
    code === 'access_denied' ||
    msg.includes('auth/popup-closed-by-user') ||
    msg.includes('popup_closed')
  ) {
    return 'Jendela login Google ditutup sebelum pemilihan akun & izin selesai. Silakan klik "Lanjutkan dengan Google" dan selesaikan proses masuk.';
  }
  if (code === 'auth/cancelled-popup-request' || msg.includes('auth/cancelled-popup-request')) {
    return 'Permintaan login Google sebelumnya masih berjalan. Tunggu sebentar lalu coba klik sekali lagi.';
  }
  if (
    code === 'auth/popup-blocked' ||
    code === 'popup_failed_to_open' ||
    msg.includes('auth/popup-blocked') ||
    msg.includes('popup_failed_to_open')
  ) {
    return 'Pop-up login Google diblokir oleh browser. Izinkan pop-up untuk situs ini lalu klik "Lanjutkan dengan Google" kembali.';
  }
  if (code === 'auth/unauthorized-domain' || msg.includes('auth/unauthorized-domain')) {
    return 'Domain aplikasi belum diotorisasi pada Firebase Authentication.';
  }
  if (code === 'auth/operation-not-allowed' || msg.includes('auth/operation-not-allowed')) {
    return 'Provider login Google pada Firebase Authentication belum aktif atau perlu disinkronkan. Muat ulang halaman lalu coba kembali.';
  }
  return msg;
}

export function clearGoogleAuthFeedback() {
  setMigrationFeedback(lastMigrationSummary, '');
  updateCloudStatusUI();
}

async function finalizeGoogleSignInResult(fbUser, accessToken, options = {}) {
  if (accessToken) {
    cachedAccessToken = accessToken;
  }
  cachedIdToken = await fbUser.getIdToken();
  cachedAdminUid = fbUser.uid;
  cachedAdminFlag = null;
  needsAuth = !cachedAccessToken;
  setMigrationFeedback(lastMigrationSummary, '');
  updateCloudStatusUI();

  try {
    await ensureFirestoreUserRecord(fbUser);
  } catch (recErr) {
    const recMsg = (recErr && recErr.message) || String(recErr);
    setMigrationFeedback(null, 'Gagal mencatat profil Firestore: ' + recMsg);
    updateCloudStatusUI();
    if (!options.loginToApp) throw recErr;
  }

  const isBootAdmin = isBootstrappedAdminEmail(fbUser && fbUser.email);
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
  }

  if (options.loginToApp) {
    const loginRes = await completeAppLoginWithGoogle(fbUser);
    return {
      user: fbUser,
      accessToken: cachedAccessToken,
      idToken: cachedIdToken,
      session: loginRes
    };
  }

  return {
    user: fbUser,
    accessToken: cachedAccessToken,
    idToken: cachedIdToken
  };
}

function requestGisAccessTokenPopup(options = {}) {
  return new Promise((resolve, reject) => {
    const clientId = firebaseConfig && firebaseConfig.oAuthClientId;
    if (!clientId || !(window.google && window.google.accounts && window.google.accounts.oauth2)) {
      reject(new Error('GIS_NOT_READY'));
      return;
    }

    let settled = false;
    const scopeStr = ['openid', 'email', 'profile', ...SCOPES].join(' ');
    let promptValue = '';
    if (options.forceConsent) {
      promptValue = 'consent';
    } else if (options.promptSelectAccount || options.loginToApp || !(auth && auth.currentUser)) {
      promptValue = 'select_account';
    }

    const hintEmail = (!promptValue && auth && auth.currentUser && auth.currentUser.email)
      ? auth.currentUser.email
      : undefined;

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopeStr,
      ...(hintEmail ? { hint: hintEmail } : {}),
      callback: (tokenResponse) => {
        if (settled) return;
        settled = true;
        if (!tokenResponse || tokenResponse.error || !tokenResponse.access_token) {
          const err = new Error(tokenResponse?.error_description || tokenResponse?.error || 'Gagal mendapatkan token OAuth Google.');
          err.code = tokenResponse?.error || 'oauth_error';
          reject(err);
          return;
        }
        resolve(tokenResponse.access_token);
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        const wrapped = new Error((err && (err.message || err.type)) || 'popup_closed');
        wrapped.code = (err && err.type) || 'popup_closed';
        reject(wrapped);
      }
    });

    try {
      tokenClient.requestAccessToken({ prompt: promptValue });
    } catch (e) {
      if (!settled) {
        settled = true;
        reject(e);
      }
    }
  });
}

async function runFirebasePopupFallback(options = {}) {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => provider.addScope(scope));
  const customParams = {};
  if (options.forceConsent) {
    customParams.prompt = 'consent';
  } else if (options.promptSelectAccount || options.loginToApp || !(auth && auth.currentUser)) {
    customParams.prompt = 'select_account';
  } else if (auth && auth.currentUser && auth.currentUser.email) {
    customParams.login_hint = auth.currentUser.email;
  }
  if (Object.keys(customParams).length > 0) {
    provider.setCustomParameters(customParams);
  }
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential ? credential.accessToken : null;
  return finalizeGoogleSignInResult(result.user, accessToken, options);
}

export function signInWithGoogle(options = {}) {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  const runAfterInit = () => {
    isSigningIn = true;
    clearGoogleAuthFeedback();

    const canUseGisImmediately = Boolean(
      firebaseConfig &&
      firebaseConfig.oAuthClientId &&
      window.google &&
      window.google.accounts &&
      window.google.accounts.oauth2
    );

    const flowPromise = (async () => {
      if (canUseGisImmediately) {
        try {
          const accessToken = await requestGisAccessTokenPopup(options);
          const credential = GoogleAuthProvider.credential(null, accessToken);
          const result = await signInWithCredential(auth, credential);
          return finalizeGoogleSignInResult(result.user, accessToken, options);
        } catch (gisErr) {
          console.warn('GIS token client fallback to popup:', gisErr);
          return runFirebasePopupFallback(options);
        }
      }

      // Jika script GIS belum selesai dimuat saat tombol diklik, muat dulu lalu jalankan GIS
      const gisLoaded = await ensureGisClientScript();
      if (gisLoaded && firebaseConfig && firebaseConfig.oAuthClientId) {
        try {
          const accessToken = await requestGisAccessTokenPopup(options);
          const credential = GoogleAuthProvider.credential(null, accessToken);
          const result = await signInWithCredential(auth, credential);
          return finalizeGoogleSignInResult(result.user, accessToken, options);
        } catch (gisErr2) {
          console.warn('GIS loaded fallback to popup:', gisErr2);
          return runFirebasePopupFallback(options);
        }
      }

      return runFirebasePopupFallback(options);
    })();

    activeSignInPromise = flowPromise
      .catch(async (err) => {
        const friendly = new Error(formatGoogleAuthError(err));
        friendly.code = (err && (err.code || err.type)) || 'auth_error';
        friendly.originalError = err;
        throw friendly;
      })
      .finally(() => {
        isSigningIn = false;
        activeSignInPromise = null;
      });

    return activeSignInPromise;
  };

  if (auth && firebaseConfig) {
    return runAfterInit();
  }
  return initFirebase().then(() => runAfterInit());
}

export function ensureGoogleDriveToken() {
  if (cachedAccessToken && auth && auth.currentUser) {
    return Promise.resolve(cachedAccessToken);
  }
  return signInWithGoogle({ loginToApp: false, forceConsent: true }).then(({ accessToken }) => {
    if (!accessToken) {
      throw new Error('Izin akses Google Drive belum diberikan. Silakan klik tombol Lanjutkan dengan Google / Sign in with Google.');
    }
    return accessToken;
  });
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
  cachedAdminFlag = null;
  cachedAdminUid = null;
  needsAuth = true;
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Gagal signOut Firebase:', e);
    }
  }
  try {
    sessionStorage.removeItem('rekon_node_token');
  } catch (_) {}
  isSigningOut = false;
  updateCloudStatusUI();
}

// ============================================================================
// 6. SANITIZERS & FIRESTORE BLUEPRINT HELPERS
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
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'object') return val;
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

function normalizeUserDoc(docId, d) {
  return {
    docId,
    uid: d.uid || docId,
    username: d.username || docId,
    name: d.name || d.username || 'Pengguna',
    email: d.email || '',
    whatsapp: d.whatsapp || '',
    role: d.role || 'Operator Sekolah',
    requestedRole: d.requestedRole || d.role || 'Operator Sekolah',
    jabatan: d.jabatan || '',
    schoolNo: d.schoolNo != null && Number(d.schoolNo) > 0 ? Number(d.schoolNo) : null,
    npsn: d.npsn || '',
    status: d.status || 'Pending'
  };
}

function isRealFirebaseUid(val) {
  const s = String(val || '');
  return !!s && !s.startsWith('user_') && !s.startsWith('invite_');
}

async function ensureFirestoreUserRecord(fbUser) {
  if (!fbUser || !db) return null;
  const uid = safeId(fbUser.uid);
  const email = cleanStr(fbUser.email || '', 160);
  const emailLower = email.toLowerCase();
  const isBootAdmin = isBootstrappedAdminEmail(emailLower);

  if (isBootAdmin) {
    const adminPath = `admins/${uid}`;
    try {
      const snap = await getDoc(doc(db, 'admins', uid));
      if (!snap.exists()) {
        await setDoc(doc(db, 'admins', uid), {
          uid,
          email: emailLower,
          role: 'Admin Dinas',
          createdAt: serverTimestamp()
        });
      }
      cachedAdminUid = fbUser.uid;
      cachedAdminFlag = true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, adminPath);
    }
  }

  const userPath = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      let invite = null;
      if (!isBootAdmin && emailLower) {
        try {
          const invSnap = await getDoc(doc(db, 'account_invites', emailLower));
          if (invSnap.exists()) {
            invite = invSnap.data();
          }
        } catch (_) {}
      }

      const invRole = invite && ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(invite.role)
        ? invite.role
        : (isBootAdmin ? 'Admin Dinas' : 'Operator Sekolah');
      const invStatus = invite && ['Pending', 'Aktif', 'Ditolak'].includes(invite.status)
        ? invite.status
        : (isBootAdmin ? 'Aktif' : 'Pending');

      const payload = {
        uid,
        username: cleanStr((invite && invite.username) || (emailLower ? emailLower.split('@')[0] : uid), 80, 'user'),
        name: cleanStr((invite && invite.name) || fbUser.displayName || (isBootAdmin ? 'Administrator Dinas' : 'Pengguna Google'), 140, 'Pengguna'),
        email: emailLower,
        ...(invite && invite.whatsapp ? { whatsapp: cleanStr(invite.whatsapp, 30) } : {}),
        role: invRole,
        requestedRole: invRole,
        ...(invite && invite.jabatan ? { jabatan: cleanStr(invite.jabatan, 120) } : {}),
        ...(invite && Number(invite.schoolNo) > 0 ? { schoolNo: Math.max(0, Math.min(10000, Number(invite.schoolNo) || 0)) } : {}),
        ...(invite && invite.npsn ? { npsn: cleanStr(invite.npsn, 20) } : {}),
        status: invStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', uid), payload);

      if (!isBootAdmin && invStatus === 'Aktif' && (invRole === 'Admin Dinas' || invRole === 'BUD')) {
        try {
          const admSnap = await getDoc(doc(db, 'admins', uid));
          if (!admSnap.exists()) {
            await setDoc(doc(db, 'admins', uid), {
              uid,
              email: emailLower,
              role: invRole,
              createdAt: serverTimestamp()
            });
          }
          cachedAdminUid = fbUser.uid;
          cachedAdminFlag = true;
        } catch (admErr) {
          handleFirestoreError(admErr, OperationType.WRITE, `admins/${uid}`);
        }
      }

      if (invStatus === 'Aktif' && invRole === 'Operator Sekolah' && payload.schoolNo > 0) {
        await linkOperatorUidToSchoolDocs(uid, payload.schoolNo).catch(() => {});
      }

      return normalizeUserDoc(uid, payload);
    }
    return normalizeUserDoc(snap.id, snap.data());
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
    return null;
  }
}

export async function resolveCurrentUserSession() {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const fbUser = auth.currentUser;
  const uid = safeId(fbUser.uid);
  const isBootAdmin = isBootstrappedAdminEmail(fbUser.email);

  let adminRec = null;
  try {
    const aSnap = await getDoc(doc(db, 'admins', uid));
    if (aSnap.exists()) {
      adminRec = aSnap.data();
      cachedAdminUid = fbUser.uid;
      cachedAdminFlag = true;
    } else if (isBootAdmin) {
      await ensureFirestoreUserRecord(fbUser);
      adminRec = { uid, email: fbUser.email, role: 'Admin Dinas' };
    }
  } catch (_) {}

  let userRec = null;
  const userPath = `users/${uid}`;
  try {
    const uSnap = await getDoc(doc(db, 'users', uid));
    if (uSnap.exists()) {
      userRec = normalizeUserDoc(uSnap.id, uSnap.data());
    } else {
      userRec = await ensureFirestoreUserRecord(fbUser);
      if (!adminRec && userRec && userRec.status === 'Aktif' && (userRec.role === 'Admin Dinas' || userRec.role === 'BUD')) {
        try {
          const aSnap2 = await getDoc(doc(db, 'admins', uid));
          if (aSnap2.exists()) {
            adminRec = aSnap2.data();
            cachedAdminUid = fbUser.uid;
            cachedAdminFlag = true;
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (adminRec) {
    const role = adminRec.role === 'BUD' ? 'BUD' : 'Admin Dinas';
    return {
      ...(userRec || {}),
      docId: (userRec && userRec.docId) || uid,
      uid,
      username: (userRec && userRec.username) || cleanStr(fbUser.email ? fbUser.email.split('@')[0] : 'admin', 80),
      name: (userRec && userRec.name) || cleanStr(fbUser.displayName || 'Administrator Dinas', 140),
      email: fbUser.email || (userRec && userRec.email) || '',
      role,
      requestedRole: role,
      status: 'Aktif'
    };
  }

  if (!userRec) return null;
  return userRec;
}

export async function getCurrentFirestoreUser() {
  return resolveCurrentUserSession();
}

export async function completePendingUserProfile({ name, requestedRole, jabatan, npsn, schoolNo, whatsapp }) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) {
    throw new Error('Silakan login dengan akun Google terlebih dahulu.');
  }
  const uid = safeId(auth.currentUser.uid);
  const path = `users/${uid}`;
  const reqRole = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(requestedRole) ? requestedRole : 'Operator Sekolah';
  const cleanName = cleanStr(name || '', 140);
  const cleanWa = cleanStr(whatsapp || '', 30);
  const cleanJabatan = cleanStr(jabatan || '', 120);
  const cleanNpsn = cleanStr(npsn || '', 20);
  const cleanSchoolNo = Math.max(0, Math.min(10000, Number(schoolNo) || 0));

  if (!cleanWa) {
    throw new Error('Nomor WhatsApp aktif wajib diisi.');
  }

  let patch;
  if (reqRole === 'Operator Sekolah') {
    if (!cleanNpsn || cleanSchoolNo < 1) {
      throw new Error('NPSN sekolah wajib diisi dan ditemukan di Data Master Sekolah.');
    }
    patch = {
      whatsapp: cleanWa,
      requestedRole: reqRole,
      jabatan: '',
      npsn: cleanNpsn,
      schoolNo: cleanSchoolNo,
      updatedAt: serverTimestamp()
    };
    if (cleanName) patch.name = cleanName;
  } else {
    if (!cleanName) {
      throw new Error('Nama lengkap pendaftar Admin wajib diisi.');
    }
    patch = {
      name: cleanName,
      whatsapp: cleanWa,
      requestedRole: reqRole,
      jabatan: cleanJabatan || (reqRole === 'BUD' ? 'Bendahara Umum Daerah' : 'Admin Dinas Pendidikan'),
      npsn: '',
      schoolNo: 0,
      updatedAt: serverTimestamp()
    };
  }

  try {
    await updateDoc(doc(db, 'users', uid), patch);
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? normalizeUserDoc(snap.id, snap.data()) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return null;
  }
}

async function syncServerCookieWithGoogle(fbUser) {
  const token = cachedIdToken || (await fbUser.getIdToken());
  const resp = await fetch('/api/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Firebase-Token': token } : {})
    },
    credentials: 'include',
    body: JSON.stringify({
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || '',
      emailVerified: !!fbUser.emailVerified
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.status !== 'success') {
    throw new Error(data.message || 'Gagal menyinkronkan sesi backend.');
  }
  if (data.token) {
    try { sessionStorage.setItem('rekon_node_token', data.token); } catch (_) {}
  }
  return data;
}

async function completeAppLoginWithGoogle(fbUser) {
  const yearSel = document.getElementById('loginYearSelect');
  const selectedYear = yearSel ? parseInt(yearSel.value, 10) : (window.activeYear || 2026);
  try { localStorage.setItem('bosp_activeYear', String(selectedYear)); } catch (_) {}

  const sessionUser = await resolveCurrentUserSession();
  if (!sessionUser) {
    throw new Error('Profil pengguna di Firestore belum ditemukan.');
  }

  if (sessionUser.status === 'Ditolak') {
    await signOutFirebase();
    throw new Error('Akun Google ini ditolak oleh Administrator Dinas.');
  }

  if (sessionUser.status !== 'Aktif') {
    try {
      window.dispatchEvent(new CustomEvent('sigap-pending-profile', {
        detail: { user: sessionUser, selectedYear }
      }));
    } catch (_) {}
    return { status: 'pending', user: sessionUser, selectedYear };
  }

  // Hanya dipakai untuk cookie HTTP-only helper API server (/api/anggaran/parse & /api/migration/json-bundle)
  try {
    await syncServerCookieWithGoogle(fbUser);
  } catch (e) {
    console.warn('Sync cookie backend opsional:', e);
  }

  try {
    window.dispatchEvent(new CustomEvent('sigap-app-authenticated', {
      detail: { user: sessionUser, selectedYear }
    }));
  } catch (_) {}

  return { status: 'active', user: sessionUser, selectedYear };
}

// ============================================================================
// 7. GOOGLE DRIVE API v3 HELPERS (FOLDER HIERARCHY, UPLOAD, DELETE WITH CONFIRM)
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
 * Menghapus file dari Google Drive & Firestore — WAJIB meminta konfirmasi modal pengguna
 */
export async function deleteFileFromGoogleDrive(driveFileId, fileName = 'dokumen PDF', skipConfirm = false) {
  if (!driveFileId) return false;
  if (!skipConfirm) {
    const confirmed = await showDriveConfirmModal({
      title: 'Hapus File Google Drive',
      message: `Apakah Anda yakin ingin menghapus berkas "${fileName}" dari Google Drive?\nTindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus dari Google Drive',
      danger: true
    });
    if (!confirmed) return false;
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
      handleFirestoreError(err, OperationType.DELETE, path);
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
    const confirmed = await showDriveConfirmModal({
      title: 'Ganti Berkas Google Drive',
      message: `Berkas sebelumnya sudah tersimpan di Google Drive.\nApakah Anda ingin menghapus berkas lama dan menggantinya dengan "${meta.fileName || 'dokumen baru.pdf'}"?`,
      confirmText: 'Ganti Berkas',
      danger: true
    });
    if (!confirmed) {
      throw new Error('Penggantian berkas PDF dibatalkan pengguna.');
    }
    try {
      await deleteFileFromGoogleDrive(meta.existingDriveFileId, meta.fileName || 'berkas lama', true);
    } catch (e) {
      console.warn('Gagal menghapus file lama di Google Drive:', e);
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
// 8. FULL JSON + LOCAL PDF MIGRATION TO FIREBASE FIRESTORE & GOOGLE DRIVE
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

function finiteNumOrUndefined(val) {
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

function buildMonthlyReportFirestorePayload(year, schoolNo, monthKey, mData, uid, extraAllowedUids = []) {
  const verifStatus = VALID_VERIF_STATUS.includes(mData.verifStatus) ? mData.verifStatus : 'Draft';
  const allowedSet = new Set();
  if (Array.isArray(mData.allowedUids)) {
    mData.allowedUids.forEach((x) => { if (typeof x === 'string' && x.trim()) allowedSet.add(x.trim()); });
  }
  if (Array.isArray(extraAllowedUids)) {
    extraAllowedUids.forEach((x) => { if (typeof x === 'string' && x.trim()) allowedSet.add(x.trim()); });
  }
  const ownerUid = typeof mData.ownerUid === 'string' && /^[a-zA-Z0-9_\-]+$/.test(mData.ownerUid) ? mData.ownerUid : uid;

  const saReg = finiteNumOrUndefined(mData.saldoReguler);
  const saKin = finiteNumOrUndefined(mData.saldoKinerja);
  const saNon = finiteNumOrUndefined(mData.saldoNonBOS);
  const saTun = finiteNumOrUndefined(mData.saldoTunai);
  const saCust = finiteNumOrUndefined(mData.saldoAwalCustom);

  return {
    year: Number(year),
    schoolNo: Number(schoolNo),
    month: monthKey,
    ownerUid,
    ...(allowedSet.size ? { allowedUids: Array.from(allowedSet).slice(0, 10) } : {}),
    verifStatus,
    reconDone: !!mData.reconDone,
    ...(mData.reconDoneAt ? { reconDoneAt: cleanStr(mData.reconDoneAt, 40) } : {}),
    ...(typeof mData.verifiedAt === 'string' && mData.verifiedAt ? { verifiedAt: cleanStr(mData.verifiedAt, 40) } : {}),
    ...(typeof mData.verifiedBy === 'string' && mData.verifiedBy ? { verifiedBy: cleanStr(mData.verifiedBy, 160) } : {}),
    ...(typeof mData.verifiedBulk === 'boolean' ? { verifiedBulk: mData.verifiedBulk } : {}),
    ...(typeof mData.submittedAt === 'string' && mData.submittedAt ? { submittedAt: cleanStr(mData.submittedAt, 40) } : {}),
    ...(typeof mData.submittedBy === 'string' && mData.submittedBy ? { submittedBy: cleanStr(mData.submittedBy, 160) } : {}),
    ...(typeof mData.approvedAt === 'string' && mData.approvedAt ? { approvedAt: cleanStr(mData.approvedAt, 40) } : {}),
    ...(typeof mData.approvedBy === 'string' && mData.approvedBy ? { approvedBy: cleanStr(mData.approvedBy, 160) } : {}),
    ...(typeof mData.unverifiedAt === 'string' && mData.unverifiedAt ? { unverifiedAt: cleanStr(mData.unverifiedAt, 40) } : {}),
    ...(typeof mData.unverifiedBy === 'string' && mData.unverifiedBy ? { unverifiedBy: cleanStr(mData.unverifiedBy, 160) } : {}),
    ...(typeof mData.unverifyReason === 'string' && mData.unverifyReason ? { unverifyReason: cleanStr(mData.unverifyReason, 500) } : {}),
    pendapatan: cleanMap(mData.pendapatan || {}, 20),
    belanja: cleanMap(mData.belanja || {}, 20),
    rekon: cleanMap(mData.rekon || {}, 20),
    ...(mData.saManual && typeof mData.saManual === 'object' ? { saManual: cleanMap(mData.saManual, 10) } : {}),
    documents: cleanMap(mData.documents || {}, 20),
    ...(saCust !== undefined ? { saldoAwalCustom: saCust } : {}),
    ...(saReg !== undefined ? { saldoReguler: saReg } : {}),
    ...(saKin !== undefined ? { saldoKinerja: saKin } : {}),
    ...(saNon !== undefined ? { saldoNonBOS: saNon } : {}),
    ...(saTun !== undefined ? { saldoTunai: saTun } : {}),
    updatedAt: serverTimestamp()
  };
}

function buildMonthlyReportOperatorUpdatePayload(mData) {
  const verifStatus = mData.verifStatus === 'Diajukan Sekolah' ? 'Diajukan Sekolah' : 'Draft';
  const saReg = finiteNumOrUndefined(mData.saldoReguler);
  const saKin = finiteNumOrUndefined(mData.saldoKinerja);
  const saNon = finiteNumOrUndefined(mData.saldoNonBOS);
  const saTun = finiteNumOrUndefined(mData.saldoTunai);
  const saCust = finiteNumOrUndefined(mData.saldoAwalCustom);

  return {
    verifStatus,
    reconDone: !!mData.reconDone,
    ...(mData.reconDoneAt ? { reconDoneAt: cleanStr(mData.reconDoneAt, 40) } : {}),
    ...(typeof mData.submittedAt === 'string' && mData.submittedAt ? { submittedAt: cleanStr(mData.submittedAt, 40) } : {}),
    ...(typeof mData.submittedBy === 'string' && mData.submittedBy ? { submittedBy: cleanStr(mData.submittedBy, 160) } : {}),
    pendapatan: cleanMap(mData.pendapatan || {}, 20),
    belanja: cleanMap(mData.belanja || {}, 20),
    rekon: cleanMap(mData.rekon || {}, 20),
    ...(mData.saManual && typeof mData.saManual === 'object' ? { saManual: cleanMap(mData.saManual, 10) } : {}),
    documents: cleanMap(mData.documents || {}, 20),
    ...(saCust !== undefined ? { saldoAwalCustom: saCust } : {}),
    ...(saReg !== undefined ? { saldoReguler: saReg } : {}),
    ...(saKin !== undefined ? { saldoKinerja: saKin } : {}),
    ...(saNon !== undefined ? { saldoNonBOS: saNon } : {}),
    ...(saTun !== undefined ? { saldoTunai: saTun } : {}),
    updatedAt: serverTimestamp()
  };
}

function buildAnggaranFirestorePayload(rec, uid, extraAllowedUids = []) {
  const year = Math.max(2020, Math.min(2100, Number(rec.year) || 2026));
  const schoolNo = Math.max(1, Math.min(10000, Number(rec.schoolNo) || 1));
  const tahap = VALID_TAHAP.includes(rec.tahap) ? rec.tahap : 'induk';
  const sumber = VALID_SUMBER.includes(rec.sumber) ? rec.sumber : 'reguler';
  const status = VALID_ANG_STATUS.includes(rec.status) ? rec.status : 'Draft';
  const itemsArr = Array.isArray(rec.items) ? rec.items : boundedMapToArray(rec.itemsMap);
  const warningsArr = Array.isArray(rec.warnings) ? rec.warnings : boundedMapToArray(rec.warningsMap);
  const blockingArr = Array.isArray(rec.blockingErrors) ? rec.blockingErrors : boundedMapToArray(rec.blockingMap);

  const allowedSet = new Set();
  if (Array.isArray(rec.allowedUids)) {
    rec.allowedUids.forEach((x) => { if (typeof x === 'string' && x.trim()) allowedSet.add(x.trim()); });
  }
  if (Array.isArray(extraAllowedUids)) {
    extraAllowedUids.forEach((x) => { if (typeof x === 'string' && x.trim()) allowedSet.add(x.trim()); });
  }
  const ownerUid = typeof rec.ownerUid === 'string' && /^[a-zA-Z0-9_\-]+$/.test(rec.ownerUid) ? rec.ownerUid : uid;

  return {
    year,
    schoolNo,
    tahap,
    sumber,
    ownerUid,
    ...(allowedSet.size ? { allowedUids: Array.from(allowedSet).slice(0, 10) } : {}),
    fileName: cleanStr(rec.fileName || 'rkas.pdf', 200, 'rkas.pdf'),
    fileUrl: cleanStr(rec.fileUrl || 'gdrive://pending', 500, 'gdrive://pending'),
    ...(rec.driveFileId ? { driveFileId: cleanStr(rec.driveFileId, 128) } : {}),
    status,
    ...(typeof rec.catatan === 'string' && rec.catatan ? { catatan: cleanStr(rec.catatan, 500) } : {}),
    totals: cleanMap(rec.totals || { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 }, 10),
    ...(rec.meta && typeof rec.meta === 'object' ? { meta: cleanMap(rec.meta, 20) } : {}),
    itemsMap: arrayToBoundedMap(itemsArr, 500),
    warningsMap: arrayToBoundedMap(warningsArr, 50),
    blockingMap: arrayToBoundedMap(blockingArr, 50),
    ...(rec.basis && typeof rec.basis === 'object' ? { basis: cleanMap(rec.basis, 10) } : {}),
    ...(rec.stats && typeof rec.stats === 'object' ? { stats: cleanMap(rec.stats, 10) } : {}),
    uploadedAt: cleanStr(rec.uploadedAt || new Date().toISOString(), 40),
    uploadedBy: cleanStr(rec.uploadedBy || 'operator', 160),
    ...(typeof rec.submittedAt === 'string' && rec.submittedAt ? { submittedAt: cleanStr(rec.submittedAt, 40) } : {}),
    ...(typeof rec.verifiedAt === 'string' && rec.verifiedAt ? { verifiedAt: cleanStr(rec.verifiedAt, 40) } : {}),
    ...(typeof rec.verifiedBy === 'string' && rec.verifiedBy ? { verifiedBy: cleanStr(rec.verifiedBy, 160) } : {}),
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

function buildPublicDirectoryPayload(schools, uid) {
  const compact = (Array.isArray(schools) ? schools : []).slice(0, 500).map((s) => ({
    no: Number(s.no),
    npsn: cleanStr(s.npsn || '-', 20, '-'),
    name: cleanStr(s.name || '', 160),
    kecamatan: cleanStr(s.kecamatan || 'MINAHASA TENGGARA', 100),
    jenjang: String(s.jenjang || 'SD').toUpperCase() === 'SMP' ? 'SMP' : 'SD',
    status: String(s.status || 'NEGERI').toUpperCase() === 'SWASTA' ? 'SWASTA' : 'NEGERI'
  }));
  return {
    count: compact.length,
    itemsMap: arrayToBoundedMap(compact, 500),
    updatedByUid: uid,
    updatedAt: serverTimestamp()
  };
}

function computePublicRankRows(year, monthKey, monthlyMap, schools) {
  const monthIdx = VALID_MONTHS.indexOf(monthKey);
  if (monthIdx < 0) return [];
  const endOfMonth = new Date(Number(year), monthIdx + 1, 0, 23, 59, 59, 999).getTime();
  const schoolByNo = new Map((Array.isArray(schools) ? schools : []).map((s) => [String(s.no), s]));
  const rows = [];

  for (const [noStr, monthsObj] of Object.entries(monthlyMap || {})) {
    const m = monthsObj && monthsObj[monthKey];
    if (!m || !m.reconDone || !m.reconDoneAt) continue;
    const sc = schoolByNo.get(String(noStr));
    if (!sc) continue;
    const doneMs = new Date(m.reconDoneAt).getTime();
    if (!Number.isFinite(doneMs)) continue;
    rows.push({
      no: Number(sc.no),
      name: cleanStr(sc.name || '', 160),
      kecamatan: cleanStr(sc.kecamatan || '', 100),
      reconDoneAt: cleanStr(m.reconDoneAt, 40),
      durationMs: Math.max(0, doneMs - endOfMonth)
    });
  }
  rows.sort((a, b) => new Date(a.reconDoneAt).getTime() - new Date(b.reconDoneAt).getTime());
  return rows.slice(0, 250);
}

async function isJsonAlreadyMigratedToFirestore() {
  if (!db || !auth || !auth.currentUser) return false;
  try {
    const [migSnap, dirSnap, s1Snap, uSnap] = await Promise.all([
      getDoc(doc(db, 'app_meta', 'migration_state')),
      getDoc(doc(db, 'public_directory', 'schools')),
      getDoc(doc(db, 'schools', '1')),
      getDoc(doc(db, 'users', 'user_admin'))
    ]);
    return migSnap.exists() && !!(migSnap.data() && migSnap.data().completed) && dirSnap.exists() && s1Snap.exists() && uSnap.exists();
  } catch (_) {
    return false;
  }
}

export async function autoMigrateJsonDatabaseIfNeeded() {
  if (isSigningOut || isSigningIn) return;
  if (activeMigrationPromise) return activeMigrationPromise;
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return;
  if (!isBootstrappedAdminUser()) return;

  try {
    const alreadyDone = await isJsonAlreadyMigratedToFirestore();
    if (alreadyDone) {
      const migSnap = await getDoc(doc(db, 'app_meta', 'migration_state')).catch(() => null);
      const counts = (migSnap && migSnap.exists() && migSnap.data().counts) || { schools: 137, users: 3, monthlyReports: 139, anggaranRecords: 2 };
      setMigrationFeedback({ status: 'synced', ...counts }, '');
      updateCloudStatusUI();
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
    throw new Error('Silakan login dengan akun Google Admin terlebih dahulu untuk menjalankan migrasi database.');
  }
  if (!isBootstrappedAdminUser()) {
    throw new Error(`Migrasi penuh hanya dapat dijalankan oleh Admin Utama (${BOOTSTRAPPED_ADMIN_EMAIL}).`);
  }
  if (activeMigrationPromise) {
    return activeMigrationPromise;
  }

  if (options.skipIfAlreadyPresent) {
    try {
      const done = await isJsonAlreadyMigratedToFirestore();
      if (done) {
        const migSnap = await getDoc(doc(db, 'app_meta', 'migration_state')).catch(() => null);
        const counts = (migSnap && migSnap.exists() && migSnap.data().counts) || { schools: 137, users: 3, monthlyReports: 139, anggaranRecords: 2 };
        setMigrationFeedback({ status: 'synced', ...counts }, '');
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

      // Cek operator aktif yang sudah terdaftar di Firestore per sekolah agar allowedUids tetap terpelihara
      const operatorUidsBySchool = new Map();
      try {
        const existingUsersSnap = await getDocs(collection(db, 'users'));
        existingUsersSnap.forEach((docSnap) => {
          const ud = docSnap.data();
          if (ud && ud.status === 'Aktif' && ud.role === 'Operator Sekolah' && Number(ud.schoolNo) > 0 && ud.uid && !String(ud.uid).startsWith('user_')) {
            const key = Number(ud.schoolNo);
            if (!operatorUidsBySchool.has(key)) operatorUidsBySchool.set(key, []);
            operatorUidsBySchool.get(key).push(ud.uid);
          }
        });
      } catch (_) {}

      // 1. Migrasi Sekolah (data/schools.json) + /public_directory/schools
      const schools = Array.isArray(bundle.schools) ? bundle.schools : [];
      const schoolByNo = new Map();
      for (const s of schools) {
        if (!s || !s.no) continue;
        const schoolId = String(Number(s.no));
        schoolByNo.set(Number(s.no), s);
        ops.push({
          ref: doc(db, 'schools', schoolId),
          data: buildSchoolFirestorePayload(s, uid),
          path: `schools/${schoolId}`
        });
      }
      ops.push({
        ref: doc(db, 'public_directory', 'schools'),
        data: buildPublicDirectoryPayload(schools, uid),
        path: 'public_directory/schools'
      });

      // 2. Migrasi Users (data/users.json)
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

      // 3. Unggah PDF Bulanan lokal ke Google Drive & tautkan URL Drive ke monthlyByYear
      const monthlyByYear = bundle.monthlyByYear ? JSON.parse(JSON.stringify(bundle.monthlyByYear)) : {};
      const monthlyPdfs = [];
      if (Array.isArray(bundle.monthlyPdfUploads)) {
        bundle.monthlyPdfUploads.forEach((pf) => { if (pf && pf.pdfBase64) monthlyPdfs.push(pf); });
      } else if (bundle.monthlyPdfUploads && typeof bundle.monthlyPdfUploads === 'object') {
        const pdfMap = bundle.monthlyPdfUploads;
        for (const [yrStr, schoolsObj] of Object.entries(monthlyByYear)) {
          for (const [scNoStr, monthsObj] of Object.entries(schoolsObj || {})) {
            for (const [moStr, rec] of Object.entries(monthsObj || {})) {
              if (!rec || !rec.documents || typeof rec.documents !== 'object') continue;
              for (const [docType, docItem] of Object.entries(rec.documents)) {
                if (!docItem || typeof docItem !== 'object') continue;
                const rawUrl = String(docItem.url || '');
                if (!rawUrl.startsWith('/api/file/')) continue;
                let rel = '';
                try { rel = decodeURIComponent(rawUrl.replace(/^\/api\/file\//, '')); } catch (_) { rel = rawUrl.replace(/^\/api\/file\//, ''); }
                const b64 = pdfMap[rel];
                if (b64) {
                  monthlyPdfs.push({
                    year: Number(yrStr),
                    schoolNo: Number(scNoStr),
                    monthKey: moStr,
                    docType,
                    fileName: docItem.fileName || `${docType}.pdf`,
                    pdfBase64: b64
                  });
                }
              }
            }
          }
        }
      }
      let driveUploadedCount = 0;

      for (let i = 0; i < monthlyPdfs.length; i++) {
        const pf = monthlyPdfs[i];
        if (!pf || !pf.pdfBase64 || !cachedAccessToken) continue;
        const yrStr = String(pf.year || '2026');
        const scNoStr = String(pf.schoolNo || '0');
        const moStr = pf.monthKey || pf.periodKey || '';
        const sc = schoolByNo.get(Number(pf.schoolNo)) || {};
        try {
          setProgress(`Mengunggah PDF Realisasi (${i + 1}/${monthlyPdfs.length}) ${pf.fileName} ke Google Drive…`);
          const gdriveRes = await uploadPdfToGoogleDrive(pf.pdfBase64, {
            schoolNo: pf.schoolNo,
            schoolName: sc.name || `Sekolah_${pf.schoolNo}`,
            npsn: sc.npsn || '',
            periodKey: moStr || 'Jan',
            year: pf.year || 2026,
            docType: pf.docType || 'dokumen',
            fileName: pf.fileName || 'dokumen.pdf',
            skipConfirmReplace: true
          });
          if (gdriveRes && gdriveRes.fileUrl) {
            driveUploadedCount++;
            if (monthlyByYear[yrStr] && monthlyByYear[yrStr][scNoStr] && monthlyByYear[yrStr][scNoStr][moStr]) {
              const targetM = monthlyByYear[yrStr][scNoStr][moStr];
              if (!targetM.documents || typeof targetM.documents !== 'object') targetM.documents = {};
              targetM.documents[pf.docType] = {
                ...(targetM.documents[pf.docType] || {}),
                fileName: pf.fileName,
                url: gdriveRes.fileUrl,
                driveFileId: gdriveRes.driveFileId,
                uploadedAt: (targetM.documents[pf.docType] && targetM.documents[pf.docType].uploadedAt) || new Date().toISOString()
              };
            }
          }
        } catch (driveErr) {
          console.warn('Gagal unggah PDF bulanan migrasi ke Drive:', driveErr);
        }
      }

      // 4. Migrasi Monthly Realization Reports + Public Ranks
      let monthlyCount = 0;
      let rankCount = 0;
      for (const [yearStr, schoolsMap] of Object.entries(monthlyByYear)) {
        const year = Number(yearStr);
        if (!Number.isFinite(year) || year < 2020 || year > 2100) continue;

        for (const [schoolNoRaw, monthsObj] of Object.entries(schoolsMap || {})) {
          const schoolNo = Number(schoolNoRaw);
          if (!Number.isFinite(schoolNo) || schoolNo < 1 || schoolNo > 10000) continue;
          const extraAllowed = operatorUidsBySchool.get(schoolNo) || [];

          for (const [monthKey, mData] of Object.entries(monthsObj || {})) {
            if (!VALID_MONTHS.includes(monthKey) || !mData || typeof mData !== 'object') continue;
            const reportId = `${year}_${schoolNo}_${monthKey}`;
            ops.push({
              ref: doc(db, 'monthly_reports', reportId),
              data: buildMonthlyReportFirestorePayload(year, schoolNo, monthKey, mData, uid, extraAllowed),
              path: `monthly_reports/${reportId}`
            });
            monthlyCount++;
          }
        }

        for (const monthKey of VALID_MONTHS) {
          const rows = computePublicRankRows(year, monthKey, schoolsMap, schools);
          if (rows.length > 0) {
            ops.push({
              ref: doc(db, 'public_ranks', `${year}_${monthKey}`),
              data: {
                year,
                month: monthKey,
                rowsMap: arrayToBoundedMap(rows, 250),
                updatedByUid: uid,
                updatedAt: serverTimestamp()
              },
              path: `public_ranks/${year}_${monthKey}`
            });
            rankCount++;
          }
        }
      }

      // 5. Migrasi RKAS Penganggaran + Unggah PDF lokal ke Google Drive
      const anggaranList = Array.isArray(bundle.anggaranList) ? bundle.anggaranList : [];
      for (let i = 0; i < anggaranList.length; i++) {
        const rec = { ...anggaranList[i] };
        const recordId = `${rec.year}_${rec.schoolNo}_${rec.tahap}_${rec.sumber}`;
        const sc = schoolByNo.get(Number(rec.schoolNo)) || {};

        if (rec.pdfBase64 && cachedAccessToken && (!rec.driveFileId || !String(rec.fileUrl || '').includes('drive.google.com'))) {
          try {
            setProgress(`Mengunggah PDF RKAS (${i + 1}/${anggaranList.length}) ${rec.fileName} ke Google Drive…`);
            const gdriveRes = await uploadPdfToGoogleDrive(rec.pdfBase64, {
              schoolNo: rec.schoolNo,
              schoolName: sc.name || rec.schoolName || `Sekolah_${rec.schoolNo}`,
              npsn: sc.npsn || rec.npsn || '',
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
            console.warn('Gagal unggah PDF RKAS migrasi ke Drive:', driveErr);
          }
        }
        delete rec.pdfBase64;
        const extraAllowed = operatorUidsBySchool.get(Number(rec.schoolNo)) || [];
        ops.push({
          ref: doc(db, 'anggaran_records', recordId),
          data: buildAnggaranFirestorePayload(rec, uid, extraAllowed),
          path: `anggaran_records/${recordId}`
        });
      }

      // 6. Migrasi SP2B Kabupaten per Tahun
      const sp2bKabByYear = bundle.sp2bKabByYear || {};
      let sp2bCount = 0;
      for (const [yearStr, kabStore] of Object.entries(sp2bKabByYear)) {
        const year = Number(yearStr);
        if (!Number.isFinite(year) || year < 2020 || year > 2100) continue;
        ops.push({
          ref: doc(db, 'sp2b_kab', String(year)),
          data: {
            year,
            records: cleanMap((kabStore && kabStore.records) || {}, 200),
            last: cleanMap((kabStore && kabStore.last) || {}, 30),
            updatedByUid: uid,
            updatedAt: serverTimestamp()
          },
          path: `sp2b_kab/${year}`
        });
        sp2bCount++;
      }

      // 7. Simpan App Meta (/app_meta/system & /app_meta/migration_state)
      const countsSummary = {
        schools: schools.length,
        users: users.length,
        monthlyReports: monthlyCount,
        anggaranRecords: anggaranList.length,
        sp2bKab: sp2bCount,
        publicRanks: rankCount,
        driveUploadedCount
      };
      const metaNow = new Date().toISOString();
      ops.push({
        ref: doc(db, 'app_meta', 'system'),
        data: {
          version: cleanStr((bundle.meta && bundle.meta.version) || 'firebase-v1', 40),
          completed: true,
          migratedByUid: uid,
          migratedAt: metaNow,
          counts: countsSummary,
          updatedAt: serverTimestamp()
        },
        path: 'app_meta/system'
      });
      ops.push({
        ref: doc(db, 'app_meta', 'migration_state'),
        data: {
          version: '2.0-firebase-drive',
          completed: true,
          migratedByUid: uid,
          migratedAt: metaNow,
          counts: countsSummary,
          updatedAt: serverTimestamp()
        },
        path: 'app_meta/migration_state'
      });

      // 8. Commit seluruh operasi ke Cloud Firestore menggunakan writeBatch (maks 300 dokumen per batch)
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
        countsSummary,
        { username: auth.currentUser.email || 'admin', role: 'Admin Dinas' }
      ).catch(() => {});

      const summary = { status: 'success', ...countsSummary };
      setMigrationFeedback(summary, '');

      if (!options.silentIfAlreadyMigrated) {
        showDriveToast(
          `Migrasi Selesai! ${schools.length} sekolah, ${users.length} akun, ${monthlyCount} realisasi, ${anggaranList.length} RKAS, & ${sp2bCount} arsip SP2B tersimpan di Firebase${driveUploadedCount ? ` (${driveUploadedCount} PDF di Google Drive)` : ''}.`,
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
// 9. DIRECT FIRESTORE CRUD FOR ALL ENTITIES (BACA & INPUTAN LANGSUNG KE FIREBASE)
// ============================================================================

/**
 * Direktori Publik Sekolah (dapat dibaca tanpa login via point-get /public_directory/schools)
 */
export async function loadPublicDirectoryFromFirestore() {
  await initFirebase();
  if (!db) return [];
  const path = 'public_directory/schools';
  try {
    const snap = await getDoc(doc(db, 'public_directory', 'schools'));
    if (!snap.exists()) return [];
    const d = snap.data();
    return boundedMapToArray(d.itemsMap);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
}

export async function syncPublicDirectoryToFirestore(schools) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  if (!(await isCurrentUserAdmin())) return null;
  const path = 'public_directory/schools';
  const payload = buildPublicDirectoryPayload(schools, auth.currentUser.uid);
  try {
    await setDoc(doc(db, 'public_directory', 'schools'), payload);
    return payload;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

/**
 * Peringkat Publik Bulanan (/public_ranks/{year}_{month})
 */
export async function loadPublicRankFromFirestore(year, monthKey) {
  await initFirebase();
  if (!db) return [];
  const y = Math.max(2020, Math.min(2100, Number(year) || new Date().getFullYear()));
  const m = VALID_MONTHS.includes(monthKey) ? monthKey : 'Jan';
  const path = `public_ranks/${y}_${m}`;
  try {
    const snap = await getDoc(doc(db, 'public_ranks', `${y}_${m}`));
    if (!snap.exists()) return [];
    const d = snap.data();
    return boundedMapToArray(d.rowsMap);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
}

export async function syncPublicRankToFirestore(year, monthKey, monthlyData, schools) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  if (!(await isCurrentUserAdmin())) return null;
  const y = Math.max(2020, Math.min(2100, Number(year) || new Date().getFullYear()));
  const m = VALID_MONTHS.includes(monthKey) ? monthKey : 'Jan';
  const rows = computePublicRankRows(y, m, monthlyData, schools);
  const path = `public_ranks/${y}_${m}`;
  try {
    await setDoc(doc(db, 'public_ranks', `${y}_${m}`), {
      year: y,
      month: m,
      rowsMap: arrayToBoundedMap(rows, 250),
      updatedByUid: auth.currentUser.uid,
      updatedAt: serverTimestamp()
    });
    return rows;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

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
    if (snap.empty) return [];
    const list = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d && d.no != null) list.push(d);
    });
    list.sort((a, b) => Number(a.no) - Number(b.no));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return null;
  }
}

/**
 * Menyimpan 1 Sekolah lengkap (Admin) langsung ke Firestore (/schools/{no})
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
 * Operator Sekolah / Admin Dinas memperbarui Pejabat (Kepala Sekolah & Bendahara) sesuai aturan security rules
 */
export async function updateSchoolPejabatInFirestore(schoolNo, kepalaSekolah, bendahara, actorName) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) {
    throw new Error('Silakan login dengan akun Google terlebih dahulu.');
  }
  const no = Number(schoolNo);
  if (!Number.isFinite(no) || no < 1 || no > 10000) {
    throw new Error('Nomor sekolah tidak valid.');
  }
  const schoolId = String(no);
  const path = `schools/${schoolId}`;
  const profilDiubah = {
    oleh: cleanStr(actorName || auth.currentUser.email || 'user', 140),
    waktu: new Date().toISOString()
  };
  try {
    await updateDoc(doc(db, 'schools', schoolId), {
      kepalaSekolah: cleanMap(kepalaSekolah || {}, 10),
      bendahara: cleanMap(bendahara || {}, 10),
      profilDiubah,
      updatedByUid: auth.currentUser.uid,
      updatedAt: serverTimestamp()
    });
    return { no, kepalaSekolah, bendahara, profilDiubah };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
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
 * Menautkan UID Operator Sekolah ke seluruh dokumen monthly_reports & anggaran_records milik sekolahnya
 */
export async function linkOperatorUidToSchoolDocs(operatorUid, schoolNo) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return 0;
  if (!operatorUid || String(operatorUid).startsWith('user_')) return 0;
  const scNo = Number(schoolNo);
  if (!Number.isFinite(scNo) || scNo < 1) return 0;
  if (!(await isCurrentUserAdmin())) return 0;

  let linked = 0;
  const [mSnap, aSnap] = await Promise.all([
    getDocs(query(collection(db, 'monthly_reports'), where('schoolNo', '==', scNo))),
    getDocs(query(collection(db, 'anggaran_records'), where('schoolNo', '==', scNo)))
  ]);

  const refs = [];
  mSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const list = Array.isArray(d.allowedUids) ? d.allowedUids : [];
    if (d.ownerUid !== operatorUid && !list.includes(operatorUid) && list.length < 10) {
      refs.push(docSnap.ref);
    }
  });
  aSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const list = Array.isArray(d.allowedUids) ? d.allowedUids : [];
    if (d.ownerUid !== operatorUid && !list.includes(operatorUid) && list.length < 10) {
      refs.push(docSnap.ref);
    }
  });

  const BATCH_SIZE = 300;
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((r) => batch.update(r, { allowedUids: arrayUnion(operatorUid), updatedAt: serverTimestamp() }));
    await batch.commit();
    linked += chunk.length;
  }
  return linked;
}

async function upsertAccountInviteDoc({ emailLower, username, name, role, jabatan, npsn, schoolNo, whatsapp, status, userDocId }) {
  if (!emailLower || !auth || !auth.currentUser) return;
  const invRef = doc(db, 'account_invites', emailLower);
  const cleanRole = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(role) ? role : 'Operator Sekolah';
  const cleanStatus = ['Pending', 'Aktif', 'Ditolak'].includes(status) ? status : 'Pending';
  const cleanSchoolNo = cleanRole === 'Operator Sekolah' ? Math.max(0, Math.min(10000, Number(schoolNo) || 0)) : 0;
  const existing = await getDoc(invRef);
  const baseFields = {
    email: emailLower,
    username: cleanStr(username || emailLower.split('@')[0], 80, 'user'),
    name: cleanStr(name || emailLower.split('@')[0], 140, 'Pengguna'),
    ...(whatsapp ? { whatsapp: cleanStr(whatsapp, 30) } : {}),
    role: cleanRole,
    ...(jabatan ? { jabatan: cleanStr(jabatan, 120) } : {}),
    schoolNo: cleanSchoolNo,
    ...(cleanRole === 'Operator Sekolah' && npsn ? { npsn: cleanStr(npsn, 20) } : { npsn: '' }),
    status: cleanStatus,
    ...(userDocId ? { userDocId: cleanStr(userDocId, 128) } : {}),
    invitedByUid: safeId(auth.currentUser.uid),
    updatedAt: serverTimestamp()
  };
  if (existing.exists()) {
    await setDoc(invRef, {
      ...baseFields,
      invitedByUid: existing.data().invitedByUid || safeId(auth.currentUser.uid),
      createdAt: existing.data().createdAt || serverTimestamp()
    });
  } else {
    await setDoc(invRef, {
      ...baseFields,
      createdAt: serverTimestamp()
    });
  }
}

/**
 * Memuat daftar User dari Firestore (/users)
 */
export async function loadUsersFromFirestore() {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const uid = safeId(auth.currentUser.uid);
  const path = 'users';
  try {
    const isAdmin = await isCurrentUserAdmin();
    const q = isAdmin
      ? query(collection(db, 'users'))
      : query(collection(db, 'users'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return [];
    const byEmail = new Map();
    const list = [];
    const staleInviteIds = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (!d || !d.username) return;
      const item = normalizeUserDoc(docSnap.id, d);
      const em = String(item.email || '').trim().toLowerCase();
      if (em) {
        const prev = byEmail.get(em);
        if (!prev) {
          byEmail.set(em, item);
        } else {
          const itemReal = isRealFirebaseUid(item.docId);
          const prevReal = isRealFirebaseUid(prev.docId);
          if (itemReal && !prevReal) {
            staleInviteIds.push(prev.docId);
            byEmail.set(em, item);
          } else if (!itemReal && prevReal) {
            staleInviteIds.push(item.docId);
          } else {
            list.push(item);
          }
        }
      } else {
        list.push(item);
      }
    });
    if (isAdmin && staleInviteIds.length > 0) {
      staleInviteIds.forEach((id) => {
        deleteDoc(doc(db, 'users', id)).catch(() => {});
      });
    }
    return [...byEmail.values(), ...list];
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return null;
  }
}

/**
 * Menyimpan/Memperbarui 1 User langsung ke Firestore
 */
export async function saveUserToFirestore(u) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !u) return null;
  const isAdmin = await isCurrentUserAdmin();
  const emailLower = cleanStr(u.email || '', 160).toLowerCase();
  const docId = safeId(u.docId || (isRealFirebaseUid(u.uid) ? u.uid : (emailLower ? `invite_${emailLower}` : `user_${String(u.username || '').toLowerCase()}`)));
  const path = `users/${docId}`;
  const role = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(u.role) ? u.role : 'Operator Sekolah';
  const reqRole = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(u.requestedRole) ? u.requestedRole : role;
  const status = ['Pending', 'Aktif', 'Ditolak'].includes(u.status) ? u.status : 'Pending';
  const cleanSchoolNo = role === 'Operator Sekolah' ? Math.max(0, Math.min(10000, Number(u.schoolNo) || 0)) : 0;

  try {
    const ref = doc(db, 'users', docId);
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const prev = existingSnap.data();
      const patch = {
        name: cleanStr(u.name || u.username || prev.name, 140),
        ...(u.username ? { username: cleanStr(u.username, 80) } : {}),
        role,
        requestedRole: reqRole,
        status,
        schoolNo: cleanSchoolNo,
        npsn: role === 'Operator Sekolah' ? cleanStr(u.npsn !== undefined ? u.npsn : (prev.npsn || ''), 20) : '',
        ...(u.jabatan !== undefined ? { jabatan: cleanStr(u.jabatan, 120) } : {}),
        ...(u.whatsapp !== undefined ? { whatsapp: cleanStr(u.whatsapp, 30) } : {}),
        ...(emailLower ? { email: emailLower } : {}),
        updatedAt: serverTimestamp()
      };
      await updateDoc(ref, patch);
    } else {
      const payload = {
        uid: cleanStr(u.uid || docId, 128, docId),
        username: cleanStr(u.username || (emailLower ? emailLower.split('@')[0] : docId), 80),
        name: cleanStr(u.name || u.username || docId, 140),
        ...(emailLower ? { email: emailLower } : {}),
        ...(u.whatsapp ? { whatsapp: cleanStr(u.whatsapp, 30) } : {}),
        role,
        requestedRole: reqRole,
        ...(u.jabatan ? { jabatan: cleanStr(u.jabatan, 120) } : {}),
        schoolNo: cleanSchoolNo,
        npsn: role === 'Operator Sekolah' ? cleanStr(u.npsn || '', 20) : '',
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(ref, payload);
    }

    if (isAdmin && emailLower) {
      if (!isRealFirebaseUid(docId)) {
        await upsertAccountInviteDoc({
          emailLower,
          username: u.username || emailLower.split('@')[0],
          name: u.name || u.username || emailLower.split('@')[0],
          role,
          jabatan: u.jabatan || '',
          npsn: u.npsn || '',
          schoolNo: cleanSchoolNo,
          whatsapp: u.whatsapp || '',
          status,
          userDocId: docId
        });
      } else {
        const targetUid = safeId(docId);
        const adminRef = doc(db, 'admins', targetUid);
        if (status === 'Aktif' && (role === 'Admin Dinas' || role === 'BUD')) {
          const admSnap = await getDoc(adminRef);
          if (admSnap.exists()) {
            if (!isBootstrappedAdminEmail(emailLower)) {
              await updateDoc(adminRef, { email: emailLower, role });
            }
          } else {
            await setDoc(adminRef, {
              uid: targetUid,
              email: emailLower,
              role,
              createdAt: serverTimestamp()
            });
          }
        } else if (!isBootstrappedAdminEmail(emailLower)) {
          const admSnap = await getDoc(adminRef);
          if (admSnap.exists()) {
            await deleteDoc(adminRef).catch(() => {});
          }
        }
      }
    }

    if (status === 'Aktif' && role === 'Operator Sekolah' && cleanSchoolNo > 0 && isRealFirebaseUid(docId)) {
      await linkOperatorUidToSchoolDocs(docId, cleanSchoolNo).catch(() => {});
    }

    const updatedSnap = await getDoc(ref);
    return updatedSnap.exists() ? normalizeUserDoc(updatedSnap.id, updatedSnap.data()) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

export async function registerAccountByAdmin({ email, name, username, role, jabatan, npsn, schoolNo, whatsapp, status }) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) {
    throw new Error('Silakan login terlebih dahulu.');
  }
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    throw new Error('Hanya Administrator Dinas yang dapat mendaftarkan akun baru.');
  }
  const emailLower = String(email || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(emailLower)) {
    throw new Error('Format alamat email Google tidak valid.');
  }
  const cleanName = cleanStr(name || '', 140);
  if (!cleanName) {
    throw new Error('Nama lengkap wajib diisi.');
  }
  const cleanRole = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(role) ? role : 'Operator Sekolah';
  const cleanStatus = ['Aktif', 'Pending'].includes(status) ? status : 'Aktif';
  const cleanUsername = cleanStr(username || emailLower.split('@')[0], 80, 'user');
  const cleanWa = cleanStr(whatsapp || '', 30);
  const cleanJabatan = cleanStr(jabatan || '', 120);
  const cleanNpsn = cleanRole === 'Operator Sekolah' ? cleanStr(npsn || '', 20) : '';
  const cleanSchoolNo = cleanRole === 'Operator Sekolah' ? Math.max(0, Math.min(10000, Number(schoolNo) || 0)) : 0;

  if (cleanRole === 'Operator Sekolah' && (!cleanNpsn || cleanSchoolNo < 1)) {
    throw new Error('Untuk akun Operator Sekolah, pilih sekolah atau masukkan NPSN yang valid.');
  }

  let existingRealDoc = null;
  try {
    const q = query(collection(db, 'users'), where('email', '==', emailLower));
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      if (isRealFirebaseUid(docSnap.id)) {
        existingRealDoc = normalizeUserDoc(docSnap.id, docSnap.data());
      }
    });
  } catch (_) {}

  if (existingRealDoc) {
    if (isBootstrappedAdminEmail(emailLower)) {
      throw new Error('Akun Admin Utama tidak dapat diubah perannya melalui form pendaftaran.');
    }
    const updated = await saveUserToFirestore({
      ...existingRealDoc,
      name: cleanName,
      username: cleanUsername,
      email: emailLower,
      role: cleanRole,
      requestedRole: cleanRole,
      jabatan: cleanJabatan,
      npsn: cleanNpsn,
      schoolNo: cleanSchoolNo,
      ...(cleanWa ? { whatsapp: cleanWa } : {}),
      status: cleanStatus
    });
    await upsertAccountInviteDoc({
      emailLower,
      username: cleanUsername,
      name: cleanName,
      role: cleanRole,
      jabatan: cleanJabatan,
      npsn: cleanNpsn,
      schoolNo: cleanSchoolNo,
      whatsapp: cleanWa,
      status: cleanStatus,
      userDocId: existingRealDoc.docId
    }).catch(() => {});
    return updated;
  }

  const inviteDocId = safeId(`invite_${emailLower}`);
  const created = await saveUserToFirestore({
    docId: inviteDocId,
    uid: inviteDocId,
    username: cleanUsername,
    name: cleanName,
    email: emailLower,
    whatsapp: cleanWa,
    role: cleanRole,
    requestedRole: cleanRole,
    jabatan: cleanJabatan,
    schoolNo: cleanSchoolNo,
    npsn: cleanNpsn,
    status: cleanStatus
  });
  return created;
}

export async function approveUserInFirestore(targetUser, roleOverride) {
  if (!targetUser) return null;
  const nextRole = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(roleOverride)
    ? roleOverride
    : (['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(targetUser.requestedRole)
        ? targetUser.requestedRole
        : (targetUser.role || 'Operator Sekolah'));
  return saveUserToFirestore({ ...targetUser, role: nextRole, requestedRole: nextRole, status: 'Aktif' });
}

export async function rejectUserInFirestore(targetUser) {
  if (!targetUser) return null;
  return saveUserToFirestore({ ...targetUser, status: 'Ditolak' });
}

export async function updateUserRoleInFirestore(targetUser, newRole) {
  if (!targetUser) return null;
  const nextRole = ['Operator Sekolah', 'Admin Dinas', 'BUD'].includes(newRole)
    ? newRole
    : (targetUser.role || 'Operator Sekolah');
  return saveUserToFirestore({ ...targetUser, role: nextRole, requestedRole: nextRole });
}

export async function updateUserWhatsappInFirestore(targetUser, whatsapp) {
  if (!targetUser) return null;
  return saveUserToFirestore({ ...targetUser, whatsapp });
}

/**
 * Menghapus 1 User langsung dari Firestore
 */
export async function deleteUserFromFirestore(target) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser || !target) return false;
  const isAdmin = await isCurrentUserAdmin();
  const docId = typeof target === 'object'
    ? safeId(target.docId || (isRealFirebaseUid(target.uid) ? target.uid : (target.email ? `invite_${String(target.email).trim().toLowerCase()}` : `user_${String(target.username || '').toLowerCase()}`)))
    : safeId(String(target).startsWith('user_') || String(target).startsWith('invite_') ? target : `user_${String(target).toLowerCase()}`);
  const path = `users/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', docId));
    if (isAdmin && typeof target === 'object') {
      if (isRealFirebaseUid(target.uid) && !isBootstrappedAdminEmail(target.email)) {
        await deleteDoc(doc(db, 'admins', safeId(target.uid))).catch(() => {});
      }
      if (target.email && !isBootstrappedAdminEmail(target.email)) {
        await deleteDoc(doc(db, 'account_invites', String(target.email).trim().toLowerCase())).catch(() => {});
      }
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

/**
 * Memuat data realisasi bulanan dari Firestore (/monthly_reports)
 * Single-field queries only (no composite index required)
 */
export async function loadMonthlyFromFirestore(year) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const uid = safeId(auth.currentUser.uid);
  const y = Number(year);
  const path = 'monthly_reports';

  try {
    const isAdmin = await isCurrentUserAdmin();
    const snaps = isAdmin
      ? [await getDocs(query(collection(db, 'monthly_reports'), where('year', '==', y)))]
      : await Promise.all([
          getDocs(query(collection(db, 'monthly_reports'), where('ownerUid', '==', uid))),
          getDocs(query(collection(db, 'monthly_reports'), where('allowedUids', 'array-contains', uid)))
        ]);

    const seen = new Map();
    for (const snap of snaps) {
      snap.forEach((docSnap) => {
        seen.set(docSnap.id, docSnap.data());
      });
    }

    const out = {};
    for (const d of seen.values()) {
      if (Number(d.year) !== y) continue;
      const no = String(d.schoolNo);
      if (!out[no]) out[no] = {};
      out[no][d.month] = d;
    }
    return out;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return null;
  }
}

/**
 * Memuat seluruh state aplikasi (schools, users, monthlyData, sp2bKab) langsung dari Firestore
 */
export async function loadAllDataFromFirestore(year) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const isAdmin = await isCurrentUserAdmin();
  const [schools, users, monthlyData, sp2bKab] = await Promise.all([
    loadSchoolsFromFirestore(),
    loadUsersFromFirestore(),
    loadMonthlyFromFirestore(year),
    isAdmin ? loadSp2bKabFromFirestore(year) : Promise.resolve(null)
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

  const uid = safeId(auth.currentUser.uid);
  const year = Math.max(2020, Math.min(2100, Number(payload.year) || 2026));
  const isAdmin = await isCurrentUserAdmin();
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
        const ref = doc(db, 'monthly_reports', reportId);

        if (!isAdmin) {
          const existingSnap = await getDoc(ref);
          if (existingSnap.exists()) {
            ops.push({
              type: 'update',
              ref,
              data: buildMonthlyReportOperatorUpdatePayload(mData),
              path: `monthly_reports/${reportId}`
            });
          } else {
            ops.push({
              type: 'set',
              ref,
              data: buildMonthlyReportFirestorePayload(year, schoolNo, monthKey, mData, uid, [uid]),
              path: `monthly_reports/${reportId}`
            });
          }
        } else {
          ops.push({
            type: 'set',
            ref,
            data: buildMonthlyReportFirestorePayload(year, schoolNo, monthKey, mData, uid),
            path: `monthly_reports/${reportId}`
          });
        }
      }
    }
  }

  if (Array.isArray(payload.schools) && isAdmin) {
    for (const s of payload.schools) {
      if (!s || !s.no) continue;
      const schoolId = String(Number(s.no));
      ops.push({
        type: 'set',
        ref: doc(db, 'schools', schoolId),
        data: buildSchoolFirestorePayload(s, uid),
        path: `schools/${schoolId}`
      });
    }
    ops.push({
      type: 'set',
      ref: doc(db, 'public_directory', 'schools'),
      data: buildPublicDirectoryPayload(payload.schools, uid),
      path: 'public_directory/schools'
    });
  }

  if (Array.isArray(payload.users) && isAdmin) {
    for (const u of payload.users) {
      if (!u || !u.username) continue;
      await saveUserToFirestore(u);
    }
  }

  const BATCH_SIZE = 300;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      if (item.type === 'update') batch.update(item.ref, item.data);
      else batch.set(item.ref, item.data);
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
  const uid = safeId(auth.currentUser.uid);
  const y = Number(year);
  const path = 'anggaran_records';

  try {
    const isAdmin = await isCurrentUserAdmin();
    const snaps = isAdmin
      ? [await getDocs(query(collection(db, 'anggaran_records'), where('year', '==', y)))]
      : await Promise.all([
          getDocs(query(collection(db, 'anggaran_records'), where('ownerUid', '==', uid))),
          getDocs(query(collection(db, 'anggaran_records'), where('allowedUids', 'array-contains', uid)))
        ]);

    const seen = new Map();
    for (const snap of snaps) {
      snap.forEach((docSnap) => {
        seen.set(docSnap.id, docSnap.data());
      });
    }

    const out = {};
    for (const d of seen.values()) {
      if (Number(d.year) !== y) continue;
      if (filterSchoolNo != null && Number(d.schoolNo) !== Number(filterSchoolNo)) continue;
      const hydrated = hydrateAnggaranFromFirestoreDoc(d);
      const no = String(d.schoolNo);
      if (!out[no]) out[no] = {};
      if (!out[no][d.tahap]) out[no][d.tahap] = {};
      const { items, itemsMap, warningsMap, blockingMap, ...stripped } = hydrated;
      out[no][d.tahap][d.sumber] = stripped;
    }
    return out;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
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
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

/**
 * Menyimpan dokumen Anggaran RKAS (termasuk itemsMap, warningsMap, blockingMap) ke Firestore
 * Mengikuti aturan affectedKeys Firestore untuk Operator Sekolah pada dokumen Draft/Ditolak
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
  const ref = doc(db, 'anggaran_records', recordId);
  const uid = safeId(auth.currentUser.uid);
  const isAdmin = await isCurrentUserAdmin();

  const fullDoc = buildAnggaranFirestorePayload(rec, uid);

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      if (isAdmin) {
        const prev = existingSnap.data();
        const mergedAllowed = Array.isArray(prev.allowedUids) ? prev.allowedUids : fullDoc.allowedUids;
        const adminDoc = {
          ...fullDoc,
          ownerUid: prev.ownerUid || fullDoc.ownerUid,
          ...(mergedAllowed && mergedAllowed.length ? { allowedUids: mergedAllowed } : {})
        };
        await setDoc(ref, adminDoc);
        return hydrateAnggaranFromFirestoreDoc(adminDoc);
      } else {
        const updatePayload = {
          fileName: fullDoc.fileName,
          fileUrl: fullDoc.fileUrl,
          ...(fullDoc.driveFileId ? { driveFileId: fullDoc.driveFileId } : {}),
          totals: fullDoc.totals,
          ...(fullDoc.meta ? { meta: fullDoc.meta } : {}),
          itemsMap: fullDoc.itemsMap,
          warningsMap: fullDoc.warningsMap,
          blockingMap: fullDoc.blockingMap,
          ...(fullDoc.basis ? { basis: fullDoc.basis } : {}),
          ...(fullDoc.stats ? { stats: fullDoc.stats } : {}),
          uploadedAt: fullDoc.uploadedAt,
          uploadedBy: fullDoc.uploadedBy,
          itemCount: fullDoc.itemCount,
          canSubmit: fullDoc.canSubmit,
          hasBlocking: fullDoc.hasBlocking,
          status: 'Draft',
          catatan: cleanStr(rec.catatan || '', 500),
          updatedAt: serverTimestamp()
        };
        await updateDoc(ref, updatePayload);
        const refreshed = await getDoc(ref);
        return refreshed.exists() ? hydrateAnggaranFromFirestoreDoc(refreshed.data()) : hydrateAnggaranFromFirestoreDoc(fullDoc);
      }
    } else {
      if (!isAdmin) {
        fullDoc.status = 'Draft';
        fullDoc.ownerUid = uid;
      }
      await setDoc(ref, fullDoc);
      return hydrateAnggaranFromFirestoreDoc(fullDoc);
    }
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
  const ref = doc(db, 'anggaran_records', recordId);

  if (action === 'delete') {
    try {
      await deleteDoc(ref);
      return { deleted: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
      return null;
    }
  }

  const current = await loadAnggaranDetailFromFirestore(year, schoolNo, tahap, sumber);
  if (!current) return null;

  try {
    if (action === 'reclass' && Array.isArray(overrides)) {
      const items = Array.isArray(current.items) ? current.items.map((x) => ({ ...x })) : [];
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
      await updateDoc(ref, {
        itemsMap: arrayToBoundedMap(items, 500),
        totals,
        status: current.status === 'Ditolak' ? 'Draft' : current.status,
        updatedAt: serverTimestamp()
      });
    } else if (action === 'submit') {
      if (current.canSubmit === false || (current.blockingErrors && current.blockingErrors.length > 0)) {
        const err = new Error('Dokumen tidak dapat diajukan karena gagal validasi identitas/sumber dana.');
        err.blockingErrors = current.blockingErrors || [];
        throw err;
      }
      await updateDoc(ref, {
        status: 'Diajukan',
        catatan: '',
        submittedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });
    } else if (action === 'verify') {
      await updateDoc(ref, {
        status: 'Terverifikasi',
        verifiedAt: new Date().toISOString(),
        verifiedBy: cleanStr(username || auth.currentUser.email || 'admin', 160),
        catatan: cleanStr(catatan || '', 500),
        updatedAt: serverTimestamp()
      });
    } else if (action === 'reject') {
      await updateDoc(ref, {
        status: 'Ditolak',
        verifiedAt: new Date().toISOString(),
        verifiedBy: cleanStr(username || auth.currentUser.email || 'admin', 160),
        catatan: cleanStr(catatan || '', 500),
        updatedAt: serverTimestamp()
      });
    } else if (action === 'reopen') {
      await updateDoc(ref, {
        status: 'Draft',
        verifiedAt: '',
        verifiedBy: '',
        catatan: cleanStr(catatan || 'Dibuka kembali oleh Admin Dinas', 500),
        updatedAt: serverTimestamp()
      });
    }

    const refreshed = await loadAnggaranDetailFromFirestore(year, schoolNo, tahap, sumber);
    return { status: 'success', record: refreshed || current };
  } catch (err) {
    if (err && err.blockingErrors) throw err;
    handleFirestoreError(err, OperationType.UPDATE, path);
    return null;
  }
}

export async function deleteAnggaranRecordFromFirestore(year, schoolNo, tahap, sumber, driveFileId, fileName, skipConfirm = false) {
  await initFirebase();
  if (driveFileId) {
    try {
      await deleteFileFromGoogleDrive(driveFileId, fileName || `RKAS ${sumber} ${tahap}`, skipConfirm);
    } catch (e) {
      console.warn('Hapus Drive file saat hapus RKAS:', e);
    }
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
  if (!(await isCurrentUserAdmin())) return null;
  const yearId = String(Math.max(2020, Math.min(2100, Number(year) || 2026)));
  const path = `sp2b_kab/${yearId}`;
  try {
    const snap = await getDoc(doc(db, 'sp2b_kab', yearId));
    if (!snap.exists()) return { records: {}, last: {} };
    const d = snap.data();
    return { records: d.records || {}, last: d.last || {} };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
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
  const logId = `${Date.now()}_${safeId(auth.currentUser.uid).slice(0, 12)}`;
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      action: cleanStr(action || 'activity', 80, 'activity'),
      userUid: auth.currentUser.uid,
      username: cleanStr((appUser && (appUser.username || appUser.email)) || auth.currentUser.email || 'user', 160, 'user'),
      role: cleanStr((appUser && appUser.role) || 'Operator Sekolah', 40, 'Operator Sekolah'),
      detail: cleanStr(typeof detail === 'string' ? detail : JSON.stringify(detail || {}), 500, '{}'),
      createdAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function loadAuditLogsFromFirestore(limitCount = 150, actionFilter = '') {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) return null;
  const uid = safeId(auth.currentUser.uid);
  const path = 'audit_logs';
  try {
    const isAdmin = await isCurrentUserAdmin();
    const q = isAdmin
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
    handleFirestoreError(err, OperationType.LIST, path);
    return null;
  }
}

export async function downloadFirestoreBackupJson(year) {
  await initFirebase();
  if (!db || !auth || !auth.currentUser) {
    throw new Error('Silakan login dengan akun Google Admin terlebih dahulu.');
  }
  const y = Number(year) || new Date().getFullYear();
  const [schools, users, monthlyData, anggaran, sp2bKab, auditLogs] = await Promise.all([
    loadSchoolsFromFirestore(),
    loadUsersFromFirestore(),
    loadMonthlyFromFirestore(y),
    loadAnggaranFromFirestore(y),
    loadSp2bKabFromFirestore(y),
    loadAuditLogsFromFirestore(300)
  ]);

  const backupObj = {
    exportedAt: new Date().toISOString(),
    source: 'Firebase Cloud Firestore',
    databaseId: FIRESTORE_DATABASE_ID,
    year: y,
    schools: schools || [],
    users: users || [],
    monthlyData: monthlyData || {},
    anggaran: anggaran || {},
    sp2bKab: sp2bKab || { records: {}, last: {} },
    auditLogs: (auditLogs && auditLogs.items) || []
  };

  const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sigap-bosp-firebase-backup-TA${y}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return backupObj;
}

// ============================================================================
// 10. UI COMPONENTS (.gsi-material-button & CLOUD STATUS + MIGRATION BAR)
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
      <span class="gsi-material-button-contents">Sign in with Google</span>
    </div>
  `;
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
      signInWithGoogle({ loginToApp: false, forceMigrate: false, promptSelectAccount: false })
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
          showDriveToast('Gagal menghubungkan Google Drive: ' + msg, 'err');
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
      signInWithGoogle({ loginToApp: true, forceMigrate: false, promptSelectAccount: true })
        .catch((err) => {
          const msg = (err && err.message) || String(err);
          setMigrationFeedback(lastMigrationSummary, msg);
          updateCloudStatusUI();
          showDriveToast('Gagal mengganti akun Google: ' + msg, 'err');
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
          try { await ensureGoogleDriveToken(); } catch (_) {}
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
        showDriveToast('Gagal menjalankan migrasi: ' + msg, 'err');
      } finally {
        btnMigrate.disabled = false;
      }
    });
  }
}

export function updateCloudStatusUI() {
  const fbUser = auth ? auth.currentUser : null;
  const userEmail = String((fbUser && fbUser.email) || '');
  const isBootAdmin = isBootstrappedAdminEmail(userEmail);
  const driveReady = !!(fbUser && cachedAccessToken);

  const errHtml = lastMigrationError
    ? `<div class="w-full mt-1 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium"><i class="fa-solid fa-circle-exclamation mr-1"></i><b>Info:</b> <span class="sigap-cloud-err"></span></div>`
    : '';
  const summaryHtml = (!lastMigrationError && lastMigrationSummary && lastMigrationSummary.schools)
    ? `<span class="text-[11px] text-emerald-700 font-semibold">✓ ${lastMigrationSummary.schools} sekolah · ${lastMigrationSummary.monthlyReports} realisasi · ${lastMigrationSummary.anggaranRecords} RKAS di Firestore</span>`
    : '';

  const bar = document.getElementById('sigapCloudStatusBar');
  if (bar) {
    if (isMigrating) {
      bar.innerHTML = `
        <div class="flex items-center gap-2.5 text-xs">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
            <i class="fa-solid fa-spinner fa-spin text-indigo-600"></i> Memindahkan Database ke Firebase &amp; Google Drive…
          </span>
          <span class="text-slate-700 font-medium">${migrationProgressText || 'Sedang memproses…'}</span>
        </div>
      `;
    } else if (driveReady) {
      bar.innerHTML = `
        <div class="flex items-center gap-2.5 text-xs flex-wrap">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
            <i class="fa-solid fa-cloud-check text-emerald-600"></i> Firebase Firestore &amp; Google Drive Aktif
          </span>
          <span class="text-slate-600">Terhubung sebagai <b>${userEmail || fbUser.displayName}</b></span>
          ${summaryHtml}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${isBootAdmin ? `<button type="button" id="btnMigrateJsonTop" class="px-2.5 py-1.5 rounded-lg bg-[#0F2C59] hover:bg-slate-800 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"><i class="fa-solid fa-cloud-arrow-up"></i> Sinkron Ulang JSON/PDF</button>` : ''}
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
            <i class="fa-solid fa-database text-amber-600"></i> Firebase Firestore Aktif (${userEmail})
          </span>
          <span class="text-slate-600">Klik tombol di samping untuk mengaktifkan izin unggah PDF ke Google Drive.</span>
          ${summaryHtml}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${isBootAdmin ? `<button type="button" id="btnMigrateJsonTop" class="px-2.5 py-1.5 rounded-lg bg-[#0F2C59] hover:bg-slate-800 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"><i class="fa-solid fa-cloud-arrow-up"></i> Sinkron JSON ke Firestore</button>` : ''}
          <div style="width:210px">
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
            <i class="fa-brands fa-google-drive text-blue-600"></i> Firebase Firestore &amp; Google Drive
          </span>
          <span class="text-slate-600">Masuk dengan akun Google Anda untuk mengakses database &amp; mengunggah berkas PDF.</span>
        </div>
        <div style="width:210px">
          <button type="button" id="btnConnectDriveTop" class="gsi-material-button" style="height:36px;font-size:12px">
            ${getGoogleButtonSvg()}
          </button>
        </div>
        ${errHtml}
      `;
    }
    const errSpan = bar.querySelector('.sigap-cloud-err');
    if (errSpan) errSpan.textContent = lastMigrationError;
    bindMigrationHandlers('Top');
  }

  const authStatus = document.getElementById('sigapAuthCloudStatus');
  if (authStatus) {
    if (isMigrating) {
      authStatus.classList.remove('hidden');
      authStatus.innerHTML = `<div class="px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-medium"><i class="fa-solid fa-spinner fa-spin mr-1"></i><span data-as-msg></span></div>`;
      authStatus.querySelector('[data-as-msg]').textContent = migrationProgressText || 'Memigrasikan database ke Firebase…';
    } else if (lastMigrationError) {
      authStatus.classList.remove('hidden');
      authStatus.innerHTML = `<div class="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium leading-relaxed"><i class="fa-solid fa-circle-exclamation mr-1"></i><span data-as-msg></span></div>`;
      authStatus.querySelector('[data-as-msg]').textContent = lastMigrationError;
    } else {
      authStatus.classList.add('hidden');
      authStatus.innerHTML = '';
    }
  }
}

// ============================================================================
// 11. EXPORT GLOBAL BRIDGE FOR EXISTING SCRIPTS (app.js, penganggaran.js, pejabat.js)
// ============================================================================
window.SigapFirebaseDrive = {
  initFirebase,
  whenReady,
  isFirebaseAuthenticated,
  isBootstrappedAdminUser,
  isCurrentUserAdmin,
  resolveCurrentUserSession,
  getCurrentFirestoreUser,
  completePendingUserProfile,
  signInWithGoogle,
  clearGoogleAuthFeedback,
  signOutFirebase,
  ensureGoogleDriveToken,
  getFirebaseIdToken,
  getGoogleAccessTokenInMemory,
  showDriveToast,
  showDriveConfirmModal,
  showDrivePromptModal,
  uploadPdfToGoogleDrive,
  deleteFileFromGoogleDrive,
  migrateJsonDatabaseToFirebase,
  autoMigrateJsonDatabaseIfNeeded,
  loadPublicDirectoryFromFirestore,
  syncPublicDirectoryToFirestore,
  loadPublicRankFromFirestore,
  syncPublicRankToFirestore,
  loadAllDataFromFirestore,
  loadSchoolsFromFirestore,
  syncSchoolToFirestore,
  updateSchoolPejabatInFirestore,
  deleteSchoolFromFirestore,
  linkOperatorUidToSchoolDocs,
  loadUsersFromFirestore,
  saveUserToFirestore,
  registerAccountByAdmin,
  approveUserInFirestore,
  rejectUserInFirestore,
  updateUserRoleInFirestore,
  updateUserWhatsappInFirestore,
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
  downloadFirestoreBackupJson,
  updateCloudStatusUI
};

initFirebase().catch((e) => console.error('Firebase init error:', e));
