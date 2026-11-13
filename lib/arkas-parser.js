/**
 * Pembaca otomatis Lembar RKAS (PDF) hasil cetak ARKAS.
 *
 * Format dokumen (hasil cetak ARKAS):
 *   No | Kode Rekening | Kode Kegiatan | Uraian Kegiatan | Jumlah | [BOS REGULER | BOS DAERAH | AFIRMASI | KINERJA | SiLPA | BOS LAINNYA] x (Belanja Operasi, Belanja Modal)
 *   - baris tanpa kode rekening  = judul standar / sub kegiatan / kegiatan (subtotal, TIDAK dihitung)
 *   - baris dengan kode rekening = total per rekening           (DIHITUNG)
 *   - baris uraian "001. ..."    = rincian dari rekening di atasnya (TIDAK dihitung lagi)
 *
 * Aturan klasifikasi (sesuai ketentuan Dinas):
 *   1. Kode kegiatan 07.12*   -> Belanja Pegawai   (didahulukan; tidak ikut dihitung di Barang & Jasa)
 *   2. Kode rekening 5.1.02*  -> Belanja Barang dan Jasa
 *   3. Kode rekening 5.2.05*  -> Belanja Modal ATL
 *   4. Kode rekening 5.2.02*  -> Belanja Modal PM
 *   5. Selain itu             -> Belum terklasifikasi (bisa dikoreksi manual)
 *
 * Sumber dana dipilih pengguna saat unggah (BOSP Reguler / Kinerja / Prestasi / SiLPA BOSP Kinerja).
 * Nilai diambil dari kolom dokumen yang sesuai (lihat COLUMN_MAP); bila dokumen tidak memiliki kolom
 * untuk sumber dana itu (mis. RKAS khusus BOSP Prestasi), seluruh kolom "Jumlah" dicatat sebagai sumber dana pilihan.
 */
"use strict";

const KATEGORI = {
  pegawai: "Belanja Pegawai",
  barjas: "Belanja Barang dan Jasa",
  atl: "Belanja Modal ATL",
  pm: "Belanja Modal PM",
  lainnya: "Belum terklasifikasi",
};
const KAT_KEYS = Object.keys(KATEGORI);

const SUMBER = {
  reguler: "BOSP Reguler",
  kinerja: "BOSP Kinerja",
  prestasi: "BOSP Prestasi",
  silpaKinerja: "SiLPA BOSP Kinerja",
};
const SUMBER_KEYS = Object.keys(SUMBER);

/**
 * Pemetaan judul kolom di dokumen ARKAS -> sumber dana aplikasi.
 * key `null` = kolom tidak termasuk 4 sumber dana (hanya dilaporkan sebagai peringatan).
 * Urutan penting (yang lebih spesifik lebih dulu).
 */
const COLUMN_MAP = [
  { re: /BOSP?\s*REGULER/i, key: "reguler", label: "BOSP Reguler" },
  { re: /PRESTASI/i, key: "prestasi", label: "BOSP Prestasi" },
  { re: /SILPA/i, key: "silpaKinerja", label: "SiLPA" },
  { re: /KINERJA/i, key: "kinerja", label: "Kinerja" },
  { re: /BOSP?\s*LAINNYA/i, key: "prestasi", label: "BOS Lainnya" }, // asumsi: BOSP Prestasi
  { re: /BOSP?\s*DAERAH/i, key: null, label: "BOS Daerah" },
  { re: /AFIRMASI/i, key: null, label: "Afirmasi" },
];

/** Klasifikasi satu baris anggaran. */
function classify(kodeKegiatan, kodeRekening) {
  const kg = String(kodeKegiatan || "").trim().replace(/\.$/, "");
  const rk = String(kodeRekening || "").trim().replace(/\.$/, "");
  if (kg === "07.12" || kg.startsWith("07.12.")) return "pegawai";
  if (rk === "5.1.02" || rk.startsWith("5.1.02.")) return "barjas";
  if (rk === "5.2.05" || rk.startsWith("5.2.05.")) return "atl";
  if (rk === "5.2.02" || rk.startsWith("5.2.02.")) return "pm";
  return "lainnya";
}

const REK_RE = /^5\.\d\.\d{2}(?:\.\d{2}){0,2}(?:\.\d{3,4})?\.?$/;
const KEG_RE = /^\d{2}\.\d{2}(?:\.\d{2})?\.?$/;
const NUM_RE = /^-?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/;

