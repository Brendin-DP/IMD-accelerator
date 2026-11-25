#!/usr/bin/env node
/**
 * Fills an existing habit-journey cohort (e.g. one created in the admin UI on
 * the Habit Accelerator plan) with realistic phase-1 progress: habit answers,
 * submissions, reviewer nominations, round invitations and slider +
 * suggestion reviews. Participants get the demo profiles in order (report
 * ready, only one review, never submitted, …), cycling for larger cohorts.
 *
 *   npm run db:seed-cohort -- "<cohort name or id>"
 *
 * Re-runnable: ids derive from the cohort, so a second run replaces the first.
 * Reviewers are colleagues from the same client who aren't in the cohort.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PROFILES, seedJourneys } from "./seed/habit-accelerator.mjs";
import { migrate } from "./migrate-mock-db.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DB_FILE = path.join(ROOT, "data", "db.json");
const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
migrate(db);

const target = process.argv.slice(2).join(" ").trim();
if (!target) {
  console.error('Usage: npm run db:seed-cohort -- "<cohort name or id>"');
  process.exit(1);
}
const cohort =
  db.cohorts.find((c) => c.id === target) ??
  db.cohorts.find((c) => c.name.toLowerCase() === target.toLowerCase()) ??
  db.cohorts.find((c) => c.name.toLowerCase().includes(target.toLowerCase()));
if (!cohort) {
  console.error(`No cohort matches "${target}".`);
  process.exit(1);
}

// ---------------------------------------------------------------- resolve the habit assessment
const plan = db.plans.find((p) => p.id === cohort.plan_id);
const mapping = (() => {
  const m = plan?.description?.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
  try {
    return m ? JSON.parse(m[1]) : {};
  } catch {
    return {};
  }
})();
const isHabit = (def) => (typeof def?.config === "string" ? JSON.parse(def.config) : def?.config)?.variant === "habit_journey";
const ca = db.cohort_assessments
  .filter((a) => a.cohort_id === cohort.id)
  .find((a) => isHabit(db.assessment_definitions_v2.find((d) => d.id === (a.assessment_definition_id ?? mapping[a.assessment_type_id]))));
if (!ca) {
  console.error(`"${cohort.name}" has no Habit Accelerator (habit_journey) assessment.`);
  process.exit(1);
}
const defId = ca.assessment_definition_id ?? mapping[ca.assessment_type_id];
const def = db.assessment_definitions_v2.find((d) => d.id === defId);

// Assessments created in the UI have no name/dates/definition yet; fill them like the seed does.
ca.assessment_definition_id ??= defId;
ca.name ??= def.name;
ca.start_date ??= cohort.start_date;
ca.end_date ??= cohort.end_date;
if (ca.assessment_status === "Not started") ca.assessment_status = "In Progress";

const questions = db.assessment_questions_v2.filter((q) => q.assessment_definition_id === defId);
const steps = db.assessment_steps_v2.filter((s) => s.assessment_definition_id === defId);
const keyed = (key) => questions.find((q) => (q.config?.key ?? null) === key)?.id;
const q = {
  plan_commitment: keyed("plan_commitment"),
  observe_actions: keyed("observe_actions"),
  reviewer_rating: keyed("reviewer_rating"),
  reviewer_suggestion: keyed("reviewer_suggestion"),
};
const stepId = Object.fromEntries(steps.map((s) => [s.step_key, s.id]));
const missing = Object.entries(q).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`The definition is missing questions with config.key: ${missing.join(", ")}`);
  process.exit(1);
}

// ---------------------------------------------------------------- helpers (same shape as seed-demo)
const prefix = `cohort:${cohort.id}`;
const uid = (key) => {
  const h = crypto.createHash("sha1").update(`imd-cohort-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
let seed = [...cohort.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const TODAY = new Date();
TODAY.setUTCHours(9, 0, 0, 0);
const ts = (offset, minutes = 0) => {
  const t = new Date(TODAY.getTime() + offset * 86400000 + minutes * 60000);
  return (t > new Date() ? new Date(Date.now() - 3600000) : t).toISOString();
};
const rows = new Map();
const add = (table, row) => {
  if (!rows.has(table)) rows.set(table, []);
  rows.get(table).push(row);
  return row;
};

// A cohort that starts today still needs a little history for the demo states.
const startOffset = Math.min(-14, Math.round((new Date(cohort.start_date ?? TODAY) - TODAY) / 86400000));

// ---------------------------------------------------------------- phase + journeys
const phase =
  db.cohort_assessment_phases.find((p) => p.cohort_assessment_id === ca.id && p.phase_number === 1) ??
  add("cohort_assessment_phases", {
    id: uid(`${prefix}:phase:1`),
    cohort_assessment_id: ca.id,
    phase_number: 1,
    name: "T1",
    start_date: ca.start_date,
    end_date: null,
    created_at: ts(startOffset - 1),
  });

const members = db.cohort_participants.filter((cp) => cp.cohort_id === cohort.id);
const users = new Map(db.client_users.map((u) => [u.id, u]));
const memberIds = new Set(members.map((m) => m.client_user_id));
const reviewerPool = db.client_users.filter((u) => u.client_id === cohort.client_id && u.status === "active" && !memberIds.has(u.id));
if (reviewerPool.length < 2) console.warn("⚠️  Fewer than 2 colleagues outside the cohort — reviews will be sparse.");

const entries = members.map((cp, i) => {
  const profile = { ...PROFILES[i % PROFILES.length], id: `p${i + 1}` };
  cp.status = profile.answers === 0 ? "invited" : "active";
  return { profile, user: users.get(cp.client_user_id), cpId: cp.id };
});

// Replace anything a previous run (or the participant, via the app) created for these assessments.
const paIds = new Set(
  db.participant_assessments.filter((pa) => pa.cohort_assessment_id === ca.id).map((pa) => pa.id),
);
const nominationIds = new Set(db.reviewer_nominations.filter((n) => paIds.has(n.participant_assessment_id)).map((n) => n.id));
const sessionIds = new Set(db.assessment_response_sessions.filter((s) => paIds.has(s.participant_assessment_id)).map((s) => s.id));
db.assessment_responses = db.assessment_responses.filter((r) => !sessionIds.has(r.session_id));
db.assessment_response_sessions = db.assessment_response_sessions.filter((s) => !sessionIds.has(s.id));
db.reviewer_round_invitations = db.reviewer_round_invitations.filter((i) => !nominationIds.has(i.reviewer_nomination_id));
db.reviewer_nominations = db.reviewer_nominations.filter((n) => !nominationIds.has(n.id));
db.assessment_reports = db.assessment_reports.filter((r) => !paIds.has(r.participant_assessment_id));
db.participant_assessments = db.participant_assessments.filter((pa) => !paIds.has(pa.id));

const { demo } = seedJourneys(
  { uid, add, ts, between, pick },
  { prefix, caId: ca.id, defId, phaseId: phase.id, start: startOffset, q, stepId, reviewerPool, entries },
);

for (const [table, list] of rows) {
  const ids = new Set(list.map((r) => r.id));
  db[table] = (db[table] ?? []).filter((r) => !ids.has(r.id)).concat(list);
}
migrate(db);
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2) + "\n");

// ---------------------------------------------------------------- summary
const client = db.clients.find((c) => c.id === cohort.client_id);
console.log(`Seeded "${cohort.name}" (${client?.name}) — ${members.length} participants, ${reviewerPool.length} available reviewers.`);
for (const { profile, user } of entries) {
  const label =
    profile.answers === 0 ? "not started" :
    profile.answers === 1 ? "habit drafted, not submitted" :
    !profile.reviews.length ? "submitted, still to nominate" :
    `submitted, reviews: ${profile.reviews.join(", ")}`;
  console.log(`  ${user.email.padEnd(42)} ${label}`);
}
if (demo.openReviewer) console.log(`\nReviewer with an open review: ${demo.openReviewer.email}`);
console.log(`Log in at /tenant/${client?.subdomain}/login`);
