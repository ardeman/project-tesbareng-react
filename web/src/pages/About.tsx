import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mark } from '../components/icons'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { TARGET_DAYS, TARGET_TESTERS } from '../lib/progress'
import './about.css'

const P = (name: string, sm = false) => `/about/${name}${sm ? '-sm' : ''}.jpg`
const PHOTOS = {
  house: { src: 'gotong-royong-pindah-rumah', alt: 'Warga nelayan Binuangeun, Banten, memikul sebuah rumah panggung bersama-sama', w: 1600, h: 1067 },
  river: { src: 'kerja-bakti-membersihkan-sungai', alt: 'Warga berdiri di aliran sungai, membersihkan sampah bersama menjelang musim hujan', w: 1600, h: 1067 },
  field: { src: 'aktivitas-kerja-bakti-warga-4', alt: 'Warga desa di kaki bukit membersihkan lapangan bersama pada pagi hari', w: 1600, h: 1200 },
  farm: { src: 'kerja-bakti-gapoktan', alt: 'Kelompok tani bekerja bakti membersihkan saluran air di lahan sayur', w: 1600, h: 1600 },
  alley: { src: 'kerja-bakti-2019-12', alt: 'Warga satu RT memperbaiki saluran air di gang sempit', w: 900, h: 1600 },
  raft: { src: 'pindah-rumah-lanting-131228002', alt: 'Rumah lanting kuning ditarik perahu di Sungai Pela, Kutai Kartanegara', w: 1600, h: 1064 },
  street: { src: 'jakarta-street-scene-3', alt: 'Trotoar Jakarta yang ramai pedagang kaki lima dan pejalan kaki', w: 1600, h: 1181 },
} as const
type PhotoKey = keyof typeof PHOTOS

function Photo({ k, sm, eager, className }: { k: PhotoKey; sm?: boolean; eager?: boolean; className?: string }) {
  const p = PHOTOS[k]
  return (
    <img className={className} src={P(p.src, sm)} alt={p.alt} width={sm ? 560 : p.w} height={sm ? Math.round((560 * p.h) / p.w) : p.h}
      loading={eager ? undefined : 'lazy'} decoding="async" />
  )
}

const RULES: { group: string; items: { name: string; tag: string; text: string; photo: PhotoKey }[] }[] = [
  {
    group: 'Sebagai tester',
    items: [
      { name: 'Biarkan terpasang 14 hari', tag: '14 hari', text: 'Google menghitung tester yang tetap opt-in 14 hari berturut-turut. Uninstall di hari ke-10 berarti mulai lagi dari nol.', photo: 'house' },
      { name: 'Tulis feedback dengan kata sendiri', tag: 'di Play', text: 'Rating plus komentar yang spesifik: apa yang jalan, apa yang rusak, apa yang perlu diperbaiki. Ulasan salinan terlihat tidak asli.', photo: 'river' },
      { name: 'Uji lagi setiap build baru', tag: '3 hari', text: 'Saat kreator mencatat build, perbarui dari Play Store dan coba lagi. Pengumumannya tampil tiga hari.', photo: 'field' },
      { name: 'Tandai feedback di TesBareng', tag: '1 ketuk', text: 'Centang “feedback terkirim” supaya kreator tahu harus mengecek Play Console. Ringkasan maksimal 500 karakter.', photo: 'alley' },
      { name: 'Berhenti dengan terus terang', tag: '1 ketuk', text: 'Kalau harus berhenti, tekan Berhenti menguji. Papan tetap jujur dan kreator tahu kursi mana yang perlu diisi.', photo: 'street' },
    ],
  },
  {
    group: 'Sebagai kreator',
    items: [
      { name: 'Tambahkan grup komunitas', tag: 'sekali', text: `Masukkan ${COMMUNITY_GROUP} sebagai daftar penguji di jalur uji tertutup. Tanpa itu, opt-in anggota tidak terhitung.`, photo: 'farm' },
      { name: 'Tulis panduan sebagai pertanyaan', tag: '500 karakter', text: '“Coba level 3 di layar kecil: tombol lompat mudah ditekan?” lebih berguna daripada teks ulasan siap salin.', photo: 'raft' },
      { name: 'Balas setiap feedback', tag: 'Play Console', text: 'Balas dari Testing feedback, lalu tandai Dibalas. Google melihat apakah pengembang menanggapi penguji.', photo: 'river' },
      { name: 'Rilis build selama uji', tag: '2–3 kali', text: 'Catat setiap unggahan di log build. Tiga pembaruan adalah target komunitas, bukan aturan resmi Google.', photo: 'field' },
      { name: 'Uji aplikasi anggota lain', tag: 'timbal balik', text: 'Angka menguji Anda tampil di setiap aplikasi Anda. Yang membantu, lebih mudah dibantu.', photo: 'house' },
    ],
  },
]

