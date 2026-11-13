/**
 * Migrasi data lama dari folder data/*.json ke MySQL
 * npm run migrate-json
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

function readJson(file, fallback) {
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  await db.ensureSchema();

  const schools = readJson("schools.json", []);
  if (schools.length) {
    await db.upsertSchools(schools);
    console.log("Migrated schools:", schools.length);
  }

  const users = readJson("users.json", []);
  for (const u of users) {
    if (u.password && !String(u.password).startsWith("$2")) {
      u.password = await bcrypt.hash(String(u.password), BCRYPT_ROUNDS);
    }
  }
  if (users.length) {
    await db.upsertUsers(users);
    console.log("Migrated users:", users.length);
  }

  const files = fs.readdirSync(DATA_DIR).filter((f) => /^monthly_\d+\.json$/.test(f));
  for (const f of files) {
    const year = Number(f.replace(/\D/g, ""));
    const data = readJson(f, {});
    await db.setMonthly(year, data);
    console.log("Migrated", f, "keys:", Object.keys(data).length);
  }

  const sp2bFiles = fs.readdirSync(DATA_DIR).filter((f) => /^sp2b_kab_\d+\.json$/.test(f));
  for (const f of sp2bFiles) {
    const year = Number(f.replace(/\D/g, ""));
    const store = readJson(f, { records: {}, last: {} });
    await db.setSp2bKab(year, { records: store.records || {}, last: store.last || {} });
    console.log("Migrated", f);
  }

  console.log("Migrasi selesai.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
