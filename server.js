/**
 * Server Node.js — Dashboard Rekonsiliasi Dana BOSP
 * VERSI JSON + SECURE (tanpa MySQL)
 * - Password bcrypt, JWT cookie, RBAC, rate limit, helmet
 * - Data: folder data/*.json
 * - Upload PDF: folder uploads/{sekolah}/{tahun-bulan}/
 */
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ORIGIN = process.env.CORS_ORIGIN || false;
const FIRESTORE_DATABASE_ID = "ai-studio-sigapbosp-295b56ae-42fb-402e-a2e5-e08e50d341ab";

if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET tidak di-set di .env — session hilang saat restart.");
}

// Tidak melakukan write/seed JSON otomatis saat startup: seluruh database dikelola di Firebase Firestore.

const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: false,
}));
app.use(cors({
  origin: CORS_ORIGIN || (NODE_ENV === "production" ? false : true),
  credentials: true,
}));
app.use(express.json({ limit: "30mb" }));
app.use(express.text({ type: ["text/plain", "text/*"], limit: "30mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders(res, filePath) {
    if (/\.(html|js|css|json)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  },
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Terlalu banyak percobaan login. Coba lagi nanti." },
});

// ---------- JSON helpers ----------
function readJson(file, fallback) {
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  // Atomic write: tulis ke file sementara lalu rename (mencegah korupsi saat crash / concurrent)
  const full = path.join(DATA_DIR, file);
  const tmp = full + ".tmp." + process.pid + "." + Date.now();
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, full);
  } catch (err) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
}
function parseBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}
function getSchools() { return readJson("schools.json", []); }
function setSchools(list) { writeJson("schools.json", list); }
function getUsers() { return readJson("users.json", []); }
function setUsers(list) { writeJson("users.json", list); }
function monthlyFile(year) { return `monthly_${year}.json`; }
function getMonthly(year) { return readJson(monthlyFile(year), {}); }
function setMonthly(year, data) { writeJson(monthlyFile(year), data); }

function mergeMonthly(year, incoming) {
  const cur = getMonthly(year);
  for (const [no, months] of Object.entries(incoming || {})) {
    if (!cur[no]) cur[no] = {};
    for (const [m, payload] of Object.entries(months || {})) {
      cur[no][m] = { ...(cur[no][m] || {}), ...(payload || {}) };
    }
  }
  setMonthly(year, cur);
  return cur;
}

function upsertSchools(list) {
  if (!Array.isArray(list)) return getSchools();
  const map = new Map(getSchools().map((s) => [Number(s.no), s]));
  for (const s of list) {
    if (!s || s.no == null) continue;
    const prev = map.get(Number(s.no)) || {};
    map.set(Number(s.no), {
      no: Number(s.no),
      npsn: s.npsn || prev.npsn || "",
      name: s.name || prev.name || "",
      alamat: s.alamat || prev.alamat || "",
      status: String(s.status || prev.status || "NEGERI").toUpperCase(),
      kecamatan: s.kecamatan || prev.kecamatan || "",
      jenjang: s.jenjang || prev.jenjang || "SD",
      // Identitas pejabat hanya boleh diubah lewat /api/school-profile (bukan lewat simpan massal)
      ...(prev.kepalaSekolah ? { kepalaSekolah: prev.kepalaSekolah } : {}),
      ...(prev.bendahara ? { bendahara: prev.bendahara } : {}),
      ...(prev.profilDiubah ? { profilDiubah: prev.profilDiubah } : {}),
    });
  }
  const out = Array.from(map.values()).sort((a, b) => a.no - b.no);
  setSchools(out);
  return out;
}