const FAQ = [
  { tab: 'Hitungan', q: 'Kenapa harus 14 hari berturut-turut?', a: 'Akun developer pribadi baru wajib menjalankan uji tertutup dengan minimal 12 tester yang tetap opt-in selama 14 hari berturut-turut sebelum boleh mengajukan akses produksi. Keluar lalu masuk lagi memulai hitungan dari awal.' },
  { tab: 'Privasi', q: 'Apakah email saya terlihat orang lain?', a: 'Hanya versi samaran seperti bu*****@gmail.com, dan itu berlaku juga untuk kreator. Email lengkap disimpan di data pribadi akun Anda saja, tidak pernah di halaman publik.' },
  { tab: 'Sinkron', q: 'Apakah TesBareng tersambung ke Play Console?', a: 'Tidak. Google tidak menyediakan API publik untuk data opt-in, jadi semua dicatat sendiri oleh anggota. Kreator memverifikasi feedback dengan mengeceknya di Play Console.' },
  { tab: 'Feedback', q: 'Di mana saya menulis feedback?', a: 'Di Google Play, pada halaman aplikasinya. Feedback itu masuk ke Play Console kreator di bagian Testing feedback. Di TesBareng Anda hanya menandai bahwa feedback sudah dikirim.' },
  { tab: 'Build', q: 'Kenapa kreator perlu merilis build baru?', a: 'Google juga menilai apakah aplikasi diperbarui selama uji. Dua sampai tiga pembaruan adalah kebiasaan komunitas yang membantu, bukan syarat resmi.' },
  { tab: 'Berhenti', q: 'Bagaimana kalau saya berhenti di tengah?', a: 'Tekan Berhenti menguji di halaman aplikasinya. Nama Anda tetap tercatat sebagai riwayat, tetapi tidak lagi dihitung dalam 12 kursi.' },
]

const dayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    document.documentElement.classList.add('js')
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 })
    el.querySelectorAll('[data-reveal], .ab-mark').forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [root])
}

