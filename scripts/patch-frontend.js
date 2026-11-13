/**
 * Menambal file HTML frontend agar memakai API Node.js
 * (bukan Google Apps Script).
 *
 * Usage:
 *   node scripts/patch-frontend.js [path/ke/file.html]
 * Default: public/index.html
 */
const fs = require("fs");
const path = require("path");

const target = process.argv[2] || path.join(__dirname, "..", "public", "index.html");
if (!fs.existsSync(target)) {
  console.error("File tidak ditemukan:", target);
  console.error("Salin dulu HTML dashboard ke public/index.html");
  process.exit(1);
}

let html = fs.readFileSync(target, "utf8");
const original = html;

// 1. Ganti URL GAS → API Node (relatif, bisa di-deploy di domain yang sama)
html = html.replace(
  /const\s+GAS_WEB_APP_URL\s*=\s*["'][^"']*["']\s*;/,
  'const GAS_WEB_APP_URL = window.REKON_API_BASE || (location.origin + "/api");'
);

// 2. loadFromGoogleSheets: GET ke /api/data?year=
html = html.replace(
  /const response = await fetch\(GAS_WEB_APP_URL \+ "\?action=getData(?:&year=" \+ encodeURIComponent\(activeYear\))?"\);/,
  'const response = await fetch(GAS_WEB_APP_URL + "/data?year=" + encodeURIComponent(activeYear));'
);

// Alternatif pola tanpa year di URL lama
html = html.replace(
  /fetch\(GAS_WEB_APP_URL \+ "\?action=getData"\)/g,
  'fetch(GAS_WEB_APP_URL + "/data?year=" + encodeURIComponent(typeof activeYear !== "undefined" ? activeYear : 2024))'
);

// 3. save: arahkan POST ke /api/save (bukan root GAS)
// Pola: await fetch(GAS_WEB_APP_URL, { method: "POST", ...
html = html.replace(
  /await fetch\(GAS_WEB_APP_URL,\s*\{\s*method:\s*"POST"/g,
  'await fetch(GAS_WEB_APP_URL + "/save", { method: "POST"'
);

// 4. Upload: arahkan ke /api/upload
// Jika masih fetch(GAS_WEB_APP_URL) untuk uploadFile, ganti
html = html.replace(
  /body:\s*JSON\.stringify\(\{\s*action:\s*"uploadFile"/g,
  'body: JSON.stringify({ action: "uploadFile"'
);

// Pastikan upload memakai endpoint /upload
// Cari blok upload yang fetch ke GAS_WEB_APP_URL dan sisipkan /upload jika belum
html = html.replace(
  /(action:\s*"uploadFile"[\s\S]{0,400}?fetch\()GAS_WEB_APP_URL([,\s])/g,
  "$1GAS_WEB_APP_URL + \"/upload\"$2"
);

// 5. ensureServerReady: cek /api/health
html = html.replace(
  /const r = await fetch\(GAS_WEB_APP_URL\);/,
  'const r = await fetch(GAS_WEB_APP_URL.replace(/\\/api\\/?$/, "") + "/api/health");'
);

// Fallback: jika masih fetch(GAS_WEB_APP_URL) tanpa path di ensureServerReady
if (html.includes("ensureServerReady") && !html.includes("/api/health")) {
  html = html.replace(
    /async function ensureServerReady\(\)\s*\{[\s\S]*?\n\s*\}/,
    `async function ensureServerReady() {
            if (gasReady) return true;
            try {
                const base = (typeof GAS_WEB_APP_URL === "string" ? GAS_WEB_APP_URL : "").replace(/\\/api\\/?$/, "");
                const r = await fetch(base + "/api/health");
                const j = await r.json();
                gasReady = !!(j && (j.version || j.status === "ok"));
            } catch (e) {
                gasReady = false;
            }
            return gasReady;
        }`
  );
}

// 6. mode no-cors tidak diperlukan untuk API sendiri — hapus agar bisa baca response
html = html.replace(/mode:\s*"no-cors",?\s*/g, "");

if (html === original) {
  console.log("Tidak ada pola yang cocok untuk ditambal (mungkin sudah dipatch).");
  console.log("File:", target);
} else {
  // Backup
  const bak = target + ".bak";
  fs.writeFileSync(bak, original, "utf8");
  fs.writeFileSync(target, html, "utf8");
  console.log("Patch selesai.");
  console.log("Backup :", bak);
  console.log("Target :", target);
  console.log("GAS_WEB_APP_URL sekarang mengarah ke API Node (location.origin + /api).");
}
