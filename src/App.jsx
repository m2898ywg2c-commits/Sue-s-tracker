import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Dumbbell, ChevronLeft, ChevronRight, Check, Video, TrendingUp, RotateCcw, Flame, Settings, Timer, BarChart3, MessageCircle, X } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { storage } from "./storage";

// ---------- PLAN DATA ----------
// Sessions, not fixed weekdays, since training is 2-3x a week flexibly.
const SESSIONS = [
  { key: "lower", label: "Lower Power", short: "LOWER", focus: "Legs, Glutes & Abs", optional: false },
  { key: "upper", label: "Upper Strength", short: "UPPER", focus: "Chest & Biceps", optional: false },
  { key: "engine", label: "The Engine Room", short: "ENGINE", focus: "Thighs, Glutes & Conditioning", optional: true },
];

// shared progression curve across all four main lifts, week 6 is a deload
const PCTS = [0.875, 0.9, 0.925, 0.95, 0.975, 0.85];

const roundTo25 = (n) => Math.round(n / 2.5) * 2.5;
const roundTo1 = (n) => Math.round(n);

// which movement pattern each exercise belongs to, used to pick a pictogram
const EXERCISE_ICON = {
  db_squat: "squat",
  rdl: "hinge",
  hip_thrust: "hinge",
  step_up: "squat",
  glute_bridge: "hinge",
  bird_dog: "core",
  plank: "core",
  db_bench: "push",
  lat_pulldown: "pull",
  incline_db_press: "push",
  db_curl: "curl",
  hammer_curl: "curl",
  dead_bug: "core",
  skierg_500: "cardio",
  row_500: "cardio",
  engine_block1: "cardio",
  engine_block2: "cardio",
  engine_block3: "cardio",
};

