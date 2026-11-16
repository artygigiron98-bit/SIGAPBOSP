# Rekon BOSP — Node.js + MySQL (Secure)

Backend Express + **MySQL** untuk Dashboard Rekonsiliasi Dana BOSP.

## Persyaratan

- Node.js >= 18
- MySQL 8 (atau MariaDB 10.5+)

## Instalasi

1. Buat file `.env` dari contoh:
   ```bash
   cp .env.example .env
   ```
2. Isi koneksi MySQL di `.env`:
   ```
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=password_anda
   DB_NAME=rekon_bosp
   JWT_SECRET=ganti-string-acak-panjang
   ```
3. Install & init:
   ```bash
   npm install
   npm run init-db
   npm start
   ```
4. Buka http://localhost:3000  
   Login: `admin` / `admin2024`

### Migrasi dari data JSON lama

```bash
npm run migrate-json
```

## Struktur database

| Tabel | Isi |
|-------|-----|
| `schools` | Master sekolah |
| `users` | Akun login (password bcrypt) |
| `monthly_data` | Realisasi per tahun/sekolah/bulan (JSON payload) |
| `sp2b_kab` | Rekap SP2B kabupaten |
| `audit_log` | Log aktivitas |

PDF tetap di folder `uploads/` (bukan di MySQL).

## Multi-perangkat (LAN)

1. Satu PC jalankan `npm start` + MySQL  
2. Perangkat lain buka `http://IP-PC:3000`  
3. Semua data realisasi terbaca dari MySQL yang sama  

## Production

- Ganti password default
- Set `NODE_ENV=production`
- JWT_SECRET kuat
- Backup MySQL rutin + folder `uploads/`

## Penganggaran (RKAS ARKAS) — v1.4.0
Setelah mengganti file proyek, jalankan `npm install` (menambah `pdfjs-dist`) lalu `npm start`.
Halaman terpisah: `http://localhost:3000/penganggaran.html` (juga lewat sidebar → **Penganggaran RKAS**).
- **Operator**: otomatis hanya sekolahnya. Pilih tahap & sumber dana → unggah PDF RKAS → tinjau/koreksi → **Ajukan**.
- **Admin Dinas**: cari & pilih sekolah, pilih tahap & sumber dana, unggah/tinjau; verifikasi/tolak/buka kunci; **Rekap & Cetak** per tahap dan sumber dana.
- Pemetaan kolom ARKAS → sumber dana: `COLUMN_MAP` di `lib/arkas-parser.js`.
- API: `GET /api/anggaran`, `GET /api/anggaran/detail`, `POST /api/anggaran/upload`, `POST /api/anggaran/action`.

## Struktur Halaman — v1.5.0
| Halaman | Isi |
|---|---|
| `/` (index.html) | Login, Beranda: progres rekonsiliasi + rekap penganggaran ARKAS, menu Data Master |
| `/realisasi.html` | Realisasi Belanja: periode, KPI, tabel rekonsiliasi, input realisasi |
| `/penganggaran.html` | Penganggaran RKAS (ARKAS) |

Kode bersama: `app.js`, `app.css`, `sidebar.css`, `nav-menu.js` (struktur menu sidebar ada di `nav-menu.js`).
Menu dari halaman lain membuka aksi lewat `?open=` (mis. `/?open=master`).
