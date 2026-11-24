/**
 * Mock DB query engine.
 *
 * Executes a serialisable Supabase/PostgREST-style query (built by
 * lib/mockdb/client.ts) against an in-memory JSON database
 * ({ [table]: rows[] }). Pure and isomorphic: no fs, no network.
 *
 * Supported: select (columns, aliases, casts, embedded relations via FKs
 * incl. !hint / !inner, counts), filters (eq, neq, gt, gte, lt, lte, like,
 * ilike, is, in, contains, containedBy, match, not, or, filter), order,
 * limit, range, single, maybeSingle, insert / update / upsert / delete with
 * returning, column defaults, unique constraints and cascading deletes.
 */
import schemaJson from "./schema.json";
import { UNIQUE_CONSTRAINTS, STRING_DEFAULTS, CASCADE_DELETES } from "./config";

export type Row = Record<string, any>;
export type Db = Record<string, Row[]>;

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in" | "cs" | "cd";

export type Filter =
  | { kind: "op"; column: string; op: Op; value: unknown; negate?: boolean }
  | { kind: "or"; expr: string };

export interface OrderBy {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

export interface Query {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  columns?: string;
  returning?: boolean;
  values?: Row | Row[];
  filters: Filter[];
  order: OrderBy[];
  limit?: number;
  offset?: number;
  single?: "single" | "maybeSingle";
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  defaultToNull?: boolean;
}

export interface PostgrestError {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
}

export interface QueryResult {
  data: any;
  error: PostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

interface ColumnInfo {
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  enum?: string;
}
interface Relationship {
  name: string;
  table: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  isOneToOne: boolean;
}
interface Schema {
  enums: Record<string, string[]>;
  tables: Record<string, { columns: Record<string, ColumnInfo> }>;
  relationships: Relationship[];
}
const schema = schemaJson as Schema;

class QueryError extends Error {
  constructor(public err: PostgrestError, public status = 400) {
    super(err.message);
  }
}
const fail = (code: string, message: string, details: string | null = null, status = 400): never => {
  throw new QueryError({ code, message, details, hint: null }, status);
};

// ---------------------------------------------------------------------------
// Value comparison (approximates Postgres semantics for the types we store)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Number(String(a) === "true") - Number(String(b) === "true");
  }
  const sa = String(a), sb = String(b);
  if (ISO_DATE.test(sa) && ISO_DATE.test(sb)) {
    const da = Date.parse(sa), dbt = Date.parse(sb);
    if (!Number.isNaN(da) && !Number.isNaN(dbt)) return da - dbt;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

const equals = (a: unknown, b: unknown) => {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return compare(a, b) === 0;
};

function likeToRegex(pattern: string, insensitive: boolean) {
  const re = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, "[\\s\\S]*")
    .replace(/_/g, "[\\s\\S]")
    .replace(/\*/g, "[\\s\\S]*");
  return new RegExp(`^${re}$`, insensitive ? "i" : "");
}

function contains(container: unknown, value: unknown): boolean {
  if (Array.isArray(container)) {
    const vals = Array.isArray(value) ? value : [value];
    return vals.every((v) => container.some((c) => equals(c, v) || JSON.stringify(c) === JSON.stringify(v)));
  }
  if (container && typeof container === "object" && value && typeof value === "object") {
    return Object.entries(value).every(([k, v]) =>
      v && typeof v === "object" ? contains((container as Row)[k], v) : equals((container as Row)[k], v)
    );
  }
  return false;
}

function testOp(cell: unknown, op: Op, value: unknown): boolean {
  switch (op) {
    case "eq": return equals(cell, value);
    case "neq": return cell !== null && cell !== undefined && !equals(cell, value);
    case "gt": return cell != null && compare(cell, value) > 0;
    case "gte": return cell != null && compare(cell, value) >= 0;
    case "lt": return cell != null && compare(cell, value) < 0;
    case "lte": return cell != null && compare(cell, value) <= 0;
    case "like": return cell != null && likeToRegex(String(value), false).test(String(cell));
    case "ilike": return cell != null && likeToRegex(String(value), true).test(String(cell));
    case "is": {
      const v = value === "null" ? null : value === "true" ? true : value === "false" ? false : value;
      return v === null ? cell === null || cell === undefined : cell === v;
    }
    case "in": return Array.isArray(value) && value.some((v) => equals(cell, v));
    case "cs": return contains(cell, value);
    case "cd": return contains(value, cell);
    default: return fail("PGRST100", `Unsupported operator "${op}" in mock DB`);
  }
}

// Parse a PostgREST value string ("(a,b)" lists, "null", quoted strings).
function parseValue(op: string, raw: string): unknown {
  if (op === "in") {
    const inner = raw.replace(/^\(|\)$/g, "");
    return splitTopLevel(inner).map((v) => v.replace(/^"|"$/g, ""));
  }
  if (op === "cs" || op === "cd") {
    if (raw.startsWith("{")) return raw.slice(1, -1).split(",").filter(Boolean);
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw.replace(/^"|"$/g, "");
}

function splitTopLevel(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0, quote = false, cur = "";
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && (ch === "(" || ch === "{")) depth++;
    if (!quote && (ch === ")" || ch === "}")) depth--;
    if (!quote && depth === 0 && ch === sep) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Evaluate an or()/and() logic tree string: "a.eq.1,and(b.gt.2,c.is.null)"
function evalLogic(row: Row, expr: string, mode: "or" | "and"): boolean {
  const parts = splitTopLevel(expr);
  const results = parts.map((part) => {
    let negate = false;
    let p = part;
    if (p.startsWith("not.")) { negate = true; p = p.slice(4); }
    let r: boolean;
    const nested = p.match(/^(and|or)\(([\s\S]*)\)$/);
    if (nested) {
      r = evalLogic(row, nested[2], nested[1] as "or" | "and");
    } else {
      const m = p.match(/^([^.]+)\.(not\.)?([a-z]+)\.([\s\S]*)$/);
      if (!m) return fail("PGRST100", `Could not parse logic expression "${part}"`);
      const [, column, not, op, raw] = m;
      r = testOp(row[column], op as Op, parseValue(op, raw));
      if (not) r = !r;
    }
    return negate ? !r : r;
  });
  return mode === "or" ? results.some(Boolean) : results.every(Boolean);
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.kind === "or") return evalLogic(row, f.expr, "or");
    if (f.column.includes(".")) return true; // embedded-resource filters are applied in embed()
    const r = testOp(row[f.column], f.op, f.value);
    return f.negate ? !r : r;
  });
}

