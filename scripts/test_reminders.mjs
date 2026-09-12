/**
 * test_reminders.mjs — uji murni perencanaan pengingat review (t86).
 * reminderPlan.js sengaja bebas Capacitor/DOM supaya bisa diuji di Node.
 * Jalankan: node scripts/test_reminders.mjs
 */
import {
  REMINDER_SLOTS,
  REMINDER_IDS,
  REMINDER_BATCH_MAX,
  nextSlotAfter,
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

console.log("REMINDER_SLOTS / konstanta");
assert(
  REMINDER_SLOTS.length === 4 && REMINDER_SLOTS.every((h, i, a) => i === 0 || h > a[i - 1]),
  `slot jam menaik & unik: ${REMINDER_SLOTS.join(",")}`
);
assert(
  REMINDER_IDS.length === REMINDER_BATCH_MAX,
  `jumlah id sama dengan batch max (${REMINDER_IDS.length})`
);

console.log("\nnextSlotAfter — batas slot");
{
  const t = (msg, input, expH, expDayShift) => {
    const got = nextSlotAfter(input);
    const base = input instanceof Date ? input : new Date(input);
    const exp = new Date(base);
    exp.setDate(exp.getDate() + (expDayShift || 0));
    exp.setHours(expH, 0, 0, 0);
    assert(
      got.getTime() === exp.getTime(),
      `${msg}: → ${got.toString()} (harapan ${exp.toString()})`
    );
  };
  // 07.59 → slot 08.00 hari yang sama
  t("07.59", at(2026, 9, 12, 7, 59), 8, 0);
  // tepat jam slot 08.00 → slot ITU sendiri (bukan siang)
  t("08.00 tepat", at(2026, 9, 12, 8, 0), 8, 0);
  // 08.00.01 → slot berikutnya (12.00)
  t("08.00 lewat 1 dtk", new Date(2026, 8, 12, 8, 0, 1, 0), 12, 0);
  // 11.59 → 12.00
  t("11.59", at(2026, 9, 12, 11, 59), 12, 0);
  // 16.59 → 17.00
  t("16.59", at(2026, 9, 12, 16, 59), 17, 0);
  // 19.59 → 20.00
  t("19.59", at(2026, 9, 12, 19, 59), 20, 0);
  // 20.00 tepat → 20.00
  t("20.00 tepat", at(2026, 9, 12, 20, 0), 20, 0);
  // 20.01 → besok 08.00
  t("20.01", at(2026, 9, 12, 20, 1), 8, 1);
  // 23.30 → besok 08.00
  t("23.30", at(2026, 9, 12, 23, 30), 8, 1);
  // 03.00 dini hari → 08.00 hari yang sama
  t("03.00", at(2026, 9, 12, 3, 0), 8, 0);
}

console.log("\ncomputeReminderBatch — kasus inti");
{
  // now = Sabtu 12 Sep 2026, 09.00
  const now = at(2026, 9, 12, 9, 0);

  // 1. Kosong
  assert(computeReminderBatch([], now).length === 0, "tanpa record → batch kosong");
  assert(
    computeReminderBatch([{ unitId: "N5-U1" }], now).length === 0,
    "record tanpa nextReviewAt → batch kosong"
  );
  assert(
    computeReminderBatch([{ nextReviewAt: "bukan-tanggal" }], now).length === 0,
    "nextReviewAt invalid → batch kosong"
  );

  // 2. Dua unit jatuh tempo pagi yang sama (10.00 & 10.30, hari ini) →
  //    MENYATU jadi satu nudge slot 12.00 dengan jumlah kumulatif 2.
  const recs = [
    { nextReviewAt: iso(2026, 9, 12, 10, 0) },
    { nextReviewAt: iso(2026, 9, 12, 10, 30) },
  ];
  const b1 = computeReminderBatch(recs, now);
  assert(b1.length === 1, `dua due sela slot sama → 1 notifikasi (dapat ${b1.length})`);
  assert(
    b1[0] && b1[0].at.getTime() === at(2026, 9, 12, 12, 0).getTime(),
    "nudge slot 12.00 hari ini"
  );
  assert(b1[0] && b1[0].count === 2, "jumlah kumulatif 2");
  assert(b1[0] && b1[0].id === REMINDER_IDS[0], `id pertama ${REMINDER_IDS[0]}`);

  // 3. Reviu due besok pagi 08.30 → nudge 12.00 BESOK (bukan hari ini).
  const b2 = computeReminderBatch([{ nextReviewAt: iso(2026, 9, 13, 8, 30) }], now);
  assert(
    b2.length === 1 && b2[0].at.getTime() === at(2026, 9, 13, 12, 0).getTime(),
    "due besok 08.30 → nudge besok 12.00"
  );

  // 4. Reviu due malam (22.00) → tidak menagih tengah malam: besok 08.00.
  const b3 = computeReminderBatch([{ nextReviewAt: iso(2026, 9, 12, 22, 0) }], now);
  assert(
    b3.length === 1 && b3[0].at.getTime() === at(2026, 9, 13, 8, 0).getTime(),
    "due 22.00 → nudge besok 08.00 (jam sopan)"
  );

  // 5. Semua sudah DUE saat app ditutup (now 09.00) → tenggang 2 jam →
  //    nudge 12.00 hari ini, SATU notifikasi saja (tidak nagging berantai).
  const b4 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 11, 9, 0) }, // kemarin
      { nextReviewAt: iso(2026, 9, 12, 7, 0) }, // tadi subuh
    ],
    now
  );
  assert(
    b4.length === 1 && b4[0].at.getTime() === at(2026, 9, 12, 12, 0).getTime(),
    "semua due lampau → satu nudge 12.00 (grace 2 jam)"
  );
  assert(b4[0] && b4[0].count === 2, "jumlah kumulatif 2 (due lampau ikut dihitung)");

  // 6. Grace bisa diperkecil: grace 0 menit → due lampau tetap tak menyala
  //    di masa lampau — slot berikutnya tetap >= sekarang.
  const b5 = computeReminderBatch(
    [{ nextReviewAt: iso(2026, 9, 12, 7, 0) }],
    now,
    { graceMs: 0 }
  );
  assert(
    b5.length === 1 && b5[0].at.getTime() === at(2026, 9, 12, 12, 0).getTime(),
    "grace 0 → due lampau tetap nudge slot >= sekarang (12.00)"
  );

  // 7. Rantai: tiga due di tiga hari berbeda → 3 notifikasi terurut naik,
  //    jumlah kumulatif monoton naik.
  const b6 = computeReminderBatch(
    [
      { nextReviewAt: iso(2026, 9, 13, 9, 0) }, // besok → 12.00
      { nextReviewAt: iso(2026, 9, 15, 9, 0) }, // Selasa → 12.00
      { nextReviewAt: iso(2026, 9, 17, 9, 0) }, // Kamis → 12.00
      { nextReviewAt: iso(2026, 9, 19, 9, 0) }, // Sabtu (dipangkas max 3)
    ],
    now
  );
  assert(b6.length === 3, `rantai dipangkas ke max 3 (dapat ${b6.length})`);
  assert(
    b6.every((n, i) => i === 0 || n.at.getTime() > b6[i - 1].at.getTime()),
    "notifikasi terurut naik"
  );
  assert(
    b6.every((n, i) => i === 0 || n.count >= b6[i - 1].count),
    "jumlah kumulatif monoton naik"
  );
  assert(
    b6[2].count === 3,
    `nudge ke-3 menghitung 3 unit due (dapat ${b6[2] && b6[2].count})`
  );
  assert(
    b6.every((n, i) => n.id === REMINDER_IDS[i]),
    "id batch = REMINDER_IDS berurutan"
  );

  // 8. Semua notifikasi STRICT masa depan (tak pernah menyala di masa
  //    lampau / sekarang) untuk kombinasi acak.
  let allFuture = true;
  for (let day = 0; day < 20; day++) {
    for (const h of [0, 6, 9, 13, 18, 21, 23]) {
      const n2 = new Date(now.getTime() + day * 86400000);
      n2.setHours(h, 15, 0, 0);
      const due = new Date(n2.getTime() - 3 * 86400000); // sebagian lampau
      const b = computeReminderBatch(
        [
          { nextReviewAt: due.toISOString() },
          { nextReviewAt: n2.toISOString() },
        ],
        now
      );
      for (const n of b) {
        if (n.at.getTime() <= now.getTime()) allFuture = false;
      }
    }
  }
  assert(allFuture, "semua nudge strictly > now (kombinasi 20 hari × 7 jam)");
}

console.log("\nreminderBody");
assert(reminderBody(1) === "1 unit is due for review.", "tunggal: '1 unit is due for review.'");
assert(reminderBody(5) === "5 units are due for review.", "jamak: '5 units are due for review.'");
assert(!/[—–]/.test(reminderBody(9)), "body bebas em/en-dash (kebijakan copy t84)");

console.log(
  failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`
);
process.exit(failures === 0 ? 0 : 1);
