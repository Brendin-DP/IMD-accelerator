#!/usr/bin/env node
/**
 * Brings data/db.json in line with lib/mockdb/schema.json after columns are
 * added to src/types/database.types.ts — the mock-DB equivalent of
 * `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` backfilling existing rows.
 *
 *   npm run db:migrate
 *
 * Missing nullable columns become null; missing non-null columns get the
 * default listed below. New tables are created empty. Idempotent.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DB_FILE = path.join(ROOT, "data", "db.json");
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "mockdb", "schema.json"), "utf8"));

/** Defaults for non-null columns added after rows already existed ("table.column"). */
const BACKFILL = {
  "assessment_steps_v2.phase_number": 1,
  "assessment_response_sessions.phase": 1,
  "assessment_reports.phase": 1,
};

export function migrate(db) {
  const changes = [];
  for (const [table, def] of Object.entries(schema.tables)) {
    if (!Array.isArray(db[table])) {
      db[table] = [];
      changes.push(`created ${table}`);
      continue;
    }
    for (const [col, meta] of Object.entries(def.columns)) {
      let filled = 0;
      for (const row of db[table]) {
        if (col in row) continue;
        const key = `${table}.${col}`;
        if (key in BACKFILL) row[col] = BACKFILL[key];
        else if (meta.nullable) row[col] = null;
        else continue; // non-null with a generated default (id, timestamps) — leave as is
        filled++;
      }
      if (filled) changes.push(`${table}.${col}: ${filled} row(s)`);
    }
  }
  return changes;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  const changes = migrate(db);
  if (changes.length) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2) + "\n");
  console.log(changes.length ? `Migrated data/db.json:\n  ${changes.join("\n  ")}` : "data/db.json is up to date");
}
