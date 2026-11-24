#!/usr/bin/env node
/**
 * One-off export of the live Supabase project into the mock DB.
 *
 *   node scripts/export-supabase.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local,
 * dumps every table to data/db.json and every file in the "reports" storage
 * bucket to data/storage/reports/.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(ROOT, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Every table referenced in the codebase (grep '.from("...")').
const TABLES = [
  "assessment_definitions_v2",
  "assessment_questions_v2",
  "assessment_reports",
  "assessment_response_sessions",
  "assessment_responses",
  "assessment_steps_v2",
  "assessment_types",
  "client_users",
  "clients",
  "cohort_assessments",
  "cohort_participants",
  "cohorts",
  "external_reviewers",
  "imd_users",
  "participant_assessments",
  "plan_assessments",
  "plans",
  "reviewer_nominations",
];

const PAGE = 1000;

// Some tables only grant access to anon (created in SQL without service_role grants).
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anon = anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

async function dumpTable(table) {
  const res = await dumpWith(supabase, table);
  if (res.error && anon && /permission denied/i.test(res.error)) {
    const retry = await dumpWith(anon, table);
    if (!retry.error) console.log(`     (${table}: read with anon key)`);
    return retry;
  }
  return res;
}

async function dumpWith(client, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select("*").range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows };
}

async function dumpBucket(bucket, prefix = "", out = []) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
  for (const item of data) {
    const p = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) await dumpBucket(bucket, p, out); // folder
    else out.push(p);
  }
  return out;
}

// Keep mock-only keys (themes, impersonation_logs, ...) that already live in data/db.json.
const DB_FILE = path.join(ROOT, "data", "db.json");
const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : {};
let failed = 0;
for (const table of TABLES) {
  const res = await dumpTable(table);
  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error)) {
      console.log(`  -  ${table}: not in database, skipped`);
    } else {
      console.log(`  ✗  ${table}: ${res.error}`);
      failed++;
    }
    continue;
  }
  db[table] = res.rows;
  console.log(`  ✓  ${table}: ${res.rows.length} rows`);
}

if (failed === TABLES.length) {
  console.error("\nNo tables exported — is the Supabase project paused? Restore it in the dashboard and retry.");
  process.exit(1);
}

const dataDir = path.join(ROOT, "data");
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(db, null, 2));
console.log(`\nWrote data/db.json (${Object.keys(db).length} tables)`);

try {
  const files = await dumpBucket("reports");
  for (const f of files) {
    const { data, error } = await supabase.storage.from("reports").download(f);
    if (error) { console.log(`  ✗  reports/${f}: ${error.message}`); continue; }
    const dest = path.join(dataDir, "storage", "reports", f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
  }
  console.log(`Downloaded ${files.length} file(s) from storage bucket "reports"`);
} catch (e) {
  console.log(`Storage export skipped: ${e.message}`);
}

if (failed) process.exit(2);