async function upsertUsers(list) {
  if (!Array.isArray(list)) return getUsers();
  const map = new Map(getUsers().map((u) => [String(u.username).toLowerCase(), u]));
  for (const u of list) {
    if (!u || !u.username) continue;
    const prev = map.get(String(u.username).toLowerCase()) || {};
    let password = prev.password || "";
    if (u.password != null && u.password !== "" && u.password !== prev.password) {
      if (!String(u.password).startsWith("$2")) {
        password = await bcrypt.hash(String(u.password), BCRYPT_ROUNDS);
      } else {
        password = u.password;
      }
    }
    map.set(String(u.username).toLowerCase(), {
      name: u.name || prev.name || u.username,
      username: u.username,
      password,
      role: u.role || prev.role || "Operator Sekolah",
      schoolNo: u.schoolNo ?? u.school_no ?? prev.schoolNo ?? null,
      npsn: u.npsn || prev.npsn || "",
      whatsapp: u.whatsapp || prev.whatsapp || "",
      status: u.status || prev.status || "Pending",
    });
  }
  const out = Array.from(map.values());
  setUsers(out);
  return out;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}
function sanitizeUsers(list) {
  return (list || []).map(sanitizeUser);
}

function requireAuth(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ status: "error", message: "Unauthorized — silakan login" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ status: "error", message: "Token invalid atau expired" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Forbidden — role tidak diizinkan" });
    }
    next();
  };
}

function audit(action, req, detail = {}) {
  try {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      action,
      username: req.user?.username || "anonymous",
      role: req.user?.role || null,
      ip: req.ip || req.headers["x-forwarded-for"] || null,
      ...detail,
    }) + "\n";
    fs.appendFileSync(path.join(DATA_DIR, "audit.log"), line, "utf8");
  } catch (_) {}
}

// ---------- Routes ----------
app.get("/firebase-applet-config.json", (_req, res) => {
  const cfgPath = path.join(__dirname, "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    res.setHeader("Content-Type", "application/json");
    return res.sendFile(cfgPath);
  }
  return res.status(404).json({ status: "error", message: "firebase-applet-config.json not found" });
});

app.get("/api/health", (_req, res) => {
  let fbCfg = {};
  try {
    fbCfg = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));
  } catch (_) {}
  res.json({
    status: "ok",
    version: "2.1.0-firebase-drive",
    storage: "firebase-firestore + google-drive",
    database: "Firebase Cloud Firestore",
    fileStorage: "Google Drive",
    firebaseProjectId: fbCfg.projectId || "sigapbosp",
    firestoreDatabaseId: fbCfg.firestoreDatabaseId || FIRESTORE_DATABASE_ID,
    legacyJsonAvailable: fs.existsSync(path.join(DATA_DIR, "schools.json")),
    time: new Date().toISOString(),
  });
});

function disabledStorageHandler(_req, res) {
  return res.status(410).json({
    status: "error",
    message: "Endpoint dinonaktifkan: database dipindahkan ke Firebase Firestore dan file ke Google Drive.",
  });
}


app.get("/api/public/schools", disabledStorageHandler);
app.post("/api/register", disabledStorageHandler);
app.post("/api/login", disabledStorageHandler);

/** Login / Sinkronisasi Sesi Stateless untuk Klien Firebase Google Auth */
app.post("/api/auth/google", loginLimiter, (req, res) => {
  try {
    const body = parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const uid = String(body.uid || "").trim();
    const displayName = String(body.displayName || "").trim();
    if (!email || !uid) {
      return res.status(400).json({ status: "error", message: "Email dan UID Google wajib tersedia." });
    }
    const isBootAdmin = email === "artygigiron98@gmail.com";
    const allowedRoles = ["Admin Dinas", "BUD", "Operator Sekolah"];
    const role = isBootAdmin
      ? "Admin Dinas"
      : allowedRoles.includes(String(body.role || ""))
        ? String(body.role)
        : "Operator Sekolah";
    const username = String(body.username || (isBootAdmin ? "admin" : email.split("@")[0])).trim();
    const name = String(body.name || displayName || (isBootAdmin ? "Administrator Dinas" : username)).trim();
    const schoolNo = body.schoolNo != null && body.schoolNo !== "" ? Number(body.schoolNo) : null;
    const npsn = String(body.npsn || "").trim();

    const userObj = {
      uid,
      email,
      username,
      name,
      role,
      schoolNo: Number.isFinite(schoolNo) ? schoolNo : null,
      npsn,
      status: "Aktif",
    };
    const token = jwt.sign(
      {
        uid: userObj.uid,
        email: userObj.email,
        username: userObj.username,
        role: userObj.role,
        schoolNo: userObj.schoolNo,
        npsn: userObj.npsn,
        name: userObj.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    const isHttps = Boolean(req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https"));
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ status: "success", token, user: userObj });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/logout", (req, res) => {
  const isHttps = Boolean(req.secure || String(req.headers["x-forwarded-proto"] || "").includes("https"));
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
  });
  res.json({ status: "success" });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    status: "success",
    user: {
      uid: req.user.uid || "",
      email: req.user.email || "",
      username: req.user.username || "",
      name: req.user.name || "",
      role: req.user.role || "Operator Sekolah",
      schoolNo: req.user.schoolNo ?? null,
      npsn: req.user.npsn || "",
      status: "Aktif",
    },
  });
});

