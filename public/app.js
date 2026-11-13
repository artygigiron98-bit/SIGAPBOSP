        // Halaman aktif: "beranda" (index.html) atau "realisasi" (realisasi.html)
        const PAGE = (document.body && document.body.getAttribute("data-page")) || "beranda";

        // ============================================================
        // MODE API:
        // - Jika dibuka lewat server Node (npm start) → pakai backend lokal (uploads/, data/)
        // - Jika ingin pakai Google Apps Script → set window.REKON_USE_GAS = true
        //   dan/atau window.REKON_API_BASE = "https://script.google.com/.../exec"
        // ============================================================
        const USE_NODE_BACKEND = (typeof window.REKON_USE_GAS === "boolean")
            ? !window.REKON_USE_GAS
            : (window.location.protocol === "http:" || window.location.protocol === "https:")
                && window.location.hostname !== ""
                && window.location.hostname !== "null";

        const NODE_API_BASE = (typeof window.REKON_API_BASE === "string" && window.REKON_API_BASE.trim()
            && window.REKON_API_BASE.indexOf("script.google.com") === -1)
            ? window.REKON_API_BASE.trim().replace(/\/$/, "")
            : (window.location.origin || "http://localhost:3000");

        // URL GAS (hanya dipakai jika USE_NODE_BACKEND = false)
        const GAS_WEB_APP_URL = (typeof window.REKON_API_BASE === "string" && window.REKON_API_BASE.indexOf("script.google.com") !== -1)
            ? window.REKON_API_BASE.trim()
            : "https://script.google.com/macros/s/AKfycbxdGspNfrgKY95DgBZvWIv2j0unWBsmOWJ6ueg4jSnsPPVtz4OopXfPabk9NrEYlBGm/exec";

        function isGasConfigured() {
            if (USE_NODE_BACKEND) return false; // pakai Node, bukan GAS
            return typeof GAS_WEB_APP_URL === "string"
                && GAS_WEB_APP_URL.indexOf("script.google.com") !== -1
                && GAS_WEB_APP_URL.indexOf("PASTE_DEPLOYMENT_ID") === -1;
        }

        function isNodeBackend() {
            return !!USE_NODE_BACKEND;
        }

        // Token JWT dari login Node (fallback jika cookie tidak terkirim)
        let nodeAuthToken = sessionStorage.getItem("rekon_node_token") || "";

        const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agus", "Sep", "Okt", "Nov", "Des"];
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        
        let periodType = "bulan"; // "bulan", "triwulan", "semester", "tahun"
        let currentMonth = "Jan";
        let currentTriwulan = "TW1"; // TW1 (Jan-Mar), TW2 (Apr-Jun), TW3 (Jul-Sep), TW4 (Okt-Des)
        let currentSemester = "S1"; // S1 (Jan-Jun), S2 (Jul-Des)

        let defaultBaseSchools = [
            { no: 1, npsn: "69762652", name: "SDN 1 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
            { no: 2, npsn: "40102206", name: "SDN 2 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
            { no: 3, npsn: "40101881", name: "SDN 1 LIWUTUNG", alamat: "Liwutung", status: "NEGERI", kecamatan: "PASAN", jenjang: "SD" },
            { no: 4, npsn: "40102145", name: "SDN 2 LIWUTUNG", alamat: "Liwutung", status: "NEGERI", kecamatan: "PASAN", jenjang: "SD" },
            { no: 5, npsn: "40102202", name: "SDN 3 LIWUTUNG", alamat: "Liwutung", status: "NEGERI", kecamatan: "PASAN", jenjang: "SD" },
            { no: 6, npsn: "40102150", name: "SDN WIOI", alamat: "Wioi", status: "NEGERI", kecamatan: "RATAHAN TIMUR", jenjang: "SD" },
            { no: 7, npsn: "40102155", name: "SDN PONIKI", alamat: "Poniki", status: "NEGERI", kecamatan: "PASAN", jenjang: "SD" },
            { no: 8, npsn: "40102160", name: "SD INPRES TOSURAYA", alamat: "Tosuraya", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
            { no: 9, npsn: "40102165", name: "SD INPRES LOWU", alamat: "Lowu", status: "NEGERI", kecamatan: "RATAHAN TIMUR", jenjang: "SD" },
            { no: 10, npsn: "40102170", name: "SD INPRES LIWUTUNG 2", alamat: "Liwutung", status: "NEGERI", kecamatan: "PASAN", jenjang: "SD" },
            { no: 11, npsn: "40102175", name: "SD INPRES LIWUTUNG 1", alamat: "Liwutung", status: "NEGERI", kecamatan: "PASAN", jenjang: "SD" },
            { no: 12, npsn: "40102180", name: "SD INPRES RASI", alamat: "Rasi", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SD" },
            { no: 13, npsn: "40102185", name: "SD INPRES PANGU", alamat: "Pangu", status: "NEGERI", kecamatan: "RATAHAN TIMUR", jenjang: "SD" },
            { no: 14, npsn: "40102190", name: "SD INPRES WIOI", alamat: "Wioi", status: "NEGERI", kecamatan: "RATAHAN TIMUR", jenjang: "SD" },
            { no: 15, npsn: "40102210", name: "SMPN 1 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SMP" },
            { no: 16, npsn: "40102215", name: "SMPN 2 RATAHAN", alamat: "Ratahan", status: "NEGERI", kecamatan: "RATAHAN", jenjang: "SMP" },
            { no: 17, npsn: "40102220", name: "SMPN 1 PASAN", alamat: "Pasan", status: "NEGERI", kecamatan: "PASAN", jenjang: "SMP" },
            { no: 18, npsn: "40102225", name: "SMPN 1 TOMBATU", alamat: "Tombatu", status: "NEGERI", kecamatan: "TOMBATU", jenjang: "SMP" }
        ];

        let defaultUsersDB = [
            { name: "Administrator Dinas", username: "admin", password: "admin2024", role: "Admin Dinas", schoolNo: null, npsn: "", status: "Aktif" },
            { name: "Operator SDN 1 Ratahan", username: "operator", password: "operator2024", role: "Operator Sekolah", schoolNo: 1, npsn: "69762652", status: "Aktif" }
        ];

        let activeYear = parseInt(localStorage.getItem("bosp_activeYear") || "2024", 10) || 2024;
        const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028];
        if (!AVAILABLE_YEARS.includes(activeYear)) activeYear = 2024;

        /* Periode laporan dibagikan antar halaman (Beranda <-> Realisasi Belanja) lewat sessionStorage */
        function restorePeriodState() {
            let saved = null;
            try { saved = JSON.parse(sessionStorage.getItem("bosp_period") || "null"); } catch (e) {}
            if (saved && ["bulan", "triwulan", "semester", "tahun"].includes(saved.type) && saved.year === activeYear) {
                periodType = saved.type;
                if (months.includes(saved.month)) currentMonth = saved.month;
                if (/^TW[1-4]$/.test(saved.tw || "")) currentTriwulan = saved.tw;
                if (/^S[12]$/.test(saved.sem || "")) currentSemester = saved.sem;
            } else {
                // Awal sesi: bulan berjalan (TA berjalan), Desember (TA lampau), Januari (TA mendatang)
                const now = new Date(), cy = now.getFullYear();
                currentMonth = activeYear === cy ? months[now.getMonth()] : (activeYear < cy ? "Des" : "Jan");
                const mi = months.indexOf(currentMonth);
                currentTriwulan = "TW" + (Math.floor(mi / 3) + 1);
                currentSemester = mi < 6 ? "S1" : "S2";
            }
        }
        restorePeriodState();
        function savePeriodState() {
            try {
                sessionStorage.setItem("bosp_period", JSON.stringify({
                    type: periodType, month: currentMonth, tw: currentTriwulan, sem: currentSemester, year: activeYear
                }));
            } catch (e) {}
        }

        function yearKey(base) { return "bosp_y" + activeYear + "_" + base; }

        let baseSchools = JSON.parse(localStorage.getItem("bosp_baseSchools")) || defaultBaseSchools;
        // Migrasi sekali: data lama tanpa tahun -> tahun 2024
        if (!localStorage.getItem("bosp_y2024_monthlyData") && localStorage.getItem("bosp_monthlyData")) {
            try {
                localStorage.setItem("bosp_y2024_monthlyData", localStorage.getItem("bosp_monthlyData"));
                if (localStorage.getItem("bosp_sp2bKab") && !localStorage.getItem("bosp_y2024_sp2bKab")) {
                    localStorage.setItem("bosp_y2024_sp2bKab", localStorage.getItem("bosp_sp2bKab"));
                }
            } catch (e) {}
        }
        let monthlyData = JSON.parse(localStorage.getItem(yearKey("monthlyData"))) || {};
        let usersDB = JSON.parse(localStorage.getItem("bosp_usersDB")) || defaultUsersDB;
        let currentUser = JSON.parse(localStorage.getItem("bosp_currentUser")) || null;

        if (Object.keys(monthlyData).length === 0) {
            baseSchools.forEach(s => {
                monthlyData[s.no] = {};
                months.forEach(m => {
                    monthlyData[s.no][m] = {
                        saldoAwalCustom: m === "Jan" ? 0 : null,
                        saldoReguler: m === "Jan" ? 0 : null,
                        saldoKinerja: m === "Jan" ? 0 : null,
                        saldoNonBOS: m === "Jan" ? 0 : null,
                        pendapatan: { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 },
                        belanja: { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 },
                        documents: {
                            rekeningKoran: { url: "", checked: false },
                            bku: { url: "", checked: false },
                            rekapanBelanja: { url: "", checked: false },
                            lra: { url: "", checked: false },
                            bukuPajak: { url: "", checked: false },
                            sptjm: { url: "", checked: false }
                        },
                        verifStatus: "Draft"
                    };
                });
            });
        }

        function isEmptyVal(v) { return v === undefined || v === null || String(v).trim() === ""; }

        function normalizeSchool(s) {
            const n = Number(s.no);
            return { ...s, no: Number.isFinite(n) ? n : s.no, npsn: isEmptyVal(s.npsn) ? "" : String(s.npsn).trim() };
        }

        function findSchoolForUser(u) {
            if (!u) return undefined;
            const npsn = isEmptyVal(u.npsn) ? "" : String(u.npsn).trim();
            let found = npsn ? baseSchools.find(s => String(s.npsn).trim() === npsn) : undefined;
            if (!found && !isEmptyVal(u.schoolNo)) {
                found = baseSchools.find(s => Number(s.no) === Number(u.schoolNo));
            }
            return found;
        }

        function normalizeUser(u) {
            const user = { ...u };
            user.role = isEmptyVal(user.role) ? "" : String(user.role).trim();
            user.npsn = isEmptyVal(user.npsn) ? "" : String(user.npsn).trim();
            user.schoolNo = isEmptyVal(user.schoolNo) ? null : Number(user.schoolNo);
            if (user.role === "Operator Sekolah") {
                const sch = findSchoolForUser(user);
                if (sch) {
                    user.npsn = sch.npsn;
                    user.schoolNo = Number(sch.no);
                }
            }
            return user;
        }

        function cleanSimulatedLinks() {
            let changed = false;
            Object.keys(monthlyData).forEach(no => {
                Object.keys(monthlyData[no] || {}).forEach(m => {
                    const docs = monthlyData[no][m] && monthlyData[no][m].documents;
                    if (!docs) return;
                    Object.keys(docs).forEach(k => {
                        if (docs[k] && typeof docs[k].url === "string" && docs[k].url.includes("simulated_")) {
                            docs[k].url = "";
                            changed = true;
                        }
                    });
                });
            });
            return changed;
        }

        function repairUserData() {
            baseSchools = baseSchools.map(normalizeSchool);
            usersDB = usersDB.map(normalizeUser);
            if (currentUser) {
                const fresh = usersDB.find(x => String(x.username).toLowerCase() === String(currentUser.username).toLowerCase());
                currentUser = normalizeUser({ ...currentUser, ...(fresh || {}) });
            }
            localStorage.setItem("bosp_baseSchools", JSON.stringify(baseSchools));
            localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB));
            localStorage.setItem("bosp_currentUser", JSON.stringify(currentUser));
        }

        function mapSheetUser(raw) {
            const low = {};
            Object.keys(raw || {}).forEach(k => { low[String(k).toLowerCase().replace(/[\s_\-\/]/g, "")] = raw[k]; });
            const pick = (...names) => { for (const n of names) if (!isEmptyVal(low[n])) return low[n]; return ""; };
            return {
                name: pick("name", "nama", "namalengkap", "namauser"),
                username: String(pick("username", "user", "namapengguna")).trim(),
                password: String(pick("password", "katasandi", "sandi", "pass")),
                role: pick("role", "peran", "peranrole", "level"),
                schoolNo: pick("schoolno", "nosekolah", "no", "nomorsekolah"),
                npsn: pick("npsn", "nomornpsn"),
                whatsapp: pick("whatsapp", "wa", "nowhatsapp", "nomorwhatsapp", "nowa", "nomorwa", "nohp", "hp"),
                status: pick("status", "statusakun") || "Aktif"
            };
        }

        async function loadFromGoogleSheets() {
            const loader = document.getElementById("syncLoadingOverlay");
            if (loader) loader.classList.remove("hidden");
            try {
                // ===== MODE NODE: ambil data dari /api/data =====
                if (isNodeBackend()) {
                    const headers = {};
                    if (nodeAuthToken) headers["Authorization"] = "Bearer " + nodeAuthToken;
                    // Tanpa login, server menolak — pakai localStorage
                    const response = await fetch(NODE_API_BASE + "/api/data?year=" + encodeURIComponent(activeYear), {
                        method: "GET",
                        credentials: "include",
                        headers: headers,
                        cache: "no-store"
                    });
                    if (response.status === 401) {
                        console.warn("Belum login ke Node — pakai data localStorage.");
                        return;
                    }
                    const result = await response.json();
                    if (result.status === "success") {
                        if (result.schools && result.schools.length > 0) baseSchools = result.schools.map(normalizeSchool);
                        if (result.monthlyData && Object.keys(result.monthlyData).length > 0) {
                            monthlyData = result.monthlyData;
                        }
                        if (Array.isArray(result.users) && result.users.length > 0) {
                            usersDB = result.users.map(u => normalizeUser({ ...u, password: u.password || "" }));
                        }
                        if (window.SigapFirebaseDrive && typeof window.SigapFirebaseDrive.loadMonthlyFromFirestore === "function") {
                            try {
                                const fbMonthly = await window.SigapFirebaseDrive.loadMonthlyFromFirestore(activeYear);
                                if (fbMonthly && typeof fbMonthly === "object") {
                                    Object.keys(fbMonthly).forEach(no => {
                                        if (!monthlyData[no]) monthlyData[no] = {};
                                        Object.keys(fbMonthly[no] || {}).forEach(m => {
                                            monthlyData[no][m] = Object.assign({}, monthlyData[no][m] || {}, fbMonthly[no][m]);
                                        });
                                    });
                                }
                            } catch (fbErr) {
                                console.warn("Gagal sinkron baca dari Firestore:", fbErr);
                            }
                        }
                        localStorage.setItem("bosp_baseSchools", JSON.stringify(baseSchools));
                        localStorage.setItem(yearKey("monthlyData"), JSON.stringify(monthlyData));
                        localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB));
                        localStorage.setItem("bosp_activeYear", String(activeYear));
                        console.log("Data dimuat dari server Node & Firebase Firestore, tahun:", activeYear);
                    }
                    return;
                }

                if (!isGasConfigured()) {
                    console.warn("GAS belum dikonfigurasi. Menggunakan data lokal.");
                    return;
                }
                const response = await fetch(GAS_WEB_APP_URL + "?action=getData", {
                    method: "GET",
                    redirect: "follow"
                });
                const result = await response.json();
                if (result.status === "success") {
                    if (result.schools && result.schools.length > 0) baseSchools = result.schools;
                    if (result.monthlyData && Object.keys(result.monthlyData).length > 0) {
                        monthlyData = result.monthlyData;
                    }
                    if (Array.isArray(result.users) && result.users.length > 0) {
                        const localUsers = JSON.parse(localStorage.getItem("bosp_usersDB") || "[]");
                        const localMap = new Map();
                        localUsers.forEach(u => { if (u && u.username) localMap.set(String(u.username).toLowerCase(), u); });
                        const mergedUsers = new Map();
                        result.users.map(mapSheetUser).filter(u => u.username).forEach(u => {
                            const loc = localMap.get(u.username.toLowerCase()) || {};
                            const merged = { ...u };
                            ["npsn", "schoolNo", "role", "name", "whatsapp"].forEach(k => { if (isEmptyVal(merged[k]) && !isEmptyVal(loc[k])) merged[k] = loc[k]; });
                            mergedUsers.set(u.username.toLowerCase(), merged);
                        });
                        usersDB = Array.from(mergedUsers.values());
                    }
                    baseSchools = baseSchools.map(normalizeSchool);
                    usersDB = usersDB.map(normalizeUser);
                    localStorage.setItem("bosp_baseSchools", JSON.stringify(baseSchools));
                    localStorage.setItem(yearKey("monthlyData"), JSON.stringify(monthlyData));
                    localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB));
                    localStorage.setItem("bosp_activeYear", String(activeYear));
                } else {
                    console.warn("Respons GAS tidak sukses:", result.message || result);
                }
            } catch (err) {
                console.warn("Gagal terhubung ke server, menggunakan data lokal.", err);
            } finally {
                if (loader) loader.classList.add("hidden");
            }
        }

        async function saveToLocalStorage(onlySchoolNo) {
            localStorage.setItem("bosp_baseSchools", JSON.stringify(baseSchools));
            localStorage.setItem(yearKey("monthlyData"), JSON.stringify(monthlyData));
            localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB));
            localStorage.setItem("bosp_currentUser", JSON.stringify(currentUser));
            localStorage.setItem("bosp_activeYear", String(activeYear));

            // Sinkron ke server Node ATAU Google Apps Script
            if (isNodeBackend() || isGasConfigured()) {
                try {
                    let payload;
                    if (Array.isArray(onlySchoolNo)) {
                        const part = {};
                        onlySchoolNo.forEach(n => { part[n] = monthlyData[n] || {}; });
                        payload = { action: "saveAll", year: activeYear, partial: true, monthlyData: part };
                    } else if (typeof onlySchoolNo === "number" || typeof onlySchoolNo === "string") {
                        payload = {
                            action: "saveAll",
                            year: activeYear,
                            partial: true,
                            monthlyData: { [onlySchoolNo]: monthlyData[onlySchoolNo] || {} }
                        };
                    } else if (currentUser && currentUser.role === "Operator Sekolah") {
                        const sch = findSchoolForUser(currentUser);
                        payload = sch ? {
                            action: "saveAll",
                            year: activeYear,
                            partial: true,
                            monthlyData: { [sch.no]: monthlyData[sch.no] || {} }
                        } : null;
                    } else {
                        payload = {
                            action: "saveAll",
                            year: activeYear,
                            schools: baseSchools,
                            monthlyData: monthlyData,
                            users: isNodeBackend() ? undefined : usersDB
                        };
                    }
                    if (payload) {
                        await gasPost(payload);
                        if (window.SigapFirebaseDrive && typeof window.SigapFirebaseDrive.syncSavePayloadToFirestore === "function") {
                            try {
                                await window.SigapFirebaseDrive.syncSavePayloadToFirestore(payload, currentUser);
                                await window.SigapFirebaseDrive.logAuditToFirestore("save_data", { year: activeYear, partial: !!payload.partial }, currentUser);
                            } catch (fbErr) {
                                console.warn("Sinkronisasi ke Firebase Firestore tertunda:", fbErr);
                            }
                        }
                        console.log("Data tersimpan ke server & Firebase Firestore, tahun:", activeYear);
                    }
                } catch (err) {
                    console.error("Gagal menyinkronkan data ke server:", err);
                    // Jangan alert di sini agar tidak mengganggu UX; cek di Network tab jika perlu
                }
            }
        }

        let gasReady = false;
        async function ensureServerReady() {
            if (isNodeBackend()) {
                try {
                    const r = await fetch(NODE_API_BASE + "/api/health", { cache: "no-store", credentials: "include" });
                    const j = await r.json();
                    gasReady = !!(j && j.status === "ok");
                    return gasReady;
                } catch (e) {
                    console.warn("Node backend health gagal:", e);
                    gasReady = false;
                    return false;
                }
            }
            if (gasReady) return true;
            if (!isGasConfigured()) return false;
            try {
                const r = await fetch(GAS_WEB_APP_URL + "?action=ping&_=" + Date.now(), {
                    method: "GET",
                    redirect: "follow",
                    cache: "no-store"
                });
                const j = await r.json();
                gasReady = !!(j && (j.version || j.status === "success"));
            } catch (e) {
                console.warn("ensureServerReady gagal:", e);
                gasReady = false;
            }
            return gasReady;
        }

        function nodeHeaders(extra) {
            const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
            if (nodeAuthToken) h["Authorization"] = "Bearer " + nodeAuthToken;
            return h;
        }

        // POST: ke Firebase / Google Drive + Node lokal ATAU Google Apps Script
        async function gasPost(payload) {
            // ===== MODE NODE.JS + FIREBASE + GOOGLE DRIVE =====
            if (isNodeBackend()) {
                const action = payload && payload.action;
                let url = NODE_API_BASE + "/api/save";
                if (action === "uploadFile") {
                    url = NODE_API_BASE + "/api/upload";
                    if (window.SigapFirebaseDrive && typeof window.SigapFirebaseDrive.uploadPdfToGoogleDrive === "function") {
                        const gdriveResult = await window.SigapFirebaseDrive.uploadPdfToGoogleDrive(
                            payload.fileObj || payload.fileData,
                            {
                                schoolNo: payload.schoolNo,
                                schoolName: payload.schoolName,
                                npsn: payload.npsn,
                                month: payload.month,
                                periodKey: payload.month,
                                year: payload.year,
                                docType: payload.docType,
                                fileName: payload.fileName,
                                existingDriveFileId: payload.existingDriveFileId || ""
                            }
                        );
                        if (gdriveResult && gdriveResult.fileUrl) {
                            payload = Object.assign({}, payload, {
                                driveUrl: gdriveResult.fileUrl,
                                driveFileId: gdriveResult.driveFileId
                            });
                            delete payload.fileObj;
                        }
                    }
                } else if (action === "saveAll") {
                    url = NODE_API_BASE + "/api/save";
                }

                const resp = await fetch(url, {
                    method: "POST",
                    headers: nodeHeaders(),
                    body: JSON.stringify(payload),
                    credentials: "include",
                    cache: "no-store"
                });
                const text = await resp.text();
                let json;
                try { json = JSON.parse(text); } catch (e) {
                    throw new Error("Respons Node bukan JSON. Status " + resp.status + ". " + String(text).slice(0, 180));
                }
                if (resp.status === 401) {
                    throw new Error(json.message || "Belum login ke server Node. Silakan login ulang.");
                }
                if (!resp.ok && json.status !== "success") {
                    throw new Error(json.message || ("HTTP " + resp.status));
                }
                return json;
            }

            // ===== MODE GOOGLE APPS SCRIPT (lama) =====
            if (!isGasConfigured()) throw new Error("URL Google Apps Script belum dikonfigurasi.");
            if (payload && typeof payload === "object" && !payload.auth && currentUser) {
                payload.auth = { username: currentUser.username, password: currentUser.password };
            }
            const resp = await fetch(GAS_WEB_APP_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                redirect: "follow",
                cache: "no-store"
            });
            const text = await resp.text();
            let json;
            try { json = JSON.parse(text); } catch (e) {
                throw new Error("Respons server bukan JSON. Status HTTP " + resp.status + ". Cuplikan: " + String(text).slice(0, 180));
            }
            return json;
        }

        function fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });
        }

        document.addEventListener("DOMContentLoaded", async () => {
            if (PAGE === "beranda") { try { initPublicRankControls(); } catch (e) {} }
            // Halaman selain Beranda wajib punya sesi; tanpa sesi kembali ke Beranda (halaman login)
            if (PAGE !== "beranda" && !currentUser) { window.location.replace("/"); return; }
            await loadFromGoogleSheets();
            if (PAGE === "beranda") { try { renderPublicRank(); } catch (e) {} }
            repairUserData();
            if (cleanSimulatedLinks()) saveToLocalStorage();

            // Pesan keluar otomatis (idle) dari halaman lain
            try {
                const m = sessionStorage.getItem("rekon_logout_msg");
                if (m) { sessionStorage.removeItem("rekon_logout_msg"); setTimeout(() => alert(m), 300); }
            } catch (e) {}

            const lp = document.getElementById("landingPage");
            const appBox = document.getElementById("mainAppContainer");
            if (currentUser) {
                if (lp) lp.classList.add("hidden");
                appBox.classList.remove("hidden");
                if (typeof initSidebarState === "function") initSidebarState();
                if (typeof renderSidebarMenu === "function") renderSidebarMenu();
                initAppDashboard();
                startIdleWatch();
            } else {
                if (lp) lp.classList.remove("hidden");
                appBox.classList.add("hidden");
            }
        });

        function togglePasswordVisibility(inputId, iconId) {
            const input = document.getElementById(inputId);
            const icon = document.getElementById(iconId);
            if (input.type === "password") {
                input.type = "text";
                icon.className = "fa-solid fa-eye-slash";
            } else {
                input.type = "password";
                icon.className = "fa-solid fa-eye";
            }
        }

        function checkAuthSession() {
            if (!currentUser) return;
            const badgeText = document.getElementById("sessionNameText");
            const adminContainer = document.getElementById("adminPanelContainer");
            const operatorContainer = document.getElementById("operatorPanelContainer");
            const adminVerificationControls = document.getElementById("adminVerificationControls");
            const changePassBtn = document.getElementById("adminChangePasswordBtn");
            const detailCetakSP2BBtn = document.getElementById("detailCetakSP2BBtn");
            const cardTotalSekolahWrapper = document.getElementById("cardTotalSekolahWrapper");
            const kpiCardsContainer = document.getElementById("kpiCardsContainer");
            const filterSectionContainer = document.getElementById("filterSectionContainer");
            const chartsSectionContainer = document.getElementById("chartsSectionContainer");
            const navDashboardBtn = document.getElementById("navDashboardBtn");
            const tableTitleText = document.getElementById("tableTitleText");

            badgeText.textContent = `${currentUser.name} (${currentUser.role})`;
            if (typeof rkOnSession === "function") rkOnSession();
            const yearBadge = document.getElementById("sessionYearText");
            if (yearBadge) yearBadge.textContent = "TA " + activeYear;
            const loginYearSel = document.getElementById("loginYearSelect");
            if (loginYearSel) loginYearSel.value = String(activeYear);

            if (currentUser.role === "Admin Dinas") {
                adminContainer.classList.remove("hidden");
                operatorContainer.classList.add("hidden");
                if(adminVerificationControls) adminVerificationControls.classList.remove("hidden");
                if(detailCetakSP2BBtn) detailCetakSP2BBtn.classList.remove("hidden");
                if(cardTotalSekolahWrapper) cardTotalSekolahWrapper.classList.remove("hidden");
                if(kpiCardsContainer) kpiCardsContainer.className = "kpi-grid";
                if(filterSectionContainer) filterSectionContainer.classList.remove("hidden");
                if(chartsSectionContainer) chartsSectionContainer.classList.remove("hidden");
                if(navDashboardBtn) navDashboardBtn.classList.remove("hidden");
                if(tableTitleText) tableTitleText.textContent = "Daftar Rekonsiliasi Satuan Pendidikan";
                
                if(currentUser.username === "admin") {
                    if(changePassBtn) changePassBtn.classList.remove("hidden");
                } else {
                    if(changePassBtn) changePassBtn.classList.add("hidden");
                }
            } else {
                adminContainer.classList.add("hidden");
                operatorContainer.classList.remove("hidden");
                if(adminVerificationControls) adminVerificationControls.classList.add("hidden");
                if(detailCetakSP2BBtn) detailCetakSP2BBtn.classList.add("hidden");
                if(changePassBtn) changePassBtn.classList.add("hidden");
                
                if(cardTotalSekolahWrapper) cardTotalSekolahWrapper.classList.add("hidden");
                if(kpiCardsContainer) kpiCardsContainer.className = "kpi-grid";
                if(filterSectionContainer) filterSectionContainer.classList.add("hidden");
                if(chartsSectionContainer) chartsSectionContainer.classList.add("hidden");
                if(navDashboardBtn) navDashboardBtn.classList.add("hidden");
                if(tableTitleText) tableTitleText.textContent = "Data Realisasi Rekonsiliasi Sekolah Anda";
            }
        }

        function openAuthModal(forceTab) {
            if (forceTab === "register") switchAuthTab("register");
            else switchAuthTab("login");
            document.getElementById("regNpsnInput").value = "";
            document.getElementById("npsnResultInfo").innerHTML = "Masukkan NPSN yang terdaftar di Data Master Sekolah.";
            document.getElementById("npsnResultInfo").className = "mt-1 text-[11px] text-slate-500 italic";
            const ySel = document.getElementById("loginYearSelect");
            if (ySel) ySel.value = String(activeYear);
            document.getElementById("authModal").classList.remove("hidden");
        }

        function closeAuthModal() {
            document.getElementById("authModal").classList.add("hidden");
        }

        function handleLogout(options) {
            const opts = options || {};
            const silent = !!opts.silent;
            const reason = opts.reason || "";
            if (!silent && !confirm("Apakah Anda yakin ingin keluar (logout) dari sesi ini?")) {
                return;
            }
            // Simpan data terakhir sebelum keluar
            try { waFlush(); } catch (e) { console.warn(e); }
            try { saveToLocalStorage(); } catch (e) { console.warn(e); }
            if (window.SigapFirebaseDrive && typeof window.SigapFirebaseDrive.signOutFirebase === "function") {
                try { window.SigapFirebaseDrive.signOutFirebase(); } catch (e) {}
            }
            stopIdleWatch();
            currentUser = null;
            try { localStorage.setItem("bosp_currentUser", JSON.stringify(null)); } catch (e) {}
            const mainApp = document.getElementById("mainAppContainer");
            if (mainApp) {
                mainApp.classList.add("hidden");
                mainApp.classList.remove("app-with-sidebar", "sidebar-collapsed", "sidebar-open-mobile");
            }
            const sb = document.getElementById("appSidebar");
            if (sb) sb.classList.add("collapsed");
            const tg = document.getElementById("sbToggleBtn");
            if (tg) tg.classList.remove("shifted");
            const lpOut = document.getElementById("landingPage");
            if (lpOut) lpOut.classList.remove("hidden");
            else {
                // Halaman Realisasi Belanja: kembali ke Beranda (halaman login)
                try { if (silent && reason) sessionStorage.setItem("rekon_logout_msg", reason); } catch (e) {}
                window.location.replace("/");
                return;
            }
            // Tutup modal yang mungkin masih terbuka
            ["authModal", "inputModal", "detailModal", "sp2bModal", "masterModal", "userListModal",
             "waLogModal", "changePasswordModal", "kecamatanModal", "sp2bAnnualModal", "schoolDashboardModal", "sp2bKabModal",
             "profileModal", "rekapSekolahModal"
            ].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add("hidden");
            });
            if (silent && reason) {
                alert(reason);
            }
        }

        // ========== Auto Logout setelah 10 menit tidak aktif ==========
        const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit
        const IDLE_CHECK_EVERY_MS = 30 * 1000;  // cek tiap 30 detik
        let idleLastActivity = Date.now();
        let idleTimerId = null;
        let idleWatching = false;

        function markUserActivity() {
            idleLastActivity = Date.now();
        }

        function stopIdleWatch() {
            idleWatching = false;
            if (idleTimerId) {
                clearInterval(idleTimerId);
                idleTimerId = null;
            }
        }

        function startIdleWatch() {
            if (idleWatching) {
                markUserActivity();
                return;
            }
            idleWatching = true;
            markUserActivity();
            const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click", "input", "change"];
            events.forEach(ev => {
                // once registered globally; markUserActivity is cheap
                document.addEventListener(ev, markUserActivity, { passive: true, capture: true });
            });
            window.addEventListener("focus", markUserActivity);
            idleTimerId = setInterval(async () => {
                if (!currentUser) {
                    stopIdleWatch();
                    return;
                }
                const idleFor = Date.now() - idleLastActivity;
                if (idleFor >= IDLE_TIMEOUT_MS) {
                    try {
                        // Simpan data terakhir ke localStorage + Google Sheets
                        await saveToLocalStorage();
                    } catch (e) {
                        console.warn("Gagal menyimpan data saat auto-logout:", e);
                    }
                    handleLogout({
                        silent: true,
                        reason: "Sesi berakhir karena tidak ada aktivitas selama 10 menit.\nData terakhir Anda telah disimpan."
                    });
                }
            }, IDLE_CHECK_EVERY_MS);
        }

        function toggleAdminMenu() {
            const dropdown = document.getElementById("adminDropdown");
            dropdown.classList.toggle("hidden");
        }

        function closeAdminMenu() {
            document.getElementById("adminDropdown").classList.add("hidden");
        }

        /* ===== LEFT SIDEBAR + SP2B editable rekening + reset password ===== */
        const SP2B_REK_DEFAULTS = [
            { kode: "5.2.1.06.01", uraian: "Belanja Pegawai", key: "pegawai" },
            { kode: "5.2.2.22.01", uraian: "Belanja Barang dan Jasa", key: "barjas" },
            { kode: "5.2.3.37.13", uraian: "Belanja Modal Peralatan Mesin", key: "pm" },
            { kode: "5.2.3.82.01", uraian: "Belanja Modal Aset Tetap Lainnya", key: "atl" }
        ];
        function loadSp2bRekeningConfig() {
            try {
                const raw = localStorage.getItem("bosp_sp2b_rekening");
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr) && arr.length) return arr;
                }
            } catch (e) {}
            return SP2B_REK_DEFAULTS.map(x => ({ ...x }));
        }
        function saveSp2bRekeningConfig(arr) {
            try { localStorage.setItem("bosp_sp2b_rekening", JSON.stringify(arr)); } catch (e) {}
        }
        function readEditableRekeningFromDom() {
            const rows = document.querySelectorAll("#sp2bTableRekening tr[data-rek]");
            const arr = [];
            rows.forEach(tr => {
                const kodeEl = tr.querySelector("[data-field=kode]");
                const uraianEl = tr.querySelector("[data-field=uraian]");
                arr.push({
                    kode: (kodeEl && kodeEl.textContent.trim()) || "",
                    uraian: (uraianEl && uraianEl.textContent.trim()) || "",
                    key: tr.getAttribute("data-rek") || ""
                });
            });
            if (arr.length) saveSp2bRekeningConfig(arr);
            return arr;
        }

        function toggleSidebar() {
            const root = document.getElementById("mainAppContainer");
            if (!root) return;
            const isMobile = window.matchMedia("(max-width: 900px)").matches;
            if (isMobile) {
                root.classList.toggle("sidebar-open-mobile");
                const sb = document.getElementById("appSidebar");
                if (sb) sb.classList.toggle("collapsed", !root.classList.contains("sidebar-open-mobile"));
            } else {
                root.classList.toggle("sidebar-collapsed");
                const sb = document.getElementById("appSidebar");
                if (sb) sb.classList.toggle("collapsed", root.classList.contains("sidebar-collapsed"));
                const btn = document.getElementById("sbToggleBtn");
                if (btn) btn.classList.toggle("shifted", !root.classList.contains("sidebar-collapsed"));
            }
            try {
                localStorage.setItem("bosp_sidebar_collapsed", root.classList.contains("sidebar-collapsed") ? "1" : "0");
            } catch (e) {}
        }
        function closeSidebarMobile() {
            const root = document.getElementById("mainAppContainer");
            if (!root) return;
            root.classList.remove("sidebar-open-mobile");
            const sb = document.getElementById("appSidebar");
            if (sb && window.matchMedia("(max-width: 900px)").matches) sb.classList.add("collapsed");
        }
        function initSidebarState() {
            const root = document.getElementById("mainAppContainer");
            const sb = document.getElementById("appSidebar");
            const btn = document.getElementById("sbToggleBtn");
            if (!root || !sb) return;
            root.classList.add("app-with-sidebar");
            const isMobile = window.matchMedia("(max-width: 900px)").matches;
            let collapsed = false;
            try { collapsed = localStorage.getItem("bosp_sidebar_collapsed") === "1"; } catch (e) {}
            if (isMobile) {
                root.classList.remove("sidebar-collapsed");
                root.classList.remove("sidebar-open-mobile");
                sb.classList.add("collapsed");
                if (btn) btn.classList.remove("shifted");
            } else {
                root.classList.toggle("sidebar-collapsed", collapsed);
                sb.classList.toggle("collapsed", collapsed);
                if (btn) btn.classList.toggle("shifted", !collapsed);
            }
        }
        function renderSidebarMenu() {
            const box = document.getElementById("sbMenuScroll");
            if (!box) return;
            const role = currentUser ? currentUser.role : "";
            const name = currentUser ? (currentUser.name || currentUser.username) : "—";
            const nameEl = document.getElementById("sbUserName");
            const roleEl = document.getElementById("sbUserRole");
            if (nameEl) nameEl.textContent = name;
            if (roleEl) roleEl.textContent = role || "—";
            // Struktur menu didefinisikan di nav-menu.js (dipakai bersama semua halaman)
            box.innerHTML = RekonNav.html(role, PAGE);
        }

        /* ===== Aksi menu (modal) + perpindahan halaman ===== */
        const OPEN_ACTIONS = {
            master: () => openMasterModal(),
            users: () => openUserListModal(),
            password: () => openChangePasswordModal(),
            wa: () => openWaLogModal(),
            audit: () => openAuditLogModal(),
            backup: () => downloadBackup(),
            input: () => openInputModal(),
            dashboard: () => openSchoolDashboardModal(),
            profile: () => openProfileModal(),
            rekapSekolah: () => openRekapSekolahModal(),
            sp2bkab: () => openSP2BKabModal(),
            annual: () => openAnnualSP2BModal(),
            kecamatan: () => openKecamatanModal(),
            rank: () => openRankModal(),
            "export": () => exportCSV(),
            "switch": () => { if (typeof switchAccount === "function") switchAccount(); else handleLogout(); }
        };
        function openAction(key) {
            const fn = OPEN_ACTIONS[key];
            if (!fn) return;
            const home = RekonNav.HOME[key] || PAGE;     // aksi tanpa "rumah" khusus berjalan di halaman aktif
            if (home !== PAGE) { window.location.href = RekonNav.urlFor(key); return; }
            closeSidebarMobile();
            fn();
        }
        RekonNav.run = openAction;
        /** Jalankan aksi dari parameter ?open=… (setelah berpindah halaman lewat menu) */
        function runPendingOpen() {
            let key = null;
            try { key = new URLSearchParams(window.location.search).get("open"); } catch (e) {}
            if (!key) return;
            try { history.replaceState(null, "", window.location.pathname + window.location.hash); } catch (e) {}
            setTimeout(() => { const fn = OPEN_ACTIONS[key]; if (fn) fn(); }, 200);
        }

        function printSP2BDocument() {
            document.body.classList.remove("kb-printing");
            // simpan edit rekening sebelum cetak
            if (typeof readEditableRekeningFromDom === "function") readEditableRekeningFromDom();
            window.print();
        }

        async function resetUserPassword(username) {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak.");
                return;
            }
            const custom = prompt(
                'Reset password untuk akun "' + username + '".\\n\\n' +
                "Kosongkan untuk memakai password default:\\n" +
                "• admin → admin2024\\n• user lain → password123\\n\\n" +
                "Atau ketik password baru (min. 6 karakter):",
                ""
            );
            if (custom === null) return;
            const body = custom.trim() ? { password: custom.trim() } : {};
            try {
                const resp = await fetch(NODE_API_BASE + "/api/users/" + encodeURIComponent(username) + "/reset-password", {
                    method: "POST",
                    credentials: "include",
                    headers: typeof nodeHeaders === "function" ? nodeHeaders() : { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                const j = await resp.json();
                if (!resp.ok || j.status !== "success") {
                    alert(j.message || "Gagal reset password");
                    return;
                }
                alert("✅ " + j.message + "\\n\\nPassword sementara: " + j.temporaryPassword + "\\n\\nMinta user segera mengganti password setelah login.");
                if (typeof openUserListModal === "function") openUserListModal();
            } catch (e) {
                alert("Gagal menghubungi server: " + e.message);
            }
        }


        window.addEventListener("click", function(e) {
            if (!e.target.closest("button") && !e.target.closest("#adminDropdown")) {
                closeAdminMenu();
            }
        });

        function switchAuthTab(tab) {
            const loginBtn = document.getElementById("tabLoginBtn");
            const regBtn = document.getElementById("tabRegisterBtn");
            const formLogin = document.getElementById("formLogin");
            const formRegister = document.getElementById("formRegister");
            const title = document.getElementById("authTitle");
            if (tab === "register") {
                if (loginBtn) loginBtn.classList.remove("on");
                if (regBtn) regBtn.classList.add("on");
                if (formLogin) formLogin.classList.add("hidden");
                if (formRegister) formRegister.classList.remove("hidden");
                if (title) title.textContent = "Daftar Akun SIGAP-BOSP";
                // Muat master sekolah dari server agar cek NPSN akurat di laptop lain
                loadPublicSchoolsForRegister();
            } else {
                if (regBtn) regBtn.classList.remove("on");
                if (loginBtn) loginBtn.classList.add("on");
                if (formRegister) formRegister.classList.add("hidden");
                if (formLogin) formLogin.classList.remove("hidden");
                if (title) title.textContent = "Masuk SIGAP-BOSP";
            }
        }

        async function loadPublicSchoolsForRegister() {
            if (!(typeof isNodeBackend === "function" && isNodeBackend())) return;
            try {
                const r = await fetch(NODE_API_BASE + "/api/public/schools", { cache: "no-store" });
                const j = await r.json();
                if (r.ok && j.status === "success" && Array.isArray(j.schools) && j.schools.length) {
                    baseSchools = j.schools.map(function (s) {
                        return typeof normalizeSchool === "function" ? normalizeSchool(s) : s;
                    });
                    try { localStorage.setItem("bosp_baseSchools", JSON.stringify(baseSchools)); } catch (e) {}
                }
            } catch (e) {
                console.warn("Gagal muat schools publik:", e);
            }
        }

        function toggleRegRoleForm(role) {
            const npsnWrapper = document.getElementById("regNpsnWrapper");
            if (role === "Operator Sekolah") {
                npsnWrapper.classList.remove("hidden");
            } else {
                npsnWrapper.classList.add("hidden");
            }
        }

        function checkNpsnMaster(npsnVal) {
            const infoEl = document.getElementById("npsnResultInfo");
            const cleanNpsn = npsnVal.trim();

            if (!cleanNpsn) {
                infoEl.innerHTML = "Masukkan NPSN yang terdaftar di Data Master Sekolah.";
                infoEl.className = "mt-1 text-[11px] text-slate-500 italic";
                return null;
            }

            const foundSchool = baseSchools.find(s => String(s.npsn).trim() === cleanNpsn);
            if (foundSchool) {
                infoEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> <b class="text-emerald-800">Sekolah Ditemukan:</b> ${foundSchool.name} (Kec. ${foundSchool.kecamatan})`;
                infoEl.className = "mt-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 p-2 rounded border border-emerald-200";
                return foundSchool;
            } else {
                infoEl.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-600 mr-1"></i> <b class="text-rose-800">Peringatan:</b> Nomor NPSN "${cleanNpsn}" tidak ditemukan dalam Data Master Sekolah Dinas Pendidikan!`;
                infoEl.className = "mt-1 text-[11px] text-rose-700 font-semibold bg-rose-50 p-2 rounded border border-rose-200";
                return null;
            }
        }

        async function handleLogin() {
            const u = document.getElementById("loginUsername").value.trim();
            const p = document.getElementById("loginPassword").value.trim();
            const yearSel = document.getElementById("loginYearSelect");
            const selectedYear = yearSel ? parseInt(yearSel.value, 10) : activeYear;

            let found = null;

            // --- Login ke server Node (wajib agar upload ke uploads/ berhasil) ---
            if (isNodeBackend()) {
                try {
                    const resp = await fetch(NODE_API_BASE + "/api/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ username: u, password: p })
                    });
                    const data = await resp.json();
                    if (!resp.ok || data.status !== "success") {
                        alert(data.message || "Username atau kata sandi salah!");
                        return;
                    }
                    found = data.user;
                    // Simpan token untuk Authorization header
                    if (data.token) {
                        nodeAuthToken = data.token;
                        sessionStorage.setItem("rekon_node_token", data.token);
                    }
                    // Sinkronkan ke usersDB lokal (tanpa password hash)
                    const idx = usersDB.findIndex(x => x.username === found.username);
                    if (idx >= 0) usersDB[idx] = Object.assign({}, usersDB[idx], found, { password: p });
                    else usersDB.push(Object.assign({}, found, { password: p }));
                } catch (e) {
                    console.error(e);
                    alert("Gagal terhubung ke server Node: " + e.message + "\nPastikan npm start sudah berjalan.");
                    return;
                }
            } else {
                found = usersDB.find(x => x.username === u && x.password === p);
            }

            if (found) {
                if (found.status !== "Aktif") {
                    alert("Akun Anda masih berstatus 'Pending' dan menunggu verifikasi persetujuan dari Admin Dinas.");
                    return;
                }
                if (activeYear !== selectedYear) {
                    try { localStorage.setItem(yearKey("monthlyData"), JSON.stringify(monthlyData)); } catch (e) {}
                }
                activeYear = selectedYear;
                localStorage.setItem("bosp_activeYear", String(activeYear));

                currentUser = found;
                if (!currentUser.password) currentUser.password = p;

                // Muat data dari SERVER Node dulu (agar laptop admin melihat inputan sekolah)
                // Baru fallback ke localStorage jika server kosong/gagal
                monthlyData = JSON.parse(localStorage.getItem(yearKey("monthlyData"))) || {};
                if (isNodeBackend()) {
                    try {
                        await loadFromGoogleSheets(); // fungsi ini sudah diarahkan ke /api/data saat mode Node
                    } catch (e) {
                        console.warn("Gagal muat data server setelah login:", e);
                    }
                }
                if (Object.keys(monthlyData).length === 0) {
                    baseSchools.forEach(s => {
                        monthlyData[s.no] = {};
                        months.forEach(m => {
                            monthlyData[s.no][m] = {
                                saldoAwalCustom: m === "Jan" ? 0 : null,
                                saldoReguler: m === "Jan" ? 0 : null,
                                saldoKinerja: m === "Jan" ? 0 : null,
                                saldoNonBOS: m === "Jan" ? 0 : null,
                                saldoTunai: m === "Jan" ? 0 : null,
                                pendapatan: { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 },
                                belanja: { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 },
                                rekon: { setoranSaldoTunai: 0, pengembalianBank: 0, setoranPajak2023: 0, saldoRCBank: 0 },
                                documents: {},
                                verifStatus: "Draft"
                            };
                        });
                    });
                }

                // Jangan panggil saveToLocalStorage penuh di sini (bisa menimpa data server dengan data lokal kosong)
                try {
                    localStorage.setItem("bosp_currentUser", JSON.stringify(currentUser));
                    localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB));
                    localStorage.setItem("bosp_activeYear", String(activeYear));
                    localStorage.setItem(yearKey("monthlyData"), JSON.stringify(monthlyData));
                } catch (e) {}

                closeAuthModal();
                const lpIn = document.getElementById("landingPage");
                if (lpIn) lpIn.classList.add("hidden");
                document.getElementById("mainAppContainer").classList.remove("hidden");
                if (typeof initSidebarState === "function") initSidebarState();
                if (typeof renderSidebarMenu === "function") renderSidebarMenu();
                initAppDashboard();
                startIdleWatch();
                alert("Selamat datang kembali, " + found.name + "!\nTahun Anggaran aktif: " + activeYear + (isNodeBackend() ? "\n(Data dimuat dari server bersama)" : ""));
            } else {
                alert("Username atau kata sandi salah, atau akun belum terdaftar!");
            }
        }

        async function handleRegister() {
            const role = document.getElementById("regRole").value;
            const u = document.getElementById("regUsername").value.trim();
            const p = document.getElementById("regPassword").value.trim();
            const waVal = waNormalize(document.getElementById("regWhatsapp").value);

            if (!u || !p) {
                alert("Mohon lengkapi Username dan Password!");
                return;
            }
            if (p.length < 6) {
                alert("Password minimal 6 karakter.");
                return;
            }
            if (!waVal) {
                alert("Nomor WhatsApp wajib diisi dengan benar (nomor HP Indonesia), misalnya 081234567890.");
                return;
            }

            let npsnVal = "";
            if (role === "Operator Sekolah") {
                npsnVal = document.getElementById("regNpsnInput").value.trim();
                if (!npsnVal) {
                    alert("NPSN wajib diisi.");
                    return;
                }
            }

            // Mode Node: daftar ke server (terlihat admin di laptop lain)
            if (typeof isNodeBackend === "function" && isNodeBackend()) {
                try {
                    const resp = await fetch(NODE_API_BASE + "/api/register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            username: u,
                            password: p,
                            role: role,
                            whatsapp: waVal,
                            npsn: npsnVal
                        })
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || data.status !== "success") {
                        alert(data.message || "Pendaftaran gagal.");
                        return;
                    }
                    // sinkron ke memori lokal (tanpa password plain di server response)
                    if (data.user) {
                        const exists = usersDB.findIndex(x => x.username === data.user.username);
                        const localU = Object.assign({}, data.user, { password: p });
                        if (exists >= 0) usersDB[exists] = localU;
                        else usersDB.push(localU);
                        try { localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB)); } catch (e) {}
                    }
                    closeAuthModal();
                    switchAuthTab("login");
                    alert("Pendaftaran berhasil dikirim ke server!\nStatus: Pending — tunggu persetujuan Admin Dinas sebelum bisa login.");
                } catch (e) {
                    alert("Gagal terhubung ke server: " + e.message + "\nPastikan npm start berjalan dan Anda membuka IP server yang sama.");
                }
                return;
            }

            // Mode offline / GAS: simpan lokal
            if (usersDB.some(x => x.username === u)) {
                alert("Username sudah digunakan akun lain. Silakan buat username yang berbeda.");
                return;
            }
            let name = "";
            let schoolNo = null;
            if (role === "Operator Sekolah") {
                const matchedSchool = checkNpsnMaster(npsnVal);
                if (!matchedSchool) {
                    alert("Pendaftaran Gagal! NPSN sekolah tidak valid atau tidak ditemukan di Data Master Sekolah.");
                    return;
                }
                const existingSchoolAccount = usersDB.find(x => x.role === "Operator Sekolah" && String(x.npsn) === String(npsnVal));
                if (existingSchoolAccount) {
                    alert("Satuan pendidikan dengan NPSN ini sudah memiliki akun operator terdaftar!");
                    return;
                }
                name = `Operator ${matchedSchool.name}`;
                schoolNo = matchedSchool.no;
            } else {
                name = `Admin Dinas (${u})`;
            }
            usersDB.push({
                name, username: u, password: p, role, schoolNo, npsn: npsnVal, whatsapp: waVal, status: "Pending"
            });
            saveToLocalStorage();
            closeAuthModal();
            alert("Pendaftaran akun berhasil dikirim! Status Pending — menunggu Admin Dinas.");
        }

        function openChangePasswordModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Hanya akun Admin Dinas yang dapat mengubah password ini.");
                return;
            }
            document.getElementById("oldPasswordInput").value = "";
            document.getElementById("newPasswordInput").value = "";
            document.getElementById("confirmPasswordInput").value = "";
            document.getElementById("changePasswordModal").classList.remove("hidden");
        }

        function closeChangePasswordModal() {
            document.getElementById("changePasswordModal").classList.add("hidden");
        }

        async function saveNewAdminPassword() {
            const oldPass = document.getElementById("oldPasswordInput").value;
            const newPass = document.getElementById("newPasswordInput").value;
            const confirmPass = document.getElementById("confirmPasswordInput").value;

            if (!oldPass || !newPass || !confirmPass) {
                alert("Mohon lengkapi semua kolom password!");
                return;
            }
            if (newPass.length < 6) {
                alert("Password baru minimal 6 karakter!");
                return;
            }
            if (newPass !== confirmPass) {
                alert("Konfirmasi password baru tidak cocok!");
                return;
            }
            // Password disimpan ter-hash di server, jadi verifikasi password lama dilakukan di server
            try {
                const resp = await fetch(NODE_API_BASE + "/api/change-password", {
                    method: "POST",
                    credentials: "include",
                    headers: nodeHeaders(),
                    body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
                });
                const j = await resp.json();
                if (!resp.ok || j.status !== "success") {
                    alert(j.message || "Gagal mengubah password.");
                    return;
                }
                closeChangePasswordModal();
                alert("Password berhasil diubah!");
            } catch (e) {
                alert("Gagal menghubungi server: " + e.message);
            }
        }

        async function openUserListModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Fitur daftar user khusus untuk Administrator Dinas.");
                return;
            }
            document.getElementById("searchUserBox").value = "";
            // Muat daftar user terbaru dari server (termasuk yang daftar dari laptop lain)
            if (typeof isNodeBackend === "function" && isNodeBackend()) {
                try {
                    const resp = await fetch(NODE_API_BASE + "/api/users", {
                        credentials: "include",
                        headers: typeof nodeHeaders === "function" ? nodeHeaders() : { "Content-Type": "application/json" },
                        cache: "no-store"
                    });
                    const data = await resp.json();
                    if (resp.ok && data.status === "success" && Array.isArray(data.users)) {
                        // gabungkan: data server utama, password lokal dipertahankan jika ada
                        const localMap = new Map(usersDB.map(u => [String(u.username).toLowerCase(), u]));
                        usersDB = data.users.map(u => {
                            const loc = localMap.get(String(u.username).toLowerCase()) || {};
                            return Object.assign({}, u, { password: loc.password || u.password || "" });
                        });
                        try { localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB)); } catch (e) {}
                    }
                } catch (e) {
                    console.warn("Gagal muat users dari server:", e);
                }
            }
            renderUserTable();
            document.getElementById("userListModal").classList.remove("hidden");
            const pending = usersDB.filter(u => u.status === "Pending").length;
            if (pending > 0) {
                try { if (typeof rkToast === "function") rkToast(pending + " akun menunggu persetujuan", "info"); } catch (e) {}
            }
        }

        function closeUserListModal() {
            document.getElementById("userListModal").classList.add("hidden");
        }

        function renderUserTable() {
            const tbody = document.getElementById("userTableBody");
            tbody.innerHTML = "";

            const keyword = document.getElementById("searchUserBox") ? document.getElementById("searchUserBox").value.toLowerCase() : "";

            const filteredUsers = usersDB.filter(u => {
                let instansiText = "";
                if (u.role === "Operator Sekolah") {
                    const foundSch = findSchoolForUser(u);
                    instansiText = foundSch ? `${foundSch.name} ${foundSch.npsn} ${foundSch.kecamatan}` : `${u.npsn || ''}`;
                } else {
                    instansiText = "administrator dinas pendidikan kabupaten";
                }

                const searchTarget = `${u.username} ${u.role} ${instansiText} ${u.whatsapp || ''}`.toLowerCase();
                return searchTarget.includes(keyword);
            });

            document.getElementById("userCountBadge").textContent = filteredUsers.length;

            if (filteredUsers.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400">Tidak ada akun user yang ditemukan dengan kata kunci tersebut.</td></tr>`;
                return;
            }

            filteredUsers.forEach((u, idx) => {
                let instansiColumn = "-";
                if (u.role === "Operator Sekolah") {
                    const foundSch = findSchoolForUser(u);
                    if (foundSch) {
                        instansiColumn = `<b>${foundSch.name}</b><br><span class="text-slate-500 font-mono">NPSN: ${foundSch.npsn} | Kec. ${foundSch.kecamatan}</span>`;
                    } else {
                        instansiColumn = `<span class="text-rose-600">NPSN: ${u.npsn || '-'} (Master Tidak Ditemukan)</span>`;
                    }
                } else {
                    instansiColumn = `<span class="font-semibold text-amber-800">Admin Dinas Pendidikan</span>`;
                }

                let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Aktif</span>`;
                let actionButtons = '';

                if (u.status === "Pending") {
                    statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Pending</span>`;
                    if (currentUser.username === "admin") {
                        actionButtons += `<button onclick="verifyUserAccount('${u.username}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[10px] mr-1" title="Setujui Akun"><i class="fa-solid fa-check"></i> Setujui</button>`;
                    }
                }

                // Reset password tersedia untuk semua user termasuk admin
                actionButtons += ` <button onclick="resetUserPassword('${u.username}')" class="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded text-[10px]" title="Reset Password"><i class="fa-solid fa-key"></i> Reset</button>`;
                if (u.username !== 'admin') {
                    actionButtons += ` <button onclick="deleteUser('${u.username}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded text-[10px]" title="Hapus User"><i class="fa-solid fa-trash"></i></button>`;
                }

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="py-2.5 px-3">${idx + 1}</td>
                    <td class="py-2.5 px-3 font-mono font-bold">${u.username}</td>
                    <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.role === 'Admin Dinas' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">${u.role}</span></td>
                    <td class="py-2.5 px-3">${instansiColumn}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">${waCellHtml(u)}</td>
                    <td class="py-2.5 px-3 text-center">${statusBadge}</td>
                    <td class="py-2.5 px-3 text-center">${actionButtons}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        async function verifyUserAccount(username) {
            if (currentUser.username !== "admin") {
                alert("Hanya Admin Utama yang dapat menyetujui akun baru.");
                return;
            }
            const targetUser = usersDB.find(u => u.username === username);
            if (!targetUser) return;
            targetUser.status = "Aktif";
            if (typeof isNodeBackend === "function" && isNodeBackend()) {
                try {
                    const resp = await fetch(NODE_API_BASE + "/api/users", {
                        method: "POST",
                        credentials: "include",
                        headers: typeof nodeHeaders === "function" ? nodeHeaders() : { "Content-Type": "application/json" },
                        body: JSON.stringify({ users: [targetUser] })
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || data.status !== "success") {
                        targetUser.status = "Pending";
                        alert(data.message || "Gagal menyimpan persetujuan ke server.");
                        return;
                    }
                } catch (e) {
                    targetUser.status = "Pending";
                    alert("Gagal hubungi server: " + e.message);
                    return;
                }
            }
            try { localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB)); } catch (e) {}
            saveToLocalStorage();
            renderUserTable();
            try { waNotifyAccountApproved(targetUser); } catch (e) {}
            alert("Akun (" + targetUser.username + ") berhasil disetujui & diaktifkan!");
        }

        async function deleteUser(username) {
            if (String(username).toLowerCase() === "admin") {
                alert("Akun admin utama tidak boleh dihapus.");
                return;
            }
            if (!confirm("Hapus akun \"" + username + "\" dari sistem?\nData akun akan dihapus permanen dari database server.")) return;
            const removed = usersDB.find(u => u.username === username);
            if (typeof isNodeBackend === "function" && isNodeBackend()) {
                try {
                    const resp = await fetch(NODE_API_BASE + "/api/users/" + encodeURIComponent(username), {
                        method: "DELETE",
                        credentials: "include",
                        headers: typeof nodeHeaders === "function" ? nodeHeaders() : { "Content-Type": "application/json" }
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || data.status !== "success") {
                        alert(data.message || "Gagal menghapus user di database server.");
                        return;
                    }
                    // sinkron daftar dari server
                    if (Array.isArray(data.users)) {
                        const localMap = new Map(usersDB.map(u => [String(u.username).toLowerCase(), u]));
                        usersDB = data.users.map(u => {
                            const loc = localMap.get(String(u.username).toLowerCase()) || {};
                            return Object.assign({}, u, { password: loc.password || "" });
                        });
                    } else {
                        usersDB = usersDB.filter(u => u.username !== username);
                    }
                } catch (e) {
                    alert("Gagal hubungi server: " + e.message);
                    return;
                }
            } else {
                usersDB = usersDB.filter(u => u.username !== username);
            }
            try { localStorage.setItem("bosp_usersDB", JSON.stringify(usersDB)); } catch (e) {}
            renderUserTable();
            alert("Akun \"" + username + "\" berhasil dihapus dari database.");
        }

        // =====================================================================
        // NOTIFIKASI WHATSAPP KE USER — progres yang dilakukan Admin Dinas
        // =====================================================================
        const WA_QUEUE_DELAY = 5000; // perubahan beruntun digabung jadi 1 pesan per sekolah & periode
        let waQueue = {};
        let waTimer = null;
        let waOutbox = [];
        try { waOutbox = JSON.parse(localStorage.getItem("bosp_waOutbox") || "[]") || []; } catch (e) { waOutbox = []; }
        waOutbox.forEach(e => { if (e && e.status === "Mengirim") e.status = "Menunggu"; });
        let waAutoSend = localStorage.getItem("bosp_waAuto") !== "0";

        // Normalisasi nomor HP Indonesia ke format 62xxxxxxxxxx. Mengembalikan "" jika tidak valid.
        function waNormalize(raw) {
            let d = String(raw == null ? "" : raw).replace(/\D/g, "");
            if (d.startsWith("00")) d = d.slice(2);
            if (d.startsWith("0")) d = "62" + d.slice(1);
            else if (d.startsWith("8")) d = "62" + d;
            return /^628\d{8,12}$/.test(d) ? d : "";
        }

        function waDisplay(raw) {
            const n = waNormalize(raw);
            return n ? "0" + n.slice(2) : String(raw || "");
        }

        function waCellHtml(u) {
            const n = waNormalize(u.whatsapp);
            const num = n
                ? `<span class="font-mono">${escHtml(waDisplay(n))}</span>`
                : `<span class="text-rose-600 italic">Belum diisi</span>`;
            return num + ` <button onclick="editUserWhatsapp('${escHtml(u.username)}')" class="text-blue-600 hover:text-blue-800 ml-1" title="Ubah nomor WhatsApp"><i class="fa-solid fa-pen"></i></button>`;
        }

        function editUserWhatsapp(username) {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Hanya Admin Dinas yang dapat mengubah nomor WhatsApp user."); return; }
            const u = usersDB.find(x => x.username === username);
            if (!u) return;
            const input = prompt(`Nomor WhatsApp untuk akun "${u.username}":\n(contoh: 081234567890)`, u.whatsapp ? waDisplay(u.whatsapp) : "");
            if (input === null) return;
            const n = waNormalize(input);
            if (!n) { alert("Nomor tidak valid. Gunakan nomor HP Indonesia, misalnya 081234567890."); return; }
            u.whatsapp = n;
            if (currentUser.username === u.username) currentUser.whatsapp = n;
            saveToLocalStorage();
            renderUserTable();
        }

        function waAuthNow() {
            return currentUser ? { username: currentUser.username, password: currentUser.password } : null;
        }

        function waSaveOutbox() {
            if (waOutbox.length > 100) waOutbox.length = 100;
            try { localStorage.setItem("bosp_waOutbox", JSON.stringify(waOutbox)); } catch (e) {}
        }

        function waRecipientsForSchool(no) {
            return usersDB.filter(u => {
                if (u.role !== "Operator Sekolah" || u.status !== "Aktif" || !waNormalize(u.whatsapp)) return false;
                const sch = findSchoolForUser(u);
                return !!sch && Number(sch.no) === Number(no);
            });
        }

        function waToast(html, actionLabel, actionFn) {
            let box = document.getElementById("waToastBox");
            if (!box) {
                box = document.createElement("div");
                box.id = "waToastBox";
                box.className = "no-print fixed right-4 z-[70] flex flex-col gap-2 items-end";
                box.style.bottom = "calc(16px + env(safe-area-inset-bottom, 0px))";
                box.style.maxWidth = "calc(100vw - 32px)";
                document.body.appendChild(box);
            }
            const t = document.createElement("div");
            t.className = "bg-slate-900 text-white text-xs rounded-xl shadow-xl px-3.5 py-2.5 flex items-center gap-3";
            t.innerHTML = `<i class="fa-brands fa-whatsapp text-emerald-400 text-base"></i><span>${html}</span>`;
            if (actionLabel) {
                const b = document.createElement("button");
                b.className = "bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg whitespace-nowrap";
                b.textContent = actionLabel;
                b.onclick = () => { actionFn(); t.remove(); };
                t.appendChild(b);
            }
            box.appendChild(t);
            setTimeout(() => t.remove(), actionLabel ? 15000 : 5000);
        }

        function waCreateEntry(user, schoolName, message) {
            const e = {
                id: "wa_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                at: new Date().toISOString(),
                to: user.name || user.username || "",
                school: schoolName || "",
                phone: waNormalize(user.whatsapp),
                message: message,
                status: "Menunggu",
                error: ""
            };
            waOutbox.unshift(e);
            waSaveOutbox();
            return e;
        }

        // Kirim lewat server (action "sendWA" di Code.gs). Jika belum tersedia, pesan tetap "Menunggu" untuk dikirim manual.
        async function waDeliver(entry, auth) {
            if (waAutoSend && isGasConfigured()) {
                entry.status = "Mengirim";
                waSaveOutbox(); waRenderLog();
                try {
                    const payload = { action: "sendWA", target: entry.phone, message: entry.message };
                    if (auth) payload.auth = auth;
                    const r = await gasPost(payload);
                    if (r && r.status === "success") { entry.status = "Terkirim"; entry.error = ""; }
                    else { entry.status = "Menunggu"; entry.error = (r && r.message) || "Server belum mendukung pengiriman WhatsApp."; }
                } catch (err) {
                    entry.status = "Menunggu";
                    entry.error = String((err && err.message) || err);
                }
            } else {
                entry.status = "Menunggu";
                entry.error = "";
            }
            waSaveOutbox(); waRenderLog();
            const who = `<b>${escHtml(entry.school || entry.to)}</b>`;
            if (entry.status === "Terkirim") waToast(`Notifikasi WhatsApp terkirim ke ${who}.`);
            else waToast(`Notifikasi WhatsApp untuk ${who} siap dikirim.`, "Kirim", () => waOpenManual(entry.id));
        }

        function waOpenManual(id) {
            const e = waOutbox.find(x => x.id === id);
            if (!e || !e.phone) return;
            window.open("https://wa.me/" + e.phone + "?text=" + encodeURIComponent(e.message), "_blank", "noopener");
            if (e.status !== "Terkirim") e.status = "Dibuka manual";
            waSaveOutbox(); waRenderLog();
        }

        function waResend(id) {
            const e = waOutbox.find(x => x.id === id);
            if (e) waDeliver(e, waAuthNow());
        }

        // ---------- Antrean progres per sekolah ----------
        function waEnqueue(schoolNo, itemKey, build) {
            if (!currentUser || currentUser.role !== "Admin Dinas") return;
            const period = periodLabel();
            const gk = schoolNo + "|" + activeYear + "|" + period;
            const g = waQueue[gk] || (waQueue[gk] = { schoolNo: schoolNo, year: activeYear, period: period, items: {}, auth: waAuthNow() });
            g.items[itemKey] = build;
            clearTimeout(waTimer);
            waTimer = setTimeout(() => waFlush(), WA_QUEUE_DELAY);
        }

        // Baris dokumen dibaca dari kondisi TERKINI saat antrean dikirim (centang, perlu perbaikan, catatan)
        function waQueueDoc(schoolNo, docKey) {
            const m = refMonth();
            waEnqueue(schoolNo, "doc:" + docKey, () => {
                const d = monthlyData[schoolNo] && monthlyData[schoolNo][m] && monthlyData[schoolNo][m].documents && monthlyData[schoolNo][m].documents[docKey];
                if (!d) return null;
                const item = DOC_LABELS.find(x => x.key === docKey);
                const label = item ? item.label.replace(/^\d+\.\s*/, "") : docKey;
                if (d.needsFix) return `⚠️ ${label}: *perlu perbaikan*` + (d.note ? ` — "${d.note}"` : "");
                if (d.checked) return `✅ ${label}: sesuai (diverifikasi)`;
                return null;
            });
        }

        function waBuildMessage(schoolName, g, lines) {
            return [
                "*SIGAP-BOSP Kab. Minahasa Tenggara*",
                "",
                `Yth. Operator ${schoolName},`,
                `Berikut pembaruan progres rekonsiliasi dana BOSP Anda (TA ${g.year} · ${g.period}):`,
                "",
                ...lines.map(l => "• " + l),
                "",
                "Silakan buka aplikasi SIGAP-BOSP untuk melihat detailnya.",
                "_Pesan otomatis dari Admin Dinas Pendidikan._"
            ].join("\n");
        }

        function waFlush(deferOnly) {
            clearTimeout(waTimer); waTimer = null;
            const groups = Object.values(waQueue);
            waQueue = {};
            groups.forEach(g => {
                const lines = Object.values(g.items).map(fn => { try { return fn(); } catch (e) { return null; } }).filter(Boolean);
                if (!lines.length) return;
                const sch = baseSchools.find(x => Number(x.no) === Number(g.schoolNo));
                const schoolName = sch ? sch.name : "Sekolah";
                const recips = waRecipientsForSchool(g.schoolNo);
                if (!recips.length) {
                    if (!deferOnly) waToast(`Operator <b>${escHtml(schoolName)}</b> belum mengisi nomor WhatsApp, notifikasi tidak dikirim.`);
                    return;
                }
                recips.forEach(u => {
                    const entry = waCreateEntry(u, schoolName, waBuildMessage(schoolName, g, lines));
                    if (!deferOnly) waDeliver(entry, g.auth);
                });
            });
        }

        // Persetujuan akun: langsung dikirim ke pemilik akun
        function waNotifyAccountApproved(user) {
            const phone = waNormalize(user.whatsapp);
            if (!phone) {
                waToast(`Akun <b>${escHtml(user.username)}</b> disetujui, tetapi belum ada nomor WhatsApp. Isi lewat ikon pensil di Daftar User.`);
                return;
            }
            const message = [
                "*SIGAP-BOSP Kab. Minahasa Tenggara*",
                "",
                `Yth. ${user.name || user.username},`,
                `Akun Anda (username: ${user.username}) telah *disetujui* oleh Admin Dinas Pendidikan dan sudah dapat digunakan untuk masuk ke sistem.`,
                "",
                "_Pesan otomatis dari Admin Dinas Pendidikan._"
            ].join("\n");
            const sch = findSchoolForUser(user);
            const entry = waCreateEntry(user, sch ? sch.name : (user.name || user.username), message);
            waDeliver(entry, waAuthNow());
        }

        // ---------- Modal riwayat ----------
        function openWaLogModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Fitur ini khusus untuk Administrator Dinas."); return; }
            document.getElementById("waAutoToggle").checked = waAutoSend;
            waRenderLog();
            document.getElementById("waLogModal").classList.remove("hidden");
        }

        function closeWaLogModal() {
            document.getElementById("waLogModal").classList.add("hidden");
        }

        /** Audit Log viewer (Admin) */
        async function openAuditLogModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Fitur ini khusus untuk Administrator Dinas.");
                return;
            }
            let modal = document.getElementById("auditLogModal");
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "auditLogModal";
                modal.className = "fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 hidden";
                modal.innerHTML = `
                  <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                    <div class="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
                      <h3 class="font-bold text-slate-800 text-lg"><i class="fa-solid fa-clock-rotate-left mr-2 text-indigo-600"></i>Audit Log Aktivitas</h3>
                      <button onclick="document.getElementById('auditLogModal').classList.add('hidden')" class="text-slate-500 hover:text-rose-600 text-xl leading-none">&times;</button>
                    </div>
                    <div class="px-5 py-2 flex flex-wrap gap-2 items-center border-b bg-white">
                      <input id="auditFilter" type="text" placeholder="Filter aksi (login, save, verif...)" class="border rounded px-3 py-1.5 text-sm flex-1 min-w-[180px]" />
                      <button onclick="loadAuditLog()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm"><i class="fa-solid fa-rotate"></i> Muat Ulang</button>
                      <span id="auditTotal" class="text-xs text-slate-500 ml-auto"></span>
                    </div>
                    <div class="overflow-auto flex-1 p-0">
                      <table class="w-full text-sm text-left">
                        <thead class="bg-slate-100 sticky top-0 text-xs uppercase text-slate-600">
                          <tr>
                            <th class="px-3 py-2">Waktu</th>
                            <th class="px-3 py-2">Aksi</th>
                            <th class="px-3 py-2">User</th>
                            <th class="px-3 py-2">Role</th>
                            <th class="px-3 py-2">IP</th>
                            <th class="px-3 py-2">Detail</th>
                          </tr>
                        </thead>
                        <tbody id="auditLogBody" class="divide-y"></tbody>
                      </table>
                    </div>
                  </div>`;
                document.body.appendChild(modal);
                document.getElementById("auditFilter").addEventListener("keydown", (e) => {
                    if (e.key === "Enter") loadAuditLog();
                });
            }
            modal.classList.remove("hidden");
            loadAuditLog();
        }

        async function loadAuditLog() {
            const tb = document.getElementById("auditLogBody");
            const totalEl = document.getElementById("auditTotal");
            if (!tb) return;
            tb.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">Memuat...</td></tr>`;
            try {
                const filter = (document.getElementById("auditFilter")?.value || "").trim();
                const q = new URLSearchParams({ limit: "150" });
                if (filter) q.set("action", filter);
                const resp = await fetch(NODE_API_BASE + "/api/audit?" + q.toString(), {
                    credentials: "include",
                    headers: typeof nodeHeaders === "function" ? nodeHeaders() : {}
                });
                const j = await resp.json();
                if (!resp.ok || j.status !== "success") {
                    tb.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-rose-600">${escHtml(j.message || "Gagal memuat audit log")}</td></tr>`;
                    return;
                }
                if (totalEl) totalEl.textContent = "Menampilkan " + j.items.length + " dari ~" + j.total + " entri";
                if (!j.items.length) {
                    tb.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">Tidak ada data.</td></tr>`;
                    return;
                }
                tb.innerHTML = j.items.map((e) => {
                    const t = e.time ? new Date(e.time).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";
                    const detail = Object.keys(e).filter(k => !["time","action","username","role","ip"].includes(k))
                        .map(k => k + "=" + JSON.stringify(e[k])).join(", ");
                    return `<tr class="hover:bg-slate-50">
                      <td class="px-3 py-1.5 whitespace-nowrap text-slate-600 text-xs">${escHtml(t)}</td>
                      <td class="px-3 py-1.5 font-mono text-xs font-semibold text-indigo-700">${escHtml(e.action || "")}</td>
                      <td class="px-3 py-1.5">${escHtml(e.username || "-")}</td>
                      <td class="px-3 py-1.5 text-xs text-slate-500">${escHtml(e.role || "-")}</td>
                      <td class="px-3 py-1.5 font-mono text-xs text-slate-500">${escHtml(e.ip || "-")}</td>
                      <td class="px-3 py-1.5 text-xs text-slate-600 max-w-xs truncate" title="${escHtml(detail)}">${escHtml(detail || "—")}</td>
                    </tr>`;
                }).join("");
            } catch (err) {
                tb.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-rose-600">Error: ${escHtml(err.message)}</td></tr>`;
            }
        }

        /** Download backup data (Admin) */
        async function downloadBackup() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Fitur ini khusus untuk Administrator Dinas.");
                return;
            }
            if (!confirm("Unduh backup seluruh data JSON (schools, users, monthly, anggaran, audit)?\n\nSimpan file di tempat aman.")) return;
            try {
                const resp = await fetch(NODE_API_BASE + "/api/backup", {
                    credentials: "include",
                    headers: typeof nodeHeaders === "function" ? nodeHeaders() : {}
                });
                if (!resp.ok) {
                    const j = await resp.json().catch(() => ({}));
                    alert(j.message || "Gagal mengunduh backup");
                    return;
                }
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "rekon-bosp-backup-" + new Date().toISOString().slice(0, 10) + ".json";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                alert("✅ Backup berhasil diunduh. Simpan file ini di lokasi aman.");
            } catch (err) {
                alert("Gagal menghubungi server: " + err.message);
            }
        }

        function waToggleAuto(on) {
            waAutoSend = !!on;
            try { localStorage.setItem("bosp_waAuto", on ? "1" : "0"); } catch (e) {}
        }

        function waClearLog() {
            if (!confirm("Hapus seluruh riwayat notifikasi WhatsApp di perangkat ini?")) return;
            waOutbox = [];
            waSaveOutbox();
            waRenderLog();
        }

        function waRenderLog() {
            const tb = document.getElementById("waLogBody");
            if (!tb) return;
            if (!waOutbox.length) {
                tb.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">Belum ada notifikasi. Pesan dibuat otomatis saat Anda memproses progres sekolah.</td></tr>`;
                return;
            }
            const badge = {
                "Terkirim": "bg-emerald-100 text-emerald-800",
                "Menunggu": "bg-amber-100 text-amber-800",
                "Mengirim": "bg-blue-100 text-blue-800",
                "Dibuka manual": "bg-blue-100 text-blue-800"
            };
            tb.innerHTML = waOutbox.map(e => {
                const t = new Date(e.at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
                const canResend = e.status !== "Terkirim" && e.status !== "Mengirim" && waAutoSend && isGasConfigured();
                return `<tr>
                    <td class="py-2 px-3 whitespace-nowrap text-slate-600">${escHtml(t)}</td>
                    <td class="py-2 px-3"><b>${escHtml(e.school || e.to)}</b><br><span class="font-mono text-slate-500">${escHtml(waDisplay(e.phone))}</span></td>
                    <td class="py-2 px-3 text-slate-600" style="max-width:280px"><div class="line-clamp-3 whitespace-pre-line" title="${escHtml(e.message)}">${escHtml(e.message.split("\n").slice(2, -2).filter(Boolean).join("\n"))}</div></td>
                    <td class="py-2 px-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${badge[e.status] || "bg-slate-100 text-slate-700"}" title="${escHtml(e.error || "")}">${escHtml(e.status)}</span></td>
                    <td class="py-2 px-3 text-center whitespace-nowrap">
                        <button onclick="waOpenManual('${e.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[10px]" title="Buka WhatsApp dengan pesan terisi"><i class="fa-brands fa-whatsapp"></i> Buka WA</button>
                        ${canResend ? `<button onclick="waResend('${e.id}')" class="bg-slate-600 hover:bg-slate-700 text-white px-2 py-1 rounded text-[10px] ml-1" title="Kirim ulang lewat server">Kirim ulang</button>` : ""}
                    </td>
                </tr>`;
            }).join("");
        }

        // Jangan kehilangan progres yang masih mengantre saat halaman ditutup: simpan ke riwayat sebagai "Menunggu"
        window.addEventListener("pagehide", () => { try { waFlush(true); } catch (e) {} });

        function openMasterModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Fitur ini khusus untuk Administrator Dinas Pendidikan.");
                return;
            }
            renderMasterSchoolTable();
            document.getElementById("masterModal").classList.remove("hidden");
        }

        function closeMasterModal() {
            document.getElementById("masterModal").classList.add("hidden");
            populateInputModalOptions();
            populateKecamatanFilter();
            updateActiveMonthData();
        }

        function renderMasterSchoolTable() {
            const tbody = document.getElementById("masterSchoolTableBody");
            tbody.innerHTML = "";
            document.getElementById("masterSchoolCount").textContent = baseSchools.length;
            baseSchools.forEach((s, idx) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="py-2 px-3">${idx + 1}</td>
                    <td class="py-2 px-3 font-mono">${s.npsn || '-'}</td>
                    <td class="py-2 px-3 font-semibold">${s.name}</td>
                    <td class="py-2 px-3">${s.alamat || '-'}</td>
                    <td class="py-2 px-3 text-center">${s.status || 'NEGERI'}</td>
                    <td class="py-2 px-3">${s.kecamatan}</td>
                    <td class="py-2 px-3 text-center whitespace-nowrap">
                        <button onclick="openProfileModal(${s.no})" class="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-[10px] mr-1" title="Identitas Kepala Sekolah & Bendahara BOSP"><i class="fa-solid fa-user-tie"></i></button>
                        <button onclick="deleteSchool(${s.no})" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded text-[10px]" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function addNewSchool() {
            const npsn = document.getElementById("newSchoolNpsn").value.trim();
            const name = document.getElementById("newSchoolName").value.trim();
            const alamat = document.getElementById("newSchoolAlamat").value.trim();
            const status = document.getElementById("newSchoolStatus").value;
            const kecamatan = document.getElementById("newSchoolKec").value.trim().toUpperCase();

            if (!name || !kecamatan) {
                alert("Nama Sekolah dan Kecamatan wajib diisi!");
                return;
            }

            const newNo = baseSchools.length > 0 ? Math.max(...baseSchools.map(s => s.no)) + 1 : 1;
            const jenjang = name.includes("SMP") ? "SMP" : "SD";
            const newSchoolObj = { no: newNo, npsn: npsn || ("69" + Math.floor(100000 + Math.random() * 900000)), name: name.toUpperCase(), alamat: alamat || kecamatan, status, kecamatan, jenjang };
            baseSchools.push(newSchoolObj);

            monthlyData[newNo] = {};
            months.forEach(m => {
                monthlyData[newNo][m] = {
                    saldoAwalCustom: m === "Jan" ? 0 : null,
                    saldoReguler: m === "Jan" ? 0 : null,
                    saldoKinerja: m === "Jan" ? 0 : null,
                    saldoNonBOS: m === "Jan" ? 0 : null,
                    pendapatan: { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 },
                    belanja: { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 },
                    documents: {
                        rekeningKoran: { url: "", checked: false },
                        bku: { url: "", checked: false },
                        rekapanBelanja: { url: "", checked: false },
                        lra: { url: "", checked: false },
                        bukuPajak: { url: "", checked: false },
                        sptjm: { url: "", checked: false }
                    },
                    verifStatus: "Draft"
                };
            });

            saveToLocalStorage();
            document.getElementById("newSchoolNpsn").value = '';
            document.getElementById("newSchoolName").value = '';
            document.getElementById("newSchoolAlamat").value = '';
            document.getElementById("newSchoolKec").value = '';
            renderMasterSchoolTable();
            alert("Satuan pendidikan baru berhasil ditambahkan & disinkronkan!");
        }

        function deleteSchool(no) {
            if (confirm("Apakah Anda yakin ingin menghapus satuan pendidikan ini?")) {
                baseSchools = baseSchools.filter(s => s.no !== no);
                delete monthlyData[no];
                saveToLocalStorage();
                renderMasterSchoolTable();
                alert("Satuan pendidikan berhasil dihapus.");
            }
        }

        function exportMasterExcel() {
            const exportData = baseSchools.map((s, idx) => ({
                "No": idx + 1,
                "NPSN": s.npsn || "",
                "Nama Sekolah": s.name || "",
                "Alamat": s.alamat || "",
                "Status": s.status || "NEGERI",
                "Kecamatan": s.kecamatan || "",
                "Kota/Kabupaten": "Kab. Minahasa Tenggara",
                "Provinsi": "Prov. Sulawesi Utara"
            }));

            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Sekolah");
            XLSX.writeFile(workbook, "Data_Master_Satuan_Pendidikan_MinahasaTenggara.xlsx");
        }

        function handleImportMasterFile(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet);

                    if (json.length === 0) {
                        alert("File kosong atau format tidak sesuai!");
                        return;
                    }

                    let newBaseSchools = [];
                    json.forEach((row, idx) => {
                        const name = row["Nama Sekolah"] || row["nama sekolah"] || row["NAMA SEKOLAH"] || row["Nama"] || `Sekolah ${idx+1}`;
                        const npsn = String(row["NPSN"] || row["npsn"] || row["Npsn"] || (69000000 + idx));
                        const alamat = row["Alamat"] || row["alamat"] || "";
                        let status = (row["Status"] || row["status"] || "NEGERI").toUpperCase();
                        if (status.includes("NEGERI")) status = "NEGERI";
                        else status = "SWASTA";
                        const kecamatan = (row["Kecamatan"] || row["kecamatan"] || "RATAHAN").toUpperCase();
                        let jenjang = name.toUpperCase().includes("SMP") ? "SMP" : "SD";

                        newBaseSchools.push({
                            no: idx + 1,
                            npsn,
                            name: name.toUpperCase(),
                            alamat,
                            status,
                            kecamatan,
                            jenjang
                        });
                    });

                    baseSchools = newBaseSchools;
                    monthlyData = {};
                    baseSchools.forEach(s => {
                        monthlyData[s.no] = {};
                        months.forEach(m => {
                            monthlyData[s.no][m] = {
                                saldoAwalCustom: m === "Jan" ? 0 : null,
                                saldoReguler: m === "Jan" ? 0 : null,
                                saldoKinerja: m === "Jan" ? 0 : null,
                                saldoNonBOS: m === "Jan" ? 0 : null,
                                pendapatan: { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 },
                                belanja: { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 },
                                documents: {
                                    rekeningKoran: { url: "", checked: false },
                                    bku: { url: "", checked: false },
                                    rekapanBelanja: { url: "", checked: false },
                                    lra: { url: "", checked: false },
                                    bukuPajak: { url: "", checked: false },
                                    sptjm: { url: "", checked: false }
                                },
                                verifStatus: "Draft"
                            };
                        });
                    });

                    saveToLocalStorage();
                    renderMasterSchoolTable();
                    populateKecamatanFilter();
                    populateInputModalOptions();
                    updateActiveMonthData();
                    alert(`Berhasil mengimpor ${baseSchools.length} satuan pendidikan & disinkronkan!`);
                } catch (err) {
                    console.error(err);
                    alert("Gagal membaca file Excel/CSV. Pastikan format kolom sesuai.");
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // Helper untuk memetakan bulan ke triwulan
        function getTriwulanMonths(tw) {
            if (tw === "TW1") return ["Jan", "Feb", "Mar"];
            if (tw === "TW2") return ["Apr", "Mei", "Jun"];
            if (tw === "TW3") return ["Jul", "Agus", "Sep"];
            if (tw === "TW4") return ["Okt", "Nov", "Des"];
            return ["Jan", "Feb", "Mar"];
        }

        function getSemesterMonths(sm) {
            return sm === "S2" ? ["Jul", "Agus", "Sep", "Okt", "Nov", "Des"] : ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"];
        }

        // Daftar bulan pada periode laporan yang sedang aktif di dashboard
        function getPeriodMonths() {
            if (periodType === "bulan") return [currentMonth];
            if (periodType === "triwulan") return getTriwulanMonths(currentTriwulan);
            if (periodType === "semester") return getSemesterMonths(currentSemester);
            return months.slice();
        }

        // Bulan acuan periode (bulan terakhir) untuk status verifikasi, ceklist rekonsiliasi & dokumen
        function refMonth() {
            const l = getPeriodMonths();
            return l[l.length - 1];
        }

        function periodLabel(kumulatif) {
            if (periodType === "bulan") return monthNames[months.indexOf(currentMonth)];
            if (periodType === "triwulan") return currentTriwulan;
            if (periodType === "semester") return currentSemester === "S2" ? "Semester II" : "Semester I";
            return `Tahun ${activeYear}` + (kumulatif ? " (Kumulatif)" : "");
        }

        function periodCode() {
            if (periodType === "bulan") return currentMonth;
            if (periodType === "triwulan") return currentTriwulan;
            if (periodType === "semester") return currentSemester;
            return "TAHUN";
        }

        // ---------- KUNCI INPUT SETELAH DIVERIFIKASI DINAS ----------
        const LOCKED_STATUSES = ["Diverifikasi Dinas", "Disahkan BUD"];
        function isMonthLocked(no, m) {
            const d = monthlyData[no] && monthlyData[no][m];
            return !!(d && LOCKED_STATUSES.indexOf(d.verifStatus) !== -1);
        }

        // =====================================================================
        // KERTAS KERJA REKONSILIASI (kolom SA_BANK BOSREG s.d. SALDO RC BANK)
        // Rumus mengikuti Kertas_Kerja_Rekon (lembar Jun-Okt, kolom SA_TUNAI disertakan).
        // =====================================================================
        function hitungRekon(i) {
            const n = v => { const x = Number(v); return isFinite(x) ? x : 0; };
            const o = {};
            o.saReg = n(i.saReg); o.saKin = n(i.saKin); o.saBukan = n(i.saBukan); o.saTunai = n(i.saTunai);
            const reguler = n(i.reguler), kinerja = n(i.kinerja), jasaGiro = n(i.jasaGiro);
            const setoranTunai = n(i.setoranTunai), lebihTransfer = n(i.lebihTransfer);
            const pegawai = n(i.pegawai), barjas = n(i.barjas), barjasKin = n(i.barjasKin);
            const pm = n(i.pm), pmKin = n(i.pmKin), atl = n(i.atl), atlKin = n(i.atlKin);
            const lebihKeluar = n(i.lebihTransferKeluar);
            const setoranSaldoTunai = n(i.setoranSaldoTunai), pengembalianBank = n(i.pengembalianBank), setoranPajak = n(i.setoranPajak);

            o.totalSaldoAwal = o.saReg + o.saKin + o.saBukan + o.saTunai;                 // I
            o.totalPendapatan = reguler + kinerja;                                          // L
            o.totalPenerimaan = o.totalPendapatan + jasaGiro + setoranTunai + lebihTransfer; // P
            o.totalBelanja = pegawai + barjas + barjasKin + pm + pmKin + atl + atlKin;      // X
            // SETOR JAGIR: default = JASA GIRO (NEGERI). Untuk SWASTA boleh diisi manual via i.setorJagir.
            o.setorJagir = (i.setorJagir !== undefined && i.setorJagir !== null && i.setorJagir !== "") ? n(i.setorJagir) : jasaGiro; // Y
            o.totalPengeluaran = o.totalBelanja + o.setorJagir + lebihKeluar;               // AA
            o.totalSaldoBOS = o.totalSaldoAwal + o.totalPenerimaan - o.totalPengeluaran - setoranSaldoTunai - pengembalianBank - setoranPajak; // AE
            o.saldoBOSTunai = o.saTunai - setoranTunai + lebihKeluar;                       // AJ
            o.saldoBankBukanBOS = o.saBukan;                                                // AI
            o.saldoBankReguler = o.saReg + o.saTunai + reguler - pegawai - barjas - pm - atl - o.saldoBOSTunai; // AG
            o.saldoBankKinerja = o.saKin + kinerja - barjasKin - pmKin - atlKin;            // AH
            o.saldoBOSBank = o.totalSaldoBOS - o.saldoBankBukanBOS - o.saldoBOSTunai;       // AF
            o.saldoKasBOS = o.saldoBOSBank + o.saldoBOSTunai;                               // AK
            o.saldoSP2B = o.saReg + o.saKin + o.saTunai + o.totalPendapatan - o.totalBelanja; // AL
            o.saldoRC = n(i.saldoRC);                                                       // AN
            o.selisih = o.saldoSP2B - o.saldoRC;                                            // AM
            return o;
        }

        function rekonInputFromMonth(d, sa) {
            const p = d.pendapatan || {}, b = d.belanja || {}, r = d.rekon || {};
            return {
                saReg: sa.reg, saKin: sa.kin, saBukan: sa.bukan, saTunai: sa.tunai,
                reguler: p.reguler, kinerja: p.kinerja, jasaGiro: p.jagirMasuk, setoranTunai: p.setoranTunai, lebihTransfer: p.lebihTransferMasuk,
                pegawai: b.pegawai, barjas: b.barjasReg, barjasKin: b.barjasKin, pm: b.pm, pmKin: b.pmKin, atl: b.atl, atlKin: b.atlKin,
                lebihTransferKeluar: b.lebihTransferKeluar,
                // Jika sudah tersimpan (khusus SWASTA), pakai nilai manual; jika tidak, hitungRekon akan fallback ke JASA GIRO
                setorJagir: (b.jagirKeluar !== undefined && b.jagirKeluar !== null) ? b.jagirKeluar : undefined,
                setoranSaldoTunai: r.setoranSaldoTunai, pengembalianBank: r.pengembalianBank, setoranPajak: r.setoranPajak2023, saldoRC: r.saldoRCBank
            };
        }

        function computeRolledData() {
            const processed = {};
            const emptyMonth = () => ({ pendapatan: {}, belanja: {}, documents: {}, verifStatus: "Draft" });
            baseSchools.forEach(s => {
                processed[s.no] = {};
                let prev = null;
                months.forEach(m => {
                    const d = (monthlyData[s.no] && monthlyData[s.no][m]) || emptyMonth();
                    let sa;
                    if (m === "Jan") {
                        sa = {
                            reg: (d.saldoReguler !== undefined && d.saldoReguler !== null) ? Number(d.saldoReguler) : ((d.saldoAwalCustom !== undefined && d.saldoAwalCustom !== null) ? d.saldoAwalCustom / 3 : 0),
                            kin: Number(d.saldoKinerja) || 0,
                            bukan: Number(d.saldoNonBOS) || 0,
                            tunai: Number(d.saldoTunai) || 0
                        };
                    } else if (d.saManual) {
                        sa = { reg: Number(d.saManual.reg) || 0, kin: Number(d.saManual.kin) || 0, bukan: Number(d.saManual.bukan) || 0, tunai: Number(d.saManual.tunai) || 0 };
                    } else if (prev) {
                        // Saldo awal = saldo bank/tunai akhir bulan sebelumnya (sama dengan kolom F-I kertas kerja)
                        sa = { reg: prev.saldoBankReguler, kin: prev.saldoBankKinerja, bukan: prev.saldoBankBukanBOS, tunai: prev.saldoBOSTunai };
                    } else {
                        sa = { reg: 0, kin: 0, bukan: 0, tunai: 0 };
                    }
                    const r = hitungRekon(rekonInputFromMonth(d, sa));
                    prev = r;

                    processed[s.no][m] = {
                        saldoAwal: r.totalSaldoAwal,
                        saldoReguler: r.saReg,
                        saldoKinerja: r.saKin,
                        saldoNonBOS: r.saBukan,
                        saldoTunai: r.saTunai,
                        pendapatanDetail: d.pendapatan || {},
                        belanjaDetail: Object.assign({}, d.belanja || {}, { jagirKeluar: r.setorJagir }),
                        totalPendapatan: r.totalPenerimaan,     // (nama lama) = TOTAL PENERIMAAN
                        totalBelanja: r.totalPengeluaran,       // (nama lama) = TOTAL PENGELUARAN
                        pendapatanBOS: r.totalPendapatan,       // TOTAL PENDAPATAN (reguler + kinerja)
                        belanjaMurni: r.totalBelanja,           // TOTAL BELANJA
                        kasSeharusnya: r.saldoKasBOS,           // SALDO KAS BOS SEHARUSNYA
                        saldoSP2B: r.saldoSP2B,
                        saldoRCBank: r.saldoRC,
                        selisih: r.selisih,
                        rekon: r,
                        saManualAktif: !!d.saManual,
                        documents: d.documents || {},
                        verifStatus: d.verifStatus || "Draft",
                        reconDone: !!d.reconDone
                    };
                });
            });
            return processed;
        }

        let filteredData = [];
        let currentPage = 1;
        const rowsPerPage = 10;
        let activeModalSchool = null;
        let barChartInstance = null;
        let pieChartInstance = null;

        function formatRupiah(number) {
            return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number);
        }

        function updateYearLabels() {
            document.querySelectorAll(".active-year-label").forEach(el => { el.textContent = activeYear; });
            const yearBadge = document.getElementById("sessionYearText");
            if (yearBadge) yearBadge.textContent = "TA " + activeYear;
        }

        function initAppDashboard() {
            restorePeriodState();   // tahun anggaran bisa berubah saat login
            checkAuthSession();
            updateYearLabels();
            const ptSel = document.getElementById("periodTypeSelect");
            if (ptSel) ptSel.value = periodType;
            renderPeriodSelector();
            populateKecamatanFilter();
            populateInputModalOptions();

            // Tombol input realisasi (halaman Realisasi Belanja) menyesuaikan peran
            const btnIn = document.getElementById("btnInputRealisasi");
            if (btnIn && currentUser) {
                btnIn.classList.toggle("hidden", currentUser.role === "BUD");
                const lb = btnIn.querySelector("span");
                if (lb) lb.textContent = currentUser.role === "Operator Sekolah" ? "Input / Ajukan Realisasi" : "Input Realisasi Rinci";
            }

            updateActiveMonthData();

            if (PAGE === "realisasi") {
                const searchEl = document.getElementById("searchSchool");
                if (searchEl) {
                    searchEl.removeEventListener("input", filterData);
                    searchEl.addEventListener("input", filterData);
                }
                ["filterKecamatan", "filterStatus", "filterJenjang"].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.removeEventListener("change", filterData);
                        el.addEventListener("change", filterData);
                    }
                });
            } else {
                renderBerandaArkas();
            }
            runPendingOpen();
        }

        function changePeriodType(type) {
            periodType = type;
            renderPeriodSelector();
            updateActiveMonthData();
        }

        function renderPeriodSelector() {
            const container = document.getElementById("periodSelectorContainer");
            container.innerHTML = "";

            if (periodType === "bulan") {
                months.forEach((m, idx) => {
                    const btn = document.createElement("button");
                    btn.className = `chip ${currentMonth === m ? 'chip-on' : ''}`;
                    btn.textContent = monthNames[idx];
                    btn.onclick = () => {
                        currentMonth = m;
                        renderPeriodSelector();
                        updateActiveMonthData();
                    };
                    container.appendChild(btn);
                });
                { const _kl = document.getElementById("kpiMonthLabel"); if (_kl) _kl.textContent = `Realisasi Bulan ${monthNames[months.indexOf(currentMonth)]} ${activeYear}`; }
            } else if (periodType === "triwulan") {
                const tws = [
                    { id: "TW1", name: "Triwulan I (Jan - Mar)" },
                    { id: "TW2", name: "Triwulan II (Apr - Jun)" },
                    { id: "TW3", name: "Triwulan III (Jul - Sep)" },
                    { id: "TW4", name: "Triwulan IV (Okt - Des)" }
                ];
                tws.forEach(tw => {
                    const btn = document.createElement("button");
                    btn.className = `chip ${currentTriwulan === tw.id ? 'chip-on' : ''}`;
                    btn.textContent = tw.name;
                    btn.onclick = () => {
                        currentTriwulan = tw.id;
                        renderPeriodSelector();
                        updateActiveMonthData();
                    };
                    container.appendChild(btn);
                });
                { const _kl = document.getElementById("kpiMonthLabel"); if (_kl) _kl.textContent = `Realisasi ${currentTriwulan} ${activeYear}`; }
            } else if (periodType === "semester") {
                const sms = [
                    { id: "S1", name: "Semester I (Jan - Jun)" },
                    { id: "S2", name: "Semester II (Jul - Des)" }
                ];
                sms.forEach(sm => {
                    const btn = document.createElement("button");
                    btn.className = `chip ${currentSemester === sm.id ? 'chip-on' : ''}`;
                    btn.textContent = sm.name;
                    btn.onclick = () => {
                        currentSemester = sm.id;
                        renderPeriodSelector();
                        updateActiveMonthData();
                    };
                    container.appendChild(btn);
                });
                { const _kl = document.getElementById("kpiMonthLabel"); if (_kl) _kl.textContent = `Realisasi ${currentSemester === "S2" ? "Semester II" : "Semester I"} ${activeYear}`; }
            } else {
                const badge = document.createElement("span");
                badge.className = "chip chip-static";
                badge.textContent = `Kumulatif 1 Tahun Penuh (Januari s.d. Desember ${activeYear})`;
                container.appendChild(badge);
                { const _kl = document.getElementById("kpiMonthLabel"); if (_kl) _kl.textContent = `Realisasi Tahunan ${activeYear}`; }
            }
            if (typeof rkCenterActiveChip === "function") rkCenterActiveChip();
            savePeriodState();
        }

        function updateActiveMonthData() {
            const rolled = computeRolledData();
            let rawSchools = baseSchools;

            if (currentUser && currentUser.role === "Operator Sekolah") {
                const matchedSchool = findSchoolForUser(currentUser);
                if (matchedSchool) {
                    rawSchools = [matchedSchool];
                }
            }

            filteredData = rawSchools.map(s => {
                let sa = 0, totPend = 0, totBel = 0, kasAkhir = 0;
                let pendDet = { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 };
                let belDet = { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 };
                let docs = {};
                let status = "Draft";
                let rekon = false;

                if (periodType === "bulan") {
                    const mData = rolled[s.no] && rolled[s.no][currentMonth] ? rolled[s.no][currentMonth] : null;
                    if (mData) {
                        sa = mData.saldoAwal;
                        totPend = mData.totalPendapatan;
                        totBel = mData.totalBelanja;
                        kasAkhir = mData.kasSeharusnya;
                        pendDet = mData.pendapatanDetail;
                        belDet = mData.belanjaDetail;
                        docs = mData.documents;
                        status = mData.verifStatus;
                        rekon = mData.reconDone;
                    }
                } else if (periodType === "triwulan" || periodType === "semester") {
                    const mList = getPeriodMonths();
                    const firstM = mList[0];
                    const lastM = mList[mList.length - 1];
                    
                    if (rolled[s.no] && rolled[s.no][firstM]) {
                        sa = rolled[s.no][firstM].saldoAwal;
                    }
                    mList.forEach(m => {
                        const md = rolled[s.no] && rolled[s.no][m] ? rolled[s.no][m] : null;
                        if (md) {
                            totPend += md.totalPendapatan;
                            totBel += md.totalBelanja;
                            Object.keys(pendDet).forEach(k => pendDet[k] += (md.pendapatanDetail[k] || 0));
                            Object.keys(belDet).forEach(k => belDet[k] += (md.belanjaDetail[k] || 0));
                            if (m === lastM) {
                                kasAkhir = md.kasSeharusnya;
                                docs = md.documents;
                                status = md.verifStatus;
                                rekon = md.reconDone;
                            }
                        }
                    });
                } else {
                    // Tahun
                    if (rolled[s.no] && rolled[s.no]["Jan"]) {
                        sa = rolled[s.no]["Jan"].saldoAwal;
                    }
                    months.forEach(m => {
                        const md = rolled[s.no] && rolled[s.no][m] ? rolled[s.no][m] : null;
                        if (md) {
                            totPend += md.totalPendapatan;
                            totBel += md.totalBelanja;
                            Object.keys(pendDet).forEach(k => pendDet[k] += (md.pendapatanDetail[k] || 0));
                            Object.keys(belDet).forEach(k => belDet[k] += (md.belanjaDetail[k] || 0));
                            if (m === "Des") {
                                kasAkhir = md.kasSeharusnya;
                                docs = md.documents;
                                status = md.verifStatus;
                                rekon = md.reconDone;
                            }
                        }
                    });
                }

                return {
                    ...s,
                    saldoAwal: sa,
                    totalPendapatan: totPend,
                    totalBelanja: totBel,
                    kasSeharusnya: kasAkhir,
                    pendapatanDetail: pendDet,
                    belanjaDetail: belDet,
                    documents: docs,
                    verifStatus: status,
                    reconDone: rekon
                };
            });
            filterData();
        }

        function populateKecamatanFilter() {
            const kecamatanSet = [...new Set(baseSchools.map(s => s.kecamatan))].sort();
            const select = document.getElementById("filterKecamatan");
            const selectTarget = document.getElementById("selectKecamatanTarget");
            if (select) select.innerHTML = '<option value="">Semua Kecamatan</option>';
            if(selectTarget) selectTarget.innerHTML = '';
            kecamatanSet.forEach(kec => {
                const opt = document.createElement("option");
                opt.value = kec;
                opt.textContent = kec;
                if (select) select.appendChild(opt);

                if(selectTarget) {
                    const opt2 = document.createElement("option");
                    opt2.value = kec;
                    opt2.textContent = `Kecamatan ${kec}`;
                    selectTarget.appendChild(opt2);
                }
            });
        }

        function populateInputModalOptions() {
            const schoolSelect = document.getElementById("inputSchoolSelect");
            schoolSelect.innerHTML = "";

            if (currentUser && currentUser.role === "Operator Sekolah") {
                const assignedSchool = findSchoolForUser(currentUser);
                if (assignedSchool) {
                    const opt = document.createElement("option");
                    opt.value = assignedSchool.no;
                    opt.textContent = `${assignedSchool.name} (${assignedSchool.kecamatan}) - (Sekolah Anda)`;
                    schoolSelect.appendChild(opt);
                    schoolSelect.disabled = true;
                }
            } else {
                schoolSelect.disabled = false;
                baseSchools.forEach(s => {
                    const opt = document.createElement("option");
                    opt.value = s.no;
                    opt.textContent = `${s.name} (${s.kecamatan})`;
                    schoolSelect.appendChild(opt);
                });
            }

            const monthSelect = document.getElementById("inputMonthSelect");
            monthSelect.innerHTML = "";
            months.forEach((m, idx) => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = monthNames[idx];
                monthSelect.appendChild(opt);
            });

            schoolSelect.removeEventListener("change", loadSchoolMonthIntoForm);
            monthSelect.removeEventListener("change", loadSchoolMonthIntoForm);
            schoolSelect.addEventListener("change", loadSchoolMonthIntoForm);
            monthSelect.addEventListener("change", loadSchoolMonthIntoForm);
            loadSchoolMonthIntoForm();
        }

        function setDocStatusLabel(elId, d) {
            const el = document.getElementById(elId);
            if (!el) return;
            d = d || {};
            if (d.needsFix) {
                el.className = "text-[10px] text-rose-700 font-semibold";
                el.textContent = "⚠ Perlu perbaikan" + (d.note ? ": " + d.note : "") + (d.url ? " — unggah ulang file yang sudah diperbaiki" : "");
            } else {
                el.className = "text-[10px] text-slate-500";
                el.textContent = d.url ? "Sudah diunggah (Tersimpan di Drive)" : "Belum diunggah";
            }
        }

        function loadSchoolMonthIntoForm() {
            const schoolNo = document.getElementById("inputSchoolSelect").value;
            const month = document.getElementById("inputMonthSelect").value;
            const rolled = computeRolledData();
            const d = (monthlyData[schoolNo] && monthlyData[schoolNo][month]) || {};
            const rm = rolled[schoolNo] && rolled[schoolNo][month];
            const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v === undefined || v === null || v === 0 || v === "") ? "" : v; };
            const p = d.pendapatan || {}, b = d.belanja || {}, rk = d.rekon || {};

            // Isian bulan ini (dikosongkan dulu agar tidak terbawa dari sekolah/bulan sebelumnya)
            setV("inReguler", p.reguler); setV("inKinerja", p.kinerja); setV("inJagirMasuk", p.jagirMasuk);
            setV("inSetoranTunai", p.setoranTunai); setV("inLebihTransferMasuk", p.lebihTransferMasuk);
            setV("outPegawai", b.pegawai); setV("outBarjasReg", b.barjasReg); setV("outBarjasKin", b.barjasKin);
            setV("outPM", b.pm); setV("outPMKin", b.pmKin); setV("outATL", b.atl); setV("outATLKin", b.atlKin);
            setV("outLebihTransferKeluar", b.lebihTransferKeluar);
            // SETOR JAGIR: SWASTA pakai nilai tersimpan (manual); NEGERI mengikuti JASA GIRO
            const swastaLoad = isSwastaSchool(schoolNo);
            if (swastaLoad) {
                setV("outJagirKeluar", (b.jagirKeluar !== undefined && b.jagirKeluar !== null) ? b.jagirKeluar : p.jagirMasuk);
            } else {
                setV("outJagirKeluar", p.jagirMasuk);
            }
            setJagirKeluarEditable(swastaLoad);
            setV("inSetoranSaldoTunai", rk.setoranSaldoTunai); setV("inPengembalianBank", rk.pengembalianBank);
            setV("inSetoranPajak", rk.setoranPajak2023); setV("inSaldoRCBank", rk.saldoRCBank);

            // Saldo awal
            const wrap = document.getElementById("saManualWrap");
            const chk = document.getElementById("inSAManual");
            const info = document.getElementById("infoSaldoAwal");
            if (month === "Jan") {
                wrap.classList.add("hidden");
                chk.checked = false;
                const reg = (d.saldoReguler !== undefined && d.saldoReguler !== null) ? d.saldoReguler : (d.saldoAwalCustom || 0);
                setV("inSaldoReguler", reg); setV("inSaldoKinerja", d.saldoKinerja); setV("inSaldoNonBOS", d.saldoNonBOS); setV("inSaldoTunai", d.saldoTunai);
                info.textContent = "Bulan Januari: input saldo awal secara manual (sesuai saldo akhir tahun sebelumnya).";
                setSaldoAwalEditable(true);
            } else {
                wrap.classList.remove("hidden");
                chk.checked = !!d.saManual;
                const src = d.saManual ? { reg: d.saManual.reg, kin: d.saManual.kin, bukan: d.saManual.bukan, tunai: d.saManual.tunai }
                                       : { reg: rm ? rm.saldoReguler : 0, kin: rm ? rm.saldoKinerja : 0, bukan: rm ? rm.saldoNonBOS : 0, tunai: rm ? rm.saldoTunai : 0 };
                setV("inSaldoReguler", Math.round(src.reg || 0)); setV("inSaldoKinerja", Math.round(src.kin || 0));
                setV("inSaldoNonBOS", Math.round(src.bukan || 0)); setV("inSaldoTunai", Math.round(src.tunai || 0));
                const prevName = monthNames[months.indexOf(month) - 1];
                info.textContent = d.saManual
                    ? "Saldo awal dikoreksi manual (tidak mengikuti bulan sebelumnya)."
                    : `Bulan ${monthNames[months.indexOf(month)]}: otomatis dari saldo akhir bulan ${prevName} (SALDO BANK REGULER, KINERJA, BUKAN BOS, dan SALDO BOS TUNAI).`;
                setSaldoAwalEditable(!!d.saManual);
            }

            const docs = d.documents || {};
            setDocStatusLabel("linkRekeningKoran", docs.rekeningKoran);
            setDocStatusLabel("linkBKU", docs.bku);
            setDocStatusLabel("linkRekapanBelanja", docs.rekapanBelanja);
            setDocStatusLabel("linkLRA", docs.lra);
            setDocStatusLabel("linkBukuPajak", docs.bukuPajak);
            setDocStatusLabel("linkSPTJM", docs.sptjm);
            recalcInputForm();
            applyInputLock();
        }

        // Tandai bulan terverifikasi pada pilihan bulan, kunci form bagi operator sekolah
        function applyInputLock() {
            const schoolNo = document.getElementById("inputSchoolSelect").value;
            const monthSel = document.getElementById("inputMonthSelect");
            const month = monthSel.value;
            Array.prototype.forEach.call(monthSel.options, (opt, idx) => {
                opt.textContent = monthNames[idx] + (isMonthLocked(schoolNo, opt.value) ? " 🔒 (Terverifikasi)" : "");
            });

            const locked = isMonthLocked(schoolNo, month);
            const isOperator = !!(currentUser && currentUser.role === "Operator Sekolah");
            const lockForm = locked && isOperator;
            const body = document.getElementById("inputModalBody");
            const banner = document.getElementById("inputLockBanner");
            const saveBtn = document.getElementById("btnSaveRealisasi");

            body.querySelectorAll("input, select, textarea").forEach(el => {
                if (el.id === "inputSchoolSelect" || el.id === "inputMonthSelect") return;
                if (lockForm) {
                    if (!el.disabled) { el.disabled = true; el.setAttribute("data-verif-locked", "1"); }
                } else if (el.getAttribute("data-verif-locked") === "1") {
                    el.disabled = false; el.removeAttribute("data-verif-locked");
                }
            });
            if (saveBtn) saveBtn.disabled = lockForm;

            if (locked) {
                const st = (monthlyData[schoolNo][month] || {}).verifStatus;
                banner.className = "p-3 rounded-xl border text-xs " + (lockForm ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-blue-50 border-blue-200 text-blue-900");
                banner.innerHTML = lockForm
                    ? `<i class="fa-solid fa-lock mr-1"></i><b>Bulan ${monthNames[months.indexOf(month)]} sudah berstatus "${st}".</b> Data tidak dapat diubah lagi. Hubungi Admin Dinas bila perlu perbaikan (Admin dapat mengembalikan status ke Draft untuk membuka kunci).`
                    : `<i class="fa-solid fa-lock mr-1"></i>Bulan ${monthNames[months.indexOf(month)]} sudah berstatus "${st}". Sekolah tidak dapat menginput, namun Admin Dinas masih dapat mengubah data.`;
                banner.classList.remove("hidden");
            } else {
                banner.classList.add("hidden");
            }
        }

        function setSaldoAwalEditable(editable) {
            ["inSaldoReguler", "inSaldoKinerja", "inSaldoNonBOS", "inSaldoTunai"].forEach(id => {
                const el = document.getElementById(id);
                el.readOnly = !editable;
                el.classList.toggle("bg-slate-100", !editable);
                el.classList.toggle("text-slate-500", !editable);
                el.classList.toggle("cursor-not-allowed", !editable);
                el.classList.toggle("bg-white", editable);
            });
        }

        function toggleManualSA() {
            const on = document.getElementById("inSAManual").checked;
            if (!on) {
                // kembali mengikuti bulan sebelumnya
                const schoolNo = document.getElementById("inputSchoolSelect").value;
                const month = document.getElementById("inputMonthSelect").value;
                const saved = monthlyData[schoolNo] && monthlyData[schoolNo][month];
                const backup = saved && saved.saManual;
                if (saved) delete saved.saManual;
                loadSchoolMonthIntoForm();
                if (saved && backup) saved.saManual = backup; // pulihkan sampai disimpan
                document.getElementById("inSAManual").checked = false;
            } else {
                setSaldoAwalEditable(true);
                document.getElementById("infoSaldoAwal").textContent = "Mode koreksi manual: ubah nilai saldo awal sesuai Rekening Koran / BKU.";
            }
            recalcInputForm();
        }

        function isSwastaSchool(schoolNo) {
            const s = baseSchools.find(x => Number(x.no) === Number(schoolNo));
            return !!(s && String(s.status || "").toUpperCase() === "SWASTA");
        }

        function setJagirKeluarEditable(editable) {
            const el = document.getElementById("outJagirKeluar");
            const hint = document.getElementById("hintJagirKeluar");
            const formula = document.getElementById("rk_setorJagir_formula");
            if (!el) return;
            el.readOnly = !editable;
            el.classList.toggle("bg-slate-100", !editable);
            el.classList.toggle("text-slate-500", !editable);
            el.classList.toggle("cursor-not-allowed", !editable);
            el.classList.toggle("bg-white", editable);
            if (hint) {
                hint.textContent = editable
                    ? "Input manual (khusus sekolah SWASTA)"
                    : "Otomatis = JASA GIRO (NEGERI)";
                hint.className = editable
                    ? "block text-[10px] text-amber-700 mt-0.5 font-semibold"
                    : "block text-[10px] text-slate-400 mt-0.5";
            }
            if (formula) formula.textContent = editable ? "Input manual (SWASTA)" : "= JASA GIRO";
        }

        function readRekonForm() {
            const g = id => parseFloat(document.getElementById(id).value) || 0;
            const jasaGiro = g("inJagirMasuk");
            const schoolNo = document.getElementById("inputSchoolSelect") && document.getElementById("inputSchoolSelect").value;
            const swasta = schoolNo ? isSwastaSchool(schoolNo) : false;
            const jag = document.getElementById("outJagirKeluar");
            // NEGERI: SETOR JAGIR selalu mengikuti JASA GIRO. SWASTA: biarkan nilai manual di field.
            if (jag && !swasta) jag.value = jasaGiro || "";
            return {
                saReg: g("inSaldoReguler"), saKin: g("inSaldoKinerja"), saBukan: g("inSaldoNonBOS"), saTunai: g("inSaldoTunai"),
                reguler: g("inReguler"), kinerja: g("inKinerja"), jasaGiro: jasaGiro, setoranTunai: g("inSetoranTunai"), lebihTransfer: g("inLebihTransferMasuk"),
                pegawai: g("outPegawai"), barjas: g("outBarjasReg"), barjasKin: g("outBarjasKin"), pm: g("outPM"), pmKin: g("outPMKin"), atl: g("outATL"), atlKin: g("outATLKin"),
                lebihTransferKeluar: g("outLebihTransferKeluar"),
                setorJagir: swasta ? g("outJagirKeluar") : jasaGiro,
                setoranSaldoTunai: g("inSetoranSaldoTunai"), pengembalianBank: g("inPengembalianBank"), setoranPajak: g("inSetoranPajak"), saldoRC: g("inSaldoRCBank")
            };
        }

        function recalcInputForm() {
            if (!document.getElementById("rk_totalSaldoAwal")) return;
            const r = hitungRekon(readRekonForm());
            const map = {
                rk_totalSaldoAwal: r.totalSaldoAwal, rk_totalPendapatan: r.totalPendapatan, rk_totalPenerimaan: r.totalPenerimaan,
                rk_totalBelanja: r.totalBelanja, rk_setorJagir: r.setorJagir, rk_totalPengeluaran: r.totalPengeluaran,
                rk_totalSaldoBOS: r.totalSaldoBOS, rk_saldoBOSBank: r.saldoBOSBank, rk_saldoBankReguler: r.saldoBankReguler,
                rk_saldoBankKinerja: r.saldoBankKinerja, rk_saldoBankBukanBOS: r.saldoBankBukanBOS, rk_saldoBOSTunai: r.saldoBOSTunai,
                rk_saldoKasBOS: r.saldoKasBOS, rk_saldoSP2B: r.saldoSP2B, rk_selisih: r.selisih
            };
            Object.keys(map).forEach(id => {
                const el = document.getElementById(id);
                el.textContent = formatRupiah(map[id]);
                el.classList.toggle("text-rose-600", map[id] < 0);
            });
            const badge = document.getElementById("rk_selisihBadge");
            const rcFilled = document.getElementById("inSaldoRCBank").value !== "";
            if (!rcFilled) { badge.textContent = "RC belum diisi"; badge.className = "text-[10px] font-bold px-2 py-1 rounded-full bg-slate-200 text-slate-600 whitespace-nowrap"; }
            else if (Math.abs(r.selisih) < 1) { badge.textContent = "SESUAI"; badge.className = "text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap"; }
            else { badge.textContent = r.selisih > 0 ? "SP2B LEBIH BESAR" : "RC LEBIH BESAR"; badge.className = "text-[10px] font-bold px-2 py-1 rounded-full bg-rose-100 text-rose-700 whitespace-nowrap"; }
        }

        function openInputModal() {
            loadSchoolMonthIntoForm();
            const titleEl = document.getElementById("inputModalTitle");
            if (currentUser && currentUser.role === "Operator Sekolah") {
                titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square mr-2"></i> Input & Unggah Berkas PDF BOSP (${currentUser.name})`;
            } else {
                titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square mr-2"></i> Input Realisasi Bulanan & Unggah Berkas PDF (Admin Dinas)`;
            }
            document.getElementById("inputModal").classList.remove("hidden");
        }

        function closeInputModal() {
            document.getElementById("inputModal").classList.add("hidden");
        }

        async function saveRealizationData() {
            await loadFromGoogleSheets();
            const schoolNo = document.getElementById("inputSchoolSelect").value;
            const month = document.getElementById("inputMonthSelect").value;

            // Penjaga terakhir (setelah data terbaru dimuat): bulan terverifikasi tidak boleh diinput lagi
            if (isMonthLocked(schoolNo, month)) {
                if (currentUser && currentUser.role === "Operator Sekolah") {
                    alert(`Bulan ${monthNames[months.indexOf(month)]} sudah diverifikasi Dinas dan terkunci. Anda tidak dapat lagi menginput atau mengunggah berkas untuk bulan ini.`);
                    loadSchoolMonthIntoForm();
                    return;
                }
                if (!confirm(`Bulan ${monthNames[months.indexOf(month)]} sudah berstatus "${monthlyData[schoolNo][month].verifStatus}". Tetap simpan perubahan sebagai Admin Dinas?`)) return;
            }
            const initialVerif = currentUser && currentUser.role === "Operator Sekolah" ? "Diajukan Sekolah" : (monthlyData[schoolNo]?.[month]?.verifStatus || "Draft");

            if (!monthlyData[schoolNo]) monthlyData[schoolNo] = {};
            if (!monthlyData[schoolNo][month]) monthlyData[schoolNo][month] = {};

            const gv = id => parseFloat(document.getElementById(id).value) || 0;
            if (month === "Jan") {
                const sReg = gv("inSaldoReguler"), sKin = gv("inSaldoKinerja"), sNon = gv("inSaldoNonBOS"), sTun = gv("inSaldoTunai");
                const jan = monthlyData[schoolNo]["Jan"];
                jan.saldoReguler = sReg;
                jan.saldoKinerja = sKin;
                jan.saldoNonBOS = sNon;
                jan.saldoTunai = sTun;
                jan.saldoAwalCustom = sReg + sKin + sNon;
            } else if (document.getElementById("inSAManual").checked) {
                monthlyData[schoolNo][month].saManual = { reg: gv("inSaldoReguler"), kin: gv("inSaldoKinerja"), bukan: gv("inSaldoNonBOS"), tunai: gv("inSaldoTunai") };
            } else {
                delete monthlyData[schoolNo][month].saManual;
            }

            const docFields = [
                { key: 'rekeningKoran', elId: 'fileRekeningKoran' },
                { key: 'bku', elId: 'fileBKU' },
                { key: 'rekapanBelanja', elId: 'fileRekapanBelanja' },
                { key: 'lra', elId: 'fileLRA' },
                { key: 'bukuPajak', elId: 'fileBukuPajak' },
                { key: 'sptjm', elId: 'fileSPTJM' }
            ];

            // Normalisasi: pastikan SEMUA kunci dokumen ada (data dari Sheets bisa kosong/parsial)
            let existingDocs = monthlyData[schoolNo][month].documents;
            if (typeof existingDocs === "string") {
                try { existingDocs = JSON.parse(existingDocs); } catch (e) { existingDocs = {}; }
            }
            if (!existingDocs || typeof existingDocs !== "object") existingDocs = {};
            docFields.forEach(f => {
                if (!existingDocs[f.key] || typeof existingDocs[f.key] !== "object") {
                    existingDocs[f.key] = { url: "", checked: false };
                }
            });

            const loader = document.getElementById("syncLoadingOverlay");
            
            for (let doc of docFields) {
                const fileInput = document.getElementById(doc.elId);
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    if(loader) loader.classList.remove("hidden");
                    const file = fileInput.files[0];
                    try {
                        // Coba cek server, tapi jangan blokir upload jika gagal (bisa karena cache/CDN)
                        try { await ensureServerReady(); } catch (e) {}
                        const base64Data = await fileToBase64(file);
                        const schoolObj = baseSchools.find(x => Number(x.no) === Number(schoolNo)) || {};
                        const uploadResult = await gasPost({
                            action: "uploadFile",
                            schoolNo: schoolNo,
                            schoolName: schoolObj.name || "",
                            npsn: schoolObj.npsn || "",
                            month: month,
                            year: activeYear,
                            docType: doc.key,
                            fileName: file.name,
                            fileObj: file,
                            fileData: base64Data,
                            existingDriveFileId: existingDocs[doc.key].driveFileId || ""
                        });
                        if (uploadResult.status !== "success" || !uploadResult.fileUrl) {
                            throw new Error(uploadResult.message || "Respon server tidak valid");
                        }
                        existingDocs[doc.key].url = uploadResult.fileUrl;
                        if (uploadResult.driveFileId) existingDocs[doc.key].driveFileId = uploadResult.driveFileId;
                        existingDocs[doc.key].checked = false;
                        if (existingDocs[doc.key].needsFix) existingDocs[doc.key].reuploaded = true;
                    } catch (e) {
                        console.error("Gagal mengunggah file ke Google Drive:", e);
                        alert(`Gagal mengunggah "${file.name}" ke Google Drive: ${e.message}. Data lain tetap disimpan.`);
                    }
                    if(loader) loader.classList.add("hidden");
                }
            }

            monthlyData[schoolNo][month] = {
                ...monthlyData[schoolNo][month],
                pendapatan: {
                    reguler: parseFloat(document.getElementById("inReguler").value) || 0,
                    kinerja: parseFloat(document.getElementById("inKinerja").value) || 0,
                    jagirMasuk: parseFloat(document.getElementById("inJagirMasuk").value) || 0,
                    setoranTunai: parseFloat(document.getElementById("inSetoranTunai").value) || 0,
                    lebihTransferMasuk: parseFloat(document.getElementById("inLebihTransferMasuk").value) || 0
                },
                belanja: {
                    pegawai: parseFloat(document.getElementById("outPegawai").value) || 0,
                    barjasReg: parseFloat(document.getElementById("outBarjasReg").value) || 0,
                    barjasKin: parseFloat(document.getElementById("outBarjasKin").value) || 0,
                    pm: parseFloat(document.getElementById("outPM").value) || 0,
                    pmKin: parseFloat(document.getElementById("outPMKin").value) || 0,
                    atl: parseFloat(document.getElementById("outATL").value) || 0,
                    atlKin: parseFloat(document.getElementById("outATLKin").value) || 0,
                    // SWASTA: SETOR JAGIR input manual; NEGERI: otomatis = JASA GIRO
                    jagirKeluar: isSwastaSchool(schoolNo)
                        ? (parseFloat(document.getElementById("outJagirKeluar").value) || 0)
                        : (parseFloat(document.getElementById("inJagirMasuk").value) || 0),
                    lebihTransferKeluar: parseFloat(document.getElementById("outLebihTransferKeluar").value) || 0
                },
                rekon: {
                    setoranSaldoTunai: gv("inSetoranSaldoTunai"),
                    pengembalianBank: gv("inPengembalianBank"),
                    setoranPajak2023: gv("inSetoranPajak"),
                    saldoRCBank: gv("inSaldoRCBank")
                },
                documents: existingDocs,
                verifStatus: initialVerif
            };

            saveToLocalStorage();
            closeInputModal();
            updateActiveMonthData();
            alert("Realisasi & Dokumen PDF berhasil disimpan persisten & disinkronkan!");
        }

        function isReconDone(no, m) {
            const d = monthlyData[no] && monthlyData[no][m || refMonth()];
            return !!(d && d.reconDone);
        }

        function toggleReconDone(no, done) {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Hanya Admin Dinas yang dapat menandai selesai."); return; }
            if (!monthlyData[no]) monthlyData[no] = {};
            const rm = refMonth();
            if (!monthlyData[no][rm]) {
                monthlyData[no][rm] = {
                    pendapatan: { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 },
                    belanja: { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 },
                    documents: {}, verifStatus: "Draft"
                };
            }
            const md = monthlyData[no][rm];
            if (done) {
                const n = countDocsNeedFix(md.documents);
                if (n > 0 && !confirm(`Masih ada ${n} dokumen "Perlu perbaikan". Tetap tandai sekolah ini selesai rekonsiliasi?`)) { renderTable(); return; }
                md.reconDone = true;
                md.reconDoneAt = new Date().toISOString();
            } else {
                md.reconDone = false;
                delete md.reconDoneAt;
            }
            waEnqueue(no, "recon", () => done ? "Rekonsiliasi dinyatakan *SELESAI* oleh Dinas" : "Penandaan selesai rekonsiliasi dibatalkan oleh Dinas");
            saveToLocalStorage(no);
            const pg = currentPage;
            updateActiveMonthData();
            currentPage = pg;
            renderTable();
        }



        // =====================================================================
        // TABEL REKONSILIASI RINCI (kolom sama dengan form Input Realisasi)
        // =====================================================================
        let tableViewMode = localStorage.getItem("bosp_tableView") || ((window.matchMedia && window.matchMedia("(max-width: 767px)").matches) ? "ringkas" : "rinci");
        function isDetailView() { return !!(currentUser && currentUser.role === "Admin Dinas" && tableViewMode === "rinci"); }
        function setTableView(mode) {
            tableViewMode = mode;
            try { localStorage.setItem("bosp_tableView", mode); } catch (e) {}
            currentPage = 1;
            renderTable();
        }
        function refreshViewButtons() {
            const on = "bg-[#0F2C59] text-white", off = "bg-white text-slate-700 hover:bg-slate-100";
            const a = document.getElementById("btnViewRinci"), b = document.getElementById("btnViewRingkas");
            if (!a || !b) return;
            a.className = "px-3 py-1.5 font-semibold " + (tableViewMode === "rinci" ? on : off);
            b.className = "px-3 py-1.5 font-semibold border-l border-slate-300 " + (tableViewMode === "ringkas" ? on : off);
        }

        const DETAIL_GROUPS = [
            { label: "1. SALDO AWAL", bg: "bg-[#0F2C59]", cols: [
                { k: "saReg", l: "SA_BANK BOSREG" }, { k: "saKin", l: "SA_BANK BOSKIN" }, { k: "saBukan", l: "SA_BUKAN BOS" }, { k: "saTunai", l: "SA_TUNAI" },
                { k: "totalSaldoAwal", l: "TOTAL SALDO AWAL", b: 1 }] },
            { label: "2. PENDAPATAN & PENERIMAAN", bg: "bg-emerald-700", cols: [
                { k: "reguler", l: "REGULER" }, { k: "kinerja", l: "KINERJA" }, { k: "totalPendapatan", l: "TOTAL PENDAPATAN", b: 1 },
                { k: "jasaGiro", l: "JASA GIRO" }, { k: "setoranTunai", l: "SETORAN TUNAI" }, { k: "lebihTransfer", l: "LEBIH TRANSFER" },
                { k: "totalPenerimaan", l: "TOTAL PENERIMAAN", b: 1 }] },
            { label: "3. BELANJA", bg: "bg-rose-700", cols: [
                { k: "pegawai", l: "PEGAWAI" }, { k: "barjas", l: "BARJAS" }, { k: "barjasKin", l: "BARJAS BOSKIN" }, { k: "pm", l: "PM" },
                { k: "pmKin", l: "PM BOSKIN" }, { k: "atl", l: "ATL" }, { k: "atlKin", l: "ATL BOSKIN" }, { k: "totalBelanja", l: "TOTAL BELANJA", b: 1 }] },
            { label: "4. PENGELUARAN LAIN & PENYESUAIAN", bg: "bg-amber-700", cols: [
                { k: "setorJagir", l: "SETOR JAGIR" }, { k: "lebihKeluar", l: "LEBIH TRANSFER (KELUAR)" }, { k: "totalPengeluaran", l: "TOTAL PENGELUARAN", b: 1 },
                { k: "setoranSaldoTunai", l: "SETORAN SALDO TUNAI" }, { k: "pengembalianBank", l: "PENGEMBALIAN BANK" }, { k: "setoranPajak", l: "SETORAN PAJAK" }] },
            { label: "5. HASIL PERHITUNGAN", bg: "bg-indigo-700", cols: [
                { k: "totalSaldoBOS", l: "TOTAL SALDO BOS" }, { k: "saldoBankReguler", l: "SALDO BANK REGULER" }, { k: "saldoBankKinerja", l: "SALDO BANK KINERJA" },
                { k: "saldoBankBukanBOS", l: "SALDO BANK BUKAN BOS" }, { k: "saldoBOSTunai", l: "SALDO BOS TUNAI" }, { k: "saldoBOSBank", l: "SALDO BOS BANK" },
                { k: "saldoKasBOS", l: "SALDO KAS BOS", b: 1 }, { k: "saldoSP2B", l: "SALDO SP2B", b: 1 }] },
            { label: "6. REKONSILIASI RC BANK", bg: "bg-teal-700", cols: [
                { k: "saldoRC", l: "SALDO RC BANK" }, { k: "selisih", l: "SELISIH (SP2B − RC)", b: 1 }] }
        ];
        const DETAIL_COLS = DETAIL_GROUPS.reduce((a, g) => a.concat(g.cols), []);
        const fmtNum = v => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(v || 0));

        // Nilai rinci per sekolah untuk periode aktif: arus dijumlah, saldo awal = bulan pertama, saldo akhir = bulan terakhir
        function buildDetailRow(s, rolled) {
            const n = v => { const x = Number(v); return isFinite(x) ? x : 0; };
            const ms = getPeriodMonths();
            const r = rolled[s.no] || {};
            const first = r[ms[0]] && r[ms[0]].rekon, last = r[ms[ms.length - 1]] && r[ms[ms.length - 1]].rekon;
            const row = {};
            DETAIL_COLS.forEach(c => row[c.k] = 0);
            if (first) { row.saReg = first.saReg; row.saKin = first.saKin; row.saBukan = first.saBukan; row.saTunai = first.saTunai; row.totalSaldoAwal = first.totalSaldoAwal; }
            let sumPend = 0, sumBel = 0;
            ms.forEach(m => {
                const d = (monthlyData[s.no] && monthlyData[s.no][m]) || {};
                const p = d.pendapatan || {}, b = d.belanja || {}, rk = d.rekon || {};
                const mr = r[m] && r[m].rekon;
                row.reguler += n(p.reguler); row.kinerja += n(p.kinerja); row.jasaGiro += n(p.jagirMasuk);
                row.setoranTunai += n(p.setoranTunai); row.lebihTransfer += n(p.lebihTransferMasuk);
                row.pegawai += n(b.pegawai); row.barjas += n(b.barjasReg); row.barjasKin += n(b.barjasKin);
                row.pm += n(b.pm); row.pmKin += n(b.pmKin); row.atl += n(b.atl); row.atlKin += n(b.atlKin);
                row.lebihKeluar += n(b.lebihTransferKeluar);
                row.setoranSaldoTunai += n(rk.setoranSaldoTunai); row.pengembalianBank += n(rk.pengembalianBank); row.setoranPajak += n(rk.setoranPajak2023);
                if (mr) {
                    row.totalPendapatan += mr.totalPendapatan; row.totalPenerimaan += mr.totalPenerimaan; row.totalBelanja += mr.totalBelanja;
                    row.setorJagir += mr.setorJagir; row.totalPengeluaran += mr.totalPengeluaran;
                    sumPend += mr.totalPendapatan; sumBel += mr.totalBelanja;
                }
            });
            if (last) {
                row.totalSaldoBOS = last.totalSaldoBOS; row.saldoBankReguler = last.saldoBankReguler; row.saldoBankKinerja = last.saldoBankKinerja;
                row.saldoBankBukanBOS = last.saldoBankBukanBOS; row.saldoBOSTunai = last.saldoBOSTunai; row.saldoBOSBank = last.saldoBOSBank;
                row.saldoKasBOS = last.saldoKasBOS; row.saldoRC = last.saldoRC;
            }
            row.saldoSP2B = row.saReg + row.saKin + row.saTunai + sumPend - sumBel;
            row.selisih = row.saldoSP2B - row.saldoRC;
            return row;
        }

        function statusBadgeCls(st) {
            return st === "Diajukan Sekolah" ? "bg-amber-100 text-amber-800" : (st === "Diverifikasi Dinas" ? "bg-blue-100 text-blue-800" : (st === "Disahkan BUD" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"));
        }

        function renderDetailTable() {
            const rolled = computeRolledData();
            const head = document.getElementById("detailTableHead");
            const stick = "sticky left-0 z-20 bg-slate-100 text-slate-700";
            let h1 = `<tr class="uppercase tracking-wider text-[10px]">
                <th rowspan="2" class="py-2 px-2 border border-slate-300 ${stick} min-w-[2.5rem]">No</th>
                <th rowspan="2" class="py-2 px-3 border border-slate-300 sticky left-[2.5rem] z-20 bg-slate-100 text-slate-700 min-w-[190px] text-left">Nama Sekolah</th>
                <th rowspan="2" class="py-2 px-3 border border-slate-300 bg-slate-100 text-slate-700 text-left">Kecamatan</th>`;
            DETAIL_GROUPS.forEach(g => { h1 += `<th colspan="${g.cols.length}" class="py-2 px-2 border border-slate-300 text-white text-center ${g.bg}">${g.label}</th>`; });
            h1 += `<th rowspan="2" class="py-2 px-3 border border-slate-300 bg-slate-100 text-slate-700">Verifikasi</th><th rowspan="2" class="py-2 px-3 border border-slate-300 bg-slate-100 text-slate-700">Aksi</th></tr>`;
            const h2 = `<tr class="bg-slate-50 text-slate-600 text-[10px] uppercase">` + DETAIL_COLS.map(c => `<th class="py-2 px-2 border border-slate-300 text-right min-w-[110px]">${c.l}</th>`).join("") + `</tr>`;
            head.innerHTML = h1 + h2;

            const start = (currentPage - 1) * rowsPerPage;
            const pageItems = filteredData.slice(start, start + rowsPerPage);
            const body = document.getElementById("detailTableBody");
            const foot = document.getElementById("detailTableFoot");
            const colSpanAll = 3 + DETAIL_COLS.length + 2;

            if (filteredData.length === 0) {
                body.innerHTML = `<tr><td colspan="${colSpanAll}" class="text-center py-6 text-slate-400">Tidak ada data sekolah yang sesuai.</td></tr>`;
                foot.innerHTML = "";
                document.getElementById("paginationInfo").textContent = "Halaman 0 dari 0";
                document.getElementById("prevPage").disabled = true; document.getElementById("nextPage").disabled = true;
                return;
            }

            const tot = {}; DETAIL_COLS.forEach(c => tot[c.k] = 0);
            filteredData.forEach(s => { const d = buildDetailRow(s, rolled); DETAIL_COLS.forEach(c => tot[c.k] += d[c.k]); });

            const rows = pageItems.map((s, idx) => {
                const d = buildDetailRow(s, rolled);
                const cells = DETAIL_COLS.map(c => {
                    let cls = "py-2 px-2 border border-slate-200 text-right font-mono" + (c.b ? " font-bold bg-slate-50" : "");
                    if (c.k === "selisih") cls += (d.saldoRC === 0 ? " text-slate-400" : (Math.abs(d.selisih) < 1 ? " text-emerald-700" : " text-rose-600"));
                    else if (d[c.k] < 0) cls += " text-rose-600";
                    return `<td class="${cls}">${fmtNum(d[c.k])}</td>`;
                }).join("");
                const locked = LOCKED_STATUSES.indexOf(s.verifStatus) !== -1;
                const nFix = countDocsNeedFix(s.documents);
                const status = `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadgeCls(s.verifStatus)}">${s.verifStatus}</span>`
                    + (locked ? `<div class="mt-1"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700"><i class="fa-solid fa-lock mr-1"></i>Input Terkunci</span></div>` : "")
                    + (isReconDone(s.no) ? `<div class="mt-1"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700"><i class="fa-solid fa-circle-check mr-1"></i>Selesai Rekonsiliasi</span></div>` : "")
                    + (nFix > 0 ? `<div class="mt-1"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Perbaikan (${nFix})</span></div>` : "");
                const done = isReconDone(s.no);
                const aksi = `<label class="inline-flex items-center space-x-1 mr-1 cursor-pointer font-semibold ${done ? 'text-emerald-700' : 'text-slate-500'}" title="Tandai rekonsiliasi periode ini sudah selesai"><input type="checkbox" ${done ? 'checked' : ''} onchange="toggleReconDone(${s.no}, this.checked)" class="w-4 h-4 rounded border-slate-300"><span>Selesai</span></label>
                    <button onclick="openModal(${s.no})" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded shadow" title="Lihat Detail & Cek Berkas"><i class="fa-solid fa-eye"></i></button>
                    <button onclick="openSP2BModalDirect(${s.no})" class="bg-[#C5A059] hover:bg-amber-600 text-white px-2.5 py-1 rounded shadow" title="Cetak SP2B"><i class="fa-solid fa-file-invoice"></i></button>`;
                return `<tr class="hover:bg-slate-50">
                    <td class="py-2 px-2 border border-slate-200 sticky left-0 z-10 bg-white text-center">${start + idx + 1}</td>
                    <td class="py-2 px-3 border border-slate-200 sticky left-[2.5rem] z-10 bg-white font-semibold text-slate-900">${escHtml(s.name)}</td>
                    <td class="py-2 px-3 border border-slate-200">${escHtml(s.kecamatan)}</td>${cells}
                    <td class="py-2 px-3 border border-slate-200 text-center">${status}</td>
                    <td class="py-2 px-3 border border-slate-200 text-center space-x-1">${aksi}</td></tr>`;
            }).join("");
            body.innerHTML = rows;

            foot.innerHTML = `<tr class="bg-slate-100 font-bold text-slate-800">
                <td colspan="3" class="py-2 px-3 border border-slate-300 sticky left-0 z-10 bg-slate-100">TOTAL (${filteredData.length} sekolah)</td>`
                + DETAIL_COLS.map(c => `<td class="py-2 px-2 border border-slate-300 text-right font-mono">${fmtNum(tot[c.k])}</td>`).join("")
                + `<td colspan="2" class="border border-slate-300"></td></tr>`;

            const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
            document.getElementById("paginationInfo").textContent = `Halaman ${currentPage} dari ${totalPages}`;
            document.getElementById("prevPage").disabled = currentPage === 1;
            document.getElementById("nextPage").disabled = currentPage === totalPages;
        }

        // ---------- EKSPOR (Excel & CSV) ----------
        function detailExportRows() {
            const rolled = computeRolledData();
            const rm = refMonth();
            const fmtT = t => { if (!t) return ""; const d = new Date(t); return isNaN(d) ? "" : d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
            const body = filteredData.map((s, i) => {
                const d = buildDetailRow(s, rolled);
                const md = (monthlyData[s.no] && monthlyData[s.no][rm]) || {};
                return [i + 1, String(s.npsn || ""), s.name, s.kecamatan, s.jenjang || "", ...DETAIL_COLS.map(c => d[c.k]),
                        s.verifStatus, isReconDone(s.no) ? "Ya" : "Belum", isReconDone(s.no) ? fmtT(md.reconDoneAt) : ""];
            });
            const tot = DETAIL_COLS.map((c, ci) => body.reduce((a, r) => a + (Number(r[5 + ci]) || 0), 0));
            return { body: body, total: ["", "", `TOTAL (${body.length} sekolah)`, "", "", ...tot, "", "", ""] };
        }

        function exportRekonDetailExcel() {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Ekspor khusus Admin Dinas."); return; }
            if (!filteredData.length) { alert("Tidak ada data untuk diekspor."); return; }
            const left = ["No", "NPSN", "Nama Sekolah", "Kecamatan", "Jenjang"], right = ["Status Verifikasi", "Selesai Rekonsiliasi", "Waktu Selesai"];
            const nCols = left.length + DETAIL_COLS.length + right.length;
            const g1 = new Array(nCols).fill(""), g2 = left.concat(DETAIL_COLS.map(c => c.l), right);
            const merges = [];
            let col = left.length;
            DETAIL_GROUPS.forEach(g => { g1[col] = g.label; merges.push({ s: { r: 3, c: col }, e: { r: 3, c: col + g.cols.length - 1 } }); col += g.cols.length; });
            for (let c = 0; c < left.length; c++) { g1[c] = g2[c]; merges.push({ s: { r: 3, c: c }, e: { r: 4, c: c } }); }
            right.forEach((t, i) => { const c = left.length + DETAIL_COLS.length + i; g1[c] = t; merges.push({ s: { r: 3, c: c }, e: { r: 4, c: c } }); });
            const { body, total } = detailExportRows();
            const title = [`REKAPITULASI REKONSILIASI DANA BOSP — ${periodLabel(true).toUpperCase()} TAHUN ANGGARAN ${activeYear}`];
            const sub = [`Kabupaten Minahasa Tenggara | Dicetak: ${new Date().toLocaleString("id-ID")} | Jumlah sekolah: ${body.length}`];
            const aoa = [title, sub, [], g1, g2.map((t, i) => (i < left.length || i >= left.length + DETAIL_COLS.length) ? "" : t)].concat(body, [total]);
            merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws["!merges"] = merges;
            ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 8 }].concat(DETAIL_COLS.map(() => ({ wch: 17 })), [{ wch: 20 }, { wch: 12 }, { wch: 20 }]);
            for (let r = 5; r < aoa.length; r++) for (let c = 5; c < 5 + DETAIL_COLS.length; c++) { const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })]; if (cell && cell.t === "n") cell.z = "#,##0"; }
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Rekonsiliasi Rinci");
            XLSX.writeFile(wb, `Rekon_BOSP_Rinci_${periodLabel().replace(/\s+/g, "_")}_${activeYear}.xlsx`);
        }

        function exportRekonDetailCSV() {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Ekspor khusus Admin Dinas."); return; }
            if (!filteredData.length) { alert("Tidak ada data untuk diekspor."); return; }
            const hdr = ["No", "NPSN", "Nama Sekolah", "Kecamatan", "Jenjang"]
                .concat(DETAIL_GROUPS.reduce((a, g) => a.concat(g.cols.map(c => g.label.replace(/^\d+\.\s*/, "") + " - " + c.l)), []),
                        ["Status Verifikasi", "Selesai Rekonsiliasi", "Waktu Selesai"]);
            const { body, total } = detailExportRows();
            const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([hdr].concat(body, [total])));
            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `Rekon_BOSP_Rinci_${periodLabel().replace(/\s+/g, "_")}_${activeYear}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }

        // ---------- TEMPLATE & IMPOR NILAI ----------
        const IMPORT_FIELDS = [
            { k: "saReg", h: "SA_BANK BOSREG" }, { k: "saKin", h: "SA_BANK BOSKIN" }, { k: "saBukan", h: "SA_BUKAN BOS" }, { k: "saTunai", h: "SA_TUNAI" },
            { k: "reguler", h: "REGULER" }, { k: "kinerja", h: "KINERJA" }, { k: "jasaGiro", h: "JASA GIRO" }, { k: "setoranTunai", h: "SETORAN TUNAI" },
            { k: "lebihTransfer", h: "LEBIH TRANSFER MASUK" },
            { k: "pegawai", h: "PEGAWAI" }, { k: "barjas", h: "BARJAS" }, { k: "barjasKin", h: "BARJAS BOSKIN" }, { k: "pm", h: "PM" }, { k: "pmKin", h: "PM BOSKIN" },
            { k: "atl", h: "ATL" }, { k: "atlKin", h: "ATL BOSKIN" },
            { k: "lebihKeluar", h: "LEBIH TRANSFER KELUAR" }, { k: "setoranSaldoTunai", h: "SETORAN SALDO TUNAI" }, { k: "pengembalianBank", h: "PENGEMBALIAN BANK" },
            { k: "setoranPajak", h: "SETORAN PAJAK" }, { k: "saldoRC", h: "SALDO RC BANK" }
        ];
        const normHdr = h => String(h === undefined || h === null ? "" : h).toUpperCase().replace(/[^A-Z0-9]/g, "");
        const HDR_MAP = (() => {
            const m = {}; IMPORT_FIELDS.forEach(f => m[normHdr(f.h)] = f.k);
            m[normHdr("LEBIH TRANSFER")] = "lebihTransfer"; m[normHdr("SETORAN PAJAK 2023")] = "setoranPajak";
            return m;
        })();

        function openNilaiModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Fitur ini khusus Admin Dinas."); return; }
            const sel = document.getElementById("nilaiMonth");
            sel.innerHTML = "";
            months.forEach((m, i) => { const o = document.createElement("option"); o.value = m; o.textContent = monthNames[i] + " " + activeYear; sel.appendChild(o); });
            sel.value = refMonth();
            document.getElementById("nilaiResult").classList.add("hidden");
            document.getElementById("nilaiFileInput").value = "";
            document.getElementById("nilaiModal").classList.remove("hidden");
        }
        function closeNilaiModal() { document.getElementById("nilaiModal").classList.add("hidden"); }

        function downloadNilaiTemplate() {
            const month = document.getElementById("nilaiMonth").value;
            const prefill = document.getElementById("nilaiPrefill").checked;
            const rolled = computeRolledData();
            const hdr = ["NPSN", "NAMA SEKOLAH", "BULAN"].concat(IMPORT_FIELDS.map(f => f.h));
            const rows = baseSchools.map(s => {
                const d = (monthlyData[s.no] && monthlyData[s.no][month]) || {};
                const p = d.pendapatan || {}, b = d.belanja || {}, rk = d.rekon || {};
                let vals = IMPORT_FIELDS.map(() => "");
                if (prefill) {
                    const sa = d.saManual ? { reg: d.saManual.reg, kin: d.saManual.kin, bukan: d.saManual.bukan, tunai: d.saManual.tunai }
                        : (month === "Jan" ? { reg: (d.saldoReguler !== undefined && d.saldoReguler !== null) ? d.saldoReguler : d.saldoAwalCustom, kin: d.saldoKinerja, bukan: d.saldoNonBOS, tunai: d.saldoTunai } : null);
                    const src = { saReg: sa && sa.reg, saKin: sa && sa.kin, saBukan: sa && sa.bukan, saTunai: sa && sa.tunai,
                        reguler: p.reguler, kinerja: p.kinerja, jasaGiro: p.jagirMasuk, setoranTunai: p.setoranTunai, lebihTransfer: p.lebihTransferMasuk,
                        pegawai: b.pegawai, barjas: b.barjasReg, barjasKin: b.barjasKin, pm: b.pm, pmKin: b.pmKin, atl: b.atl, atlKin: b.atlKin,
                        lebihKeluar: b.lebihTransferKeluar, setoranSaldoTunai: rk.setoranSaldoTunai, pengembalianBank: rk.pengembalianBank,
                        setoranPajak: rk.setoranPajak2023, saldoRC: rk.saldoRCBank };
                    vals = IMPORT_FIELDS.map(f => { const v = Number(src[f.k]); return (isFinite(v) && v !== 0) ? v : ""; });
                }
                return [String(s.npsn || ""), s.name, monthNames[months.indexOf(month)]].concat(vals);
            });
            const ws = XLSX.utils.aoa_to_sheet([hdr].concat(rows));
            ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }].concat(IMPORT_FIELDS.map(() => ({ wch: 18 })));
            const guide = [
                ["PETUNJUK PENGISIAN TEMPLATE NILAI REALISASI BOSP"], [""],
                ["1. Jangan mengubah judul kolom, kolom NPSN dan BULAN. Sekolah dicocokkan lewat NPSN (cadangan: nama sekolah)."],
                ["2. Isi angka tanpa simbol Rp (contoh: 1500000). Titik/koma pemisah ribuan juga dikenali."],
                ["3. Sel KOSONG = nilai lama tidak diubah. Isi 0 bila ingin mengosongkan nilai."],
                ["4. SA_* (saldo awal): Januari wajib diisi. Bulan lain dikosongkan agar otomatis dari saldo akhir bulan sebelumnya; isi hanya untuk koreksi manual."],
                ["5. SETOR JAGIR: untuk sekolah NEGERI otomatis sama dengan JASA GIRO (tidak perlu diisi). Untuk sekolah SWASTA dapat diisi manual lewat form Input Realisasi."],
                ["6. Bulan yang sudah berstatus Diverifikasi Dinas / Disahkan BUD dilewati saat impor."],
                ["7. Kolom BULAN harus sama dengan bulan yang dipilih saat impor; baris yang berbeda dilewati."],
                [""], ["Bulan template: " + monthNames[months.indexOf(month)] + " " + activeYear]
            ];
            const wsG = XLSX.utils.aoa_to_sheet(guide);
            wsG["!cols"] = [{ wch: 120 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Input Nilai");
            XLSX.utils.book_append_sheet(wb, wsG, "Petunjuk");
            XLSX.writeFile(wb, `Template_Nilai_Realisasi_BOSP_${monthNames[months.indexOf(month)]}_${activeYear}.xlsx`);
        }

        // Angka dari sel Excel: mengenali format "1.234.567,89", "1,234,567.89", "Rp 1500000"
        function parseNilai(v) {
            if (v === "" || v === null || v === undefined) return { empty: true };
            if (typeof v === "number") return isFinite(v) ? { val: v } : { bad: true };
            let t = String(v).trim().replace(/rp/ig, "").replace(/\s/g, "");
            if (t === "" || t === "-") return { empty: true };
            const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
            t = t.replace(/[()\-]/g, "");
            if (!/^[0-9.,]+$/.test(t)) return { bad: true };
            const lastDot = t.lastIndexOf("."), lastCom = t.lastIndexOf(",");
            if (lastDot > -1 && lastCom > -1) {
                if (lastCom > lastDot) t = t.replace(/\./g, "").replace(",", "."); else t = t.replace(/,/g, "");
            } else if (lastCom > -1) {
                t = (t.match(/,/g).length > 1 || /,\d{3}$/.test(t)) ? t.replace(/,/g, "") : t.replace(",", ".");
            } else if (lastDot > -1) {
                if (t.match(/\./g).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
            }
            const x = parseFloat(t);
            return isFinite(x) ? { val: neg ? -x : x } : { bad: true };
        }

        function handleImportNilai(e) {
            const file = e.target.files[0];
            if (!file) return;
            const month = document.getElementById("nilaiMonth").value;
            const reader = new FileReader();
            reader.onload = async function (evt) {
                const loader = document.getElementById("syncLoadingOverlay");
                try {
                    const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
                    const sheetName = wb.SheetNames.indexOf("Input Nilai") > -1 ? "Input Nilai" : wb.SheetNames[0];
                    const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
                    if (!json.length) { alert("File kosong atau format tidak sesuai!"); return; }

                    // Muat data terbaru dulu agar status kunci/verifikasi & isian sekolah tidak basi
                    if (loader) loader.classList.remove("hidden");
                    await loadFromGoogleSheets();
                    if (loader) loader.classList.add("hidden");

                    const byNpsn = {}, byName = {};
                    baseSchools.forEach(s => { if (s.npsn) byNpsn[String(s.npsn).trim()] = s; byName[String(s.name).trim().toUpperCase()] = s; });
                    const monthName = monthNames[months.indexOf(month)];
                    const plan = [], locked = [], notFound = [], wrongMonth = [], badCells = [];
                    let untouched = 0;

                    json.forEach((row, i) => {
                        const keys = Object.keys(row);
                        const colOf = n => keys.filter(k => normHdr(k) === n)[0];
                        const npsn = String(row[colOf("NPSN")] === undefined ? "" : row[colOf("NPSN")]).trim();
                        const nm = String(row[colOf("NAMASEKOLAH")] === undefined ? "" : row[colOf("NAMASEKOLAH")]).trim().toUpperCase();
                        const bln = String(row[colOf("BULAN")] === undefined ? "" : row[colOf("BULAN")]).trim();
                        if (!npsn && !nm) return;
                        const sch = (npsn && byNpsn[npsn]) || byName[nm];
                        if (!sch) { notFound.push(npsn || nm); return; }
                        if (bln && normHdr(bln) !== normHdr(monthName) && normHdr(bln) !== normHdr(month)) { wrongMonth.push(sch.name); return; }
                        if (isMonthLocked(sch.no, month)) { locked.push(sch.name); return; }
                        const vals = {};
                        keys.forEach(k => {
                            const f = HDR_MAP[normHdr(k)];
                            if (!f) return;
                            const pv = parseNilai(row[k]);
                            if (pv.empty) return;
                            if (pv.bad) { badCells.push(`${sch.name} – ${k}`); return; }
                            vals[f] = pv.val;
                        });
                        if (!Object.keys(vals).length) { untouched++; return; }
                        plan.push({ s: sch, vals: vals });
                    });

                    const summary = `Impor nilai bulan ${monthName} ${activeYear}:\n- ${plan.length} sekolah akan diperbarui\n- ${locked.length} terkunci/terverifikasi (dilewati)\n- ${notFound.length} tidak ditemukan, ${wrongMonth.length} bulan tidak sesuai, ${untouched} tanpa nilai\n- ${badCells.length} sel tidak valid (diabaikan)\n\nTerapkan perubahan?`;
                    const resEl = document.getElementById("nilaiResult");
                    const li = (t, arr, cls) => arr.length ? `<div class="${cls} border rounded-lg p-2"><b>${t} (${arr.length}):</b> ${arr.slice(0, 15).map(escHtml).join(", ")}${arr.length > 15 ? " …" : ""}</div>` : "";
                    resEl.innerHTML = `<div class="space-y-2">${li("Terkunci / sudah diverifikasi", locked, "bg-slate-50 border-slate-200 text-slate-700")}${li("Tidak ditemukan", notFound, "bg-rose-50 border-rose-200 text-rose-800")}${li("Bulan tidak sesuai", wrongMonth, "bg-amber-50 border-amber-200 text-amber-800")}${li("Sel tidak valid", badCells, "bg-rose-50 border-rose-200 text-rose-800")}</div>`;
                    resEl.classList.remove("hidden");

                    if (!plan.length) { alert("Tidak ada nilai yang dapat diimpor.\n\n" + summary.split("\n\n")[0]); return; }
                    if (!confirm(summary)) return;

                    const rolled0 = computeRolledData();
                    plan.forEach(it => applyNilai(it.s, month, it.vals, rolled0));

                    try { localStorage.setItem(yearKey("monthlyData"), JSON.stringify(monthlyData)); } catch (er) {}
                    let syncMsg = "";
                    // Sinkron ke Node server ATAU Google Apps Script
                    if (isNodeBackend() || isGasConfigured()) {
                        if (loader) loader.classList.remove("hidden");
                        try {
                            const subset = {};
                            plan.forEach(it => { subset[it.s.no] = monthlyData[it.s.no]; });
                            const resp = await gasPost({ action: "saveAll", year: activeYear, partial: true, monthlyData: subset });
                            if (!resp || resp.status !== "success") {
                                syncMsg = "\nPeringatan: gagal sinkron ke server (" + ((resp && resp.message) || "tidak diketahui") + "). Data tersimpan lokal.";
                            } else {
                                syncMsg = "\nData juga tersimpan ke server (monthly_" + activeYear + ".json).";
                            }
                        } catch (er) {
                            syncMsg = "\nPeringatan: gagal sinkron ke server (" + er.message + "). Data tersimpan lokal. Pastikan sudah login.";
                        }
                        if (loader) loader.classList.add("hidden");
                    } else {
                        syncMsg = "\nCatatan: mode offline — data hanya di browser ini.";
                    }
                    const pg = currentPage;
                    updateActiveMonthData();
                    currentPage = pg; renderTable();
                    alert(`Berhasil mengimpor nilai ${plan.length} sekolah untuk bulan ${monthName}.` + syncMsg);
                } catch (err) {
                    console.error(err);
                    if (loader) loader.classList.add("hidden");
                    alert("Gagal membaca file Excel/CSV. Gunakan template yang diunduh dari aplikasi ini.");
                } finally {
                    e.target.value = "";
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // Terapkan nilai impor ke satu sekolah/bulan (aturan sama dengan form Input Realisasi)
        function applyNilai(s, month, v, rolled0) {
            const no = s.no;
            if (!monthlyData[no]) monthlyData[no] = {};
            if (!monthlyData[no][month]) monthlyData[no][month] = { documents: {}, verifStatus: "Draft" };
            const d = monthlyData[no][month];
            d.pendapatan = Object.assign({ reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 }, d.pendapatan || {});
            d.belanja = Object.assign({ pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 }, d.belanja || {});
            d.rekon = Object.assign({ setoranSaldoTunai: 0, pengembalianBank: 0, setoranPajak2023: 0, saldoRCBank: 0 }, d.rekon || {});
            const has = k => v[k] !== undefined;
            const P = d.pendapatan, B = d.belanja, R = d.rekon;
            if (has("reguler")) P.reguler = v.reguler; if (has("kinerja")) P.kinerja = v.kinerja; if (has("jasaGiro")) P.jagirMasuk = v.jasaGiro;
            if (has("setoranTunai")) P.setoranTunai = v.setoranTunai; if (has("lebihTransfer")) P.lebihTransferMasuk = v.lebihTransfer;
            if (has("pegawai")) B.pegawai = v.pegawai; if (has("barjas")) B.barjasReg = v.barjas; if (has("barjasKin")) B.barjasKin = v.barjasKin;
            if (has("pm")) B.pm = v.pm; if (has("pmKin")) B.pmKin = v.pmKin; if (has("atl")) B.atl = v.atl; if (has("atlKin")) B.atlKin = v.atlKin;
            if (has("lebihKeluar")) B.lebihTransferKeluar = v.lebihKeluar;
            // SWASTA: pertahankan nilai SETOR JAGIR yang sudah ada (manual); NEGERI: selalu = JASA GIRO
            if (isSwastaSchool(s.no)) {
                if (has("jasaGiro") && (B.jagirKeluar === undefined || B.jagirKeluar === null)) B.jagirKeluar = P.jagirMasuk || 0;
            } else {
                B.jagirKeluar = P.jagirMasuk || 0;
            }
            if (has("setoranSaldoTunai")) R.setoranSaldoTunai = v.setoranSaldoTunai;
            if (has("pengembalianBank")) R.pengembalianBank = v.pengembalianBank;
            if (has("setoranPajak")) R.setoranPajak2023 = v.setoranPajak;
            if (has("saldoRC")) R.saldoRCBank = v.saldoRC;

            if (has("saReg") || has("saKin") || has("saBukan") || has("saTunai")) {
                if (month === "Jan") {
                    if (has("saReg")) d.saldoReguler = v.saReg; if (has("saKin")) d.saldoKinerja = v.saKin;
                    if (has("saBukan")) d.saldoNonBOS = v.saBukan; if (has("saTunai")) d.saldoTunai = v.saTunai;
                    d.saldoAwalCustom = (Number(d.saldoReguler) || 0) + (Number(d.saldoKinerja) || 0) + (Number(d.saldoNonBOS) || 0);
                } else {
                    const rm = rolled0[no] && rolled0[no][month];
                    const base = d.saManual || { reg: rm ? rm.saldoReguler : 0, kin: rm ? rm.saldoKinerja : 0, bukan: rm ? rm.saldoNonBOS : 0, tunai: rm ? rm.saldoTunai : 0 };
                    d.saManual = {
                        reg: has("saReg") ? v.saReg : base.reg, kin: has("saKin") ? v.saKin : base.kin,
                        bukan: has("saBukan") ? v.saBukan : base.bukan, tunai: has("saTunai") ? v.saTunai : base.tunai
                    };
                }
            }
        }

        // ---------- URUTAN KECEPATAN REKONSILIASI (berdasarkan ceklist "Selesai") ----------

        function initPublicRankControls() {
            const mSel = document.getElementById("publicRankMonth");
            if (!mSel || mSel.options.length) return;
            months.forEach((m, i) => {
                const o = document.createElement("option");
                o.value = m; o.textContent = monthNames[i];
                if (m === currentMonth) o.selected = true;
                mSel.appendChild(o);
            });
        }
        function fmtPublicTime(iso) {
            if (!iso) return "—";
            try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return "—";
                return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
            } catch (e) { return "—"; }
        }
        async function renderPublicRank() {
            const body = document.getElementById("publicRankBody");
            const note = document.getElementById("publicRankNote");
            if (!body) return;
            const month = (document.getElementById("publicRankMonth") || {}).value || currentMonth || "Jan";
            const year = Number((document.getElementById("publicRankYear") || {}).value || activeYear || 2026);
            body.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:#94a3b8">Memuat…</td></tr>';

            try {
                const base = (typeof isNodeBackend === "function" && isNodeBackend() && typeof NODE_API_BASE !== "undefined")
                    ? NODE_API_BASE : (window.location.origin || "");
                const r = await fetch(base + "/api/public/rank?year=" + year + "&month=" + encodeURIComponent(month), { cache: "no-store" });
                if (r.ok) {
                    const j = await r.json();
                    if (j.status === "success" && Array.isArray(j.rows)) {
                        if (!j.rows.length) {
                            body.innerHTML = '<tr><td colspan="5" style="padding:28px;text-align:center;color:#94a3b8">Belum ada sekolah yang ditandai selesai.</td></tr>';
                        } else {
                            body.innerHTML = j.rows.map((row, i) => {
                                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
                                return "<tr style=\"border-top:1px solid #f1f5f9\"><td style=\"padding:10px 12px;font-weight:700\">" + medal +
                                    "</td><td style=\"padding:10px 12px;font-weight:600\">" + String(row.name||"").replace(/</g,"") +
                                    "</td><td style=\"padding:10px 12px\">" + String(row.kecamatan||"").replace(/</g,"") +
                                    "</td><td style=\"padding:10px 12px;font-size:12px\">" + fmtPublicTime(row.doneAt) +
                                    "</td><td style=\"padding:10px 12px\">" + (row.durasi || "—") + "</td></tr>";
                            }).join("");
                        }
                        if (note) note.textContent = "Sumber server · " + (j.rows.length) + " sekolah selesai";
                        return;
                    }
                }
            } catch (e) { console.warn(e); }

            const eom = new Date(year, months.indexOf(month) + 1, 0, 23, 59, 59, 999).getTime();
            const done = [];
            (baseSchools || []).forEach(s => {
                const d = monthlyData[s.no] && monthlyData[s.no][month];
                if (d && d.reconDone) done.push({ s, t: d.reconDoneAt ? new Date(d.reconDoneAt).getTime() : NaN, iso: d.reconDoneAt });
            });
            done.sort((a,b) => (isFinite(a.t)?a.t:1e15) - (isFinite(b.t)?b.t:1e15));
            if (!done.length) {
                body.innerHTML = '<tr><td colspan="5" style="padding:28px;text-align:center;color:#94a3b8">Belum ada data peringkat. Muncul setelah Dinas menandai selesai, atau saat terhubung ke server.</td></tr>';
                if (note) note.textContent = "Menunggu data rekonsiliasi.";
                return;
            }
            body.innerHTML = done.map((r, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
                let dur = "—";
                if (isFinite(r.t) && typeof fmtDurasiRekon === "function") dur = fmtDurasiRekon(r.t - eom);
                else if (isFinite(r.t)) {
                    const days = Math.floor(Math.abs(r.t - eom) / 86400000);
                    dur = days + " hari";
                }
                return "<tr style=\"border-top:1px solid #f1f5f9\"><td style=\"padding:10px 12px;font-weight:700\">" + medal +
                    "</td><td style=\"padding:10px 12px;font-weight:600\">" + String(r.s.name||"").replace(/</g,"") +
                    "</td><td style=\"padding:10px 12px\">" + String(r.s.kecamatan||"").replace(/</g,"") +
                    "</td><td style=\"padding:10px 12px;font-size:12px\">" + fmtPublicTime(r.iso) +
                    "</td><td style=\"padding:10px 12px\">" + dur + "</td></tr>";
            }).join("");
            if (note) note.textContent = "Sumber data lokal · " + done.length + " sekolah selesai";
        }

        function openRankModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Fitur ini khusus untuk Admin Dinas.");
                return;
            }
            const mSel = document.getElementById("rankMonth");
            mSel.innerHTML = "";
            months.forEach((m, i) => {
                const o = document.createElement("option");
                o.value = m; o.textContent = monthNames[i] + " " + activeYear;
                mSel.appendChild(o);
            });
            mSel.value = refMonth();
            const kSel = document.getElementById("rankKec");
            kSel.innerHTML = '<option value="">Semua Kecamatan</option>';
            [...new Set(baseSchools.map(s => s.kecamatan))].sort().forEach(k => {
                const o = document.createElement("option");
                o.value = k; o.textContent = k;
                kSel.appendChild(o);
            });
            renderRankModal();
            document.getElementById("rankModal").classList.remove("hidden");
        }

        function closeRankModal() {
            document.getElementById("rankModal").classList.add("hidden");
        }

        function fmtDurasiRekon(ms) {
            const hari = ms / 86400000;
            if (hari <= 0) return "Sebelum/tepat akhir bulan";
            if (hari < 1) return Math.max(1, Math.round(ms / 3600000)) + " jam setelah akhir bulan";
            return Math.floor(hari) + " hari setelah akhir bulan";
        }

        function renderRankModal() {
            const m = document.getElementById("rankMonth").value;
            const order = document.getElementById("rankOrder").value;
            const kec = document.getElementById("rankKec").value;
            const mIdx = months.indexOf(m);
            const endOfMonth = new Date(activeYear, mIdx + 1, 0, 23, 59, 59, 999).getTime();

            const list = baseSchools.filter(s => !kec || s.kecamatan === kec);
            const done = [], noTime = [], pending = [];
            list.forEach(s => {
                const d = monthlyData[s.no] && monthlyData[s.no][m];
                if (d && d.reconDone) {
                    const t = d.reconDoneAt ? new Date(d.reconDoneAt).getTime() : NaN;
                    if (isFinite(t)) done.push({ s: s, t: t }); else noTime.push({ s: s });
                } else {
                    pending.push(s);
                }
            });
            done.sort((a, b) => order === "cepat" ? a.t - b.t : b.t - a.t);

            const tile = (label, val, cls) => `<div class="rounded-lg p-3 ${cls}"><div class="text-base font-bold leading-tight">${val}</div><div class="text-[10px] uppercase font-semibold tracking-wide mt-0.5">${label}</div></div>`;
            const fastest = done.length ? done.reduce((a, b) => a.t <= b.t ? a : b) : null;
            const slowest = done.length ? done.reduce((a, b) => a.t >= b.t ? a : b) : null;
            const avg = done.length ? done.reduce((a, b) => a + (b.t - endOfMonth), 0) / done.length : null;
            document.getElementById("rankSummary").innerHTML =
                tile("Sekolah selesai", `${done.length + noTime.length} / ${list.length}`, "bg-emerald-100 text-emerald-800") +
                tile("Tercepat", fastest ? escHtml(fastest.s.name) : "-", "bg-blue-100 text-blue-800") +
                tile("Terlama", slowest ? escHtml(slowest.s.name) : "-", "bg-amber-100 text-amber-800") +
                tile("Rata-rata lama", avg === null ? "-" : fmtDurasiRekon(avg), "bg-slate-100 text-slate-700");

            const fmtTgl = t => new Date(t).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
            const medal = i => i === 0 ? '<i class="fa-solid fa-medal text-yellow-500"></i> ' : (i === 1 ? '<i class="fa-solid fa-medal text-slate-400"></i> ' : (i === 2 ? '<i class="fa-solid fa-medal text-amber-700"></i> ' : ""));
            const rows = [];
            done.forEach((r, i) => {
                const fastRank = order === "cepat" ? i : done.length - 1 - i; // peringkat kecepatan sebenarnya (0 = tercepat)
                rows.push(`<tr class="hover:bg-slate-50">
                    <td class="py-2 px-3 text-center font-bold">${medal(fastRank)}${fastRank + 1}</td>
                    <td class="py-2 px-3 font-semibold text-slate-900">${escHtml(r.s.name)}</td>
                    <td class="py-2 px-3">${escHtml(r.s.kecamatan)}</td>
                    <td class="py-2 px-3 font-mono">${fmtTgl(r.t)}</td>
                    <td class="py-2 px-3">${fmtDurasiRekon(r.t - endOfMonth)}</td></tr>`);
            });
            noTime.forEach(r => {
                rows.push(`<tr class="bg-slate-50 text-slate-500"><td class="py-2 px-3 text-center">-</td>
                    <td class="py-2 px-3 font-semibold">${escHtml(r.s.name)}</td><td class="py-2 px-3">${escHtml(r.s.kecamatan)}</td>
                    <td class="py-2 px-3 italic" colspan="2">Selesai, waktu tidak tercatat (dicentang sebelum fitur ini). Hapus lalu centang ulang untuk mencatat waktu.</td></tr>`);
            });
            document.getElementById("rankTableBody").innerHTML = rows.length ? rows.join("") :
                `<tr><td colspan="5" class="text-center py-6 text-slate-400">Belum ada sekolah yang dicentang selesai untuk ${monthNames[mIdx]} ${activeYear}.</td></tr>`;

            document.getElementById("rankPending").innerHTML = pending.length
                ? `<div class="bg-rose-50 border border-rose-200 rounded-lg p-3"><p class="font-bold text-rose-800 mb-1"><i class="fa-solid fa-hourglass-half mr-1"></i>Belum selesai (${pending.length} sekolah)</p><p class="text-slate-700">${pending.map(s => escHtml(s.name)).join(", ")}</p></div>`
                : "";
        }

        function renderProgressPanel() {
            const el = document.getElementById("progressPanel");
            if (!el || !currentUser) return;
            if (typeof rkRenderWelcome === "function") rkRenderWelcome();
            const pLabel = periodLabel();
            const verifOf = (no, m) => (monthlyData[no] && monthlyData[no][m || refMonth()] && monthlyData[no][m || refMonth()].verifStatus) || "Draft";
            const fixOf = (no, m) => countDocsNeedFix(monthlyData[no] && monthlyData[no][m || refMonth()] && monthlyData[no][m || refMonth()].documents) > 0;
            const bar = (pct, color) => `<div class="bar"><i style="width:${pct}%;background:${color}"></i></div>`;
            const tile = (label, n, cls, icon) => `<div class="tile ${cls}"><i class="fa-solid ${icon}"></i><div><b>${n}</b><span>${label}</span></div></div>`;

            if (currentUser.role !== "Operator Sekolah") {
                const list = baseSchools, total = list.length;
                const done = list.filter(s => isReconDone(s.no)).length;
                const pct = total ? Math.round(done / total * 100) : 0;
                const cnt = { "Draft": 0, "Diajukan Sekolah": 0, "Diverifikasi Dinas": 0, "Disahkan BUD": 0 };
                list.forEach(s => { const v = verifOf(s.no); cnt[v] = (cnt[v] || 0) + 1; });
                const fix = list.filter(s => fixOf(s.no)).length;
                const kec = {};
                list.forEach(s => { const k = s.kecamatan || "-"; kec[k] = kec[k] || { t: 0, d: 0 }; kec[k].t++; if (isReconDone(s.no)) kec[k].d++; });
                const kecHtml = Object.keys(kec).sort().map(k => {
                    const kp = Math.round(kec[k].d / kec[k].t * 100);
                    return `<div><div class="row"><b>${escHtml(k)}</b><span>${kec[k].d}/${kec[k].t} sekolah</span></div>${bar(kp, kp === 100 ? "#10b981" : "#3b82f6")}</div>`;
                }).join("");
                el.innerHTML = `
                    <div class="pp-head">
                        <div class="pp-ring" style="--p:${pct}"><span>${pct}%</span></div>
                        <div class="tx">
                            <h3>Progres Rekonsiliasi Sekolah — ${pLabel}</h3>
                            <p><b>${done}</b> dari ${total} sekolah selesai</p>
                        </div>
                        <button onclick="openRankModal()" class="btn btn-soft"><i class="fa-solid fa-ranking-star"></i> Urutan Tercepat &amp; Terlama</button>
                    </div>
                    <div class="pp-tiles">
                        ${tile("Belum diajukan", cnt["Draft"], "t-slate", "fa-file-circle-question")}
                        ${tile("Diajukan sekolah", cnt["Diajukan Sekolah"], "t-amber", "fa-paper-plane")}
                        ${tile("Diverifikasi Dinas", cnt["Diverifikasi Dinas"], "t-blue", "fa-clipboard-check")}
                        ${tile("Disahkan BUD", cnt["Disahkan BUD"], "t-green", "fa-stamp")}
                        ${tile("Perlu perbaikan", fix, "t-rose", "fa-triangle-exclamation")}
                    </div>
                    <div class="pp-kec">${kecHtml}</div>`;
            } else {
                const s = findSchoolForUser(currentUser);
                if (!s) { el.innerHTML = '<p class="text-xs text-slate-500">Data sekolah Anda tidak ditemukan di Data Master.</p>'; return; }
                const doneM = months.filter(m => isReconDone(s.no, m)).length;
                const pct = Math.round(doneM / months.length * 100);
                const chips = months.map((m, i) => {
                    const v = verifOf(s.no, m);
                    let cls = "m-none", st = "Belum";
                    if (isReconDone(s.no, m)) { cls = "m-done"; st = "Selesai"; }
                    else if (v === "Disahkan BUD" || v === "Diverifikasi Dinas") { cls = "m-ok"; st = "Diverifikasi"; }
                    else if (v === "Diajukan Sekolah") { cls = "m-sub"; st = "Diajukan"; }
                    const ring = m === currentMonth && periodType === 'bulan' ? " m-cur" : "";
                    const warn = fixOf(s.no, m) ? '<i class="fa-solid fa-triangle-exclamation text-rose-600 ml-1"></i>' : "";
                    return `<div class="mchip ${cls}${ring}"><b>${m}${warn}</b><span>${st}</span></div>`;
                }).join("");
                const docs = (monthlyData[s.no] && monthlyData[s.no][refMonth()] && monthlyData[s.no][refMonth()].documents) || {};
                const up = DOC_LABELS.filter(d => docs[d.key] && docs[d.key].url).length;
                const dpct = DOC_LABELS.length ? Math.round(up / DOC_LABELS.length * 100) : 0;
                el.innerHTML = `
                    <div class="pp-head">
                        <div class="pp-ring" style="--p:${pct}"><span>${pct}%</span></div>
                        <div class="tx">
                            <h3>Progres Rekonsiliasi ${escHtml(s.name)} — Tahun Berjalan</h3>
                            <p><b>${doneM}</b> dari 12 bulan selesai</p>
                        </div>
                    </div>
                    <div class="pp-months">${chips}</div>
                    <div class="pp-kec" style="grid-template-columns:1fr">
                        <div><div class="row"><b>Dokumen periode aktif</b><span>${up} dari ${DOC_LABELS.length} berkas diunggah</span></div>${bar(dpct, dpct === 100 ? "#10b981" : "#C5A059")}</div>
                    </div>${window.Pejabat ? Pejabat.noticeHtml() : ""}`;
            }
        }

        function filterData() {
            // Beranda hanya menampilkan progres; tabel, KPI & grafik ada di halaman Realisasi Belanja
            if (PAGE !== "realisasi") { renderProgressPanel(); return; }
            let rolled = computeRolledData();
            let rawSchools = baseSchools;

            if (currentUser && currentUser.role === "Operator Sekolah") {
                const matchedSchool = findSchoolForUser(currentUser);
                rawSchools = matchedSchool ? [matchedSchool] : [];
            }

            if (currentUser && currentUser.role === "Operator Sekolah") {
                filteredData = filteredData;
            } else {
                const search = document.getElementById("searchSchool").value.toLowerCase();
                const kec = document.getElementById("filterKecamatan").value;
                const status = document.getElementById("filterStatus").value;
                const jenjang = document.getElementById("filterJenjang").value;

                filteredData = filteredData.filter(s => {
                    const matchSearch = s.name.toLowerCase().includes(search);
                    const matchKec = kec === "" || s.kecamatan === kec;
                    const matchStatus = status === "" || (s.status || "NEGERI") === status;
                    const matchJenjang = jenjang === "" || (s.jenjang || "SD") === jenjang;
                    const rekon = (document.getElementById("filterRekon") || {}).value || "";
                    const matchRekon = rekon === "" || (rekon === "selesai") === isReconDone(s.no);
                    return matchSearch && matchKec && matchStatus && matchJenjang && matchRekon;
                });
            }

            currentPage = 1;
            renderTable();
            updateKPIs();
            renderProgressPanel();
            if (currentUser && currentUser.role === "Admin Dinas") {
                updateCharts();
            }
        }

        function resetFilters() {
            document.getElementById("searchSchool").value = "";
            document.getElementById("filterKecamatan").value = "";
            document.getElementById("filterStatus").value = "";
            if (document.getElementById("filterRekon")) document.getElementById("filterRekon").value = "";
            document.getElementById("filterJenjang").value = "";
            updateActiveMonthData();
        }

        function updateKPIs() {
            const totalSekolah = filteredData.length;
            const totalSaldoAwal = filteredData.reduce((acc, curr) => acc + curr.saldoAwal, 0);
            const totalPendapatan = filteredData.reduce((acc, curr) => acc + curr.totalPendapatan, 0);
            const totalBelanja = filteredData.reduce((acc, curr) => acc + curr.totalBelanja, 0);
            const totalKas = filteredData.reduce((acc, curr) => acc + curr.kasSeharusnya, 0);

            const totalSekolahEl = document.getElementById("kpiTotalSekolah");
            if (totalSekolahEl) totalSekolahEl.textContent = totalSekolah;

            document.getElementById("kpiSaldoAwal").textContent = formatRupiah(totalSaldoAwal);
            document.getElementById("kpiPendapatan").textContent = formatRupiah(totalPendapatan);
            document.getElementById("kpiBelanja").textContent = formatRupiah(totalBelanja);
            document.getElementById("kpiKasSeharusnya").textContent = formatRupiah(totalKas);
            
            if (currentUser && currentUser.role === "Operator Sekolah") {
                document.getElementById("recordCount").textContent = `Menampilkan Sekolah Anda`;
            } else {
                document.getElementById("recordCount").textContent = `Menampilkan ${totalSekolah} Sekolah`;
            }
        }

        function renderTable() {
            // Akun sekolah: "Data Realisasi Rekonsiliasi Sekolah Anda" ditampilkan sebagai kartu rinci (pejabat.js)
            if (window.Pejabat && document.getElementById("schoolDetailCard") && Pejabat.renderCard()) return;
            const isAdminView = !!(currentUser && currentUser.role === "Admin Dinas");
            const tools = document.getElementById("adminTableTools");
            if (tools) tools.classList.toggle("hidden", !isAdminView);
            refreshViewButtons();
            const detailOn = isDetailView();
            if (typeof rkTableHint === "function") rkTableHint(detailOn);
            document.getElementById("detailTableWrap").classList.toggle("hidden", !detailOn);
            document.getElementById("simpleTableWrap").classList.toggle("hidden", detailOn);
            if (detailOn) { renderDetailTable(); return; }

            const tbody = document.getElementById("schoolTableBody");
            tbody.innerHTML = "";

            const start = (currentPage - 1) * rowsPerPage;
            const end = start + rowsPerPage;
            const paginatedItems = filteredData.slice(start, end);

            if (paginatedItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-slate-400"><i class="fa-regular fa-folder-open text-2xl block mb-2"></i>Tidak ada data sekolah yang sesuai.</td></tr>`;
                document.getElementById("paginationInfo").textContent = "Halaman 0 dari 0";
                return;
            }

            paginatedItems.forEach((s, idx) => {
                let badgeColor = "bg-slate-100 text-slate-700";
                if (s.verifStatus === "Diajukan Sekolah") badgeColor = "bg-amber-100 text-amber-800";
                else if (s.verifStatus === "Diverifikasi Dinas") badgeColor = "bg-blue-100 text-blue-800";
                else if (s.verifStatus === "Disahkan BUD") badgeColor = "bg-emerald-100 text-emerald-800";

                const tr = document.createElement("tr");
                tr.className = "hover:bg-slate-50 transition";
                tr.innerHTML = `
                    <td data-label="No" class="py-3 px-4">${start + idx + 1}</td>
                    <td data-label="Nama Sekolah" class="py-3 px-4 font-semibold text-slate-900">${s.name}</td>
                    <td data-label="Kecamatan" class="py-3 px-4">${s.kecamatan}</td>
                    <td data-label="Saldo Awal" class="py-3 px-4 text-right font-mono">${formatRupiah(s.saldoAwal)}</td>
                    <td data-label="Total Pendapatan" class="py-3 px-4 text-right font-mono">${formatRupiah(s.totalPendapatan)}</td>
                    <td data-label="Total Belanja" class="py-3 px-4 text-right font-mono">${formatRupiah(s.totalBelanja)}</td>
                    <td data-label="Kas Seharusnya" class="py-3 px-4 text-right font-mono font-bold">${formatRupiah(s.kasSeharusnya)}</td>
                    <td data-label="Verifikasi" class="py-3 px-4 text-center"><div class="vwrap">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${badgeColor}">${s.verifStatus}</span>
                        ${LOCKED_STATUSES.indexOf(s.verifStatus) !== -1 ? `<div class="mt-1"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700" title="Sekolah tidak dapat lagi menginput pada periode ini"><i class="fa-solid fa-lock mr-1"></i>Input Terkunci</span></div>` : ''}
                        ${isReconDone(s.no) ? `<div class="mt-1"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700"><i class="fa-solid fa-circle-check mr-1"></i>Selesai Rekonsiliasi</span></div>` : ''}
                        ${countDocsNeedFix(s.documents) > 0 ? `<div class="mt-1"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700" title="Dokumen perlu perbaikan"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Perbaikan (${countDocsNeedFix(s.documents)})</span></div>` : ''}
                    </div></td>
                    <td data-label="Aksi" class="py-3 px-4 text-center space-x-1">
                        ${currentUser && currentUser.role === "Admin Dinas" ? `<label class="inline-flex items-center space-x-1 mr-1 cursor-pointer font-semibold ${isReconDone(s.no) ? 'text-emerald-700' : 'text-slate-500'}" title="Tandai rekonsiliasi periode ini sudah selesai"><input type="checkbox" ${isReconDone(s.no) ? 'checked' : ''} onchange="toggleReconDone(${s.no}, this.checked)" class="w-4 h-4 rounded border-slate-300"><span class="text-[11px]">Selesai</span></label>` : ''}
                        <button onclick="openModal(${s.no})" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-[11px] shadow" title="Lihat Detail & Cek Berkas">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        ${currentUser && currentUser.role === "Admin Dinas" ? `<button onclick="openSP2BModalDirect(${s.no})" class="bg-[#C5A059] hover:bg-amber-600 text-white px-2.5 py-1 rounded text-[11px] shadow" title="Cetak SP2B">
                            <i class="fa-solid fa-file-invoice"></i>
                        </button>` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
            document.getElementById("paginationInfo").textContent = `Halaman ${currentPage} dari ${totalPages}`;
            document.getElementById("prevPage").disabled = currentPage === 1;
            document.getElementById("nextPage").disabled = currentPage === totalPages;
        }

        function changePage(direction) {
            currentPage += direction;
            renderTable();
        }

        function openModal(schoolNo) {
            const s = filteredData.find(item => item.no === schoolNo) || baseSchools.find(item => item.no === schoolNo);
            if (!s) return;
            activeModalSchool = s;

            document.getElementById("modalSchoolName").textContent = s.name;
            document.getElementById("modalSchoolSub").textContent = `NPSN: ${s.npsn || '-'} | Alamat: ${s.alamat || '-'} | ${s.status || 'NEGERI'} | Kec. ${s.kecamatan}`;
            document.getElementById("modalSaldoAwal").textContent = formatRupiah(s.saldoAwal);
            document.getElementById("modalPendapatan").textContent = formatRupiah(s.totalPendapatan);
            document.getElementById("modalBelanja").textContent = formatRupiah(s.totalBelanja);
            document.getElementById("modalKasSeharusnya").textContent = formatRupiah(s.kasSeharusnya);
            
            let pLabel = periodLabel(true);
            document.getElementById("modalMonthName").textContent = pLabel;

            let badgeColor = "bg-slate-100 text-slate-700";
            if (s.verifStatus === "Diajukan Sekolah") badgeColor = "bg-amber-100 text-amber-800";
            else if (s.verifStatus === "Diverifikasi Dinas") badgeColor = "bg-blue-100 text-blue-800";
            else if (s.verifStatus === "Disahkan BUD") badgeColor = "bg-emerald-100 text-emerald-800";

            const badge = document.getElementById("modalVerifStatusBadge");
            badge.className = `px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${badgeColor}`;
            badge.textContent = s.verifStatus;

            const adminVerifCtrl = document.getElementById("adminVerificationControls");
            const cetakSP2BBtn = document.getElementById("detailCetakSP2BBtn");
            if (currentUser && currentUser.role === "Admin Dinas") {
                if (adminVerifCtrl) adminVerifCtrl.classList.remove("hidden");
                if (cetakSP2BBtn) cetakSP2BBtn.classList.remove("hidden");
            } else {
                if (adminVerifCtrl) adminVerifCtrl.classList.add("hidden");
                if (cetakSP2BBtn) cetakSP2BBtn.classList.add("hidden");
            }

            const p = s.pendapatanDetail || {};
            const b = s.belanjaDetail || {};
            const tbody = document.getElementById("modalComponentList");
            tbody.innerHTML = `
                <tr><td class="p-2 font-medium text-emerald-800" colspan="2"><b>PENDAPATAN:</b></td></tr>
                <tr><td class="p-2 pl-4">Reguler</td><td class="p-2 text-right font-mono">${formatRupiah(p.reguler || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Kinerja</td><td class="p-2 text-right font-mono">${formatRupiah(p.kinerja || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Jagir Masuk (Jasa Giro)</td><td class="p-2 text-right font-mono">${formatRupiah(p.jagirMasuk || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Setoran Tunai</td><td class="p-2 text-right font-mono">${formatRupiah(p.setoranTunai || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Lebih Transfer / Kesalahan Setor (Masuk)</td><td class="p-2 text-right font-mono">${formatRupiah(p.lebihTransferMasuk || 0)}</td></tr>
                <tr><td class="p-2 font-medium text-rose-800" colspan="2"><b>BELANJA & PENGELUARAN:</b></td></tr>
                <tr><td class="p-2 pl-4">Pegawai (Honor)</td><td class="p-2 text-right font-mono">${formatRupiah(b.pegawai || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Barang & Jasa Reguler</td><td class="p-2 text-right font-mono">${formatRupiah(b.barjasReg || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Barang & Jasa Kinerja</td><td class="p-2 text-right font-mono">${formatRupiah(b.barjasKin || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Peralatan Mesin (PM)</td><td class="p-2 text-right font-mono">${formatRupiah(b.pm || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Peralatan Mesin Kinerja</td><td class="p-2 text-right font-mono">${formatRupiah(b.pmKin || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Aset Tetap Lainnya (ATL)</td><td class="p-2 text-right font-mono">${formatRupiah(b.atl || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Aset Tetap Lainnya Kinerja</td><td class="p-2 text-right font-mono">${formatRupiah(b.atlKin || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Jagir Keluar (Setor Jagir)</td><td class="p-2 text-right font-mono">${formatRupiah(b.jagirKeluar || 0)}</td></tr>
                <tr><td class="p-2 pl-4">Lebih Transfer / Kesalahan Setor (Keluar)</td><td class="p-2 text-right font-mono">${formatRupiah(b.lebihTransferKeluar || 0)}</td></tr>
            `;

            renderDocChecklist(s.no, s.documents || {});

            const lockEl = document.getElementById("modalLockNotice");
            if (lockEl) {
                const lockedMs = getPeriodMonths().filter(m => isMonthLocked(s.no, m));
                if (lockedMs.length) {
                    const names = lockedMs.map(m => monthNames[months.indexOf(m)]).join(", ");
                    lockEl.innerHTML = `<i class="fa-solid fa-lock mr-1"></i><b>Input sekolah terkunci</b> untuk bulan: ${names}. Bulan ini sudah diverifikasi Dinas, sehingga operator sekolah tidak dapat lagi menginput atau mengunggah berkas.` + (currentUser && currentUser.role === "Admin Dinas" ? ` Untuk membuka kunci, ubah status menjadi <b>Draft</b>.` : "");
                    lockEl.classList.remove("hidden");
                } else {
                    lockEl.classList.add("hidden");
                }
            }

            document.getElementById("detailModal").classList.remove("hidden");
        }

        const DOC_LABELS = [
            { key: 'rekeningKoran', label: '1. Rekening Koran' },
            { key: 'bku', label: '2. BKU (Buku Kas Umum)' },
            { key: 'rekapanBelanja', label: '3. Rekapan Belanja' },
            { key: 'lra', label: '4. Laporan Realisasi Anggaran (LRA)' },
            { key: 'bukuPajak', label: '5. Buku Pajak dan Lampiran' },
            { key: 'sptjm', label: '6. SPTJM' }
        ];

        function escHtml(v) {
            return String(v === undefined || v === null ? "" : v)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        function countDocsNeedFix(docs) {
            return Object.values(docs || {}).filter(d => d && d.needsFix).length;
        }

        function renderDocChecklist(schoolNo, docs) {
            const container = document.getElementById("adminDocChecklistContainer");
            container.innerHTML = "";

            const isAdmin = currentUser && currentUser.role === "Admin Dinas";
            const fixCount = countDocsNeedFix(docs);

            if (fixCount > 0) {
                const banner = document.createElement("div");
                banner.className = "bg-rose-50 border border-rose-300 text-rose-800 rounded-lg px-3 py-2 font-semibold flex items-center";
                banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i> ${fixCount} dokumen perlu perbaikan` +
                    (isAdmin ? "" : " — mohon unggah ulang sesuai keterangan Dinas.");
                container.appendChild(banner);
            }

            DOC_LABELS.forEach(item => {
                const docObj = docs[item.key] || { url: "", checked: false };
                const hasFile = docObj.url && docObj.url !== "";
                const needsFix = !!docObj.needsFix;
                const safeUrl = escHtml(docObj.url);

                const row = document.createElement("div");
                row.className = "bg-white p-2.5 rounded-lg border shadow-sm " + (needsFix ? "border-rose-300" : "border-indigo-100");

                let linkHtml = hasFile ?
                    `<a href="${safeUrl}" target="_blank" rel="noopener" class="text-indigo-600 hover:underline font-semibold flex items-center"><i class="fa-solid fa-file-pdf mr-1 text-rose-600"></i> Lihat PDF di Drive</a>` :
                    `<span class="text-slate-400 italic">Belum diunggah</span>`;

                let badgeHtml = "";
                if (needsFix && docObj.reuploaded) {
                    badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">Sudah diunggah ulang</span>`;
                } else if (needsFix) {
                    badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">Perlu perbaikan</span>`;
                }

                let controlsHtml = '';
                let noteHtml = '';
                if (isAdmin) {
                    controlsHtml = `
                        <div class="flex items-center space-x-4">
                            <label class="flex items-center space-x-1.5 cursor-pointer font-semibold text-emerald-700">
                                <input type="checkbox" ${docObj.checked ? 'checked' : ''} onchange="updateDocCheckbox(${schoolNo}, '${item.key}', this.checked)" class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500">
                                <span>Sesuai</span>
                            </label>
                            <label class="flex items-center space-x-1.5 cursor-pointer font-semibold text-rose-700">
                                <input type="checkbox" ${needsFix ? 'checked' : ''} onchange="updateDocNeedsFix(${schoolNo}, '${item.key}', this.checked)" class="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500">
                                <span>Perlu perbaikan</span>
                            </label>
                        </div>
                    `;
                    if (needsFix) {
                        noteHtml = `
                            <div class="mt-2">
                                <label class="block text-[10px] font-semibold text-rose-700 mb-1">Keterangan perbaikan (akan dilihat operator sekolah)</label>
                                <textarea id="docNote_${item.key}" rows="2" maxlength="500" placeholder="Contoh: Saldo akhir di Rekening Koran tidak sama dengan BKU, mohon unggah ulang halaman yang benar."
                                    onchange="updateDocNote(${schoolNo}, '${item.key}', this.value)"
                                    class="w-full px-2 py-1.5 border border-rose-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-400 bg-rose-50/40">${escHtml(docObj.note)}</textarea>
                            </div>
                        `;
                    }
                } else {
                    if (needsFix) {
                        controlsHtml = `<span class="text-rose-700 font-semibold"><i class="fa-solid fa-circle-exclamation mr-1"></i> Perlu perbaikan</span>`;
                        noteHtml = `
                            <div class="mt-2 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-rose-800">
                                <b>Keterangan Dinas:</b> ${docObj.note ? escHtml(docObj.note) : '<i>(tidak ada keterangan)</i>'}
                            </div>
                        `;
                    } else if (docObj.checked) {
                        controlsHtml = `<span class="text-emerald-700 font-semibold"><i class="fa-solid fa-check-circle mr-1"></i> Sesuai (Diverifikasi)</span>`;
                    } else {
                        controlsHtml = `<span class="text-slate-400">Belum diperiksa</span>`;
                    }
                }

                row.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-3 flex-wrap gap-y-1">
                            <span class="font-medium text-slate-800">${item.label}</span>
                            <span>${linkHtml}</span>
                            ${badgeHtml}
                        </div>
                        <div>${controlsHtml}</div>
                    </div>
                    ${noteHtml}
                `;
                container.appendChild(row);
            });
        }

        function getDocObj(schoolNo, docKey) {
            if (!monthlyData[schoolNo] || !monthlyData[schoolNo][refMonth()]) return null;
            const m = monthlyData[schoolNo][refMonth()];
            if (!m.documents) m.documents = {};
            if (!m.documents[docKey]) m.documents[docKey] = { url: "", checked: false };
            return m.documents[docKey];
        }

        function afterDocChange(schoolNo) {
            saveToLocalStorage(schoolNo);
            renderDocChecklist(schoolNo, monthlyData[schoolNo][refMonth()].documents || {});
            updateActiveMonthData();
        }

        function updateDocCheckbox(schoolNo, docKey, isChecked) {
            const d = getDocObj(schoolNo, docKey);
            if (!d) return;
            d.checked = isChecked;
            waQueueDoc(schoolNo, docKey);
            if (isChecked) {
                d.needsFix = false;
                d.reuploaded = false;
                d.note = "";
            }
            afterDocChange(schoolNo);
        }

        function updateDocNeedsFix(schoolNo, docKey, needsFix) {
            const d = getDocObj(schoolNo, docKey);
            if (!d) return;
            d.needsFix = needsFix;
            waQueueDoc(schoolNo, docKey);
            if (needsFix) {
                d.checked = false;
                d.fixRequestedAt = new Date().toISOString();
            } else {
                d.reuploaded = false;
                d.note = "";
            }
            afterDocChange(schoolNo);
            if (needsFix) setTimeout(() => { const t = document.getElementById("docNote_" + docKey); if (t) t.focus(); }, 0);
        }

        function updateDocNote(schoolNo, docKey, value) {
            const d = getDocObj(schoolNo, docKey);
            if (!d) return;
            d.note = String(value || "").trim();
            waQueueDoc(schoolNo, docKey);
            saveToLocalStorage(schoolNo);
        }

        function updateVerificationStatus(newStatus) {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Hanya Administrator Dinas yang dapat mengubah status verifikasi.");
                return;
            }
            if (!activeModalSchool) return;
            const no = activeModalSchool.no;
            const pMonths = getPeriodMonths();
            const willLock = LOCKED_STATUSES.indexOf(newStatus) !== -1;
            if (willLock) {
                const curDocs = monthlyData[no]?.[refMonth()]?.documents || {};
                const n = countDocsNeedFix(curDocs);
                if (n > 0 && !confirm(`Masih ada ${n} dokumen yang ditandai "Perlu perbaikan". Tetap ubah status menjadi "${newStatus}"?`)) return;
                const txt = pMonths.length > 1 ? `${pMonths.length} bulan pada periode ${periodLabel()}` : `bulan ${monthNames[months.indexOf(pMonths[0])]}`;
                if (!confirm(`Setelah "${newStatus}", sekolah TIDAK DAPAT lagi menginput/mengunggah data untuk ${txt}. Lanjutkan?`)) return;
            }
            if (!monthlyData[no]) monthlyData[no] = {};
            pMonths.forEach(m => {
                if (!monthlyData[no][m]) {
                    monthlyData[no][m] = {
                        pendapatan: { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 },
                        belanja: { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 },
                        documents: {}, verifStatus: newStatus
                    };
                }
                monthlyData[no][m].verifStatus = newStatus;
                if (willLock) { monthlyData[no][m].verifiedAt = new Date().toISOString(); monthlyData[no][m].verifiedBy = (currentUser && currentUser.username) || ""; }
                else { delete monthlyData[no][m].verifiedAt; delete monthlyData[no][m].verifiedBy; }
            });
            saveToLocalStorage(no);
            updateActiveMonthData();
            waEnqueue(no, "status", () => `Status verifikasi: *${newStatus}*` + (willLock ? " (input data sekolah untuk periode ini dikunci)" : ""));
            openModal(no);
            alert(`Status verifikasi berhasil diubah menjadi: ${newStatus} & disinkronkan!` + (willLock ? "\nInput sekolah untuk periode ini sekarang terkunci." : "\nKunci input sekolah untuk periode ini dibuka."));
        }

        // =====================================================================
        // VERIFIKASI DINAS & PENGESAHAN BUD KOLEKTIF
        // Sekolah yang MASIH ADA SELISIH (SP2B − RC Bank ≠ 0) otomatis dikecualikan.
        // =====================================================================
        const BULK_CFG = {
            dinas: { status: "Diverifikasi Dinas", title: "Verifikasi Dinas Kolektif", icon: "fa-clipboard-check", btn: "bg-blue-600 hover:bg-blue-700", from: ["Draft", "Diajukan Sekolah"], checkSelisih: true },
            bud:   { status: "Disahkan BUD",       title: "Pengesahan BUD Kolektif",   icon: "fa-stamp",           btn: "bg-emerald-600 hover:bg-emerald-700", from: ["Diverifikasi Dinas"], checkSelisih: true },
            draft: { status: "Draft",              title: "Jadikan Draft Kolektif",    icon: "fa-unlock",         btn: "bg-amber-600 hover:bg-amber-700", from: ["Diajukan Sekolah", "Diverifikasi Dinas", "Disahkan BUD"], checkSelisih: false }
        };
        let bulkState = { mode: null, eligible: [], excluded: [] };

        // Evaluasi tiap sekolah pada periode & filter yang sedang tampil
        function bulkEvaluate(mode) {
            const cfg = BULK_CFG[mode];
            const rolled = computeRolledData();
            const rm = refMonth();
            const eligible = [], excluded = [];
            filteredData.forEach(sc => {
                const d = buildDetailRow(sc, rolled);
                const selisih = d.selisih || 0;
                const rcVal = monthlyData[sc.no] && monthlyData[sc.no][rm] && monthlyData[sc.no][rm].rekon ? monthlyData[sc.no][rm].rekon.saldoRCBank : undefined;
                const rcFilled = !(rcVal === undefined || rcVal === null || rcVal === "");
                const item = { no: sc.no, name: sc.name, kecamatan: sc.kecamatan, status: sc.verifStatus, selisih: selisih, nFix: countDocsNeedFix(sc.documents) };
                // Mode draft: tidak cek selisih — Admin ingin membuka kunci sekolah yang sudah diverifikasi/disahkan
                if (cfg.checkSelisih && Math.abs(selisih) >= 1) {
                    item.reason = rcFilled ? "Masih ada selisih" : "Saldo RC Bank belum diisi";
                    item.kind = "selisih";
                    excluded.push(item);
                } else if (cfg.from.indexOf(sc.verifStatus) === -1) {
                    item.kind = "status";
                    if (mode === "draft") {
                        if (sc.verifStatus === "Draft") item.reason = "Sudah berstatus Draft";
                        else item.reason = "Status tidak dapat dijadikan Draft";
                    } else if (sc.verifStatus === "Disahkan BUD") item.reason = "Sudah disahkan BUD";
                    else if (sc.verifStatus === "Diverifikasi Dinas" && mode === "dinas") item.reason = "Sudah diverifikasi Dinas";
                    else item.reason = "Belum diverifikasi Dinas";
                    excluded.push(item);
                } else {
                    eligible.push(item);
                }
            });
            return { eligible: eligible, excluded: excluded };
        }

        function openBulkVerifModal(mode) {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Hanya Administrator Dinas."); return; }
            const cfg = BULK_CFG[mode]; if (!cfg) return;
            if (!filteredData.length) { alert("Tidak ada sekolah pada tampilan saat ini."); return; }
            const res = bulkEvaluate(mode);
            bulkState = { mode: mode, eligible: res.eligible, excluded: res.excluded };

            document.getElementById("bulkTitle").textContent = cfg.title;
            document.getElementById("bulkIcon").className = "fa-solid " + cfg.icon + " mr-2";
            const apply = document.getElementById("bulkApplyBtn");
            apply.className = cfg.btn + " disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center space-x-1.5";

            const pm = getPeriodMonths();
            const lockTxt = pm.length > 1 ? pm.length + " bulan pada periode " + periodLabel() : "bulan " + monthNames[months.indexOf(pm[0])];
            let infoExtra = "";
            if (mode === "draft") {
                infoExtra =
                    'Hanya sekolah berstatus <b>Diajukan Sekolah / Diverifikasi Dinas / Disahkan BUD</b> yang dapat dikembalikan ke Draft.<br>' +
                    'Setelah diproses, <b>kunci input dibuka</b> — operator dapat mengedit & mengunggah ulang berkas untuk ' + lockTxt + '.';
            } else if (mode === "bud") {
                infoExtra =
                    'Hanya sekolah berstatus <b>Diverifikasi Dinas</b> dan <b>tanpa selisih</b> yang disahkan.<br>' +
                    'Sekolah yang <b>masih ada selisih</b> (SP2B − RC Bank) otomatis <b>dikecualikan</b>. Setelah diproses, input sekolah untuk ' + lockTxt + ' terkunci.';
            } else {
                infoExtra =
                    'Hanya sekolah berstatus <b>Draft / Diajukan Sekolah</b> dan <b>tanpa selisih</b> yang diverifikasi.<br>' +
                    'Sekolah yang <b>masih ada selisih</b> (SP2B − RC Bank) otomatis <b>dikecualikan</b>. Setelah diproses, input sekolah untuk ' + lockTxt + ' terkunci.';
            }
            document.getElementById("bulkInfo").innerHTML =
                '<b>Periode: ' + escHtml(periodLabel()) + ' ' + activeYear + '</b> &middot; status akan diubah menjadi <b>' + cfg.status + '</b>.<br>' +
                infoExtra +
                (filteredData.length < baseSchools.length ? '<br><i class="fa-solid fa-filter mr-1"></i>Hanya mencakup sekolah sesuai filter yang sedang aktif (' + filteredData.length + ' dari ' + baseSchools.length + ').' : '');

            const nSel = res.excluded.filter(x => x.kind === "selisih").length;
            const tile = (label, val, cls) => '<div class="rounded-lg border px-3 py-2 ' + cls + '"><div class="text-[10px] uppercase font-bold tracking-wider opacity-80">' + label + '</div><div class="text-lg font-extrabold">' + val + '</div></div>';
            if (mode === "draft") {
                document.getElementById("bulkSummary").innerHTML =
                    tile("Akan dibuka (Draft)", res.eligible.length, "bg-amber-50 border-amber-200 text-amber-800") +
                    tile("Dikecualikan (status)", res.excluded.length, "bg-slate-50 border-slate-200 text-slate-700");
            } else {
                document.getElementById("bulkSummary").innerHTML =
                    tile("Akan diproses", res.eligible.length, "bg-emerald-50 border-emerald-200 text-emerald-800") +
                    tile("Ada selisih / RC kosong", nSel, "bg-rose-50 border-rose-200 text-rose-800") +
                    tile("Dikecualikan (status)", res.excluded.length - nSel, "bg-slate-50 border-slate-200 text-slate-700");
            }

            document.getElementById("bulkEligibleBody").innerHTML = res.eligible.length
                ? res.eligible.map(x => '<tr class="border-b border-slate-100 hover:bg-slate-50">' +
                    '<td class="py-1.5 px-3 w-8"><input type="checkbox" class="bulk-chk w-4 h-4 rounded border-slate-300" data-no="' + x.no + '" checked onchange="bulkUpdateCount()"></td>' +
                    '<td class="py-1.5 px-1 font-semibold text-slate-800">' + escHtml(x.name) + '<div class="font-normal text-[10px] text-slate-500">' + escHtml(x.kecamatan || "") + '</div></td>' +
                    '<td class="py-1.5 px-3 text-right whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ' + statusBadgeCls(x.status) + '">' + x.status + '</span>' +
                    (x.nFix > 0 ? '<div class="mt-0.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800" title="Ada dokumen berstatus perlu perbaikan"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Dokumen perbaikan (' + x.nFix + ')</span></div>' : '') + '</td></tr>').join("")
                : '<tr><td class="py-6 text-center text-slate-400">Tidak ada sekolah yang memenuhi syarat.</td></tr>';

            document.getElementById("bulkExcludedBody").innerHTML = res.excluded.length
                ? res.excluded.map(x => '<tr class="border-b border-slate-100">' +
                    '<td class="py-1.5 px-3 font-semibold text-slate-800">' + escHtml(x.name) + '<div class="font-normal text-[10px] text-slate-500">' + escHtml(x.kecamatan || "") + '</div></td>' +
                    '<td class="py-1.5 px-3 text-right whitespace-nowrap">' +
                    (x.kind === "selisih"
                        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">' + x.reason + '</span><div class="font-mono text-[10px] text-rose-600 mt-0.5">Selisih ' + formatRupiah(x.selisih) + '</div>'
                        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">' + x.reason + '</span>') +
                    '</td></tr>').join("")
                : '<tr><td class="py-4 text-center text-slate-400">Tidak ada.</td></tr>';

            document.getElementById("bulkCheckAll").checked = res.eligible.length > 0;
            bulkUpdateCount();
            document.getElementById("bulkVerifModal").classList.remove("hidden");
        }

        function closeBulkVerifModal() { document.getElementById("bulkVerifModal").classList.add("hidden"); }

        function bulkSelectedNos() {
            return Array.from(document.querySelectorAll("#bulkEligibleBody .bulk-chk:checked")).map(el => Number(el.getAttribute("data-no")));
        }
        function bulkToggleAll(on) {
            document.querySelectorAll("#bulkEligibleBody .bulk-chk").forEach(el => { el.checked = on; });
            bulkUpdateCount();
        }
        function bulkUpdateCount() {
            const n = bulkSelectedNos().length, total = bulkState.eligible.length;
            const mode = bulkState.mode;
            let label = "Verifikasi ";
            if (mode === "bud") label = "Sahkan ";
            else if (mode === "draft") label = "Jadikan Draft ";
            document.getElementById("bulkApplyText").textContent = label + n + " Sekolah";
            document.getElementById("bulkApplyBtn").disabled = n === 0;
            const all = document.getElementById("bulkCheckAll"); if (all) all.checked = total > 0 && n === total;
        }

        async function applyBulkVerif() {
            if (!currentUser || currentUser.role !== "Admin Dinas") { alert("Akses ditolak! Hanya Administrator Dinas."); return; }
            const mode = bulkState.mode, cfg = BULK_CFG[mode]; if (!cfg) return;
            const picked = bulkSelectedNos();
            if (!picked.length) return;

            // Evaluasi ulang saat eksekusi: data bisa berubah sejak modal dibuka.
            const fresh = bulkEvaluate(mode);
            const okSet = new Set(fresh.eligible.map(x => x.no));
            const list = picked.filter(no => okSet.has(no));
            const dropped = picked.length - list.length;
            if (!list.length) { alert("Tidak ada sekolah yang memenuhi syarat saat ini (data berubah). Silakan buka ulang."); closeBulkVerifModal(); return; }

            const pMonths = getPeriodMonths();
            const nFixTotal = fresh.eligible.filter(x => list.indexOf(x.no) !== -1 && x.nFix > 0).length;
            let msg;
            if (mode === "draft") {
                msg = `${cfg.title}\n\n${list.length} sekolah akan dikembalikan ke status "Draft" untuk periode ${periodLabel()} ${activeYear}.` +
                    `\nKunci input akan DIBUKA — operator dapat mengedit data & unggah ulang berkas.\n\nLanjutkan?`;
            } else {
                msg = `${cfg.title}\n\n${list.length} sekolah akan berstatus "${cfg.status}" untuk periode ${periodLabel()} ${activeYear}.` +
                    (nFixTotal ? `\n⚠ ${nFixTotal} sekolah masih punya dokumen "Perlu perbaikan".` : "") +
                    `\nInput sekolah pada periode ini akan TERKUNCI.\n\nLanjutkan?`;
            }
            if (!confirm(msg)) return;

            const nowIso = new Date().toISOString(), by = (currentUser && currentUser.username) || "";
            const notify = document.getElementById("bulkNotifyWA").checked;
            list.forEach(no => {
                if (!monthlyData[no]) monthlyData[no] = {};
                pMonths.forEach(m => {
                    if (!monthlyData[no][m]) {
                        monthlyData[no][m] = {
                            pendapatan: { reguler: 0, kinerja: 0, jagirMasuk: 0, setoranTunai: 0, lebihTransferMasuk: 0 },
                            belanja: { pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, jagirKeluar: 0, lebihTransferKeluar: 0 },
                            documents: {}, verifStatus: cfg.status
                        };
                    }
                    monthlyData[no][m].verifStatus = cfg.status;
                    if (mode === "draft") {
                        // Buka kunci: hapus jejak verifikasi sebelumnya
                        monthlyData[no][m].verifiedAt = null;
                        monthlyData[no][m].verifiedBy = null;
                        monthlyData[no][m].verifiedBulk = false;
                        monthlyData[no][m].reopenedAt = nowIso;
                        monthlyData[no][m].reopenedBy = by;
                    } else {
                        monthlyData[no][m].verifiedAt = nowIso;
                        monthlyData[no][m].verifiedBy = by;
                        monthlyData[no][m].verifiedBulk = true;
                    }
                });
                if (notify) {
                    if (mode === "draft") {
                        waEnqueue(no, "status", () => `Status dikembalikan ke *Draft* oleh Admin Dinas. Input data sekolah untuk periode ini *dibuka kembali* — silakan perbaiki/unggah ulang bila perlu.`);
                    } else {
                        waEnqueue(no, "status", () => `Status verifikasi: *${cfg.status}* (input data sekolah untuk periode ini dikunci)`);
                    }
                }
            });

            const btn = document.getElementById("bulkApplyBtn");
            btn.disabled = true; document.getElementById("bulkApplyText").textContent = "Menyimpan...";
            try { await saveToLocalStorage(list); } catch (e) { console.error(e); }

            const pg = currentPage;
            updateActiveMonthData();
            currentPage = pg;
            renderTable();
            closeBulkVerifModal();
            if (mode === "draft") {
                alert(`${cfg.title} selesai.\n- ${list.length} sekolah berhasil dikembalikan ke "Draft" (kunci dibuka)` +
                    `\n- ${fresh.excluded.length + dropped} sekolah dilewati (sudah Draft / status tidak sesuai)`);
            } else {
                alert(`${cfg.title} selesai.\n- ${list.length} sekolah berhasil menjadi "${cfg.status}"` +
                    `\n- ${fresh.excluded.length + dropped} sekolah dilewati (ada selisih / status tidak sesuai)`);
            }
        }

        function closeModal() {
            document.getElementById("detailModal").classList.add("hidden");
        }

        function openSP2BModalFromDetail() {
            if (activeModalSchool) {
                closeModal();
                openSP2BModalDirect(activeModalSchool.no);
            }
        }

        function openSP2BModalDirect(schoolNo) {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Cetak SP2B khusus untuk Admin Dinas.");
                return;
            }
            const s = baseSchools.find(item => item.no === schoolNo);
            if (!s) return;
            // Data diambil dari hasil agregasi periode aktif (bulan / triwulan / semester / tahun)
            const agg = filteredData.find(x => x.no === s.no);
            const mData = agg ? { saldoAwal: agg.saldoAwal, totalPendapatan: agg.totalPendapatan, totalBelanja: agg.totalBelanja, kasSeharusnya: agg.kasSeharusnya, belanjaDetail: agg.belanjaDetail || {} }
                              : { saldoAwal: 0, totalPendapatan: 0, totalBelanja: 0, kasSeharusnya: 0, belanjaDetail: {} };

            const mIndex = months.indexOf(currentMonth);
            document.getElementById("sp2bSchoolName").textContent = s.name;
            document.getElementById("sp2bKecamatan").textContent = s.kecamatan;
            if (window.Pejabat) Pejabat.fillSp2b(s);
            let pLabel = periodLabel();
            document.getElementById("sp2bMonthTitle").textContent = pLabel;
            document.getElementById("sp2bNomorDoc").textContent = `00${s.no}/SP2B-BOSP/${periodCode()}/${activeYear}`;
            const thEl = document.getElementById("sp2bTahunAnggaran");
            if (thEl) thEl.textContent = activeYear;
            
            document.getElementById("sp2bValSaldoAwal").textContent = formatRupiah(mData.saldoAwal);
            document.getElementById("sp2bValPendapatan").textContent = formatRupiah(mData.totalPendapatan);
            
            const totalPegawai = mData.belanjaDetail.pegawai || 0;
            const totalOperasional = (mData.belanjaDetail.barjasReg || 0) + (mData.belanjaDetail.barjasKin || 0);
            const totalModal = (mData.belanjaDetail.pm || 0) + (mData.belanjaDetail.pmKin || 0) + (mData.belanjaDetail.atl || 0) + (mData.belanjaDetail.atlKin || 0);

            document.getElementById("sp2bValPegawai").textContent = formatRupiah(totalPegawai);
            document.getElementById("sp2bValBarjas").textContent = formatRupiah(totalOperasional);
            document.getElementById("sp2bValModal").textContent = formatRupiah(totalModal);
            document.getElementById("sp2bValKas").textContent = formatRupiah(mData.kasSeharusnya);

            const tbody = document.getElementById("sp2bTableRekening");
            const rekCfg = (typeof loadSp2bRekeningConfig === "function") ? loadSp2bRekeningConfig() : [
                { kode: "5.2.1.06.01", uraian: "Belanja Pegawai", key: "pegawai" },
                { kode: "5.2.2.22.01", uraian: "Belanja Barang dan Jasa", key: "barjas" },
                { kode: "5.2.3.37.13", uraian: "Belanja Modal Peralatan Mesin", key: "pm" },
                { kode: "5.2.3.82.01", uraian: "Belanja Modal Aset Tetap Lainnya", key: "atl" }
            ];
            const pmVal = (mData.belanjaDetail.pm || 0) + (mData.belanjaDetail.pmKin || 0);
            const atlVal = (mData.belanjaDetail.atl || 0) + (mData.belanjaDetail.atlKin || 0);
            const amountByKey = {
                pegawai: totalPegawai,
                barjas: totalOperasional,
                pm: pmVal,
                atl: atlVal
            };
            let rekRows = "";
            rekCfg.forEach((r, i) => {
                const key = r.key || ("r" + i);
                const amt = amountByKey[key] != null ? amountByKey[key] : 0;
                rekRows += `<tr data-rek="${key}">
                    <td class="border border-slate-800 p-1.5 text-center font-mono" contenteditable="true" data-field="kode" title="Klik untuk mengedit kode rekening">${r.kode}</td>
                    <td class="border border-slate-800 p-1.5" contenteditable="true" data-field="uraian" title="Klik untuk mengedit uraian">${r.uraian}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(amt)}</td>
                </tr>`;
            });
            tbody.innerHTML = rekRows + `
                <tr class="bg-slate-100 font-bold">
                    <td class="border border-slate-800 p-1.5 text-center" colspan="2">JUMLAH BELANJA</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(mData.totalBelanja)}</td>
                </tr>
            `;
            // simpan otomatis saat selesai mengedit
            tbody.querySelectorAll('[contenteditable="true"]').forEach(el => {
                el.addEventListener("blur", function() {
                    if (typeof readEditableRekeningFromDom === "function") readEditableRekeningFromDom();
                });
            });

            document.getElementById("sp2bModal").classList.remove("hidden");
        }

        function closeSP2BModal() {
            document.getElementById("sp2bModal").classList.add("hidden");
        }

        function openSchoolDashboardModal() {
            let pLabel = periodLabel();
            document.getElementById("dashMonthTitle").textContent = pLabel;
            const dashYearEl = document.getElementById("dashYearTitle");
            if (dashYearEl) dashYearEl.textContent = activeYear;
            const rolled = computeRolledData();
            const tbody = document.getElementById("schoolDashboardTableBody");
            tbody.innerHTML = "";

            let sumSA = 0, sumPend = 0, sumBel = 0, sumKas = 0;

            baseSchools.forEach((s, idx) => {
                const data = filteredData.find(x => x.no === s.no) || { saldoAwal: 0, totalPendapatan: 0, totalBelanja: 0, kasSeharusnya: 0 };
                sumSA += data.saldoAwal;
                sumPend += data.totalPendapatan;
                sumBel += data.totalBelanja;
                sumKas += data.kasSeharusnya;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="border border-slate-800 p-1.5 text-center">${idx + 1}</td>
                    <td class="border border-slate-800 p-1.5 font-semibold">${s.name}</td>
                    <td class="border border-slate-800 p-1.5 text-center">${s.kecamatan}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(data.saldoAwal)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono text-emerald-700 font-semibold">${formatRupiah(data.totalPendapatan)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono text-rose-700 font-semibold">${formatRupiah(data.totalBelanja)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono font-bold">${formatRupiah(data.kasSeharusnya)}</td>
                `;
                tbody.appendChild(tr);
            });

            const trSum = document.createElement("tr");
            trSum.className = "bg-slate-100 font-bold";
            trSum.innerHTML = `
                <td class="border border-slate-800 p-2 text-center" colspan="3">TOTAL KABUPATEN</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumSA)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono text-emerald-800">${formatRupiah(sumPend)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono text-rose-800">${formatRupiah(sumBel)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumKas)}</td>
            `;
            tbody.appendChild(trSum);

            if (window.Pejabat) Pejabat.decorateDashboard();
            document.getElementById("schoolDashboardModal").classList.remove("hidden");
        }

        function closeSchoolDashboardModal() {
            document.getElementById("schoolDashboardModal").classList.add("hidden");
        }

        function openKecamatanModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Fitur rekapitulasi kecamatan khusus untuk Admin Dinas.");
                return;
            }
            renderKecamatanTable();
            document.getElementById("kecamatanModal").classList.remove("hidden");
        }

        function closeKecamatanModal() {
            document.getElementById("kecamatanModal").classList.add("hidden");
        }

        function renderKecamatanTable() {
            const selectedKec = document.getElementById("selectKecamatanTarget").value || "RATAHAN";
            document.getElementById("printKecName").textContent = selectedKec;
            let pLabel = periodLabel();
            document.getElementById("printKecMonthName").textContent = pLabel;
            const kecYearEl = document.getElementById("printKecYear");
            if (kecYearEl) kecYearEl.textContent = activeYear;

            const kecSchools = filteredData.filter(s => s.kecamatan === selectedKec);
            const tbody = document.getElementById("kecamatanTableBody");
            tbody.innerHTML = "";

            let sumSA = 0, sumPend = 0, sumBel = 0, sumKas = 0;

            kecSchools.forEach((s, idx) => {
                sumSA += s.saldoAwal;
                sumPend += s.totalPendapatan;
                sumBel += s.totalBelanja;
                sumKas += s.kasSeharusnya;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="border border-slate-800 p-1.5 text-center">${idx + 1}</td>
                    <td class="border border-slate-800 p-1.5 font-semibold">${s.name}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(s.saldoAwal)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(s.totalPendapatan)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(s.totalBelanja)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono font-bold">${formatRupiah(s.kasSeharusnya)}</td>
                    <td class="border border-slate-800 p-1.5 text-center font-semibold text-[10px]">${s.verifStatus}</td>
                `;
                tbody.appendChild(tr);
            });

            const trSum = document.createElement("tr");
            trSum.className = "bg-slate-100 font-bold";
            trSum.innerHTML = `
                <td class="border border-slate-800 p-2 text-center" colspan="2">TOTAL KECAMATAN ${selectedKec}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumSA)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumPend)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumBel)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumKas)}</td>
                <td class="border border-slate-800 p-2 text-center">-</td>
            `;
            tbody.appendChild(trSum);
        }

        function openAnnualSP2BModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Rekapitulasi SP2B 1 Tahun penuh khusus untuk Admin Dinas.");
                return;
            }
            ["annualYearTitle", "annualYearBody", "annualYearNote", "annualNomorYear"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = activeYear;
            });
            const rolled = computeRolledData();
            const tbody = document.getElementById("annualTableBody");
            tbody.innerHTML = "";

            let sumSA = 0, sumPend = 0, sumBel = 0, sumKas = 0;

            baseSchools.forEach((s, idx) => {
                const saJan = rolled[s.no] && rolled[s.no]["Jan"] ? rolled[s.no]["Jan"].saldoAwal : 0;
                let totPend = 0;
                let totBel = 0;
                months.forEach(m => {
                    if (rolled[s.no] && rolled[s.no][m]) {
                        totPend += rolled[s.no][m].totalPendapatan;
                        totBel += rolled[s.no][m].totalBelanja;
                    }
                });
                const kasDes = rolled[s.no] && rolled[s.no]["Des"] ? rolled[s.no]["Des"].kasSeharusnya : 0;

                sumSA += saJan;
                sumPend += totPend;
                sumBel += totBel;
                sumKas += kasDes;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td class="border border-slate-800 p-1.5 text-center">${idx + 1}</td>
                    <td class="border border-slate-800 p-1.5 font-semibold">${s.name}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(saJan)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(totPend)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono">${formatRupiah(totBel)}</td>
                    <td class="border border-slate-800 p-1.5 text-right font-mono font-bold">${formatRupiah(kasDes)}</td>
                `;
                tbody.appendChild(tr);
            });

            const trSum = document.createElement("tr");
            trSum.className = "bg-slate-100 font-bold";
            trSum.innerHTML = `
                <td class="border border-slate-800 p-2 text-center" colspan="2">TOTAL KABUPATEN</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumSA)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumPend)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumBel)}</td>
                <td class="border border-slate-800 p-2 text-right font-mono">${formatRupiah(sumKas)}</td>
            `;
            tbody.appendChild(trSum);

            document.getElementById("sp2bAnnualModal").classList.remove("hidden");
        }

        // =====================================================================
        // CETAK SP2B KABUPATEN (AKUMULASI SELURUH SEKOLAH) - Bulan/Triwulan/Semester/Tahun
        // =====================================================================
        const SP2B_LOGO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAlgCWAAD/4QBaRXhpZgAATU0AKgAAAAgABQMBAAUAAAABAAAASgMDAAEAAAABAAAAAFEQAAEAAAABAQAAAFERAAQAAAABAAAXEVESAAQAAAABAAAXEQAAAAAAAYagAACxj//bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAI4AZwMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AOo8Q3lra3mtanqly8VtDqkVkiwWsLkb0U7mLLk8k55rDPifw0LjUIvtt+fsLSiRhYW+GEeNxHy9OateLr3RJbnxFoGs3E9sZtSS5Vki3hl8lQP1/lXI2en+FrOVm/4SG4kVoTG4azPzkhQxPPfH61OgzsJ9Y8MwaXcal/a1y9rDcRW4dLGA+YZF3Ar8vQDr9Ku37aJp97LaS6rM00dzb221bO3+czDKEDbyPWuINh4Ike4t5NZv00uS5e5itreAq0ZZNoGfQc/nUix+FnSK4u9aluNVhltmhvTZnciQjAXr34/KjQDqp9S8OwWusT/2tcMNKultZgtjB8zscAg7cbcgjJ44qeW80u2h0drvUL+3k1WcwQxSWUGVI6sflwV9x1riFtPDdnHJ/Zvie9V7iHZerdWnmx3Lb9wyvZck8e9RnTfC89mkd54o1EzQwulqIICsdu7NuOATnYOBijQD0TW4F0TXtP0l21G4kv8Ad5EsVrbbCVGWzlc8DmsmLXdLfRJ9akub+LTYiAZjbWpJy+z7oG4c88ipr3xp4d1DUfDt7PqlwZtIWQSYtj+/Lx7CRzx61yOmxeGrOwuNOuNStpbad1Z5Y9PYTSKJN5VznBBHFGgHa3F3pyzfZ7G8v9Qui7hYLe0t8siAFpASuNvI+tSO9v8Ab1toH1W4RVjNxNHp8GLcyfdVhtyT64HFcXGfDunWjJpGvSxz750Vrm0Z1+zS4/dnnOVwMGnyXWjJbwWVn4nuY7M+Q9yz2rGZpov40YHjI4we1LQDq5tR0aJ/ECJql5K2h7RcbLKDEhJxhPl5wTg00+I9L0/Srm6uNZ1Oy+zXiWk1uLaAlZGGQflGCMckiuQlh8K4nNt4i1BXvVkW/WWAsk29w3yj+HpTp7bwTciSxfVbyHRRPLcW9pb25V43dQuC2eQMH88U9AO+llv9N+J/h/S/7Vlu7O4t5rg70VckI2PugZFFc/4bv4tR8d+Eo4LuS+/s6wmtZrp49m9tjbePpiimgZw/xNdI/iJrzGAzSGddq+3lr37CvO5dZm8whYYFAPQLn9a774po8nxC13lmQ3CjylONx8teSfSvM54mVyxAwTxgcH6e1c0IRc5XPcxGIr08LSVPRW8v6/H5Lreg1W6klCrbxSk/wiPk1pW2qWcreXcW628ucYI4rmgWRgykhgeCO1bNjdw6oPsGqSKryN+6vWGWjb0c9Sp/SqqUINbHNh83xNKV2+Zdmr/8E3/Jh/55J+VHkw/88U/KqGmSTwyS6beKyXMBIw3XFXpC/mQpH95m5GM8V50oSjPlPtaWLw1TDLE2Sj1028g8mH/nkn5Uvkxf88k/KppbeZYmZNhYKcYbPPbHrUMLF4VJ+9jn61LjJK7Kw+KwmIk40rNryGvHbxoXdI1UckkVlS6pC8nlWNkJ2x12n+VSzwya1qLWUUyw2tupkuJ2PyoB1J/kB3NZd9qgk/cafGbSzVdgRT80n+057k/kK7KFC6vI+dzXOHCo6OHSSWl7LfyGnWLkMf3cI9tlT2mqyyTBHtoZc9gMH8Kx6uWkLFwSoYNwAeMn0B7GuidKmo7Hk4bG4qVVe83/AF6P8j1f4TMj/EnT2jjKAwS5UjGDsbqKKT4Pqw+Ien5d3Bt5SC4+YDa3BoqqGlNEZo74qTtbb8kR/ENVk+IPiBGGVa4AI9fkWuYFtCCx2AlgAc9gPSuo+IH/ACUPXv8Ar5H/AKAtLYeGH+xXV7qG6OOKESRovWQkcV5OJqKE5XfU+ywEqUMFSlU7L/L9Tz/UNFURtLbA5HJXNc/0Nd59a5TVbE21yxUHy25BxXbha7l7sjxs9yuFJKvRVl1X6m3PJPqugQ69C+6/04rbXYxyY8fI59e6k/SpbK5ae3TWPIdreGTyrhVOdoIzn8awdC1278P6iLy1CPlSkkUgykiHqrD0rrbPfq8M+oaTYxabbSTbZIjKTEOBkY7nnpWlSCTu1/XY8KliqsabpRlo9bea6leMadYS3d7HBMwu8fZUzna3XjFUdUludGSGB0P2q5iEpRusZbPFdpqOkRR6ZYrZ2MME1sGKzO2FkLHnB+tYN7qD+Fbi3vLvTILzUJrciGS4cuImDHDgd/as48s3tc0hiK2HlzQlZ2/MxtaRtA0ODQ3TbfXBF1ek9QCPkT8Acn3Nc3HG0sixoMsxwBT7q6nvruS5uZWlnlbc7sckmtnRLBlk+0SDG37h9a6JzVKF3uTgsJLGV1TW3X0LVlo8NuA8oDv157Ve+zQ72fy1y2M8cHHSpa02sIZrPzIJB5kce5wT971x6Y9K8mdWUnds+/hQw2GhGCikv1Nz4Vc/Euz/AOveT/0E0UvwoBPxKtfa3k/9BNFerhv4SPhs6/3+p8vyRD4wgW6+KerW7ttWW9RCfQFVrqtRnez0zUZli8qW0jEMUkhyGHYgetc/r8qw/GHUneISqL5QUxnPyLWtq43aDrKLdC82tuCt/wAsR6fWvAzDXEWff9T26etHDxltZfn/AFueakkkk9T1qOaGO4iMUgyp/SpKK6E7bH1MoqS5ZK6MuPwzFdTGOFpDJtL4A6itPSZ5NK0/UtGvGEdqMXML7Nx80YHb27U5XkjdXjkdGHdTisDVLmf7c8zymXkLtYYDdzkDqK6qM51JcsnofJ5tl8KMHOEElfS36/jt1NyHWpJ7lILm4P2YtjAG7ywT2HbNN1lbrxXrkg2H7Jar5FqVXB2A8ZH865dLxEdpoLZRK/BBztX/AHa2NEnuYpJClzKEkXcDnO78exFb1U4R5o7nkZbR9vWUWr/l8/L/AIAL4ftoZXV2dip2n6+1aaqERUUYVRgD0peerMWY9Se9FcM6kp/E7n3ODwtPDwXLFRb3sFa8DRy2YtSqklf3bpwyk9d3rWR35roAsBQ6e7tbRqvmRMYf3rsR0OO1YyFjJqMY3fU0/hOD/wALKtx6W8n8jRT/AITxunxKhV1KsttICrDBHBor2sN/CR8NnX+/VPl+SM7xvPJb/ErW54mKyR3YZSOxCrXaCJb+3aE26mK/tvMmnjOAzY4H1zVw/Dux8W+J/El9cX88DpqBj2ooI4Rau33geLQdKtYIr2eWGOXcrk4O70IHavIzHDVNaq2R6KxuHlhqVOMvfirbP8zxK5gktrmSCVSroxVge1RV63/wg+k+ItWknur6W0ll7IAQzfjWj/wpLS/+gtd/9+1qqEJ1oc0T2v7dwkUvaNp+jPE6o3+ni7Bdf9btCLk8KM8n617jf/CLQNMtGurzXLmKIcZZF5PoK4S4s9K0x55IBJcQofleZeQPoK66WErX5tkupzYzPcunRcZXl5W/zPN4bAtdXsUYAaJlKZrZtrZLVGSPIVju2n+E+1dTcWcdwu6KCFXP32xjAx1JqHS7XQm1IW+r3d1BA/C3EKBlB989q2q4apUfLTkpf8DT80eflucZfS1mnGWvno2+3rb5GHRXslj8IvD+pWwuLHX5riE/xxqpFWP+FJaV/wBBa7/74WuT6pVW6PZ/1gwH8z+5ni9vEJ50jMixhjgu3QVviKG4sY7iG2uZpLM5u5w+QV7EZ6V6M/wm0TSmSebXpoc5CmRVGeOcVzFn4PNx4mbT9PuDcaZPxHc7sCRf4unGRWNSjOLszlxGbUK7XI7xWr0aIfhbO938T/tDszM9vISWPJ4PWiur8P8Ag+28IfFGwgtrqWcT2UjkyKBjGR2or16EXGmos+YzGtTrYqVSl8Ltb7kdf4S/5Cfin/sLN/6LSuhurWK8t3gmUMjCub8KSImp+KtzAf8AE2b/ANAWpNa8d6Hokb+beJLMo4iiOWJ9Kpx5lZnA3Z3OcvreTS9SaN3+ZSMMBwPQ1q6l8QbXRdJjkuY3lvWBAUDC5HcmvP8AU/iRcatqcDyWyQ2gJDeWMtg+p71NI+mHTrdbq5a4s3lMguZRgIe2T6V4sU8BiLvWD6f11X4ncpxxVOy+Jf1+Jja14j1rxG/2m5LtCpPlxqOF/D+tVoiTG39oRQtAy4MaSASfhVe5v40vJGSfzApP7xDhcUlnqNglyojhJLc564PrXqY2vKrR/daLfS/3dvv+48qqmvd2ZIkUslwltGm2FOJWc4DgcqG9+gNZV/HcsNzXSSCNsGILjb9KtxXspupr/wC04yCkaN0Q9+KL1l1KIyzSRi4/hZBjd7GvOwEqlGspz2+9p/11X5GMIOLu+pHo2ualoU4udHvHtmbh4uqN9RXsPh34q6df2WNWX7Hdxj5yOUf3H+FeHwwbH+aVS2fu+tT3N6JY4LfzI9q52KAMg9/rXtY3FQdO8d/6+878LTVSdnsekfEDxDb69a6fNZXf+hSFguVyUkX+p6Yrs/hwtr/wisT21m1uAcMrnOW7kf8A1q8chu9Jto9PuPsjM2SLqAnIYDuPQmvWfCXi/wAPf2Za2FncCFVG1I5mw3/1687DwnOftWdmIq04w9jHdFi+Gfi5pHtp0v8AOiknkSb4s6W6OGUabJ0Oe9FegjiPHvH3inVtJ8U6pYW1w9vBdzPLKinB3KzL191Cn8a4STWyNuCSG+9nkmvZPjX4PiaQa/DamVlO+VVUncMYbP0AB/A14dd20NwFaGJIm6qU+63pWU52dnsZzgm73LQ1O4yUHTOM98Vvfb9Rfw9Npn2kG3f70bjIBzkYrlljeGaNWj81SBvYHvV6GWRSoKYUN90GuWpCMmjCEpU53i9RtkZ7ZnScYiwRtzyRW1YYRmkULtC/IPwrDvDKjnapdmXAHoD3qeO8dLK5j3FRsAXFWkjarW9pLnktS9cTiOzhDZLPcELt6EkfyqrNdtAoWSQ7u20VXQXCaFDJ/EtwcfTHFQTebKC+xWf1qI8uvqZ1GSx6o7SORLg5xkjoabp0iR6ss9+5WFc7mi6kY4wPrVL7FcSozMMHrgU5bOUhcrIrdenFXJRa3NaOIlRi1HqdBL4kur77JBsjiEEe0bRy4z/F70lxqttFIqyFwR9wRnoaxvKuY7l2jgUkn5R6cVF9l1IyxItsJHdwiLjlmPAFEFGNlDQylzTlzPdns/wXL3Pii5vJZpZPlMMRkPPC5bH5iiuw+EfhKXRtJS7u2R5ApSIqOhJy5/Pj8KK7Fe2p0pWVj0HVNPTVNOltWcxlx8sgGSp7HB6/SvnDxZ4FvvD19ctDbb7cDzGhXsvd4/VP9nqK+m6rXtha6jbtBdwJNGw6OP5elTOnGasxSipKzPlrTNAttW09biCVQzSeWFkXaCf8Peqr6JdwXbQvaMHTOdoznHvXuniP4W2moTx3mmytbXMfBIbBdfQnofxH41w2q+GfE+iuxezN7ajoY/lkUfTofwNaU8DhKkYxnNwfV7p/5Hk16OLpNuklJfc1/mcxa+G/tdvFLEY1llyqxzfLyO341lDS57YyG5tj5oPzKF4UCumt76C7l2LKyyr9+KRSsi/8BNbJ07zJI44JHLTLug3/APLQensa758O4dwjy1emr3T/AB0PJ/tKvGTjKGvbqjlP+EZuL20tZLaeJVmzJ5bjaWA7fWsz7KRIVFs6suSwK9K61w6SFXDB1OCD1FWLa3a6EgEjGRRuCKMkqOSfwqqvDNLkjy1Laa6Xv57kxzapdpxOXGg3F3At3p7pMWQkREbSwHXGe9ULFBfXCWxHlO7FRvUgZ9K6q5ulhuhb2pa9uMblW1GcD3PRfxNXtG0PXdamdYU2qf4bYA7T6tMeAfoDXFisowlJRSq6rdWvf8dDuwtTF17tQ07t2/TU4zULC60qZI3hMrSttiEY3Fm/u49a7jwT8PL7VNTF1qMYjERUkc4g/vBT0aQjjI4XPrXoPhj4Z2Gj23+mkXE7ndNgk+Ye24nk4/Ae1d1HGkUaxxoqIowFUYArjjhqUJuUF6XPZoUPZpOTuxlvbxWttHbwIEijUKijoAKKlorc6AooooAKQgMCGAIPUGlooA53WfBGha5Ks13ZJ5yAhXUYIrzbxH4O17wykl/DcS6pptthkJP7+BPb1Ar2umSRpNE0Uih0cFWUjgg1tRr1KMuaD/yMK+GpV48tRX/P7z5yuNbLwxTBxcSTH90BgMx9z2Hrmtzw94V8QeIbxp3PkWYU4kZSiOx4Ix95x+QrvbD4V+HNP1warEk7SB95hdlMZI6ZGO3au2AAGAMCujE5hUrLlXuryOPCZVRw75n70u7/AMjkdB+Hei6NZ+TJH9rZn3tvGEz7KOAK6yKKOGNY4o1jRRgKowBT6K4T0wooooAKKKKAP//Z";
        const SP2B_KAB_DEFAULT = {
            tempat: "Minahasa Tenggara",
            dpa: "1.01.0.00.0.00.01.0000",
            urusan: "Pendidikan",
            organisasi: "Dinas Pendidikan",
            jabatan: "Kepala Dinas Pendidikan Kabupaten Minahasa Tenggara,",
            nama: "SARAH I. KINDANGEN, S.Pd, M.Pd",
            nip: "198309232009022004"
        };
        const KB_TEXT_FIELDS = { kbNomor: "nomor", kbTanggal: "tanggal", kbTempat: "tempat", kbDpa: "dpa", kbUrusan: "urusan", kbOrg: "organisasi", kbJabatan: "jabatan", kbNama: "nama", kbNip: "nip", kbNamaSatuan: "namaSatuan" };

        function sp2bKabStore() {
            try {
                const st = JSON.parse(localStorage.getItem(yearKey("sp2bKab")));
                if (st && st.records) return st;
            } catch (e) {}
            return { last: {}, records: {} };
        }
        function sp2bKabPersist(st) {
            try { localStorage.setItem(yearKey("sp2bKab"), JSON.stringify(st)); } catch (e) { console.error(e); }
        }
        function kbEl(id) { return document.getElementById(id); }

        function sp2bKabKey() {
            return [kbEl("kbTahun").value, kbEl("kbTipe").value, kbEl("kbPeriode").value, kbEl("kbJenjang").value || "ALL", kbEl("kbStatus").value || "ALL"].join("|");
        }

        function sp2bKabPopulatePeriod(selected) {
            const tipe = kbEl("kbTipe").value;
            const sel = kbEl("kbPeriode");
            let opts = [];
            if (tipe === "bulan") opts = months.map((m, i) => [m, monthNames[i]]);
            else if (tipe === "triwulan") opts = [["TW1", "Triwulan I (Jan–Mar)"], ["TW2", "Triwulan II (Apr–Jun)"], ["TW3", "Triwulan III (Jul–Sep)"], ["TW4", "Triwulan IV (Okt–Des)"]];
            else if (tipe === "semester") opts = [["S1", "Semester 1 (Jan–Jun)"], ["S2", "Semester 2 (Jul–Des)"]];
            else opts = [["TAHUN", "Setahun Penuh (Jan–Des)"]];
            sel.innerHTML = opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("");
            sel.disabled = tipe === "tahun";
            if (selected && opts.some(o => o[0] === selected)) sel.value = selected;
        }

        function sp2bKabMonths() {
            const tipe = kbEl("kbTipe").value, p = kbEl("kbPeriode").value;
            if (tipe === "bulan") return [p];
            if (tipe === "triwulan") return getTriwulanMonths(p);
            if (tipe === "semester") return p === "S2" ? months.slice(6) : months.slice(0, 6);
            return months.slice();
        }

        function sp2bKabPeriodLabel() {
            const tipe = kbEl("kbTipe").value, p = kbEl("kbPeriode").value, th = kbEl("kbTahun").value;
            let lbl;
            if (tipe === "bulan") lbl = "Bulan " + monthNames[months.indexOf(p)];
            else if (tipe === "triwulan") lbl = "Triwulan " + ["I", "II", "III", "IV"][parseInt(p.replace("TW", "")) - 1];
            else if (tipe === "semester") lbl = "Semester " + p.replace("S", "");
            else lbl = "";
            return ("Untuk " + lbl + " Tahun Anggaran " + th).replace("  ", " ");
        }

        function sp2bKabFillFields(rec) {
            Object.keys(KB_TEXT_FIELDS).forEach(id => { kbEl(id).value = rec[KB_TEXT_FIELDS[id]] || ""; });
            kbEl("kbLampiran").checked = !!rec.lampiran;
        }

        function sp2bKabRefreshArsip() {
            const st = sp2bKabStore();
            const keys = Object.keys(st.records).sort();
            const sel = kbEl("kbArsip");
            sel.innerHTML = keys.length ? keys.map(k => `<option value="${escHtml(k)}">${escHtml(sp2bKabKeyLabel(k))}</option>`).join("") : `<option value="">(belum ada arsip)</option>`;
            if (keys.includes(sp2bKabKey())) sel.value = sp2bKabKey();
        }

        function sp2bKabKeyLabel(k) {
            const [th, tipe, p, jen, stt] = k.split("|");
            let per = tipe === "bulan" ? monthNames[months.indexOf(p)] : (tipe === "triwulan" ? "Triwulan " + p.replace("TW", "TW") : (tipe === "semester" ? "Semester " + p.replace("S", "") : "Setahun"));
            const st = sp2bKabStore().records[k];
            const sttLabel = stt === "ALL" ? "Semua" : (stt === "SWASTA" ? "Swasta" : (stt === "NEGERI" ? "Negeri" : stt));
            return `${per} ${th} · ${jen === "ALL" ? "SD+SMP" : jen} · ${sttLabel}${st && st.nomor ? " · No. " + st.nomor : ""}`;
        }

        function openSP2BKabModal() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Cetak SP2B Kabupaten khusus untuk Admin Dinas.");
                return;
            }
            const st = sp2bKabStore();
            // Inisialisasi dari periode yang sedang aktif di dashboard + tahun aktif
            let tipe = periodType === "triwulan" ? "triwulan" : (periodType === "semester" ? "semester" : (periodType === "tahun" ? "tahun" : "bulan"));
            kbEl("kbTipe").value = tipe;
            kbEl("kbTahun").value = activeYear;
            sp2bKabPopulatePeriod(tipe === "bulan" ? currentMonth : (tipe === "triwulan" ? currentTriwulan : (tipe === "semester" ? currentSemester : "TAHUN")));
            const base = Object.assign({}, SP2B_KAB_DEFAULT, st.last || {});
            const rec = st.records[sp2bKabKey()];
            sp2bKabFillFields(rec || Object.assign({}, base, { nomor: "", tanggal: "", namaSatuan: "" }));
            sp2bKabRefreshArsip();
            kbEl("sp2bKabModal").classList.remove("hidden");
            sp2bKabRender();
        }

        function closeSP2BKabModal() { kbEl("sp2bKabModal").classList.add("hidden"); }

        function sp2bKabTipeChanged() {
            sp2bKabPopulatePeriod();
            sp2bKabKeyChanged();
        }

        // Ganti periode/cakupan: bila sudah ada arsip untuk kombinasi itu, muat; jika belum, kosongkan nomor saja
        function sp2bKabKeyChanged() {
            const rec = sp2bKabStore().records[sp2bKabKey()];
            if (rec) sp2bKabFillFields(rec);
            else { kbEl("kbNomor").value = ""; kbEl("kbNamaSatuan").value = ""; }
            sp2bKabRefreshArsip();
            sp2bKabRender();
        }

        function sp2bKabCollect() {
            const rec = {};
            Object.keys(KB_TEXT_FIELDS).forEach(id => { rec[KB_TEXT_FIELDS[id]] = kbEl(id).value.trim(); });
            rec.lampiran = kbEl("kbLampiran").checked;
            return rec;
        }

        function sp2bKabSave() {
            const st = sp2bKabStore();
            const rec = sp2bKabCollect();
            st.records[sp2bKabKey()] = rec;
            st.last = { tempat: rec.tempat, dpa: rec.dpa, urusan: rec.urusan, organisasi: rec.organisasi, jabatan: rec.jabatan, nama: rec.nama, nip: rec.nip };
            sp2bKabPersist(st);
            sp2bKabRefreshArsip();
            alert("Isian SP2B untuk periode ini berhasil disimpan.");
        }

        function sp2bKabLoadArsip() {
            const k = kbEl("kbArsip").value;
            const rec = sp2bKabStore().records[k];
            if (!k || !rec) return;
            const [th, tipe, p, jen, stt] = k.split("|");
            kbEl("kbTahun").value = th;
            kbEl("kbTipe").value = tipe;
            sp2bKabPopulatePeriod(p);
            kbEl("kbJenjang").value = jen === "ALL" ? "" : jen;
            kbEl("kbStatus").value = stt === "ALL" ? "" : stt;
            sp2bKabFillFields(rec);
            sp2bKabRender();
        }

        function sp2bKabDeleteArsip() {
            const k = kbEl("kbArsip").value;
            if (!k || !confirm("Hapus arsip isian SP2B terpilih?")) return;
            const st = sp2bKabStore();
            delete st.records[k];
            sp2bKabPersist(st);
            sp2bKabRefreshArsip();
        }

        function sp2bKabPrint() {
            sp2bKabRender();
            const area = document.getElementById("sp2bKabPrintArea");
            if (!area || !area.innerHTML.trim()) {
                alert("Pratinjau SP2B masih kosong. Pastikan periode & data sudah terisi, lalu coba lagi.");
                return;
            }
            document.body.classList.add("kb-printing");
            // pastikan layout sudah ter-update sebelum dialog print
            void document.body.offsetHeight;
            const cleanup = () => {
                document.body.classList.remove("kb-printing");
                window.removeEventListener("afterprint", cleanup);
            };
            window.addEventListener("afterprint", cleanup);
            setTimeout(function () { window.print(); }, 50);
        }

        // ---------- Perhitungan akumulasi ----------
        function sp2bKabCompute() {
            const rolled = computeRolledData();
            const ms = sp2bKabMonths();
            const jen = kbEl("kbJenjang").value, stt = kbEl("kbStatus").value;
            const schools = baseSchools.filter(s => (!jen || s.jenjang === jen) && (!stt || (s.status || "").toUpperCase() === stt));
            const zeroB = () => ({ pegawai: 0, barjasReg: 0, barjasKin: 0, pm: 0, pmKin: 0, atl: 0, atlKin: 0, nonBelanja: 0 });
            const tot = { sa: 0, pen: 0, kas: 0, b: zeroB() };
            const rows = [];
            schools.forEach(s => {
                const r = rolled[s.no] || {};
                const first = r[ms[0]];
                // Saldo awal SP2B = SA_BANK BOSREG + SA_BANK BOSKIN + SA_TUNAI pada bulan pertama periode
                // (definisi yang sama dengan kolom SALDO SP2B di kertas kerja rekonsiliasi).
                const sa = first ? (first.saldoReguler + first.saldoKinerja + (first.saldoTunai || 0)) : 0;
                const row = { s: s, sa: sa, pen: 0, kas: 0, b: zeroB() };
                ms.forEach(m => {
                    const d = r[m];
                    if (!d) return;
                    row.pen += d.pendapatanBOS || 0;   // TOTAL PENDAPATAN = REGULER + KINERJA
                    const bd = d.belanjaDetail || {};
                    ["pegawai", "barjasReg", "barjasKin", "pm", "pmKin", "atl", "atlKin"].forEach(k => { row.b[k] += bd[k] || 0; });
                });
                row.belanja = row.b.pegawai + row.b.barjasReg + row.b.barjasKin + row.b.pm + row.b.pmKin + row.b.atl + row.b.atlKin;
                row.kas = row.sa + row.pen - row.belanja;
                tot.sa += row.sa; tot.pen += row.pen; tot.kas += row.kas;
                Object.keys(tot.b).forEach(k => { tot.b[k] += row.b[k]; });
                rows.push(row);
            });
            tot.belanja = tot.b.pegawai + tot.b.barjasReg + tot.b.barjasKin + tot.b.pm + tot.b.pmKin + tot.b.atl + tot.b.atlKin;
            return { rows: rows, tot: tot, count: schools.length };
        }

        function kbNum(n) { return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0); }
        function kbNumDash(n) { return Math.abs(n || 0) < 0.005 ? "-" : kbNum(n); }
        function kbTanggalIndo(v) {
            if (!v) return "..................... " + kbEl("kbTahun").value;
            const p = v.split("-");
            if (p.length !== 3) return escHtml(v);
            return parseInt(p[2], 10) + " " + monthNames[parseInt(p[1], 10) - 1] + " " + p[0];
        }

        function sp2bKabRender() {
            const area = kbEl("sp2bKabPrintArea");
            if (!area) return;
            const c = sp2bKabCompute();
            const t = c.tot, b = t.b;
            const f = sp2bKabCollect();
            const jen = kbEl("kbJenjang").value, stt = kbEl("kbStatus").value;
            let statusSuffix = "";
            if (stt === "NEGERI") statusSuffix = " NEGERI";
            else if (stt === "SWASTA") statusSuffix = " SWASTA";
            const autoNama = (jen ? jen : "SD & SMP") + statusSuffix;
            const namaSatuan = f.namaSatuan || autoNama;
            const judul2 = stt === "NEGERI" ? "SATUAN PENDIDIKAN NEGERI"
                         : (stt === "SWASTA" ? "SATUAN PENDIDIKAN SWASTA" : "SATUAN PENDIDIKAN");
            const operasional = b.barjasReg + b.barjasKin;
            const modal = b.pm + b.pmKin + b.atl + b.atlKin;
            const T = (s) => escHtml(s || "");
            const lineRow = (label, val, indent) =>
                `<tr><td style="width:50%;${indent ? "padding-left:34px;" : ""}">${label}</td><td style="width:10%;">: Rp.</td><td style="padding-left:22px;">${val === null ? "" : kbNum(val)}</td></tr>`;

            const detail = [
                ["5.2.1.06.01", "Belanja Pegawai", b.pegawai],
                ["5.2.2.22.01", "Belanja Barang dan Jasa", b.barjasReg],
                ["5.2.2.22.01", "Belanja Barang dan Jasa", b.barjasKin],
                ["5.2.3.37.13", "Belanja Modal Peralatan Mesin", b.pm],
                ["5.2.3.37.13", "Belanja Modal Peralatan Mesin", b.pmKin],
                ["5.2.3.82.01", "Belanja Modal Aset Tetap Lainnya", b.atl],
                ["5.2.3.82.01", "Belanja Modal Aset Tetap Lainnya", b.atlKin]
            ];
            const detailRows = detail.map((d, i) => `<tr>
                ${i === 0 ? `<td rowspan="7" class="nb" style="border-right:none;vertical-align:middle;">Rp</td><td rowspan="7" class="r" style="border-left:none;vertical-align:middle;">${kbNum(t.pen)}</td>` : ""}
                <td style="font-size:10px;">${d[0]}</td><td style="font-size:10px;">${d[1]}</td>
                <td style="border-right:none;font-size:10px;">Rp</td><td class="r" style="border-left:none;font-size:10px;">${kbNumDash(d[2])}</td></tr>`).join("");

            const warn = "";
            const empty = c.count === 0
                ? `<div class="no-print" style="background:#fef2f2;border:1px solid #f87171;color:#991b1b;font:11px Arial;padding:6px 8px;margin-bottom:8px;border-radius:4px;">Tidak ada sekolah yang cocok dengan filter jenjang/status ini.</div>` : "";

            let html = `${empty}${warn}
            <div class="sp2b-doc">
              <table><tr>
                <td style="width:17%;text-align:center;border-right:none;"><img src="${SP2B_LOGO}" alt="Logo" style="height:78px;display:inline-block;"></td>
                <td class="c b" style="border-left:none;font-size:12px;line-height:1.5;">
                  PEMERINTAH KABUPATEN MINAHASA TENGGARA<br>DINAS PENDIDIKAN<br>SURAT PERMINTAAN PENGESAHAN BELANJA (SP2B) BOSP<br>${judul2}
                  <div style="margin-top:14px;text-align:left;padding-left:25%;">Nomor : ${f.nomor ? T(f.nomor) : ""}</div>
                </td></tr></table>
              <table>
                <tr><td colspan="3">Kepala SKPD Dinas Pendidikan Kabupaten Minahasa Tenggara memohon kepada:</td></tr>
                <tr><td colspan="3">Bendahara Umum Daerah Selaku PPKD agar mengesahkan dan membukukan belanja BOSP Sejumlah:</td></tr>
                ${lineRow("1. Saldo Awal", t.sa)}
                ${lineRow("2. Penerimaan", t.pen)}
                <tr><td colspan="3">3. Belanja</td></tr>
                ${lineRow("a. Belanja Pegawai", b.pegawai, true)}
                ${lineRow("b. Belanja Operasional", operasional, true)}
                ${lineRow("c. Belanja Modal", modal, true)}
                ${lineRow("4. Saldo Akhir", t.kas)}
                <tr><td colspan="3">${T(sp2bKabPeriodLabel())}</td></tr>
              </table>
              <table>
                <tr class="c b"><td style="width:28%;">Dasar Pengesahan</td><td style="width:17%;">Urusan</td><td style="width:25%;">Organisasi</td><td>Nama Satuan Pendidikan</td></tr>
                <tr class="c" style="height:42px;"><td>Nomor DPA SKPD<br>${T(f.dpa)}</td><td>${T(f.urusan)}</td><td>${T(f.organisasi)}</td><td class="b" style="font-style:italic;">${T(namaSatuan)}</td></tr>
              </table>
              <div style="height:4px;border-top:1px solid #000;"></div>
              <table>
                <colgroup><col style="width:9%"><col style="width:29%"><col style="width:11%"><col style="width:27%"><col style="width:5%"><col style="width:19%"></colgroup>
                <tr class="c b"><td colspan="2" rowspan="2">Penerimaan</td><td colspan="2">Belanja</td><td colspan="2" rowspan="2">Jumlah</td></tr>
                <tr class="c b"><td colspan="2">Kode Rekening</td></tr>
                ${detailRows}
                <tr class="b"><td>Jumlah</td><td style="border-left:none;"><span style="float:left;">Rp</span><span style="float:right;">${kbNum(t.pen)}</span></td>
                  <td colspan="2" class="c">Jumlah Belanja</td><td style="border-right:none;">Rp</td><td class="r" style="border-left:none;">${kbNum(t.belanja)}</td></tr>
              </table>
            </div>
            <div style="font:11px Arial;color:#000;text-align:center;margin:18px 0 0 0;">
              ${T(f.tempat)}, ${kbTanggalIndo(f.tanggal)}<br>${T(f.jabatan)}
              <div style="height:62px;"></div>
              <b><u>${T(f.nama)}</u></b><br>NIP. ${T(f.nip)}
            </div>`;

            if (f.lampiran) {
                const n = (v) => kbNumDash(v);
                const lampRows = c.rows.map((r, i) => `<tr><td style="text-align:center;">${i + 1}</td><td>${T(r.s.name)}</td>
                    <td style="text-align:right;">${n(r.sa)}</td><td style="text-align:right;">${n(r.pen)}</td>
                    <td style="text-align:right;">${n(r.b.pegawai)}</td><td style="text-align:right;">${n(r.b.barjasReg + r.b.barjasKin)}</td>
                    <td style="text-align:right;">${n(r.b.pm + r.b.pmKin + r.b.atl + r.b.atlKin)}</td>
                    <td style="text-align:right;">${n(r.belanja)}</td><td style="text-align:right;font-weight:bold;">${n(r.kas)}</td></tr>`).join("");
                html += `<div class="kb-pagebreak sp2b-lamp" style="margin-top:28px;">
                    <div style="text-align:center;font-weight:bold;font-size:11px;margin-bottom:8px;">LAMPIRAN SP2B BOS ${T(namaSatuan)}<br>RINCIAN PER SEKOLAH &mdash; ${T(sp2bKabPeriodLabel().replace("Untuk ", "").toUpperCase())}</div>
                    <table><thead><tr style="font-weight:bold;text-align:center;background:#f1f5f9;">
                        <td>No</td><td>Nama Sekolah</td><td>Saldo Awal</td><td>Penerimaan</td><td>Belanja Pegawai</td><td>Belanja Operasional</td><td>Belanja Modal</td><td>Jumlah Belanja</td><td>Saldo Akhir</td></tr></thead>
                    <tbody>${lampRows}
                    <tr style="font-weight:bold;background:#f1f5f9;"><td colspan="2" style="text-align:center;">JUMLAH (${c.count} sekolah)</td>
                        <td style="text-align:right;">${n(t.sa)}</td><td style="text-align:right;">${n(t.pen)}</td><td style="text-align:right;">${n(b.pegawai)}</td>
                        <td style="text-align:right;">${n(operasional)}</td><td style="text-align:right;">${n(modal)}</td><td style="text-align:right;">${n(t.belanja)}</td><td style="text-align:right;">${n(t.kas)}</td></tr>
                    </tbody></table></div>`;
            }
            area.innerHTML = html;
        }

        function closeAnnualSP2BModal() {
            document.getElementById("sp2bAnnualModal").classList.add("hidden");
        }

        function updateCharts() {
            const kecamatanList = [...new Set(baseSchools.map(s => s.kecamatan))];
            const pendPerKec = kecamatanList.map(kec => filteredData.filter(s => s.kecamatan === kec).reduce((acc, curr) => acc + curr.totalPendapatan, 0));
            const belPerKec = kecamatanList.map(kec => filteredData.filter(s => s.kecamatan === kec).reduce((acc, curr) => acc + curr.totalBelanja, 0));

            const ctxBar = document.getElementById("barChart").getContext("2d");
            if (barChartInstance) barChartInstance.destroy();
            barChartInstance = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: kecamatanList,
                    datasets: [
                        { label: 'Total Pendapatan', data: pendPerKec, backgroundColor: '#0F2C59', borderRadius: 6, borderSkipped: false },
                        { label: 'Total Belanja', data: belPerKec, backgroundColor: '#C5A059', borderRadius: 6, borderSkipped: false }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', align: 'end', labels: { font: { size: 11 }, usePointStyle: true, boxWidth: 8, padding: 14 } } },
                    scales: { y: { grid: { color: 'rgba(100,116,139,.12)' }, border: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 6 } }, x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: true } } }
                }
            });

            let verifiedCount = filteredData.filter(s => s.verifStatus === 'Disahkan BUD' || s.verifStatus === 'Diverifikasi Dinas').length;
            let unverifiedCount = filteredData.length - verifiedCount;

            const ctxPie = document.getElementById("pieChart").getContext("2d");
            if (pieChartInstance) pieChartInstance.destroy();
            pieChartInstance = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: ['Terverifikasi / Disahkan', 'Belum Diverifikasi'],
                    datasets: [{
                        data: [verifiedCount, unverifiedCount],
                        backgroundColor: ['#059669', '#E11D48'], borderWidth: 3, borderColor: '#ffffff', hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '66%',
                    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, boxWidth: 8, padding: 14 } } }
                }
            });
        }

        function exportCSV() {
            if (!currentUser || currentUser.role !== "Admin Dinas") {
                alert("Akses ditolak! Ekspor data kabupaten khusus untuk Admin Dinas.");
                return;
            }
            let pLabel = periodType === 'bulan' ? currentMonth : (periodType === 'triwulan' ? currentTriwulan : (periodType === 'semester' ? (currentSemester === 'S2' ? 'Semester2' : 'Semester1') : 'Tahunan'));
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += `No,NPSN,Nama Sekolah,Alamat,Status,Kecamatan,Periode,Saldo Awal,Total Pendapatan,Total Belanja,Kas Seharusnya,Verifikasi Status\r\n`;
            filteredData.forEach(s => {
                csvContent += `"${s.no}","${s.npsn || ''}","${s.name}","${s.alamat || ''}","${s.status || 'NEGERI'}","${s.kecamatan}","${pLabel}",${s.saldoAwal},${s.totalPendapatan},${s.totalBelanja},${s.kasSeharusnya},"${s.verifStatus}"\r\n`;
            });
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `Rekap_Rekon_BOSP_${pLabel}_MinahasaTenggara.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        /* ===== Beranda: Rekap Penganggaran RKAS (ARKAS) ===== */
        const ARKAS_SUMBER = [
            { k: "reguler", n: "BOSP Reguler" },
            { k: "kinerja", n: "BOSP Kinerja" },
            { k: "prestasi", n: "BOSP Prestasi" },
            { k: "silpaKinerja", n: "SiLPA BOSP Kinerja" }
        ];
        const ARKAS_STATUS_CLS = {
            "Draft": "bg-slate-100 text-slate-700 border-slate-300",
            "Diajukan": "bg-amber-100 text-amber-800 border-amber-300",
            "Terverifikasi": "bg-emerald-100 text-emerald-800 border-emerald-300",
            "Ditolak": "bg-rose-100 text-rose-800 border-rose-300"
        };
        let arkasData = null;          // { [noSekolah]: { induk: { [sumber]: rekam }, perubahan: {...} } }
        let arkasTahap = "induk";
        try { const t = sessionStorage.getItem("bosp_arkas_tahap"); if (t === "induk" || t === "perubahan") arkasTahap = t; } catch (e) {}

        function arkasSetTahap(t) {
            arkasTahap = t;
            try { sessionStorage.setItem("bosp_arkas_tahap", t); } catch (e) {}
            drawBerandaArkas();
        }
        function arkasCounted(rec) { return !!rec && (rec.status === "Diajukan" || rec.status === "Terverifikasi"); }
        function arkasBadge(st) {
            return '<span class="inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ' + (ARKAS_STATUS_CLS[st] || ARKAS_STATUS_CLS.Draft) + '">' + escHtml(st) + '</span>';
        }

        async function renderBerandaArkas() {
            const el = document.getElementById("berandaArkas");
            if (!el || !currentUser) return;
            el.innerHTML = '<p class="text-xs text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat rekap penganggaran RKAS…</p>';
            try {
                const resp = await fetch(NODE_API_BASE + "/api/anggaran?year=" + encodeURIComponent(activeYear), {
                    credentials: "include", cache: "no-store", headers: nodeHeaders()
                });
                const j = await resp.json();
                if (!resp.ok || j.status !== "success") throw new Error(j.message || ("HTTP " + resp.status));
                arkasData = j.data || {};
                drawBerandaArkas();
            } catch (e) {
                el.innerHTML = '<div class="flex flex-wrap items-center gap-3"><p class="text-xs text-rose-700 flex-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Rekap penganggaran belum dapat dimuat: ' +
                    escHtml(e.message) + '</p><button type="button" class="btn btn-soft" onclick="renderBerandaArkas()"><i class="fa-solid fa-rotate"></i> Coba lagi</button></div>';
            }
        }

        function drawBerandaArkas() {
            const el = document.getElementById("berandaArkas");
            if (!el || !currentUser || !arkasData) return;
            const isOp = currentUser.role === "Operator Sekolah";
            const rp = n => formatRupiah(Number(n) || 0);
            const tahapNama = arkasTahap === "induk" ? "Induk" : "Perubahan";
            const recOf = (no, s) => (arkasData[String(no)] && arkasData[String(no)][arkasTahap] && arkasData[String(no)][arkasTahap][s]) || null;
            const seg = '<div class="inline-flex border border-slate-300 rounded-xl overflow-hidden bg-white text-xs font-bold">' +
                [["induk", "Induk"], ["perubahan", "Perubahan"]].map(([k, n]) =>
                    '<button type="button" onclick="arkasSetTahap(\'' + k + '\')" class="px-4 py-2 ' +
                    (arkasTahap === k ? "bg-[#0F2C59] text-white" : "text-slate-600 hover:bg-slate-50") + '">' + n + '</button>').join("") + '</div>';
            const bar = (pct, color) => '<div class="bar"><i style="width:' + pct + '%;background:' + color + '"></i></div>';
            const tile = (label, n, cls, icon) => '<div class="tile ' + cls + '"><i class="fa-solid ' + icon + '"></i><div><b>' + n + '</b><span>' + label + '</span></div></div>';
            const tilesGrid = 'style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"';
            const th = (t, right) => '<th class="p-2 ' + (right ? "text-right" : "text-left") + ' whitespace-nowrap">' + t + '</th>';
            const cnt = { "Draft": 0, "Diajukan": 0, "Terverifikasi": 0, "Ditolak": 0 };
            const KEYS = ["pegawai", "barjas", "atl", "pm", "lainnya", "total"];

            if (isOp) {
                const s = findSchoolForUser(currentUser);
                if (!s) { el.innerHTML = '<p class="text-xs text-slate-500">Data sekolah Anda tidak ditemukan di Data Master.</p>'; return; }
                const sum = { pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 };
                const rows = ARKAS_SUMBER.map(src => {
                    const r = recOf(s.no, src.k);
                    const t = (r && r.totals) || {};
                    if (r) {
                        cnt[r.status] = (cnt[r.status] || 0) + 1;
                        if (arkasCounted(r)) KEYS.forEach(k => sum[k] += Number(t[k]) || 0);
                    }
                    const c = k => '<td class="p-2 text-right whitespace-nowrap">' + (r ? rp(t[k]) : "—") + '</td>';
                    return '<tr class="border-t border-slate-100"><td class="p-2 font-semibold">' + src.n + '</td><td class="p-2">' +
                        (r ? arkasBadge(r.status) : '<span class="text-slate-400">Belum diunggah</span>') + '</td>' +
                        c("pegawai") + c("barjas") + c("atl") + c("pm") + '<td class="p-2 text-right font-bold whitespace-nowrap">' + (r ? rp(t.total) : "—") + '</td></tr>';
                }).join("");
                const docs = cnt["Draft"] + cnt["Diajukan"] + cnt["Terverifikasi"] + cnt["Ditolak"];
                el.innerHTML =
                    '<div class="pp-head"><div class="tx"><h3>Rekap Penganggaran RKAS (ARKAS) ' + escHtml(s.name) + ' — TA ' + activeYear + ' · ' + tahapNama + '</h3>' +
                    '<p><b>' + docs + '</b> dokumen RKAS diunggah untuk tahap ' + tahapNama + '</p></div>' + seg +
                    '<a href="/penganggaran.html" class="btn btn-soft"><i class="fa-solid fa-coins"></i> Buka Penganggaran</a></div>' +
                    '<div class="pp-tiles" ' + tilesGrid + '>' +
                    tile("Draft", cnt["Draft"], "t-slate", "fa-file-pen") + tile("Diajukan", cnt["Diajukan"], "t-amber", "fa-paper-plane") +
                    tile("Terverifikasi", cnt["Terverifikasi"], "t-green", "fa-circle-check") + tile("Ditolak", cnt["Ditolak"], "t-rose", "fa-circle-xmark") + '</div>' +
                    '<div class="overflow-x-auto mt-5"><table class="w-full text-xs border-collapse"><thead><tr class="bg-slate-100 text-slate-700">' +
                    th("Sumber Dana") + th("Status") + th("Pegawai", 1) + th("Barang &amp; Jasa", 1) + th("Modal ATL", 1) + th("Modal PM", 1) + th("Total", 1) +
                    '</tr></thead><tbody>' + rows + '</tbody><tfoot><tr class="border-t-2 border-slate-300 bg-slate-50 font-bold"><td class="p-2" colspan="2">Total (Diajukan + Terverifikasi)</td>' +
                    ["pegawai", "barjas", "atl", "pm", "total"].map(k => '<td class="p-2 text-right whitespace-nowrap">' + rp(sum[k]) + '</td>').join("") + '</tr></tfoot></table></div>';
                return;
            }

            // Admin Dinas / BUD: seluruh satuan pendidikan
            const schools = baseSchools, total = schools.length;
            const withDoc = new Set(), submitted = new Set();
            const bySrc = {};
            ARKAS_SUMBER.forEach(s => { bySrc[s.k] = { sekolah: 0, pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 }; });
            const kec = {};
            schools.forEach(sc => {
                const kn = sc.kecamatan || "-";
                kec[kn] = kec[kn] || { t: 0, d: 0 };
                kec[kn].t++;
                let sent = false;
                ARKAS_SUMBER.forEach(s => {
                    const r = recOf(sc.no, s.k);
                    if (!r) return;
                    cnt[r.status] = (cnt[r.status] || 0) + 1;
                    withDoc.add(sc.no);
                    if (arkasCounted(r)) {
                        sent = true;
                        const b = bySrc[s.k]; b.sekolah++;
                        const t = r.totals || {};
                        KEYS.forEach(k => { b[k] += Number(t[k]) || 0; });
                    }
                });
                if (sent) { submitted.add(sc.no); kec[kn].d++; }
            });
            const grand = { sekolah: submitted.size, pegawai: 0, barjas: 0, atl: 0, pm: 0, lainnya: 0, total: 0 };
            ARKAS_SUMBER.forEach(s => KEYS.forEach(k => { grand[k] += bySrc[s.k][k]; }));
            const pct = total ? Math.round(submitted.size / total * 100) : 0;
            const rows = ARKAS_SUMBER.map(s => {
                const b = bySrc[s.k];
                return '<tr class="border-t border-slate-100"><td class="p-2 font-semibold">' + s.n + '</td><td class="p-2 text-right">' + b.sekolah + '</td>' +
                    ["pegawai", "barjas", "atl", "pm"].map(k => '<td class="p-2 text-right whitespace-nowrap">' + rp(b[k]) + '</td>').join("") +
                    '<td class="p-2 text-right font-bold whitespace-nowrap">' + rp(b.total) + '</td></tr>';
            }).join("");
            const kecHtml = Object.keys(kec).sort().map(k => {
                const kp = Math.round(kec[k].d / kec[k].t * 100);
                return '<div><div class="row"><b>' + escHtml(k) + '</b><span>' + kec[k].d + '/' + kec[k].t + ' sekolah</span></div>' + bar(kp, kp === 100 ? "#10b981" : "#3b82f6") + '</div>';
            }).join("");
            el.innerHTML =
                '<div class="pp-head"><div class="pp-ring" style="--p:' + pct + '"><span>' + pct + '%</span></div>' +
                '<div class="tx"><h3>Rekap Penganggaran RKAS (ARKAS) — TA ' + activeYear + ' · ' + tahapNama + '</h3>' +
                '<p><b>' + submitted.size + '</b> dari ' + total + ' sekolah sudah mengajukan RKAS (' + withDoc.size + ' sekolah sudah mengunggah)</p></div>' + seg +
                '<a href="/penganggaran.html" class="btn btn-soft"><i class="fa-solid fa-coins"></i> Buka Penganggaran</a></div>' +
                '<div class="pp-tiles" ' + tilesGrid + '>' +
                tile("Draft", cnt["Draft"], "t-slate", "fa-file-pen") + tile("Diajukan", cnt["Diajukan"], "t-amber", "fa-paper-plane") +
                tile("Terverifikasi", cnt["Terverifikasi"], "t-green", "fa-circle-check") + tile("Ditolak", cnt["Ditolak"], "t-rose", "fa-circle-xmark") + '</div>' +
                '<div class="overflow-x-auto mt-5"><table class="w-full text-xs border-collapse"><thead><tr class="bg-slate-100 text-slate-700">' +
                th("Sumber Dana") + th("Sekolah", 1) + th("Pegawai", 1) + th("Barang &amp; Jasa", 1) + th("Modal ATL", 1) + th("Modal PM", 1) + th("Total", 1) +
                '</tr></thead><tbody>' + rows + '</tbody><tfoot><tr class="border-t-2 border-slate-300 bg-slate-50 font-bold"><td class="p-2">Total</td><td class="p-2 text-right">' + grand.sekolah + '</td>' +
                ["pegawai", "barjas", "atl", "pm", "total"].map(k => '<td class="p-2 text-right whitespace-nowrap">' + rp(grand[k]) + '</td>').join("") + '</tr></tfoot></table></div>' +
                '<p class="text-[11px] text-slate-500 mt-2">Nilai dihitung dari dokumen berstatus Diajukan dan Terverifikasi' +
                (grand.lainnya > 0 ? ' · ' + rp(grand.lainnya) + ' belum terklasifikasi ke jenis belanja' : '') +
                '. Rincian, verifikasi dan cetak rekap ada di menu Penganggaran.</p>' +
                '<div class="pp-kec"><div class="col-span-full text-[11px] font-bold text-slate-500 uppercase tracking-wider -mb-2">Sekolah yang sudah mengajukan RKAS per kecamatan</div>' + kecHtml + '</div>';
        }


        (function () {
            "use strict";
            var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            /* ---------- Toast: pengganti alert() yang tidak memblokir layar ---------- */
            function esc(t) { var d = document.createElement("div"); d.textContent = String(t == null ? "" : t); return d.innerHTML; }
            window.rkToast = function (msg, type) {
                var box = document.getElementById("rkToasts");
                if (!box) return;
                var text = String(msg == null ? "" : msg);
                if (!type) {
                    if (/berhasil|selamat datang|tersimpan|sukses|disimpan|terkirim|diverifikasi/i.test(text)) type = "ok";
                    else if (/gagal|salah|ditolak|tidak (dapat|bisa|ditemukan|valid|boleh)|wajib|peringatan|error|belum|harus|terkunci|lengkapi/i.test(text)) type = "err";
                    else type = "info";
                }
                var icon = type === "ok" ? "fa-circle-check" : type === "err" ? "fa-circle-exclamation" : "fa-circle-info";
                var el = document.createElement("div");
                el.className = "rk-toast " + type;
                el.setAttribute("role", type === "err" ? "alert" : "status");
                el.innerHTML = '<i class="fa-solid ' + icon + '"></i><div>' + esc(text) + "</div>";
                var close = function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 260); };
                el.addEventListener("click", close);
                box.appendChild(el);
                while (box.children.length > 4) box.removeChild(box.firstChild);
                setTimeout(close, Math.min(9000, 3800 + text.length * 45));
            };
            window.alert = function (msg) { window.rkToast(msg); };

            /* ---------- Filter ringkas di ponsel ---------- */
            window.toggleFilters = function () {
                var p = document.getElementById("filterPanel"), b = document.getElementById("filterToggleBtn");
                if (!p) return;
                var open = p.classList.toggle("open");
                if (b) b.setAttribute("aria-expanded", open ? "true" : "false");
            };

            /* ---------- Penyesuaian per peran (navigasi bawah + avatar) ---------- */
            window.rkOnSession = function () {
                var u = typeof currentUser !== "undefined" ? currentUser : null;
                if (!u) return;
                var isAdmin = u.role === "Admin Dinas";
                var av = document.getElementById("sessionAvatar");
                if (av) av.textContent = (u.name || u.username || "?").trim().charAt(0).toUpperCase();
                var set = function (id, show) { var el = document.getElementById(id); if (el) el.classList.toggle("hidden", !show); };
                set("bnRekap", isAdmin); set("bnMenu", isAdmin); set("bnInput", !isAdmin);
                var reset = document.getElementById("filterToggleBtn");
                if (reset) reset.setAttribute("aria-expanded", "false");
            };

            /* ---------- Banner sambutan ---------- */
            function greet() {
                var h = new Date().getHours();
                return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
            }
            window.rkRenderWelcome = function () {
                var el = document.getElementById("welcomeBanner");
                if (!el || typeof currentUser === "undefined" || !currentUser) return;
                var h = function (s) { return esc(s); };
                var p = (typeof periodLabel === "function") ? periodLabel() : "";
                if (currentUser.role === "Admin Dinas") {
                    var pending = 0;
                    try { pending = (usersDB || []).filter(function (x) { return x.status !== "Aktif"; }).length; } catch (e) {}
                    el.innerHTML =
                        '<div><small class="k"><i class="fa-solid fa-sun mr-1"></i>' + greet() + '</small>' +
                        '<h2>' + h(currentUser.name || "Administrator") + '</h2>' +
                        '<p>Pantau progres rekonsiliasi seluruh satuan pendidikan, verifikasi berkas, dan cetak SP2B dari satu tempat.</p>' +
                        '<span class="pill"><i class="fa-solid fa-calendar-days"></i> TA ' + h(activeYear) + '</span>' +
                        '<span class="pill"><i class="fa-solid fa-clock"></i> ' + h(p) + '</span>' +
                        (pending > 0 ? '<span class="pill" style="background:rgba(245,158,11,.25);border-color:rgba(245,158,11,.5)"><i class="fa-solid fa-user-clock"></i> ' + pending + ' akun menunggu verifikasi</span>' : '') +
                        '</div>' +
                        '<div class="acts">' +
                        (pending > 0 ? '<button class="btn btn-gold" onclick="openUserListModal()"><i class="fa-solid fa-user-check"></i> Verifikasi Akun</button>' : '') +
                        '<button class="btn btn-ghost" onclick="openSP2BKabModal()"><i class="fa-solid fa-print"></i> Cetak SP2B Kab.</button>' +
                        '<button class="btn btn-ghost" onclick="openKecamatanModal()"><i class="fa-solid fa-map-location-dot"></i> Rekap Kecamatan</button>' +
                        '</div>';
                } else {
                    var s = null;
                    try { s = findSchoolForUser(currentUser); } catch (e) {}
                    el.innerHTML =
                        '<div><small class="k"><i class="fa-solid fa-sun mr-1"></i>' + greet() + '</small>' +
                        '<h2>' + h(currentUser.name || "Operator Sekolah") + '</h2>' +
                        '<p>' + (s ? h(s.name) + (s.kecamatan ? ' · Kec. ' + h(s.kecamatan) : '') : 'Data sekolah Anda belum ditemukan di Data Master.') + '</p>' +
                        '<span class="pill"><i class="fa-solid fa-calendar-days"></i> TA ' + h(activeYear) + '</span>' +
                        '<span class="pill"><i class="fa-solid fa-clock"></i> ' + h(p) + '</span>' +
                        (s && s.npsn ? '<span class="pill"><i class="fa-solid fa-hashtag"></i> NPSN ' + h(s.npsn) + '</span>' : '') +
                        '</div>' +
                        '<div class="acts"><button class="btn btn-gold btn-lg" onclick="openAction(\'input\')"><i class="fa-solid fa-pen-to-square"></i> Input / Ajukan Realisasi</button></div>';
                }
            };

            /* ---------- Chip periode aktif ke tengah (geser horizontal di ponsel) ---------- */
            window.rkCenterActiveChip = function () {
                try {
                    var c = document.getElementById("periodSelectorContainer");
                    var a = c && c.querySelector(".chip-on");
                    if (!a || c.scrollWidth <= c.clientWidth) return;
                    c.scrollLeft = Math.max(0, a.offsetLeft - (c.clientWidth - a.offsetWidth) / 2 - c.offsetLeft);
                } catch (e) {}
            };

            /* ---------- Petunjuk geser untuk tabel rinci di ponsel ---------- */
            window.rkTableHint = function (detailOn) {
                var h = document.getElementById("swipeHint");
                if (h) h.classList.toggle("on", !!detailOn);
            };

            /* ---------- Navbar landing, reveal & hitung naik ---------- */
            document.documentElement.classList.add("js");
            document.addEventListener("DOMContentLoaded", function () {
                var nav = document.getElementById("lpNav");
                var onScroll = function () { if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 24); };
                window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

                var items = document.querySelectorAll(".rv");
                if (!("IntersectionObserver" in window) || reduce) { items.forEach(function (n) { n.classList.add("in"); }); }
                else {
                    var io = new IntersectionObserver(function (es) {
                        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
                    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
                    items.forEach(function (n) { io.observe(n); });
                    // pengaman: pastikan konten terlihat bila observer tidak terpicu
                    setTimeout(function () { items.forEach(function (n) { if (n.getBoundingClientRect().top < window.innerHeight) n.classList.add("in"); }); }, 600);
                }

                document.querySelectorAll("[data-count]").forEach(function (n) {
                    var to = parseInt(n.getAttribute("data-count"), 10) || 0;
                    if (reduce || !("IntersectionObserver" in window)) { n.textContent = to; return; }
                    n.textContent = "0";
                    var io2 = new IntersectionObserver(function (es) {
                        es.forEach(function (e) {
                            if (!e.isIntersecting) return;
                            io2.disconnect();
                            var t0 = performance.now(), dur = 1100;
                            (function tick(t) {
                                var k = Math.min(1, (t - t0) / dur);
                                n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
                                if (k < 1) requestAnimationFrame(tick);
                            })(t0);
                        });
                    }, { threshold: 0.6 });
                    io2.observe(n);
                });

                // Tutup menu admin dengan tombol Esc, & modal login dengan Esc
                document.addEventListener("keydown", function (e) {
                    if (e.key !== "Escape") return;
                    if (typeof closeAdminMenu === "function") closeAdminMenu();
                    var am = document.getElementById("authModal");
                    if (am && !am.classList.contains("hidden") && typeof closeAuthModal === "function") closeAuthModal();
                });
                // Enter pada kolom login = Masuk
                ["loginUsername", "loginPassword"].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) el.addEventListener("keydown", function (e) { if (e.key === "Enter" && typeof handleLogin === "function") handleLogin(); });
                });
            });
        })();