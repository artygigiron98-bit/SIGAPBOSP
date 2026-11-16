/**
 * Inisialisasi data JSON default (versi secure).
 * Password di-hash dengan bcrypt.
 * Jalankan: npm run init-db
 */
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

fs.mkdirSync(DATA_DIR, { recursive: true });

function writeIfMissing(file, data) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
    console.log("Created", full);
    return true;
  }
  console.log("Exists ", full);
  return false;
}

async function main() {
  const hashAdmin = await bcrypt.hash("admin2024", BCRYPT_ROUNDS);
  const hashOperator = await bcrypt.hash("operator2024", BCRYPT_ROUNDS);

  const defaultUsers = [
    {
      name: "Administrator Dinas",
      username: "admin",
      password: hashAdmin,
      role: "Admin Dinas",
      schoolNo: null,
      npsn: "",
      status: "Aktif",
    },
    {
      name: "Operator SDN 1 Ratahan",
      username: "operator",
      password: hashOperator,
      role: "Operator Sekolah",
      schoolNo: 1,
      npsn: "69762652",
      status: "Aktif",
    },
  ];

  const defaultSchools = [
    { no: 1, npsn: "69762652", name: "SD NEGERI 1 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
    { no: 2, npsn: "40102120", name: "SD NEGERI 2 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
    { no: 3, npsn: "40102130", name: "SD INPRES RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
    { no: 15, npsn: "40102210", name: "SMPN 1 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SMP" },
  ];

  writeIfMissing("users.json", defaultUsers);
  writeIfMissing("schools.json", defaultSchools);
  writeIfMissing("meta.json", { version: 2, secure: true, createdAt: new Date().toISOString() });

  console.log("Data dir:", DATA_DIR);
  console.log("Selesai. Akun default:");
  console.log("  admin / admin2024     (Admin Dinas)");
  console.log("  operator / operator2024 (Operator Sekolah)");
  console.log("⚠️  GANTI PASSWORD DEFAULT SEBELUM DIPAKAI OPERASIONAL!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