// simple original pictograms, one per movement pattern, drawn in the app's own colours
// rather than sourced photos, so they load instantly, never break, and work offline
function MovementIcon({ type }) {
  const stroke = C.ink;
  const fill = C.accent;
  const common = { width: 40, height: 40, viewBox: "0 0 40 40", fill: "none" };

  const icons = {
    squat: (
      <svg {...common}>
        <circle cx="20" cy="8" r="4" fill={fill} />
        <path d="M20 12 L20 20 M12 26 L20 20 L28 26 M14 34 L20 22 L26 34" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    hinge: (
      <svg {...common}>
        <circle cx="12" cy="10" r="4" fill={fill} />
        <path d="M12 14 L22 22 M22 22 L32 18 M22 22 L18 34 M12 14 L8 26" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    push: (
      <svg {...common}>
        <circle cx="10" cy="20" r="4" fill={fill} />
        <path d="M14 20 L26 20 M26 20 L34 14 M26 20 L34 26 M10 24 L10 34 M14 24 L18 34" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    pull: (
      <svg {...common}>
        <circle cx="20" cy="7" r="4" fill={fill} />
        <path d="M20 11 L20 26 M20 15 L10 8 M20 15 L30 8 M20 26 L14 36 M20 26 L26 36" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    curl: (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" fill={fill} />
        <path d="M12 12 L12 30 M12 30 L20 30 M12 16 L22 16 L18 8" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    core: (
      <svg {...common}>
        <circle cx="8" cy="22" r="4" fill={fill} />
        <path d="M12 22 L30 16 M16 22 L20 32 M24 19 L28 30" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    cardio: (
      <svg {...common}>
        <circle cx="14" cy="8" r="4" fill={fill} />
        <path d="M14 12 L18 22 L12 26 L16 34 M18 22 L28 18 M14 12 L8 20" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };

  return icons[type] || null;
}

const mk = (id, name, sets, reps, note, query, increment = 2.5) => ({
  id,
  name,
  sets,
  reps,
  note,
  type: "strength",
  increment,
  video: `https://www.youtube.com/results?search_query=${encodeURIComponent(query || name + " proper form")}`,
});

const mkCardio = (id, name, note, target, query) => ({
  id,
  name,
  note,
  type: "cardio",
  target,
  video: `https://www.youtube.com/results?search_query=${encodeURIComponent(query || name + " technique")}`,
});

// a 10-minute mixed block: cardio machine plus a movement, repeated for the full block, logged as rounds completed
const mkAmrap = (id, name, note, query, target = "10 min AMRAP") => ({
  id,
  name,
  note,
  type: "amrap",
  target,
  video: `https://www.youtube.com/results?search_query=${encodeURIComponent(query || name + " technique")}`,
});

const CARDIO_NOTES = [
  "Baseline effort. Go hard but controlled and log your time, this is what you're chasing from here.",
  "Aim to match or shave a second or two off week 1.",
  "Push for a new best. Small chunks off your time count.",
  "Same again, keep hunting a faster split.",
  "Peak week, empty the tank on this one.",
  "Deload. Easy, steady pace, this isn't about time this week.",
];

// SkiErg and Row 500m tacked onto the end of Lower Power and Upper Strength too, a short sharp finisher
function finisherPair(weekIdx) {
  const note = CARDIO_NOTES[weekIdx];
  return [
    mkCardio("skierg_500", "SkiErg 500m", note, "500m", "skierg technique 500m"),
    mkCardio("row_500", "Row 500m", note, "500m", "rowing machine technique 500m Concept2"),
  ];
}

const AMRAP_NOTES = [
  "Baseline effort. Move at a pace you could hold for all three blocks, log how many rounds you get through.",
  "Aim to match or beat week 1's rounds in each block.",
  "Push for an extra round somewhere across the three blocks.",
  "Same again, keep chasing rounds.",
  "Peak week, this is the hardest the Engine Room gets.",
  "Deload, easy pace, this isn't about rounds this week.",
];

function buildPlan(weekIdx, dbBenchBase, dbSquatBase, rdlBase, latPulldownBase) {
  const benchNum = parseFloat(dbBenchBase);
  const squatNum = parseFloat(dbSquatBase);
  const rdlNum = parseFloat(rdlBase);
  const pdNum = parseFloat(latPulldownBase);

  const bench = benchNum ? roundTo1(benchNum * PCTS[weekIdx]) : null;
  const squat = squatNum ? roundTo1(squatNum * PCTS[weekIdx]) : null;
  const rdl = rdlNum ? roundTo25(rdlNum * PCTS[weekIdx]) : null;
  const pd = pdNum ? roundTo25(pdNum * PCTS[weekIdx]) : null;
  const deload = weekIdx === 5;
  const amrapNote = AMRAP_NOTES[weekIdx];

  const benchNote = bench ? `Work up to ~${bench}kg per dumbbell` : "Set your DB bench baseline in Settings";
  const squatNote = squat ? `Work up to ~${squat}kg, keep knees tracking over your toes` : "Set your squat baseline in Settings";
  const rdlNote = rdl ? `Work up to ~${rdl}kg, soft knees, hinge from the hips, never round the lower back` : "Set your RDL baseline in Settings";
  const pdNote = pd ? `Work up to ~${pd}kg, control the negative` : "Set your lat pulldown baseline in Settings";

  return {
    lower: [
      mk("db_squat", "Goblet Squat (Dumbbell)", 3, "8-10", squatNote, "goblet squat technique proper form", 1),
      mk("rdl", "Romanian Deadlift (Barbell)", 3, "8", rdlNote, "romanian deadlift form beginner", 2.5),
      mk("hip_thrust", "Hip Thrust", 3, "10", "Low load on the lower back done properly, squeeze at the top, don't overextend", "barbell hip thrust technique", 2.5),
      mk("step_up", "Step-Up (low box)", 3, "8 per leg", "Controlled tempo, watch your knee doesn't cave in on the way up", "step up exercise proper form", 1),
      mk("glute_bridge", "Glute Bridge", 3, "15", "Bodyweight or light, squeeze glutes hard at the top", "glute bridge proper form", 1),
      mk("bird_dog", "Bird-Dog", 3, "10 per side", "Core and lower back friendly, no spinal loading, move slowly", "bird dog exercise technique", 1),
      mk("plank", "Plank", 3, "30 sec", "Brace, don't let hips sag or lower back arch", "plank correct form", 1),
      ...finisherPair(weekIdx),
    ],
    upper: [
      mk("db_bench", "Dumbbell Bench Press", 4, "8", benchNote, "dumbbell bench press form", 1),
      mk("lat_pulldown", "Lat Pulldown", 4, "10", pdNote, "lat pulldown proper form", 2.5),
      mk("incline_db_press", "Incline Dumbbell Press", 3, "10", "Full stretch at the bottom, controlled", "incline dumbbell press form", 1),
      mk("db_curl", "Dumbbell Bicep Curl", 3, "12", "Elbows pinned to your sides, no swinging", "dumbbell bicep curl form", 1),
      mk("hammer_curl", "Hammer Curl", 3, "12", "Thumbs up throughout, targets the forearm and outer arm", "hammer curl form", 1),
      mk("dead_bug", "Dead Bug", 3, "10 per side", "Lower back stays flat on the floor the whole time, this is the cue that matters most", "dead bug exercise technique", 1),
      ...finisherPair(weekIdx),
    ],
    engine: [
      mkAmrap(
        "engine_block1",
        "Block 1: Row + Band Walk",
        `Row 250m, then 10 lateral band walk steps each way. Repeat for the full 10 minutes. ${amrapNote}`,
        "rowing machine technique 500m Concept2"
      ),
      mkAmrap(
        "engine_block2",
        "Block 2: SkiErg + Squat",
        `SkiErg 250m, then 10 light goblet squats. Repeat for the full 10 minutes. ${amrapNote}`,
        "skierg technique 500m"
      ),
      mkAmrap(
        "engine_block3",
        "Block 3: Bike + Band Walk",
        `Bike 500m, then 10 lateral band walk steps each way. Repeat for the full 10 minutes. ${amrapNote}`,
        "stationary bike technique"
      ),
    ],
  };
}

const WEEK_NOTES = [
  "Technique week. Land on the working weights below and don't chase failure, get the movement patterns dialled in properly, especially around the knees and lower back.",
  "Same weights as week 1, but push for cleaner reps and slightly better control.",
  "Progression begins. Add load where form held last week and nothing niggled.",
  "Keep pushing where it feels good. If knees or lower back complain, ease off that exercise specifically rather than pushing through.",
  "Peak week. This is the hardest week of the block, main lifts are at their heaviest.",
  "Deload. Same movements, lighter weight, fewer hard sets. Let the body recover before the next block.",
];

const BODY_FIELDS = [
  { key: "bodyweight", label: "Bodyweight", unit: "kg" },
  { key: "chest", label: "Chest", unit: "cm" },
  { key: "waist", label: "Waist", unit: "cm" },
  { key: "hips", label: "Hips", unit: "cm" },
  { key: "thigh", label: "Thigh", unit: "cm" },
  { key: "arm", label: "Arm (flexed)", unit: "cm" },
];

// general fitness and strength, not a calorie-restricted goal, so this is balanced everyday food, not a deficit plan
const POST_SESSION = {
  lower: { meal: "Grilled chicken or tofu, sweet potato, steamed greens", kcal: 500, protein: "35g protein" },
  upper: { meal: "Salmon or lentils, brown rice, mixed vegetables", kcal: 520, protein: "32g protein" },
  engine: { meal: "Greek yoghurt, berries, honey, small handful of nuts", kcal: 400, protein: "25g protein" },
};

const DINNERS = [
  { day: "Monday", meal: "Baked salmon, roasted vegetables, new potatoes" },
  { day: "Tuesday", meal: "Chicken or bean stir-fry with brown rice" },
  { day: "Wednesday", meal: "Grilled chicken salad with avocado and olive oil dressing" },
  { day: "Thursday", meal: "Turkey or lentil chilli with rice" },
  { day: "Friday", meal: "Prawn or halloumi and vegetable skewers, quinoa" },
  { day: "Saturday", meal: "Lean beef or bean stuffed peppers" },
  { day: "Sunday", meal: "Roast chicken or chickpea traybake with root vegetables" },
];

// pre-written coaching notes, tuned specifically for knees and lower back
const COACH_TIPS = {
  db_squat: "Hold the dumbbell close to your chest, sit back and down like into a chair. Knees should track the same direction as your toes, if they cave inward, drop the weight and slow down.",
  rdl: "This is a hip hinge, not a squat. Soft knees, push your hips back like closing a car boot, keep the dumbbell or bar close to your legs. The second your lower back rounds, that's your depth limit for the day.",
  hip_thrust: "Bench just below your shoulder blades, drive through your heels, squeeze glutes hard at the top. Don't overextend your lower back to get there, the movement should come from the hips.",
  step_up: "Full foot on the box, drive through the heel of the working leg. If your knee wobbles inward at the top, the box is too high or the weight's too heavy, both are easy fixes.",
  glute_bridge: "Feet flat, knees bent, squeeze glutes at the top rather than pushing through your lower back.",
  bird_dog: "Move slowly and keep your spine neutral, imagine a glass of water balanced on your lower back that you can't spill.",
  plank: "Squeeze glutes and brace your core, hips shouldn't sag or pike up. Stop the set the moment your lower back starts to dip.",
  db_bench: "Let the dumbbells travel slightly inward as you press, feet flat, don't arch excessively through the lower back to get the weight up.",
  lat_pulldown: "Lead with your elbows, pull to your upper chest, control the weight back up rather than letting it yank your arms.",
  incline_db_press: "Bench around 30 degrees, let the dumbbells come down to chest height, not your collarbone.",
  db_curl: "Elbows pinned to your sides the whole rep, if you're swinging your torso to finish a rep, the weight's too heavy.",
  hammer_curl: "Thumbs up throughout, don't twist into a regular curl halfway through.",
  dead_bug: "Press your lower back into the floor and keep it there the entire set, that's more important than how far your arm and leg extend.",
  skierg_500: "Drive with your legs first, then finish with your arms, not the other way round.",
  row_500: "Legs, then hips, then arms on the drive, reverse it coming back.",
  engine_block1: "Keep the row smooth rather than explosive, you've got two more blocks to come. Stay low and controlled on the band walk, don't let your knees drift inward.",
  engine_block2: "Same idea on the SkiErg, legs first, arms finish. Keep the squats light and controlled, this block's about rhythm, not load.",
  engine_block3: "Steady cadence on the bike beats sprinting and fading. Same band walk cue as block one, small controlled steps, tension held throughout.",
};

const META_KEY = "sue-tracker-meta-v1";
const ARCHIVE_KEY = "sue-tracker-archive-v1";
const NUTRITION_CHECKS_KEY = "sue-tracker-nutrition-v1";
const logsKeyForBlock = (blockNum) => `sue-tracker-logs-block-${blockNum}`;
const bodyKeyForBlock = (blockNum) => `sue-tracker-body-block-${blockNum}`;
const notesKeyForBlock = (blockNum) => `sue-tracker-notes-block-${blockNum}`;
const logKey = (week, session, exerciseId) => `w${week + 1}-${session}-${exerciseId}`;
const dayNoteKey = (week, session) => `w${week + 1}-${session}`;

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function weekFromDate(startDate) {
  if (!startDate) return 0;
  const start = new Date(startDate + "T00:00:00");
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 0;
  return Math.min(5, Math.floor(diffDays / 7));
}

const DEFAULT_META = { blockNum: 1, startDate: todayStr(), dbBenchBase: "", dbSquatBase: "", rdlBase: "", latPulldownBase: "" };

// --- set helpers ---
function getSets(logs, weekIdx, sessionKey, exerciseId, numSets) {
  const entry = logs[logKey(weekIdx, sessionKey, exerciseId)];
  const sets = (entry && entry.sets) || [];
  return Array.from({ length: numSets }, (_, i) => sets[i] || { weight: "", reps: "" });
}

function maxSetWeight(sets) {
  let max = 0;
  sets.forEach((s) => {
    const w = parseFloat(s.weight);
    if (w && w > max) max = w;
  });
  return max || null;
}

function isPR(logs, weekIdx, sessionKey, exerciseId, numSets) {
  const currentMax = maxSetWeight(getSets(logs, weekIdx, sessionKey, exerciseId, numSets));
  if (!currentMax) return false;
  for (let w = 0; w < 6; w++) {
    if (w === weekIdx) continue;
    const otherMax = maxSetWeight(getSets(logs, w, sessionKey, exerciseId, numSets));
    if (otherMax && otherMax >= currentMax) return false;
  }
  return true;
}

function timeToSeconds(str) {
  if (!str) return null;
  const parts = String(str).split(":").map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function isCardioPR(logs, weekIdx, sessionKey, exerciseId) {
  const current = logs[logKey(weekIdx, sessionKey, exerciseId)];
  const currentSecs = timeToSeconds(current && current.time);
  if (currentSecs === null) return false;
  for (let w = 0; w < 6; w++) {
    if (w === weekIdx) continue;
    const l = logs[logKey(w, sessionKey, exerciseId)];
    const otherSecs = timeToSeconds(l && l.time);
    if (otherSecs !== null && otherSecs <= currentSecs) return false;
  }
  return true;
}

// more rounds completed in the 10 minutes counts as a PR for these blocks
function isAmrapPR(logs, weekIdx, sessionKey, exerciseId) {
  const current = logs[logKey(weekIdx, sessionKey, exerciseId)];
  const currentRounds = parseFloat(current && current.rounds);
  if (!currentRounds) return false;
  for (let w = 0; w < 6; w++) {
    if (w === weekIdx) continue;
    const l = logs[logKey(w, sessionKey, exerciseId)];
    const otherRounds = parseFloat(l && l.rounds);
    if (otherRounds && otherRounds >= currentRounds) return false;
  }
  return true;
}

function suggestedWeight(logs, weekIdx, sessionKey, exerciseId, numSets, increment, isDeload) {
  for (let w = weekIdx - 1; w >= 0; w--) {
    const prevMax = maxSetWeight(getSets(logs, w, sessionKey, exerciseId, numSets));
    if (prevMax) {
      const suggested = isDeload ? roundTo1(prevMax * 0.85) : roundTo1(prevMax + increment);
      return { suggested, prevWeight: prevMax, prevWeek: w + 1 };
    }
  }
  return null;
}

function computeTonnage(logs, weekIdx, sessionKey, exercises) {
  let total = 0;
  exercises.forEach((ex) => {
    if (ex.type === "cardio" || ex.type === "amrap") return;
    if (String(ex.reps).toLowerCase().includes("sec")) return;
    const sets = getSets(logs, weekIdx, sessionKey, ex.id, ex.sets);
    sets.forEach((s) => {
      const w = parseFloat(s.weight);
      const r = parseInt(s.reps) || parseInt(ex.reps) || 0;
      if (w && r) total += w * r;
    });
  });
  return Math.round(total);
}

const TONNAGE_COMPARISONS = [
  { kg: 50, label: "a large dog" },
  { kg: 300, label: "a baby cow" },
  { kg: 500, label: "a grand piano" },
  { kg: 1000, label: "a small car" },
  { kg: 1500, label: "a great white shark" },
  { kg: 3000, label: "a hippo" },
];

function tonnageComparison(kg) {
  if (kg <= 0) return { current: null, next: TONNAGE_COMPARISONS[0] };
  let current = null;
  let next = null;
  for (let i = 0; i < TONNAGE_COMPARISONS.length; i++) {
    if (TONNAGE_COMPARISONS[i].kg <= kg) {
      current = TONNAGE_COMPARISONS[i];
    } else {
      next = TONNAGE_COMPARISONS[i];
      break;
    }
  }
  return { current, next };
}

// --- reporting helpers ---
function weeklyTonnageSeries(logsObj, bases) {
  return Array.from({ length: 6 }, (_, w) => {
    const plan = buildPlan(w, bases.dbBenchBase, bases.dbSquatBase, bases.rdlBase, bases.latPulldownBase);
    let total = 0;
    SESSIONS.forEach((s) => {
      total += computeTonnage(logsObj, w, s.key, plan[s.key]);
    });
    return { week: `W${w + 1}`, tonnage: total };
  });
}

function weeklyTopLiftSeries(logsObj, sessionKey, exerciseId, numSets) {
  return Array.from({ length: 6 }, (_, w) => ({
    week: `W${w + 1}`,
    weight: maxSetWeight(getSets(logsObj, w, sessionKey, exerciseId, numSets)) || null,
  }));
}

function bodyFieldSeries(bodyLogsObj, field) {
  return Array.from({ length: 6 }, (_, w) => {
    const wk = bodyLogsObj[`w${w + 1}`];
    const v = wk ? parseFloat(wk[field]) : null;
    return { week: `W${w + 1}`, value: v || null };
  });
}

function fieldTrend(bodyLogsObj, field) {
  let first = null;
  let last = null;
  for (let w = 1; w <= 6; w++) {
    const v = bodyLogsObj[`w${w}`] && parseFloat(bodyLogsObj[`w${w}`][field]);
    if (v) {
      if (first === null) first = v;
      last = v;
    }
  }
  if (first === null) return null;
  return { first, last, diff: +(last - first).toFixed(1) };
}

function countBlockPRs(logsObj, bases) {
  let count = 0;
  for (let w = 0; w < 6; w++) {
    const plan = buildPlan(w, bases.dbBenchBase, bases.dbSquatBase, bases.rdlBase, bases.latPulldownBase);
    SESSIONS.forEach((s) => {
      plan[s.key].forEach((ex) => {
        if (ex.type === "cardio") {
          if (isCardioPR(logsObj, w, s.key, ex.id)) count++;
        } else if (ex.type === "amrap") {
          if (isAmrapPR(logsObj, w, s.key, ex.id)) count++;
        } else {
          if (isPR(logsObj, w, s.key, ex.id, ex.sets)) count++;
        }
      });
    });
  }
  return count;
}

function blockStats(logsObj, bodyLogsObj, bases) {
  const tonnageSeries = weeklyTonnageSeries(logsObj, bases);
  const totalTonnage = tonnageSeries.reduce((a, b) => a + (b.tonnage || 0), 0);
  const prCount = countBlockPRs(logsObj, bases);
  const bw = fieldTrend(bodyLogsObj, "bodyweight");
  return { totalTonnage, prCount, bwChange: bw ? bw.diff : null };
}

// purple, blue and orange, on a light background so everything stays easy to read
const C = {
  page: "#F5F3FA",
  card: "#FFFFFF",
  ink: "#2E1A47",
  sub: "#6B5B7B",
  note: "#8B7B9B",
  line: "#2E1A47",
  accent: "#F26A1B",
  good: "#2F6FED",
};

// warm-up specific to each session, 5-6 minutes, kept deliberately gentle on knees and lower back
const WARMUPS = {
  lower: {
    title: "Lower Power Warm-Up",
    duration: "5-6 min",
    steps: [
      "Gentle leg swings, 10 each direction per leg",
      "Bodyweight squats, 12 reps, slow and controlled",
      "Glute bridges, 12 reps",
      "Cat-cow stretch for the lower back, 8 slow reps",
      "Walking knee hugs, 8 steps each leg",
    ],
  },
  upper: {
    title: "Upper Strength Warm-Up",
    duration: "5-6 min",
    steps: [
      "Arm circles, 20 seconds each direction",
      "Band pull-aparts or light resistance, 15 reps",
      "Push-up to downward dog, 6 slow reps (knees down is fine)",
      "Shoulder rolls and wrist rotations, 15 seconds each",
      "Light empty-handle lat pulldown, 2 sets of 10",
    ],
  },
  engine: {
    title: "Engine Room Warm-Up",
    duration: "5-6 min",
    steps: [
      "Gentle marching on the spot, 1 minute",
      "Leg swings, 10 each direction per leg",
      "Hip circles, 8 each direction",
      "Easy pace on whichever machine you're starting on, 1-2 minutes before the real effort",
    ],
  },
};

// a rotation of welcome lines, always Sue by name, picked at random each time the app opens
const WELCOME_MESSAGES = [
  "Hi Sue, it's time to get sweaty.",
  "Let's go Sue, those weights aren't going to lift themselves.",
  "Sue, your muscles just called, they've got a job for you.",
  "Ready when you are, Sue. Let's make today count.",
  "Sue! Time to turn that coffee into gains.",
  "Rise and grind, Sue, quite literally.",
  "Sue, the iron's calling your name.",
  "Let's get after it, Sue, future you will say thanks.",
  "Sue, today's the day to be a little stronger than yesterday.",
  "Suit up, Sue, it's training time.",
  "Sue, let's go make some noise in that gym.",
  "One more session closer to your goals, Sue. Let's move.",
];

function SplashScreen({ onEnter }) {
  const [message] = useState(() => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
      <Dumbbell size={40} color={C.accent} strokeWidth={2.5} />
      <h1 className="mt-4 text-white" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.25rem", letterSpacing: "0.02em", lineHeight: 1.15 }}>
        {message}
      </h1>
      <p className="mt-3 text-sm" style={{ color: "#D9CFE8", fontFamily: "'Inter', sans-serif" }}>
        Pick your session when you're in, Lower Power, Upper Strength, or the Engine Room.
      </p>
      <button
        onClick={onEnter}
        className="mt-8 px-8 py-3 rounded-full font-bold text-sm"
        style={{ backgroundColor: C.accent, color: "#FFFFFF", fontFamily: "'Inter', sans-serif" }}
      >
        Let's go
      </button>
    </div>
  );
}

export default function WorkoutTracker() {
  const [meta, setMeta] = useState(DEFAULT_META);
  const [weekIdx, setWeekIdx] = useState(0);
  const [sessionKey, setSessionKey] = useState("lower");
  const [logs, setLogs] = useState({});
  const [bodyLogs, setBodyLogs] = useState({});
  const [archive, setArchive] = useState([]);
  const [nutritionChecks, setNutritionChecks] = useState({});
  const [dayNotes, setDayNotes] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(null);
  const [activeTip, setActiveTip] = useState(null);
  const [warmupOpen, setWarmupOpen] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [view, setView] = useState("workout");
  const [restSeconds, setRestSeconds] = useState(null);
  const [timerOpen, setTimerOpen] = useState(false);

  useEffect(() => {
    if (restSeconds === null || restSeconds <= 0) return;
    const id = setInterval(() => setRestSeconds((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [restSeconds]);

  useEffect(() => {
    (async () => {
      let loadedMeta = DEFAULT_META;
      try {
        const res = await storage.get(META_KEY);
        if (res && res.value) loadedMeta = JSON.parse(res.value);
      } catch (e) {}
      setMeta(loadedMeta);
      setWeekIdx(weekFromDate(loadedMeta.startDate));

      try {
        const res = await storage.get(logsKeyForBlock(loadedMeta.blockNum));
        if (res && res.value) setLogs(JSON.parse(res.value));
      } catch (e) {}
      try {
        const res = await storage.get(bodyKeyForBlock(loadedMeta.blockNum));
        if (res && res.value) setBodyLogs(JSON.parse(res.value));
      } catch (e) {}
      try {
        const res = await storage.get(ARCHIVE_KEY);
        if (res && res.value) setArchive(JSON.parse(res.value));
      } catch (e) {}
      try {
        const res = await storage.get(NUTRITION_CHECKS_KEY);
        if (res && res.value) setNutritionChecks(JSON.parse(res.value));
      } catch (e) {}
      try {
        const res = await storage.get(notesKeyForBlock(loadedMeta.blockNum));
        if (res && res.value) setDayNotes(JSON.parse(res.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persistMeta = useCallback(async (next) => {
    setMeta(next);
    try {
      await storage.set(META_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("Could not save settings", e);
    }
  }, []);

  const persist = useCallback(
    async (next) => {
      setLogs(next);
      try {
        await storage.set(logsKeyForBlock(meta.blockNum), JSON.stringify(next));
      } catch (e) {
        console.error("Could not save", e);
      }
    },
    [meta.blockNum]
  );

  const persistBody = useCallback(
    async (next) => {
      setBodyLogs(next);
      try {
        await storage.set(bodyKeyForBlock(meta.blockNum), JSON.stringify(next));
      } catch (e) {
        console.error("Could not save", e);
      }
    },
    [meta.blockNum]
  );

  const persistNutrition = useCallback(async (next) => {
    setNutritionChecks(next);
    try {
      await storage.set(NUTRITION_CHECKS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("Could not save", e);
    }
  }, []);

  const persistNotes = useCallback(
    async (next) => {
      setDayNotes(next);
      try {
        await storage.set(notesKeyForBlock(meta.blockNum), JSON.stringify(next));
      } catch (e) {
        console.error("Could not save", e);
      }
    },
    [meta.blockNum]
  );

  const startNewBlock = async (newStartDate, newBases) => {
    const nextArchive = [...archive, { blockNum: meta.blockNum, startDate: meta.startDate, ...newBasesFrom(meta), logs, bodyLogs, dayNotes }];
    setArchive(nextArchive);
    try {
      await storage.set(ARCHIVE_KEY, JSON.stringify(nextArchive));
    } catch (e) {
      console.error("Could not archive block", e);
    }
    const newMeta = { blockNum: meta.blockNum + 1, startDate: newStartDate, ...newBases };
    await persistMeta(newMeta);
    setLogs({});
    setBodyLogs({});
    setDayNotes({});
    setWeekIdx(weekFromDate(newStartDate));
    setView("workout");
  };

  function newBasesFrom(m) {
    return { dbBenchBase: m.dbBenchBase, dbSquatBase: m.dbSquatBase, rdlBase: m.rdlBase, latPulldownBase: m.latPulldownBase };
  }

  const exportAllData = () => {
    const payload = { meta, logs, bodyLogs, archive, nutritionChecks, dayNotes, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sue-training-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importAllData = async (file) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.meta) throw new Error("That doesn't look like a backup file.");
    setMeta(parsed.meta);
    setLogs(parsed.logs || {});
    setBodyLogs(parsed.bodyLogs || {});
    setArchive(parsed.archive || []);
    setNutritionChecks(parsed.nutritionChecks || {});
    setDayNotes(parsed.dayNotes || {});
    setWeekIdx(weekFromDate(parsed.meta.startDate));
    await storage.set(META_KEY, JSON.stringify(parsed.meta));
    await storage.set(logsKeyForBlock(parsed.meta.blockNum), JSON.stringify(parsed.logs || {}));
    await storage.set(bodyKeyForBlock(parsed.meta.blockNum), JSON.stringify(parsed.bodyLogs || {}));
    await storage.set(ARCHIVE_KEY, JSON.stringify(parsed.archive || []));
    await storage.set(NUTRITION_CHECKS_KEY, JSON.stringify(parsed.nutritionChecks || {}));
    await storage.set(notesKeyForBlock(parsed.meta.blockNum), JSON.stringify(parsed.dayNotes || {}));
  };

  const plan = useMemo(
    () => buildPlan(weekIdx, meta.dbBenchBase, meta.dbSquatBase, meta.rdlBase, meta.latPulldownBase),
    [weekIdx, meta.dbBenchBase, meta.dbSquatBase, meta.rdlBase, meta.latPulldownBase]
  );
  const exercises = plan[sessionKey];
  const session = SESSIONS.find((s) => s.key === sessionKey);

  const updateLog = (exerciseId, field, value) => {
    const key = logKey(weekIdx, sessionKey, exerciseId);
    const existing = logs[key] || {};
    setLogs({ ...logs, [key]: { ...existing, [field]: value } });
  };

  const updateSetLog = (exerciseId, setIdx, field, value, numSets) => {
    const key = logKey(weekIdx, sessionKey, exerciseId);
    const existing = logs[key] || {};
    const existingSets = existing.sets || [];
    const newSets = Array.from({ length: numSets }, (_, i) =>
      i === setIdx ? { ...(existingSets[i] || { weight: "", reps: "" }), [field]: value } : existingSets[i] || { weight: "", reps: "" }
    );
    setLogs({ ...logs, [key]: { ...existing, sets: newSets } });
  };

  const saveEntry = (exerciseId) => {
    persist(logs);
    setSavedFlash(exerciseId);
    setTimeout(() => setSavedFlash(null), 1200);
    if (COACH_TIPS[exerciseId]) setActiveTip(exerciseId);
  };

  const completedCount = exercises.filter((ex) => {
    if (ex.type === "cardio") {
      const l = logs[logKey(weekIdx, sessionKey, ex.id)];
      return !!(l && l.time);
    }
    if (ex.type === "amrap") {
      const l = logs[logKey(weekIdx, sessionKey, ex.id)];
      return !!(l && l.rounds);
    }
    return !!maxSetWeight(getSets(logs, weekIdx, sessionKey, ex.id, ex.sets));
  }).length;

  const isBlockFinished = weekFromDate(meta.startDate) >= 5 && weekIdx === 5;
  const pct = Math.round((completedCount / exercises.length) * 100);
  const tonnage = useMemo(() => computeTonnage(logs, weekIdx, sessionKey, exercises), [logs, weekIdx, sessionKey, exercises]);
  const tonnageInfo = tonnageComparison(tonnage);

  return (
    <div className="min-h-screen font-sans pb-24" style={{ backgroundColor: C.page, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
        .font-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.03em; }
        .font-sans { font-family: 'Inter', sans-serif; }
      `}</style>

      {showSplash && <SplashScreen onEnter={() => setShowSplash(false)} />}

      {/* Masthead */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: C.ink }}>
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dumbbell size={22} color="#FFFFFF" strokeWidth={2.5} />
              <h1 className="font-display text-3xl text-white">BLOCK {meta.blockNum}</h1>
            </div>
            <button onClick={() => setView("settings")} className="p-2 rounded-full" style={{ backgroundColor: "#452862" }} aria-label="Settings">
              <Settings size={18} color={view === "settings" ? C.accent : "#FFFFFF"} />
            </button>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "#D9CFE8" }}>
            Legs & Glutes · Chest & Biceps · Conditioning
          </p>

          <div className="flex gap-2 mt-4 flex-wrap">
            {[
              ["workout", "Workout"],
              ["history", "History"],
              ["body", "Body"],
              ["nutrition", "Nutrition"],
              ["report", "Report"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold transition"
                style={view === key ? { backgroundColor: C.accent, color: "#FFFFFF" } : { backgroundColor: "#452862", color: "#D9CFE8" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "workout" && (
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between mt-5">
            <button
              onClick={() => setWeekIdx((w) => Math.max(0, w - 1))}
              disabled={weekIdx === 0}
              className="p-2 rounded-full disabled:opacity-30"
              style={{ backgroundColor: C.ink }}
              aria-label="Previous week"
            >
              <ChevronLeft size={20} color="#FFFFFF" />
            </button>
            <div className="text-center">
              <div className="font-display text-5xl leading-none" style={{ color: C.ink }}>
                WEEK {weekIdx + 1}
              </div>
              {weekIdx === 4 && (
                <div className="flex items-center justify-center gap-1 text-xs font-bold mt-1" style={{ color: C.accent }}>
                  <Flame size={12} /> PEAK WEEK
                </div>
              )}
              {weekIdx === 5 && (
                <div className="text-xs font-bold mt-1" style={{ color: C.good }}>
                  DELOAD
                </div>
              )}
            </div>
            <button
              onClick={() => setWeekIdx((w) => Math.min(5, w + 1))}
              disabled={weekIdx === 5}
              className="p-2 rounded-full disabled:opacity-30"
              style={{ backgroundColor: C.ink }}
              aria-label="Next week"
            >
              <ChevronRight size={20} color="#FFFFFF" />
            </button>
          </div>
          <p className="text-sm text-center mt-2 px-4" style={{ color: C.sub }}>
            {WEEK_NOTES[weekIdx]}
          </p>

          {isBlockFinished && (
            <div className="mt-4 rounded-xl p-3 text-center" style={{ backgroundColor: C.ink }}>
              <p className="text-sm text-white font-semibold">This block is done. Nice work.</p>
              <div className="flex gap-2 justify-center mt-2">
                <button onClick={() => setView("report")} className="text-sm font-bold rounded-lg px-4 py-1.5" style={{ backgroundColor: "#FFFFFF", color: C.ink }}>
                  See your report
                </button>
                <button onClick={() => setView("settings")} className="text-sm font-bold rounded-lg px-4 py-1.5" style={{ backgroundColor: C.accent, color: "#FFFFFF" }}>
                  Start block {meta.blockNum + 1}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5 mt-5">
            {SESSIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSessionKey(s.key)}
                className="py-2 rounded-lg text-xs font-bold border-2 transition"
                style={
                  sessionKey === s.key
                    ? { backgroundColor: C.ink, color: "#FFFFFF", borderColor: C.ink }
                    : { backgroundColor: C.card, color: C.ink, borderColor: "#E0D8EC" }
                }
              >
                {s.short}
                {s.optional && <div className="text-[9px] font-normal opacity-70">optional</div>}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <h2 className="font-display text-2xl" style={{ color: C.ink }}>
              {session.focus.toUpperCase()}
            </h2>
            <span className="text-xs font-bold" style={{ color: C.sub }}>
              {completedCount}/{exercises.length} logged
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full mt-2" style={{ backgroundColor: "#E5DCF0" }}>
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: C.accent }} />
          </div>

          {WARMUPS[sessionKey] && (
            <div className="mt-4 rounded-xl border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
              <button onClick={() => setWarmupOpen((o) => !o)} className="w-full flex items-center justify-between p-3">
                <span className="text-sm font-bold flex items-center gap-2" style={{ color: C.ink }}>
                  <Timer size={16} style={{ color: C.accent }} />
                  {WARMUPS[sessionKey].title} · {WARMUPS[sessionKey].duration}
                </span>
                <span className="text-xs font-bold" style={{ color: C.accent }}>
                  {warmupOpen ? "hide" : "show"}
                </span>
              </button>
              {warmupOpen && (
                <ol className="px-4 pb-4 space-y-1.5">
                  {WARMUPS[sessionKey].steps.map((s, i) => (
                    <li key={i} className="text-sm flex gap-2" style={{ color: C.sub }}>
                      <span className="font-bold shrink-0" style={{ color: C.ink }}>
                        {i + 1}.
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {exercises.map((ex) => {
              const key = logKey(weekIdx, sessionKey, ex.id);
              const entry = logs[key] || {};
              const isSaved = savedFlash === ex.id;
              const pr =
                ex.type === "cardio"
                  ? isCardioPR(logs, weekIdx, sessionKey, ex.id)
                  : ex.type === "amrap"
                  ? isAmrapPR(logs, weekIdx, sessionKey, ex.id)
                  : isPR(logs, weekIdx, sessionKey, ex.id, ex.sets);
              const suggestion =
                ex.type === "strength" ? suggestedWeight(logs, weekIdx, sessionKey, ex.id, ex.sets, ex.increment || 1, weekIdx === 5) : null;
              const noteToShow = suggestion
                ? weekIdx === 5
                  ? `Deload to ~${suggestion.suggested}kg, down from ${suggestion.prevWeight}kg in week ${suggestion.prevWeek}`
                  : `Aim for ~${suggestion.suggested}kg, up from ${suggestion.prevWeight}kg in week ${suggestion.prevWeek}`
                : ex.note;
              const setRows = ex.type === "strength" ? getSets(logs, weekIdx, sessionKey, ex.id, ex.sets) : [];

              return (
                <div key={ex.id} className="rounded-xl p-4 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      {EXERCISE_ICON[ex.id] && (
                        <div className="shrink-0 rounded-lg p-1.5" style={{ backgroundColor: C.page }}>
                          <MovementIcon type={EXERCISE_ICON[ex.id]} />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg leading-tight" style={{ color: C.ink }}>
                            {ex.name}
                          </h3>
                          {pr && (
                            <span className="flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: C.accent, color: "#FFFFFF" }}>
                              <Flame size={10} /> PR
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold mt-0.5" style={{ color: C.sub }}>
                          {ex.type === "cardio" || ex.type === "amrap" ? ex.target : `${ex.sets} sets × ${ex.reps} reps`}
                        </p>
                        <p className="text-sm mt-1 italic" style={{ color: C.note }}>
                          {noteToShow}
                        </p>
                      </div>
                    </div>
                    <a href={ex.video} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5 shrink-0" style={{ color: C.ink }}>
                      <Video size={20} />
                      <span className="text-[10px] font-bold">form</span>
                    </a>
                    {COACH_TIPS[ex.id] && (
                      <button
                        onClick={() => setActiveTip(activeTip === ex.id ? null : ex.id)}
                        className="flex flex-col items-center gap-0.5 shrink-0"
                        style={{ color: activeTip === ex.id ? C.accent : C.ink }}
                      >
                        <MessageCircle size={20} />
                        <span className="text-[10px] font-bold">coach</span>
                      </button>
                    )}
                  </div>

                  {activeTip === ex.id && COACH_TIPS[ex.id] && (
                    <div className="mt-3 rounded-lg p-3 border-2 flex items-start gap-2" style={{ backgroundColor: "#EEF2FF", borderColor: C.good }}>
                      <MessageCircle size={16} className="shrink-0 mt-0.5" style={{ color: C.good }} />
                      <p className="text-sm flex-1" style={{ color: C.ink }}>
                        {COACH_TIPS[ex.id]}
                      </p>
                      <button onClick={() => setActiveTip(null)} className="shrink-0" style={{ color: C.sub }}>
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {ex.type === "cardio" ? (
                    <div className="flex items-end gap-2 mt-3">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
                          Time (mm:ss)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={entry.time || ""}
                          onChange={(e) => updateLog(ex.id, "time", e.target.value)}
                          placeholder="1:45"
                          className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold"
                          style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }}
                        />
                      </div>
                      <button
                        onClick={() => saveEntry(ex.id)}
                        className="h-[38px] px-3 rounded-lg font-bold text-sm flex items-center gap-1 transition"
                        style={isSaved ? { backgroundColor: C.good, color: "#FFFFFF" } : { backgroundColor: C.ink, color: "#FFFFFF" }}
                      >
                        <Check size={16} />
                        {isSaved ? "Saved" : "Save"}
                      </button>
                    </div>
                  ) : ex.type === "amrap" ? (
                    <div className="flex items-end gap-2 mt-3">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
                          Rounds completed
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={entry.rounds || ""}
                          onChange={(e) => updateLog(ex.id, "rounds", e.target.value)}
                          placeholder="e.g. 6"
                          className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold"
                          style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }}
                        />
                      </div>
                      <button
                        onClick={() => saveEntry(ex.id)}
                        className="h-[38px] px-3 rounded-lg font-bold text-sm flex items-center gap-1 transition"
                        style={isSaved ? { backgroundColor: C.good, color: "#FFFFFF" } : { backgroundColor: C.ink, color: "#FFFFFF" }}
                      >
                        <Check size={16} />
                        {isSaved ? "Saved" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {setRows.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-bold w-10 shrink-0" style={{ color: C.sub }}>
                            Set {i + 1}
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={s.weight}
                            onChange={(e) => updateSetLog(ex.id, i, "weight", e.target.value, ex.sets)}
                            placeholder="kg"
                            className="w-20 rounded-lg px-2 py-2 outline-none text-sm border-2 font-semibold text-center"
                            style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }}
                          />
                          <input
                            type="text"
                            value={s.reps}
                            onChange={(e) => updateSetLog(ex.id, i, "reps", e.target.value, ex.sets)}
                            placeholder={ex.reps}
                            className="w-16 rounded-lg px-2 py-2 outline-none text-sm border-2 font-semibold text-center"
                            style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => saveEntry(ex.id)}
                        className="w-full h-[38px] px-3 rounded-lg font-bold text-sm flex items-center justify-center gap-1 transition"
                        style={isSaved ? { backgroundColor: C.good, color: "#FFFFFF" } : { backgroundColor: C.ink, color: "#FFFFFF" }}
                      >
                        <Check size={16} />
                        {isSaved ? "Saved" : "Save all sets"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {tonnage > 0 && (
            <div className="mt-4 rounded-xl p-4 border-2 text-center" style={{ backgroundColor: C.card, borderColor: C.accent }}>
              <p className="text-xs uppercase tracking-wide font-bold" style={{ color: C.sub }}>
                Today's tonnage
              </p>
              <p className="font-display text-4xl mt-1" style={{ color: C.accent }}>
                {tonnage.toLocaleString()} kg
              </p>
              {tonnageInfo.current && (
                <p className="text-sm mt-1" style={{ color: C.ink }}>
                  That's heavier than {tonnageInfo.current.label}
                  {tonnageInfo.next && <>, {(tonnageInfo.next.kg - tonnage).toLocaleString()}kg off matching {tonnageInfo.next.label}</>}.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 rounded-xl p-4 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
            <p className="text-sm font-bold" style={{ color: C.ink }}>
              Notes for today
            </p>
            <p className="text-xs mt-0.5 mb-2" style={{ color: C.sub }}>
              How did it feel, anything to remember for next time, anything that niggled. This gets saved and can be
              handed over when planning the next block.
            </p>
            <textarea
              value={dayNotes[dayNoteKey(weekIdx, sessionKey)] || ""}
              onChange={(e) => persistNotes({ ...dayNotes, [dayNoteKey(weekIdx, sessionKey)]: e.target.value })}
              placeholder="e.g. knee felt a bit off on the goblet squats, dropped the weight slightly"
              rows={3}
              className="w-full rounded-lg px-3 py-2 outline-none text-sm border-2"
              style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }}
            />
          </div>
        </div>
      )}

      {view === "history" && <HistoryView logs={logs} onReset={() => persist({})} />}
      {view === "body" && <BodyView bodyLogs={bodyLogs} weekIdx={weekIdx} setWeekIdx={setWeekIdx} onSave={persistBody} />}
      {view === "nutrition" && <NutritionView checks={nutritionChecks} onSave={persistNutrition} />}
      {view === "report" && <ReportView logs={logs} bodyLogs={bodyLogs} meta={meta} archive={archive} dayNotes={dayNotes} />}
      {view === "settings" && (
        <SettingsView
          meta={meta}
          archive={archive}
          onStartNewBlock={startNewBlock}
          onUpdateMeta={persistMeta}
          onExport={exportAllData}
          onImport={importAllData}
        />
      )}

      <div className="fixed bottom-4 right-4 z-20">
        {timerOpen && (
          <div className="rounded-xl p-4 mb-2 w-48 shadow-xl border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
            {restSeconds !== null ? (
              <div className="text-center">
                <div className="font-display text-5xl" style={{ color: restSeconds === 0 ? C.good : C.accent }}>
                  {Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, "0")}
                </div>
                <p className="text-xs mt-1 font-semibold" style={{ color: C.sub }}>
                  {restSeconds === 0 ? "Rest's up" : "resting"}
                </p>
                <button onClick={() => setRestSeconds(null)} className="mt-2 text-xs font-bold rounded-lg px-3 py-1" style={{ backgroundColor: "#EEE7F5", color: C.ink }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs uppercase tracking-wide font-bold mb-2 text-center" style={{ color: C.sub }}>
                  Rest timer
                </p>
                <div className="flex gap-1.5 justify-center">
                  {[60, 90, 120].map((s) => (
                    <button key={s} onClick={() => setRestSeconds(s)} className="font-bold text-sm rounded-lg px-2.5 py-1.5" style={{ backgroundColor: C.ink, color: "#FFFFFF" }}>
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setTimerOpen((o) => !o)}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg font-display text-lg"
          style={{ backgroundColor: C.accent, color: "#FFFFFF" }}
        >
          {restSeconds !== null ? `${restSeconds}` : <Timer size={22} />}
        </button>
      </div>
    </div>
  );
}

function SettingsView({ meta, archive, onStartNewBlock, onUpdateMeta, onExport, onImport }) {
  const [startDate, setStartDate] = useState(meta.startDate);
  const [dbBenchBase, setDbBenchBase] = useState(meta.dbBenchBase);
  const [dbSquatBase, setDbSquatBase] = useState(meta.dbSquatBase);
  const [rdlBase, setRdlBase] = useState(meta.rdlBase);
  const [latPulldownBase, setLatPulldownBase] = useState(meta.latPulldownBase);
  const [confirmingNewBlock, setConfirmingNewBlock] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const currentWeek = weekFromDate(startDate);

  const saveBaselines = () => {
    onUpdateMeta({
      ...meta,
      dbBenchBase: parseFloat(dbBenchBase),
      dbSquatBase: parseFloat(dbSquatBase),
      rdlBase: parseFloat(rdlBase),
      latPulldownBase: parseFloat(latPulldownBase),
    });
  };

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await onImport(file);
      setImportStatus("Backup restored.");
    } catch (err) {
      setImportStatus("That file couldn't be read, check it's the right backup file.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 mt-5">
      <h2 className="font-display text-2xl flex items-center gap-2" style={{ color: C.ink }}>
        <Settings size={18} /> SETTINGS
      </h2>

      <div className="rounded-xl p-4 border-2 mt-4" style={{ backgroundColor: C.card, borderColor: C.line }}>
        <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
          Block {meta.blockNum} start date
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold"
          style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }}
        />
        <p className="text-sm mt-2" style={{ color: C.sub }}>
          Based on this date, you're currently in Week {currentWeek + 1}.
        </p>
        <button onClick={() => onUpdateMeta({ ...meta, startDate })} className="mt-3 text-sm font-bold rounded-lg px-4 py-1.5" style={{ backgroundColor: C.ink, color: "#FFFFFF" }}>
          Save date
        </button>
      </div>

      <div className="rounded-xl p-4 border-2 mt-3" style={{ backgroundColor: C.card, borderColor: C.line }}>
        <p className="text-sm font-bold mb-3" style={{ color: C.ink }}>
          Current baseline lifts
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
              DB Bench (kg, per hand)
            </label>
            <input type="number" value={dbBenchBase} onChange={(e) => setDbBenchBase(e.target.value)} placeholder="e.g. 12.5" className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold" style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
              DB Squat (kg)
            </label>
            <input type="number" value={dbSquatBase} onChange={(e) => setDbSquatBase(e.target.value)} placeholder="e.g. 12.5" className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold" style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
              RDL (kg total)
            </label>
            <input type="number" value={rdlBase} onChange={(e) => setRdlBase(e.target.value)} placeholder="e.g. 12.5" className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold" style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
              Lat Pulldown (kg)
            </label>
            <input type="number" value={latPulldownBase} onChange={(e) => setLatPulldownBase(e.target.value)} placeholder="e.g. 65" className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold" style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }} />
          </div>
        </div>
        <button onClick={saveBaselines} className="mt-3 text-sm font-bold rounded-lg px-4 py-1.5" style={{ backgroundColor: C.ink, color: "#FFFFFF" }}>
          Save baselines
        </button>
      </div>

      <div className="rounded-xl p-4 border-2 mt-3" style={{ backgroundColor: C.card, borderColor: C.accent }}>
        <p className="text-sm font-bold mb-1" style={{ color: C.ink }}>
          Start a new six week block
        </p>
        <p className="text-sm mb-3" style={{ color: C.sub }}>
          Archives block {meta.blockNum}'s logs and opens a fresh six weeks with new baseline lifts based on wherever you've ended up.
        </p>
        {!confirmingNewBlock ? (
          <button onClick={() => setConfirmingNewBlock(true)} className="text-sm font-bold rounded-lg px-4 py-1.5" style={{ backgroundColor: C.accent, color: "#FFFFFF" }}>
            Start block {meta.blockNum + 1}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: C.ink }}>
              Update the baseline fields above first if they've changed, then confirm.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onStartNewBlock(startDate, {
                    dbBenchBase: parseFloat(dbBenchBase),
                    dbSquatBase: parseFloat(dbSquatBase),
                    rdlBase: parseFloat(rdlBase),
                    latPulldownBase: parseFloat(latPulldownBase),
                  });
                  setConfirmingNewBlock(false);
                }}
                className="text-sm font-bold rounded-lg px-4 py-1.5"
                style={{ backgroundColor: C.accent, color: "#FFFFFF" }}
              >
                Confirm, start new block
              </button>
              <button onClick={() => setConfirmingNewBlock(false)} className="text-sm px-2" style={{ color: C.sub }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl p-4 border-2 mt-3" style={{ backgroundColor: C.card, borderColor: C.line }}>
        <p className="text-sm font-bold mb-1" style={{ color: C.ink }}>
          Backup & Restore
        </p>
        <p className="text-sm mb-3" style={{ color: C.sub }}>
          Export everything to move to a new phone, or to send to Claude at the end of a block.
        </p>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={onExport} className="text-sm font-bold rounded-lg px-4 py-1.5" style={{ backgroundColor: C.ink, color: "#FFFFFF" }}>
            Export backup
          </button>
          <label className="text-sm font-bold rounded-lg px-4 py-1.5 cursor-pointer" style={{ backgroundColor: C.good, color: "#FFFFFF" }}>
            Import backup
            <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>
        {importStatus && (
          <p className="text-sm mt-2" style={{ color: C.sub }}>
            {importStatus}
          </p>
        )}
      </div>

      {archive.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: C.sub }}>
            Past blocks
          </p>
          {archive.map((a) => (
            <div key={a.blockNum} className="text-sm py-1 border-t" style={{ color: C.sub, borderColor: "#E0D8EC" }}>
              Block {a.blockNum}, started {a.startDate}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BodyView({ bodyLogs, weekIdx, setWeekIdx, onSave }) {
  const weekData = bodyLogs[`w${weekIdx + 1}`] || {};
  const updateField = (field, value) => onSave({ ...bodyLogs, [`w${weekIdx + 1}`]: { ...weekData, [field]: value } });
  const startVal = (field) => (bodyLogs["w1"] ? bodyLogs["w1"][field] : null);

  return (
    <div className="max-w-2xl mx-auto px-4 mt-5">
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekIdx((w) => Math.max(0, w - 1))} disabled={weekIdx === 0} className="p-2 rounded-full disabled:opacity-30" style={{ backgroundColor: C.ink }} aria-label="Previous week">
          <ChevronLeft size={20} color="#FFFFFF" />
        </button>
        <div className="font-display text-4xl leading-none" style={{ color: C.ink }}>
          WEEK {weekIdx + 1}
        </div>
        <button onClick={() => setWeekIdx((w) => Math.min(5, w + 1))} disabled={weekIdx === 5} className="p-2 rounded-full disabled:opacity-30" style={{ backgroundColor: C.ink }} aria-label="Next week">
          <ChevronRight size={20} color="#FFFFFF" />
        </button>
      </div>
      <p className="text-sm text-center mt-2" style={{ color: C.sub }}>
        Log this once a week, same day and time if you can.
      </p>

      <div className="mt-5 space-y-3">
        {BODY_FIELDS.map((f) => {
          const val = weekData[f.key] || "";
          const start = startVal(f.key);
          const diff = start && val ? (parseFloat(val) - parseFloat(start)).toFixed(1) : null;
          return (
            <div key={f.key} className="rounded-xl p-4 border-2 flex items-center gap-3" style={{ backgroundColor: C.card, borderColor: C.line }}>
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
                  {f.label} ({f.unit})
                </label>
                <input type="number" inputMode="decimal" value={val} onChange={(e) => updateField(f.key, e.target.value)} placeholder="0" className="w-full mt-1 rounded-lg px-3 py-2 outline-none text-sm border-2 font-semibold" style={{ backgroundColor: "#FAF9FC", color: C.ink, borderColor: "#E0D8EC" }} />
              </div>
              {diff !== null && weekIdx > 0 && (
                <div className="text-xs font-bold shrink-0" style={{ color: diff.startsWith("-") ? C.good : diff === "0.0" ? C.sub : C.accent }}>
                  {diff > 0 ? `+${diff}` : diff} vs W1
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NutritionView({ checks, onSave }) {
  const toggleDinner = (day) => onSave({ ...checks, [day]: !checks[day] });

  return (
    <div className="max-w-2xl mx-auto px-4 mt-5 pb-6">
      <h2 className="font-display text-2xl" style={{ color: C.ink }}>
        POST-SESSION FUEL
      </h2>
      <p className="text-sm mt-1 mb-3" style={{ color: C.sub }}>
        General fitness and strength is the goal here, not weight loss, so these are balanced meals, not a deficit plan.
      </p>
      <div className="space-y-3">
        {SESSIONS.map((s) => {
          const meal = POST_SESSION[s.key];
          return (
            <div key={s.key} className="rounded-xl p-4 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm" style={{ color: C.ink }}>
                  {s.label}
                </p>
                <span className="text-xs font-bold" style={{ color: C.accent }}>
                  ~{meal.kcal} kcal
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: C.ink }}>
                {meal.meal}
              </p>
              <p className="text-xs mt-1" style={{ color: C.sub }}>
                {meal.protein}
              </p>
            </div>
          );
        })}
      </div>

      <h2 className="font-display text-2xl mt-7" style={{ color: C.ink }}>
        EVERYDAY DINNERS
      </h2>
      <p className="text-sm mt-1 mb-3" style={{ color: C.sub }}>
        Simple, balanced ideas for the rest of the week. Swap anything for what you fancy.
      </p>
      <div className="space-y-3">
        {DINNERS.map((d) => {
          const done = !!checks[d.day];
          return (
            <button
              key={d.day}
              onClick={() => toggleDinner(d.day)}
              className="w-full text-left rounded-xl p-4 border-2 flex items-start justify-between gap-3 transition"
              style={{ backgroundColor: done ? C.ink : C.card, borderColor: C.line }}
            >
              <div>
                <p className="font-bold text-sm" style={{ color: done ? "#FFFFFF" : C.ink }}>
                  {d.day}
                </p>
                <p className="text-sm mt-1" style={{ color: done ? "#D9CFE8" : C.ink }}>
                  {d.meal}
                </p>
              </div>
              <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: done ? "#FFFFFF" : C.line, backgroundColor: done ? C.accent : "transparent" }}>
                {done && <Check size={14} color="#FFFFFF" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl p-3 border-2 text-center" style={{ backgroundColor: C.card, borderColor: C.line }}>
      <p className="text-[10px] uppercase tracking-wide font-bold" style={{ color: C.sub }}>
        {label}
      </p>
      <p className="font-display text-3xl mt-1" style={{ color: C.ink }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-0.5" style={{ color: C.note }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function ReportView({ logs, bodyLogs, meta, archive, dayNotes }) {
  const bases = { dbBenchBase: meta.dbBenchBase, dbSquatBase: meta.dbSquatBase, rdlBase: meta.rdlBase, latPulldownBase: meta.latPulldownBase };
  const tonnageSeries = useMemo(() => weeklyTonnageSeries(logs, bases), [logs, meta.dbBenchBase, meta.dbSquatBase, meta.rdlBase, meta.latPulldownBase]);
  const benchSeries = useMemo(() => weeklyTopLiftSeries(logs, "upper", "db_bench", 4), [logs]);
  const squatSeries = useMemo(() => weeklyTopLiftSeries(logs, "lower", "db_squat", 3), [logs]);
  const bwSeries = useMemo(() => bodyFieldSeries(bodyLogs, "bodyweight"), [bodyLogs]);
  const waistSeries = useMemo(() => bodyFieldSeries(bodyLogs, "waist"), [bodyLogs]);
  const bwTrend = fieldTrend(bodyLogs, "bodyweight");
  const waistTrend = fieldTrend(bodyLogs, "waist");
  const totalTonnage = tonnageSeries.reduce((a, b) => a + (b.tonnage || 0), 0);
  const prCount = countBlockPRs(logs, bases);

  const liftChartData = benchSeries.map((b, i) => ({ week: b.week, dbBench: b.weight, dbSquat: squatSeries[i].weight }));
  const bodyChartData = bwSeries.map((b, i) => ({ week: b.week, bodyweight: b.value, waist: waistSeries[i].value }));

  const allBlocks = [
    ...archive.map((a) => ({ blockNum: a.blockNum, ...blockStats(a.logs, a.bodyLogs, a) })),
    { blockNum: meta.blockNum, ...blockStats(logs, bodyLogs, bases), current: true },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 mt-5 pb-8">
      <h2 className="font-display text-2xl flex items-center gap-2" style={{ color: C.ink }}>
        <BarChart3 size={18} /> BLOCK {meta.blockNum} REPORT
      </h2>
      <p className="text-sm mt-1 mb-4" style={{ color: C.sub }}>
        A rolling summary, updated as you log.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Bodyweight" value={bwTrend ? `${bwTrend.diff > 0 ? "+" : ""}${bwTrend.diff}kg` : "—"} sub={bwTrend ? `${bwTrend.first}kg → ${bwTrend.last}kg` : "Log your weight to see this"} />
        <StatCard label="Waist" value={waistTrend ? `${waistTrend.diff > 0 ? "+" : ""}${waistTrend.diff}cm` : "—"} sub={waistTrend ? `${waistTrend.first}cm → ${waistTrend.last}cm` : "Log your waist to see this"} />
        <StatCard label="Total tonnage" value={`${totalTonnage.toLocaleString()}kg`} sub="Moved so far this block" />
        <StatCard label="PRs hit" value={prCount} sub="Across every lift this block" />
      </div>

      <h3 className="font-display text-xl mt-6" style={{ color: C.ink }}>
        STRENGTH PROGRESSION
      </h3>
      <p className="text-xs mb-2" style={{ color: C.sub }}>
        Top set each week, DB bench and DB squat.
      </p>
      <div className="rounded-xl p-3 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={liftChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#E5DCF0" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.sub }} />
            <YAxis tick={{ fontSize: 11, fill: C.sub }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="dbBench" stroke={C.accent} strokeWidth={2} connectNulls dot={{ r: 3 }} />
            <Line type="monotone" dataKey="dbSquat" stroke={C.good} strokeWidth={2} connectNulls dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="font-display text-xl mt-6" style={{ color: C.ink }}>
        BODY MEASUREMENTS
      </h3>
      <div className="rounded-xl p-3 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={bodyChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#E5DCF0" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.sub }} />
            <YAxis tick={{ fontSize: 11, fill: C.sub }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="bodyweight" stroke={C.accent} strokeWidth={2} connectNulls dot={{ r: 3 }} />
            <Line type="monotone" dataKey="waist" stroke={C.good} strokeWidth={2} connectNulls dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="font-display text-xl mt-6" style={{ color: C.ink }}>
        WEEKLY TONNAGE
      </h3>
      <div className="rounded-xl p-3 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={tonnageSeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#E5DCF0" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.sub }} />
            <YAxis tick={{ fontSize: 11, fill: C.sub }} />
            <Tooltip />
            <Bar dataKey="tonnage" fill={C.accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {allBlocks.length > 1 && (
        <>
          <h3 className="font-display text-xl mt-6" style={{ color: C.ink }}>
            BLOCK BY BLOCK
          </h3>
          <div className="rounded-xl p-3 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={allBlocks.map((b) => ({ name: `Block ${b.blockNum}`, tonnage: b.totalTonnage }))} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#E5DCF0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.sub }} />
                <YAxis tick={{ fontSize: 11, fill: C.sub }} />
                <Tooltip />
                <Bar dataKey="tonnage" fill={C.ink} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {Object.values(dayNotes || {}).some((n) => n && n.trim()) && (
        <>
          <h3 className="font-display text-xl mt-6" style={{ color: C.ink }}>
            SESSION NOTES
          </h3>
          <p className="text-xs mb-2" style={{ color: C.sub }}>
            Everything logged this block, in one place, ready to hand over when planning the next one.
          </p>
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, w) => w).map((w) =>
              SESSIONS.map((s) => {
                const note = dayNotes[dayNoteKey(w, s.key)];
                if (!note || !note.trim()) return null;
                return (
                  <div key={`${w}-${s.key}`} className="rounded-lg p-3 border-2" style={{ backgroundColor: C.card, borderColor: C.line }}>
                    <p className="text-xs font-bold" style={{ color: C.accent }}>
                      Week {w + 1}, {s.label}
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: C.ink }}>
                      {note}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HistoryView({ logs, onReset }) {
  const allSessions = buildPlan(0, 12.5, 12.5, 12.5, 65);
  const [confirmReset, setConfirmReset] = useState(false);

  const exerciseRows = useMemo(() => {
    const rows = [];
    Object.entries(allSessions).forEach(([sessionKey, exList]) => {
      exList.forEach((ex) => {
        const weeks = [];
        for (let w = 0; w < 6; w++) {
          if (ex.type === "cardio") {
            const l = logs[logKey(w, sessionKey, ex.id)];
            weeks.push(l && l.time ? l.time : "—");
          } else if (ex.type === "amrap") {
            const l = logs[logKey(w, sessionKey, ex.id)];
            weeks.push(l && l.rounds ? `${l.rounds} rounds` : "—");
          } else {
            const sets = getSets(logs, w, sessionKey, ex.id, ex.sets).filter((s) => s.weight);
            weeks.push(sets.length ? sets.map((s) => `${s.weight}${s.reps ? `×${s.reps}` : ""}`).join(" / ") : "—");
          }
        }
        rows.push({ name: ex.name, weeks });
      });
    });
    return rows;
  }, [logs]);

  return (
    <div className="max-w-2xl mx-auto px-4 mt-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} style={{ color: C.ink }} />
          <h2 className="font-display text-2xl" style={{ color: C.ink }}>
            PROGRESS LOG
          </h2>
        </div>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)} className="text-xs flex items-center gap-1 font-semibold" style={{ color: C.sub }}>
            <RotateCcw size={12} /> Reset block
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: C.accent }}>Sure?</span>
            <button onClick={() => { onReset(); setConfirmReset(false); }} className="font-bold" style={{ color: C.accent }}>
              Yes
            </button>
            <button onClick={() => setConfirmReset(false)} style={{ color: C.sub }}>
              No
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr>
              <th className="text-left py-2 pr-2 font-bold sticky left-0" style={{ backgroundColor: C.page, color: C.ink }}>
                Exercise
              </th>
              {[1, 2, 3, 4, 5, 6].map((w) => (
                <th key={w} className="text-center py-2 px-1 font-bold" style={{ color: C.ink }}>
                  W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exerciseRows.map((row, i) => (
              <tr key={i} className="border-t-2" style={{ borderColor: "#E0D8EC" }}>
                <td className="py-2 pr-2 font-semibold sticky left-0" style={{ backgroundColor: C.page, color: C.ink }}>
                  {row.name}
                </td>
                {row.weeks.map((w, j) => (
                  <td key={j} className="text-center py-2 px-1 whitespace-nowrap" style={{ color: C.sub }}>
                    {w}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
