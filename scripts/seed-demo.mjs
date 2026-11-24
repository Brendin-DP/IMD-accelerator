#!/usr/bin/env node
/**
 * Seeds data/db.json with a full demo environment on top of the exported data:
 * extra clients, users and plans; active, upcoming and finished cohorts; and
 * participants and reviewers at every stage of progress.
 *
 *   npm run db:seed                 # (re)seed, dates relative to today
 *   npm run db:seed -- --reports    # also build pulse PDFs (dev server must be running)
 *
 * Re-runnable: every seeded row has a deterministic id, so a re-run replaces the
 * previous seed instead of duplicating it. Dates are relative to the day you run
 * it, so re-run when "active" cohorts have drifted into the past.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DB_FILE = path.join(ROOT, "data", "db.json");
const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

// Strip the previous seed first so this run starts from the exported data only.
// data/seed-ids.json remembers what the last run created.
const IDS_FILE = path.join(ROOT, "data", "seed-ids.json");
const previous = fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) : {};
for (const [table, ids] of Object.entries(previous)) {
  const drop = new Set(ids);
  if (Array.isArray(db[table])) db[table] = db[table].filter((r) => !drop.has(r.id));
}
// Reports are created by the app (not this script) for seeded assessments; drop them and their PDFs too.
const previousPAs = new Set(previous.participant_assessments ?? []);
const livePAs = new Set(db.participant_assessments.map((p) => p.id));
db.assessment_reports = (db.assessment_reports ?? []).filter((r) => {
  if (livePAs.has(r.participant_assessment_id) && !previousPAs.has(r.participant_assessment_id)) return true;
  fs.rmSync(path.join(ROOT, "data", "storage", "reports", r.storage_path), { force: true });
  return false;
});

// ---------------------------------------------------------------- helpers

/** Deterministic UUID (v5-style) so re-runs overwrite instead of duplicating. */
const uid = (key) => {
  const h = crypto.createHash("sha1").update(`imd-demo-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Small seeded PRNG (mulberry32) so the data set is stable between runs. */
let seed = 20261124;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const shuffle = (arr) => arr.map((v) => [rand(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

const TODAY = new Date();
TODAY.setUTCHours(9, 0, 0, 0);
const day = (offset) => new Date(TODAY.getTime() + offset * 86400000);
const date = (offset) => day(offset).toISOString().slice(0, 10);
/** Timestamp `offset` days from today, never later than now. */
const ts = (offset, minutes = 0) => {
  const t = new Date(day(offset).getTime() + minutes * 60000);
  return (t > new Date() ? new Date(Date.now() - 3600000) : t).toISOString();
};

const seeded = new Map(); // table -> rows
const add = (table, row) => {
  if (!seeded.has(table)) seeded.set(table, []);
  seeded.get(table).push(row);
  return row;
};

// ---------------------------------------------------------------- reference data

const TYPE_360 = db.assessment_types.find((t) => t.name === "360");
const TYPE_PULSE = db.assessment_types.find((t) => t.name === "pulse");
const DEF_360 = db.assessment_definitions_v2.find((d) => d.name === "Standard 360 Assessment");
const DEF_PULSE = db.assessment_definitions_v2.find((d) => d.name === "Standard Pulse Survey");
if (!TYPE_360 || !TYPE_PULSE || !DEF_360 || !DEF_PULSE) throw new Error("Expected system assessment types/definitions are missing from data/db.json");

const questionsFor = (defId) => {
  const steps = new Map(db.assessment_steps_v2.filter((s) => s.assessment_definition_id === defId).map((s) => [s.id, s.step_order]));
  return db.assessment_questions_v2
    .filter((q) => q.assessment_definition_id === defId)
    .sort((a, b) => (steps.get(a.step_id) ?? 0) - (steps.get(b.step_id) ?? 0) || a.question_order - b.question_order);
};
const QUESTIONS = { [DEF_360.id]: questionsFor(DEF_360.id), [DEF_PULSE.id]: questionsFor(DEF_PULSE.id) };

// All existing client users share one test password; seeded users get the same one.
const pwCounts = {};
for (const u of db.client_users) if (u.password_hash) pwCounts[u.password_hash] = (pwCounts[u.password_hash] ?? 0) + 1;
const CLIENT_PASSWORD = Object.entries(pwCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "demo-client";

const ADMIN = db.imd_users.find((u) => u.email === "avery.demo@example.com") ?? db.imd_users[0];

// ---------------------------------------------------------------- answers

const OPENERS = [
  "Consistently", "In most situations", "Particularly over the last quarter", "When the pressure is on",
  "In one-to-ones", "During the reorganisation", "With cross-functional partners", "In team meetings",
];
const OBSERVATIONS = [
  "sets a clear direction and explains the why behind decisions",
  "creates space for the quieter voices in the team to contribute",
  "follows through on commitments and keeps stakeholders informed",
  "gives specific, timely feedback that people can act on",
  "stays calm and pragmatic when priorities shift",
  "connects day-to-day work back to the wider strategy",
  "delegates meaningful work rather than just tasks",
  "challenges assumptions without shutting the conversation down",
  "is open about mistakes and what was learned from them",
  "builds trust quickly with new team members",
];
const GROWTH = [
  "There is room to delegate earlier instead of stepping in at the last minute.",
  "Sharing context sooner would help the team prioritise on their own.",
  "Making more time for coaching conversations would multiply the impact.",
  "Being more explicit about trade-offs would reduce rework.",
  "Celebrating wins more visibly would lift team energy.",
  "Saying no to lower-value requests would protect focus time.",
  "",
  "",
];
const answer = () => `${pick(OPENERS)}, ${pick(OBSERVATIONS)}. ${pick(GROWTH)}`.trim();

// ---------------------------------------------------------------- people

const FIRST = [
  "Amara", "Ben", "Chiara", "Dev", "Elif", "Felix", "Gabriela", "Hiro", "Ines", "Jonas", "Kwame", "Lena",
  "Marco", "Nadia", "Omar", "Priya", "Quinn", "Rosa", "Sami", "Tess", "Umar", "Vera", "Wes", "Xenia",
  "Yusuf", "Zara", "Anouk", "Bruno", "Camille", "Dario", "Esme", "Finn", "Greta", "Hamza", "Ilse", "Jasper",
];
const LAST = [
  "Achebe", "Bauer", "Costa", "Dubois", "Eriksen", "Fischer", "Gomez", "Haddad", "Ivanova", "Jansen",
  "Kowalski", "Larsen", "Moreau", "Novak", "Okafor", "Petrov", "Quist", "Rossi", "Sato", "Tanaka",
  "Uysal", "Vargas", "Weber", "Xu", "Yilmaz", "Zimmermann",
];

const usedEmails = new Set(db.client_users.map((u) => u.email));
function makeUser(client, i, role = "participant") {
  let first, last, email;
  do {
    first = pick(FIRST);
    last = pick(LAST);
    email = `${first}.${last}@${client.subdomain}.example.com`.toLowerCase();
  } while (usedEmails.has(email));
  usedEmails.add(email);
  return add("client_users", {
    id: uid(`user:${client.subdomain}:${i}`),
    client_id: client.id,
    email,
    name: first,
    surname: last,
    role,
    status: "active",
    password_hash: CLIENT_PASSWORD,
    created_at: ts(-260 + i),
  });
}

// ---------------------------------------------------------------- clients

const existingClient = (sub) => db.clients.find((c) => c.subdomain === sub);
const SPACEX = existingClient("spacex");
const LEGO = existingClient("lego");

const NEW_CLIENTS = [
  { key: "northwind", name: "Northwind Logistics", status: "active", created: -240 },
  { key: "helios", name: "Helios Energy", status: "active", created: -120 },
  { key: "atlas", name: "Atlas Retail Group", status: "inactive", created: -400 },
].map((c) =>
  add("clients", {
    id: uid(`client:${c.key}`),
    name: c.name,
    primary_contact_email: `people.team@${c.key}.example.com`,
    status: c.status,
    created_by: ADMIN?.id ?? null,
    created_at: ts(c.created),
    subdomain: c.key,
    logo_url: null,
    theme: null,
  }),
);
const [NORTHWIND, HELIOS, ATLAS] = NEW_CLIENTS;

// Users per client: existing SpaceX users are reused; others get new people.
const usersBy = new Map();
usersBy.set(SPACEX.id, db.client_users.filter((u) => u.client_id === SPACEX.id && u.status === "active"));
const extraUsers = (client, n) => {
  const list = [...(usersBy.get(client.id) ?? db.client_users.filter((u) => u.client_id === client.id))];
  for (let i = 0; i < n; i++) list.push(makeUser(client, i, i === 0 ? "manager" : i === 1 ? "observer" : "participant"));
  usersBy.set(client.id, list);
};
extraUsers(LEGO, 16);
extraUsers(NORTHWIND, 22);
extraUsers(HELIOS, 14);
extraUsers(ATLAS, 8);

// ---------------------------------------------------------------- plans

const planDesc = (text, mapping) => `${text}\n<!--PLAN_ASSESSMENT_DEFINITIONS:${JSON.stringify(mapping)}-->`;
const PLAN_ACCEL = add("plans", {
  id: uid("plan:leadership-accelerator"),
  name: "Leadership Accelerator",
  description: planDesc("12-week programme: a 360 at the start, a pulse check mid-way.", {
    [TYPE_360.id]: DEF_360.id,
    [TYPE_PULSE.id]: DEF_PULSE.id,
  }),
  created_at: ts(-300),
});
const PLAN_PULSE = add("plans", {
  id: uid("plan:team-pulse"),
  name: "Team Pulse Programme",
  description: planDesc("Short pulse survey with peer input.", { [TYPE_PULSE.id]: DEF_PULSE.id }),
  created_at: ts(-290),
});
const PLAN_360 = add("plans", {
  id: uid("plan:executive-360"),
  name: "Executive 360",
  description: planDesc("Full 360 for senior leaders with internal and external reviewers.", { [TYPE_360.id]: DEF_360.id }),
  created_at: ts(-280),
});
for (const [plan, types] of [[PLAN_ACCEL, [TYPE_360, TYPE_PULSE]], [PLAN_PULSE, [TYPE_PULSE]], [PLAN_360, [TYPE_360]]]) {
  for (const t of types) add("plan_assessments", { id: uid(`plan-assessment:${plan.id}:${t.id}`), plan_id: plan.id, assessment_type_id: t.id });
}

// ---------------------------------------------------------------- cohorts

/**
 * phase: "finished" (ended), "late" (most done), "mid" (spread), "early" (just started), "upcoming" (not started).
 * Each mix entry is the share of participants in that state.
 */
const MIX = {
  finished: { done: 0.85, progress: 0.1, none: 0.05 },
  late: { done: 0.6, progress: 0.3, none: 0.1 },
  mid: { done: 0.3, progress: 0.45, none: 0.25 },
  early: { done: 0.05, progress: 0.35, none: 0.6 },
  upcoming: { done: 0, progress: 0, none: 1 },
};

const COHORTS = [
  { key: "spacex-accel-q4", client: SPACEX, name: "Leadership Accelerator — Cohort 4", plan: PLAN_ACCEL, start: -35, end: 50, phase: "mid", size: 14 },
  { key: "spacex-accel-q2", client: SPACEX, name: "Leadership Accelerator — Cohort 3", plan: PLAN_ACCEL, start: -220, end: -130, phase: "finished", size: 12 },
  { key: "lego-emerging", client: LEGO, name: "Emerging Leaders", plan: PLAN_PULSE, start: -20, end: 40, phase: "late", size: 12 },
  { key: "lego-exec-upcoming", client: LEGO, name: "Executive 360 — Spring Intake", plan: PLAN_360, start: 21, end: 110, phase: "upcoming", size: 6 },
  { key: "northwind-ops", client: NORTHWIND, name: "Operations Managers Pulse", plan: PLAN_PULSE, start: -6, end: 30, phase: "early", size: 12 },
  { key: "northwind-flm", client: NORTHWIND, name: "First-line Managers Programme", plan: PLAN_ACCEL, start: -170, end: -95, phase: "finished", size: 10 },
  { key: "helios-exec", client: HELIOS, name: "Executive 360 — Winter", plan: PLAN_360, start: -12, end: 75, phase: "mid", size: 10 },
  { key: "atlas-pilot", client: ATLAS, name: "Store Leaders Pilot", plan: PLAN_PULSE, start: -380, end: -330, phase: "finished", size: 6 },
];

const reportsToBuild = [];

for (const c of COHORTS) {
  const cohortId = uid(`cohort:${c.key}`);
  const status = c.phase === "finished" ? "completed" : c.phase === "upcoming" ? "draft" : "active";
  add("cohorts", {
    id: cohortId,
    client_id: c.client.id,
    name: c.name,
    plan_id: c.plan.id,
    start_date: date(c.start),
    end_date: date(c.end),
    status,
    created_by: ADMIN?.id ?? null,
    created_at: ts(c.start - 14),
  });

  // Assessments in the plan. In the accelerator the pulse opens half-way through.
  const types = [...new Set(db.plan_assessments.concat(seeded.get("plan_assessments")).filter((pa) => pa.plan_id === c.plan.id).map((pa) => pa.assessment_type_id))];
  const span = c.end - c.start;
  const assessments = types.map((typeId, i) => {
    const is360 = typeId === TYPE_360.id;
    const def = is360 ? DEF_360 : DEF_PULSE;
    const aStart = types.length > 1 && !is360 ? c.start + Math.floor(span / 2) : c.start;
    const opened = aStart <= 0;
    const phase = !opened ? "upcoming" : c.phase === "mid" && !is360 && types.length > 1 ? "early" : c.phase;
    const ca = add("cohort_assessments", {
      id: uid(`cohort-assessment:${c.key}:${i}`),
      cohort_id: cohortId,
      assessment_type_id: typeId,
      name: `${c.name} — ${is360 ? "360 Feedback" : "Pulse Check"}`,
      start_date: date(aStart),
      end_date: date(c.end),
      created_at: ts(c.start - 14, 5),
      assessment_status: phase === "finished" ? "Completed" : phase === "upcoming" ? "Not started" : "In Progress",
      template_version_id: null,
      assessment_definition_id: def.id,
    });
    return { ca, def, is360, phase, aStart };
  });

  // Participants
  const pool = shuffle((usersBy.get(c.client.id) ?? []).filter((u) => u.role !== "observer"));
  const members = pool.slice(0, Math.min(c.size, pool.length));
  const participants = members.map((user, i) =>
    add("cohort_participants", { id: uid(`participant:${c.key}:${user.id}`), cohort_id: cohortId, client_user_id: user.id, status: "invited", _i: i }),
  );

  // Progress per participant per assessment
  for (const a of assessments) {
    const mix = MIX[a.phase];
    const n = participants.length;
    const doneN = Math.round(n * mix.done);
    const progN = Math.round(n * mix.progress);
    participants.forEach((p, i) => {
      const state = i < doneN ? "done" : i < doneN + progN ? "progress" : "none";
      const user = members[i];
      // Not-started participants in an upcoming assessment have no row yet (created when they open it).
      if (a.phase === "upcoming") return;

      const paId = uid(`pa:${a.ca.id}:${p.id}`);
      const createdOffset = a.aStart + between(0, 3);
      const progressPct = state === "done" ? 100 : state === "progress" ? pick([12, 24, 40, 56, 68, 80, 92]) : 0;
      const submittedOffset = Math.min(-1, a.aStart + between(5, Math.max(6, -a.aStart - 1)));
      add("participant_assessments", {
        id: paId,
        cohort_assessment_id: a.ca.id,
        participant_id: p.id,
        status: state === "done" ? "Completed" : state === "progress" ? "In Progress" : "Not started",
        score: null,
        submitted_at: state === "done" ? ts(submittedOffset, between(0, 600)) : null,
        allow_reviewer_nominations: true,
        created_at: ts(createdOffset, between(0, 600)),
      });

      // Participant's own questionnaire session
      if (state !== "none") {
        session({
          key: `self:${paId}`,
          paId,
          def: a.def,
          type: "participant",
          clientUserId: user.id,
          pct: progressPct,
          startOffset: createdOffset,
          submitOffset: state === "done" ? submittedOffset : null,
        });
      }
      if (state === "done" && !a.is360) reportsToBuild.push(paId);

      // Reviewer nominations: participants who have started usually nominate peers.
      if (state === "none" && rand() < 0.7) return;
      const peers = shuffle(members.filter((m) => m.id !== user.id)).slice(0, between(2, 4));
      const externals = a.is360 ? between(1, 2) : rand() < 0.4 ? 1 : 0;
      const reviewers = [...peers.map((u) => ({ internal: u })), ...Array.from({ length: externals }, (_, k) => ({ external: k }))];
      reviewers.forEach((r, k) => {
        const nomId = uid(`nomination:${paId}:${k}`);
        const nomOffset = createdOffset + between(0, 2);
        // Reviewer progress tracks the cohort phase.
        const roll = rand();
        const request =
          a.phase === "finished" ? (roll < 0.92 ? "accepted" : "rejected") :
          a.phase === "early" ? (roll < 0.45 ? "pending" : roll < 0.95 ? "accepted" : "rejected") :
          roll < 0.2 ? "pending" : roll < 0.92 ? "accepted" : "rejected";
        // Reviews track the participant: finished participants mostly have all
        // reviews in; those still answering have a mix; others barely started.
        const r2 = rand();
        const doneShare =
          a.phase === "finished" ? 0.97 :
          state === "done" ? (a.phase === "early" ? 0.6 : 0.9) :
          state === "progress" ? (a.phase === "late" ? 0.5 : 0.3) : 0.05;
        const review =
          request !== "accepted" ? null :
          r2 < doneShare ? "Completed" :
          r2 < doneShare + (1 - doneShare) * 0.6 ? "In progress" : "Not started";
        const reviewSubmitted = review === "Completed" ? Math.min(-1, nomOffset + between(3, 20)) : null;

        let externalId = null;
        if (r.external !== undefined) {
          const first = pick(FIRST), last = pick(LAST);
          externalId = add("external_reviewers", {
            id: uid(`external:${nomId}`),
            client_id: c.client.id,
            email: `${first}.${last}@partner.example.com`.toLowerCase(),
            name: `${first} ${last}`,
            status: request === "accepted" ? "active" : "invited",
            invited_by: user.id,
            created_at: ts(nomOffset, 30),
            review_status: review,
          }).id;
        }
        add("reviewer_nominations", {
          id: nomId,
          participant_assessment_id: paId,
          nominated_by_id: user.id,
          reviewer_id: r.internal?.id ?? null,
          review_submitted_at: reviewSubmitted !== null ? ts(reviewSubmitted, between(0, 600)) : null,
          created_at: ts(nomOffset, between(0, 600)),
          request_status: request,
          is_external: r.external !== undefined,
          external_reviewer_id: externalId,
          review_status: review,
        });
        if (review && review !== "Not started") {
          session({
            key: `review:${nomId}`,
            paId,
            def: a.def,
            type: r.internal ? "client_user" : "external_reviewer",
            clientUserId: r.internal?.id ?? null,
            externalId,
            nominationId: nomId,
            pct: review === "Completed" ? 100 : pick([20, 36, 52, 72, 88]),
            startOffset: nomOffset + 1,
            submitOffset: reviewSubmitted,
          });
        }
      });
    });
  }

  // Cohort participant status reflects their furthest progress.
  for (const p of participants) {
    const pas = seeded.get("participant_assessments").filter((pa) => pa.participant_id === p.id);
    p.status = pas.length && pas.every((pa) => pa.status === "Completed") ? "completed" : pas.some((pa) => pa.status !== "Not started") ? "active" : "invited";
    delete p._i;
  }
}

function session({ key, paId, def, type, clientUserId = null, externalId = null, nominationId = null, pct, startOffset, submitOffset }) {
  const qs = QUESTIONS[def.id];
  const answered = pct >= 100 ? qs.length : Math.max(1, Math.round((qs.length * pct) / 100));
  const sessionId = uid(`session:${key}`);
  const started = ts(startOffset, between(0, 600));
  const updated = submitOffset !== null && submitOffset !== undefined ? ts(submitOffset, between(0, 600)) : ts(Math.min(-1, startOffset + between(1, 6)), between(0, 600));
  const last = qs[answered - 1];
  add("assessment_response_sessions", {
    id: sessionId,
    participant_assessment_id: paId,
    assessment_definition_id: def.id,
    reviewer_nomination_id: nominationId,
    respondent_type: type,
    respondent_client_user_id: clientUserId,
    respondent_external_reviewer_id: externalId,
    status: pct >= 100 ? "completed" : "in_progress",
    started_at: started,
    submitted_at: pct >= 100 ? updated : null,
    last_step_id: last?.step_id ?? null,
    last_question_id: last?.id ?? null,
    completion_percent: pct >= 100 ? 100 : Math.round((answered / qs.length) * 100),
    created_at: started,
    updated_at: updated,
  });
  qs.slice(0, answered).forEach((q) => {
    add("assessment_responses", {
      id: uid(`response:${sessionId}:${q.id}`),
      session_id: sessionId,
      question_id: q.id,
      answer_text: answer(),
      answer_json: null,
      is_answered: true,
      created_at: started,
      updated_at: updated,
    });
  });
}

// ---------------------------------------------------------------- write

let total = 0;
const summary = [];
for (const [table, rows] of seeded) {
  const ids = new Set(rows.map((r) => r.id));
  db[table] = (db[table] ?? []).filter((r) => !ids.has(r.id)).concat(rows);
  total += rows.length;
  summary.push(`${table}: ${rows.length}`);
}
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2) + "\n");
fs.writeFileSync(IDS_FILE, JSON.stringify(Object.fromEntries([...seeded].map(([t, rows]) => [t, rows.map((r) => r.id)]))) + "\n");
console.log(`Seeded ${total} rows (dates relative to ${date(0)}):\n  ${summary.join("\n  ")}`);

// ---------------------------------------------------------------- reports

if (process.argv.includes("--reports")) {
  const base = process.env.SEED_BASE_URL ?? "http://localhost:3000";
  let ok = 0, failed = 0;
  for (const id of reportsToBuild) {
    try {
      const res = await fetch(`${base}/api/reports/pulse/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_assessment_id: id }),
      });
      res.ok ? ok++ : failed++;
      if (!res.ok && failed <= 3) console.warn(`  report ${id}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      console.error(`Could not reach ${base} — start the dev server first (${e.message})`);
      process.exit(1);
    }
  }
  console.log(`Pulse reports: ${ok} built, ${failed} failed`);
}
