/**
 * Migrasi: hash semua password plain text yang masih ada di users.json
 * Jalankan sekali setelah upgrade: npm run hash-passwords
 */
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const file = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(file)) {
  console.log("users.json tidak ditemukan");
  process.exit(0);
}

async function main() {
  const users = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = 0;
  for (const u of users) {
    if (u.password && !String(u.password).startsWith("$2")) {
      console.log("Hashing password untuk:", u.username);
      u.password = await bcrypt.hash(String(u.password), BCRYPT_ROUNDS);
      changed++;
    }
  }
  if (changed) {
    fs.writeFileSync(file, JSON.stringify(users, null, 2), "utf8");
    console.log(`Selesai. ${changed} password di-hash.`);
  } else {
    console.log("Semua password sudah di-hash.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
