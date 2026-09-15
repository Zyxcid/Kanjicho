#!/usr/bin/env node
/**
 * repair_id_gloss.mjs — perbaiki zona tergeser + entri salah pada
 * src/data/id_gloss.json (t96, pasca-audit manual menyeluruh).
 *
 * Kerusakan yang diperbaiki (lihat worklog ronde 6):
 *  A. m zona [59..148]  — batch 0: jawaban model bergeser +1
 *     (England..accomplish memegang terjemahan glosarium berikutnya).
 *     Rotasi nilai turun satu + 2 entri manual.
 *  B. m zona [2021..2059] — f-words memegang terjemahan g-words
 *     (offset +40, nilai asli hilang) → terjemah ulang manual.
 *  C. m zona [2598..2694] — k/l-words rotasi variabel → manual.
 *  D. w zona batch 30 [2106..2168] bergeser +1 → rotasi turun.
 *  E. Perbaikan tersebar (salah terjemah/typo yang ditemukan saat
 *     audit baris-per-baris penuh 5.205 arti + 3.960 kata).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FILE = path.join(ROOT, "src/data/id_gloss.json");
const g = JSON.parse(fs.readFileSync(FILE, "utf8"));

// ---------- A. rotasi m zona [59..148] ----------
{
  const keys = Object.keys(g.m); // terurut
  // simpan nilai lama zona [58..148]
  const old = {};
  for (let i = 58; i <= 148; i++) old[keys[i]] = g.m[keys[i]];
  // nilai benar utk gloss i (62..148) = nilai lama di kunci i-1
  for (let i = 62; i <= 148; i++) g.m[keys[i]] = old[keys[i - 1]];
  g.m["England"] = "Inggris";
  g.m["English"] = "Inggris";
  g.m["Esq."] = "Esq.";
}

// ---------- B. m zona [2021..2059] (manual) ----------
Object.assign(g.m, {
  "fret": "gusar",
  "friend": "teman",
  "friendly": "ramah",
  "friendship": "persahabatan",
  "frightened": "takut",
  "fringe": "pinggiran",
  "frivolous": "main-main",
  "frolic": "bermain riang",
  "from": "dari",
  "from now on": "mulai sekarang",
  "front door": "pintu depan",
  "front page": "halaman depan",
  "frost": "embun beku",
  "froth": "busa",
  "frozen": "beku",
  "frugal": "hemat",
  "fruit": "buah",
  "fruit juice": "jus buah",
  "frustrate": "menggagalkan",
  "fry in deep fat": "menggoreng rendam",
  "fuel": "bahan bakar",
  "fulfill": "memenuhi",
  "full": "penuh",
  "full (month)": "penuh (bulan)",
  "full moon": "bulan purnama",
  "fullness": "kepenuhan",
  "function": "fungsi",
  "fundamentals": "dasar-dasar",
  "funds": "dana",
  "funeral": "pemakaman",
  "fungus": "jamur",
  "fur": "bulu",
  "furious": "murka",
  "furnace": "tungku",
  "furrow": "alur",
  "further": "lebih jauh",
  "furthermore": "selain itu",
  "futility": "kesia-siaan",
  "future": "masa depan",
});

// ---------- C. m zona [2598..2694] (manual) ----------
Object.assign(g.m, {
  "jurisdiction": "yurisdiksi",
  "judgment": "penilaian",
  "just": "baru saja",
  "just about": "hampir",
  "just so": "tepat begitu",
  "justice": "keadilan",
  "juvenile": "muda",
  "katakana e radical (no. 48)": "radikal katakana e (no. 48)",
  "keep": "menjaga",
  "keep (rain)out": "menahan (hujan)",
  "kernel": "inti",
  "key": "kunci",
  "key (music)": "kunci (musik)",
  "key to": "kunci untuk",
  "kidnap": "menculik",
  "kill": "membunuh",
  "kiln": "tungku pembakaran",
  "kind": "jenis",
  "kindliness": "kebaikan hati",
  "kindling": "kayu bakar kecil",
  "kindly": "baik hati",
  "kindness": "kebaikan",
  "king": "raja",
  "kingdom of Wu": "kerajaan Wu",
  "kingfisher": "burung pekaka",
  "kink": "tikungan",
  "knife": "pisau",
  "knit": "merajut",
  "knob": "kenop",
  "knock": "mengetuk",
  "knoll": "bukit kecil",
  "knot": "simpul",
  "know": "tahu",
  "knuckle": "ruas jari",
  "koto": "koto",
  "label": "label",
  "labor": "buruh",
  "lack": "kekurangan",
  "lacquer": "lak",
  "lad": "anak laki-laki",
  "ladle": "gayung",
  "lady": "nyonya",
  "lady-in-waiting": "dayang",
  "lagoon": "laguna",
  "laid waste": "dirusakkan",
  "lake": "danau",
  "lament": "meratapi",
  "lamp": "lampu",
  "land": "darat",
  "language": "bahasa",
  "lantern festival": "festival lentera",
  "lap": "pangkuan",
  "lapel": "kerah jaket",
  "lapis lazuli": "lapis lazuli",
  "lapse into": "jatuh ke",
  "lard": "lemak babi",
  "large": "besar",
  "large bird": "burung besar",
  "large building": "bangunan besar",
  "lass": "gadis",
  "late": "terlambat",
  "later": "nanti",
  "laugh": "tertawa",
  "launch into": "memulai dengan semangat",
  "laundry": "cucian",
  "law": "hukum",
  "lawn": "halaman rumput",
  "laws": "hukum-hukum",
  "lay (pipes)": "memasang (pipa)",
  "lay a foundation": "mendirikan fondasi",
  "lay aside": "menyisihkan",
  "lay in": "menyimpan",
  "layer": "lapisan",
  "laziness": "kemalasan",
  "lazy": "malas",
  "lead": "memimpin",
  "lead to": "menyebabkan",
  "leader": "pemimpin",
  "leadership": "kepemimpinan",
  "leading": "terdepan",
  "leading troops": "memimpin pasukan",
  "leaf": "daun",
  "leak": "bocor",
  "lean": "condong",
  "leap": "melompat",
  "leap up": "melompat ke atas",
  "leaping up": "melompat",
  "learn": "belajar",
  "learn from": "belajar dari",
  "learner": "pelajar",
  "learning": "pembelajaran",
  "leather": "kulit",
  "leave": "pergi",
  "leave as is": "membiarkan apa adanya",
  "leave behind": "meninggalkan",
  "leave of absence": "cuti",
  "leave to": "menyerahkan kepada",
  "leave with": "menitipkan kepada",
});

// ---------- D. rotasi w batch 30 [2106..2168] ----------
{
  const levels = ["n5", "n4", "n3", "n2", "n1"];
  const all = [];
  for (const lv of levels) {
    const ex = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", `${lv}_examples.json`), "utf8"));
    for (const arr of Object.values(ex)) for (const e of arr) if (!all.includes(e.word)) all.push(e.word);
  }
  all.sort((a, b) => (a < b ? -1 : 1));
  const old = {};
  for (let i = 2100; i <= 2169; i++) old[all[i]] = g.w[all[i]];
  for (let i = 2107; i <= 2169; i++) g.w[all[i]] = old[all[i - 1]];
  // entri pertama run: terjemahannya hilang (model melewatkan satu entri)
  g.w["段階"] = "tahap";
  g.w["残念"] = "disayangkan";
  g.w["残酷"] = "kejam";
  g.w["気の毒"] = "kasihan";
}

// ---------- E. perbaikan tersebar ----------
Object.assign(g.m, {
  "pus": "nanah",
  "push": "mendorong",
  "race": "lomba",
  "radiance": "kecemerlangan",
  "reckless": "nekat",
  "purify": "memurnikan",
  "punish": "menghukum",
  "seduce": "menggoda",
  "shiver": "menggigil",
  "sinker": "pemberat pancing",
  "sit up late": "begadang",
  "sit up (all night)": "terjaga semalaman",
  "scowl": "mengernyitkan dahi",
  "sea bream": "ikan bream",
  "rice tub": "bak padi",
  "self-indulgent": "memanjakan diri",
  "squab": "anak burung dara",
  "tart": "tart",
  "sputter": "bergeletak",
  "stirred up": "terkacau",
  "wane": "menurun",
  "warp": "membengkokkan",
  "weeds": "rumput liar",
  "yang principle": "prinsip yang",
  "wet nurse": "ibu susu",
  "whittle": "memahat (kayu)",
  "woof": "benang pakan",
  "urn": "jambangan abu",
  "vermilion": "merah terang",
  "incline": "miring",
  "bow": "membungkuk",
  "braid": "kepang",
  "craw": "tembolok",
  "belch": "bersendawa",
  "birds": "burung-burung",
  "constrict": "menyempitkan",
  "convex": "cembung",
  "enrich": "memperkaya",
  "enlightenment": "pencerahan",
  "cold (beer, person)": "dingin (bir, orang)",
  "bush clover": "semak lespedeza",
  "cryptomeria": "cedar Jepang (sugi)",
  "counter for tatami mats": "penghitung untuk tikar tatami",
});

Object.assign(g.w, {
  "反る": "melengkung",
  "吐息": "desahan napas",
  "収繭": "hasil kepompong",
  "台風": "taufan",
  "土俵": "ring sumo",
  "天然痘": "cacar",
  "奴": "kawan",
  "山蕗": "petasin liar",
  "子羊": "anak domba",
  "徹夜": "begadang",
  "必死": "mati-matian",
  "悪寒": "menggigil",
  "悲惨": "mengenaskan",
  "手錠": "borgol",
  "掌中の珠": "incaran mata",
  "捺印": "membubuhkan cap",
  "曲がる": "melengkung",
  "暗記": "penghafalan",
  "我慢": "ketahanan",
  "椰子蟹": "kepiting kelapa",
  "梅": "aprikot Jepang (Prunus mume)",
  "渦": "pusaran air",
  "無謀": "sembrono",
  "浄土": "Tanah Suci (Buddha)",
  "熊掌": "telapak beruang",
  "爪楊枝": "tusuk gigi",
  "瑞穂の国": "Negeri Padi Subur",
  "畝": "pematang",
  "甘栗": "kastanye panggang",
  "玉繭": "kepompong ganda",
  "白菊": "krisan putih",
  "白萩": "semak lespedeza putih",
  "突然": "mendadak",
  "糾合": "penggabungan",
  "絞る": "memeras (handuk, kain)",
  "絞殺": "pencekikan (sampai mati)",
  "耐える": "menanggung",
  "穀物": "biji-bijian",
  "稚鮎": "ikan ayu muda",
  "落ち鮎": "ikan ayu yang turun ke hilir",
  "茜色": "merah tua",
  "蓮華": "bunga teratai",
  "花壇": "petak bunga",
  "虞美人草": "bunga poppy (Papaver rhoeas)",
  "蛍狩り": "menonton kunang-kunang",
  "誇る": "membanggakan",
  "車掌": "kondektur",
  "越境": "menyeberang perbatasan (ilegal)",
  "貧乏": "melarat",
  "花葵": "bunga hollyhock",
  "附属学校": "sekolah terkait",
  "靖国": "Yasukuni (kuil)",
  "靖国神社": "Kuil Yasukuni",
  "鍛える": "menempa",
  "野郎": "lelaki (kasar)",
  "駿馬": "kuda cepat",
  "高塚": "gundukan kubur",
  "黄桃": "persik kuning",
  "黒米": "beras tidak digosok",
  "鴻基": "fondasi proyek besar",
  "震える": "gemetar",
  "養鯉": "pembiakan ikan mas",
  "陰気": "muram",
  "一応": "kurang lebih",
});

// ---------- tulis ulang ----------
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const out = { m: sortObj(g.m), w: sortObj(g.w) };
fs.writeFileSync(FILE, JSON.stringify(out) + "\n", "utf8");
console.log(`OK — m ${Object.keys(out.m).length} entri, w ${Object.keys(out.w).length} entri ditulis ulang.`);
