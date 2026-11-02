// Sample data for LOCAL Supabase only: clears and re-seeds the database.
// Auth users are created through the admin API so profiles come from the real
// auth trigger; counters are never written (they are computed views).
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DEV_PASSWORD, localSupabase } from "./local";

const { url: SUPABASE_URL, serviceRoleKey } = localSupabase();
const db = createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

const DAY_MS = 24 * 60 * 60 * 1000;

const NOW = Date.now();
const HOUR_MS = 60 * 60 * 1000;

// Deterministic PRNG so every run produces the same community, only shifted to "now".
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261031);
const chance = (p: number) => rand() < p;
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

/** Deterministic UUID (v5 layout) so member and app URLs stay the same across re-seeds. */
function stableUuid(name: string): string {
  const b = createHash("sha1").update(`tesbareng:${name}`).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** `days` whole days ago, minus a few hours so day boundaries stay stable while the seed is fresh. */
function daysAgo(days: number, jitterHours = randInt(1, 9)): number {
  return NOW - days * DAY_MS - jitterHours * HOUR_MS;
}

// ---------------------------------------------------------------- members

interface Member {
  key: string;
  name: string;
  email: string;
  role: "member" | "admin";
  /** Relative likelihood of being picked as a tester. 0 = tests nothing. */
  weight: number;
  uid: string;
  joinedDaysAgo: number;
}

const MEMBER_ROWS: [key: string, name: string, email: string, weight: number][] = [
  ["yusuf", "Yusuf Hidayat", "yusuf.hidayat.dev@gmail.com", 6],
  ["rizky", "Rizky Ramadhan", "rizkyramadhan.id@gmail.com", 7],
  ["siti", "Siti Nurhaliza Putri", "sitinurhalizaputri@gmail.com", 3],
  ["fajar", "Fajar Nugroho", "fajar.nugroho88@gmail.com", 6],
  ["dewi", "Dewi Anggraini", "dewianggraini.dev@gmail.com", 5],
  ["bayu", "Bayu Pratama", "bayupratama.code@gmail.com", 6],
  ["anisa", "Anisa Rahmawati", "anisarahma.w@gmail.com", 4],
  ["agus", "Agus Setiawan", "agussetiawan.mlg@gmail.com", 3],
  ["putu", "Putu Ary Wiradana", "putuary.wira@gmail.com", 2],
  ["made", "Made Suardana", "madesuardana17@gmail.com", 3],
  ["rahmat", "Rahmat Hidayatullah", "rahmat.hdy@gmail.com", 3],
  ["nuraini", "Nur Aini Lestari", "nuraini.lestari@gmail.com", 3],
  ["hendra", "Hendra Gunawan", "hendragunawan.bdg@gmail.com", 2],
  ["teguh", "Teguh Wibowo", "teguhwibowo.dev@gmail.com", 0],
  ["indah", "Indah Permatasari", "indahpermata.sari@gmail.com", 3],
  ["ilham", "Ilham Maulana", "ilham.maulana.dev@gmail.com", 4],
  ["galih", "Galih Prasetyo", "galihprasetyo@gmail.com", 5],
  ["wulan", "Wulan Sari", "wulansari.jogja@gmail.com", 3],
  ["arief", "Arief Budiman", "ariefbudiman.id@gmail.com", 2],
  ["yohanes", "Yohanes Sitorus", "yohanes.sitorus@gmail.com", 2],
  ["rina", "Rina Kusumawati", "rinakusumawati@gmail.com", 2],
  ["dimas", "Dimas Aditya", "dimasaditya.apps@gmail.com", 4],
  ["kurniawan", "Kurniawan Saputra", "kurniawan.saputra21@gmail.com", 1],
  ["fitri", "Fitri Handayani", "fitrihandayani.mks@gmail.com", 3],
  ["andi", "Andi Muhammad Akbar", "andimakbar@gmail.com", 2],
  ["lukman", "Lukman Hakim", "lukmanhakim.dev@gmail.com", 2],
  ["novita", "Novita Sembiring", "novitasembiring@gmail.com", 2],
  ["bagus", "Bagus Wicaksono", "baguswicaksono.sby@gmail.com", 2],
  ["ketut", "Ketut Arsana", "ketutarsana@gmail.com", 1],
  ["maria", "Maria Fransiska Lewar", "mariafransiska.l@gmail.com", 1],
  ["rudi", "Rudi Hartono", "rudihartono.pkl@gmail.com", 1],
  ["tri", "Tri Wahyuni", "triwahyuni.smg@gmail.com", 2],
  ["faisal", "Faisal Lubis", "faisallubis.mdn@gmail.com", 1],
  ["ega", "Ega Firmansyah", "egafirmansyah@gmail.com", 2],
  ["hana", "Hana Safitri", "hanasafitri.dev@gmail.com", 3],
  ["zaki", "Ahmad Zaki Mubarak", "zakimubarak.dev@gmail.com", 3],
];

const members: Member[] = MEMBER_ROWS.map(([key, name, email, weight]) => ({
  key,
  name,
  email,
  weight,
  role: key === "yusuf" ? "admin" : "member",
  uid: stableUuid(`member:${email}`),
  joinedDaysAgo: key === "yusuf" ? 120 : randInt(20, 95),
}));
const byKey = new Map(members.map((m) => [m.key, m]));
const member = (key: string) => {
  const m = byKey.get(key);
  if (!m) throw new Error(`unknown member ${key}`);
  return m;
};

// ---------------------------------------------------------------- apps

type AppStatus = "recruiting" | "testing" | "applied" | "live";

interface TesterSpec {
  /** Days since opt-in. */
  days: number;
  status?: "left" | "removed";
  /** For Left: days between opt-in and leaving. */
  leftAfter?: number;
  /** Fixed member instead of a weighted pick. */
  who?: string;
  manual?: { name: string; email: string };
  note?: string;
}

interface AppSpec {
  id: string;
  creator: string;
  name: string;
  packageName: string | null;
  description: string;
  feedbackGuide: string | null;
  status: AppStatus;
  createdDaysAgo: number;
  testStartDaysAgo: number | null;
  storeUrl?: string;
  deleted?: boolean;
  testers: TesterSpec[];
  builds: [daysAgo: number, versionName: string, changelog: string][];
  summaries: string[];
}

const active = (...days: number[]): TesterSpec[] => days.map((d) => ({ days: d }));

const APPS: AppSpec[] = [
  {
    id: "kas-rt-digital",
    creator: "rizky",
    name: "Kas RT Digital",
    packageName: "id.rizkyramadhan.kasrt",
    description:
      "Catat iuran bulanan warga, pemasukan dan pengeluaran kas RT, lalu bagikan laporan rapi ke grup WhatsApp warga. Bisa dipakai bendahara tanpa harus paham Excel.",
    feedbackGuide:
      "Coba catat 5–10 transaksi iuran dengan nominal berbeda. Apakah laporan bulanan mudah dibaca di layar HP? Apakah tombol bagikan ke WhatsApp menghasilkan teks yang rapi? Ada istilah yang membingungkan untuk ibu-ibu bendahara?",
    status: "testing",
    createdDaysAgo: 26,
    testStartDaysAgo: 22,
    testers: [
      ...active(22, 22, 21, 21, 20, 19, 19, 18, 17, 16, 15, 15, 14),
      {
        days: 20,
        manual: { name: "Ratna Sulastri", email: "ratnasulastri.rt04@gmail.com" },
        note: "Bendahara RT 04, ikut lewat grup WA warga",
      },
      { days: 6 },
      { days: 12, status: "left", leftAfter: 9 },
      { days: 18, status: "removed", note: "Email tidak ada di daftar tester Play Console" },
    ],
    builds: [
      [20, "1.0.1 (3)", "Perbaiki total saldo yang dobel saat edit transaksi"],
      [11, "1.1.0 (5)", "Tambah ekspor laporan ke PDF dan kategori pengeluaran"],
      [1, "1.1.2 (7)", "Format pesan WhatsApp lebih rapi, angka pakai titik ribuan"],
    ],
    summaries: [
      "Laporan bulanan jelas, tapi teks WhatsApp-nya kepanjangan kalau transaksinya banyak.",
      "Saldo sempat dobel setelah edit iuran, di build terbaru sudah aman.",
      "Ibu saya (bendahara RT) bisa pakai tanpa diajari. Font angka bisa lebih besar.",
      "Kategori pengeluaran membantu. Usul: ada pengingat warga yang belum bayar.",
      "PDF laporan rapi, cuma logo RT belum bisa diganti.",
      "Tombol simpan tertutup keyboard di HP layar 5 inci.",
    ],
  },
  {
    id: "adzanku",
    creator: "fajar",
    name: "Adzanku – Widget Jadwal Sholat",
    packageName: "id.fajarnugroho.adzanku",
    description:
      "Widget jadwal sholat di layar utama dengan pengingat adzan, arah kiblat, dan perhitungan Kemenag. Ringan, tanpa iklan, tetap jalan offline untuk 500+ kota di Indonesia.",
    feedbackGuide:
      "Pasang widget di home screen lalu restart HP: apakah jadwalnya tetap muncul dan benar? Apakah pengingat adzan bunyi tepat waktu saat mode hemat baterai aktif? Bagaimana akurasi arah kiblat di lokasimu?",
    status: "applied",
    createdDaysAgo: 32,
    testStartDaysAgo: 28,
    testers: [
      ...active(28, 28, 27, 26, 26, 25, 24, 23, 22, 21, 20, 19, 18, 18),
      { days: 27, status: "left", leftAfter: 16 },
      { days: 20, status: "left", leftAfter: 4 },
    ],
    builds: [
      [27, "2.0.0 (20)", "Rilis closed test pertama"],
      [19, "2.0.1 (21)", "Widget tidak hilang lagi setelah HP restart"],
      [12, "2.1.0 (24)", "Pengingat adzan tetap bunyi di mode hemat baterai Xiaomi"],
      [5, "2.1.1 (25)", "Koreksi jadwal Imsak untuk zona WITA dan WIT"],
    ],
    summaries: [
      "Widget sempat hilang setelah restart di Redmi Note 10, sekarang sudah normal.",
      "Adzan Subuh telat 2 menit dibanding masjid dekat rumah di Makassar.",
      "Arah kiblat akurat dibanding aplikasi lain yang saya pakai.",
      "Pengingat bunyi walau mode hemat baterai aktif. Mantap.",
      "Pilihan suara adzan kurang banyak, tapi ringan sekali.",
      "Jadwal Imsak di Jayapura sempat salah zona, build 2.1.1 sudah benar.",
    ],
  },
  {
    id: "kasirku-warung",
    creator: "dewi",
    name: "KasirKu – Kasir Warung",
    packageName: "id.dewianggraini.kasirwarung",
    description:
      "Aplikasi kasir sederhana untuk warung kelontong: scan barcode pakai kamera, catat utang pelanggan, dan lihat barang yang hampir habis. Data tersimpan di HP, bisa backup ke Google Drive.",
    feedbackGuide:
      "Coba jual 3 barang dengan scan barcode kamera: apakah cepat terbaca di cahaya warung yang redup? Apakah alur mencatat utang pelanggan masuk akal? Fitur apa yang kamu cari tapi tidak ketemu?",
    status: "testing",
    createdDaysAgo: 15,
    testStartDaysAgo: 10,
    testers: [
      ...active(10, 10, 9, 8, 7, 6, 5, 4, 3),
      { days: 9, status: "removed", note: "Akun ganda, sudah terdaftar dengan email lain" },
    ],
    builds: [
      [9, "0.9.0 (9)", "Versi closed test pertama"],
      [4, "0.9.2 (11)", "Scan barcode lebih cepat di cahaya redup, tambah backup Drive"],
    ],
    summaries: [
      "Scan barcode lambat di warung yang lampunya kuning, setelah update lebih cepat.",
      "Catat utang gampang, tapi belum ada pengingat jatuh tempo.",
      "Saya cari fitur stok opname tapi tidak ketemu.",
      "Struk bisa dibagikan ke WA, bagus untuk pelanggan langganan.",
    ],
  },
  {
    id: "trayek-angkot-bandung",
    creator: "hendra",
    name: "Trayek Angkot Bandung",
    packageName: "id.hendragunawan.trayekangkot",
    description:
      "Cari angkot dari titik A ke B di Bandung: nomor trayek, warna angkot, tempat ngetem, dan perkiraan ongkos. Data trayek dikumpulkan dari Dishub dan masukan pengguna.",
    feedbackGuide:
      "Coba cari rute dari tempat tinggalmu ke kampus atau kantor. Apakah warna dan nomor angkot yang disarankan sesuai kenyataan? Apakah peta terbaca jelas di HP layar kecil?",
    status: "recruiting",
    createdDaysAgo: 3,
    testStartDaysAgo: null,
    testers: active(2, 1),
    builds: [[3, "1.0.0 (1)", "Rilis closed test pertama, 38 trayek kota Bandung"]],
    summaries: ["Rute Dago–Kalapa benar, tapi warna angkotnya tertulis hijau padahal hijau-kuning."],
  },
  {
    id: "kosdekat-jogja",
    creator: "wulan",
    name: "KosDekat – Cari Kos Jogja",
    packageName: "id.wulansari.kosdekat",
    description:
      "Cari kos dekat kampus di Jogja berdasarkan harga, fasilitas, dan aturan jam malam. Foto dan info kos diverifikasi langsung oleh pemiliknya, plus kontak WhatsApp pemilik.",
    feedbackGuide:
      "Cari kos di sekitar UGM atau UNY dengan budget di bawah 1 juta. Apakah filter fasilitas (AC, kamar mandi dalam, parkir) bekerja seperti yang kamu harapkan? Apakah foto kos cepat dimuat dengan sinyal pas-pasan?",
    status: "testing",
    createdDaysAgo: 12,
    testStartDaysAgo: 9,
    testers: [...active(9, 8, 8, 6, 5, 3, 2), { days: 7, status: "left", leftAfter: 5 }],
    builds: [
      [8, "1.0.0 (4)", "Rilis closed test, 120 kos di Sleman dan Kota Jogja"],
      [1, "1.0.3 (6)", "Filter jam malam dan foto kos dimuat bertahap"],
    ],
    summaries: [
      "Filter AC dan kamar mandi dalam jalan, tapi filter parkir mobil tidak ngefek.",
      "Foto lama sekali muncul pakai sinyal di Pogung.",
      "Info jam malam sangat membantu, aplikasi lain tidak ada.",
    ],
  },
  {
    id: "hanacaraka",
    creator: "galih",
    name: "Hanacaraka – Belajar Aksara Jawa",
    packageName: "id.galihprasetyo.hanacaraka",
    description:
      "Game belajar aksara Jawa dari carakan dasar sampai sandhangan. Ada mode menulis di layar dengan koreksi goresan, kuis harian, dan papan peringkat antar sekolah.",
    feedbackGuide:
      "Mainkan mode menulis sampai level 5: apakah koreksi goresan terasa adil atau terlalu ketat? Apakah petunjuk sandhangan mudah dipahami tanpa guru? Di level berapa kamu mulai bosan, dan kenapa?",
    status: "testing",
    createdDaysAgo: 24,
    testStartDaysAgo: 19,
    testers: [
      ...active(19, 18, 17, 15, 14, 12, 9, 7, 3),
      {
        days: 16,
        manual: { name: "Joko Susanto", email: "jokosusanto.guru@gmail.com" },
        note: "Guru bahasa Jawa SMP, gabung lewat grup Telegram",
      },
      { days: 21, status: "left", leftAfter: 15 },
    ],
    builds: [
      [18, "0.4.0 (12)", "Closed test: carakan dasar dan mode kuis"],
      [10, "0.5.0 (15)", "Tambah sandhangan wulu, suku, taling dan papan peringkat"],
      [3, "0.5.2 (17)", "Koreksi goresan tidak terlalu ketat untuk huruf ha dan na"],
    ],
    summaries: [
      "Koreksi goresan huruf 'ha' terlalu ketat, sudah lebih enak di 0.5.2.",
      "Anak saya kelas 4 SD betah main sampai level 7.",
      "Penjelasan sandhangan taling dan tarung masih membingungkan tanpa contoh suara.",
      "Mulai bosan di level 6 karena soalnya berulang.",
      "Papan peringkat sekolah bikin murid semangat.",
    ],
  },
  {
    id: "rutin-habit",
    creator: "anisa",
    name: "Rutin – Pelacak Kebiasaan",
    packageName: "id.anisarahma.rutin",
    description:
      "Bangun kebiasaan kecil setiap hari: minum air, baca 10 halaman, olahraga pagi. Ada streak, pengingat yang tidak mengganggu, dan widget progres mingguan.",
    feedbackGuide:
      "Buat 3 kebiasaan dan centang selama beberapa hari. Apakah pengingatnya muncul di waktu yang kamu pilih? Apakah grafik mingguan memotivasi atau malah bikin bingung?",
    status: "recruiting",
    createdDaysAgo: 5,
    testStartDaysAgo: null,
    testers: active(4, 3, 1),
    builds: [],
    summaries: ["Pengingat minum air muncul tepat waktu, widget mingguan belum ada di build ini."],
  },
  {
    id: "catatan-arisan",
    creator: "indah",
    name: "Catatan Arisan",
    packageName: "id.indahpermata.arisan",
    storeUrl: "https://play.google.com/store/apps/details?id=id.indahpermata.arisan",
    description:
      "Kelola arisan keluarga atau kantor: daftar peserta, jadwal kocokan, siapa yang sudah bayar, dan pengingat setoran lewat notifikasi. Sudah rilis di Play Store.",
    feedbackGuide:
      "Buat satu grup arisan dengan 8 peserta dan jalankan satu putaran kocokan. Apakah urutan pemenang tersimpan dengan benar? Apakah pengingat setoran muncul H-1?",
    status: "live",
    createdDaysAgo: 60,
    testStartDaysAgo: 52,
    testers: [
      ...active(52, 51, 51, 50, 49, 48, 46, 45, 43, 40),
      { days: 51, status: "left", leftAfter: 30 },
      { days: 50, status: "left", leftAfter: 21 },
      { days: 47, status: "left", leftAfter: 15 },
      { days: 44, status: "removed", note: "Tidak pernah opt-in di Play Store" },
    ],
    builds: [
      [50, "1.0.0 (1)", "Closed test pertama"],
      [42, "1.0.1 (2)", "Urutan pemenang kocokan tersimpan setelah aplikasi ditutup"],
      [35, "1.1.0 (4)", "Pengingat setoran H-1 dan rekap pembayaran per peserta"],
      [30, "1.1.1 (5)", "Perbaikan tampilan tabel di tablet"],
    ],
    summaries: [
      "Urutan pemenang sempat hilang setelah aplikasi ditutup, sudah diperbaiki.",
      "Pengingat H-1 muncul, ibu-ibu arisan kantor jadi tertib bayar.",
      "Tabel peserta terpotong di tablet, sekarang sudah pas.",
      "Bagus untuk arisan keluarga besar, cuma belum bisa ekspor ke Excel.",
      "Fitur kocokan acak terasa adil, ada animasinya juga.",
    ],
  },
  {
    id: "bank-sampah-warga",
    creator: "teguh",
    name: "Bank Sampah Warga",
    packageName: "id.teguhwibowo.banksampah",
    description:
      "Catat setoran sampah pilah warga per kilogram, hitung saldo tabungan sampah, dan cetak rekap untuk pengurus bank sampah tingkat RW.",
    feedbackGuide:
      "Apakah alur menimbang dan mencatat setoran cukup cepat saat antrean warga ramai? Apakah istilah jenis sampah (PET, duplex, kardus) sudah sesuai yang dipakai di tempatmu?",
    status: "recruiting",
    createdDaysAgo: 0,
    testStartDaysAgo: null,
    testers: [],
    builds: [],
    summaries: [],
  },
  {
    id: "tumbuh-posyandu",
    creator: "nuraini",
    name: "Tumbuh – Catatan Posyandu",
    packageName: "id.nurainilestari.tumbuh",
    description:
      "Catat berat dan tinggi badan balita setiap bulan posyandu, lihat grafik KMS sesuai standar WHO, dan dapatkan pengingat jadwal imunisasi.",
    feedbackGuide:
      "Masukkan data berat badan anak (boleh data contoh) untuk 4 bulan. Apakah grafik KMS mudah dibaca kader posyandu? Apakah pengingat imunisasi muncul sesuai jadwal?",
    status: "testing",
    createdDaysAgo: 14,
    testStartDaysAgo: 8,
    testers: active(8, 8, 7, 5, 4, 2),
    builds: [[7, "1.0.0 (2)", "Closed test: grafik KMS dan jadwal imunisasi dasar"]],
    summaries: [
      "Grafik KMS jelas, warnanya mirip buku KIA jadi kader langsung paham.",
      "Pengingat imunisasi campak muncul sehari lebih awal.",
    ],
  },
  {
    id: "kamus-bali",
    creator: "putu",
    name: "Kamus Bali Sor Singgih",
    packageName: "id.putuary.kamusbali",
    description:
      "Kamus bahasa Bali dengan tingkatan sor singgih (alus, madia, kasar), contoh kalimat sehari-hari, dan pencarian offline.",
    feedbackGuide:
      "Cari 10 kata yang sering kamu pakai. Apakah pembagian alus, madia, dan kasar sudah tepat? Ada kata yang hilang atau salah arti?",
    status: "recruiting",
    createdDaysAgo: 2,
    testStartDaysAgo: null,
    testers: [{ days: 1, who: "ketut" }],
    builds: [],
    summaries: [],
  },
  {
    id: "meteranku",
    creator: "bagus",
    name: "MeteranKu – Catat Token Listrik",
    packageName: "id.baguswicaksono.meteranku",
    description:
      "Catat pembelian token listrik dan angka kWh harian, lalu lihat perkiraan kapan token habis dan rata-rata pemakaian per hari.",
    feedbackGuide:
      "Catat sisa kWh selama 3 hari berturut-turut. Apakah perkiraan tanggal token habis masuk akal? Apakah input angka meteran cukup cepat?",
    status: "testing",
    createdDaysAgo: 13,
    testStartDaysAgo: 11,
    testers: [...active(11, 11, 10, 9, 7, 6, 4, 1), { days: 10, status: "left", leftAfter: 6 }],
    builds: [
      [10, "1.0.0 (3)", "Closed test pertama"],
      [6, "1.0.1 (4)", "Perkiraan token habis memperhitungkan pemakaian akhir pekan"],
    ],
    summaries: [
      "Perkiraan token habis meleset 2 hari, setelah update lebih akurat.",
      "Input angka meteran cepat, keyboard angka langsung muncul.",
      "Grafik pemakaian harian membantu lihat kapan AC paling boros.",
    ],
  },
  {
    id: "hafalan-juz-amma",
    creator: "zaki",
    name: "Hafalan Juz Amma",
    packageName: "id.zakimubarak.juzamma",
    description:
      "Murojaah hafalan Juz Amma dengan audio per ayat, mode sambung ayat, dan penanda hafalan untuk anak TPA maupun orang dewasa.",
    feedbackGuide:
      "Pakai mode sambung ayat untuk 3 surat: apakah jeda audio cukup untuk menyambung? Apakah teks Arab terbaca jelas di ukuran huruf terkecil? Bagaimana pengalaman memakai earphone Bluetooth?",
    status: "testing",
    createdDaysAgo: 20,
    testStartDaysAgo: 17,
    testers: [
      ...active(17, 17, 16, 16, 15, 15, 14, 14, 11, 8, 5),
      {
        days: 15,
        manual: { name: "Lilis Suryani", email: "lilissuryani.tpa@gmail.com" },
        note: "Ustadzah TPA, opt-in sudah dicek di Play Console",
      },
      { days: 13, status: "removed", note: "Akun ganda" },
    ],
    builds: [
      [16, "1.2.0 (14)", "Closed test: audio per ayat dan mode sambung ayat"],
      [9, "1.2.1 (15)", "Jeda audio bisa diatur 2–6 detik"],
      [4, "1.3.0 (18)", "Penanda hafalan dan dukungan tombol earphone Bluetooth"],
    ],
    summaries: [
      "Jeda 2 detik terlalu cepat untuk anak, untung sekarang bisa diatur.",
      "Teks Arab di ukuran terkecil masih jelas, harakat tidak tumpang tindih.",
      "Tombol play/pause di earphone Bluetooth belum berfungsi sebelum 1.3.0.",
      "Mode sambung ayat sangat membantu murojaah sebelum setoran.",
    ],
  },
  {
    id: "cuciin-laundry",
    creator: "ega",
    name: "CuciIn – Order Laundry Kiloan",
    packageName: "id.egafirmansyah.cuciin",
    description:
      "Aplikasi untuk usaha laundry kiloan: terima order, timbang, kirim nota dan status cucian ke pelanggan lewat WhatsApp.",
    feedbackGuide:
      "Buat order 3 kg dengan layanan setrika saja. Apakah nota WhatsApp yang terkirim jelas untuk pelanggan? Apakah status 'siap diambil' mudah diubah?",
    status: "recruiting",
    createdDaysAgo: 7,
    testStartDaysAgo: null,
    testers: active(6, 5, 4, 2, 1),
    builds: [[6, "0.8.0 (8)", "Closed test pertama"]],
    summaries: ["Nota WA jelas, tapi harga per kg belum bisa beda per layanan."],
  },
  {
    // Soft-deleted duplicate submission: hidden from lists and excluded from reciprocity.
    id: "kasirku-duplikat",
    creator: "dewi",
    name: "KasirKu Warung",
    packageName: null,
    description: "Kasir warung kelontong dengan scan barcode dan catatan utang pelanggan.",
    feedbackGuide: null,
    status: "recruiting",
    createdDaysAgo: 16,
    testStartDaysAgo: null,
    deleted: true,
    testers: [{ days: 16, who: "rizky" }],
    builds: [],
    summaries: [],
  },
];

// ---------------------------------------------------------------- generation

interface TesterDoc {
  id: string;
  uid?: string;
  displayName: string;
  /** Manual entries only; masked by the database before it is stored. */
  manualEmail?: string;
  status: "active" | "left" | "removed";
  optedInAt: number;
  leftAt: number | null;
  feedbackSent: boolean;
  feedbackVerified: boolean;
  replied: boolean;
  addedBy: "self" | "creator";
  note: string | null;
  feedbackSentAt: number | null;
  feedbackSummary: string | null;
}

const VERIFIED_NOTES = ["Feedback sudah masuk di Play Console", "Dicek di Play Console", null, null, null];

function weightedPick(pool: Member[]): Member {
  const total = pool.reduce((s, m) => s + m.weight, 0);
  let r = rand() * total;
  for (const m of pool) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return pool[pool.length - 1];
}

function generateTesters(app: AppSpec): TesterDoc[] {
  const taken = new Set<string>([app.creator]);
  const summaries = [...app.summaries];
  return app.testers.map((spec) => {
    const optedInAt = daysAgo(spec.days);
    const status = spec.status ?? "active";
    const leftAt = status === "left" ? optedInAt + (spec.leftAfter ?? 1) * DAY_MS + randInt(1, 6) * HOUR_MS : null;
    const span = Math.floor(((leftAt ?? NOW) - optedInAt) / DAY_MS);

    let identity: Pick<TesterDoc, "id" | "uid" | "displayName" | "manualEmail" | "addedBy">;
    if (spec.manual) {
      identity = {
        id: stableUuid(`tester:${app.id}:${spec.manual.email}`),
        displayName: spec.manual.name,
        manualEmail: spec.manual.email,
        addedBy: "creator",
      };
    } else {
      const m = spec.who ? member(spec.who) : weightedPick(members.filter((x) => x.weight > 0 && !taken.has(x.key)));
      taken.add(m.key);
      identity = { id: stableUuid(`tester:${app.id}:${m.uid}`), uid: m.uid, displayName: m.name, addedBy: "self" };
    }

    // Longer-running testers are more likely to have written feedback on Play.
    const pSent = span >= 14 ? 0.8 : span >= 5 ? 0.5 : span >= 2 ? 0.2 : 0;
    const sent = status !== "removed" ? chance(pSent) : chance(0.2);
    const verified = sent && chance(span >= 10 ? 0.8 : 0.5);
    const replied = sent && chance(verified ? 0.75 : 0.25);
    const feedbackSentAt = sent ? optedInAt + randInt(2, Math.max(2, span)) * DAY_MS + randInt(1, 12) * HOUR_MS : null;
    const summary = sent && summaries.length > 0 && chance(0.75) ? summaries.shift()! : null;

    return {
      ...identity,
      status,
      optedInAt,
      leftAt,
      feedbackSent: sent,
      feedbackSentAt: feedbackSentAt == null ? null : Math.min(feedbackSentAt, leftAt ?? NOW),
      feedbackSummary: summary,
      feedbackVerified: verified,
      replied,
      note: spec.note ?? (verified ? pick(VERIFIED_NOTES) : null),
    };
  });
}


const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function must<T>(label: string, p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  return data;
}

// ---------------------------------------------------------------- reset

async function clearDatabase() {
  const all = "00000000-0000-0000-0000-000000000000";
  for (const table of ["builds", "testers", "apps", "profiles"]) {
    await must(`clear ${table}`, db.from(table).delete().neq("id", all));
  }
  for (;;) {
    const { users } = await must("list users", db.auth.admin.listUsers({ page: 1, perPage: 1000 }));
    if (users.length === 0) break;
    for (const u of users) await must(`delete user ${u.email}`, db.auth.admin.deleteUser(u.id));
  }
}

async function insertAll(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) await must(`insert ${table}`, db.from(table).insert(rows.slice(i, i + 500)));
}

