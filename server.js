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
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ORIGIN = process.env.CORS_ORIGIN || false;

if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET tidak di-set di .env — session hilang saat restart.");
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Seed default jika kosong
try { require("./scripts/init-db.js"); } catch (e) { console.warn("init-db:", e.message); }

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: CORS_ORIGIN || (NODE_ENV === "production" ? false : true),
  credentials: true,
}));
app.use(express.json({ limit: "30mb" }));
app.use(express.text({ type: ["text/plain", "text/*"], limit: "30mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

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
  const schools = getSchools();
  const users = getUsers();
  let fbCfg = {};
  try {
    fbCfg = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));
  } catch (_) {}
  res.json({
    status: "ok",
    version: "2.0.0-firebase-drive",
    storage: "firebase-firestore + google-drive",
    firebaseProjectId: fbCfg.projectId || "gen-lang-client-0341158920",
    firestoreDatabaseId: fbCfg.firestoreDatabaseId || "",
    time: new Date().toISOString(),
    stats: {
      schools: schools.length,
      users: users.length,
      usersActive: users.filter((u) => (u.status || "Aktif") === "Aktif").length,
      operators: users.filter((u) => u.role === "Operator Sekolah").length,
    },
  });
});


/** Daftar sekolah publik (untuk cek NPSN saat pendaftaran, tanpa login) */
app.get("/api/public/schools", (_req, res) => {
  try {
    const schools = getSchools().map((s) => ({
      no: s.no,
      npsn: s.npsn,
      name: s.name,
      kecamatan: s.kecamatan,
      status: s.status,
      jenjang: s.jenjang,
    }));
    res.json({ status: "success", schools });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Terlalu banyak percobaan daftar. Coba lagi nanti." },
});

/** Pendaftaran akun baru → status Pending, menunggu Admin */
app.post("/api/register", registerLimiter, async (req, res) => {
  try {
    const body = parseBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = String(body.role || "Operator Sekolah").trim();
    const whatsapp = String(body.whatsapp || "").trim();
    const npsn = String(body.npsn || "").trim();

    if (!username || !password) {
      return res.status(400).json({ status: "error", message: "Username dan password wajib diisi" });
    }
    if (password.length < 6) {
      return res.status(400).json({ status: "error", message: "Password minimal 6 karakter" });
    }
    if (!["Operator Sekolah", "Admin Dinas"].includes(role)) {
      return res.status(400).json({ status: "error", message: "Peran tidak valid" });
    }
    if (getUsers().some((u) => String(u.username).toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ status: "error", message: "Username sudah digunakan" });
    }

    let name = "";
    let schoolNo = null;
    let npsnVal = "";

    if (role === "Operator Sekolah") {
      if (!npsn) {
        return res.status(400).json({ status: "error", message: "NPSN wajib diisi untuk Operator Sekolah" });
      }
      const school = getSchools().find((s) => String(s.npsn).trim() === npsn);
      if (!school) {
        return res.status(400).json({ status: "error", message: "NPSN tidak ditemukan di Data Master Sekolah" });
      }
      const existOp = getUsers().find(
        (u) => u.role === "Operator Sekolah" && String(u.npsn) === npsn && u.status !== "Ditolak"
      );
      if (existOp) {
        return res.status(409).json({
          status: "error",
          message: "Sekolah ini sudah memiliki akun operator (Pending/Aktif). Satu sekolah satu operator.",
        });
      }
      name = `Operator ${school.name}`;
      schoolNo = school.no;
      npsnVal = school.npsn;
    } else {
      name = body.name ? String(body.name).trim() : `Admin Dinas (${username})`;
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newUser = {
      name,
      username,
      password: hash,
      role,
      schoolNo,
      npsn: npsnVal,
      whatsapp,
      status: "Pending",
    };
    const all = getUsers();
    all.push(newUser);
    setUsers(all);
    audit("register", req, { username, role, npsn: npsnVal });
    res.json({
      status: "success",
      message: "Pendaftaran berhasil. Menunggu persetujuan Admin Dinas.",
      user: sanitizeUser(newUser),
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/login", loginLimiter, async (req, res) => {
  try {
    const body = parseBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) {
      return res.status(400).json({ status: "error", message: "Username dan password wajib" });
    }
    const user = getUsers().find((u) => u.username === username);
    if (!user) {
      audit("login_fail", req, { username });
      return res.status(401).json({ status: "error", message: "Username atau kata sandi salah" });
    }
    let ok = false;
    if (user.password && String(user.password).startsWith("$2")) {
      ok = await bcrypt.compare(password, user.password);
    } else {
      ok = user.password === password;
      if (ok) {
        user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
        setUsers(getUsers().map((u) => (u.username === username ? user : u)));
      }
    }
    if (!ok) {
      audit("login_fail", req, { username });
      return res.status(401).json({ status: "error", message: "Username atau kata sandi salah" });
    }
    if (user.status !== "Aktif") {
      return res.status(403).json({ status: "error", message: "Akun belum aktif / menunggu verifikasi Admin" });
    }
    const token = jwt.sign(
      {
        username: user.username,
        role: user.role,
        schoolNo: user.schoolNo ?? null,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    });
    audit("login_ok", req, { username });
    res.json({ status: "success", token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/** Login / Sinkronisasi Sesi dengan Firebase Google Auth */
app.post("/api/auth/google", loginLimiter, async (req, res) => {
  try {
    const body = parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const uid = String(body.uid || "").trim();
    const displayName = String(body.displayName || "").trim();
    if (!email || !uid) {
      return res.status(400).json({ status: "error", message: "Email dan UID Google wajib tersedia." });
    }
    const users = getUsers();
    const isBootAdmin = email === "artygigiron98@gmail.com";
    let user = users.find(
      (u) =>
        (u.email && String(u.email).toLowerCase() === email) ||
        String(u.username).toLowerCase() === email ||
        String(u.username).toLowerCase() === email.split("@")[0]
    );
    if (!user && isBootAdmin) {
      user = users.find((u) => u.username === "admin") || {
        name: displayName || "Administrator Dinas",
        username: "admin",
        email,
        uid,
        role: "Admin Dinas",
        schoolNo: null,
        npsn: "",
        whatsapp: "",
        status: "Aktif",
      };
      user.email = email;
      user.uid = uid;
      user.status = "Aktif";
      setUsers(users.map((u) => (u.username === user.username ? user : u)));
    } else if (!user) {
      // Buat atau hubungkan ke Operator Sekolah default (SDN 1 RATAHAN) agar langsung dapat menguji unggah Google Drive & Firestore
      const firstSchool = getSchools()[0] || { no: 1, npsn: "69762652", name: "SDN 1 RATAHAN" };
      user = {
        name: displayName || `Operator ${firstSchool.name}`,
        username: email.split("@")[0],
        email,
        uid,
        password: await bcrypt.hash(crypto.randomBytes(16).toString("hex"), BCRYPT_ROUNDS),
        role: "Operator Sekolah",
        schoolNo: firstSchool.no,
        npsn: firstSchool.npsn,
        whatsapp: "",
        status: "Aktif",
      };
      users.push(user);
      setUsers(users);
    }
    if (user.status !== "Aktif") {
      return res.status(403).json({ status: "error", message: "Akun belum aktif / menunggu verifikasi Admin Dinas." });
    }
    const token = jwt.sign(
      {
        username: user.username,
        role: user.role,
        schoolNo: user.schoolNo ?? null,
        name: user.name,
        uid,
        email,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    });
    audit("login_google_ok", req, { username: user.username, email, uid });
    res.json({ status: "success", token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  try {
    audit("logout", req);
  } catch (_) {}
  res.json({ status: "success" });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = getUsers().find((u) => u.username === req.user.username);
  if (!user) return res.status(401).json({ status: "error", message: "User tidak ditemukan" });
  res.json({ status: "success", user: sanitizeUser(user) });
});

app.get("/api/data", requireAuth, (req, res) => {
  try {
    const year = Number(req.query.year) || 2026;
    let schools = getSchools();
    let monthlyData = getMonthly(year);
    let users = getUsers();
    if (req.user.role === "Operator Sekolah" && req.user.schoolNo != null) {
      const no = Number(req.user.schoolNo);
      schools = schools.filter((s) => Number(s.no) === no);
      const filtered = {};
      if (monthlyData[no]) filtered[no] = monthlyData[no];
      if (monthlyData[String(no)]) filtered[String(no)] = monthlyData[String(no)];
      monthlyData = filtered;
      users = users.filter((u) => u.username === req.user.username);
    }
    res.json({ status: "success", year, schools, users: sanitizeUsers(users), monthlyData });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/save", requireAuth, async (req, res) => {
  try {
    const body = parseBody(req);
    const year = Number(body.year) || 2026;
    if (req.user.role === "Operator Sekolah") {
      if (body.monthlyData) {
        const allowed = {};
        const no = String(req.user.schoolNo);
        if (body.monthlyData[no]) allowed[no] = body.monthlyData[no];
        if (body.monthlyData[req.user.schoolNo]) allowed[req.user.schoolNo] = body.monthlyData[req.user.schoolNo];
        body.monthlyData = allowed;
      }
      delete body.schools;
      delete body.users;
    }
    if (Array.isArray(body.schools) && (req.user.role === "Admin Dinas" || req.user.role === "BUD")) {
      upsertSchools(body.schools);
    }
    if (Array.isArray(body.users) && req.user.role === "Admin Dinas") {
      await upsertUsers(body.users);
    }
    if (body.monthlyData && typeof body.monthlyData === "object") {
      if (body.partial) mergeMonthly(year, body.monthlyData);
      else setMonthly(year, body.monthlyData);
    }
    audit("save", req, { year, partial: !!body.partial });
    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/schools", requireAuth, (req, res) => {
  let schools = getSchools();
  if (req.user.role === "Operator Sekolah" && req.user.schoolNo != null) {
    schools = schools.filter((s) => Number(s.no) === Number(req.user.schoolNo));
  }
  res.json({ status: "success", schools });
});

app.post("/api/schools", requireAuth, requireRole("Admin Dinas"), (req, res) => {
  try {
    const body = parseBody(req);
    const list = Array.isArray(body.schools) ? body.schools : body.school ? [body.school] : null;
    if (!list) return res.status(400).json({ status: "error", message: "schools required" });
    audit("upsert_schools", req, { count: list.length });
    res.json({ status: "success", schools: upsertSchools(list) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------- Data Master Sekolah: identitas Kepala Sekolah & Bendahara BOSP ----------
function cleanText(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function cleanPejabat(p, defaultJabatan) {
  p = p && typeof p === "object" ? p : {};
  return {
    nama: cleanText(p.nama, 120),
    nip: cleanText(p.nip, 30).replace(/[^0-9 .\-]/g, ""),
    pangkat: cleanText(p.pangkat, 80),
    jabatan: cleanText(p.jabatan, 80) || defaultJabatan,
  };
}
function profileOf(s) {
  return {
    no: s.no,
    npsn: s.npsn,
    name: s.name,
    kecamatan: s.kecamatan,
    alamat: s.alamat || "",
    status: s.status,
    jenjang: s.jenjang,
    kepalaSekolah: cleanPejabat(s.kepalaSekolah, "Kepala Sekolah"),
    bendahara: cleanPejabat(s.bendahara, "Bendahara BOSP"),
    profilDiubah: s.profilDiubah || null,
  };
}
/** Sekolah yang boleh diakses: Operator → sekolah akunnya saja; Admin → ?no= / body.no */
function resolveProfileSchool(req, noRaw) {
  const role = req.user.role;
  let no;
  if (role === "Operator Sekolah") {
    if (req.user.schoolNo == null) return { error: "Akun Anda belum terhubung ke satuan pendidikan." };
    no = Number(req.user.schoolNo);
  } else if (role === "Admin Dinas") {
    no = Number(noRaw);
    if (!Number.isFinite(no)) return { error: "Parameter no sekolah wajib diisi." };
  } else {
    return { error: "Peran Anda tidak memiliki akses.", code: 403 };
  }
  return { no };
}

app.get("/api/school-profile", requireAuth, (req, res) => {
  const r = resolveProfileSchool(req, req.query.no);
  if (r.error) return res.status(r.code || 400).json({ status: "error", message: r.error });
  const s = getSchools().find((x) => Number(x.no) === r.no);
  if (!s) return res.status(404).json({ status: "error", message: "Sekolah tidak ditemukan" });
  res.json({ status: "success", school: profileOf(s) });
});

app.put("/api/school-profile", requireAuth, requireRole("Operator Sekolah", "Admin Dinas"), (req, res) => {
  try {
    const body = parseBody(req);
    const r = resolveProfileSchool(req, body.no);
    if (r.error) return res.status(r.code || 400).json({ status: "error", message: r.error });
    const list = getSchools();
    const idx = list.findIndex((x) => Number(x.no) === r.no);
    if (idx < 0) return res.status(404).json({ status: "error", message: "Sekolah tidak ditemukan" });

    const kepsek = cleanPejabat(body.kepalaSekolah, "Kepala Sekolah");
    const bend = cleanPejabat(body.bendahara, "Bendahara BOSP");
    if (!kepsek.nama) {
      return res.status(400).json({ status: "error", message: "Nama Kepala Sekolah wajib diisi." });
    }
    list[idx] = {
      ...list[idx],
      kepalaSekolah: kepsek,
      bendahara: bend,
      profilDiubah: { oleh: req.user.username, waktu: new Date().toISOString() },
    };
    setSchools(list);
    audit("update_school_profile", req, { schoolNo: r.no });
    res.json({ status: "success", school: profileOf(list[idx]) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.delete("/api/schools/:no", requireAuth, requireRole("Admin Dinas"), (req, res) => {
  try {
    const no = Number(req.params.no);
    setSchools(getSchools().filter((s) => Number(s.no) !== no));
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!/^monthly_\d+\.json$/.test(f)) continue;
      const year = Number(f.replace(/\D/g, ""));
      const data = getMonthly(year);
      if (data[no] || data[String(no)]) {
        delete data[no];
        delete data[String(no)];
        setMonthly(year, data);
      }
    }
    audit("delete_school", req, { schoolNo: no });
    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/users", requireAuth, requireRole("Admin Dinas"), (_req, res) => {
  res.json({ status: "success", users: sanitizeUsers(getUsers()) });
});

app.post("/api/users", requireAuth, requireRole("Admin Dinas"), async (req, res) => {
  try {
    const body = parseBody(req);
    const list = Array.isArray(body.users) ? body.users : body.user ? [body.user] : null;
    if (!list) return res.status(400).json({ status: "error", message: "users required" });

    // replace: true → ganti seluruh daftar (untuk sinkron hapus user)
    if (body.replace === true) {
      const protectedAdmin = getUsers().find((u) => u.username === "admin");
      const map = new Map();
      for (const u of list) {
        if (!u || !u.username) continue;
        if (String(u.username).toLowerCase() === "admin" && protectedAdmin) {
          // jangan timpa password admin kosong dari client
          let password = protectedAdmin.password;
          if (u.password && String(u.password).startsWith("$2")) password = u.password;
          else if (u.password && u.password !== protectedAdmin.password && !String(u.password).startsWith("$2")) {
            password = await bcrypt.hash(String(u.password), BCRYPT_ROUNDS);
          }
          map.set("admin", {
            ...protectedAdmin,
            name: u.name || protectedAdmin.name,
            whatsapp: u.whatsapp != null ? u.whatsapp : protectedAdmin.whatsapp,
            status: "Aktif",
            password,
          });
          continue;
        }
        const prev = getUsers().find((x) => String(x.username).toLowerCase() === String(u.username).toLowerCase());
        let password = (prev && prev.password) || "";
        if (u.password != null && u.password !== "" && u.password !== password) {
          password = String(u.password).startsWith("$2")
            ? u.password
            : await bcrypt.hash(String(u.password), BCRYPT_ROUNDS);
        }
        map.set(String(u.username).toLowerCase(), {
          name: u.name || u.username,
          username: u.username,
          password: password || (prev && prev.password) || "",
          role: u.role || "Operator Sekolah",
          schoolNo: u.schoolNo ?? u.school_no ?? null,
          npsn: u.npsn || "",
          whatsapp: u.whatsapp || "",
          status: u.status || "Pending",
        });
      }
      // selalu pertahankan admin
      if (protectedAdmin && !map.has("admin")) {
        map.set("admin", protectedAdmin);
      }
      const out = Array.from(map.values());
      setUsers(out);
      audit("replace_users", req, { count: out.length });
      return res.json({ status: "success", users: sanitizeUsers(out) });
    }

    const updated = await upsertUsers(list);
    audit("upsert_users", req, { count: list.length });
    res.json({ status: "success", users: sanitizeUsers(updated) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/** Hapus satu user dari database (users.json) */
app.delete("/api/users/:username", requireAuth, requireRole("Admin Dinas"), (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) {
      return res.status(400).json({ status: "error", message: "Username wajib" });
    }
    if (username.toLowerCase() === "admin") {
      return res.status(403).json({ status: "error", message: "Akun admin utama tidak boleh dihapus" });
    }
    const before = getUsers();
    const after = before.filter((u) => String(u.username).toLowerCase() !== username.toLowerCase());
    if (after.length === before.length) {
      return res.status(404).json({ status: "error", message: "User tidak ditemukan" });
    }
    setUsers(after);
    audit("delete_user", req, { username });
    res.json({ status: "success", message: "User dihapus", users: sanitizeUsers(after) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});


/** Reset password user (termasuk admin) dari web — hanya Admin Dinas */
app.post("/api/users/:username/reset-password", requireAuth, requireRole("Admin Dinas"), async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) {
      return res.status(400).json({ status: "error", message: "Username wajib" });
    }
    const body = parseBody(req);
    let newPassword = String(body.password || body.newPassword || "").trim();
    if (!newPassword) {
      newPassword = username.toLowerCase() === "admin" ? "admin2024" : "password123";
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ status: "error", message: "Password baru minimal 6 karakter" });
    }
    const users = getUsers();
    const idx = users.findIndex((u) => String(u.username).toLowerCase() === username.toLowerCase());
    if (idx < 0) {
      return res.status(404).json({ status: "error", message: "User tidak ditemukan" });
    }
    users[idx].password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    setUsers(users);
    audit("reset_password", req, { username, by: req.user && req.user.username });
    res.json({
      status: "success",
      message: `Password akun "${username}" berhasil direset.`,
      temporaryPassword: newPassword,
      users: sanitizeUsers(users),
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/** Ubah password akun yang sedang login (verifikasi password lama di server; password tersimpan ter-hash) */
app.post("/api/change-password", requireAuth, async (req, res) => {
  try {
    const body = parseBody(req);
    const oldPassword = String(body.oldPassword || "");
    const newPassword = String(body.newPassword || "").trim();
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ status: "error", message: "Password lama dan baru wajib diisi" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ status: "error", message: "Password baru minimal 6 karakter" });
    }
    const users = getUsers();
    const idx = users.findIndex((u) => u.username === req.user.username);
    if (idx < 0) {
      return res.status(404).json({ status: "error", message: "User tidak ditemukan" });
    }
    const stored = users[idx].password || "";
    const ok = String(stored).startsWith("$2")
      ? await bcrypt.compare(oldPassword, stored)
      : stored === oldPassword;
    if (!ok) {
      audit("change_password_fail", req, { username: req.user.username });
      return res.status(400).json({ status: "error", message: "Password lama salah" });
    }
    users[idx].password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    setUsers(users);
    audit("change_password", req, { username: req.user.username });
    res.json({ status: "success", message: "Password berhasil diubah." });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/sp2b-kab", requireAuth, (req, res) => {
  const year = Number(req.query.year) || 2024;
  const store = readJson(`sp2b_kab_${year}.json`, { records: {}, last: {} });
  res.json({ status: "success", year, records: store.records || {}, last: store.last || {} });
});

app.post("/api/sp2b-kab", requireAuth, requireRole("Admin Dinas", "BUD"), (req, res) => {
  try {
    const body = parseBody(req);
    const year = Number(body.year) || 2024;
    const file = `sp2b_kab_${year}.json`;
    const store = readJson(file, { records: {}, last: {} });
    if (body.records && typeof body.records === "object") {
      store.records = { ...(store.records || {}), ...body.records };
    }
    if (body.last && typeof body.last === "object") store.last = body.last;
    if (body.deleteKey && store.records) delete store.records[body.deleteKey];
    writeJson(file, store);
    audit("sp2b_kab", req, { year });
    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/** Peringkat publik tanpa login */
app.get("/api/public/rank", (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = String(req.query.month || "Jan");
    const schools = getSchools();
    const monthly = getMonthly(year);
    const monthIdx = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agus","Sep","Okt","Nov","Des"].indexOf(month);
    const eom = new Date(year, (monthIdx >= 0 ? monthIdx : 0) + 1, 0, 23, 59, 59, 999).getTime();
    const done = [];
    for (const s of schools) {
      const d = (monthly[s.no] && monthly[s.no][month]) || (monthly[String(s.no)] && monthly[String(s.no)][month]);
      if (d && d.reconDone) {
        const t = d.reconDoneAt ? new Date(d.reconDoneAt).getTime() : NaN;
        let durasi = "—";
        if (Number.isFinite(t)) {
          const days = Math.floor(Math.abs(t - eom) / 86400000);
          const hours = Math.floor((Math.abs(t - eom) % 86400000) / 3600000);
          durasi = (t < eom ? "lebih cepat " : "") + (days > 0 ? days + " hari " : "") + hours + " jam";
        }
        done.push({ name: s.name, kecamatan: s.kecamatan, doneAt: d.reconDoneAt || null, t, durasi });
      }
    }
    done.sort((a, b) => (Number.isFinite(a.t) ? a.t : 1e15) - (Number.isFinite(b.t) ? b.t : 1e15));
    const rows = done.map(({ name, kecamatan, doneAt, durasi }) => ({ name, kecamatan, doneAt, durasi }));
    res.json({ status: "success", year, month, totalDone: rows.length, rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------- Upload helpers ----------
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
const MONTH_MAP = {
  januari: "01", jan: "01", february: "02", februari: "02", feb: "02",
  maret: "03", mar: "03", april: "04", apr: "04",
  mei: "05", may: "05", juni: "06", jun: "06", juli: "07", jul: "07",
  agustus: "08", agus: "08", aug: "08", september: "09", sep: "09",
  oktober: "10", okt: "10", oct: "10", november: "11", nov: "11",
  desember: "12", des: "12", dec: "12",
  "1": "01", "2": "02", "3": "03", "4": "04", "5": "05", "6": "06",
  "7": "07", "8": "08", "9": "09", "10": "10", "11": "11", "12": "12",
  "01": "01", "02": "02", "03": "03", "04": "04", "05": "05", "06": "06",
  "07": "07", "08": "08", "09": "09",
};
function normalizeMonthFolder(month, year) {
  const y = String(year || new Date().getFullYear());
  const raw = String(month || "").trim().toLowerCase();
  let mm = MONTH_MAP[raw];
  if (!mm) {
    const m = raw.match(/(\d{1,2})/);
    mm = m ? String(m[1]).padStart(2, "0") : "00";
  }
  return `${y}-${mm}`;
}
function resolveSchoolFolder(meta) {
  const no = meta.schoolNo != null ? Number(meta.schoolNo) : null;
  const found = no != null ? getSchools().find((s) => Number(s.no) === no) : null;
  const npsn = sanitizeFolderPart(meta.npsn || found?.npsn || "", 20);
  const name = sanitizeFolderPart(meta.schoolName || found?.name || `Sekolah_${no || 0}`, 60);
  const idPart = npsn && npsn !== "unknown" ? npsn : `NO${no || 0}`;
  return `${idPart}_${name}`;
}
function buildUploadPath(meta) {
  const schoolFolder = resolveSchoolFolder(meta);
  const monthFolder = normalizeMonthFolder(meta.month, meta.year);
  const docType = sanitizeFolderPart(meta.docType || "doc", 40);
  const original = sanitizeFolderPart(meta.fileName || "dokumen.pdf", 80);
  const safeName = original.toLowerCase().endsWith(".pdf") ? original : `${original}.pdf`;
  const fileName = `${docType}_${Date.now()}_${safeName}`;
  const dir = path.join(UPLOAD_DIR, schoolFolder, monthFolder);
  fs.mkdirSync(dir, { recursive: true });
  const relativePath = path.join(schoolFolder, monthFolder, fileName).replace(/\\/g, "/");
  const absPath = path.join(UPLOAD_DIR, schoolFolder, monthFolder, fileName);
  return { absPath, relativePath, fileName, schoolFolder, monthFolder };
}
function resolveSafeUploadPath(relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(UPLOAD_DIR, normalized);
  const root = path.resolve(UPLOAD_DIR);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || "dokumen.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `tmp-${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    if (file.mimetype === "application/pdf" && name.endsWith(".pdf")) cb(null, true);
    else cb(new Error("Hanya file PDF yang diizinkan"));
  },
});

app.post("/api/upload", requireAuth, (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) return upload.single("file")(req, res, next);
  return next();
}, (req, res) => {
  try {
    if (req.file) {
      const buf = fs.readFileSync(req.file.path);
      if (buf.slice(0, 5).toString() !== "%PDF-") {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ status: "error", message: "File bukan PDF valid" });
      }
      const schoolNo = req.body?.schoolNo || req.user?.schoolNo || 0;
      if (req.user.role === "Operator Sekolah" && Number(schoolNo) !== Number(req.user.schoolNo)) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ status: "error", message: "Tidak boleh upload untuk sekolah lain" });
      }
      const { absPath, relativePath } = buildUploadPath({
        schoolNo, schoolName: req.body?.schoolName, npsn: req.body?.npsn,
        month: req.body?.month, year: req.body?.year, docType: req.body?.docType || "doc",
        fileName: req.file.originalname,
      });
      fs.renameSync(req.file.path, absPath);
      audit("upload", req, { file: relativePath, schoolNo });
      return res.json({ status: "success", fileUrl: `/api/file/${relativePath}`, fileName: req.file.originalname, path: relativePath });
    }
    const body = parseBody(req);
    if (body.driveUrl && body.driveFileId) {
      const schoolNo = body.schoolNo || req.user.schoolNo || 0;
      if (req.user.role === "Operator Sekolah" && Number(schoolNo) !== Number(req.user.schoolNo)) {
        return res.status(403).json({ status: "error", message: "Tidak boleh upload untuk sekolah lain" });
      }
      audit("upload_gdrive", req, { driveFileId: body.driveFileId, fileUrl: body.driveUrl, schoolNo });
      return res.json({
        status: "success",
        fileUrl: body.driveUrl,
        driveFileId: body.driveFileId,
        fileName: body.fileName || "dokumen.pdf",
        path: `gdrive://${body.driveFileId}`,
      });
    }
    if (body.action === "uploadFile" || body.fileData) {
      let base64 = body.fileData || "";
      const comma = base64.indexOf(",");
      if (comma >= 0) base64 = base64.slice(comma + 1);
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) return res.status(400).json({ status: "error", message: "fileData kosong" });
      if (buffer.slice(0, 5).toString() !== "%PDF-") {
        return res.status(400).json({ status: "error", message: "File bukan PDF valid" });
      }
      const schoolNo = body.schoolNo || req.user.schoolNo || 0;
      if (req.user.role === "Operator Sekolah" && Number(schoolNo) !== Number(req.user.schoolNo)) {
        return res.status(403).json({ status: "error", message: "Tidak boleh upload untuk sekolah lain" });
      }
      const { absPath, relativePath } = buildUploadPath({
        schoolNo, schoolName: body.schoolName, npsn: body.npsn,
        month: body.month, year: body.year || body.activeYear,
        docType: body.docType || "doc", fileName: body.fileName || "dokumen.pdf",
      });
      fs.writeFileSync(absPath, buffer);
      audit("upload", req, { file: relativePath, schoolNo });
      return res.json({
        status: "success",
        fileUrl: body.driveUrl || `/api/file/${relativePath}`,
        driveFileId: body.driveFileId || null,
        fileName: body.fileName || path.basename(relativePath),
        path: relativePath,
      });
    }
    return res.status(400).json({ status: "error", message: "Tidak ada file" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/file/*", requireAuth, (req, res) => {
  const relative = (req.params[0] || "").replace(/^\/+/, "");
  if (!relative) return res.status(400).json({ status: "error", message: "Path file kosong" });
  const file = resolveSafeUploadPath(relative);
  if (!file || !fs.existsSync(file)) {
    return res.status(404).json({ status: "error", message: "File tidak ditemukan" });
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${path.basename(file)}"`);
  res.sendFile(file);
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

/** Daftar anggaran (ringkas, tanpa rincian baris). Operator hanya melihat sekolahnya. */
app.get("/api/anggaran", requireAuth, (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const db = angRead(year);
    const out = {};
    for (const [no, tahaps] of Object.entries(db)) {
      if (req.user.role === "Operator Sekolah" && Number(no) !== Number(req.user.schoolNo)) continue;
      out[no] = {};
      for (const [t, srcs] of Object.entries(tahaps || {})) {
        out[no][t] = {};
        for (const [s, rec] of Object.entries(srcs || {})) out[no][t][s] = angStrip(rec);
      }
    }
    res.json({ status: "success", year, tahap: ANG_TAHAP, sumber: ANG_SUMBER, kategori: ANG_KATEGORI, data: out });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/** Detail satu dokumen (lengkap dengan rincian baris hasil baca) */
app.get("/api/anggaran/detail", requireAuth, (req, res) => {
  try {
    const year = Number(req.query.year);
    const tahap = String(req.query.tahap || "");
    const sumber = String(req.query.sumber || "");
    const bad = angCheckKeys(year, tahap, sumber);
    if (bad) return res.status(400).json({ status: "error", message: bad });
    const no = angResolveSchoolNo(req, req.query.schoolNo);
    const rec = angRecord(angRead(year), no, tahap, sumber);
    if (!rec) return res.status(404).json({ status: "error", message: "Dokumen belum diunggah" });
    res.json({ status: "success", record: rec, schoolNo: no });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

/** Upload PDF RKAS → dibaca otomatis → disimpan sebagai Draft */
app.post(
  "/api/anggaran/upload",
  requireAuth,
  requireRole("Operator Sekolah", "Admin Dinas"),
  (req, res, next) => upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ status: "error", message: err.message });
    next();
  }),
  async (req, res) => {
    const tmp = req.file && req.file.path;
    try {
      if (!req.file) return res.status(400).json({ status: "error", message: "File PDF belum dipilih" });
      const year = Number(req.body.year);
      const tahap = String(req.body.tahap || "");
      const sumber = String(req.body.sumber || "");
      const bad = angCheckKeys(year, tahap, sumber);
      if (bad) return res.status(400).json({ status: "error", message: bad });
      const no = angResolveSchoolNo(req, req.body.schoolNo);
      const school = getSchools().find((s) => Number(s.no) === no);
      if (!school) return res.status(400).json({ status: "error", message: "Sekolah tidak ditemukan" });

      const buf = fs.readFileSync(tmp);
      if (buf.slice(0, 5).toString() !== "%PDF-") {
        return res.status(400).json({ status: "error", message: "File bukan PDF valid" });
      }
      const db = angRead(year);
      const prev = angRecord(db, no, tahap, sumber);
      if (prev && (prev.status === "Terverifikasi" || prev.status === "Diajukan") && req.user.role !== "Admin Dinas") {
        return res.status(409).json({
          status: "error",
          message: `Dokumen berstatus "${prev.status}" dan terkunci. Minta Admin Dinas membuka kunci terlebih dahulu.`,
        });
      }

      let parsed;
      try { parsed = await parseRkasPdf(buf, { sumber }); }
      catch (e) {
        return res.status(422).json({ status: "error", message: "PDF tidak dapat dibaca: " + e.message });
      }

      const m = parsed.meta || {};
      const idCheck = angValidateIdentity(school, m, sumber, tahap, year);
      // Gabungkan: soft dari parser + soft validasi identitas; blocking dipisah
      const warnings = [...(parsed.warnings || []), ...idCheck.soft];
      // Hindari duplikasi pesan yang sudah masuk blocking
      const blockingErrors = idCheck.blocking.slice();
      if (!parsed.items || !parsed.items.length) {
        blockingErrors.push("Tidak ada baris anggaran yang berhasil dibaca dari PDF. Pastikan file adalah Lembar RKAS hasil cetak ARKAS (bukan scan/foto).");
      }

      const driveFileId = req.body.driveFileId ? String(req.body.driveFileId).trim() : null;
      const driveUrl = req.body.driveUrl ? String(req.body.driveUrl).trim() : null;

      let relativePath = "";
      if (!driveFileId || !driveUrl) {
        const schoolFolder = resolveSchoolFolder({ schoolNo: no, schoolName: school.name, npsn: school.npsn });
        const dir = path.join(UPLOAD_DIR, schoolFolder, `anggaran-${year}`);
        fs.mkdirSync(dir, { recursive: true });
        const safe = sanitizeFolderPart(req.file.originalname || "rkas.pdf", 80);
        const fileName = `${tahap}_${sumber}_${Date.now()}_${safe.toLowerCase().endsWith(".pdf") ? safe : safe + ".pdf"}`;
        fs.renameSync(tmp, path.join(dir, fileName));
        relativePath = path.join(schoolFolder, `anggaran-${year}`, fileName).replace(/\\/g, "/");
      }

      const rec = {
        year, schoolNo: no, tahap, sumber,
        fileName: req.file.originalname,
        filePath: driveFileId ? `gdrive://${driveFileId}` : relativePath,
        fileUrl: driveUrl || `/api/file/${relativePath}`,
        ...(driveFileId ? { driveFileId } : {}),
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user.username,
        items: parsed.items,
        totals: parsed.totals,
        basis: parsed.basis || null,
        meta: parsed.meta,
        warnings,
        blockingErrors,
        canSubmit: blockingErrors.length === 0,
        stats: parsed.stats,
        sampleLines: parsed.sampleLines || [],
        status: "Draft",
        catatan: "",
        submittedAt: null, verifiedAt: null, verifiedBy: null,
      };
      angSetRecord(db, no, tahap, sumber, rec);
      angWrite(year, db);
      audit("anggaran_upload", req, {
        year, schoolNo: no, tahap, sumber,
        driveFileId: driveFileId || null,
        total: rec.totals.total, rows: rec.items.length,
        blocking: blockingErrors.length, canSubmit: rec.canSubmit,
      });
      res.json({ status: "success", record: rec });
    } catch (err) {
      res.status(500).json({ status: "error", message: err.message });
    } finally {
      if (tmp && fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (_) {} }
    }
  }
);

/**
 * Aksi pada dokumen anggaran:
 *  reclass · submit · delete (operator/admin) · verify · reject · reopen (hanya Admin Dinas)
 */
app.post("/api/anggaran/action", requireAuth, requireRole("Operator Sekolah", "Admin Dinas"), (req, res) => {
  try {
    const body = parseBody(req);
    const year = Number(body.year);
    const tahap = String(body.tahap || "");
    const sumber = String(body.sumber || "");
    const action = String(body.action || "");
    const bad = angCheckKeys(year, tahap, sumber);
    if (bad) return res.status(400).json({ status: "error", message: bad });
    const no = angResolveSchoolNo(req, body.schoolNo);
    const db = angRead(year);
    const rec = angRecord(db, no, tahap, sumber);
    if (!rec) return res.status(404).json({ status: "error", message: "Dokumen belum diunggah" });
    const isAdmin = req.user.role === "Admin Dinas";
    const editable = rec.status === "Draft" || rec.status === "Ditolak";

    if (["verify", "reject", "reopen"].includes(action) && !isAdmin) {
      return res.status(403).json({ status: "error", message: "Hanya Admin Dinas yang dapat memverifikasi" });
    }

    switch (action) {
      case "reclass": {
        if (!editable && !(isAdmin && rec.status !== "Terverifikasi")) {
          return res.status(409).json({ status: "error", message: `Dokumen berstatus "${rec.status}" dan terkunci` });
        }
        const list = Array.isArray(body.overrides) ? body.overrides : [];
        for (const o of list) {
          const i = Number(o.index);
          if (!Number.isInteger(i) || !rec.items[i]) continue;
          if (!ANG_KATEGORI[o.kategori]) continue;
          rec.items[i].kategori = o.kategori;
          rec.items[i].auto = o.kategori === angClassify(rec.items[i].kodeKegiatan, rec.items[i].kodeRekening);
        }
        rec.totals = sumTotals(rec.items);
        break;
      }
      case "submit": {
        if (!editable) return res.status(409).json({ status: "error", message: `Dokumen sudah berstatus "${rec.status}"` });
        if (!rec.items || !rec.items.length) {
          return res.status(400).json({ status: "error", message: "Tidak ada baris anggaran terbaca. Unggah ulang PDF yang benar." });
        }
        // Validasi ulang identitas sekolah & sumber dana (khusus operator: wajib cocok)
        const school = getSchools().find((s) => Number(s.no) === no);
        const idCheck = angValidateIdentity(school, rec.meta, sumber, tahap, year);
        const storedBlock = Array.isArray(rec.blockingErrors) ? rec.blockingErrors : [];
        const allBlock = [];
        const seen = new Set();
        for (const msg of [...idCheck.blocking, ...storedBlock]) {
          if (!msg || seen.has(msg)) continue;
          seen.add(msg);
          allBlock.push(msg);
        }
        rec.blockingErrors = allBlock;
        rec.canSubmit = allBlock.length === 0;
        if (allBlock.length && !isAdmin) {
          return res.status(422).json({
            status: "error",
            message: "Pengajuan ditolak: file PDF tidak sesuai identitas sekolah atau jenis sumber dana.",
            blockingErrors: allBlock,
            canSubmit: false,
          });
        }
        // Admin boleh force jika body.force === true (override), selain itu juga ditolak agar konsisten
        if (allBlock.length && isAdmin && !body.force) {
          return res.status(422).json({
            status: "error",
            message: "Dokumen memiliki ketidaksesuaian identitas/sumber dana. Perbaiki unggahan, atau kirim ulang dengan force=true bila yakin.",
            blockingErrors: allBlock,
            canSubmit: false,
          });
        }
        rec.status = "Diajukan";
        rec.submittedAt = new Date().toISOString();
        rec.catatan = "";
        break;
      }
      case "verify": {
        if (rec.status !== "Diajukan") return res.status(409).json({ status: "error", message: "Hanya dokumen berstatus Diajukan yang dapat diverifikasi" });
        rec.status = "Terverifikasi";
        rec.verifiedAt = new Date().toISOString();
        rec.verifiedBy = req.user.username;
        rec.catatan = String(body.catatan || "").slice(0, 500);
        break;
      }
      case "reject": {
        if (rec.status !== "Diajukan") return res.status(409).json({ status: "error", message: "Hanya dokumen berstatus Diajukan yang dapat ditolak" });
        const note = String(body.catatan || "").trim();
        if (!note) return res.status(400).json({ status: "error", message: "Catatan penolakan wajib diisi" });
        rec.status = "Ditolak";
        rec.catatan = note.slice(0, 500);
        rec.verifiedAt = new Date().toISOString();
        rec.verifiedBy = req.user.username;
        break;
      }
      case "reopen": {
        rec.status = "Draft";
        rec.verifiedAt = null; rec.verifiedBy = null;
        rec.catatan = String(body.catatan || "Dibuka kembali oleh Admin Dinas").slice(0, 500);
        break;
      }
      case "delete": {
        if (!editable && !isAdmin) return res.status(409).json({ status: "error", message: `Dokumen berstatus "${rec.status}" dan terkunci` });
        angSetRecord(db, no, tahap, sumber, null);
        angWrite(year, db);
        audit("anggaran_delete", req, { year, schoolNo: no, tahap, sumber });
        return res.json({ status: "success", deleted: true });
      }
      default:
        return res.status(400).json({ status: "error", message: "Aksi tidak dikenal" });
    }
    angSetRecord(db, no, tahap, sumber, rec);
    angWrite(year, db);
    audit("anggaran_" + action, req, { year, schoolNo: no, tahap, sumber });
    res.json({ status: "success", record: rec });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------- Audit Log (Admin) ----------
app.get("/api/audit", requireAuth, requireRole("Admin Dinas"), (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const actionFilter = String(req.query.action || "").trim().toLowerCase();
    const logPath = path.join(DATA_DIR, "audit.log");
    if (!fs.existsSync(logPath)) {
      return res.json({ status: "success", items: [], total: 0 });
    }
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let items = [];
    for (let i = lines.length - 1; i >= 0 && items.length < limit; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (actionFilter && String(obj.action || "").toLowerCase().indexOf(actionFilter) === -1) continue;
        items.push(obj);
      } catch (_) {}
    }
    res.json({ status: "success", items, total: lines.length });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ---------- Backup Data (Admin) ----------
app.get("/api/backup", requireAuth, requireRole("Admin Dinas"), (req, res) => {
  try {
    // Buat ZIP sederhana berisi semua file JSON di data/ + meta
    // Tanpa dependency tambahan: gunakan format tar-like plain atau kirim sebagai JSON bundle
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") || f === "audit.log");
    const bundle = {
      createdAt: new Date().toISOString(),
      version: "1.6.4-json-secure",
      files: {},
    };
    for (const f of files) {
      const full = path.join(DATA_DIR, f);
      try {
        bundle.files[f] = fs.readFileSync(full, "utf8");
      } catch (_) {}
    }
    const payload = JSON.stringify(bundle);
    const fname = `rekon-bosp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    audit("backup_download", req, { files: files.length });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(payload);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

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
        // Sinkronkan juga ke anggaran_{year}.json jika belum tercatat
        const db = angRead(uRec.year);
        const { pdfBase64, ...cleanRec } = uRec;
        angSetRecord(db, uRec.schoolNo, uRec.tahap, uRec.sumber, cleanRec);
        angWrite(uRec.year, db);
      }
    }

    res.json({
      status: "success",
      schools,
      users,
      monthlyByYear,
      anggaranList,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/", requireAuth, (req, res) => {
  const body = parseBody(req);
  if (body.action === "uploadFile") {
    req.url = "/api/upload";
    return app._router.handle(req, res, () => {});
  }
  if (body.action === "saveAll") {
    req.url = "/api/save";
    return app._router.handle(req, res, () => {});
  }
  res.status(400).json({ status: "error", message: "Unknown action" });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Rekon BOSP JSON-SECURE v1.6.1  http://localhost:${PORT}`);
  console.log(`Data directory          ${DATA_DIR}`);
  console.log(`Uploads directory       ${UPLOAD_DIR}`);
  console.log(`Health                  http://localhost:${PORT}/api/health`);
  console.log(`Storage                 JSON files (atomic write)`);
});