export function About() {
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  useEffect(() => { document.title = 'Cara kerja · TesBareng' ; return () => { document.title = 'TesBareng' } }, [])

  return (
    <div className="about" ref={root}>
      <a className="skip" href="#isi">Lewati ke isi</a>
      <header className="ab-top">
        <Link to="/" className="ab-brand"><Mark size={28} />TesBareng</Link>
        <nav aria-label="Navigasi utama">
          <Link to="/">Aplikasi</Link>
          <Link to="/me">Tugas saya</Link>
          <a href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer">Grup</a>
        </nav>
      </header>

      <section className="ab-hero" aria-labelledby="ab-h1">
        <div className="ab-hero-text">
          <h1 id="ab-h1" data-reveal>12 kursi, 14&nbsp;hari, bareng.</h1>
          <p data-reveal style={{ ['--d' as string]: '90ms' }}>
            TesBareng adalah papan bersama komunitas Google Tester Indonesia. Anggota saling menguji aplikasi, supaya setiap aplikasi mendapat 12 tester yang bertahan 14 hari di uji tertutup Google Play.
          </p>
          <Link to="/" className="ab-btn" data-reveal style={{ ['--d' as string]: '180ms' }}>Lihat aplikasi yang butuh tester</Link>
        </div>
        <div className="ab-hero-shape" aria-hidden="false">
          <figure className="ab-hero-photo">
            <div className="ab-hero-img"><Photo k="house" eager /></div>
            <figcaption>Warga Binuangeun, Banten, memindahkan rumah bersama.</figcaption>
          </figure>
        </div>
      </section>

      <main id="isi">
        <section className="ab-intro" aria-label="Kenapa bareng">
          <p data-reveal>
            Seperti warga yang memikul <Thumb k="house" /> satu rumah bersama, setiap aplikasi di sini dipikul dua belas orang <Thumb k="alley" />,
            dan setiap orang itu bergiliran memikul aplikasi <Thumb k="raft" /> milik yang lain.
          </p>
        </section>

        <section className="ab-steps" aria-labelledby="ab-steps-h">
          <div className="ab-steps-grid">
            <h2 id="ab-steps-h" data-reveal>Dari gabung sampai produksi</h2>
            {[
              { k: 'street' as PhotoKey, t: 'Gabung grupnya', d: 'Masuk ke Google Group komunitas dengan akun Google di HP Anda.' },
              { k: 'alley' as PhotoKey, t: 'Opt-in, lalu pasang', d: 'Buka link opt-in tiap aplikasi, ketuk Jadi penguji, pasang, dan biarkan 14 hari.' },
              { k: 'river' as PhotoKey, t: 'Pakai, lalu tulis di Play', d: 'Ikuti panduan kreator, tulis feedback dengan kata sendiri, lalu tandai di sini.' },
              { k: 'farm' as PhotoKey, t: 'Ajukan produksi', d: '12 tester lewat 14 hari, feedback dibalas, ada build baru: kreator mengajukan akses produksi.' },
            ].map((s, i) => (
              <div className={`ab-step s${i + 1}`} key={s.t}>
                <div className="ab-tile" data-reveal style={{ ['--d' as string]: `${i * 80}ms` }}><Photo k={s.k} sm={i < 2} /></div>
                <h3 data-reveal style={{ ['--d' as string]: `${i * 80 + 60}ms` }}>{s.t}</h3>
                <p data-reveal style={{ ['--d' as string]: `${i * 80 + 120}ms` }}>{s.d}</p>
              </div>
            ))}
          </div>
          <Calculator />
        </section>

        <RulesIndex />
        <Faq />

        <section className="ab-cta" aria-labelledby="ab-cta-h">
          <div className="ab-cta-side left" data-reveal><Photo k="field" sm /></div>
          <div className="ab-cta-main" data-reveal style={{ ['--d' as string]: '80ms' }}>
            <h2 id="ab-cta-h">Isi satu kursi hari ini</h2>
            <p>Aplikasi dengan kursi paling kosong ada di urutan teratas. Tiga langkah, lalu biarkan 14 hari.</p>
            <div className="ab-cta-actions">
              <Link to="/" className="ab-btn ink">Lihat aplikasi yang butuh tester</Link>
              <a className="ab-link light" href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer">Gabung grup dulu</a>
            </div>
          </div>
          <div className="ab-cta-side right" data-reveal style={{ ['--d' as string]: '160ms' }} />
        </section>
      </main>

      <footer className="ab-foot">
        <FooterMark />
        <div className="ab-foot-cols">
          <nav aria-label="Tautan footer">
            <Link to="/">Aplikasi</Link>
            <Link to="/me">Tugas saya</Link>
            <Link to="/apps/new">Tambah aplikasi</Link>
            <a href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer">Google Group</a>
          </nav>
          <p>Komunitas Google Tester Indonesia<br /><a href={`mailto:${COMMUNITY_GROUP}`}>{COMMUNITY_GROUP}</a></p>
        </div>
        <p className="credits">
          Foto: <a href="https://commons.wikimedia.org/wiki/File:Gotong_Royong_Pindah_Rumah.jpg">“Gotong Royong Pindah Rumah”</a> oleh Herusutimbul, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Kerja_bakti_membersihkan_sungai.jpg">“Kerja bakti membersihkan sungai”</a> oleh ERWINSALEH, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Aktivitas_Kerja_Bakti_Warga_4.jpg">“Aktivitas Kerja Bakti Warga 4”</a> oleh Fajrul Fala, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Kerja_Bakti_Gapoktan.jpg">“Kerja Bakti Gapoktan”</a> oleh Azril Joyy, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Kerja_bakti_2019_12.jpg">“Kerja bakti 2019 12”</a> oleh Dian Murdiana, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Pindah_Rumah_Lanting_131228002.JPG">“Pindah Rumah Lanting 131228002”</a> oleh Ezagren, <a href="https://creativecommons.org/licenses/by-sa/4.0">CC BY-SA 4.0</a>;{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Jakarta_street_scene_(3).jpg">“Jakarta street scene (3)”</a> oleh Radosław Botev, <a href="https://creativecommons.org/licenses/by/3.0/pl/deed.en">CC BY 3.0</a>. Semua via Wikimedia Commons.
        </p>
        <div className="ab-foot-last">
          <span>TesBareng, dibuat komunitas untuk komunitas.</span>
          <a href="#ab-h1" className="ab-btn sm">Ke atas</a>
        </div>
      </footer>
    </div>
  )
}