// ---------------------------------------------------------------- main

async function main() {
  await clearDatabase();

  // Same PRNG call order as the original seed (testers, then member dates, then builds),
  // so the community is identical run to run.
  const testersByApp = new Map(APPS.map((a) => [a.id, generateTesters(a)]));
  const joinedAt = new Map(members.map((m) => [m.key, iso(daysAgo(m.joinedDaysAgo))]));

  for (const m of members) {
    await must(
      `create user ${m.email}`,
      db.auth.admin.createUser({
        id: m.uid,
        email: m.email,
        password: DEV_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: m.name },
      }),
    );
    await must(`profile ${m.email}`, db.from("profiles").update({ role: m.role, created_at: joinedAt.get(m.key) }).eq("id", m.uid));
  }
  const profiles = await must("read profiles", db.from("profiles").select("id, masked_email"));
  const maskedOf = new Map(profiles.map((p: { id: string; masked_email: string }) => [p.id, p.masked_email]));
  if (maskedOf.size !== members.length) throw new Error(`expected ${members.length} profiles from the auth trigger, got ${maskedOf.size}`);

  const appRows: Record<string, unknown>[] = [];
  const testerRows: Record<string, unknown>[] = [];
  const buildRows: Record<string, unknown>[] = [];

  for (const app of APPS) {
    const appId = stableUuid(`app:${app.id}`);
    const builds = app.builds.map(([d, versionName, changelog]) => {
      const uploadedAt = daysAgo(d, randInt(1, 5));
      return { versionName, changelog, uploadedAt, createdAt: Math.min(NOW, uploadedAt + randInt(1, 3) * HOUR_MS) };
    });
    // A brand-new app (createdDaysAgo 0) is only a few hours old.
    const createdAt = app.createdDaysAgo === 0 ? NOW - 3 * HOUR_MS : daysAgo(app.createdDaysAgo);
    const lastBuild = Math.max(0, ...builds.map((b) => b.uploadedAt));

    appRows.push({
      id: appId,
      name: app.name,
      description: app.description,
      opt_in_url: `https://play.google.com/apps/testing/${app.packageName ?? "id.dewianggraini.kasirku"}`,
      store_url: app.storeUrl ?? null,
      package_name: app.packageName,
      test_start_date: app.testStartDaysAgo == null ? null : isoDate(daysAgo(app.testStartDaysAgo, 0)),
      feedback_guide: app.feedbackGuide,
      creator_id: member(app.creator).uid,
      status: app.status,
      created_at: iso(createdAt),
      updated_at: iso(Math.max(createdAt, lastBuild)),
      deleted: app.deleted === true,
    });

    for (const t of testersByApp.get(app.id)!) {
      let masked = t.uid ? maskedOf.get(t.uid) : undefined;
      if (t.manualEmail) masked = await must("mask_email", db.rpc("mask_email", { email: t.manualEmail }));
      testerRows.push({
        id: t.id,
        app_id: appId,
        user_id: t.uid ?? null,
        display_name: t.displayName,
        photo_url: null,
        masked_email: masked,
        opted_in_at: iso(t.optedInAt),
        left_at: iso(t.leftAt),
        status: t.status,
        added_by: t.addedBy,
        note: t.note,
        feedback_sent: t.feedbackSent,
        feedback_sent_at: iso(t.feedbackSentAt),
        feedback_summary: t.feedbackSummary,
        feedback_verified: t.feedbackVerified,
        replied: t.replied,
        created_at: iso(t.optedInAt),
      });
    }

    for (const b of builds) {
      buildRows.push({
        app_id: appId,
        version_name: b.versionName,
        changelog: b.changelog,
        uploaded_at: iso(b.uploadedAt),
        created_at: iso(b.createdAt),
      });
    }
  }

  await insertAll("apps", appRows);
  await insertAll("testers", testerRows);
  await insertAll("builds", buildRows);

  // ---- summary, read back from the computed views
  const visible = APPS.filter((a) => !a.deleted);
  console.log(
    `Seeded ${SUPABASE_URL}: ${members.length} members, ${visible.length} apps (+${APPS.length - visible.length} soft-deleted), ${testerRows.length} tester entries, ${buildRows.length} builds.`,
  );
  console.log("");
  const stats = await must("app_stats", db.from("app_stats").select("*"));
  const statsOf = new Map(stats.map((s: { app_id: string }) => [s.app_id, s as Record<string, number | string | null>]));
  console.log("App                                   status      active eligible sent verif builds");
  for (const a of visible) {
    const s = statsOf.get(stableUuid(`app:${a.id}`))!;
    const newBuild = a.builds.some(([d]) => d <= 2) ? " (new build)" : "";
    const col = (k: string, w: number) => String(s[k]).padStart(w);
    console.log(
      `${a.name.padEnd(38)}${a.status.padEnd(12)}${col("active_tester_count", 6)}${col("eligible_count", 9)}${col("feedback_sent_count", 5)}${col("feedback_verified_count", 6)}${col("build_count", 7)}${Number(s.eligible_count) >= 12 ? "  READY" : ""}${newBuild}`,
    );
  }
  console.log("");
  const ps = await must("profile_stats", db.from("profile_stats").select("*"));
  const psOf = new Map(ps.map((p: { profile_id: string; testing_count: number; apps_created_count: number }) => [p.profile_id, p]));
  const ranked = members
    .map((m) => ({ m, p: psOf.get(m.uid)! }))
    .sort((x, y) => y.p.testing_count - x.p.testing_count);
  console.log("Most active testers: " + ranked.slice(0, 5).map(({ m, p }) => `${m.name} (${p.testing_count})`).join(", "));
  const idleCreators = ranked.filter(({ p }) => p.apps_created_count > 0 && p.testing_count === 0).map(({ m }) => m.name);
  console.log(`Creators testing nothing: ${idleCreators.join(", ") || "-"}`);
  const admin = members.find((m) => m.role === "admin")!;
  console.log(`Admin: ${admin.name} <${admin.email}> id ${admin.uid}`);
  console.log(`Dev sign-in: append ?devLogin=<seeded email> to any local URL, e.g. ?devLogin=${admin.email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
