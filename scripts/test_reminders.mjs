/**
 * test_reminders.mjs — uji murni perencanaan pengingat review (t86, t94, t98).
 * reminderPlan.js sengaja bebas Capacitor/DOM supaya bisa diuji di Node.
 * Jalankan: node scripts/test_reminders.mjs
 *
 * (t94) Pengingat punya dua mode:
 * - "time": satu nudge harian di jam pilihan user (default 09.00);
 * - "due" : nudge PADA momen due (merge rantai 30 menit; t98: jam malam
 *   tidak lagi ditahan — notifikasi menyala persis saat due, DND OS
 *   urusan user).
 */
import {
  REMINDER_MODES,
  DEFAULT_REMINDER_MODE,
  DEFAULT_REMINDER_TIME,
  REMINDER_MERGE_MS,
  REMINDER_IDS,
  REMINDER_BATCH_MAX,
  parseReminderTime,
  normalizeReminderTime,
  nextDailyAt,
  computeReminderBatch,
  reminderBody,
} from "../src/lib/reminderPlan.js";

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${msg}`);
  }
}

function at(y, mo, d, h, mi = 0) {
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}
function iso(y, mo, d, h, mi = 0) {
  return at(y, mo, d, h, mi).toISOString();
}
const eq = (a, b) => a.getTime() === b.getTime();

console.log("Konstanta mode (t94)");
assert(
  REMINDER_MODES.length === 2 && REMINDER_MODES.includes("time") && REMINDER_MODES.includes("due"),
  `mode yang dikenal: ${REMINDER_MODES.join(", ")}`
);
assert(DEFAULT_REMINDER_MODE === "due", `default mode "due" (dapat "${DEFAULT_REMINDER_MODE}")`);
assert(DEFAULT_REMINDER_TIME === "09:00", `default jam "09:00" (dapat "${DEFAULT_REMINDER_TIME}")`);
assert(
  REMINDER_IDS.length === REMINDER_BATCH_MAX,
  `jumlah id sama dengan batch max (${REMINDER_IDS.length})`
);
assert(REMINDER_MERGE_MS === 30 * 60 * 1000, "jendela merge 30 menit");

console.log("\nparseReminderTime / normalizeReminderTime");
assert(
  parseReminderTime("09:00") && parseReminderTime("09:00").h === 9 && parseReminderTime("09:00").m === 0,
  "\"09:00\" → {9, 0}"
);
assert(
  parseReminderTime("8:05") && parseReminderTime("8:05").h === 8 && parseReminderTime("8:05").m === 5,
  "\"8:05\" (tanpa nol) → {8, 5}"
);
assert(parseReminderTime("23:59") !== null, "\"23:59\" valid (batas atas)");
assert(parseReminderTime("24:00") === null, "\"24:00\" ditolak");
assert(parseReminderTime("09:60") === null, "\"09:60\" ditolak");
assert(parseReminderTime("abc") === null, "bukan jam → null");
assert(parseReminderTime(null) === null, "null → null");
assert(normalizeReminderTime("9:5") === "09:05", "normalisasi \"9:5\" → \"09:05\"");
assert(normalizeReminderTime("junk") === null, "normalisasi invalid → null");

console.log("\nnextDailyAt — kejadian jam harian berikutnya");
{
  const t = (msg, input, h, m, expDayShift) => {
    const got = nextDailyAt(input, h, m);
    const base = input instanceof Date ? input : new Date(input);
    const exp = new Date(base);
    exp.setDate(exp.getDate() + (expDayShift || 0));
    exp.setHours(h, m, 0, 0);
    assert(eq(got, exp), `${msg}: → ${got.toString()} (harapan ${exp.toString()})`);
  };
  // 07.59, jam 08.00 → hari yang sama
  t("07.59 → 08.00", at(2026, 9, 12, 7, 59), 8, 0, 0);
  // tepat 08.00 → saat itu juga (inklusif)
  t("08.00 tepat", at(2026, 9, 12, 8, 0), 8, 0, 0);
  // 08.01 → besok
  t("08.01 → besok 08.00", at(2026, 9, 12, 8, 1), 8, 0, 1);
  // dengan menit: 08.10, jam 08.15 → hari yang sama
  t("08.10 → 08.15", at(2026, 9, 12, 8, 10), 8, 15, 0);
  // 08.30, jam 08.15 → besok 08.15
  t("08.30 → besok 08.15", at(2026, 9, 12, 8, 30), 8, 15, 1);
  // 23.30, jam 09.00 → besok
  t("23.30 → besok 09.00", at(2026, 9, 12, 23, 30), 9, 0, 1);
}

console.log("\ncomputeReminderBatch — MODE \"time\" (ingatkan jam sekian)");
{
  // now = Sabtu 12 Sep 2026, 09.00
  const now = at(2026, 9, 12, 9, 0);
  const T = { mode: "time", time: "12:00" };

  // 1. Kosong / invalid
  assert(computeReminderBatch([], now, T).length === 0, "tanpa record → batch kosong");
  assert(
    computeReminderBatch([{ unitId: "N5-U1" }], now, T).length === 0,
    "record tanpa nextReviewAt → batch kosong"
  );
  assert(
    computeReminderBatch([{ nextReviewAt: "bukan-tanggal" }], now, T).length === 0,
    "nextReviewAt invalid → batch kosong"
  );

  // 2. Dua due pagi ini (10.00 & 10.30) → satu nudge jam pilihan 12.00
  //    hari ini, jumlah kumulatif 2.
  const b1 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 12, 10, 0) },
      { nextReviewAt: iso(2026, 9, 12, 10, 30) },
    ],
    now,
    T
  );
  assert(b1.length === 1, `dua due sebelum slot → 1 notifikasi (dapat ${b1.length})`);
  assert(b1[0] && eq(b1[0].at, at(2026, 9, 12, 12, 0)), "nudge jam pilihan 12.00 hari ini");
  assert(b1[0] && b1[0].count === 2, "jumlah kumulatif 2");
  assert(b1[0] && b1[0].id === REMINDER_IDS[0], `id pertama ${REMINDER_IDS[0]}`);

  // 3. Due SETELAH slot hari ini (15.00) → nudge BESOK jam pilihan (jam
  //    hari itu sudah lewat duluan).
  const b2 = computeReminderBatch([{ nextReviewAt: iso(2026, 9, 12, 15, 0) }], now, T);
  assert(
    b2.length === 1 && eq(b2[0].at, at(2026, 9, 13, 12, 0)),
    "due 15.00 → nudge besok 12.00"
  );

  // 4. Due masa depan DALAM tenggang grace (09.30, grace sampai 11.00)
  //    dengan jam pilihan 10.00 → nudge HARUS tetap hari ini 10.00 (slot
  //    SETELAH due tidak boleh tertahan anchor — perbaikan t94; kode lama
  //    t86 melompatnya ke besok).
  const b3 = computeReminderBatch(
    [{ nextReviewAt: iso(2026, 9, 12, 9, 30) }],
    now,
    { mode: "time", time: "10:00" }
  );
  assert(
    b3.length === 1 && eq(b3[0].at, at(2026, 9, 12, 10, 0)),
    "due 09.30 + jam 10.00 → nudge HARI INI 10.00 (tidak tertahan grace)"
  );

  // 5. Due lampau → anchor (now + 2 jam = 11.00) → slot pilihan pertama
  //    setelahnya. Jam pilihan 12.00 → hari ini 12.00.
  const b4 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 11, 9, 0) }, // kemarin
      { nextReviewAt: iso(2026, 9, 12, 7, 0) }, // tadi subuh
    ],
    now,
    T
  );
  assert(
    b4.length === 1 && eq(b4[0].at, at(2026, 9, 12, 12, 0)),
    "due lampau → satu nudge slot pertama >= grace (12.00)"
  );
  assert(b4[0] && b4[0].count === 2, "jumlah kumulatif 2 (due lampau ikut dihitung)");

  // 6. Due lampau + jam pilihan yang sudah lewat hari ini (08.00) → besok.
  const b5 = computeReminderBatch(
    [{ nextReviewAt: iso(2026, 9, 11, 20, 0) }],
    now,
    { mode: "time", time: "08:00" }
  );
  assert(
    b5.length === 1 && eq(b5[0].at, at(2026, 9, 13, 8, 0)),
    "due lampau + jam 08.00 lewat → besok 08.00"
  );

  // 7. Jam invalid → fallback default 09.00.
  const b6 = computeReminderBatch(
    [{ nextReviewAt: iso(2026, 9, 12, 15, 0) }],
    now,
    { mode: "time", time: "junk" }
  );
  assert(
    b6.length === 1 && eq(b6[0].at, at(2026, 9, 13, 9, 0)),
    "jam rusak → fallback 09.00 (besok, karena 15.00 > 09.00)"
  );

  // 8. Rantai beberapa hari dipangkas max 3; terurut + kumulatif naik.
  const b7 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 13, 15, 0) },
      { nextReviewAt: iso(2026, 9, 15, 15, 0) },
      { nextReviewAt: iso(2026, 9, 17, 15, 0) },
      { nextReviewAt: iso(2026, 9, 19, 15, 0) },
    ],
    now,
    T
  );
  assert(b7.length === 3, `rantai dipangkas ke max 3 (dapat ${b7.length})`);
  assert(
    b7.every((n, i) => i === 0 || n.at.getTime() > b7[i - 1].at.getTime()),
    "notifikasi terurut naik"
  );
  assert(
    b7.every((n, i) => i === 0 || n.count >= b7[i - 1].count),
    "jumlah kumulatif monoton naik"
  );
  assert(
    b7.every((n, i) => n.id === REMINDER_IDS[i]),
    "id batch = REMINDER_IDS berurutan"
  );
}

console.log("\ncomputeReminderBatch — MODE \"due\" (ingatkan setiap ada yang due)");
{
  // now = Sabtu 12 Sep 2026, 09.00
  const now = at(2026, 9, 12, 9, 0);
  const D = { mode: "due" };

  // 0. DEFAULT (tanpa opts) = mode "due": due 14.00 → nudge PERSIS 14.00.
  const b0 = computeReminderBatch([{ nextReviewAt: iso(2026, 9, 12, 14, 0) }], now);
  assert(
    b0.length === 1 && eq(b0[0].at, at(2026, 9, 12, 14, 0)),
    "tanpa opts → default \"due\", nudge tepat di momen due"
  );

  // 1. Satu due 14.37 → nudge 14.37 PERSIS (menit ikut, bukan slot jam).
  const b1 = computeReminderBatch([{ nextReviewAt: iso(2026, 9, 12, 14, 37) }], now, D);
  assert(
    b1.length === 1 && eq(b1[0].at, at(2026, 9, 12, 14, 37)),
    "due 14.37 → nudge 14.37 (jam persis)"
  );
  assert(b1[0] && b1[0].count === 1, "jumlah 1");

  // 2. Merge: dua due berdekatan (14.00 & 14.20) → SATU notifikasi di
  //    momen due TERAKHIR gugus (14.20), jumlah kumulatif 2.
  const b2 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 12, 14, 0) },
      { nextReviewAt: iso(2026, 9, 12, 14, 20) },
    ],
    now,
    D
  );
  assert(b2.length === 1, `due berdekatan → 1 notifikasi (dapat ${b2.length})`);
  assert(b2[0] && eq(b2[0].at, at(2026, 9, 12, 14, 20)), "menyala di momen TERAKHIR gugus (14.20)");
  assert(b2[0] && b2[0].count === 2, "jumlah kumulatif 2");

  // 3. Rantai adjacency: 14.00 / 14.20 / 14.40 (tiap jeda 20 mnt ≤ 30)
  //    → tetap satu gugus, nudge 14.40.
  const b3 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 12, 14, 0) },
      { nextReviewAt: iso(2026, 9, 12, 14, 20) },
      { nextReviewAt: iso(2026, 9, 12, 14, 40) },
    ],
    now,
    D
  );
  assert(b3.length === 1, "rantai adjacency 20/20/20 mnt → 1 gugus");
  assert(b3[0] && eq(b3[0].at, at(2026, 9, 12, 14, 40)), "nudge 14.40 (ujung rantai)");
  assert(b3[0] && b3[0].count === 3, "jumlah kumulatif 3");

  // 4. Terlalu jauh (14.00 vs 14.45) → dua notifikasi terpisah.
  const b4 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 12, 14, 0) },
      { nextReviewAt: iso(2026, 9, 12, 14, 45) },
    ],
    now,
    D
  );
  assert(b4.length === 2, "jeda 45 mnt > 30 → 2 notifikasi");
  assert(b4[0] && eq(b4[0].at, at(2026, 9, 12, 14, 0)) && b4[0].count === 1, "nudge pertama 14.00 (1 unit)");
  assert(b4[1] && eq(b4[1].at, at(2026, 9, 12, 14, 45)) && b4[1].count === 2, "nudge kedua 14.45 (kumulatif 2)");

  // 5. Due lampau semua (app ditutup dengan kerjaan) → grace 2 jam →
  //    SATU nudge 11.00 hari ini (anchor), tidak berantai.
  const b5 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 11, 9, 0) },
      { nextReviewAt: iso(2026, 9, 12, 7, 0) },
    ],
    now,
    D
  );
  assert(
    b5.length === 1 && eq(b5[0].at, at(2026, 9, 12, 11, 0)),
    "semua due lampau → satu nudge 11.00 (grace 2 jam)"
  );
  assert(b5[0] && b5[0].count === 2, "jumlah kumulatif 2");

  // 6. Anchor jatuh di malam (now 21.30 → anchor 23.30) → nudge tetap
  //    MALAM INI 23.30 (t98: jam malam tidak ditahan — due lampau hanya
  //    menunggu grace, tidak digeser pagi).
  const b6 = computeReminderBatch(
    [{ nextReviewAt: iso(2026, 9, 12, 7, 0) }],
    at(2026, 9, 12, 21, 30),
    D
  );
  assert(
    b6.length === 1 && eq(b6[0].at, at(2026, 9, 12, 23, 30)),
    "anchor 23.30 malam → nudge 23.30 (tidak digeser pagi)"
  );

  // 7. Due malam (23.30) → nudge PERSIS 23.30 malam itu.
  const b7 = computeReminderBatch([{ nextReviewAt: iso(2026, 9, 12, 23, 30) }], now, D);
  assert(
    b7.length === 1 && eq(b7[0].at, at(2026, 9, 12, 23, 30)),
    "due 23.30 → nudge 23.30 (jam malam diizinkan, t98)"
  );

  // 8. Gugus malam: 23.30 / 23.50 / 01.00(+1) → 23.30+23.50 menyatu
  //    (jeda 20 mnt), 01.00 terpisah (jeda 70 mnt > 30) → DUA notifikasi
  //    persis di waktunya (dulu digeser ke satu kabar pagi 07.00).
  const b8 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 12, 23, 30) },
      { nextReviewAt: iso(2026, 9, 12, 23, 50) },
      { nextReviewAt: iso(2026, 9, 13, 1, 0) },
    ],
    now,
    D
  );
  assert(b8.length === 2, `gugus malam: 2 notifikasi terpisah (dapat ${b8.length})`);
  assert(b8[0] && eq(b8[0].at, at(2026, 9, 12, 23, 50)) && b8[0].count === 2, "nudge pertama 23.50 (2 unit kumulatif)");
  assert(b8[1] && eq(b8[1].at, at(2026, 9, 13, 1, 0)) && b8[1].count === 3, "nudge kedua 01.00 (3 unit kumulatif)");

  // 9. Due dini hari (05.00, sekarang 03.00) → nudge PERSIS 05.00.
  const b9 = computeReminderBatch(
    [{ nextReviewAt: iso(2026, 9, 12, 5, 0) }],
    at(2026, 9, 12, 3, 0),
    D
  );
  assert(
    b9.length === 1 && eq(b9[0].at, at(2026, 9, 12, 5, 0)),
    "due 05.00 → nudge 05.00 (dini hari diizinkan)"
  );

  // 10. Jam-jam ekstrem tetap persis: 07.00 pagi & 23.00 malam.
  const b10 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 12, 7, 0) },
      { nextReviewAt: iso(2026, 9, 12, 23, 0) },
    ],
    at(2026, 9, 12, 6, 0),
    D
  );
  assert(b10.length === 2, "07.00 & 23.00 = dua notifikasi (tidak digeser)");
  assert(b10[0] && eq(b10[0].at, at(2026, 9, 12, 7, 0)), "07.00 tepat tetap 07.00");
  assert(b10[1] && eq(b10[1].at, at(2026, 9, 12, 23, 0)), "23.00 tetap 23.00 (malam penuh diizinkan)");

  // 11. Cap rantai: lima due tersebar jauh → dipangkas max 3.
  const b11 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 12, 14, 0) },
      { nextReviewAt: iso(2026, 9, 12, 18, 0) },
      { nextReviewAt: iso(2026, 9, 13, 14, 0) },
      { nextReviewAt: iso(2026, 9, 14, 14, 0) },
      { nextReviewAt: iso(2026, 9, 15, 14, 0) },
    ],
    now,
    D
  );
  assert(b11.length === 3, `dipangkas max 3 (dapat ${b11.length})`);
  assert(
    b11.every((n, i) => n.id === REMINDER_IDS[i]),
    "id batch = REMINDER_IDS berurutan"
  );

  // 12. Sweep: kombinasi acak — (a) semua nudge strictly masa depan,
  //     (b) terurut naik + kumulatif monoton. (t98: jam malam kini
  //     diizinkan — cek "civil" pensiun.)
  let allFuture = true;
  let monotonic = true;
  for (let day = 0; day < 20; day++) {
    for (const h of [0, 3, 6, 9, 13, 18, 21, 23]) {
      for (const mode of ["time", "due"]) {
        const n2 = new Date(now.getTime() + day * 86400000);
        n2.setHours(h, 15, 0, 0);
        const due = new Date(n2.getTime() - 3 * 86400000); // sebagian lampau
        const b = computeReminderBatch(
          [
            { nextReviewAt: due.toISOString() },
            { nextReviewAt: n2.toISOString() },
          ],
          now,
          mode === "time" ? { mode: "time", time: "12:00" } : { mode: "due" }
        );
        for (const n of b) {
          if (n.at.getTime() <= now.getTime()) allFuture = false;
        }
        if (
          !b.every((n, i) => i === 0 || (n.at.getTime() > b[i - 1].at.getTime() && n.count >= b[i - 1].count))
        ) {
          monotonic = false;
        }
      }
    }
  }
  assert(allFuture, "semua mode: nudge strictly > now (sweep 20 hari × 8 jam × 2 mode)");
  assert(monotonic, "semua mode: terurut naik + kumulatif monoton (sweep)");
}

console.log("\nreminderBody");
assert(reminderBody(1) === "1 unit is due for review.", "tunggal: '1 unit is due for review.'");
assert(reminderBody(5) === "5 units are due for review.", "jamak: '5 units are due for review.'");
assert(!/[—–]/.test(reminderBody(9)), "body bebas em/en-dash (kebijakan copy t84)");

console.log(
  failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`
);
process.exit(failures === 0 ? 0 : 1);