app.get("/api/data", disabledStorageHandler);
app.post("/api/save", disabledStorageHandler);
app.get("/api/schools", disabledStorageHandler);
app.post("/api/schools", disabledStorageHandler);
app.get("/api/school-profile", disabledStorageHandler);
app.put("/api/school-profile", disabledStorageHandler);
app.delete("/api/schools/:no", disabledStorageHandler);
app.get("/api/users", disabledStorageHandler);
app.post("/api/users", disabledStorageHandler);
app.delete("/api/users/:username", disabledStorageHandler);
app.post("/api/users/:username/reset-password", disabledStorageHandler);
app.post("/api/change-password", disabledStorageHandler);
app.get("/api/sp2b-kab", disabledStorageHandler);
app.post("/api/sp2b-kab", disabledStorageHandler);
app.get("/api/public/rank", disabledStorageHandler);
app.post("/api/upload", disabledStorageHandler);
app.get("/api/file/*", disabledStorageHandler);

// ---------- Upload & path helpers (hanya untuk baca migrasi PDF lokal lama & parser RAM) ----------
function sanitizeFolderPart(str, maxLen) {
  return String(str || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, maxLen || 80) || "unknown";
}
function resolveSafeUploadPath(relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(UPLOAD_DIR, normalized);
  const root = path.resolve(UPLOAD_DIR);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) cb(null, true);
    else cb(new Error("Hanya file PDF yang diizinkan"));
  },
});


// =====================================================================
//  PENGANGGARAN (RKAS ARKAS) — upload PDF, baca otomatis, verifikasi
//  Satu PDF RKAS per sekolah per tahap (Induk/Perubahan) per sumber dana
//  (BOSP Reguler, BOSP Kinerja, BOSP Prestasi, SiLPA BOSP Kinerja) — sumber dana dipilih saat unggah.
//  Data: data/anggaran_{tahun}.json  →  { [schoolNo]: { [tahap]: { [sumber]: record } } }
// =====================================================================
const { parseRkasPdf, sumTotals, KATEGORI: ANG_KATEGORI, SUMBER: ANG_SUMBER, classify: angClassify } = require("./lib/arkas-parser");
const ANG_TAHAP = { induk: "Induk", perubahan: "Perubahan" };
function angFile(year) { return `anggaran_${year}.json`; }
function angRead(year) { return readJson(angFile(year), {}); }
function angWrite(year, data) { writeJson(angFile(year), data); }
function angRecord(db, no, tahap, sumber) {
  return (db[String(no)] && db[String(no)][tahap] && db[String(no)][tahap][sumber]) || null;
}
function angSetRecord(db, no, tahap, sumber, rec) {
  const k = String(no);
  if (!db[k]) db[k] = {};
  if (!db[k][tahap]) db[k][tahap] = {};
  if (rec) db[k][tahap][sumber] = rec; else delete db[k][tahap][sumber];
}
function angStrip(rec) {
  if (!rec) return rec;
  const { items, sampleLines, ...rest } = rec;
  return {
    ...rest,
    itemCount: Array.isArray(items) ? items.length : 0,
    canSubmit: rest.canSubmit !== false && !(Array.isArray(rest.blockingErrors) && rest.blockingErrors.length),
    hasBlocking: Array.isArray(rest.blockingErrors) && rest.blockingErrors.length > 0,
  };
}
function angCheckKeys(year, tahap, sumber) {
  if (!ANG_TAHAP[tahap]) return "Tahap harus 'induk' atau 'perubahan'";
  if (!ANG_SUMBER[sumber]) return "Sumber dana tidak valid";
  if (!year || year < 2000 || year > 2100) return "Tahun tidak valid";
  return null;
}
/** Operator hanya boleh mengakses sekolahnya sendiri */
function angResolveSchoolNo(req, wanted) {
  if (req.user.role === "Operator Sekolah") return Number(req.user.schoolNo);
  return Number(wanted);
}

