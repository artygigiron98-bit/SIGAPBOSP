/**
 * Data Master Sekolah — identitas Kepala Sekolah & Bendahara BOSP (akun Operator Sekolah).
 *
 * Dipakai bersama oleh index.html dan realisasi.html (dimuat setelah app.js):
 *   - Modal "Data Master Sekolah"  : input Nama, NIP, Pangkat/Golongan, Jabatan
 *   - Kartu rinci                  : pengganti tabel "Data Realisasi Rekonsiliasi Sekolah Anda"
 *   - Cetak Rekap Realisasi        : dokumen cetak dengan kolom tanda tangan pejabat
 *   - Dashboard Rekap              : identitas + tanda tangan pejabat untuk akun sekolah
 *
 * Data tersimpan di data/schools.json (kepalaSekolah, bendahara) lewat GET/PUT /api/school-profile.
 * Bergantung pada variabel/fungsi global app.js: currentUser, baseSchools, filteredData, monthlyData,
 * findSchoolForUser, formatRupiah, periodLabel, refMonth, computeRolledData, activeYear, nodeHeaders,
 * NODE_API_BASE, DOC_LABELS, LOCKED_STATUSES, isReconDone, openInputModal, openModal.
 */
(function (w) {
  "use strict";

  var PANGKAT = [
    "Juru Muda (I/a)", "Juru Muda Tk.I (I/b)", "Juru (I/c)", "Juru Tk.I (I/d)",
    "Pengatur Muda (II/a)", "Pengatur Muda Tk.I (II/b)", "Pengatur (II/c)", "Pengatur Tk.I (II/d)",
    "Penata Muda (III/a)", "Penata Muda Tk.I (III/b)", "Penata (III/c)", "Penata Tk.I (III/d)",
    "Pembina (IV/a)", "Pembina Tk.I (IV/b)", "Pembina Utama Muda (IV/c)", "Pembina Utama Madya (IV/d)", "Pembina Utama (IV/e)"
  ];
  var KEPSEK_DEF = "Kepala Sekolah", BEND_DEF = "Bendahara BOSP";
  var state = { no: null, loaded: null };

  /* ------------------------------------------------------------------ util */
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(id) { return document.getElementById(id); }
  function rp(n) { return typeof formatRupiah === "function" ? formatRupiah(n || 0) : "Rp " + (n || 0); }
  function isOp() { return !!(typeof currentUser !== "undefined" && currentUser && currentUser.role === "Operator Sekolah"); }
  function mySchool() { try { return isOp() ? findSchoolForUser(currentUser) : null; } catch (e) { return null; } }
  function norm(p, def) {
    p = p && typeof p === "object" ? p : {};
    return { nama: String(p.nama || "").trim(), nip: String(p.nip || "").trim(), pangkat: String(p.pangkat || "").trim(), jabatan: String(p.jabatan || "").trim() || def };
  }
  function kepsekOf(s) { return norm(s && s.kepalaSekolah, KEPSEK_DEF); }
  function bendOf(s) { return norm(s && s.bendahara, BEND_DEF); }
  function lengkap(s) {
    var k = kepsekOf(s), b = bendOf(s);
    return !!(k.nama && k.nip && k.pangkat && b.nama && b.nip && b.pangkat);
  }
  function tanggalIni() {
    return new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }
  function toast(msg, type) { if (typeof w.rkToast === "function") w.rkToast(msg, type); else alert(msg); }
  function api(path, opt) {
    opt = opt || {};
    return fetch(NODE_API_BASE + path, {
      method: opt.method || "GET", credentials: "include", cache: "no-store",
      headers: typeof nodeHeaders === "function" ? nodeHeaders() : { "Content-Type": "application/json" },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.status === "error") throw new Error(j.message || ("HTTP " + r.status));
        return j;
      });
    });
  }

  /* --------------------------------------------- blok tanda tangan (cetak) */
  function sigCol(head, p, def) {
    return '<div class="text-center" style="min-width:230px">' +
      '<p>' + head + '</p><p class="font-bold">' + esc(p.jabatan || def) + ',</p>' +
      '<div style="height:62px"></div>' +
      '<p class="font-bold underline">' + (p.nama ? esc(p.nama) : "(................................)") + '</p>' +
      (p.pangkat ? '<p>' + esc(p.pangkat) + '</p>' : '') +
      '<p>NIP. ' + (p.nip ? esc(p.nip) : "................................") + '</p></div>';
  }
  /** Kiri: Mengetahui Kepala Sekolah · Kanan: tempat/tanggal + Bendahara BOSP */
  function signHtml(s) {
    return '<div class="flex justify-between items-start gap-6 font-sans text-xs pt-2" style="page-break-inside:avoid">' +
      sigCol("Mengetahui,", kepsekOf(s), KEPSEK_DEF) +
      sigCol("Minahasa Tenggara, " + tanggalIni(), bendOf(s), BEND_DEF) + '</div>';
  }

  /* ----------------------------------------------- peringatan data belum lengkap */
  function noticeHtml() {
    var s = mySchool();
    if (!isOp() || !s || lengkap(s)) return "";
    return '<div class="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs no-print" style="margin-top:12px">' +
      '<i class="fa-solid fa-triangle-exclamation text-base"></i>' +
      '<div class="flex-1 min-w-[200px]"><b>Data Master Sekolah belum lengkap.</b> Identitas Kepala Sekolah dan Bendahara BOSP dipakai pada tanda tangan dokumen rekap &amp; cetak.</div>' +
      '<button type="button" class="btn btn-gold" onclick="openProfileModal()"><i class="fa-solid fa-school-flag"></i> Lengkapi Sekarang</button></div>';
  }

  /* ================================================= MODAL DATA MASTER SEKOLAH */
  function pejabatFields(prefix, title, icon, def) {
    function f(id, label, ph, extra) {
      return '<label class="block"><span class="font-semibold text-slate-700">' + label + '</span>' +
        '<input id="pf_' + prefix + '_' + id + '" type="text" ' + (extra || "") + ' placeholder="' + ph + '" autocomplete="off" ' +
        'class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"></label>';
    }
    return '<fieldset class="border border-slate-200 rounded-xl p-4 space-y-3">' +
      '<legend class="px-2 font-bold text-[#0F2C59] text-sm"><i class="fa-solid ' + icon + ' mr-1.5"></i>' + title + '</legend>' +
      f("nama", "Nama Lengkap &amp; Gelar" + (prefix === "kepsek" ? ' <span class="text-rose-600">*</span>' : ""), "Contoh: Nama Lengkap, S.Pd., M.Pd.", 'maxlength="120"') +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
      '<div>' + f("nip", "NIP", "18 digit, tanpa spasi", 'inputmode="numeric" maxlength="30" oninput="Pejabat.hintNip(this)"') +
      '<p id="pf_' + prefix + '_nip_hint" class="mt-1 text-[10px] text-slate-400"></p></div>' +
      f("pangkat", "Pangkat / Golongan", "Pilih atau ketik, mis. Penata Tk.I (III/d)", 'maxlength="80" list="pfPangkatList"') +
      '</div>' +
      f("jabatan", "Jabatan", def, 'maxlength="80"') +
      '</fieldset>';
  }

  function ensureModals() {
    if ($("profileModal")) return;
    var opts = PANGKAT.map(function (p) { return '<option value="' + esc(p) + '"></option>'; }).join("");
    var wrap = document.createElement("div");
    wrap.innerHTML =
      /* ---------- Data Master Sekolah ---------- */
      '<div id="profileModal" class="fixed inset-0 bg-slate-900 bg-opacity-50 hidden z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-labelledby="profileTitle">' +
      '<div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden max-h-[92vh] flex flex-col">' +
      '<div class="bg-[#0F2C59] text-white px-6 py-4 flex justify-between items-center">' +
      '<h3 id="profileTitle" class="text-base font-bold"><i class="fa-solid fa-school-flag mr-2"></i> Data Master Sekolah — Identitas Pejabat</h3>' +
      '<button type="button" onclick="closeProfileModal()" class="text-white hover:text-slate-300 text-xl font-bold" aria-label="Tutup">&times;</button></div>' +
      '<div class="p-6 overflow-y-auto space-y-4 text-xs">' +
      '<div id="pf_info" class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 bg-slate-50 border border-slate-200 rounded-xl p-4"></div>' +
      '<datalist id="pfPangkatList">' + opts + '</datalist>' +
      pejabatFields("kepsek", "Kepala Sekolah", "fa-user-tie", KEPSEK_DEF) +
      pejabatFields("bend", "Bendahara BOSP", "fa-user-pen", BEND_DEF) +
      '<p class="text-[11px] text-slate-500"><i class="fa-solid fa-circle-info mr-1"></i>Data ini otomatis dipakai pada <b>Kartu Rinci</b>, <b>Dashboard Rekap</b>, serta kolom tanda tangan <b>Cetak Rekap Realisasi</b> dan <b>Rekap Penganggaran</b>. Untuk PPPK / non-ASN, tulis golongan seperti “PPPK Gol. IX”, atau “-” bila tidak ada.</p>' +
      '<p id="pf_meta" class="text-[10px] text-slate-400"></p>' +
      '</div>' +
      '<div class="bg-slate-100 px-6 py-3 flex justify-end gap-3 border-t border-slate-200">' +
      '<button type="button" onclick="closeProfileModal()" class="bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-lg">Batal</button>' +
      '<button type="button" id="pf_saveBtn" onclick="Pejabat.save()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"><i class="fa-solid fa-floppy-disk mr-1"></i> Simpan Data Master</button>' +
      '</div></div></div>' +

      /* ---------- Cetak Rekap Realisasi Sekolah ---------- */
      '<div id="rekapSekolahModal" class="fixed inset-0 bg-slate-900 bg-opacity-50 hidden z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">' +
      '<div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden max-h-[92vh] flex flex-col">' +
      '<div class="bg-[#0F2C59] text-white px-6 py-4 flex justify-between items-center no-print">' +
      '<h3 class="text-base font-bold"><i class="fa-solid fa-file-lines mr-2"></i> Pratinjau Rekap Realisasi Sekolah</h3>' +
      '<button type="button" onclick="closeRekapSekolahModal()" class="text-white hover:text-slate-300 text-xl font-bold" aria-label="Tutup">&times;</button></div>' +
      '<div id="rekapSekolahPrintArea" class="p-8 overflow-y-auto bg-white space-y-4 text-slate-900 text-[11px] leading-snug font-serif"></div>' +
      '<div class="bg-slate-100 px-6 py-3 flex justify-end gap-3 border-t border-slate-200 no-print">' +
      '<button type="button" onclick="Pejabat.printRekap()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"><i class="fa-solid fa-print mr-1"></i> Cetak Rekap</button>' +
      '<button type="button" onclick="closeRekapSekolahModal()" class="bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-lg">Tutup</button>' +
      '</div></div></div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  function setVal(id, v) { var el = $(id); if (el) el.value = v || ""; }
  function getVal(id) { var el = $(id); return el ? el.value.trim() : ""; }

  function fillForm(sch) {
    var k = kepsekOf(sch), b = bendOf(sch);
    ["nama", "nip", "pangkat", "jabatan"].forEach(function (f) { setVal("pf_kepsek_" + f, k[f]); setVal("pf_bend_" + f, b[f]); });
    hintNip($("pf_kepsek_nip")); hintNip($("pf_bend_nip"));
    var info = $("pf_info");
    if (info) {
      var row = function (l, v) { return '<div class="flex gap-2"><span class="w-28 shrink-0 text-slate-500">' + l + '</span><b class="text-slate-800 break-words">' + (esc(v) || "-") + '</b></div>'; };
      info.innerHTML = row("Nama Sekolah", sch.name) + row("NPSN", sch.npsn) + row("Kecamatan", sch.kecamatan) +
        row("Status / Jenjang", (sch.status || "NEGERI") + " / " + (sch.jenjang || "SD")) + row("Alamat", sch.alamat);
    }
    var meta = $("pf_meta");
    if (meta) {
      var d = sch.profilDiubah;
      meta.textContent = d && d.waktu ? "Terakhir diperbarui oleh " + d.oleh + " pada " + new Date(d.waktu).toLocaleString("id-ID") + "." : "Belum pernah diisi.";
    }
  }

  function openProfileModal(no) {
    ensureModals();
    var sch = isOp() ? mySchool() : (typeof baseSchools !== "undefined" ? baseSchools.find(function (s) { return Number(s.no) === Number(no); }) : null);
    if (!sch) { alert("Data sekolah Anda tidak ditemukan di Data Master. Hubungi Admin Dinas."); return; }
    state.no = Number(sch.no);
    fillForm(sch);                                   // tampil cepat dari data lokal
    $("profileModal").classList.remove("hidden");
    var q = isOp() ? "" : "?no=" + encodeURIComponent(sch.no);
    api("/api/school-profile" + q).then(function (j) {   // lalu sinkron dengan server
      if (!j.school || state.no !== Number(j.school.no)) return;
      mergeLocal(j.school); fillForm(Object.assign({}, sch, j.school));
    }).catch(function () { /* pakai data lokal */ });
    setTimeout(function () { var el = $("pf_kepsek_nama"); if (el) el.focus(); }, 60);
  }
  function closeProfileModal() { var m = $("profileModal"); if (m) m.classList.add("hidden"); }

  function hintNip(el) {
    if (!el || !el.id) return;
    var h = $(el.id + "_hint");
    if (!h) return;
    var digits = String(el.value || "").replace(/\D/g, "").length;
    if (!el.value.trim()) { h.textContent = ""; h.className = "mt-1 text-[10px] text-slate-400"; return; }
    if (digits === 18) { h.textContent = "✓ 18 digit"; h.className = "mt-1 text-[10px] text-emerald-600"; }
    else { h.textContent = digits + " digit — NIP umumnya 18 digit"; h.className = "mt-1 text-[10px] text-amber-600"; }
  }

  function mergeLocal(sch) {
    if (typeof baseSchools === "undefined") return;
    var t = baseSchools.find(function (s) { return Number(s.no) === Number(sch.no); });
    if (!t) return;
    t.kepalaSekolah = sch.kepalaSekolah; t.bendahara = sch.bendahara; t.profilDiubah = sch.profilDiubah || t.profilDiubah;
    try { localStorage.setItem("bosp_baseSchools", JSON.stringify(baseSchools)); } catch (e) {}
  }

  function save() {
    var body = {
      no: state.no,
      kepalaSekolah: { nama: getVal("pf_kepsek_nama"), nip: getVal("pf_kepsek_nip"), pangkat: getVal("pf_kepsek_pangkat"), jabatan: getVal("pf_kepsek_jabatan") },
      bendahara: { nama: getVal("pf_bend_nama"), nip: getVal("pf_bend_nip"), pangkat: getVal("pf_bend_pangkat"), jabatan: getVal("pf_bend_jabatan") }
    };
    if (!body.kepalaSekolah.nama) { toast("Nama Kepala Sekolah wajib diisi.", "err"); var el = $("pf_kepsek_nama"); if (el) el.focus(); return; }
    var btn = $("pf_saveBtn");
    if (btn) { btn.disabled = true; btn.classList.add("opacity-60"); }
    api("/api/school-profile", { method: "PUT", body: body }).then(function (j) {
      mergeLocal(j.school);
      if (w.SigapFirebaseDrive && typeof w.SigapFirebaseDrive.syncSchoolToFirestore === "function") {
        w.SigapFirebaseDrive.syncSchoolToFirestore(j.school).catch(function (e) { console.warn("Sync school profile Firestore:", e); });
      }
      closeProfileModal();
      toast("Data Master Sekolah berhasil disimpan ke Firebase.", "ok");
      refreshViews();
    }).catch(function (e) {
      toast("Gagal menyimpan: " + e.message, "err");
    }).then(function () {
      if (btn) { btn.disabled = false; btn.classList.remove("opacity-60"); }
    });
  }

  /** Segarkan tampilan yang memakai data pejabat setelah disimpan. */
  function refreshViews() {
    try { renderCard(); } catch (e) {}
    try { if (typeof renderProgressPanel === "function" && PAGE === "beranda") renderProgressPanel(); } catch (e) {}
    var d = $("schoolDashboardModal");
    if (d && !d.classList.contains("hidden") && typeof openSchoolDashboardModal === "function") { try { openSchoolDashboardModal(); } catch (e) {} }
    var r = $("rekapSekolahModal");
    if (r && !r.classList.contains("hidden")) buildRekap();
  }

  /* ======================================================== KARTU RINCI */
  var PEND_ROWS = [["reguler", "BOSP Reguler"], ["kinerja", "BOSP Kinerja"], ["jagirMasuk", "Jagir Masuk (Jasa Giro)"],
    ["setoranTunai", "Setoran Tunai"], ["lebihTransferMasuk", "Lebih Transfer / Kesalahan Setor (Masuk)"]];
  var BEL_ROWS = [["pegawai", "Pegawai (Honor)"], ["barjasReg", "Barang & Jasa Reguler"], ["barjasKin", "Barang & Jasa Kinerja"],
    ["pm", "Peralatan Mesin (PM)"], ["pmKin", "Peralatan Mesin Kinerja"], ["atl", "Aset Tetap Lainnya (ATL)"],
    ["atlKin", "Aset Tetap Lainnya Kinerja"], ["jagirKeluar", "Jagir Keluar (Setor Jagir)"], ["lebihTransferKeluar", "Lebih Transfer / Kesalahan Setor (Keluar)"]];

  function statusBadge(st) {
    var c = "bg-slate-100 text-slate-700";
    if (st === "Diajukan Sekolah") c = "bg-amber-100 text-amber-800";
    else if (st === "Diverifikasi Dinas") c = "bg-blue-100 text-blue-800";
    else if (st === "Disahkan BUD") c = "bg-emerald-100 text-emerald-800";
    return '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ' + c + '">' + esc(st || "Draft") + '</span>';
  }
  function rekonOf(no) {
    try {
      var r = computeRolledData(), d = r[no] && r[no][refMonth()];
      return d ? { sp2b: d.saldoSP2B || 0, rc: d.saldoRCBank || 0, selisih: d.selisih || 0 } : null;
    } catch (e) { return null; }
  }
  function detailList(rows, data, totalLabel, total, tone) {
    var h = '<div class="rounded-xl border border-slate-200 overflow-hidden"><div class="px-4 py-2 text-xs font-bold ' + tone.head + '">' + totalLabel + '</div><div class="divide-y divide-slate-100">';
    rows.forEach(function (r) {
      var v = Number((data || {})[r[0]]) || 0;
      h += '<div class="flex justify-between gap-3 px-4 py-1.5 text-xs ' + (v ? "" : "text-slate-400") + '"><span>' + r[1] + '</span><span class="font-mono">' + rp(v) + '</span></div>';
    });
    return h + '</div><div class="flex justify-between px-4 py-2 text-xs font-bold border-t border-slate-200 ' + tone.foot + '"><span>Jumlah</span><span class="font-mono">' + rp(total) + '</span></div></div>';
  }
  function pejabatCard(title, icon, p) {
    var empty = !p.nama;
    return '<div class="rounded-xl border ' + (empty ? "border-dashed border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50") + ' p-3 flex gap-3 items-start">' +
      '<div class="w-9 h-9 rounded-full bg-[#0F2C59] text-white grid place-items-center shrink-0"><i class="fa-solid ' + icon + ' text-sm"></i></div>' +
      '<div class="min-w-0 text-xs"><p class="text-[10px] uppercase tracking-wider font-bold text-slate-500">' + title + '</p>' +
      (empty ? '<p class="text-amber-700 font-semibold">Belum diisi</p>' :
        '<p class="font-bold text-slate-900 break-words">' + esc(p.nama) + '</p>' +
        '<p class="text-slate-600">NIP. ' + (esc(p.nip) || "-") + '</p>' +
        '<p class="text-slate-600">' + (esc(p.pangkat) || "-") + '</p>' +
        '<p class="text-slate-500">' + esc(p.jabatan) + '</p>') + '</div></div>';
  }
  function docChips(docs) {
    return (typeof DOC_LABELS !== "undefined" ? DOC_LABELS : []).map(function (d) {
      var x = (docs || {})[d.key] || {}, cls, txt, ic;
      if (x.needsFix) { cls = "border-rose-200 bg-rose-50 text-rose-700"; txt = "Perlu perbaikan"; ic = "fa-triangle-exclamation"; }
      else if (x.url && x.checked) { cls = "border-emerald-200 bg-emerald-50 text-emerald-700"; txt = "Sudah dicek Dinas"; ic = "fa-circle-check"; }
      else if (x.url) { cls = "border-blue-200 bg-blue-50 text-blue-700"; txt = "Terunggah"; ic = "fa-file-circle-check"; }
      else { cls = "border-slate-200 bg-slate-50 text-slate-500"; txt = "Belum diunggah"; ic = "fa-file-circle-question"; }
      return '<div class="rounded-lg border ' + cls + ' px-3 py-2 text-[11px] flex items-start gap-2"><i class="fa-solid ' + ic + ' mt-0.5"></i><div><div class="font-semibold">' + esc(d.label) + '</div><div class="opacity-80">' + txt + '</div></div></div>';
    }).join("");
  }

  function renderCard() {
    var box = $("schoolDetailCard");
    if (!box) return false;
    var operator = isOp();
    // Tampilan tabel lama disembunyikan hanya untuk akun sekolah
    ["simpleTableWrap", "detailTableWrap", "swipeHint"].forEach(function (id) { var el = $(id); if (el && operator) el.classList.add("hidden"); });
    var foot = document.querySelector(".tbl-card .tbl-foot"); if (foot) foot.classList.toggle("hidden", operator);
    var cnt = $("recordCount"); if (cnt) cnt.classList.toggle("hidden", operator);
    box.classList.toggle("hidden", !operator);
    if (!operator) return false;

    var sch = mySchool();
    var s = sch && (filteredData || []).find(function (x) { return Number(x.no) === Number(sch.no); });
    if (!sch || !s) {
      box.innerHTML = '<div class="py-10 text-center text-slate-400 text-sm"><i class="fa-regular fa-folder-open text-2xl block mb-2"></i>Data sekolah Anda belum ditemukan di Data Master. Hubungi Admin Dinas.</div>';
      return true;
    }
    var kp = kepsekOf(sch), bd = bendOf(sch);
    var locked = typeof LOCKED_STATUSES !== "undefined" && LOCKED_STATUSES.indexOf(s.verifStatus) !== -1;
    var done = typeof isReconDone === "function" && isReconDone(s.no);
    var fix = typeof countDocsNeedFix === "function" ? countDocsNeedFix(s.documents) : 0;
    var rk = rekonOf(s.no);
    var tile = function (label, val, cls, ic) {
      return '<div class="rounded-xl border p-3 ' + cls + '"><div class="flex items-center gap-2 text-[11px] font-semibold opacity-80"><i class="fa-solid ' + ic + '"></i>' + label + '</div><div class="mt-1 text-base md:text-lg font-extrabold font-mono break-all">' + rp(val) + '</div></div>';
    };

    var rekonHtml = "";
    if (rk) {
      var rcKosong = rk.rc === 0, ok = Math.abs(rk.selisih) < 1;
      var badge = rcKosong ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">RC Bank belum diisi</span>'
        : ok ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><i class="fa-solid fa-circle-check mr-1"></i>SESUAI</span>'
        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">' + (rk.selisih > 0 ? "SP2B LEBIH BESAR" : "RC LEBIH BESAR") + '</span>';
      rekonHtml = '<div class="rounded-xl border border-slate-200 p-4"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><div class="text-xs font-bold text-slate-700"><i class="fa-solid fa-scale-balanced mr-1.5 text-[#C5A059]"></i>Rekonsiliasi Saldo <span class="font-normal text-slate-400">(akhir periode)</span></div>' + badge + '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">' +
        '<div><div class="text-slate-500">Saldo SP2B</div><div class="font-mono font-bold">' + rp(rk.sp2b) + '</div></div>' +
        '<div><div class="text-slate-500">Saldo RC Bank</div><div class="font-mono font-bold">' + rp(rk.rc) + '</div></div>' +
        '<div><div class="text-slate-500">Selisih (SP2B − RC)</div><div class="font-mono font-bold ' + (rcKosong ? "text-slate-400" : ok ? "text-emerald-600" : "text-rose-600") + '">' + rp(rk.selisih) + '</div></div></div></div>';
    }

    box.innerHTML =
      '<article class="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">' +
      /* kepala kartu */
      '<header class="px-5 py-4 text-white" style="background:linear-gradient(135deg,#0a1f42,#0F2C59 60%,#17407e)">' +
      '<div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0">' +
      '<p class="text-[10px] uppercase tracking-widest text-amber-200 font-bold">Kartu Rinci Rekonsiliasi · TA ' + esc(activeYear) + '</p>' +
      '<h4 class="text-lg md:text-xl font-extrabold leading-tight break-words">' + esc(sch.name) + '</h4>' +
      '<div class="mt-2 flex flex-wrap gap-1.5 text-[11px]">' +
      '<span class="px-2 py-0.5 rounded-full bg-white/15"><i class="fa-solid fa-hashtag mr-1"></i>NPSN ' + (esc(sch.npsn) || "-") + '</span>' +
      '<span class="px-2 py-0.5 rounded-full bg-white/15">' + esc(sch.status || "NEGERI") + ' · ' + esc(sch.jenjang || "SD") + '</span>' +
      '<span class="px-2 py-0.5 rounded-full bg-white/15"><i class="fa-solid fa-location-dot mr-1"></i>Kec. ' + esc(sch.kecamatan) + '</span>' +
      (sch.alamat ? '<span class="px-2 py-0.5 rounded-full bg-white/15">' + esc(sch.alamat) + '</span>' : '') + '</div></div>' +
      '<div class="text-right space-y-1.5"><div class="text-[11px] text-slate-300">Periode</div><div class="font-bold">' + esc(periodLabel(true)) + '</div>' +
      '<div class="flex flex-wrap justify-end gap-1.5">' + statusBadge(s.verifStatus) +
      (done ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><i class="fa-solid fa-circle-check mr-1"></i>Selesai Rekonsiliasi</span>' : '') +
      (locked ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700"><i class="fa-solid fa-lock mr-1"></i>Input terkunci</span>' : '') +
      '</div></div></div></header>' +
      /* isi kartu */
      '<div class="p-4 md:p-5 space-y-5">' +
      '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">' +
      tile("Saldo Awal", s.saldoAwal, "border-amber-200 bg-amber-50 text-amber-900", "fa-vault") +
      tile("Total Penerimaan", s.totalPendapatan, "border-emerald-200 bg-emerald-50 text-emerald-900", "fa-arrow-trend-up") +
      tile("Total Pengeluaran", s.totalBelanja, "border-rose-200 bg-rose-50 text-rose-900", "fa-arrow-trend-down") +
      tile("Kas Seharusnya", s.kasSeharusnya, "border-indigo-200 bg-indigo-50 text-indigo-900", "fa-wallet") + '</div>' +

      '<div><div class="flex items-center justify-between mb-2"><div class="text-xs font-bold text-slate-700"><i class="fa-solid fa-user-tie mr-1.5 text-[#C5A059]"></i>Pejabat Satuan Pendidikan</div>' +
      '<button type="button" onclick="openProfileModal()" class="text-[11px] font-semibold text-blue-700 hover:underline"><i class="fa-solid fa-pen mr-1"></i>Ubah di Data Master</button></div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + pejabatCard("Kepala Sekolah", "fa-user-tie", kp) + pejabatCard("Bendahara BOSP", "fa-user-pen", bd) + '</div></div>' +

      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +
      detailList(PEND_ROWS, s.pendapatanDetail, "PENERIMAAN", s.totalPendapatan, { head: "bg-emerald-50 text-emerald-800", foot: "bg-emerald-50 text-emerald-800" }) +
      detailList(BEL_ROWS, s.belanjaDetail, "PENGELUARAN", s.totalBelanja, { head: "bg-rose-50 text-rose-800", foot: "bg-rose-50 text-rose-800" }) + '</div>' +

      rekonHtml +

      '<div><div class="text-xs font-bold text-slate-700 mb-2"><i class="fa-solid fa-folder-open mr-1.5 text-[#C5A059]"></i>Berkas Pendukung PDF' +
      (fix ? ' <span class="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-700">' + fix + ' perlu perbaikan</span>' : '') + '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">' + docChips(s.documents) + '</div></div>' +

      '<div class="flex flex-wrap gap-2 pt-1 border-t border-slate-100 no-print" style="padding-top:14px">' +
      '<button type="button" onclick="openInputModal()" class="btn btn-gold"><i class="fa-solid fa-pen-to-square"></i> Input / Ajukan Realisasi</button>' +
      '<button type="button" onclick="openModal(' + Number(s.no) + ')" class="btn btn-soft"><i class="fa-solid fa-eye"></i> Detail &amp; Berkas</button>' +
      '<button type="button" onclick="openRekapSekolahModal()" class="btn btn-soft"><i class="fa-solid fa-print"></i> Cetak Rekap</button>' +
      '<button type="button" onclick="openProfileModal()" class="btn btn-line"><i class="fa-solid fa-school-flag"></i> Data Master Sekolah</button></div>' +
      '</div></article>' + noticeHtml();
    return true;
  }

  /* ============================================ CETAK REKAP REALISASI SEKOLAH */
  function buildRekap() {
    var area = $("rekapSekolahPrintArea");
    var sch = mySchool();
    var s = sch && (filteredData || []).find(function (x) { return Number(x.no) === Number(sch.no); });
    if (!area) return;
    if (!sch || !s) { area.innerHTML = '<p class="text-center text-slate-500 font-sans">Data sekolah tidak ditemukan.</p>'; return; }
    var kp = kepsekOf(sch), rk = rekonOf(s.no);
    var row = function (l, v) { return '<tr><td class="py-0.5 pr-3 align-top" style="width:150px">' + l + '</td><td class="py-0.5 align-top">: ' + (v || "-") + '</td></tr>'; };
    var lines = function (rows, data) {
      return rows.map(function (r, i) {
        return '<tr><td class="border border-slate-800 p-1 text-center" style="width:32px">' + (i + 1) + '</td><td class="border border-slate-800 p-1">' + r[1] + '</td><td class="border border-slate-800 p-1 text-right font-mono">' + rp((data || {})[r[0]] || 0) + '</td></tr>';
      }).join("");
    };
    var sum = function (label, v) { return '<tr class="bg-slate-100 font-bold"><td class="border border-slate-800 p-1.5 text-center" colspan="2">' + label + '</td><td class="border border-slate-800 p-1.5 text-right font-mono">' + rp(v) + '</td></tr>'; };

    area.innerHTML =
      '<div class="text-center border-b-2 border-slate-900 pb-3 space-y-0.5">' +
      '<p class="font-bold text-sm uppercase">PEMERINTAH KABUPATEN MINAHASA TENGGARA</p>' +
      '<p class="font-bold text-base uppercase">DINAS PENDIDIKAN</p>' +
      '<p class="font-bold text-xs uppercase">' + esc(sch.name) + '</p></div>' +
      '<div class="text-center space-y-0.5"><p class="font-bold text-xs uppercase underline">REKAPITULASI REALISASI DANA BOSP</p>' +
      '<p class="text-[11px]">Periode <b class="uppercase">' + esc(periodLabel(true)) + '</b> · Tahun Anggaran <b>' + esc(activeYear) + '</b></p></div>' +
      '<table class="font-sans text-[11px] w-full"><tbody>' +
      row("Nama Satuan Pendidikan", "<b>" + esc(sch.name) + "</b>") + row("NPSN", esc(sch.npsn)) + row("Status / Jenjang", esc((sch.status || "NEGERI") + " / " + (sch.jenjang || "SD"))) +
      row("Kecamatan", esc(sch.kecamatan)) + row("Alamat", esc(sch.alamat)) +
      row("Kepala Sekolah", kp.nama ? "<b>" + esc(kp.nama) + "</b>" : "") + row("NIP / Pangkat-Gol.", (kp.nip || kp.pangkat) ? esc(kp.nip || "-") + " / " + esc(kp.pangkat || "-") : "") +
      row("Status Verifikasi", esc(s.verifStatus || "Draft")) + '</tbody></table>' +
      '<table class="w-full border-collapse border border-slate-800 text-[11px] font-sans"><thead><tr class="bg-slate-100 font-bold text-center"><th class="border border-slate-800 p-1.5" style="width:32px">No</th><th class="border border-slate-800 p-1.5 text-left">Uraian</th><th class="border border-slate-800 p-1.5 text-right" style="width:170px">Jumlah (Rp)</th></tr></thead><tbody>' +
      '<tr class="font-bold"><td class="border border-slate-800 p-1.5 text-center">A</td><td class="border border-slate-800 p-1.5">Saldo Awal</td><td class="border border-slate-800 p-1.5 text-right font-mono">' + rp(s.saldoAwal) + '</td></tr>' +
      '<tr class="font-bold bg-slate-50"><td class="border border-slate-800 p-1.5 text-center" colspan="3">B. PENERIMAAN</td></tr>' + lines(PEND_ROWS, s.pendapatanDetail) + sum("TOTAL PENERIMAAN", s.totalPendapatan) +
      '<tr class="font-bold bg-slate-50"><td class="border border-slate-800 p-1.5 text-center" colspan="3">C. PENGELUARAN</td></tr>' + lines(BEL_ROWS, s.belanjaDetail) + sum("TOTAL PENGELUARAN", s.totalBelanja) +
      sum("D. SALDO KAS SEHARUSNYA (A + B − C)", s.kasSeharusnya) +
      (rk ? '<tr><td class="border border-slate-800 p-1.5 text-center" colspan="2">Saldo SP2B / Saldo RC Bank / Selisih</td><td class="border border-slate-800 p-1.5 text-right font-mono text-[10px]">' + rp(rk.sp2b) + ' / ' + rp(rk.rc) + ' / ' + rp(rk.selisih) + '</td></tr>' : '') +
      '</tbody></table>' + signHtml(sch) +
      '<p class="font-sans text-[9px] text-slate-500">Dicetak melalui SIGAP-BOSP pada ' + esc(new Date().toLocaleString("id-ID")) + ' oleh ' + esc(currentUser ? (currentUser.name || currentUser.username) : "") + '.</p>';
  }
  function openRekapSekolahModal() {
    if (!isOp()) { alert("Fitur ini untuk akun Operator Sekolah. Admin Dinas memakai Cetak SP2B / Rekapitulasi Kecamatan."); return; }
    ensureModals();
    buildRekap();
    $("rekapSekolahModal").classList.remove("hidden");
  }
  function closeRekapSekolahModal() { var m = $("rekapSekolahModal"); if (m) m.classList.add("hidden"); }
  function printRekap() { document.body.classList.remove("kb-printing"); window.print(); }

  /* ============================================================ DASHBOARD REKAP */
  /** Dipanggil app.js di akhir openSchoolDashboardModal(). Hanya mengubah tampilan untuk akun sekolah. */
  function decorateDashboard() {
    var idBox = $("dashIdentity"), sign = $("dashSignArea"), note = $("dashSummaryNote"), ttl = $("dashModalTitleText");
    var operator = isOp(), sch = mySchool();
    // simpan tampilan asli (Admin/BUD) agar bisa dipulihkan bila sesi berganti peran
    if (!decorateDashboard.orig) {
      decorateDashboard.orig = {
        title: ttl ? ttl.textContent : "", note: note ? note.textContent : "",
        signCls: sign ? sign.className : "", signHtml: sign ? sign.innerHTML : "", signStyle: sign ? sign.getAttribute("style") : null
      };
    }
    var o = decorateDashboard.orig;
    if (idBox) idBox.classList.toggle("hidden", !(operator && sch));
    if (!operator || !sch) {
      if (ttl) ttl.textContent = o.title;
      if (note) note.textContent = o.note;
      if (sign) { sign.className = o.signCls; sign.innerHTML = o.signHtml; if (o.signStyle == null) sign.removeAttribute("style"); else sign.setAttribute("style", o.signStyle); }
      return;
    }
    if (ttl) ttl.textContent = "Dashboard Rekapitulasi Realisasi Satuan Pendidikan";
    var tb = $("schoolDashboardTableBody");
    if (tb && tb.lastElementChild && /TOTAL KABUPATEN/i.test(tb.lastElementChild.textContent)) tb.removeChild(tb.lastElementChild);
    var kp = kepsekOf(sch), bd = bendOf(sch);
    var cell = function (t, p, ic) {
      return '<div class="rounded-lg border border-slate-300 p-2.5 flex gap-2.5"><i class="fa-solid ' + ic + ' mt-0.5 text-[#0F2C59]"></i><div class="min-w-0"><p class="text-[9px] uppercase tracking-wider font-bold text-slate-500">' + t + '</p>' +
        (p.nama ? '<p class="font-bold break-words">' + esc(p.nama) + '</p><p>NIP. ' + (esc(p.nip) || "-") + '</p><p>' + (esc(p.pangkat) || "-") + '</p><p class="text-slate-500">' + esc(p.jabatan) + '</p>'
          : '<p class="text-amber-700 font-semibold">Belum diisi</p>') + '</div></div>';
    };
    if (idBox) {
      idBox.innerHTML = '<div class="font-sans space-y-2"><div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">' +
        '<div><span class="text-slate-500">Satuan Pendidikan</span><br><b>' + esc(sch.name) + '</b></div>' +
        '<div><span class="text-slate-500">NPSN</span><br><b>' + (esc(sch.npsn) || "-") + '</b></div>' +
        '<div><span class="text-slate-500">Kecamatan</span><br><b>' + esc(sch.kecamatan) + '</b></div>' +
        '<div><span class="text-slate-500">Status / Jenjang</span><br><b>' + esc((sch.status || "NEGERI") + " / " + (sch.jenjang || "SD")) + '</b></div></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">' + cell("Kepala Sekolah", kp, "fa-user-tie") + cell("Bendahara BOSP", bd, "fa-user-pen") + '</div>' +
        (lengkap(sch) ? "" : '<div class="no-print text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2"><i class="fa-solid fa-triangle-exclamation"></i> Data pejabat belum lengkap. <button type="button" class="font-bold underline" onclick="closeSchoolDashboardModal();openProfileModal()">Lengkapi di Data Master Sekolah</button></div>') +
        '</div>';
    }
    if (note) note.textContent = "Rekapitulasi realisasi finansial " + sch.name + " untuk periode terpilih.";
    if (sign) { sign.className = ""; sign.style.width = "100%"; sign.innerHTML = signHtml(sch); }
  }

  /** Isi identitas kepala sekolah pada pratinjau SP2B (cetak oleh Admin Dinas). */
  function fillSp2b(sch) {
    var a = $("sp2bKepsek"), b = $("sp2bKepsekNip");
    if (!a || !b) return;
    var k = kepsekOf(sch);
    a.textContent = k.nama || "-";
    b.textContent = k.nip ? ("NIP. " + k.nip + (k.pangkat ? " · " + k.pangkat : "")) : "-";
  }

  /* ------------------------------------------------------------- ekspor global */
  w.Pejabat = {
    kepsekOf: kepsekOf, bendOf: bendOf, lengkap: lengkap, signHtml: signHtml, noticeHtml: noticeHtml,
    renderCard: renderCard, decorateDashboard: decorateDashboard, fillSp2b: fillSp2b,
    save: save, hintNip: hintNip, printRekap: printRekap, refresh: refreshViews
  };
  w.openProfileModal = openProfileModal;
  w.closeProfileModal = closeProfileModal;
  w.openRekapSekolahModal = openRekapSekolahModal;
  w.closeRekapSekolahModal = closeRekapSekolahModal;
})(window);