function parseRupiah(str) {
  let s = String(str).trim().replace(/^Rp\.?\s*/i, "");
  if (!s || s === "-") return 0;
  const neg = s.startsWith("-");
  s = s.replace(/^-/, "");
  const lastDot = s.lastIndexOf("."), lastCom = s.lastIndexOf(",");
  let intPart = s, dec = "";
  if (lastDot >= 0 && lastCom >= 0) {
    const sep = lastDot > lastCom ? "." : ",";
    const idx = s.lastIndexOf(sep);
    intPart = s.slice(0, idx); dec = s.slice(idx + 1);
  } else if (lastCom >= 0 || lastDot >= 0) {
    const sep = lastCom >= 0 ? "," : ".";
    const parts = s.split(sep);
    const last = parts[parts.length - 1];
    if (parts.length > 1 && last.length <= 2) { intPart = parts.slice(0, -1).join(""); dec = last; }
    else intPart = parts.join("");
  }
  const v = Number(intPart.replace(/[.,]/g, "") + (dec ? "." + dec : ""));
  if (!Number.isFinite(v)) return 0;
  return neg ? -v : v;
}

/** Ambil item teks (dengan posisi) dari semua halaman. */
async function extractPages(buffer) {
  // pdfjs mencetak peringatan "Cannot polyfill DOMMatrix" di Node (tidak berpengaruh pada ekstraksi teks)
  const _w = console.warn, _l = console.log;
  const quiet = (orig) => (...a) => { if (!/polyfill/i.test(String(a[0]))) orig.apply(console, a); };
  console.warn = quiet(_w); console.log = quiet(_l);
  let pdfjs;
  try { pdfjs = require("pdfjs-dist/legacy/build/pdf.js"); } finally { console.warn = _w; console.log = _l; }

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0,
  }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => it.str && it.str.trim() !== "")
      .map((it) => ({ str: it.str.trim(), x0: it.transform[4], x1: it.transform[4] + (it.width || it.str.length * 4), y: it.transform[5] }));
    pages.push(items);
  }
  return pages;
}

/** Deteksi kolom sumber dana dari header (BOSP REGULER ... + Operasi/Modal). */
function detectColumns(pages) {
  for (const items of pages) {
    const raw = [];
    for (const it of items) {
      if (it.str.length > 28) continue;
      const m = COLUMN_MAP.find((c) => c.re.test(it.str));
      if (m) raw.push({ ...m, name: it.str, cx: (it.x0 + it.x1) / 2, y: it.y, x0: it.x0, x1: it.x1 });
    }
    if (raw.length < 2) continue;

    // Kelompokkan header sumber dana yang berada di pita Y yang sama (abaikan baris Penerimaan)
    raw.sort((a, b) => b.y - a.y || a.cx - b.cx);
    const bands = [];
    for (const g of raw) {
      let band = bands.find((b) => Math.abs(b.y - g.y) <= 6);
      if (!band) { band = { y: g.y, groups: [] }; bands.push(band); }
      // hindari duplikat label di pita yang sama
      if (!band.groups.some((x) => x.label === g.label && Math.abs(x.cx - g.cx) < 20)) band.groups.push(g);
    }
    // Pilih pita dengan paling banyak sumber dana (biasanya 4–6 kolom header tabel belanja)
    bands.sort((a, b) => b.groups.length - a.groups.length || b.y - a.y);
    const best = bands[0];
    if (!best || best.groups.length < 2) continue;
    const groups = best.groups.slice().sort((a, b) => a.cx - b.cx);
    const gy = best.y;

    // Sub-header Operasi / Modal di bawah nama sumber dana
    const subs = items
      .filter((it) => /^(Operasi|Modal)$/i.test(it.str) && it.y < gy - 2 && it.y > gy - 80)
      .sort((a, b) => a.x0 - b.x0);
    if (subs.length < 2) continue;

    const cols = [];
    // Pasangkan tiap sumber dana dengan 2 sub-kolom terdekat (Operasi lalu Modal)
    groups.forEach((g) => {
      const near = subs
        .map((s) => ({ s, d: Math.abs(((s.x0 + s.x1) / 2) - g.cx) }))
        .filter((x) => x.d < 55)
        .sort((a, b) => a.s.x0 - b.s.x0);
      // Ambil Operasi & Modal terdekat di bawah header ini
      const op = near.find((x) => /Operasi/i.test(x.s.str));
      const md = near.find((x) => /Modal/i.test(x.s.str));
      if (op) cols.push({ key: g.key, label: g.label, name: g.name, jenis: "operasi", expX1: op.s.x1 + 12.5, cx: (op.s.x0 + op.s.x1) / 2 });
      if (md) cols.push({ key: g.key, label: g.label, name: g.name, jenis: "modal", expX1: md.s.x1 + 12.5, cx: (md.s.x0 + md.s.x1) / 2 });
      // Fallback: jika label Operasi/Modal tidak ketemu, pakai 2 sub terdekat berurutan
      if (!op && !md && near.length >= 2) {
        cols.push({ key: g.key, label: g.label, name: g.name, jenis: "operasi", expX1: near[0].s.x1 + 12.5, cx: (near[0].s.x0 + near[0].s.x1) / 2 });
        cols.push({ key: g.key, label: g.label, name: g.name, jenis: "modal", expX1: near[1].s.x1 + 12.5, cx: (near[1].s.x0 + near[1].s.x1) / 2 });
      }
    });
    if (cols.length >= 2) return cols;
  }
  return null;
}