/**
 * Validasi kesesuaian PDF RKAS dengan identitas sekolah & sumber dana pilihan.
 * Mengembalikan { blocking: string[], warnings: string[] }.
 * blocking = alasan yang MENGHALANGI pengajuan (operator tidak boleh submit).
 */
function angValidateIdentity(school, meta, sumber, tahap, year) {
  const blocking = [];
  const soft = [];
  const m = meta || {};
  const docNpsn = m.npsn ? String(m.npsn).trim() : "";
  const schoolNpsn = school && school.npsn ? String(school.npsn).trim() : "";

  // Identitas sekolah: NPSN wajib cocok bila terbaca di dokumen
  if (docNpsn && schoolNpsn && docNpsn !== schoolNpsn) {
    blocking.push(
      `NPSN pada dokumen (${docNpsn}) tidak sama dengan NPSN sekolah yang dipilih (${schoolNpsn} — ${school.name || ""}). Unggah RKAS milik sekolah yang benar.`
    );
  } else if (!docNpsn) {
    soft.push("NPSN tidak terbaca dari dokumen. Pastikan PDF adalah hasil cetak Lembar RKAS ARKAS yang mencantumkan NPSN.");
  }

  // Nama sekolah (peringatan, bukan blocking keras kecuali NPSN kosong)
  if (m.namaSekolah && school && school.name) {
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    const a = norm(m.namaSekolah);
    const b = norm(school.name);
    if (a && b && a.length > 4 && b.length > 4 && a.indexOf(b.slice(0, Math.min(8, b.length))) === -1 && b.indexOf(a.slice(0, Math.min(8, a.length))) === -1) {
      const msg = `Nama sekolah pada dokumen ("${m.namaSekolah}") tampak berbeda dengan data master ("${school.name}").`;
      if (!docNpsn || (schoolNpsn && docNpsn !== schoolNpsn)) blocking.push(msg + " Periksa kembali file yang diunggah.");
      else soft.push(msg);
    }
  }

  // Sumber dana: jika bagian Penerimaan dokumen menyebut sumber tertentu, harus cocok
  const list = Array.isArray(m.sumberList) ? m.sumberList.filter(Boolean) : [];
  if (sumber && list.length && !list.includes(sumber)) {
    const names = list.map((k) => ANG_SUMBER[k] || k).join(", ");
    blocking.push(
      `Jenis sumber dana tidak sesuai. Dokumen menyebut ${names}, sedangkan Anda memilih ${ANG_SUMBER[sumber] || sumber}. Pilih sumber dana yang sama dengan dokumen, atau unggah PDF untuk sumber dana yang benar.`
    );
  }

  // Tahun anggaran
  if (m.tahun && year && Number(m.tahun) !== Number(year)) {
    blocking.push(
      `Tahun anggaran pada dokumen (${m.tahun}) berbeda dengan tahun aktif (${year}). Unggah RKAS untuk tahun yang benar.`
    );
  }

  // Tahap (Induk/Perubahan) — blocking jika terbaca dan berbeda
  if (m.tahap && tahap && m.tahap !== tahap) {
    blocking.push(
      `Tahap pada dokumen tampak "${ANG_TAHAP[m.tahap] || m.tahap}", tetapi Anda memilih tahap "${ANG_TAHAP[tahap] || tahap}". Sesuaikan pilihan tahap dengan dokumen.`
    );
  }

  return { blocking, soft };
}

