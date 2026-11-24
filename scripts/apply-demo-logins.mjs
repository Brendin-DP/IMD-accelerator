#!/usr/bin/env node
/**
 * Replaces real IMD admin identities in data/db.json with the demo identities
 * in data/demo-logins.json (matched by imd_users.id, so foreign keys stay
 * intact). Also rewrites denormalised copies of their names, e.g. in
 * impersonation_logs.
 *
 *   npm run db:demo-logins
 *
 * Runs automatically at the end of `npm run db:export`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DB_FILE = path.join(ROOT, "data", "db.json");
const MAP_FILE = path.join(ROOT, "data", "demo-logins.json");

const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const { imd_users: demo = {} } = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));

let replaced = 0;
const renamed = new Map(); // old full name -> new full name

for (const user of db.imd_users ?? []) {
  const d = demo[user.id];
  if (!d) continue;
  const oldFull = `${user.name ?? ""} ${user.surname ?? ""}`.trim();
  const newFull = `${d.name} ${d.surname}`;
  if (oldFull && oldFull !== newFull) renamed.set(oldFull, newFull);
  Object.assign(user, { name: d.name, surname: d.surname, email: d.email, password_hash: d.password });
  replaced++;
}

let logs = 0;
for (const log of db.impersonation_logs ?? []) {
  if (demo[log.impersonator_id]) {
    const d = demo[log.impersonator_id];
    log.impersonator_name = `${d.name} ${d.surname}`;
    logs++;
  } else if (renamed.has(log.impersonator_name)) {
    log.impersonator_name = renamed.get(log.impersonator_name);
    logs++;
  }
}

// Move every remaining email onto a reserved example domain so the data can't
// reach real inboxes: jo@spacex.com -> jo@spacex.example.com,
// jo@gmail.com -> jo@example.com. Applied to every string field, so
// denormalised copies (e.g. primary_contact_email) stay consistent.
const FREEMAIL = /^(gmail|googlemail|mail|yahoo|outlook|hotmail|icloud|live|aol|proton|protonmail)\.[a-z.]+$/i;
const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
let emails = 0;
const scrub = (s) =>
  s.replace(EMAIL, (m, local, domain) => {
    domain = domain.toLowerCase();
    if (domain === "example.com" || domain.endsWith(".example.com")) return m;
    emails++;
    if (FREEMAIL.test(domain)) return `${local}@example.com`;
    return `${local}@${domain.split(".").slice(0, -1).join("-")}.example.com`;
  });
for (const rows of Object.values(db)) {
  if (!Array.isArray(rows)) continue;
  for (const row of rows) {
    for (const [k, v] of Object.entries(row ?? {})) if (typeof v === "string") row[k] = scrub(v);
  }
}

// Warn about any real-looking IMD addresses that still remain anywhere.
const leftovers = (JSON.stringify(db).match(/[A-Za-z0-9._%+-]+@(?:[a-z0-9-]+\.)*imd\.org/gi) ?? []).length;

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2) + "\n");
console.log(`Demo logins applied: ${replaced} imd_users, ${logs} impersonation log entries, ${emails} email(s) moved to example.com.`);
if (leftovers) console.warn(`⚠️  ${leftovers} @imd.org address(es) still present in data/db.json — add them to data/demo-logins.json.`);