function sumberFromText(str) {
  if (/silpa|sisa\s+lebih/i.test(str)) return "silpaKinerja";
  if (/prestasi/i.test(str)) return "prestasi";
  if (/kinerja/i.test(str)) return "kinerja";
  if (/reguler/i.test(str)) return "reguler";
  return null;
}

function detectMeta(pages) {
  const first = (pages[0] || []).slice().sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lines = [];
  let cy = null;
  for (const it of first) {
    if (cy === null || Math.abs(it.y - cy) > 3) { lines.push([]); cy = it.y; }
    lines[lines.length - 1].push(it.str);
  }
  const text = lines.map((l) => l.join(" "));
  const head = text.join("\n");
  const meta = { tahap: null, tahun: null, npsn: null, namaSekolah: null, sumberList: [] };
  const np = head.match(/NPSN\s*:?\s*(\d{8})/i);
  if (np) meta.npsn = np[1];
  const ty = head.match(/TAHUN\s*ANGGARAN\s*:?\s*(20\d{2})/i);
  if (ty) meta.tahun = Number(ty[1]);
  const ns = head.match(/Nama\s*Sekolah\s*:?\s*([^\n]+)/i);
  if (ns) meta.namaSekolah = ns[1].trim();
  // tahap & sumber dana dibaca dari bagian PENERIMAAN ("4.3.1.01. BOS Reguler Perubahan 213.400.000")
  const recLines = text.filter((l) => /^4\.\d/.test(l));
  const rec = recLines.join(" ") || text.filter((l) => /penerimaan/i.test(l)).join(" ");
  if (/perubahan/i.test(rec)) meta.tahap = "perubahan";
  else if (/\b(induk|murni)\b/i.test(rec)) meta.tahap = "induk";
  else if (/perubahan/i.test(head)) meta.tahap = "perubahan";
  meta.sumberList = [];
  recLines.forEach((l) => { const k = sumberFromText(l); if (k && !meta.sumberList.includes(k)) meta.sumberList.push(k); });
  return meta;
}

function emptyBucket() { return { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 }; }
function emptyTotals() { return emptyBucket(); }

/** Hitung total per jenis belanja dari item (dipakai juga setelah koreksi manual). */
function sumTotals(items) {
  const t = emptyBucket();
  for (const it of items || []) {
    const kat = KATEGORI[it.kategori] ? it.kategori : "lainnya";
    const v = Number(it.jumlah) || 0;
    t[kat] += v; t.total += v;
  }
  return t;
}