/** Stateless PDF RKAS Parser (RAM-only, tanpa penyimpanan JSON atau disk) */
app.post(
  "/api/anggaran/parse",
  (req, res, next) => memUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ status: "error", message: err.message });
    next();
  }),
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ status: "error", message: "File PDF belum dipilih" });
      }
      const buf = req.file.buffer;
      if (buf.slice(0, 5).toString() !== "%PDF-") {
        return res.status(400).json({ status: "error", message: "File bukan PDF valid" });
      }
      const year = Number(req.body.year);
      const tahap = String(req.body.tahap || "");
      const sumber = String(req.body.sumber || "");
      const bad = angCheckKeys(year, tahap, sumber);
      if (bad) return res.status(400).json({ status: "error", message: bad });

      let school = null;
      if (req.body.school) {
        try { school = JSON.parse(String(req.body.school)); } catch (_) {}
      }
      if (!school && req.body.schoolNo != null) {
        const no = Number(req.body.schoolNo);
        school = getSchools().find((s) => Number(s.no) === no) || null;
      }

      let parsed;
      try { parsed = await parseRkasPdf(buf, { sumber }); }
      catch (e) {
        return res.status(422).json({ status: "error", message: "PDF tidak dapat dibaca: " + e.message });
      }

      const idCheck = school
        ? angValidateIdentity(school, parsed.meta || {}, sumber, tahap, year)
        : { blocking: [], soft: [] };
      const warnings = [...(parsed.warnings || []), ...idCheck.soft];
      const blockingErrors = idCheck.blocking.slice();
      if (!parsed.items || !parsed.items.length) {
        blockingErrors.push("Tidak ada baris anggaran yang berhasil dibaca dari PDF. Pastikan file adalah Lembar RKAS hasil cetak ARKAS (bukan scan/foto).");
      }

      res.json({
        status: "success",
        fileName: req.file.originalname || "rkas.pdf",
        items: parsed.items || [],
        totals: parsed.totals || { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 },
        basis: parsed.basis || null,
        meta: parsed.meta || {},
        warnings,
        blockingErrors,
        canSubmit: blockingErrors.length === 0,
        stats: parsed.stats || {},
        sampleLines: parsed.sampleLines || [],
        tahapMap: ANG_TAHAP,
        sumberMap: ANG_SUMBER,
        kategoriMap: ANG_KATEGORI,
      });
    } catch (err) {
      res.status(500).json({ status: "error", message: err.message });
    }
  }
);

app.get("/api/anggaran", disabledStorageHandler);
app.get("/api/anggaran/detail", disabledStorageHandler);
app.post("/api/anggaran/upload", disabledStorageHandler);
app.post("/api/anggaran/action", disabledStorageHandler);
app.get("/api/audit", disabledStorageHandler);
app.get("/api/backup", disabledStorageHandler);