// ---------------------------------------------------------------------------
// Select-string parsing
// ---------------------------------------------------------------------------

interface SelectField { kind: "field"; alias: string; column: string }
interface SelectStar { kind: "star" }
interface SelectEmbed {
  kind: "embed";
  alias: string;
  relation: string;
  hint?: string;
  inner: boolean;
  spread: boolean;
  children: SelectNode[];
}
interface SelectCount { kind: "count"; alias: string }
type SelectNode = SelectField | SelectStar | SelectEmbed | SelectCount;

function parseSelect(input: string | undefined): SelectNode[] {
  const s = (input ?? "*").replace(/\s+/g, " ").trim() || "*";
  return splitTopLevel(s).map((item): SelectNode => {
    item = item.trim();
    if (item === "*") return { kind: "star" };
    const embed = item.match(/^(\.\.\.)?(?:([A-Za-z0-9_]+)\s*:\s*)?([A-Za-z0-9_]+)((?:![A-Za-z0-9_]+)*)\s*\(([\s\S]*)\)$/);
    if (embed) {
      const [, spread, alias, relation, bangs, inner] = embed;
      const hints = bangs.split("!").filter(Boolean);
      return {
        kind: "embed",
        alias: alias || relation,
        relation,
        hint: hints.find((h) => h !== "inner" && h !== "left"),
        inner: hints.includes("inner"),
        spread: !!spread,
        children: parseSelect(inner),
      };
    }
    const field = item.match(/^(?:([A-Za-z0-9_]+)\s*:\s*)?([A-Za-z0-9_]+)(?:->>?[A-Za-z0-9_'"]+)*(?:::[a-z0-9_]+)?$/);
    if (field) {
      const [, alias, column] = field;
      if (column === "count" && !alias) return { kind: "count", alias: "count" };
      return { kind: "field", alias: alias || column, column };
    }
    return fail("PGRST100", `Mock DB could not parse select item "${item}"`);
  });
}

// ---------------------------------------------------------------------------
// Relationship resolution for embedded selects
// ---------------------------------------------------------------------------

interface ResolvedRel {
  target: string;
  many: boolean;
  // parent[parentCols[i]] === child[childCols[i]]
  parentCols: string[];
  childCols: string[];
}

function resolveRelationship(parent: string, node: SelectEmbed, db: Db): ResolvedRel {
  const { relation, hint } = node;
  const rels = schema.relationships;
  const byHint = (r: Relationship) =>
    !hint || r.name === hint || r.columns.includes(hint) || r.table === hint || r.referencedTable === hint;

  // Many-to-one: parent has FK to relation (by table name, or FK column name).
  const m2o = rels.filter(
    (r) => r.table === parent && (r.referencedTable === relation || r.columns[0] === relation || r.name === relation) && byHint(r)
  );
  // One-to-many: relation table has FK to parent.
  const o2m = rels.filter((r) => r.table === relation && r.referencedTable === parent && byHint(r));

  if (m2o.length) {
    const r = m2o[0];
    return { target: r.referencedTable, many: false, parentCols: r.columns, childCols: r.referencedColumns };
  }
  if (o2m.length) {
    const r = o2m[0];
    return { target: r.table, many: !r.isOneToOne, parentCols: r.referencedColumns, childCols: r.columns };
  }

  // Fallback for tables not in the schema: guess <relation_singular>_id conventions.
  if (db[relation]) {
    const singular = relation.replace(/s$/, "");
    const sample = db[parent]?.[0] ?? {};
    if (`${singular}_id` in sample) return { target: relation, many: false, parentCols: [`${singular}_id`], childCols: ["id"] };
    const parentSingular = parent.replace(/s$/, "");
    const childSample = db[relation]?.[0] ?? {};
    if (`${parentSingular}_id` in childSample)
      return { target: relation, many: true, parentCols: ["id"], childCols: [`${parentSingular}_id`] };
  }

  return fail(
    "PGRST200",
    `Could not find a relationship between '${parent}' and '${relation}' in the schema cache`,
    `Searched for a foreign key relationship between '${parent}' and '${relation}'${hint ? ` using the hint '${hint}'` : ""}.`
  );
}

function project(table: string, rows: Row[], nodes: SelectNode[], db: Db, filters: Filter[]): Row[] {
  const embedFilters = (alias: string) =>
    filters
      .filter((f): f is Extract<Filter, { kind: "op" }> => f.kind === "op" && f.column.startsWith(alias + "."))
      .map((f) => ({ ...f, column: f.column.slice(alias.length + 1) }));

  const out: Row[] = [];
  for (const row of rows) {
    let o: Row = {};
    let keep = true;
    for (const n of nodes) {
      if (n.kind === "star") Object.assign(o, structuredClone(row));
      else if (n.kind === "field") o[n.alias] = row[n.column] === undefined ? null : structuredClone(row[n.column]);
      else if (n.kind === "count") o[n.alias] = rows.length;
      else {
        const rel = resolveRelationship(table, n, db);
        const fs = embedFilters(n.alias);
        const candidates = (db[rel.target] ?? []).filter(
          (child) => rel.parentCols.every((pc, i) => equals(row[pc], child[rel.childCols[i]])) && matches(child, fs)
        );
        const countOnly = n.children.length === 1 && n.children[0].kind === "count";
        let value: any;
        if (countOnly) value = [{ count: candidates.length }];
        else {
          const projected = project(rel.target, candidates, n.children, db, fs);
          value = rel.many ? projected : projected[0] ?? null;
        }
        if (n.inner && (value === null || (Array.isArray(value) && value.length === 0))) keep = false;
        if (n.spread && value && !Array.isArray(value)) Object.assign(o, value);
        else o[n.alias] = value;
      }
    }
    if (keep) out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

function applyDefaults(table: string, input: Row, existing: Row[], defaultToNull: boolean): Row {
  const cols = schema.tables[table]?.columns;
  const now = new Date().toISOString();
  const row: Row = { ...input };

  if (row.id === undefined) {
    const sampleId = existing.find((r) => r.id != null)?.id;
    const idType = cols?.id?.type ?? (typeof sampleId === "number" ? "number" : "string");
    row.id = idType === "number" ? existing.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1 : uuid();
  }

  const columnNames = cols ? Object.keys(cols) : Object.keys(existing[0] ?? {});
  for (const name of columnNames) {
    if (row[name] !== undefined) continue;
    if (name === "created_at" || name === "updated_at") { row[name] = now; continue; }
    const c = cols?.[name];
    if (!c) { row[name] = null; continue; }
    const override = STRING_DEFAULTS[`${table}.${name}`];
    if (override !== undefined) row[name] = override;
    else if (c.hasDefault && !defaultToNull) {
      if (c.enum) row[name] = schema.enums[c.enum]?.[0] ?? null;
      else if (c.type === "boolean") row[name] = false;
      else if (c.type === "number") row[name] = 0;
      else if (c.type === "array") row[name] = [];
      else if (/(_at|_date)$/.test(name)) row[name] = now;
      else row[name] = null;
    } else row[name] = null;
  }
  return row;
}

function checkNotNull(table: string, row: Row) {
  const cols = schema.tables[table]?.columns;
  if (!cols) return;
  for (const [name, c] of Object.entries(cols)) {
    if (!c.nullable && !c.hasDefault && (row[name] === null || row[name] === undefined) && name !== "id") {
      fail("23502", `null value in column "${name}" of relation "${table}" violates not-null constraint`);
    }
  }
}

function uniqueKeys(table: string): string[][] {
  return [["id"], ...(UNIQUE_CONSTRAINTS[table] ?? [])];
}

function checkUnique(table: string, rows: Row[], candidate: Row, ignore?: Row) {
  for (const key of uniqueKeys(table)) {
    if (key.some((k) => candidate[k] == null)) continue;
    const clash = rows.find((r) => r !== ignore && key.every((k) => equals(r[k], candidate[k])));
    if (clash) {
      fail(
        "23505",
        `duplicate key value violates unique constraint "${table}_${key.join("_")}_key"`,
        `Key (${key.join(", ")})=(${key.map((k) => candidate[k]).join(", ")}) already exists.`,
        409
      );
    }
  }
}

function cascadeDelete(db: Db, table: string, deleted: Row[]) {
  if (!deleted.length) return;
  for (const r of schema.relationships) {
    if (r.referencedTable !== table || !db[r.table]) continue;
    const mode = CASCADE_DELETES[r.name] ?? "cascade";
    const refVals = new Set(deleted.map((d) => String(d[r.referencedColumns[0]])));
    const isChild = (c: Row) => c[r.columns[0]] != null && refVals.has(String(c[r.columns[0]]));
    if (mode === "restrict") {
      if (db[r.table].some(isChild)) {
        fail("23503", `update or delete on table "${table}" violates foreign key constraint "${r.name}" on table "${r.table}"`, null, 409);
      }
    } else if (mode === "set null") {
      for (const c of db[r.table]) if (isChild(c)) c[r.columns[0]] = null;
    } else if (mode === "cascade") {
      const children = db[r.table].filter(isChild);
      if (!children.length) continue;
      db[r.table] = db[r.table].filter((c) => !isChild(c));
      cascadeDelete(db, r.table, children);
    }
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function sortRows(rows: Row[], order: OrderBy[]) {
  if (!order.length) return rows;
  return [...rows].sort((a, b) => {
    for (const o of order) {
      const av = a[o.column], bv = b[o.column];
      const an = av === null || av === undefined, bn = bv === null || bv === undefined;
      if (an || bn) {
        if (an && bn) continue;
        const nullsFirst = o.nullsFirst ?? !o.ascending; // Postgres default
        return (an ? -1 : 1) * (nullsFirst ? 1 : -1);
      }
      const c = compare(av, bv);
      if (c !== 0) return o.ascending ? c : -c;
    }
    return 0;
  });
}

/**
 * Runs a query against `db`, mutating it in place for writes.
 * Returns the result plus whether the database changed.
 */
export function execute(db: Db, q: Query): QueryResult & { changed: boolean } {
  try {
    if (q.action === "select") {
      const { result } = run(db, q);
      return { ...result, changed: false };
    }
    // Writes run against a copy so a failure part-way through (constraint
    // violation, .single() mismatch) leaves the database untouched, like a
    // Postgres transaction.
    const draft = structuredClone(db);
    const { result, changed } = run(draft, q);
    if (changed) {
      for (const k of Object.keys(db)) if (!(k in draft)) delete db[k];
      Object.assign(db, draft);
    }
    return { ...result, changed };
  } catch (e) {
    if (e instanceof QueryError) {
      return { data: null, error: e.err, count: null, status: e.status, statusText: "Error", changed: false };
    }
    const message = e instanceof Error ? e.message : String(e);
    return {
      data: null,
      error: { code: "MOCKDB", message, details: null, hint: null },
      count: null,
      status: 500,
      statusText: "Error",
      changed: false,
    };
  }
}

function run(db: Db, q: Query): { result: QueryResult; changed: boolean } {
  if (!db[q.table]) {
    if (q.action === "select" && !schema.tables[q.table]) {
      fail("42P01", `relation "public.${q.table}" does not exist`, null, 404);
    }
    db[q.table] = [];
  }
  const table = db[q.table];
  const nodes = parseSelect(q.columns);
  let affected: Row[] = [];
  let changed = false;

  switch (q.action) {
    case "select":
      affected = table.filter((r) => matches(r, q.filters));
      break;

    case "insert": {
      const values = Array.isArray(q.values) ? q.values : [q.values ?? {}];
      const staged: Row[] = [];
      for (const v of values) {
        const row = applyDefaults(q.table, v, table, !!q.defaultToNull);
        checkNotNull(q.table, row);
        checkUnique(q.table, [...table, ...staged], row);
        staged.push(row);
      }
      table.push(...staged);
      affected = staged;
      changed = staged.length > 0;
      break;
    }

    case "upsert": {
      const values = Array.isArray(q.values) ? q.values : [q.values ?? {}];
      const key = q.onConflict ? q.onConflict.split(",").map((s) => s.trim()) : ["id"];
      for (const v of values) {
        const existing = key.every((k) => v[k] != null)
          ? table.find((r) => key.every((k) => equals(r[k], v[k])))
          : undefined;
        if (existing) {
          if (q.ignoreDuplicates) continue;
          const merged = { ...existing, ...v };
          if ("updated_at" in existing && v.updated_at === undefined) merged.updated_at = new Date().toISOString();
          checkUnique(q.table, table, merged, existing);
          Object.assign(existing, merged);
          affected.push(existing);
        } else {
          const row = applyDefaults(q.table, v, table, !!q.defaultToNull);
          checkNotNull(q.table, row);
          checkUnique(q.table, table, row);
          table.push(row);
          affected.push(row);
        }
      }
      changed = affected.length > 0;
      break;
    }

    case "update": {
      const patch = (Array.isArray(q.values) ? q.values[0] : q.values) ?? {};
      const targets = table.filter((r) => matches(r, q.filters));
      for (const r of targets) {
        const next = { ...r, ...patch };
        if ("updated_at" in r && patch.updated_at === undefined) next.updated_at = new Date().toISOString();
        checkUnique(q.table, table, next, r);
      }
      for (const r of targets) {
        Object.assign(r, patch);
        if ("updated_at" in r && patch.updated_at === undefined) r.updated_at = new Date().toISOString();
      }
      affected = targets;
      changed = targets.length > 0;
      break;
    }

    case "delete": {
      affected = table.filter((r) => matches(r, q.filters));
      if (affected.length) {
        const gone = new Set(affected);
        db[q.table] = table.filter((r) => !gone.has(r));
        cascadeDelete(db, q.table, affected);
        changed = true;
      }
      break;
    }
  }

  const count = q.count ? affected.length : null;

  // Mutations only return rows when .select() was chained.
  if (q.action !== "select" && !q.returning) {
    return { result: { data: null, error: null, count, status: q.action === "insert" ? 201 : 204, statusText: "OK" }, changed };
  }

  let rows = q.action === "select" ? sortRows(affected, q.order) : affected;
  rows = project(q.table, rows, nodes, db, q.filters);
  // Re-apply count after !inner embeds may have dropped rows.
  const finalCount = q.count ? rows.length : count;
  if (q.offset !== undefined || q.limit !== undefined) {
    const start = q.offset ?? 0;
    rows = rows.slice(start, q.limit !== undefined ? start + q.limit : undefined);
  }

  if (q.head) return { result: { data: null, error: null, count: finalCount, status: 200, statusText: "OK" }, changed };

  if (q.single) {
    if (rows.length === 1) return { result: { data: rows[0], error: null, count: finalCount, status: 200, statusText: "OK" }, changed };
    if (rows.length === 0 && q.single === "maybeSingle") {
      return { result: { data: null, error: null, count: finalCount, status: 200, statusText: "OK" }, changed };
    }
    fail(
      "PGRST116",
      "JSON object requested, multiple (or no) rows returned",
      `The result contains ${rows.length} rows`,
      406
    );
  }

  return { result: { data: rows, error: null, count: finalCount, status: q.action === "insert" ? 201 : 200, statusText: "OK" }, changed };
}
