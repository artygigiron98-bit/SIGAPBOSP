/**
 * Halaman Penganggaran (RKAS ARKAS) — terpisah dari dashboard Rekonsiliasi.
 *  - Operator Sekolah : hanya sekolahnya sendiri; unggah RKAS per tahap & sumber dana, tinjau, koreksi, ajukan
 *  - Admin Dinas      : pilih sekolah (dengan pencarian) + sumber dana, unggah/tinjau, verifikasi/tolak/buka kunci,
 *                       rekap per tahap & sumber dana yang dapat dicetak / diekspor
 *  - BUD              : hanya lihat (daftar, rekap, cetak)
 */
(function () {
  "use strict";

  var SUMBER = [
    { k: "reguler", n: "BOSP Reguler", c: "#0F2C59", ic: "fa-school" },
    { k: "kinerja", n: "BOSP Kinerja", c: "#0f766e", ic: "fa-chart-line" },
    { k: "prestasi", n: "BOSP Prestasi", c: "#b45309", ic: "fa-trophy" },
    { k: "silpaKinerja", n: "SiLPA BOSP Kinerja", c: "#7c3aed", ic: "fa-piggy-bank" },
  ];
  var TAHAP = [{ k: "induk", n: "Induk" }, { k: "perubahan", n: "Perubahan" }];
  var KAT = [
    { k: "pegawai", n: "Belanja Pegawai" },
    { k: "barjas", n: "Belanja Barang dan Jasa" },
    { k: "atl", n: "Belanja Modal ATL" },
    { k: "pm", n: "Belanja Modal PM" },
  ];
  var KAT_ALL = KAT.concat([{ k: "lainnya", n: "Belum terklasifikasi" }]);
  var STATUS_CLS = {
    Draft: "bg-slate-100 text-slate-700 border-slate-300",
    Diajukan: "bg-amber-100 text-amber-800 border-amber-300",
    Terverifikasi: "bg-emerald-100 text-emerald-800 border-emerald-300",
    Ditolak: "bg-rose-100 text-rose-800 border-rose-300",
  };

  var S = {
    user: null, schools: [], year: new Date().getFullYear(), data: {}, tab: "input", detail: null,
    form: { schoolNo: null, tahap: "induk", sumber: "reguler", file: null, q: "" },
    list: { tahap: "", sumber: "", status: "", kec: "", q: "", limit: 150 },
    rekap: { tahap: "induk", sumber: "semua", count: "ajukan", kec: "", group: true, showAll: false, sign: true },
    banding: { count: "ajukan" },
  };

  // ---------- util ----------
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function num(n) { return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0); }
  function rp(n) { return "Rp " + num(n); }
  function role() { return S.user ? S.user.role : ""; }
  function isOp() { return role() === "Operator Sekolah"; }
  function isAdmin() { return role() === "Admin Dinas"; }
  function canInput() { return isOp() || isAdmin(); }
  function srcName(k) { var s = SUMBER.find(function (x) { return x.k === k; }); return s ? s.n : k; }
  function tahapName(k) { return k === "induk" ? "Induk" : "Perubahan"; }
  function token() { try { return sessionStorage.getItem("rekon_node_token") || ""; } catch (e) { return ""; } }
  function toast(msg, bad) {
    var t = document.createElement("div");
    t.className = "fixed bottom-5 right-5 z-[90] px-4 py-3 rounded-xl text-xs font-semibold shadow-xl text-white " + (bad ? "bg-rose-600" : "bg-emerald-600");
    t.style.maxWidth = "380px"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4500);
  }
  function hdrs(json) {
    var h = {}; if (json) h["Content-Type"] = "application/json";
    var t = token(); if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }
  async function api(path, opt) {
    var o = Object.assign({ credentials: "include", cache: "no-store" }, opt || {});
    o.headers = Object.assign({}, hdrs(false), (opt && opt.headers) || {});
    var r = await fetch(path, o), j;
    try { j = await r.json(); } catch (e) { throw new Error("Respons server tidak valid (HTTP " + r.status + ")"); }
    if (r.status === 401) { var e401 = new Error(j.message || "Sesi berakhir, silakan login ulang."); e401.auth = true; throw e401; }
    if (!r.ok || j.status !== "success") {
      var err = new Error(j.message || "HTTP " + r.status);
      if (j.blockingErrors) err.blockingErrors = j.blockingErrors;
      if (j.canSubmit === false) err.canSubmit = false;
      throw err;
    }
    return j;
  }
  function post(path, body) { return api(path, { method: "POST", headers: hdrs(true), body: JSON.stringify(body) }); }
  function emptyB() { return { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 }; }
  function badge(st) { return '<span class="inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ' + (STATUS_CLS[st] || STATUS_CLS.Draft) + '">' + esc(st) + "</span>"; }
  function byNo(a, b) { return Number(a.no) - Number(b.no); }
  function schoolOf(no) { return S.schools.find(function (s) { return Number(s.no) === Number(no); }) || { no: no, name: "Sekolah #" + no, kecamatan: "", npsn: "" }; }
  function recOf(no, t, s) { var d = S.data[String(no)]; return (d && d[t] && d[t][s]) || null; }
  function countedBy(mode, rec) {
    if (!rec) return false;
    if (mode === "semua") return true;
    if (mode === "verif") return rec.status === "Terverifikasi";
    return rec.status === "Diajukan" || rec.status === "Terverifikasi";
  }
  var COUNT_LBL = { ajukan: "Diajukan + Terverifikasi", verif: "Terverifikasi saja", semua: "Semua unggahan (termasuk Draft/Ditolak)" };
  function countOptions(cur) {
    return Object.keys(COUNT_LBL).map(function (k) { return '<option value="' + k + '"' + (cur === k ? " selected" : "") + ">" + COUNT_LBL[k] + "</option>"; }).join("");
  }
  function kecList() {
    var m = {}; S.schools.forEach(function (s) { if (s.kecamatan) m[s.kecamatan] = 1; });
    return Object.keys(m).sort();
  }
  function flat() {
    var out = [];
    Object.keys(S.data).forEach(function (no) {
      TAHAP.forEach(function (t) {
        var x = S.data[no][t.k]; if (!x) return;
        SUMBER.forEach(function (s) { var r = x[s.k]; if (r) out.push({ no: Number(no), tahap: t.k, sumber: s.k, rec: r }); });
      });
    });
    return out;
  }
  function setPath(path, val) {
    var p = path.split("."), o = S;
    for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
    o[p[p.length - 1]] = val;
  }

  // ---------- boot ----------
  async function boot() {
    try { var y = parseInt(localStorage.getItem("bosp_activeYear"), 10); if (y > 2000) S.year = y; } catch (e) {}
    try {
      var me = await api("/api/me"); S.user = me.user;
      if (["Operator Sekolah", "Admin Dinas", "BUD"].indexOf(S.user.role) < 0) throw new Error("Peran Anda tidak memiliki akses ke menu Penganggaran.");
      var sc = await api("/api/schools"); S.schools = (sc.schools || []).slice().sort(byNo);
    } catch (e) {
      $("view").innerHTML = '<div class="card p-8 max-w-lg mx-auto text-center space-y-3"><div class="text-rose-600 text-3xl"><i class="fa-solid fa-lock"></i></div><div class="font-bold text-slate-800">' + esc(e.message) + '</div><a href="/" class="btn btn-navy">Ke halaman login</a></div>';
      return;
    }
    $("hdUser").textContent = S.user.name || S.user.username;
    $("hdRole").textContent = S.user.role;
    // Sidebar navigasi bersama (menu sama dengan Beranda & Realisasi Belanja)
    if (window.RekonNav) {
      RekonNav.mountShell({
        role: S.user.role, name: S.user.name || S.user.username, page: "penganggaran",
        onLogout: function () { $("btnLogout").click(); }
      });
    }
    if (isOp()) {
      if (S.user.schoolNo == null) { $("view").innerHTML = '<div class="card p-8 text-center text-rose-700">Akun Anda belum terhubung ke satuan pendidikan. Hubungi Admin Dinas.</div>'; return; }
      S.form.schoolNo = Number(S.user.schoolNo);
    }
    S.tab = canInput() ? "input" : "daftar";
    // Tab awal dari tautan sub-menu sidebar (?tab=rekap dst.)
    try {
      var qt = new URLSearchParams(window.location.search).get("tab");
      if (qt && tabsDef().some(function (t) { return t[0] === qt; })) S.tab = qt;
    } catch (e) {}
    if (window.RekonNav) {
      RekonNav.tabHandler = function (t) {
        if (!tabsDef().some(function (x) { return x[0] === t; })) return;
        S.tab = t; renderTabs(); renderView(); RekonNav.syncActive("penganggaran", S.tab);
      };
    }
    fillYears();
    await loadData();
    renderTabs(); renderView();
    if (window.RekonNav) RekonNav.syncActive("penganggaran", S.tab);
  }
  function fillYears() {
    var sel = $("yearSel"), cy = new Date().getFullYear(), h = "";
    for (var y = cy - 2; y <= cy + 1; y++) h += '<option value="' + y + '"' + (y === S.year ? " selected" : "") + ">" + y + "</option>";
    if (S.year < cy - 2 || S.year > cy + 1) h += '<option value="' + S.year + '" selected>' + S.year + "</option>";
    sel.innerHTML = h;
    sel.onchange = async function () {
      S.year = Number(sel.value);
      try { localStorage.setItem("bosp_activeYear", String(S.year)); } catch (e) {}
      await loadData(); renderView();
    };
  }
  async function loadData() {
    try { var j = await api("/api/anggaran?year=" + encodeURIComponent(S.year)); S.data = j.data || {}; }
    catch (e) { S.data = {}; toast("Gagal memuat data: " + e.message, true); }
  }

  // ---------- tab ----------
  function tabsDef() {
    var t = [];
    if (canInput()) t.push(["input", "fa-file-arrow-up", "Input Penganggaran"]);
    t.push(["daftar", "fa-table-list", "Daftar Anggaran"]);
    t.push(["rekap", "fa-print", isOp() ? "Rekap & Cetak" : "Rekap & Cetak Kabupaten"]);
    t.push(["banding", "fa-code-compare", "Induk vs Perubahan"]);
    return t;
  }
  function renderTabs() {
    $("tabs").innerHTML = tabsDef().map(function (t) {
      return '<button class="tab-btn ' + (S.tab === t[0] ? "on" : "") + '" data-act="tab" data-v="' + t[0] + '"><i class="fa-solid ' + t[1] + ' mr-1.5"></i>' + t[2] + "</button>";
    }).join("");
  }
  function renderView() {
    var v = $("view");
    if (S.tab === "input") { v.innerHTML = inputHtml(); renderInputDyn(); }
    else if (S.tab === "daftar") { v.innerHTML = daftarHtml(); renderDaftarBody(); }
    else if (S.tab === "rekap") { v.innerHTML = rekapHtml(); renderRekapBody(); }
    else { v.innerHTML = bandingHtml(); }
  }

  // =====================================================================
  //  TAB 1 — INPUT
  // =====================================================================
  var RULES =
    '<div class="bg-blue-50 border-l-4 border-blue-600 p-3 rounded-r-lg text-blue-900 text-xs space-y-1">' +
    '<p class="font-bold">Aturan pembacaan otomatis Lembar RKAS (PDF dari ARKAS)</p><ul class="list-disc ml-5 space-y-0.5">' +
    "<li>Kode kegiatan <b>07.12</b> → <b>Belanja Pegawai</b> (otomatis tidak dihitung lagi di Barang &amp; Jasa)</li>" +
    "<li>Kode rekening <b>5.1.02</b> → <b>Belanja Barang dan Jasa</b></li>" +
    "<li>Kode rekening <b>5.2.05</b> → <b>Belanja Modal ATL</b> &nbsp;·&nbsp; <b>5.2.02</b> → <b>Belanja Modal PM</b></li></ul>" +
    "<p>Pilih tahap &amp; sumber dana sesuai dokumen, unggah PDF, lalu tinjau hasilnya sebelum diajukan.</p></div>";

  function inputHtml() {
    var f = S.form, sc = f.schoolNo != null ? schoolOf(f.schoolNo) : null;
    var h = '<div class="space-y-4">' + RULES + '<div class="card p-5 space-y-4">';
    h += '<div class="font-extrabold text-slate-800"><i class="fa-solid fa-file-arrow-up mr-2" style="color:#C5A059"></i>Input Penganggaran Baru</div>';
    // --- sekolah
    h += "<div><label class=\"lbl\">1. Satuan Pendidikan</label>";
    if (isOp()) {
      h += '<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200"><i class="fa-solid fa-lock text-slate-400"></i><div><div class="font-bold text-slate-800">' + esc(sc.name) + '</div><div class="text-[11px] text-slate-500">NPSN ' + esc(sc.npsn || "-") + " · " + esc(sc.kecamatan || "") + ' · sekolah terdaftar pada akun Anda</div></div></div>';
    } else {
      h += '<div class="relative"><div class="relative"><i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-xs"></i>' +
        '<input id="schoolSearch" class="inp" style="padding-left:34px" autocomplete="off" placeholder="Ketik nama sekolah / NPSN / kecamatan untuk mencari…" value="' + esc(sc ? sc.name : f.q) + '"></div>' +
        '<div id="schoolDrop" class="drop hidden"></div></div>';
      h += '<div id="schoolChip" class="mt-2">' + schoolChip() + "</div>";
    }
    h += '</div><div id="inputDyn"></div></div></div>';
    return h;
  }
  function schoolChip() {
    var f = S.form; if (f.schoolNo == null) return '<span class="text-[11px] text-slate-400">Belum ada sekolah dipilih — ' + S.schools.length + " sekolah tersedia.</span>";
    var sc = schoolOf(f.schoolNo);
    return '<span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold"><i class="fa-solid fa-circle-check"></i>' + esc(sc.name) + " · NPSN " + esc(sc.npsn || "-") + " · " + esc(sc.kecamatan || "") +
      ' <button data-act="clearSchool" class="ml-1 text-emerald-700 hover:text-rose-600" title="Ganti sekolah"><i class="fa-solid fa-xmark"></i></button></span>';
  }
  function schoolMatches(q) {
    q = String(q || "").trim().toLowerCase();
    var list = S.schools;
    if (q) list = list.filter(function (s) { return (s.name + " " + (s.npsn || "") + " " + (s.kecamatan || "") + " " + s.no).toLowerCase().indexOf(q) >= 0; });
    return list;
  }
  var dropHl = -1;
  function renderDrop() {
    var d = $("schoolDrop"); if (!d) return;
    var q = $("schoolSearch").value, list = schoolMatches(q), shown = list.slice(0, 60);
    if (!shown.length) { d.innerHTML = '<div class="p-3 text-xs text-slate-500">Tidak ada sekolah yang cocok dengan "' + esc(q) + '".</div>'; d.classList.remove("hidden"); return; }
    d.innerHTML = shown.map(function (s, i) {
      var n = 0; ["induk", "perubahan"].forEach(function (t) { SUMBER.forEach(function (x) { if (recOf(s.no, t, x.k)) n++; }); });
      return '<div class="opt ' + (i === dropHl ? "hl" : "") + '" data-act="pickSchool" data-no="' + s.no + '"><div class="text-[13px] font-bold text-slate-800">' + esc(s.name) + '</div><div class="text-[11px] text-slate-500">NPSN ' + esc(s.npsn || "-") + " · " + esc(s.kecamatan || "") + (n ? ' · <span class="text-emerald-700 font-semibold">' + n + " dokumen</span>" : "") + "</div></div>";
    }).join("") + (list.length > shown.length ? '<div class="p-2 text-center text-[11px] text-slate-400">+' + (list.length - shown.length) + " lainnya — persempit pencarian</div>" : "");
    d.classList.remove("hidden");
  }
  function pickSchool(no) {
    S.form.schoolNo = Number(no); S.form.file = null;
    var sc = schoolOf(no);
    var inp = $("schoolSearch"); if (inp) inp.value = sc.name;
    var d = $("schoolDrop"); if (d) d.classList.add("hidden");
    var chip = $("schoolChip"); if (chip) chip.innerHTML = schoolChip();
    renderInputDyn();
  }

  function renderInputDyn() {
    var box = $("inputDyn"); if (!box) return;
    var f = S.form;
    if (f.schoolNo == null) { box.innerHTML = '<div class="text-center text-slate-400 text-xs py-6 border-2 border-dashed border-slate-200 rounded-xl"><i class="fa-solid fa-arrow-up mr-1"></i>Pilih satuan pendidikan terlebih dahulu.</div>'; return; }
    var cur = recOf(f.schoolNo, f.tahap, f.sumber);
    var locked = cur && (cur.status === "Diajukan" || cur.status === "Terverifikasi") && !isAdmin();
    var h = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">';
    h += '<div class="space-y-4">';
    h += '<div><label class="lbl">2. Tahap</label><div class="seg">' + TAHAP.map(function (t) { return '<button data-act="setTahap" data-v="' + t.k + '" class="' + (f.tahap === t.k ? "on" : "") + '">' + t.n + "</button>"; }).join("") + "</div></div>";
    h += '<div><label class="lbl">3. Sumber Dana</label><div class="grid grid-cols-2 gap-2">' + SUMBER.map(function (s) {
      var r = recOf(f.schoolNo, f.tahap, s.k);
      return '<button data-act="setSumber" data-v="' + s.k + '" class="src-card ' + (f.sumber === s.k ? "on" : "") + '" style="border-left:5px solid ' + s.c + '"><div class="text-[12px] font-extrabold text-slate-800"><i class="fa-solid ' + s.ic + ' mr-1" style="color:' + s.c + '"></i>' + s.n + '</div><div class="mt-1 text-[10px]">' + (r ? badge(r.status) + ' <span class="font-bold text-slate-600">' + num(r.totals.total) + "</span>" : '<span class="text-slate-400">Belum diunggah</span>') + "</div></button>";
    }).join("") + "</div></div>";
    h += "</div>";
    h += '<div class="space-y-3"><div><label class="lbl">4. File PDF RKAS (hasil cetak ARKAS)</label>';
    if (locked) {
      h += '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs"><i class="fa-solid fa-lock mr-1"></i>Dokumen ' + srcName(f.sumber) + " " + tahapName(f.tahap) + ' berstatus <b>' + esc(cur.status) + "</b> dan terkunci. Minta Admin Dinas membuka kunci bila perlu diubah.</div>";
    } else {
      h += '<label for="angFile" class="block p-5 text-center rounded-xl border-2 border-dashed ' + (f.file ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-[#0F2C59]") + ' cursor-pointer"><i class="fa-solid ' + (f.file ? "fa-file-pdf text-rose-600" : "fa-cloud-arrow-up text-slate-400") + ' text-2xl"></i><div class="mt-1 text-xs font-bold text-slate-700">' + (f.file ? esc(f.file.name) + " (" + Math.round(f.file.size / 1024) + " KB)" : "Klik untuk memilih file PDF") + '</div><div class="text-[10px] text-slate-400">Maksimal sesuai batas server · hanya format PDF</div></label>' +
        '<input id="angFile" type="file" accept="application/pdf,.pdf" class="hidden">';
      if (cur) h += '<div class="mt-2 text-[11px] text-amber-700"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Sudah ada dokumen ' + esc(cur.status) + " untuk kombinasi ini; unggahan baru akan <b>menggantinya</b>.</div>";
    }
    h += "</div>";
    h += '<div class="flex flex-wrap gap-2">';
    if (!locked) h += '<button data-act="doUpload" class="btn btn-navy" ' + (f.file ? "" : "disabled") + '><i class="fa-solid fa-gears"></i> Unggah &amp; Baca Otomatis</button>';
    if (cur) h += '<button data-act="open" data-no="' + f.schoolNo + '" data-t="' + f.tahap + '" data-s="' + f.sumber + '" class="btn btn-line"><i class="fa-solid fa-table-list"></i> Lihat Rincian</button>';
    h += "</div></div></div>";

    // matriks status sekolah terpilih
    h += '<div class="mt-5"><label class="lbl">Status penganggaran sekolah ini — TA ' + S.year + '</label><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Sumber Dana</th>' + TAHAP.map(function (t) { return "<th>Tahap " + t.n + "</th>"; }).join("") + "</tr></thead><tbody>";
    SUMBER.forEach(function (s) {
      h += '<tr><td class="font-bold">' + s.n + "</td>";
      TAHAP.forEach(function (t) {
        var r = recOf(f.schoolNo, t.k, s.k);
        h += r ? '<td class="click" data-act="open" data-no="' + f.schoolNo + '" data-t="' + t.k + '" data-s="' + s.k + '" style="cursor:pointer">' + badge(r.status) + ' <b class="ml-1">' + num(r.totals.total) + "</b></td>" : '<td class="text-slate-300">—</td>';
      });
      h += "</tr>";
    });
    h += "</tbody></table></div></div></div>";
    box.innerHTML = h;
  }

  async function doUpload() {
    var f = S.form;
    if (f.schoolNo == null || !f.file) return;
    if (!/\.pdf$/i.test(f.file.name)) { toast("Hanya file PDF yang diizinkan.", true); return; }
    var cur = recOf(f.schoolNo, f.tahap, f.sumber);
    if (cur && !confirm("Dokumen " + srcName(f.sumber) + " " + tahapName(f.tahap) + " untuk sekolah ini sudah ada (" + cur.status + "). Ganti dengan file baru? Koreksi manual sebelumnya akan hilang.")) return;
    var box = $("inputDyn"), keep = box.innerHTML;
    box.innerHTML = '<p class="text-slate-600 p-10 text-center"><i class="fa-solid fa-gears fa-spin mr-2"></i>Mengunggah dan membaca <b>' + esc(f.file.name) + "</b>… (dokumen besar dapat memakan beberapa detik)</p>";
    try {
      var fd = new FormData();
      fd.append("year", S.year); fd.append("tahap", f.tahap); fd.append("sumber", f.sumber); fd.append("schoolNo", f.schoolNo); fd.append("file", f.file);
      var r = await api("/api/anggaran/upload", { method: "POST", headers: hdrs(false), body: fd });
      var bl = (r.record && r.record.blockingErrors) || [];
      if (bl.length) {
        toast("PDF terbaca, tetapi TIDAK DAPAT DIAJUKAN: " + bl.length + " masalah identitas/sumber dana.", true);
      } else {
        toast("PDF terbaca: " + r.record.items.length + " baris rekening, total " + rp(r.record.totals.total));
      }
      f.file = null;
      await loadData(); renderInputDyn();
      openDetail(f.schoolNo, f.tahap, f.sumber);
    } catch (e) { box.innerHTML = keep; toast(e.message, true); alert("Gagal: " + e.message); }
  }

  // =====================================================================
  //  TAB 2 — DAFTAR
  // =====================================================================
  function daftarHtml() {
    var L = S.list;
    var h = '<div class="card p-4 space-y-3"><div class="flex flex-wrap gap-2 items-end">';
    h += '<div><label class="lbl">Tahap</label><select class="inp" data-f="list.tahap" data-r="daftar"><option value="">Semua</option>' + TAHAP.map(function (t) { return '<option value="' + t.k + '"' + (L.tahap === t.k ? " selected" : "") + ">" + t.n + "</option>"; }).join("") + "</select></div>";
    h += '<div><label class="lbl">Sumber Dana</label><select class="inp" data-f="list.sumber" data-r="daftar"><option value="">Semua</option>' + SUMBER.map(function (s) { return '<option value="' + s.k + '"' + (L.sumber === s.k ? " selected" : "") + ">" + s.n + "</option>"; }).join("") + "</select></div>";
    h += '<div><label class="lbl">Status</label><select class="inp" data-f="list.status" data-r="daftar"><option value="">Semua</option>' + ["Draft", "Diajukan", "Terverifikasi", "Ditolak"].map(function (x) { return '<option value="' + x + '"' + (L.status === x ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></div>";
    if (!isOp()) {
      h += '<div><label class="lbl">Kecamatan</label><select class="inp" data-f="list.kec" data-r="daftar"><option value="">Semua</option>' + kecList().map(function (k) { return '<option value="' + esc(k) + '"' + (L.kec === k ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></div>";
      h += '<div class="flex-1 min-w-[200px]"><label class="lbl">Cari sekolah</label><input class="inp" data-f="list.q" data-r="daftar" value="' + esc(L.q) + '" placeholder="Nama sekolah / NPSN…"></div>';
    }
    h += "</div></div>";
    h += '<div id="daftarBody" class="mt-4"></div>';
    return h;
  }
  function renderDaftarBody() {
    var box = $("daftarBody"); if (!box) return;
    var L = S.list, q = L.q.trim().toLowerCase();
    var rows = flat().filter(function (x) {
      if (L.tahap && x.tahap !== L.tahap) return false;
      if (L.sumber && x.sumber !== L.sumber) return false;
      if (L.status && x.rec.status !== L.status) return false;
      var sc = schoolOf(x.no);
      if (L.kec && sc.kecamatan !== L.kec) return false;
      if (q && (sc.name + " " + (sc.npsn || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var order = { induk: 0, perubahan: 1 }, so = {}; SUMBER.forEach(function (s, i) { so[s.k] = i; });
    rows.sort(function (a, b) { return a.no - b.no || order[a.tahap] - order[b.tahap] || so[a.sumber] - so[b.sumber]; });
    var cnt = { Draft: 0, Diajukan: 0, Terverifikasi: 0, Ditolak: 0 }; rows.forEach(function (x) { cnt[x.rec.status] = (cnt[x.rec.status] || 0) + 1; });
    var h = '<div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">' +
      kpi("Dokumen", rows.length, "#0F2C59") + kpi("Menunggu verifikasi", cnt.Diajukan, "#b45309") + kpi("Terverifikasi", cnt.Terverifikasi, "#047857") + kpi("Draft", cnt.Draft, "#475569") + kpi("Ditolak", cnt.Ditolak, "#be123c") + "</div>";
    h += '<div class="card overflow-hidden"><div class="overflow-auto" style="max-height:62vh"><table class="tbl"><thead><tr><th>Sekolah</th><th>Tahap</th><th>Sumber Dana</th><th>Status</th><th class="r">Pegawai</th><th class="r">Barang &amp; Jasa</th><th class="r">Modal ATL</th><th class="r">Modal PM</th><th class="r">Total</th><th></th></tr></thead><tbody>';
    var tot = emptyB();
    rows.slice(0, L.limit).forEach(function (x) {
      var sc = schoolOf(x.no), t = x.rec.totals;
      h += '<tr class="click" data-act="open" data-no="' + x.no + '" data-t="' + x.tahap + '" data-s="' + x.sumber + '"><td><b>' + esc(sc.name) + '</b><div class="text-[10px] text-slate-500">' + esc(sc.kecamatan || "") + "</div></td><td>" + tahapName(x.tahap) + "</td><td>" + srcName(x.sumber) + "</td><td>" + badge(x.rec.status) + '</td><td class="r">' + num(t.pegawai) + '</td><td class="r">' + num(t.barjas) + '</td><td class="r">' + num(t.atl) + '</td><td class="r">' + num(t.pm) + '</td><td class="r"><b>' + num(t.total) + '</b></td><td class="text-blue-700"><i class="fa-solid fa-chevron-right"></i></td></tr>';
    });
    rows.forEach(function (x) { Object.keys(tot).forEach(function (k) { tot[k] += x.rec.totals[k] || 0; }); });
    if (!rows.length) h += '<tr><td colspan="10" class="text-center text-slate-400 py-8">Belum ada dokumen penganggaran yang cocok.</td></tr>';
    else h += '<tr style="background:#faf4e6;font-weight:800"><td colspan="4">JUMLAH (' + rows.length + ' dokumen)</td><td class="r">' + num(tot.pegawai) + '</td><td class="r">' + num(tot.barjas) + '</td><td class="r">' + num(tot.atl) + '</td><td class="r">' + num(tot.pm) + '</td><td class="r">' + num(tot.total) + "</td><td></td></tr>";
    h += "</tbody></table></div>";
    if (rows.length > L.limit) h += '<div class="p-3 text-center"><button class="btn btn-line" data-act="more">Tampilkan lebih banyak (' + (rows.length - L.limit) + " lagi)</button></div>";
    h += "</div>";
    box.innerHTML = h;
  }
  function kpi(l, v, c) { return '<div class="card p-3"><div class="text-[10px] font-bold text-slate-500 uppercase">' + l + '</div><div class="text-2xl font-extrabold" style="color:' + c + '">' + v + "</div></div>"; }

  // =====================================================================
  //  TAB 3 — REKAP & CETAK
  // =====================================================================
  function rekapHtml() {
    var R = S.rekap, h = '<div class="card p-4 space-y-3"><div class="flex flex-wrap gap-3 items-end">';
    h += '<div><label class="lbl">Tahap</label><div class="seg">' + TAHAP.map(function (t) { return '<button data-act="rkTahap" data-v="' + t.k + '" class="' + (R.tahap === t.k ? "on" : "") + '">' + t.n + "</button>"; }).join("") + "</div></div>";
    h += '<div><label class="lbl">Sumber Dana</label><select class="inp" data-f="rekap.sumber" data-r="rekap"><option value="semua"' + (R.sumber === "semua" ? " selected" : "") + ">Semua sumber dana (gabungan)</option>" + SUMBER.map(function (s) { return '<option value="' + s.k + '"' + (R.sumber === s.k ? " selected" : "") + ">" + s.n + "</option>"; }).join("") + "</select></div>";
    h += '<div><label class="lbl">Data yang dihitung</label><select class="inp" data-f="rekap.count" data-r="rekap">' + countOptions(R.count) + "</select></div>";
    if (!isOp()) h += '<div><label class="lbl">Kecamatan</label><select class="inp" data-f="rekap.kec" data-r="rekap"><option value="">Semua kecamatan</option>' + kecList().map(function (k) { return '<option value="' + esc(k) + '"' + (R.kec === k ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></div>";
    h += "</div>";
    h += '<div class="flex flex-wrap gap-x-5 gap-y-2 items-center text-xs text-slate-700">' +
      (isOp() ? "" : '<label class="inline-flex items-center gap-1.5"><input type="checkbox" data-f="rekap.group" data-r="rekap"' + (R.group ? " checked" : "") + '> Kelompokkan per kecamatan (dengan subtotal)</label>' +
        '<label class="inline-flex items-center gap-1.5"><input type="checkbox" data-f="rekap.showAll" data-r="rekap"' + (R.showAll ? " checked" : "") + '> Sertakan sekolah yang belum mengunggah</label>') +
      '<label class="inline-flex items-center gap-1.5"><input type="checkbox" data-f="rekap.sign" data-r="rekap"' + (R.sign ? " checked" : "") + '> Sertakan kolom tanda tangan</label>' +
      '<span class="flex-1"></span><button class="btn btn-navy" data-act="print"><i class="fa-solid fa-print"></i> Cetak</button><button class="btn btn-green" data-act="xlsx"><i class="fa-solid fa-file-excel"></i> Ekspor Excel</button></div></div>';
    h += '<div class="card p-4 mt-4"><div class="rk-wrap"><div id="rekapDoc" class="rk" style="min-width:760px"></div></div></div>';
    return h;
  }
  function renderRekapBody() { var d = $("rekapDoc"); if (d) d.innerHTML = rekapDoc(); }

  function recapModel() {
    var R = S.rekap, srcKeys = R.sumber === "semua" ? SUMBER.map(function (s) { return s.k; }) : [R.sumber];
    var list = S.schools.slice();
    if (R.kec && !isOp()) list = list.filter(function (s) { return s.kecamatan === R.kec; });
    var rows = [], anyLain = false;
    list.forEach(function (sc) {
      var agg = emptyB(), per = {}, any = false, status = "Belum unggah";
      srcKeys.forEach(function (k) {
        per[k] = 0;
        var rec = recOf(sc.no, R.tahap, k); if (!rec) return;
        if (srcKeys.length === 1) status = rec.status;
        if (!countedBy(R.count, rec)) return;
        any = true;
        Object.keys(agg).forEach(function (c) { agg[c] += rec.totals[c] || 0; });
        per[k] = rec.totals.total || 0;
      });
      if (!any && !R.showAll && !isOp()) return;
      if (agg.lainnya) anyLain = true;
      rows.push({ sc: sc, agg: agg, per: per, any: any, status: status });
    });
    if (R.group && !isOp()) rows.sort(function (a, b) { return String(a.sc.kecamatan || "").localeCompare(String(b.sc.kecamatan || "")) || String(a.sc.name).localeCompare(String(b.sc.name)); });
    else rows.sort(function (a, b) { return Number(a.sc.no) - Number(b.sc.no); });
    return { srcKeys: srcKeys, rows: rows, cats: anyLain ? KAT_ALL : KAT };
  }
  /** Matriks tabel (dipakai preview, cetak & Excel) */
  function recapMatrix(m) {
    var R = S.rekap, single = m.srcKeys.length === 1, cats = m.cats;
    var head = ["No", "Satuan Pendidikan", "NPSN"].concat(cats.map(function (c) { return c.n; }), ["Jumlah"], single ? ["Status"] : m.srcKeys.map(srcName));
    function line(no, name, npsn, agg, per, status) {
      return [no, name, npsn].concat(cats.map(function (c) { return agg[c.k] || 0; }), [agg.total || 0], single ? [status] : m.srcKeys.map(function (k) { return per[k] || 0; }));
    }
    var body = [], grand = emptyB(), gPer = {};
    function addTo(t, tp, agg, per) { Object.keys(t).forEach(function (c) { t[c] += agg[c] || 0; }); m.srcKeys.forEach(function (k) { tp[k] = (tp[k] || 0) + (per[k] || 0); }); }
    var grouped = R.group && !isOp();
    var cur = null, sub = null, subP = null, n = 0, gi = 0;
    function flush() { if (cur !== null && sub) { body.push({ type: "sub", cells: line("", "Jumlah " + cur, "", sub, subP, "") }); } }
    m.rows.forEach(function (r) {
      var kec = r.sc.kecamatan || "(tanpa kecamatan)";
      if (grouped && kec !== cur) {
        flush(); cur = kec; sub = emptyB(); subP = {}; n = 0; gi++;
        body.push({ type: "grp", cells: [kec] });
      }
      n++;
      body.push({ type: "row", cells: line(grouped ? n : (body.length + 1), r.sc.name, r.sc.npsn || "", r.agg, r.per, r.status) });
      if (grouped) addTo(sub, subP, r.agg, r.per);
      addTo(grand, gPer, r.agg, r.per);
    });
    if (grouped) flush();
    body.push({ type: "tot", cells: line("", "JUMLAH KESELURUHAN" + (isOp() ? "" : " (" + m.rows.length + " sekolah)"), "", grand, gPer, "") });
    return { head: head, body: body, grand: grand, gPer: gPer };
  }
  function recapTitle() {
    var R = S.rekap;
    return {
      l1: "REKAPITULASI PENGANGGARAN " + (R.sumber === "semua" ? "BOSP — SEMUA SUMBER DANA" : srcName(R.sumber).toUpperCase()),
      l2: "RKAS TAHAP " + tahapName(R.tahap).toUpperCase() + " · TAHUN ANGGARAN " + S.year,
      l3: "KABUPATEN MINAHASA TENGGARA" + (R.kec && !isOp() ? " — " + R.kec : ""),
    };
  }
  function summaryBlock(m, mx) {
    if (m.srcKeys.length < 2) return "";
    // ringkasan jenis belanja x sumber dana
    var cell = {}; m.cats.forEach(function (c) { cell[c.k] = {}; });
    m.rows.forEach(function (r) { /* per-sumber per-kategori dihitung ulang dari data */ });
    var h = '<table><thead><tr><th>Jenis Belanja</th>' + m.srcKeys.map(function (k) { return "<th>" + srcName(k) + "</th>"; }).join("") + "<th>Jumlah</th></tr></thead><tbody>";
    var colT = {}, gt = 0;
    var agg = {};
    m.srcKeys.forEach(function (k) {
      agg[k] = emptyB();
      m.rows.forEach(function (r) {
        var rec = recOf(r.sc.no, S.rekap.tahap, k);
        if (rec && countedBy(S.rekap.count, rec)) Object.keys(agg[k]).forEach(function (c) { agg[k][c] += rec.totals[c] || 0; });
      });
    });
    m.cats.forEach(function (c) {
      var rt = 0;
      h += "<tr><td>" + c.n + "</td>" + m.srcKeys.map(function (k) { var v = agg[k][c.k] || 0; rt += v; colT[k] = (colT[k] || 0) + v; return '<td class="n">' + (v ? num(v) : "–") + "</td>"; }).join("") + '<td class="n"><b>' + (rt ? num(rt) : "–") + "</b></td></tr>"; gt += rt;
    });
    h += '<tr class="tot"><td>TOTAL ANGGARAN</td>' + m.srcKeys.map(function (k) { return '<td class="n">' + num(colT[k] || 0) + "</td>"; }).join("") + '<td class="n">' + num(gt) + "</td></tr></tbody></table>";
    return '<div style="margin:4px 0 4px;font-weight:bold">A. Ringkasan per Sumber Dana</div>' + h + '<div style="margin:6px 0 4px;font-weight:bold">B. Rincian per Satuan Pendidikan</div>';
  }
  /** Kolom tanda tangan rekap. Operator → Kepala Sekolah & Bendahara BOSP dari Data Master Sekolah. */
  function signBlock() {
    var tgl = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    var dots = "................................................";
    if (isOp() && S.schools && S.schools.length) {
      var sc = S.schools[0] || {}, kp = sc.kepalaSekolah || {}, bd = sc.bendahara || {};
      var col = function (head, p, jabDef) {
        return "<div>" + head + "<br>" + esc(p.jabatan || jabDef) + ",<br><br><br><br><b><u>" + (p.nama ? esc(p.nama) : dots) + "</u></b><br>" +
          (p.pangkat ? esc(p.pangkat) + "<br>" : "") + "NIP. " + (p.nip ? esc(p.nip) : "................................") + "</div>";
      };
      return '<div class="sign two">' + col("Mengetahui,", kp, "Kepala Sekolah") + col("Minahasa Tenggara, " + tgl, bd, "Bendahara BOSP") + "</div>";
    }
    return '<div class="sign"><div>Minahasa Tenggara, ' + tgl + "<br>Mengetahui,<br><br><br><br>(" + dots + ")<br>NIP. ................................</div></div>";
  }
  function rekapDoc() {
    var R = S.rekap, m = recapModel(), mx = recapMatrix(m), T = recapTitle(), single = m.srcKeys.length === 1;
    var ncols = mx.head.length;
    var h = '<div class="hd"><b>' + T.l1 + "</b><br><b>" + T.l2 + "</b><br>" + T.l3 + "</div>";
    h += summaryBlock(m, mx);
    h += "<table><thead><tr>" + mx.head.map(function (x, i) { return "<th" + (i === 1 ? ' style="min-width:170px"' : "") + ">" + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>";
    mx.body.forEach(function (r) {
      if (r.type === "grp") { h += '<tr class="grp"><td colspan="' + ncols + '">' + esc(r.cells[0]) + "</td></tr>"; return; }
      h += '<tr class="' + (r.type === "row" ? "" : r.type) + '">' + r.cells.map(function (c, i) {
        if (r.type !== "row" && i === 0) return "<td></td>";
        var isNum = typeof c === "number";
        var txt = isNum ? (c ? num(c) : "–") : esc(c);
        if (single && i === ncols - 1 && r.type === "row") txt = esc(c);
        return "<td" + (isNum ? ' class="n"' : (i === 0 ? ' style="text-align:center"' : "")) + (r.type !== "row" && i === 1 ? ' colspan="1"' : "") + ">" + txt + "</td>";
      }).join("") + "</tr>";
    });
    h += "</tbody></table>";
    if (!m.rows.length) h += '<p style="text-align:center;color:#666;padding:10px">Belum ada data yang memenuhi kriteria.</p>';
    h += '<div class="note">Data yang dihitung: ' + COUNT_LBL[R.count] + ". Nilai dalam Rupiah. Klasifikasi otomatis berdasarkan kode kegiatan 07.12 (Pegawai) dan kode rekening 5.1.02 (Barang &amp; Jasa), 5.2.05 (Modal ATL), 5.2.02 (Modal PM).<br>Dicetak: " + new Date().toLocaleString("id-ID") + " oleh " + esc(S.user ? (S.user.name || S.user.username) : "") + " (" + esc(role()) + ").</div>";
    if (R.sign) h += signBlock();
    return h;
  }
  var PRINT_CSS =
    "@page{size:A4 landscape;margin:10mm}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000}" +
    ".rk{font-size:11px}.rk .hd{text-align:center;margin-bottom:8px;line-height:1.45}.rk .hd b{font-size:13px}" +
    ".rk table{width:100%;border-collapse:collapse;margin-bottom:8px}.rk th,.rk td{border:1px solid #000;padding:3px 5px;font-size:10px}" +
    ".rk th{background:#e5e7eb;text-align:center}.rk td.n{text-align:right;white-space:nowrap}.rk tr.grp td{background:#f1f5f9;font-weight:bold}" +
    ".rk tr.sub td{background:#f8fafc;font-weight:bold}.rk tr.tot td{background:#e5e7eb;font-weight:bold}.rk tr{page-break-inside:avoid}" +
    ".rk thead{display:table-header-group}.rk .note{font-size:9px;color:#333;margin-top:4px}.rk .sign{display:flex;justify-content:flex-end;margin-top:16px;font-size:11px;page-break-inside:avoid}.rk .sign div{text-align:center;min-width:240px}.rk .sign.two{justify-content:space-between;padding:0 40px}";
  function doPrint() {
    var html = '<div class="rk">' + rekapDoc() + "</div>", T = recapTitle();
    var f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(f);
    var d = f.contentWindow.document;
    d.open(); d.write("<!doctype html><html><head><meta charset=\"utf-8\"><title>" + esc(T.l1 + " " + tahapName(S.rekap.tahap) + " " + S.year) + "</title><style>" + PRINT_CSS + "</style></head><body>" + html + "</body></html>"); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert("Gagal membuka dialog cetak: " + e.message); } setTimeout(function () { f.remove(); }, 60000); }, 350);
  }
  function doXlsx() {
    if (typeof XLSX === "undefined") { alert("Pustaka Excel belum termuat (periksa koneksi internet)."); return; }
    var m = recapModel(), mx = recapMatrix(m), T = recapTitle();
    var rows = [[T.l1], [T.l2], [T.l3], []];
    rows.push(mx.head);
    mx.body.forEach(function (r) { rows.push(r.type === "grp" ? [r.cells[0]] : r.cells); });
    rows.push([], ["Data yang dihitung: " + COUNT_LBL[S.rekap.count]]);
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = mx.head.map(function (_, i) { return { wch: i === 1 ? 38 : i === 2 ? 11 : 17 }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap " + tahapName(S.rekap.tahap));
    XLSX.writeFile(wb, "Rekap_Penganggaran_" + (S.rekap.sumber === "semua" ? "SemuaSumber" : S.rekap.sumber) + "_" + tahapName(S.rekap.tahap) + "_" + S.year + ".xlsx");
  }

  // =====================================================================
  //  TAB 4 — INDUK vs PERUBAHAN
  // =====================================================================
  function bandingHtml() {
    var mode = S.banding.count;
    function agg(tahap) {
      var t = { all: emptyB(), src: {} };
      SUMBER.forEach(function (s) { t.src[s.k] = emptyB(); });
      S.schools.forEach(function (sc) {
        SUMBER.forEach(function (s) {
          var r = recOf(sc.no, tahap, s.k);
          if (!r || !countedBy(mode, r)) return;
          Object.keys(t.all).forEach(function (c) { t.all[c] += r.totals[c] || 0; t.src[s.k][c] += r.totals[c] || 0; });
        });
      });
      return t;
    }
    var a = agg("induk"), b = agg("perubahan");
    function row(label, x, y, bold) {
      var d = y - x, pc = x ? d / x * 100 : (y ? 100 : 0);
      return '<tr style="' + (bold ? "background:#faf4e6;font-weight:800" : "") + '"><td class="font-bold">' + label + '</td><td class="r">' + num(x) + '</td><td class="r">' + num(y) + '</td><td class="r" style="color:' + (d > 0 ? "#047857" : d < 0 ? "#be123c" : "inherit") + '">' + (d > 0 ? "+" : "") + num(d) + '</td><td class="r">' + (d > 0 ? "+" : "") + pc.toFixed(1) + "%</td></tr>";
    }
    var head = '<table class="tbl"><thead><tr><th>Uraian</th><th class="r">Induk</th><th class="r">Perubahan</th><th class="r">Selisih</th><th class="r">%</th></tr></thead><tbody>';
    var h = '<div class="card p-4 flex flex-wrap items-end gap-3"><div><label class="lbl">Data yang dihitung</label><select class="inp" data-f="banding.count" data-r="banding">' + countOptions(mode) + '</select></div><div class="text-xs text-slate-500 pb-2">' + (isOp() ? "Perbandingan anggaran sekolah Anda." : "Perbandingan seluruh satuan pendidikan.") + "</div></div>";
    h += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4"><div class="card overflow-hidden"><div class="px-4 py-2 font-bold bg-slate-50 border-b">Per Jenis Belanja</div>' + head;
    KAT_ALL.forEach(function (c) { if (c.k === "lainnya" && !a.all.lainnya && !b.all.lainnya) return; h += row(c.n, a.all[c.k], b.all[c.k]); });
    h += row("TOTAL", a.all.total, b.all.total, true) + '</tbody></table></div><div class="card overflow-hidden"><div class="px-4 py-2 font-bold bg-slate-50 border-b">Per Sumber Dana</div>' + head;
    SUMBER.forEach(function (s) { h += row(s.n, a.src[s.k].total, b.src[s.k].total); });
    h += row("TOTAL", a.all.total, b.all.total, true) + "</tbody></table></div></div>";
    return h;
  }

  // =====================================================================
  //  DETAIL / TINJAU
  // =====================================================================
  async function openDetail(no, tahap, sumber) {
    var box = $("detailBody"); $("detailModal").classList.remove("hidden");
    box.innerHTML = '<p class="p-10 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat rincian…</p>';
    try {
      var j = await api("/api/anggaran/detail?year=" + S.year + "&tahap=" + tahap + "&sumber=" + sumber + "&schoolNo=" + no);
      S.detail = { no: Number(no), tahap: tahap, sumber: sumber, rec: j.record, dirty: {}, filter: "" };
      renderDetail();
    } catch (e) { box.innerHTML = '<div class="p-6 text-rose-700">' + esc(e.message) + '</div><div class="p-3 text-right"><button class="btn btn-navy" data-act="closeDetail">Tutup</button></div>'; }
  }
  function detailEditable() {
    var d = S.detail; if (!d) return false;
    var st = d.rec.status;
    if (isOp()) return st === "Draft" || st === "Ditolak";
    if (isAdmin()) return st !== "Terverifikasi";
    return false;
  }
  function liveTotals() {
    var t = emptyB();
    S.detail.rec.items.forEach(function (it) { var k = t.hasOwnProperty(it.kategori) ? it.kategori : "lainnya"; t[k] += it.jumlah; t.total += it.jumlah; });
    return t;
  }
  function totalsCards(t) {
    var h = '<div class="grid grid-cols-2 md:grid-cols-6 gap-2">';
    KAT_ALL.forEach(function (c) {
      if (c.k === "lainnya" && !t.lainnya) return;
      h += '<div class="rounded-xl border p-2 ' + (c.k === "lainnya" ? "border-rose-300 bg-rose-50" : "border-slate-200") + '"><div class="text-[10px] font-bold text-slate-500 uppercase">' + c.n + '</div><div class="font-extrabold text-sm tabular-nums">' + rp(t[c.k]) + "</div></div>";
    });
    return h + '<div class="rounded-xl border p-2" style="border-color:#C5A059;background:#faf4e6"><div class="text-[10px] font-bold uppercase" style="color:#a98440">Total Anggaran</div><div class="font-extrabold text-sm tabular-nums">' + rp(t.total) + "</div></div></div>";
  }
  function renderDetail() {
    var d = S.detail, r = d.rec, sc = schoolOf(d.no), ed = detailEditable(), src = SUMBER.find(function (s) { return s.k === d.sumber; });
    var h = '<div class="text-white px-5 py-3 flex justify-between items-center" style="background:#0F2C59"><div><div class="text-sm font-bold">' + esc(sc.name) + '</div><div class="text-[11px] opacity-80">' + src.n + " · RKAS Tahap " + tahapName(d.tahap) + " · TA " + r.year + " · " + esc(r.fileName) + '</div></div><button data-act="closeDetail" class="text-white text-2xl font-bold leading-none">&times;</button></div>';
    h += '<div class="p-5 space-y-3 text-xs overflow-y-auto min-h-0">';
    h += '<div class="flex flex-wrap items-center gap-2">' + badge(r.status) + '<a href="' + esc(r.fileUrl) + '" target="_blank" class="text-blue-700 font-bold hover:underline"><i class="fa-solid fa-file-pdf mr-1"></i>Buka PDF asli</a><span class="text-slate-500">diunggah ' + new Date(r.uploadedAt).toLocaleString("id-ID") + " oleh " + esc(r.uploadedBy) + "</span>" + (r.verifiedBy ? '<span class="text-slate-500">· diproses ' + esc(r.verifiedBy) + "</span>" : "") + "</div>";
    if (r.catatan) h += '<div class="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900"><b>Catatan:</b> ' + esc(r.catatan) + "</div>";
    // Error penghalang pengajuan (identitas sekolah / sumber dana / tahap / tahun)
    var blocks = Array.isArray(r.blockingErrors) ? r.blockingErrors : [];
    if (blocks.length) {
      h += '<div class="bg-rose-50 border-2 border-rose-400 rounded-lg p-3 text-rose-900 space-y-1">';
      h += '<div class="font-bold text-sm"><i class="fa-solid fa-ban mr-1"></i>Pengajuan diblokir — file tidak sesuai identitas sekolah atau sumber dana</div>';
      h += '<p class="text-[11px] opacity-90">Unggah ulang PDF RKAS yang benar (NPSN sekolah &amp; jenis sumber dana harus cocok dengan pilihan Anda).</p>';
      blocks.forEach(function (w) { h += '<div class="bg-white/70 border-l-4 border-rose-500 p-2 rounded-r text-[11px]"><i class="fa-solid fa-xmark mr-1"></i>' + esc(w) + "</div>"; });
      h += "</div>";
    }
    (r.warnings || []).forEach(function (w) { h += '<div class="bg-amber-50 border-l-4 border-amber-500 p-2 rounded-r-lg text-amber-900"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + esc(w) + "</div>"; });
    if (!blocks.length && !(r.warnings || []).length) h += '<div class="bg-emerald-50 border-l-4 border-emerald-500 p-2 rounded-r-lg text-emerald-900"><i class="fa-solid fa-circle-check mr-1"></i>Identitas &amp; sumber dana cocok; total hasil baca sesuai dokumen.</div>';
    else if (!blocks.length) h += '<div class="bg-emerald-50 border-l-4 border-emerald-500 p-2 rounded-r-lg text-emerald-900"><i class="fa-solid fa-circle-check mr-1"></i>Identitas sekolah &amp; sumber dana sesuai. Siap diajukan setelah tinjauan.</div>';
    h += '<div id="detTotals">' + totalsCards(liveTotals()) + "</div>";
    if (!r.items.length) {
      h += '<div class="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800"><b>Tidak ada baris yang berhasil dibaca.</b> Pastikan PDF adalah hasil cetak Lembar RKAS dari ARKAS (bukan hasil scan/foto).' + (r.sampleLines && r.sampleLines.length ? '<details class="mt-2"><summary class="cursor-pointer font-semibold">Teks yang terbaca dari PDF (untuk diagnosa)</summary><pre class="mt-1 whitespace-pre-wrap text-[10px] bg-white border rounded p-2 max-h-48 overflow-auto">' + esc(r.sampleLines.join("\n")) + "</pre></details>" : "") + "</div>";
    } else {
      h += '<div class="flex flex-wrap items-center gap-2"><b class="text-slate-700">Rincian per rekening (' + r.items.length + ' baris)</b><span class="flex-1"></span><label class="text-slate-500">Tampilkan:</label><select class="inp" style="width:auto;padding:4px 8px" data-act="detFilter"><option value="">Semua jenis</option>' + KAT_ALL.map(function (c) { return '<option value="' + c.k + '"' + (d.filter === c.k ? " selected" : "") + ">" + c.n + "</option>"; }).join("") + "</select></div>";
      h += '<div class="overflow-auto border border-slate-200 rounded-lg" style="max-height:38vh"><table class="tbl"><thead><tr><th>No</th><th>Kode Kegiatan</th><th>Kode Rekening</th><th>Uraian</th><th class="r">Jumlah</th><th>Jenis Belanja</th></tr></thead><tbody>';
      r.items.forEach(function (it, i) {
        if (d.filter && it.kategori !== d.filter) return;
        h += '<tr style="' + (it.kategori === "lainnya" ? "background:#fff1f2" : "") + '"><td class="text-slate-400">' + esc(it.no) + '</td><td style="font-family:monospace">' + esc(it.kodeKegiatan || "—") + '</td><td style="font-family:monospace">' + esc(it.kodeRekening) + '</td><td style="min-width:200px">' + esc(it.uraian) + '</td><td class="r"><b>' + num(it.jumlah) + "</b></td><td>";
        if (ed) h += '<select class="inp" style="padding:3px 6px;font-size:11px" data-reclass="' + i + '">' + KAT_ALL.map(function (c) { return '<option value="' + c.k + '"' + (it.kategori === c.k ? " selected" : "") + ">" + c.n + "</option>"; }).join("") + "</select>";
        else h += esc((KAT_ALL.find(function (c) { return c.k === it.kategori; }) || {}).n || it.kategori);
        if (it.auto === false) h += ' <span style="font-size:9px;font-weight:700;color:#4338ca;background:#eef2ff;border:1px solid #c7d2fe;border-radius:4px;padding:0 4px">manual</span>';
        h += "</td></tr>";
      });
      h += "</tbody></table></div>";
    }
    h += "</div>";
    h += '<div class="bg-slate-100 px-5 py-3 flex flex-wrap gap-2 justify-end border-t border-slate-200">';
    if (ed && r.items.length) h += '<button id="btnSaveReclass" data-act="saveReclass" class="btn btn-navy" style="background:#4f46e5;' + (Object.keys(d.dirty).length ? "" : "opacity:.5") + '"><i class="fa-solid fa-floppy-disk"></i> Simpan Koreksi</button>';
    if (isOp() && ed) {
      if (blocks.length || !r.items.length) {
        h += '<button type="button" disabled class="btn" style="background:#94a3b8;cursor:not-allowed;opacity:.85" title="Tidak dapat diajukan: file tidak sesuai identitas sekolah atau sumber dana"><i class="fa-solid fa-ban"></i> Tidak dapat diajukan</button>';
      } else {
        h += '<button data-act="detSubmit" class="btn btn-green"><i class="fa-solid fa-paper-plane"></i> Ajukan ke Dinas</button>';
      }
    }
    if (isAdmin()) {
      if (r.status === "Diajukan") h += '<button data-act="adm" data-v="verify" class="btn btn-green"><i class="fa-solid fa-circle-check"></i> Verifikasi</button><button data-act="adm" data-v="reject" class="btn btn-red"><i class="fa-solid fa-circle-xmark"></i> Tolak</button>';
      if (r.status !== "Draft") h += '<button data-act="adm" data-v="reopen" class="btn btn-amber"><i class="fa-solid fa-lock-open"></i> Buka Kunci</button>';
    }
    if ((isOp() && ed) || isAdmin()) h += '<button data-act="detDelete" class="btn btn-line" style="color:#be123c;border-color:#fda4af"><i class="fa-solid fa-trash"></i> Hapus</button>';
    h += '<button data-act="closeDetail" class="btn" style="background:#475569">Tutup</button></div>';
    $("detailBody").innerHTML = h;
  }
  function reclass(i, k) {
    var d = S.detail, it = d.rec.items[i]; it.kategori = k; it.auto = false; d.dirty[i] = k;
    $("detTotals").innerHTML = totalsCards(liveTotals());
    var b = $("btnSaveReclass"); if (b) b.style.opacity = "1";
  }
  async function saveReclass(silent) {
    var d = S.detail, keys = Object.keys(d.dirty);
    if (!keys.length) { if (!silent) toast("Tidak ada perubahan."); return true; }
    try {
      var j = await post("/api/anggaran/action", { year: S.year, tahap: d.tahap, sumber: d.sumber, schoolNo: d.no, action: "reclass", overrides: keys.map(function (i) { return { index: Number(i), kategori: d.dirty[i] }; }) });
      d.rec = Object.assign({}, d.rec, { items: j.record.items, totals: j.record.totals }); d.dirty = {};
      if (!silent) toast("Koreksi tersimpan.");
      return true;
    } catch (e) { toast(e.message, true); return false; }
  }
  async function detAction(action, catatan) {
    var d = S.detail;
    try {
      var j = await post("/api/anggaran/action", { year: S.year, tahap: d.tahap, sumber: d.sumber, schoolNo: d.no, action: action, catatan: catatan || "" });
      return j;
    } catch (e) {
      // Jika server menolak karena identitas/sumber dana, tampilkan detail di modal
      if (e && e.blockingErrors && e.blockingErrors.length && d && d.rec) {
        d.rec.blockingErrors = e.blockingErrors;
        d.rec.canSubmit = false;
        renderDetail();
        alert("Pengajuan ditolak:\n\n• " + e.blockingErrors.join("\n• "));
      } else {
        toast(e.message || "Gagal memproses", true);
      }
      return null;
    }
  }
  async function afterChange() { await loadData(); if (S.tab === "input") renderInputDyn(); else renderView(); }

  // ---------- event delegation ----------
  document.addEventListener("click", async function (e) {
    var dd = $("schoolDrop");
    if (dd && !e.target.closest("#schoolSearch") && !e.target.closest("#schoolDrop")) dd.classList.add("hidden");
    var t = e.target.closest("[data-act]"); if (!t || t.tagName === "SELECT") return;
    var act = t.getAttribute("data-act"), v = t.getAttribute("data-v");
    var d = S.detail;
    switch (act) {
      case "tab": S.tab = v; renderTabs(); renderView(); if (window.RekonNav) RekonNav.syncActive("penganggaran", S.tab); break;
      case "pickSchool": pickSchool(t.getAttribute("data-no")); break;
      case "clearSchool": S.form.schoolNo = null; S.form.file = null; var inp = $("schoolSearch"); if (inp) { inp.value = ""; inp.focus(); } $("schoolChip").innerHTML = schoolChip(); renderInputDyn(); break;
      case "setTahap": S.form.tahap = v; S.form.file = S.form.file; renderInputDyn(); break;
      case "setSumber": S.form.sumber = v; renderInputDyn(); break;
      case "doUpload": doUpload(); break;
      case "open": openDetail(t.getAttribute("data-no"), t.getAttribute("data-t"), t.getAttribute("data-s")); break;
      case "more": S.list.limit += 150; renderDaftarBody(); break;
      case "rkTahap": S.rekap.tahap = v; renderView(); break;
      case "print": doPrint(); break;
      case "xlsx": doXlsx(); break;
      case "closeDetail": $("detailModal").classList.add("hidden"); S.detail = null; break;
      case "saveReclass": if (await saveReclass()) { renderDetail(); afterChange(); } break;
      case "detSubmit": {
        var blocks2 = Array.isArray(d.rec.blockingErrors) ? d.rec.blockingErrors : [];
        if (blocks2.length || !(d.rec.items && d.rec.items.length)) {
          alert("Pengajuan ditolak.\n\nFile PDF tidak sesuai identitas sekolah atau jenis sumber dana, atau tidak ada baris anggaran terbaca.\n\n• Pastikan NPSN di dokumen sama dengan sekolah Anda\n• Pastikan sumber dana (Reguler/Kinerja/Prestasi/SiLPA) sama dengan yang dipilih\n• Unggah ulang PDF RKAS yang benar");
          renderDetail();
          break;
        }
        if (!(await saveReclass(true))) break;
        var lain = liveTotals().lainnya;
        if (lain && !confirm("Masih ada " + rp(lain) + " yang belum terklasifikasi. Tetap ajukan?")) { renderDetail(); break; }
        if (!confirm("Ajukan dokumen ini ke Dinas? Setelah diajukan data terkunci sampai diverifikasi/ditolak.")) break;
        var jSub = await detAction("submit");
        if (jSub) {
          toast("Berhasil diajukan ke Dinas.");
          $("detailModal").classList.add("hidden");
          S.detail = null;
          afterChange();
        }
        break;
      }
      case "adm": {
        var note = "";
        if (v === "reject") { note = prompt("Alasan penolakan (wajib diisi):", ""); if (!note || !note.trim()) break; }
        else if (v === "verify") { note = prompt("Catatan verifikasi (opsional):", "") || ""; }
        else if (v === "reopen") { if (!confirm("Buka kunci dokumen ini? Status kembali ke Draft agar sekolah dapat memperbaiki.")) break; note = prompt("Catatan untuk sekolah (opsional):", "") || ""; }
        var j = await detAction(v, note);
        if (j) { toast("Status: " + j.record.status); d.rec = j.record; d.dirty = {}; renderDetail(); afterChange(); }
        break;
      }
      case "detDelete":
        if (!confirm("Hapus dokumen " + srcName(d.sumber) + " " + tahapName(d.tahap) + " ini beserta hasil bacanya?")) break;
        if (await detAction("delete")) { toast("Dokumen dihapus."); $("detailModal").classList.add("hidden"); S.detail = null; afterChange(); }
        break;
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "angFile") { S.form.file = t.files && t.files[0] ? t.files[0] : null; renderInputDyn(); return; }
    if (t.getAttribute && t.getAttribute("data-reclass") != null) { reclass(Number(t.getAttribute("data-reclass")), t.value); return; }
    if (t.getAttribute && t.getAttribute("data-act") === "detFilter") { S.detail.filter = t.value; renderDetail(); return; }
    if (t.dataset && t.dataset.f && t.type !== "text" && t.type !== "search") dispatchF(t);
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "schoolSearch") { dropHl = -1; if (S.form.schoolNo != null && t.value !== schoolOf(S.form.schoolNo).name) { /* mengetik ulang = ganti sekolah */ } renderDrop(); return; }
    if (t.dataset && t.dataset.f && (t.type === "text" || t.type === "search")) dispatchF(t);
  });
  document.addEventListener("focusin", function (e) { if (e.target.id === "schoolSearch") { e.target.select(); renderDrop(); } });
  document.addEventListener("keydown", function (e) {
    if (e.target.id !== "schoolSearch") return;
    var d = $("schoolDrop"); if (!d || d.classList.contains("hidden")) return;
    var opts = d.querySelectorAll(".opt"); if (!opts.length) return;
    if (e.key === "ArrowDown") { dropHl = Math.min(opts.length - 1, dropHl + 1); e.preventDefault(); }
    else if (e.key === "ArrowUp") { dropHl = Math.max(0, dropHl - 1); e.preventDefault(); }
    else if (e.key === "Enter") { if (dropHl >= 0) { pickSchool(opts[dropHl].getAttribute("data-no")); e.preventDefault(); } else if (opts.length === 1) { pickSchool(opts[0].getAttribute("data-no")); e.preventDefault(); } return; }
    else if (e.key === "Escape") { d.classList.add("hidden"); return; }
    else return;
    opts.forEach(function (o, i) { o.classList.toggle("hl", i === dropHl); });
    if (opts[dropHl]) opts[dropHl].scrollIntoView({ block: "nearest" });
  });
  function dispatchF(t) {
    setPath(t.dataset.f, t.type === "checkbox" ? t.checked : t.value);
    if (t.dataset.f.indexOf("list.") === 0) S.list.limit = 150;
    var r = t.dataset.r;
    if (r === "daftar") renderDaftarBody();
    else if (r === "rekap") renderView();
    else if (r === "banding") renderView();
  }

  $("btnLogout").addEventListener("click", async function () {
    try { await api("/api/logout", { method: "POST" }); } catch (e) {}
    try { sessionStorage.removeItem("rekon_node_token"); localStorage.setItem("bosp_currentUser", "null"); } catch (e) {}
    location.href = "/";
  });

  boot();
})();