// ---------- Migration Bundle (JSON + Local Uploads -> Firebase Firestore & Google Drive) ----------
async function buildUploadedAnggaranMigrationList(includePdfs = false) {
  const schools = getSchools();
  const out = [];
  if (!fs.existsSync(UPLOAD_DIR)) return out;
  const schoolFolders = fs.readdirSync(UPLOAD_DIR);
  for (const sFolder of schoolFolders) {
    const sPath = path.join(UPLOAD_DIR, sFolder);
    try {
      if (!fs.statSync(sPath).isDirectory()) continue;
    } catch (_) { continue; }
    const npsnMatch = sFolder.match(/^(\d{6,12})_/);
    const npsn = npsnMatch ? npsnMatch[1] : "";
    const school = schools.find((s) => String(s.npsn).trim() === npsn) || schools.find((s) => sFolder.includes(sanitizeFolderPart(s.name, 40)));
    if (!school) continue;

    const subFolders = fs.readdirSync(sPath);
    for (const sub of subFolders) {
      const aMatch = sub.match(/^anggaran-(\d{4})$/);
      if (!aMatch) continue;
      const year = Number(aMatch[1]);
      const aPath = path.join(sPath, sub);
      try {
        if (!fs.statSync(aPath).isDirectory()) continue;
      } catch (_) { continue; }
      const files = fs.readdirSync(aPath).filter((f) => f.toLowerCase().endsWith(".pdf"));
      for (const fname of files) {
        const fMatch = fname.match(/^(induk|perubahan)_(reguler|kinerja|prestasi|silpaKinerja)_(\d+)_(.+)$/);
        if (!fMatch) continue;
        const tahap = fMatch[1];
        const sumber = fMatch[2];
        const origName = fMatch[4];
        const fullFile = path.join(aPath, fname);
        const relativePath = path.join(sFolder, sub, fname).replace(/\\/g, "/");
        try {
          const buf = fs.readFileSync(fullFile);
          const parsed = await parseRkasPdf(buf, { sumber });
          const idCheck = angValidateIdentity(school, parsed.meta || {}, sumber, tahap, year);
          const warnings = [...(parsed.warnings || []), ...idCheck.soft];
          const blockingErrors = idCheck.blocking.slice();
          if (!parsed.items || !parsed.items.length) {
            blockingErrors.push("Tidak ada baris anggaran yang berhasil dibaca dari PDF.");
          }
          const rec = {
            year,
            schoolNo: Number(school.no),
            schoolName: school.name,
            npsn: school.npsn,
            tahap,
            sumber,
            fileName: origName,
            filePath: relativePath,
            fileUrl: `/api/file/${relativePath}`,
            uploadedAt: new Date().toISOString(),
            uploadedBy: "juan",
            items: parsed.items || [],
            totals: parsed.totals || { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 },
            basis: parsed.basis || null,
            meta: parsed.meta || {},
            warnings,
            blockingErrors,
            canSubmit: blockingErrors.length === 0,
            stats: parsed.stats || {},
            status: "Draft",
            catatan: "",
            ...(includePdfs ? { pdfBase64: buf.toString("base64") } : {}),
          };
          out.push(rec);
        } catch (err) {
          console.warn("Gagal parse PDF lokal saat migrasi:", fullFile, err.message);
        }
      }
    }
  }
  return out;
}