function assignLines(textItems, anchorYs) {
  const m = anchorYs.length;
  if (!m) return [];
  // kelompokkan item menjadi baris teks (y mirip)
  const sorted = textItems.slice().sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lines = [];
  for (const it of sorted) {
    const ln = lines.find((l) => Math.abs(l.y - it.y) <= 2);
    if (ln) ln.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  lines.forEach((l) => { l.items.sort((a, b) => a.x0 - b.x0); l.text = l.items.map((i) => i.str).join(" "); });
  const k = lines.length;
  const res = anchorYs.map(() => "");
  if (!k) return res;
  if (k < m) { // lebih sedikit baris teks daripada nomor: cocokkan terdekat
    lines.forEach((l) => {
      let bi = 0, bd = Infinity;
      anchorYs.forEach((y, i) => { const d = Math.abs(y - l.y); if (d < bd) { bd = d; bi = i; } });
      res[bi] = (res[bi] + " " + l.text).trim();
    });
    return res;
  }
  const INF = 1e18;
  const pre = [0]; lines.forEach((l, i) => pre.push(pre[i] + l.y));
  const cost = (i, a, b) => { const len = b - a; const mean = (pre[b] - pre[a]) / len; const d = mean - anchorYs[i]; return d * d * len; };
  const dp = Array.from({ length: m + 1 }, () => new Array(k + 1).fill(INF));
  const bk = Array.from({ length: m + 1 }, () => new Array(k + 1).fill(0));
  dp[0][0] = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = i; j <= k; j++) {
      for (let a = i - 1; a < j; a++) {
        if (dp[i - 1][a] >= INF) continue;
        const c = dp[i - 1][a] + cost(i - 1, a, j);
        if (c < dp[i][j]) { dp[i][j] = c; bk[i][j] = a; }
      }
    }
  }
  let j = k;
  for (let i = m; i >= 1; i--) {
    const a = bk[i][j];
    res[i - 1] = lines.slice(a, j).map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
    j = a;
  }
  return res;
}

function nearestCol(cols, x1) {
  let best = -1, bd = Infinity;
  cols.forEach((c, i) => { const d = Math.abs(c.expX1 - x1); if (d < bd) { bd = d; best = i; } });
  return bd <= 40 ? best : -1;
}
function fmt(n) { return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n); }

/**
 * Parse PDF -> { items, totals, meta, warnings, stats, sampleLines, excluded }
 * item: { no, kodeKegiatan, kodeRekening, uraian, jumlah, alok:{reguler,...}, kategori, auto:true }
 */
