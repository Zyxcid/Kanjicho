/**
 * strings/en.js — kamus bahasa Inggris (baseline; kunci yang hilang di
 * kamus lain jatuh kembali ke sini). Lihat src/lib/i18n.js untuk mekanisme.
 *
 * Konvensi kunci: <komponen>.<lokasi>[.<varian>] — flat, tanpa nesting,
 * supaya grep satu kata langsung menemukan pemakainya.
 * Interpolasi: {n} {level} {label} {kanji} {q} {lv} {unit} {msg} {title}.
 */
export default {
  // ---- umum ----
  "common.home": "Home",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.delete": "Delete",
  "common.loading": "Loading…",

  // ---- App.jsx ----
  "app.loading": "Loading your progress…",
  "app.session.aria": "Studying {level} {unit}",
  "app.quizExit.aria": "Leave this quiz",
  "app.topbarBack.aria": "Back to home",
  "app.exitDialog.text": "Leave this session? Your answers so far won't be saved.",
  "app.exitDialog.keep": "Keep studying",
  "app.exitDialog.leave": "Leave",
  "app.toast.notifBlocked": "Notifications are blocked for Kanjichō — allow them in system settings.",
  "app.toast.notEnoughKanji": "This level doesn't have enough kanji to generate distractors.",
  "app.toast.noMissed": "No missed kanji in this unit right now.",
  "app.toast.progressDeleted": "{level} progress deleted",
  "app.session.unit": "Unit {n}",
  "app.session.unitReview": "Unit {n} · review",
  "app.session.missed": "Missed review",

  // ---- Tutorial.jsx (kunci langkah; judul + isi) ----
  "tour.welcome.title": "Welcome to Kanjichō",
  "tour.welcome.body":
    "Learn the JLPT kanji with short quizzes, and let the app bring each one back for review right before you'd forget it. A quick tour, about half a minute.",
  "tour.level.title": "Choose a JLPT level",
  "tour.level.body":
    "Each level keeps its own kanji and units. Start with the one you're aiming for; your progress will show on these cards as you study. Tap any level to continue.",
  "tour.unit.title": "Pick a unit",
  "tour.unit.body": "A unit is a small set of kanji with one quiz. Tap one to step inside.",
  "tour.script.title": "Kana or romaji",
  "tour.script.body":
    "This switch works everywhere. Readings in quizzes and in the kanji library flip between kana and romaji the moment you tap it.",
  "tour.choices.title": "How a question works",
  "tour.choices.body": "Pick the choice that matches the kanji's reading.",
  "tour.back.title": "The card's back",
  "tour.back.body":
    "The readings in bold are the ones the choices came from. Tap the little kanji at the corner to watch it being written.",
  "tour.srs.title": "The schedule takes care of itself",
  "tour.srs.body":
    "After a quiz ends, the app schedules the unit's next review with spaced repetition, just before you'd start to forget. That's the whole learning loop.",
  "tour.calendar.title": "Your review calendar",
  "tour.calendar.body":
    "Tap this card any time to open the review calendar. It shows when every unit comes due and the days you've studied, so the schedule is never a mystery.",
  "tour.browse.title": "Browse all kanji",
  "tour.browse.body":
    "The kanji library holds every kanji in the app, with stroke animations, readings, components and example words. Open it whenever you want to look one up.",
  "tour.finale.title": "That's the tour!",
  "tour.finale.body":
    "Learn a little at a time, and don't forget to review the kanji you got wrong. がんばろう!",
  "tour.start": "Start tour",
  "tour.gotIt": "Got it",
  "tour.skip": "Skip tutorial",
  "tour.aria": "Tutorial: {title}",

  // ---- Quiz.jsx ----
  "quiz.modeBadge.weak": "Missed kanji review",
  "quiz.question": "Question {n} of {m}",
  "quiz.dontKnow": "Don't know",
  "quiz.continue": "Continue",
  "quiz.seeResults": "See Results",
  "quiz.swipeHint": "Swipe the card sideways to flip it",

  // ---- HelpButton.jsx ----
  "help.aria": "Help & about",
  // (t90) Label BAB — Help kini tiga grup: settings / guide / about.
  "help.groupSettings": "Settings",
  "help.groupGuide": "Guide",
  "help.groupAbout": "About",
  "help.getting": "Getting started",
  "help.intro":
    "New to Kanjichō? The built-in tour walks you through levels, units, quizzes and the kanji library in about half a minute.",
  "help.replay": "Replay the tutorial",
  "help.language": "Language",
  "help.languageHint": "Interface language — applies everywhere, instantly.",
  "help.quiz": "Quiz",
  "help.blur": "Blur the choices",
  "help.blurDesc":
    "Recall the reading first; one tap clears the blur, the next answers",
  "help.autoflip": "Auto-flip the card",
  "help.autoflipDelay": "Auto-flip delay",
  "help.quizText.a":
    "The first time you finish a unit, its review is always scheduled 1 or 2 days away (8 for a perfect score). The app uses that early date as the starting reference for your next reviews, so don't hesitate to answer ",
  "help.quizText.b": ": an honest answer keeps your schedule accurate.",
  "help.reminders": "Reminders",
  "help.remindersToggle": "Review reminders",
  "help.remindersDesc": "A quiet nudge when reviews come due",
  // (t94) Two reminder modes — choice pills under the toggle.
  "help.reminderMode": "How to remind",
  "help.reminderModeTime": "At a set time",
  "help.reminderModeDue": "When due",
  "help.reminderTime": "Reminder time",
  "help.remindersTextTime":
    "A nudge arrives once a day at your chosen hour, only when units are waiting, and it reschedules itself whenever you finish a quiz. Nothing ever leaves your phone: they are local notifications, with no network or account behind them.",
  "help.remindersTextDue":
    "A nudge arrives the moment a unit comes due; units due close together are merged into one, and anything landing at night (22:00–07:00) waits until morning. Reminders reschedule themselves whenever you finish a quiz. Nothing ever leaves your phone: they are local notifications, with no network or account behind them.",
  "help.browse": "Browse kanji",
  "help.browseText.a": "In a kanji's components, a",
  "help.browseText.b": "red dot marks the",
  "help.browseText.radical": "radical",
  "help.browseText.c": ", the part that carries the meaning, and a",
  "help.browseText.d": "blue dot marks the",
  "help.browseText.phonetic": "phonetic",
  "help.browseText.e":
    ", the part that carries the sound. Tap a component to open its own page.",
  "help.progress": "Progress",
  "help.resetToggle": "Reset progress button",
  "help.resetDesc": "Show reset button",
  "help.contact": "Contact",
  "help.privacy": "Privacy policy",

  // ---- BackupControls.jsx ----
  "backup.export": "Export progress",
  "backup.import": "Import progress",
  "backup.confirm":
    "Importing replaces ALL progress on this device with the backup file.\nContinue?",
  "backup.exportFail": "Export failed: {msg}",
  "backup.importFail": "Import failed: {msg}",

  // ---- Home.jsx ----
  "home.badge.new": "New",
  "home.badge.mastered": "Mastered",
  "home.badge.due": "{n} due",
  "home.browse.title": "Browse all kanji",
  "home.browse.small": "Reference library · N5–N1",
  "home.levels": "Choose a JLPT Level",
  "home.levelCount": "{kanji} kanji · {units} units",
  "home.levelCountOne": "{kanji} kanji · {units} unit",

  // ---- UnitSelect.jsx ----
  "unit.status.new": "Not started",
  "unit.status.due": "Review now",
  "unit.status.scheduled": "Scheduled",
  "unit.status.mastered": "Mastered",
  "unit.in": "in {label}",
  "unit.section": "{level} Units",
  "unit.reset": "Reset progress",
  "unit.reset.title":
    "Delete this level's progress: SRS schedule, quiz history and missed kanji. Other levels are not affected.",
  "unit.missed.aria": "Review {n} missed kanji",
  "unit.missed.title":
    "Quiz the {n} kanji you missed in this unit — doesn't change your schedule",
  "unit.dialog.resetTitle": "Delete all {level} progress?",
  "unit.dialog.resetLine2":
    "SRS schedule, quiz history and missed kanji for this level will be removed",
  "unit.dialog.resetLine3": "other levels are not affected",
  "unit.dialog.missed1": "This unit still has {n} missed kanji",
  "unit.dialog.missed2": "practice opens again once they're cleared",
  "unit.dialog.notDue1": "This unit isn't due yet",
  "unit.dialog.notDue2": "practice won't change your review schedule",
  "unit.dialog.review": "Review",
  "unit.dialog.practice": "Practice",

  // ---- StatCards.jsx ----
  "stat.studied": "Studied",
  "stat.dueNow": "Due now",
  "stat.nextDue": "Next due",
  "stat.mastered": "Mastered",
  "stat.group": "Study statistics",
  "stat.streak.done": "{n}-day streak — done today",
  "stat.streak.risk": "{n}-day streak — quiz today to keep it",
  "stat.due.title": "{n} units ready to review — see what's due and when",
  "stat.due.titleOne": "{n} unit ready to review — see what's due and when",
  "stat.next.title": "No units due — next review in {label}. Open the calendar",
  "stat.due.aria": "Due now: {n} units — open review calendar",
  "stat.due.ariaOne": "Due now: {n} unit — open review calendar",
  "stat.next.aria": "Next review in {label} — open review calendar",
  "stat.none.aria": "Due now: none — open review calendar",
  "stat.cal.title": "Open the review calendar",

  // ---- Result.jsx ----
  "result.missed": "Missed review",
  "result.correct": "Correct",
  "result.wrong": "Wrong",
  "result.dontKnow": "Don't know",
  "result.next": "Next review in",
  "result.scheduleUnchanged": "schedule unchanged",
  "result.stillMissed": "{n} kanji still missed",
  "result.noMissed": "No kanji missed",
  "result.reviewAgain": "Review again",
  "result.backToUnits": "Back to Units",

  // ---- Browse.jsx ----
  "browse.title": "kanji Library",
  "browse.count": "{n} kanji",
  "browse.countIn": "{n} kanji in {lv}",
  "browse.search": "Search kanji, meaning, reading…",
  "browse.search.aria": "Search kanji",
  "browse.clear": "Clear search",
  "browse.noMatch": "No kanji match \u201c{q}\u201d.",
  "browse.showMore": "Show more ({n} remaining)",
  "browse.loadingLevel": "Loading {lv}…",
  "browse.back": "Back to {kanji}",
  "browse.strokes": "{n} strokes",
  "browse.strokeOne": "1 stroke",

  // ---- ReviewCalendar.jsx ----
  "cal.today": "Today",
  "cal.prev": "Previous month",
  "cal.next": "Next month",
  "cal.weekdays": "Su Mo Tu We Th Fr Sa",
  "cal.units": "{n} units",
  "cal.unitOne": "{n} unit",
  "cal.cellDue": "{n} due",
  "cal.cellStudied": "studied",
  "cal.empty.today": "Nothing due today",
  "cal.empty.day": "No reviews due this day",
  "cal.overdue": "overdue",
  "cal.reviewNow": "Review {unit} now",
  "cal.quizzesOne": "1 quiz completed",
  "cal.quizzes": "{n} quizzes completed",
  "cal.todayWord": "today",
  "cal.thisDayWord": "this day",

  // ---- CalendarModal.jsx ----
  "cal.modal.title": "Review calendar",
  "cal.modal.scopeLevel": "{level} units",
  "cal.modal.scopeAll": "All levels",

  // ---- dueFormat.js ----
  "dur.now": "now",
  "dur.underMinute": "under a minute",
  "dur.min": "{n} min",
  "dur.hourOne": "1 hour",
  "dur.hours": "{n} hours",
  "dur.dayOne": "1 day",
  "dur.days": "{n} days",

  // ---- ScriptToggle.jsx ----
  "script.romaji.title": "Show readings in romaji (r)",
  "script.kana.title": "Show readings in kana (r)",
  "script.romaji.aria": "Show readings in romaji",
  "script.kana.aria": "Show readings in kana",

  // ---- ThemeToggle.jsx ----
  "theme.light.title": "Switch to light mode",
  "theme.dark.title": "Switch to dark mode",
  "theme.light.label": "Light",
  "theme.dark.label": "Dark",

  // ---- CopyKanji.jsx ----
  "copy.aria": "Copy {kanji} to clipboard",
  "copy.title": "Copy {kanji}",
  "copy.done": "Copied {kanji}",

  // ---- StrokePlayer.jsx ----
  "stroke.aria": "Stroke order animation, {n} strokes",
  "stroke.replay": "Replay",
  "stroke.pause": "Pause",
  "stroke.play": "Play",
  "stroke.prev": "Previous stroke",
  "stroke.next": "Next stroke",
  "stroke.speed": "Animation speed",
  "stroke.speedAria": "Animation speed {s}x",
  "stroke.counter": "{n} strokes",
  "stroke.counterOne": "1 stroke",

  // ---- ComponentBreakdown.jsx ----
  "comp.radical": "Radical — the component that carries the meaning",
  "comp.phonetic": "Phonetic — the component that carries the sound",
  "comp.label": "Components",
  "comp.loose": "{n} strokes not part of a named component",
  "comp.looseOne": "1 stroke not part of a named component",
  "comp.show": "Show component {k}",
  "comp.aria": "Components: {eq}",

  // ---- Notifikasi Android (reminderPlan.js) ----
  "notif.title": "Review time",
  "notif.bodyOne": "1 unit is due for review.",
  "notif.bodyMany": "{n} units are due for review.",
};