app.get("/api/migration/json-bundle", async (req, res) => {
  try {
    const includePdfs = req.query.includePdfs === "1" || req.query.includePdfs === "true";
    const schools = getSchools();
    const users = getUsers().map((u) => ({
      name: u.name || u.username,
      username: u.username,
      passwordHash: u.password || "",
      role: u.role || "Operator Sekolah",
      schoolNo: u.schoolNo ?? 0,
      npsn: u.npsn || "",
      whatsapp: u.whatsapp || "",
      status: u.status || "Aktif",
    }));

    // Kumpulkan semua monthly_{year}.json yang memiliki aktivitas
    const monthlyByYear = {};
    const dataFiles = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
    for (const f of dataFiles) {
      const mMatch = f.match(/^monthly_(\d{4})\.json$/);
      if (!mMatch) continue;
      const y = Number(mMatch[1]);
      const mData = getMonthly(y);
      const activeSchools = {};
      for (const [no, monthsObj] of Object.entries(mData || {})) {
        for (const [mKey, rec] of Object.entries(monthsObj || {})) {
          if (!rec || typeof rec !== "object") continue;
          const hasData =
            rec.reconDone ||
            (rec.verifStatus && rec.verifStatus !== "Draft") ||
            (rec.pendapatan && Object.values(rec.pendapatan).some((v) => Number(v) > 0)) ||
            (rec.belanja && Object.values(rec.belanja).some((v) => Number(v) > 0)) ||
            (rec.rekon && Object.values(rec.rekon).some((v) => Number(v) > 0)) ||
            (rec.documents && Object.values(rec.documents).some((d) => d && d.url)) ||
            Number(rec.saldoAwalCustom) > 0 ||
            Number(rec.saldoReguler) > 0 ||
            Number(rec.saldoKinerja) > 0 ||
            Number(rec.saldoNonBOS) > 0 ||
            Number(rec.saldoTunai) > 0;
          if (hasData) {
            if (!activeSchools[no]) activeSchools[no] = {};
            activeSchools[no][mKey] = rec;
          }
        }
      }
      if (Object.keys(activeSchools).length > 0) {
        monthlyByYear[y] = activeSchools;
      }
    }

    // Kumpulkan semua anggaran_{year}.json + PDF yang ada di folder uploads/
    const anggaranList = [];
    for (const f of dataFiles) {
      const aMatch = f.match(/^anggaran_(\d{4})\.json$/);
      if (!aMatch) continue;
      const y = Number(aMatch[1]);
      const aData = angRead(y);
      for (const [no, tahaps] of Object.entries(aData || {})) {
        for (const [tahap, srcs] of Object.entries(tahaps || {})) {
          for (const [sumber, rec] of Object.entries(srcs || {})) {
            if (rec && typeof rec === "object") {
              anggaranList.push({ ...rec, year: y, schoolNo: Number(no), tahap, sumber });
            }
          }
        }
      }
    }

    // Kumpulkan semua sp2b_kab_{year}.json & meta.json (read-only)
    const meta = readJson("meta.json", {});
    const sp2bKabByYear = {};
    for (const f of dataFiles) {
      const kMatch = f.match(/^sp2b_kab_(\d{4})\.json$/);
      if (!kMatch) continue;
      const y = Number(kMatch[1]);
      sp2bKabByYear[y] = readJson(f, { records: {}, last: {} });
    }

    // Jika includePdfs=1, baca juga PDF lokal dari monthly_*.json (url /api/file/...) agar termigrasi ke Google Drive
    const monthlyPdfUploads = {};
    if (includePdfs) {
      for (const [_y, schoolsObj] of Object.entries(monthlyByYear)) {
        for (const [_no, monthsObj] of Object.entries(schoolsObj || {})) {
          for (const [_mKey, rec] of Object.entries(monthsObj || {})) {
            if (!rec || !rec.documents || typeof rec.documents !== "object") continue;
            for (const docItem of Object.values(rec.documents)) {
              if (!docItem || typeof docItem !== "object") continue;
              const rawUrl = String(docItem.url || "");
              if (!rawUrl.startsWith("/api/file/")) continue;
              const rel = decodeURIComponent(rawUrl.replace(/^\/api\/file\//, ""));
              if (!rel || monthlyPdfUploads[rel]) continue;
              const abs = resolveSafeUploadPath(rel);
              if (abs && fs.existsSync(abs)) {
                try {
                  const buf = fs.readFileSync(abs);
                  if (buf.length > 0 && buf.slice(0, 5).toString() === "%PDF-") {
                    monthlyPdfUploads[rel] = buf.toString("base64");
                  }
                } catch (_) {}
              }
            }
          }
        }
      }
    }

    const uploadedAnggaran = await buildUploadedAnggaranMigrationList(includePdfs);
    for (const uRec of uploadedAnggaran) {
      const existsIdx = anggaranList.findIndex(
        (x) =>
          Number(x.year) === Number(uRec.year) &&
          Number(x.schoolNo) === Number(uRec.schoolNo) &&
          x.tahap === uRec.tahap &&
          x.sumber === uRec.sumber
      );
      if (existsIdx >= 0) {
        if (includePdfs && uRec.pdfBase64) anggaranList[existsIdx].pdfBase64 = uRec.pdfBase64;
      } else {
        anggaranList.push(uRec);
      }
    }

    res.json({
      status: "success",
      schools,
      users,
      meta,
      sp2bKabByYear,
      monthlyByYear,
      monthlyPdfUploads,
      anggaranList,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/", disabledStorageHandler);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`SIGAP-BOSP Server v2.1.0 (Firebase Firestore + Google Drive) http://localhost:${PORT}`);
  console.log(`Health                  http://localhost:${PORT}/api/health`);
  console.log(`Migration Bundle (RO)   http://localhost:${PORT}/api/migration/json-bundle`);
});