function Thumb({ k }: { k: PhotoKey }) {
  const p = PHOTOS[k]
  return <span className="ab-thumb"><img src={P(p.src, true)} alt={p.alt} width={56} height={44} loading="lazy" decoding="async" /></span>
}

/** The live thing: the 12 × 14 board filled to today from the date the twelfth seat was taken. */
function Calculator() {
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 9); return toIso(d) })
  const startDate = useMemo(() => new Date(`${start}T00:00:00`), [start])
  const valid = !Number.isNaN(startDate.getTime())
  const elapsed = valid ? Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86_400_000)) : 0
  const [day, setDay] = useState<number | null>(null)
  const shown = Math.min(TARGET_DAYS, day ?? elapsed)
  const apply = valid ? new Date(startDate.getTime() + TARGET_DAYS * 86_400_000) : null
  const left = TARGET_DAYS - Math.min(TARGET_DAYS, elapsed)

  return (
    <div className="ab-calc" data-reveal>
      <div className="ab-calc-text">
        <h3>Kapan aplikasi Anda boleh ajukan produksi?</h3>
        <label className="ab-field">
          <span>Tanggal kursi ke-12 terisi</span>
          <input type="date" value={start} max={toIso(new Date())} onChange={(e) => { setStart(e.target.value); setDay(null) }} />
        </label>
        <p className="ab-calc-answer" aria-live="polite">
          {apply ? (left === 0
            ? <>Sudah lewat 14 hari sejak {dayFmt.format(startDate)}. Selama 12 tester tetap opt-in, Anda bisa mengajukan sekarang.</>
            : <>Paling cepat <b>{dayFmt.format(apply)}</b>, {left} hari lagi, asal kedua belas tester tidak ada yang keluar.</>)
            : 'Pilih tanggal untuk menghitung.'}
        </p>
        <label className="ab-field">
          <span>Geser untuk melihat hari ke-{shown}</span>
          <input type="range" min={0} max={TARGET_DAYS} value={shown} onChange={(e) => setDay(Number(e.target.value))} aria-valuetext={`Hari ke-${shown} dari ${TARGET_DAYS}`} />
        </label>
      </div>
      <svg className={`ab-calc-board ${shown === TARGET_DAYS ? 'done' : ''}`} viewBox={`0 0 ${TARGET_DAYS * 34 - 6} ${TARGET_TESTERS * 26 - 6}`} role="img"
        aria-label={`Papan 12 kursi pada hari ke-${shown}: ${shown === TARGET_DAYS ? 'semua kursi lulus 14 hari' : `${TARGET_DAYS - shown} hari lagi`}`}>
        {Array.from({ length: TARGET_TESTERS }, (_, r) => Array.from({ length: TARGET_DAYS }, (_, c) => (
          <rect key={`${r}-${c}`} x={c * 34} y={r * 26} width={28} height={20} rx={6} className={c < shown ? 'on' : ''} style={{ ['--i' as string]: c }} />
        )))}
      </svg>
    </div>
  )
}

