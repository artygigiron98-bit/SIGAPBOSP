/**
 * Inisialisasi schema MySQL + akun default
 * npm run init-db
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const bcrypt = require("bcryptjs");
const db = require("../lib/db");

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

async function main() {
  console.log("Connecting MySQL...", process.env.DB_HOST || "127.0.0.1", process.env.DB_NAME || "rekon_bosp");
  await db.ensureSchema();
  console.log("Schema OK");

  const users = await db.getUsers();
  if (!users.length) {
    const hashAdmin = await bcrypt.hash("admin2024", BCRYPT_ROUNDS);
    const hashOp = await bcrypt.hash("operator2024", BCRYPT_ROUNDS);
    await db.upsertUsers([
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
        password: hashOp,
        role: "Operator Sekolah",
        schoolNo: 1,
        npsn: "69762652",
        status: "Aktif",
      },
    ]);
    console.log("Default users created: admin / admin2024 , operator / operator2024");
  } else {
    console.log("Users already exist:", users.length);
  }

  const schools = await db.getSchools();
  if (!schools.length) {
    await db.upsertSchools([
      { no: 1, npsn: "69762652", name: "SD NEGERI 1 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
      { no: 2, npsn: "40102120", name: "SD NEGERI 2 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
      { no: 3, npsn: "40102130", name: "SD INPRES RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
      { no: 15, npsn: "40102210", name: "SMPN 1 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SMP" },
    ]);
    console.log("Default schools created");
  } else {
    console.log("Schools already exist:", schools.length);
  }

  console.log("Selesai. GANTI password default sebelum produksi!");
  process.exit(0);
}

main().catch((e) => {
  console.error("init-mysql gagal:", e.message);
  process.exit(1);
});
