/**
 * studyStats.js — statistik aktivitas belajar harian, murni dari tabel
 * quizAttempts (tanpa menyentuh storage — pemanggil yang mengambil data).
 *
 * Dipakai Home (streak api) dan ProgressView (kalender + riwayat).
 *
 * Kunci hari memakai TANGGAL LOKAL (bukan UTC): timestamp kuis disimpan
 * sebagai ISO UTC, tapi user membaca "hari" dalam zona waktunya sendiri —
 * kuis jam 01:00 pagi (UTC+7) harus tercatat di hari lokal itu, bukan
 * kemarin. Streak juga dihitung dengan kunci yang sama supaya angka api
 * di Home dan titik-titik kalender di ProgressView selalu sejalan.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Kunci hari "YYYY-MM-DD" dari Date, dalam TANGGAL LOKAL.
 * (Date.toISOString() memotong ke UTC — jangan dipakai untuk kunci hari.)
 */
export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Kunci hari lokal dari string ISO (mis. timestamp quizAttempts). */
function isoToLocalDay(iso) {
  return toDateStr(new Date(iso));
}

/** "14:05" — jam lokal 24 jam, dipakai menampilkan jam review jatuh tempo. */
export function formatHHMM(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Selisih hari antara dua kunci "YYYY-MM-DD" (keduanya tanggal lokal). */
function dayKeyGap(a, b) {
  // "YYYY-MM-DD" + "T00:00:00" diparse sebagai tengah malam LOKAL (tanpa Z),
  // konsisten dengan toDateStr. Parse "YYYY-MM-DD" telanjang (tanpa waktu)
  // justru dianggap UTC oleh spec — hindari.
  const from = new Date(`${a}T00:00:00`).getTime();
  const to = new Date(`${b}T00:00:00`).getTime();
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * Seluruh statistik belajar dari log kuis.
 *
 * @param {Array<{timestamp: string}>} attempts - baris quizAttempts
 * @param {Date} now - "sekarang" (disuntik supaya bisa dites)
 * @returns {{
 *   streak: number,          - hari berturut-turut sampai hari ini
 *   doneToday: boolean,      - sudah ada kuis hari ini (warna api di Home)
 *   longestStreak: number,   - rekor hari berturut-turut sepanjang riwayat
 *   daysStudied: number,     - total hari unik yang pernah ada kuis
 *   activity: Map<string, number> - kunci hari lokal → jumlah kuis hari itu
 *     (peta inilah sumber titik "studied" di kalender ProgressView)
 * }}
 */
export function computeStudyStats(attempts, now = new Date()) {
  // Aktivitas per hari lokal (kuis di hari yang sama menumpuk sebagai hitungan).
  const activity = new Map();
  for (const a of attempts || []) {
    if (!a || !a.timestamp) continue;
    const day = isoToLocalDay(a.timestamp);
    activity.set(day, (activity.get(day) || 0) + 1);
  }

  const today = toDateStr(now);
  const doneToday = activity.has(today);

  // Streak berjalan: hitung mundur dari hari ini; kalau hari ini masih
  // kosong, mulai dari kemarin (streak belum "putus" sampai hari ini
  // benar-benar lewat tanpa kuis).
  const cursor = new Date(now);
  if (!doneToday) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activity.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Rekor streak: rentetan hari berurutan terpanjang dari seluruh riwayat
  // (hari aktif diurutkan lalu dihitung rentetannya).
  const days = [...activity.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const day of days) {
    run = prev !== null && dayKeyGap(prev, day) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = day;
  }

  return {
    streak,
    doneToday,
    longestStreak: longest,
    daysStudied: activity.size,
    activity,
  };
}