function RulesIndex() {
  const [preview, setPreview] = useState<PhotoKey>(RULES[0].items[0].photo)
  const [label, setLabel] = useState(RULES[0].items[0].name)
  const show = (el: HTMLElement, k: PhotoKey) => {
    setPreview(k)
    setLabel(el.querySelector('b')?.textContent ?? '')
  }
  return (
    <section className="ab-rules" aria-labelledby="ab-rules-h">
      <h2 id="ab-rules-h" data-reveal>Aturan main</h2>
      <div className="ab-index">
        <div className="ab-index-list">
          {RULES.map((g) => (
            <div key={g.group} className="ab-rule-group">
              <div className="ab-rule-head" data-reveal><h3>{g.group}</h3><span>{g.items.length} kebiasaan</span></div>
              <ul>
                {g.items.map((it, i) => (
                  <li key={it.name} data-reveal style={{ ['--d' as string]: `${i * 70}ms` }}>
                    <div className="ab-rule" tabIndex={0}
                      onPointerEnter={(e) => show(e.currentTarget, it.photo)} onFocus={(e) => show(e.currentTarget, it.photo)}>
                      <span className="ab-bullet"><img src={P(PHOTOS[it.photo].src, true)} alt="" width={64} height={50} loading="lazy" decoding="async" /></span>
                      <span className="ab-rule-body">
                        <span className="ab-rule-line"><b>{it.name}</b><span className="ab-tag">{it.tag}</span></span>
                        <span className="ab-rule-text">{it.text}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <figure className="ab-index-frame" aria-hidden="true">
          <div className="ab-index-img"><img key={preview} src={P(PHOTOS[preview].src)} alt="" /></div>
          <figcaption>{label}</figcaption>
        </figure>
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section className="ab-faq" aria-labelledby="ab-faq-h">
      <h2 id="ab-faq-h" data-reveal>Yang sering ditanyakan</h2>
      <div className="ab-cards">
        {FAQ.map((f, i) => (
          <div key={f.tab} className={`ab-card c${i % 3} ${open === i ? 'open' : ''}`} style={{ ['--i' as string]: i, zIndex: i + 1 }}>
            <span className="ab-card-tab" aria-hidden="true">{f.tab}</span>
            <h3>
              <button aria-expanded={open === i} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(i)}>{f.q}</button>
            </h3>
            <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="ab-card-a" hidden={open !== i}>
              <p>{f.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FooterMark() {
  const heights = [100, 82, 94, 70, 100, 88, 76, 96, 64, 86, 72, 92]
  const w = 100, gap = 4, H = 300
  return (
    <svg className="ab-mark" viewBox={`0 0 ${12 * w + 11 * gap} ${H}`} preserveAspectRatio="none" role="img" aria-label="TesBareng: dua belas kursi, delapan sudah terisi">
      {heights.map((h, i) => {
        const bh = (h / 100) * H
        return <rect key={i} x={i * (w + gap)} y={H - bh} width={w} height={bh} rx={14} className={i < 8 ? 'on' : ''} style={{ ['--i' as string]: i }} />
      })}
    </svg>
  )
}
