/**
 * strings/id.js — kamus Bahasa Indonesia. Kunci HARUS identik dengan
 * strings/en.js (t() melengkapi kunci yang hilang dari kamus en — jadi
 * kunci id yang salah ketik diam-diam memakai teks Inggris).
 *
 * Istilah yang SENGAJA tidak diterjemahkan:
 *  - "review" (kata serapan standar konteks belajar; "ulasan" salah makna)
 *  - "kanji", "kana", "romaji", "JLPT", "unit", "level", "SRS"
 *  - "On'yomi"/"Kun'yomi" (label Jepang baku di baris bacaan)
 *  - Nama produk, nama lisensi, dan seluruh seksi Data sources di Help
 *    (teks legal/kredit — konvensi aplikasi: biarkan dalam bahasa aslinya)
 */
export default {
  // ---- umum ----
  "common.home": "Beranda",
  "common.cancel": "Batal",
  "common.close": "Tutup",
  "common.delete": "Hapus",
  "common.loading": "Memuat…",

  // ---- App.jsx ----
  "app.loading": "Memuat progresmu…",
  "app.session.aria": "Mempelajari {level} {unit}",
  "app.quizExit.aria": "Keluar dari kuis ini",
  "app.topbarBack.aria": "Kembali ke beranda",
  "app.exitDialog.text": "Keluar dari sesi ini? Jawabanmu sejauh ini tidak akan disimpan.",
  "app.exitDialog.keep": "Lanjut belajar",
  "app.exitDialog.leave": "Keluar",
  "app.toast.notifBlocked": "Notifikasi Kanjichō diblokir. Izinkan lewat pengaturan sistem.",
  "app.toast.notEnoughKanji": "Level ini tidak punya cukup kanji untuk membuat pengecoh.",
  "app.toast.noMissed": "Tidak ada kanji yang salah di unit ini saat ini.",
  "app.toast.progressDeleted": "Progres {level} dihapus",
  "app.session.unit": "Unit {n}",
  "app.session.unitReview": "Unit {n} · review",
  "app.session.missed": "Review salah",

  // ---- Tutorial.jsx ----
  "tour.welcome.title": "Selamat datang di Kanjichō",
  "tour.welcome.body":
    "Pelajari kanji JLPT lewat kuis-kuis singkat, dan biarkan app menghadirkan tiap kanji kembali untuk review tepat sebelum kamu mulai lupa. Tur singkat, sekitar setengah menit.",
  "tour.level.title": "Pilih level JLPT",
  "tour.level.body":
    "Tiap level punya kanji dan unitnya sendiri. Mulai dari level yang kamu tuju; progresmu akan tampil di kartu-kartu ini seiring kamu belajar. Ketuk level mana pun untuk lanjut.",
  "tour.unit.title": "Pilih unit",
  "tour.unit.body": "Unit adalah kumpulan kecil kanji dengan satu kuis. Ketuk satu untuk masuk.",
  "tour.script.title": "Kana atau romaji",
  "tour.script.body":
    "Sakelar ini bekerja di mana saja. Bacaan di kuis dan di pustaka kanji berganti antara kana dan romaji begitu kamu mengetuknya.",
  "tour.choices.title": "Cara kerja soal",
  "tour.choices.body": "Pilih jawaban yang cocok dengan bacaan kanji itu.",
  "tour.back.title": "Punggung kartu",
  "tour.back.body":
    "Bacaan yang dicetak tebal adalah asal pilihan jawabannya. Ketuk kanji kecil di pojok untuk melihat cara penulisannya.",
  "tour.srs.title": "Jadwalnya urus dirinya sendiri",
  "tour.srs.body":
    "Setelah kuis selesai, app menjadwalkan review berikutnya untuk unit itu dengan pengulangan berjarak (spaced repetition), tepat sebelum kamu mulai lupa. Itulah seluruh siklus belajarnya.",
  "tour.calendar.title": "Kalender review-mu",
  "tour.calendar.body":
    "Ketuk kartu ini kapan pun untuk membuka kalender review. Ia menunjukkan kapan tiap unit jatuh tempo dan hari-hari kamu belajar, jadi jadwal tidak pernah jadi teka-teki.",
  "tour.browse.title": "Jelajahi semua kanji",
  "tour.browse.body":
    "Pustaka kanji memuat semua kanji di app ini, lengkap dengan animasi goresan, bacaan, komponen, dan contoh kata. Buka kapan pun kamu ingin mencari satu.",
  "tour.finale.title": "Tur selesai!",
  "tour.finale.body":
    "Belajarlah sedikit demi sedikit, dan jangan lupa me-review kanji yang kamu jawab salah. がんばろう!",
  "tour.start": "Mulai tur",
  "tour.gotIt": "Mengerti",
  "tour.skip": "Lewati tur",
  "tour.aria": "Tur: {title}",

  // ---- Quiz.jsx ----
  "quiz.modeBadge.weak": "Review kanji yang salah",
  "quiz.question": "Soal {n} dari {m}",
  "quiz.dontKnow": "Tidak tahu",
  "quiz.continue": "Lanjut",
  "quiz.seeResults": "Lihat Hasil",
  "quiz.swipeHint": "Geser kartu ke samping untuk membaliknya",

  // ---- HelpButton.jsx ----
  "help.aria": "Bantuan & tentang",
  // (t90) Label BAB — Help kini tiga grup: pengaturan / panduan / tentang.
  "help.groupSettings": "Pengaturan",
  "help.groupGuide": "Panduan",
  "help.groupAbout": "Tentang",
  "help.getting": "Memulai",
  "help.intro":
    "Baru di Kanjichō? Tur bawaan akan mengantarmu melewati level, unit, kuis, dan pustaka kanji dalam sekitar setengah menit.",
  "help.replay": "Putar ulang tur",
  "help.language": "Bahasa",
  "help.quiz": "Kuis",
  "help.blur": "Buramkan pilihan jawaban",
  "help.blurDesc":
    "Ingat bacaannya dulu; ketukan pertama menghapus blur, ketukan berikutnya menjawab",
  "help.autoflip": "Balik kartu otomatis",
  "help.autoflipDelay": "Jeda balik otomatis",
  // (t98) Penjelasan jadwal review pindah ke bab PANDUAN (help.schedule*) —
  // seksi Kuis di Pengaturan kini murni kontrol.
  "help.schedule": "Jadwal review",
  "help.scheduleText.a":
    "Saat pertama kali menyelesaikan sebuah unit, review-nya selalu dijadwalkan 1–2 hari ke depan (8 hari untuk skor sempurna). App memakai tanggal awal itu sebagai titik acu untuk review berikutnya, jadi jangan ragu menjawab ",
  "help.scheduleText.b": ": jawaban jujur menjaga jadwalmu tetap akurat.",
  "help.reminders": "Pengingat",
  "help.remindersToggle": "Pengingat review",
  "help.remindersDesc": "Kabar kecil saat review jatuh tempo",
  // (t94) Dua mode pengingat — pill pilihan di bawah sakelar.
  "help.reminderMode": "Cara mengingatkan",
  "help.reminderModeTime": "Jam tertentu",
  "help.reminderModeDue": "Saat jatuh tempo",
  "help.reminderTime": "Jam pengingat",
  // (t98) Paragraf penjelas mode pengingat dihapus atas permintaan user —
  // dua pill + input jam sudah menjelaskan dirinya.
  "help.browse": "Jelajahi kanji",
  "help.browseText.a": "Pada komponen sebuah kanji, titik",
  "help.browseText.b": "merah menandai",
  "help.browseText.radical": "radikal",
  "help.browseText.c": ", bagian pembawa makna, dan titik",
  "help.browseText.d": "biru menandai",
  "help.browseText.phonetic": "fonetik",
  "help.browseText.e":
    ", bagian pembawa bunyi. Ketuk sebuah komponen untuk membuka halamannya sendiri.",
  "help.progress": "Progres",
  "help.resetToggle": "Tombol reset progres",
  "help.resetDesc": "Tampilkan tombol reset",
  "help.contact": "Kontak",
  "help.privacy": "Kebijakan privasi",
  "help.licenses": "Lisensi open-source",

  // ---- BackupControls.jsx ----
  "backup.export": "Ekspor progres",
  "backup.import": "Impor progres",
  "backup.confirm":
    "Impor akan MENGGANTI seluruh progres di perangkat ini dengan isi file backup.\nLanjutkan?",
  "backup.exportFail": "Ekspor gagal: {msg}",
  "backup.importFail": "Impor gagal: {msg}",

  // ---- Home.jsx ----
  "home.badge.new": "Baru",
  "home.badge.mastered": "Dikuasai",
  "home.badge.due": "{n} review",
  "home.browse.title": "Jelajahi semua kanji",
  "home.browse.small": "Pustaka referensi · N5–N1",
  "home.levels": "Pilih Level JLPT",
  "home.levelCount": "{kanji} kanji · {units} unit",
  "home.levelCountOne": "{kanji} kanji · {units} unit",

  // ---- UnitSelect.jsx ----
  "unit.status.new": "Belum mulai",
  "unit.status.due": "Review sekarang",
  "unit.status.scheduled": "Terjadwal",
  "unit.status.mastered": "Dikuasai",
  "unit.in": "dalam {label}",
  "unit.section": "Unit {level}",
  "unit.reset": "Reset progres",
  "unit.reset.title":
    "Hapus progres level ini: jadwal SRS, riwayat kuis, dan kanji yang salah. Level lain tidak terpengaruh.",
  "unit.missed.aria": "Review {n} kanji yang salah",
  "unit.missed.title":
    "Kuis {n} kanji yang salah di unit ini. Jadwalmu tidak berubah",
  "unit.dialog.resetTitle": "Hapus semua progres {level}?",
  "unit.dialog.resetLine2":
    "Jadwal SRS, riwayat kuis, dan kanji yang salah untuk level ini akan dihapus",
  "unit.dialog.resetLine3": "level lain tidak terpengaruh",
  "unit.dialog.missed1": "Unit ini masih punya {n} kanji yang salah",
  "unit.dialog.missed2": "latihan terbuka lagi setelah semuanya selesai direview",
  "unit.dialog.notDue1": "Unit ini belum jatuh tempo",
  "unit.dialog.notDue2": "latihan tidak akan mengubah jadwal review-mu",
  "unit.dialog.review": "Review",
  "unit.dialog.practice": "Latihan",

  // ---- StatCards.jsx ----
  "stat.studied": "Dipelajari",
  "stat.dueNow": "Perlu review",
  "stat.nextDue": "Review berikutnya",
  "stat.mastered": "Dikuasai",
  "stat.group": "Statistik belajar",
  "stat.streak.done": "Streak {n} hari, hari ini sudah",
  "stat.streak.risk": "Streak {n} hari, kuis hari ini agar tetap hidup",
  "stat.due.title": "{n} unit siap direview. Lihat apa yang jatuh tempo dan kapan",
  "stat.due.titleOne": "{n} unit siap direview. Lihat apa yang jatuh tempo dan kapan",
  "stat.next.title": "Tidak ada unit jatuh tempo. Review berikutnya dalam {label}",
  "stat.due.aria": "Perlu review: {n} unit, buka kalender review",
  "stat.due.ariaOne": "Perlu review: {n} unit, buka kalender review",
  "stat.next.aria": "Review berikutnya dalam {label}, buka kalender review",
  "stat.none.aria": "Perlu review: tidak ada, buka kalender review",
  "stat.cal.title": "Buka kalender review",

  // ---- Result.jsx ----
  "result.missed": "Review salah",
  "result.correct": "Benar",
  "result.wrong": "Salah",
  "result.dontKnow": "Tidak tahu",
  "result.next": "Review berikutnya dalam",
  "result.scheduleUnchanged": "jadwal tidak berubah",
  "result.stillMissed": "{n} kanji masih salah",
  "result.noMissed": "Tidak ada kanji yang salah",
  "result.reviewAgain": "Review lagi",
  "result.backToUnits": "Kembali ke Unit",

  // ---- Browse.jsx ----
  "browse.title": "Pustaka kanji",
  "browse.count": "{n} kanji",
  "browse.countIn": "{n} kanji di {lv}",
  "browse.search": "Cari kanji, arti, bacaan…",
  "browse.search.aria": "Cari kanji",
  "browse.clear": "Hapus pencarian",
  "browse.noMatch": "Tidak ada kanji yang cocok dengan \u201c{q}\u201d.",
  "browse.showMore": "Tampilkan lagi (sisa {n})",
  "browse.loadingLevel": "Memuat {lv}…",
  "browse.back": "Kembali ke {kanji}",
  "browse.strokes": "{n} goresan",
  "browse.strokeOne": "1 goresan",

  // ---- ReviewCalendar.jsx ----
  "cal.today": "Hari ini",
  "cal.prev": "Bulan sebelumnya",
  "cal.next": "Bulan berikutnya",
  "cal.weekdays": "Min Sen Sel Rab Kam Jum Sab",
  "cal.units": "{n} unit",
  "cal.unitOne": "{n} unit",
  "cal.cellDue": "{n} jatuh tempo",
  "cal.cellStudied": "dipelajari",
  "cal.empty.today": "Tidak ada review hari ini",
  "cal.empty.day": "Tidak ada review di hari itu",
  "cal.overdue": "terlambat",
  "cal.reviewNow": "Review {unit} sekarang",
  "cal.quizzesOne": "1 kuis selesai",
  "cal.quizzes": "{n} kuis selesai",
  "cal.todayWord": "hari ini",
  "cal.thisDayWord": "hari itu",

  // ---- CalendarModal.jsx ----
  "cal.modal.title": "Kalender review",
  "cal.modal.scopeLevel": "Unit {level}",
  "cal.modal.scopeAll": "Semua level",

  // ---- dueFormat.js ----
  "dur.now": "sekarang",
  "dur.underMinute": "kurang dari semenit",
  "dur.min": "{n} menit",
  "dur.hourOne": "1 jam",
  "dur.hours": "{n} jam",
  "dur.dayOne": "1 hari",
  "dur.days": "{n} hari",

  // ---- ScriptToggle.jsx ----
  "script.romaji.title": "Tampilkan bacaan dalam romaji (r)",
  "script.kana.title": "Tampilkan bacaan dalam kana (r)",
  "script.romaji.aria": "Tampilkan bacaan dalam romaji",
  "script.kana.aria": "Tampilkan bacaan dalam kana",

  // ---- ThemeToggle.jsx ----
  "theme.light.title": "Ganti ke mode terang",
  "theme.dark.title": "Ganti ke mode gelap",
  "theme.light.label": "Terang",
  "theme.dark.label": "Gelap",

  // ---- CopyKanji.jsx ----
  "copy.aria": "Salin {kanji} ke clipboard",
  "copy.title": "Salin {kanji}",
  "copy.done": "{kanji} tersalin",

  // ---- StrokePlayer.jsx ----
  "stroke.aria": "Animasi urutan goresan, {n} goresan",
  "stroke.replay": "Putar ulang",
  "stroke.pause": "Jeda",
  "stroke.play": "Putar",
  "stroke.prev": "Goresan sebelumnya",
  "stroke.next": "Goresan berikutnya",
  "stroke.speed": "Kecepatan animasi",
  "stroke.speedAria": "Kecepatan animasi {s}x",

  // ---- ComponentBreakdown.jsx ----
  "comp.radical": "Radikal: komponen pembawa makna",
  "comp.phonetic": "Fonetik: komponen pembawa bunyi",
  "comp.label": "Komponen",
  "comp.loose": "{n} goresan bukan bagian komponen bernama",
  "comp.looseOne": "1 goresan bukan bagian komponen bernama",
  "comp.show": "Lihat komponen {k}",
  "comp.aria": "Komponen: {eq}",

  // ---- Notifikasi Android (reminderPlan.js) ----
  "notif.title": "Saatnya review",
  "notif.bodyOne": "1 unit menunggu review.",
  "notif.bodyMany": "{n} unit menunggu review.",
};