async function parseRkasPdf(buffer, opts) {
  const sel = opts && SUMBER[opts.sumber] ? opts.sumber : null;
  const pages = await extractPages(buffer);
  const warnings = [];
  const out = { items: [], totals: emptyTotals(), meta: {}, warnings, stats: {}, sampleLines: [], basis: null };

  if (!pages.some((p) => p.length)) {
    warnings.push("PDF tidak memuat teks yang dapat dibaca (kemungkinan hasil scan/gambar). Gunakan PDF asli hasil cetak ARKAS.");
    return out;
  }
  out.meta = detectMeta(pages);
  const cols = detectColumns(pages);
  if (!cols) {
    warnings.push("Header kolom sumber dana (BOS REGULER, KINERJA, SiLPA, dst.) tidak ditemukan. Pastikan PDF adalah Lembar RKAS dari ARKAS.");
    out.sampleLines = pages[0].slice(0, 80).map((i) => i.str);
    return out;
  }
  const firstColX = cols[0].expX1;

  const rows = [];
  const pdfTotals = { jumlah: null, cols: null };
  let anchorCount = 0;

  for (const items of pages) {
    // baris berdasarkan kolom "No" (angka di tepi kiri)
    const anchors = items
      .filter((it) => /^\d{1,4}$/.test(it.str) && it.x1 < 42 && it.x0 > 12)
      .sort((a, b) => b.y - a.y);
    anchorCount += anchors.length;

    // baris total dokumen ("Jumlah" di kolom kegiatan, tanpa nomor)
    const jm = items.find((it) => it.str === "Jumlah" && it.x0 > 90 && it.x0 < 160);
    if (jm && !anchors.some((a) => Math.abs(a.y - jm.y) < 4)) {
      const nums = items.filter((it) => Math.abs(it.y - jm.y) < 4 && it.x0 > 200 && NUM_RE.test(it.str));
      let jumlah = null; const colv = new Array(cols.length).fill(0);
      nums.forEach((n) => {
        if (n.x1 < firstColX - 30) { jumlah = parseRupiah(n.str); return; }
        const idx = nearestCol(cols, n.x1); if (idx >= 0) colv[idx] = parseRupiah(n.str);
      });
      pdfTotals.jumlah = jumlah; pdfTotals.cols = colv;
    }

    // batas atas tabel = di bawah header "Operasi/Modal"
    const hdr = items.filter((it) => /^(Operasi|Modal)$/i.test(it.str));
    const tableTop = hdr.length ? Math.min.apply(null, hdr.map((h) => h.y)) - 2 : Infinity;
    const uraianItems = items.filter((it) => it.y < tableTop && it.x0 >= 140 && it.x0 < 310 && !(it.x1 > 318 && NUM_RE.test(it.str)));
    const uraianByAnchor = assignLines(uraianItems, anchors.map((a) => a.y));

    anchors.forEach((a, i) => {
      const inBand = items.filter((it) => Math.abs(it.y - a.y) <= 4);
      const line = inBand;

      const rek = line.find((it) => it.x0 >= 30 && it.x0 < 115 && REK_RE.test(it.str));
      const keg = line.find((it) => it.x0 >= 100 && it.x0 < 160 && KEG_RE.test(it.str));
      const uraian = uraianByAnchor[i] || "";

      let jumlah = 0; const alokCols = new Array(cols.length).fill(0);
      line.filter((it) => it.x0 >= 200 && NUM_RE.test(it.str)).forEach((n) => {
        if (n.x1 < firstColX - 30) { jumlah = parseRupiah(n.str); return; }
        const idx = nearestCol(cols, n.x1); if (idx >= 0) alokCols[idx] = parseRupiah(n.str);
      });
      rows.push({
        no: Number(a.str),
        kodeRekening: rek ? rek.str.replace(/\.$/, "") : "",
        kodeKegiatan: keg ? keg.str.replace(/\.$/, "") : "",
        uraian, jumlah, alokCols,
      });
    });
  }

  if (!anchorCount) {
    warnings.push("Nomor baris tidak ditemukan. Format dokumen tidak dikenali sebagai Lembar RKAS ARKAS.");
    out.sampleLines = pages[0].slice(0, 80).map((i) => i.str);
    return out;
  }

  // Baris dihitung: baris pertama dari tiap kelompok berurutan (rekening + kegiatan sama) = total rekening.
  // Baris berikutnya dalam kelompok itu ("001. ...", "002. ...") adalah rincian dan tidak dihitung lagi.
  const headers = [];
  let skippedDetail = 0, skippedHeader = 0, detailMismatch = 0;
  let prevKey = null, cur = null;
  const closeGroup = () => { if (cur && cur.hasDetail && Math.abs(cur.detailSum - cur.row.jumlah) > 1) detailMismatch++; };
  for (const r of rows) {
    if (!r.kodeRekening) { skippedHeader++; closeGroup(); prevKey = null; cur = null; continue; }
    const key = r.kodeRekening + "|" + r.kodeKegiatan;
    if (key === prevKey && cur) { skippedDetail++; cur.hasDetail = true; cur.detailSum += r.jumlah; continue; }
    closeGroup();
    prevKey = key;
    cur = { row: r, hasDetail: false, detailSum: 0 };
    headers.push(r);
  }
  closeGroup();

  // ---- Pilih dasar nilai: kolom sumber dana terpilih, atau kolom "Jumlah" ----
  const selIdx = sel ? cols.map((c, i) => (c.key === sel ? i : -1)).filter((i) => i >= 0) : [];
  const colTotal = new Array(cols.length).fill(0);
  headers.forEach((r) => r.alokCols.forEach((v, i) => { colTotal[i] += v; }));
  const selTotal = selIdx.reduce((a2, i) => a2 + colTotal[i], 0);
  const basis = sel && selTotal > 0 ? "kolom" : "jumlah";
  out.basis = basis;

  // sumberList: prioritas dari Penerimaan; tambahkan sumber dari kolom yang benar-benar bernilai
  if (!out.meta.sumberList) out.meta.sumberList = [];
  cols.forEach((c, i) => {
    if (c.key && colTotal[i] > 0 && out.meta.sumberList.indexOf(c.key) === -1) {
      out.meta.sumberList.push(c.key);
    }
  });

  const items = [];
  for (const r of headers) {
    const sumCols = r.alokCols.reduce((a2, v) => a2 + v, 0);
    const amount = basis === "kolom" ? selIdx.reduce((a2, i) => a2 + r.alokCols[i], 0) : (r.jumlah || sumCols);
    if (!amount) continue;
    items.push({
      no: r.no,
      kodeKegiatan: r.kodeKegiatan,
      kodeRekening: r.kodeRekening,
      uraian: r.uraian,
      jumlah: amount,
      kategori: classify(r.kodeKegiatan, r.kodeRekening),
      auto: true,
    });
  }

  out.items = items;
  out.totals = sumTotals(items);
  out.stats = { pages: pages.length, rows: rows.length, counted: items.length, skippedDetail, skippedHeader, detailMismatch, basis, columns: cols.map((c) => c.label + " " + c.jenis) };

  // ---- Peringatan sesuai sumber dana ----
  const selName = sel ? SUMBER[sel] : null;
  const meta = out.meta;
  const srcMismatch = !!(sel && meta.sumberList && meta.sumberList.length && !meta.sumberList.includes(sel));
  if (srcMismatch) {
    warnings.push("Bagian Penerimaan dokumen menyebut " + meta.sumberList.map((k) => SUMBER[k]).join(", ") + ", sedangkan sumber dana yang Anda pilih adalah " + selName + ". Pastikan sumber dana yang dipilih sudah benar.");
  }
  if (sel && basis === "jumlah") {
    warnings.push("Dokumen tidak memiliki kolom bernilai untuk " + selName + "; seluruh kolom 'Jumlah' dokumen (Rp " + fmt(items.reduce((a2, it) => a2 + it.jumlah, 0)) + ") dicatat sebagai " + selName + ".");
  }
  const otherCols = {};
  cols.forEach((c, i) => {
    if (!colTotal[i]) return;
    if (basis === "kolom" && selIdx.includes(i)) return;
    otherCols[c.label] = otherCols[c.label] || { sum: 0, key: c.key };
    otherCols[c.label].sum += colTotal[i];
  });
  Object.keys(otherCols).forEach((label) => {
    const o = otherCols[label];
    if (basis === "kolom") {
      warnings.push("Dokumen juga memuat kolom '" + label + "' senilai Rp " + fmt(o.sum) + " yang TIDAK dihitung di " + selName + "." +
        (o.key ? " Unggah dokumen ini sekali lagi dengan memilih " + SUMBER[o.key] + " bila ingin mencatatnya." : " Kolom ini bukan salah satu dari 4 sumber dana."));
    } else if (sel && !srcMismatch && o.key && o.key !== sel) {
      warnings.push("Dokumen memuat kolom '" + label + "' (Rp " + fmt(o.sum) + ") yang termasuk dalam nilai 'Jumlah' dan ikut dicatat sebagai " + selName + ". Periksa apakah ini benar.");
    }
  });
  if (sel === "prestasi" && cols.some((c, i) => c.label === "BOS Lainnya" && colTotal[i] > 0 && selIdx.includes(i))) {
    warnings.push("Nilai BOSP Prestasi dibaca dari kolom 'BOS Lainnya' pada dokumen.");
  }

  // ---- Validasi terhadap baris "Jumlah" di dokumen ----
  const parsedAll = items.reduce((a2, it) => a2 + (Number(it.jumlah) || 0), 0);
  let expected = null;
  if (pdfTotals.cols) expected = basis === "kolom" ? selIdx.reduce((a2, i) => a2 + pdfTotals.cols[i], 0) : pdfTotals.jumlah;
  if (expected != null) {
    out.stats.pdfTotal = expected;
    if (Math.abs(parsedAll - expected) > 1) {
      warnings.push("Total hasil baca (Rp " + fmt(parsedAll) + ") berbeda dengan baris 'Jumlah' di dokumen (Rp " + fmt(expected) + "). Periksa rincian, mungkin ada baris yang tidak terbaca.");
    }
  } else {
    warnings.push("Baris 'Jumlah' akhir dokumen tidak ditemukan, total tidak dapat divalidasi otomatis.");
  }
  if (detailMismatch) warnings.push(detailMismatch + " rekening memiliki total yang tidak sama dengan jumlah rinciannya di dokumen.");
  if (!items.length) warnings.push("Tidak ada baris anggaran bersandi rekening (5.x.xx) dengan nilai untuk sumber dana ini.");
  if (out.totals.lainnya > 0) warnings.push("Ada baris yang belum terklasifikasi (kode bukan 07.12 / 5.1.02 / 5.2.05 / 5.2.02). Silakan koreksi manual bila perlu.");
  if (items.some((r) => !r.kodeKegiatan)) warnings.push("Sebagian baris tidak memiliki kode kegiatan terbaca; klasifikasi memakai kode rekening saja.");
  return out;
}

module.exports = { parseRkasPdf, classify, sumTotals, emptyTotals, KATEGORI, KAT_KEYS, SUMBER, SUMBER_KEYS, COLUMN_MAP, parseRupiah };
