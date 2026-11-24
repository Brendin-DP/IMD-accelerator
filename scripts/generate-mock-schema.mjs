#!/usr/bin/env node
/**
 * Generates lib/mockdb/schema.json from src/types/database.types.ts.
 *
 *   npm run generate:mock-schema
 *
 * The mock DB uses this to resolve embedded selects (foreign keys) and to
 * fill in column defaults on insert, the way Postgres would.
 * Re-run whenever database.types.ts changes.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src/types/database.types.ts");
const OUT = path.join(ROOT, "lib/mockdb/schema.json");

const sf = ts.createSourceFile(SRC, fs.readFileSync(SRC, "utf8"), ts.ScriptTarget.Latest, true);

const members = (node) => (node && ts.isTypeLiteralNode(node) ? node.members : []);
const nameOf = (m) => m.name?.getText(sf).replace(/^["']|["']$/g, "");
const find = (node, name) => members(node).find((m) => nameOf(m) === name)?.type;

let publicSchema;
sf.forEachChild((n) => {
  if (ts.isTypeAliasDeclaration(n) && n.name.text === "Database") publicSchema = find(n.type, "public");
});
if (!publicSchema) throw new Error("Could not find Database['public'] in " + SRC);

// Enums
const enums = {};
for (const m of members(find(publicSchema, "Enums"))) {
  const t = m.type;
  const lits = ts.isUnionTypeNode(t) ? t.types : [t];
  enums[nameOf(m)] = lits.map((l) => l.getText(sf).replace(/^["']|["']$/g, ""));
}

function describe(typeNode) {
  const parts = ts.isUnionTypeNode(typeNode) ? typeNode.types : [typeNode];
  let nullable = false;
  let type = "unknown";
  let enumName;
  for (const p of parts) {
    const text = p.getText(sf);
    if (text === "null") { nullable = true; continue; }
    if (text === "string") type = "string";
    else if (text === "number") type = "number";
    else if (text === "boolean") type = "boolean";
    else if (text === "Json") type = "json";
    else if (text.endsWith("[]")) type = "array";
    else {
      const m = text.match(/\["Enums"\]\["([a-z_0-9]+)"\]/);
      if (m) { type = "enum"; enumName = m[1]; }
    }
  }
  return { type, nullable, ...(enumName ? { enum: enumName } : {}) };
}

const tables = {};
const relationships = [];
for (const t of members(find(publicSchema, "Tables"))) {
  const table = nameOf(t);
  const row = find(t.type, "Row");
  const insert = find(t.type, "Insert");
  const optionalOnInsert = new Set(members(insert).filter((m) => m.questionToken).map(nameOf));
  const columns = {};
  for (const c of members(row)) {
    const col = nameOf(c);
    const d = describe(c.type);
    // Non-null in Row but optional on Insert => Postgres has a default.
    columns[col] = { ...d, hasDefault: optionalOnInsert.has(col) && !d.nullable };
  }
  tables[table] = { columns };

  const rels = find(t.type, "Relationships");
  if (rels && ts.isTupleTypeNode(rels)) {
    for (const r of rels.elements) {
      const get = (k) => find(r, k)?.getText(sf);
      const arr = (k) => JSON.parse(get(k).replace(/'/g, '"'));
      relationships.push({
        name: JSON.parse(get("foreignKeyName")),
        table,
        columns: arr("columns"),
        referencedTable: JSON.parse(get("referencedRelation")),
        referencedColumns: arr("referencedColumns"),
        isOneToOne: get("isOneToOne") === "true",
      });
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ enums, tables, relationships }, null, 2) + "\n");
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${Object.keys(tables).length} tables, ${relationships.length} relationships`);
