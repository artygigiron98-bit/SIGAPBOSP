/**
 * Menu sidebar bersama (Beranda · Realisasi Belanja · Penganggaran).
 * Satu-satunya tempat struktur menu didefinisikan.
 *
 *  - Grup "Utama" (Beranda & Dashboard Rekap) tampil sebagai tautan biasa.
 *  - Semua grup lain berupa DROPDOWN (accordion): klik judul grup untuk membuka/menutup.
 *    Grup yang berisi halaman aktif otomatis terbuka; status buka/tutup grup lain diingat di peramban.
 *  - Item bertipe  page   → tautan ke halaman HTML terpisah (opsional  tab  → langsung ke tab halaman itu)
 *  - Item bertipe  action → modal/aksi; dijalankan lewat RekonNav.run(kunci)
 *      · di index.html & realisasi.html  : app.js menimpa RekonNav.run (membuka modal / pindah halaman)
 *      · di penganggaran.html            : bawaan di bawah → pindah halaman lalu membuka aksi (?open=kunci)
 */
(function (w) {
  "use strict";

  var PAGES = { beranda: "/", realisasi: "/realisasi.html", penganggaran: "/penganggaran.html" };
  // Aksi yang hanya bermakna di halaman Realisasi Belanja (butuh tabel/filter halaman itu). Selebihnya: Beranda.
  var HOME = { input: "realisasi", export: "realisasi" };
  var STORE_KEY = "bosp_nav_open";

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function readOpenState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeOpenState(key, open) {
    var st = readOpenState();
    st[key] = !!open;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) {}
  }

  /** Definisi grup menu menurut peran. flat = tanpa dropdown. */
  function groups(role) {
    var admin = role === "Admin Dinas", op = role === "Operator Sekolah", bud = role === "BUD";
    var g = [];

    // ---- Utama: tidak berupa dropdown ----
    g.push({
      key: "utama", title: "Utama", flat: true,
      items: [
        { icon: "fa-house", label: "Beranda", page: "beranda" },
        { icon: "fa-chart-line", label: "Dashboard Rekap", action: "dashboard" }
      ]
    });

    // ---- Data Master ----
    if (admin) {
      g.push({
        key: "master", title: "Data Master", icon: "fa-database",
        items: [
          { icon: "fa-school-flag", label: "Data Master Sekolah", action: "master" },
          { icon: "fa-users", label: "Daftar User Terdaftar", action: "users" },
          { icon: "fa-key", label: "Ubah Password Admin", action: "password" },
          { icon: "fa-brands fa-whatsapp", label: "Notifikasi WhatsApp", action: "wa" },
          { icon: "fa-clock-rotate-left", label: "Audit Log", action: "audit" },
          { icon: "fa-download", label: "Backup Data", action: "backup" }
        ]
      });
    } else if (op) {
      g.push({
        key: "master", title: "Data Master", icon: "fa-database",
        items: [
          { icon: "fa-school-flag", label: "Data Master Sekolah", action: "profile" }
        ]
      });
    }

    // ---- Realisasi Belanja ----
    var rb = [{ icon: "fa-table-list", label: "Daftar Rekonsiliasi", page: "realisasi" }];
    if (admin) rb.push({ icon: "fa-pen-to-square", label: "Input Realisasi Rinci", action: "input", gold: true });
    if (op) rb.push({ icon: "fa-pen-to-square", label: "Input / Ajukan Realisasi", action: "input", gold: true });
    g.push({ key: "realisasi", title: "Realisasi Belanja", icon: "fa-table-list", items: rb });

    // ---- Penganggaran (tiap tab halaman menjadi sub-menu) ----
    if (admin || op || bud) {
      var pg = [];
      if (admin || op) pg.push({ icon: "fa-file-arrow-up", label: "Input Penganggaran", page: "penganggaran", tab: "input", gold: true });
      pg.push({ icon: "fa-table-list", label: "Daftar Anggaran", page: "penganggaran", tab: "daftar" });
      pg.push({ icon: "fa-print", label: bud ? "Rekap Penganggaran (RKAS)" : "Rekap & Cetak", page: "penganggaran", tab: "rekap" });
      pg.push({ icon: "fa-code-compare", label: "Induk vs Perubahan", page: "penganggaran", tab: "banding" });
      g.push({ key: "anggaran", title: "Penganggaran", icon: "fa-coins", items: pg });
    }

    // ---- Laporan & Cetak ----
    if (admin) {
      g.push({
        key: "laporan", title: "Laporan & Cetak", icon: "fa-print",
        items: [
          { icon: "fa-print", label: "Cetak SP2B Kabupaten", action: "sp2bkab" },
          { icon: "fa-file-invoice-dollar", label: "Rekap SP2B 1 Tahun", action: "annual" },
          { icon: "fa-map-location-dot", label: "Rekapitulasi Kecamatan", action: "kecamatan" },
          { icon: "fa-ranking-star", label: "Peringkat Sekolah", action: "rank" },
          { icon: "fa-file-excel", label: "Ekspor Data (CSV)", action: "export" }
        ]
      });
    } else if (op) {
      g.push({
        key: "laporan", title: "Laporan & Cetak", icon: "fa-print",
        items: [
          { icon: "fa-file-lines", label: "Cetak Rekap Realisasi", action: "rekapSekolah" },
          { icon: "fa-print", label: "Cetak Rekap Penganggaran", page: "penganggaran", tab: "rekap" }
        ]
      });
    }

    // ---- Akun (Admin tidak memiliki "Ganti Akun") ----
    if (!admin) {
      g.push({ key: "akun", title: "Akun", icon: "fa-user-gear", items: [{ icon: "fa-right-left", label: "Ganti Akun", action: "switch" }] });
    }
    return g;
  }

  function itemIsActive(it, page, tab) {
    if (!it.page || it.page !== page) return false;
    if (it.tab) return !!tab && it.tab === tab;
    return true;
  }

  function itemHtml(it, page, tab) {
    var icon = it.icon.indexOf("fa-brands") === 0 ? it.icon : "fa-solid " + it.icon;
    var cls = "sb-item" + (it.gold ? " gold" : "");
    var active = itemIsActive(it, page, tab);
    if (active) cls += " active";
    if (it.page && !it.tab) {
      return '<a class="' + cls + '" href="' + PAGES[it.page] + '" data-nav-page="' + it.page + '"' + (active ? ' aria-current="page"' : "") + '><i class="' + icon + '"></i> ' + esc(it.label) + "</a>";
    }
    if (it.page && it.tab) {
      return '<button type="button" class="' + cls + '" data-nav-page="' + it.page + '" data-nav-tab="' + it.tab + '"' +
        ' onclick="RekonNav.go(\'' + it.page + "','" + it.tab + '\')"' + (active ? ' aria-current="page"' : "") + '><i class="' + icon + '"></i> ' + esc(it.label) + "</button>";
    }
    return '<button type="button" class="' + cls + '" onclick="RekonNav.run(\'' + it.action + '\')"><i class="' + icon + '"></i> ' + esc(it.label) + "</button>";
  }

  /** HTML isi menu. */
  function html(role, page) {
    var out = "", st = readOpenState(), tab = Nav.tab;
    groups(role).forEach(function (grp) {
      if (grp.flat) {
        out += '<div class="sb-group"><div class="sb-group-title">' + esc(grp.title) + "</div>";
        grp.items.forEach(function (it) { out += itemHtml(it, page, tab); });
        out += "</div>";
        return;
      }
      var hasActive = grp.items.some(function (it) { return it.page === page; });
      var open = hasActive || st[grp.key] === true;
      var id = "sbdd-" + grp.key;
      out += '<div class="sb-group sb-dd' + (open ? " open" : "") + (hasActive ? " has-active" : "") + '" data-group="' + grp.key + '">' +
        '<button type="button" class="sb-dd-head" aria-expanded="' + (open ? "true" : "false") + '" aria-controls="' + id + '" onclick="RekonNav.toggle(this)">' +
        '<span class="sb-dd-ic"><i class="fa-solid ' + grp.icon + '"></i></span>' +
        '<span class="sb-dd-title">' + esc(grp.title) + "</span>" +
        '<i class="fa-solid fa-chevron-down sb-dd-chev"></i></button>' +
        '<div class="sb-dd-body" id="' + id + '"><div class="sb-dd-inner">';
      grp.items.forEach(function (it) { out += itemHtml(it, page, tab); });
      out += "</div></div></div>";
    });
    return out;
  }

  /** URL halaman tempat sebuah aksi dijalankan. */
  function urlFor(action) {
    return PAGES[HOME[action] || "beranda"] + "?open=" + encodeURIComponent(action);
  }

  function currentPage() {
    return (document.body && document.body.getAttribute("data-page")) || "beranda";
  }
  function closeMobileSidebar() {
    if (typeof w.closeSidebarMobile === "function") { w.closeSidebarMobile(); return; }
    var bd = document.querySelector(".sb-backdrop");
    if (bd && w.matchMedia("(max-width: 900px)").matches && document.querySelector(".sidebar-open-mobile")) bd.click();
  }

  var Nav = {
    PAGES: PAGES,
    HOME: HOME,
    tab: null,           // tab aktif pada halaman bertab (diisi penganggaran.js lewat syncActive)
    tabHandler: null,    // fungsi(tab) → pindah tab tanpa memuat ulang halaman
    groups: groups,
    html: html,
    urlFor: urlFor,

    /** Buka / tutup satu grup dropdown. */
    toggle: function (btn) {
      var grp = btn && btn.closest ? btn.closest(".sb-dd") : null;
      if (!grp) return;
      var open = !grp.classList.contains("open");
      grp.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      writeOpenState(grp.getAttribute("data-group"), open);
    },

    /** Menuju halaman (+ tab). Bila sudah di halaman itu dan ada tabHandler → ganti tab tanpa reload. */
    go: function (page, tab) {
      if (page === currentPage() && tab && typeof Nav.tabHandler === "function") {
        Nav.tabHandler(tab);
        closeMobileSidebar();
        return;
      }
      w.location.href = PAGES[page] + (tab ? "?tab=" + encodeURIComponent(tab) : "");
    },

    /** Perbarui penanda item aktif (dipanggil saat tab halaman berganti). */
    syncActive: function (page, tab) {
      Nav.tab = tab || null;
      var items = document.querySelectorAll(".app-sidebar [data-nav-page]");
      Array.prototype.forEach.call(items, function (el) {
        var on = el.getAttribute("data-nav-page") === page &&
          (!el.getAttribute("data-nav-tab") || el.getAttribute("data-nav-tab") === Nav.tab);
        el.classList.toggle("active", on);
        if (on) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
      });
      var groupsEl = document.querySelectorAll(".app-sidebar .sb-dd");
      Array.prototype.forEach.call(groupsEl, function (g) {
        var has = !!g.querySelector(".sb-item.active");
        g.classList.toggle("has-active", has);
        if (has && !g.classList.contains("open")) {
          g.classList.add("open");
          var h = g.querySelector(".sb-dd-head");
          if (h) h.setAttribute("aria-expanded", "true");
        }
      });
    },

    // Bawaan (halaman tanpa modal, mis. penganggaran.html): pindah halaman lalu buka aksi
    run: function (action) {
      if (action === "switch") { var b = document.getElementById("btnLogout"); if (b) b.click(); return; }
      w.location.href = urlFor(action);
    },

    /**
     * Pasang kerangka sidebar (dipakai penganggaran.html).
     * index.html / realisasi.html sudah punya kerangka sendiri dan hanya memakai Nav.html().
     */
    mountShell: function (o) {
      var root = document.getElementById("mainAppContainer");
      if (!root || document.getElementById("appSidebar")) return;
      root.classList.add("app-with-sidebar");
      var aside = document.createElement("aside");
      aside.id = "appSidebar";
      aside.className = "app-sidebar no-print";
      aside.setAttribute("aria-label", "Navigasi utama");
      aside.innerHTML =
        '<div class="sb-brand"><div class="lp-logo"><img src="/logo.png" alt="SIGAP-BOSP" width="48" height="48" onerror="this.style.display=\'none\'"></div>' +
        '<div><b>SIGAP-BOSP</b><small>Rekonsiliasi Dana BOSP</small></div></div>' +
        '<div class="sb-user"><strong>' + esc(o.name || "—") + "</strong><span>" + esc(o.role || "—") + "</span></div>" +
        '<div class="sb-scroll">' + html(o.role, o.page) + "</div>" +
        '<div class="sb-foot"><button type="button" class="sb-item danger" id="sbLogoutBtn"><i class="fa-solid fa-power-off"></i> Keluar</button></div>';
      var backdrop = document.createElement("div");
      backdrop.className = "sb-backdrop no-print";
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "sb-toggle no-print";
      toggle.title = "Tampilkan / sembunyikan menu";
      toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
      root.insertBefore(backdrop, root.firstChild);
      root.insertBefore(toggle, root.firstChild);
      root.insertBefore(aside, root.firstChild);

      function mobile() { return w.matchMedia("(max-width: 900px)").matches; }
      function apply(collapsed) {
        aside.classList.toggle("collapsed", collapsed);
        toggle.classList.toggle("shifted", !collapsed);
        if (mobile()) { root.classList.toggle("sidebar-open-mobile", !collapsed); root.classList.remove("sidebar-collapsed"); }
        else { root.classList.toggle("sidebar-collapsed", collapsed); root.classList.remove("sidebar-open-mobile"); }
      }
      var collapsed = mobile() ? true : false;
      if (!mobile()) { try { collapsed = localStorage.getItem("bosp_sidebar_collapsed") === "1"; } catch (e) {} }
      apply(collapsed);
      toggle.addEventListener("click", function () {
        var nowCollapsed = !aside.classList.contains("collapsed");
        apply(nowCollapsed);
        if (!mobile()) { try { localStorage.setItem("bosp_sidebar_collapsed", nowCollapsed ? "1" : "0"); } catch (e) {} }
      });
      backdrop.addEventListener("click", function () { apply(true); });
      document.getElementById("sbLogoutBtn").addEventListener("click", function () {
        if (typeof o.onLogout === "function") o.onLogout();
      });
    }
  };

  w.RekonNav = Nav;
})(window);
