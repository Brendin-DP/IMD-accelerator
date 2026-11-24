/**
 * Supabase-compatible client backed by the mock DB.
 *
 * Exposes the subset of the supabase-js API this app uses:
 *   client.from(table).select/insert/update/upsert/delete + filters/modifiers
 *   client.storage.from(bucket).upload/download/createSignedUrl/getPublicUrl/remove/list
 *
 * The builder produces a serialisable Query and hands it to an executor:
 * in the browser that's a fetch to /api/db, on the server it runs the engine
 * directly against the store (see lib/mockdb/server.ts).
 */
import type { Filter, OrderBy, Query, QueryResult } from "./engine";

export type QueryExecutor = (q: Query) => Promise<QueryResult>;

export interface StorageResult<T> {
  data: T | null;
  error: { message: string; statusCode?: string } | null;
}

export interface StorageExecutor {
  upload(bucket: string, path: string, body: Blob | ArrayBuffer | Uint8Array | string, opts: { contentType?: string; upsert?: boolean }): Promise<StorageResult<{ path: string; fullPath: string }>>;
  download(bucket: string, path: string): Promise<StorageResult<Blob>>;
  remove(bucket: string, paths: string[]): Promise<StorageResult<{ name: string }[]>>;
  list(bucket: string, prefix?: string): Promise<StorageResult<{ name: string; id: string | null }[]>>;
}

type Value = string | number | boolean | null;

const fmt = (v: unknown) => (Array.isArray(v) ? `(${v.map((x) => (/[,()]/.test(String(x)) ? `"${x}"` : x)).join(",")})` : String(v));

export class MockQueryBuilder<T = any> implements PromiseLike<QueryResult> {
  private q: Query;

  constructor(private exec: QueryExecutor, table: string) {
    this.q = { table, action: "select", filters: [], order: [] };
  }

  // --- actions -------------------------------------------------------------

  select(columns = "*", opts: { count?: Query["count"]; head?: boolean } = {}) {
    if (this.q.action === "select") this.q.columns = columns;
    else {
      this.q.returning = true;
      this.q.columns = columns;
    }
    if (opts.count) this.q.count = opts.count;
    if (opts.head) this.q.head = true;
    return this;
  }

  insert(values: Partial<T> | Partial<T>[], opts: { count?: Query["count"]; defaultToNull?: boolean } = {}) {
    Object.assign(this.q, { action: "insert", values, count: opts.count, defaultToNull: opts.defaultToNull });
    return this;
  }

  upsert(
    values: Partial<T> | Partial<T>[],
    opts: { onConflict?: string; ignoreDuplicates?: boolean; count?: Query["count"]; defaultToNull?: boolean } = {}
  ) {
    Object.assign(this.q, { action: "upsert", values, ...opts });
    return this;
  }

  update(values: Partial<T>, opts: { count?: Query["count"] } = {}) {
    Object.assign(this.q, { action: "update", values, count: opts.count });
    return this;
  }

  delete(opts: { count?: Query["count"] } = {}) {
    Object.assign(this.q, { action: "delete", count: opts.count });
    return this;
  }

  // --- filters -------------------------------------------------------------

  private add(column: string, op: Extract<Filter, { kind: "op" }>["op"], value: unknown, negate = false) {
    this.q.filters.push({ kind: "op", column, op, value, negate });
    return this;
  }
  eq(column: string, value: Value) { return this.add(column, "eq", value); }
  neq(column: string, value: Value) { return this.add(column, "neq", value); }
  gt(column: string, value: Value) { return this.add(column, "gt", value); }
  gte(column: string, value: Value) { return this.add(column, "gte", value); }
  lt(column: string, value: Value) { return this.add(column, "lt", value); }
  lte(column: string, value: Value) { return this.add(column, "lte", value); }
  like(column: string, pattern: string) { return this.add(column, "like", pattern); }
  ilike(column: string, pattern: string) { return this.add(column, "ilike", pattern); }
  is(column: string, value: null | boolean) { return this.add(column, "is", value); }
  in(column: string, values: readonly Value[]) { return this.add(column, "in", [...values]); }
  contains(column: string, value: unknown) { return this.add(column, "cs", value); }
  containedBy(column: string, value: unknown) { return this.add(column, "cd", value); }
  match(query: Record<string, Value>) {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }
  not(column: string, op: string, value: unknown) {
    return this.add(column, op as any, op === "in" && typeof value === "string" ? value.replace(/^\(|\)$/g, "").split(",") : value, true);
  }
  or(expr: string) {
    this.q.filters.push({ kind: "or", expr });
    return this;
  }
  filter(column: string, op: string, value: unknown) {
    if (op.startsWith("not.")) return this.not(column, op.slice(4), value);
    if (op === "in" && typeof value === "string") return this.in(column, value.replace(/^\(|\)$/g, "").split(","));
    return this.add(column, op as any, value);
  }

  // --- modifiers -----------------------------------------------------------

  order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string } = {}) {
    if (opts.foreignTable || opts.referencedTable) return this; // embedded ordering not supported; ignore
    const o: OrderBy = { column, ascending: opts.ascending ?? true, nullsFirst: opts.nullsFirst };
    this.q.order.push(o);
    return this;
  }
  limit(n: number) { this.q.limit = n; return this; }
  range(from: number, to: number) { this.q.offset = from; this.q.limit = to - from + 1; return this; }
  single() { this.q.single = "single"; return this; }
  maybeSingle() { this.q.single = "maybeSingle"; return this; }
  abortSignal(_signal: AbortSignal) { return this; }
  returns<U>() { return this as unknown as MockQueryBuilder<U>; }
  throwOnError() {
    const self = this;
    return {
      then<R1, R2>(ok?: (v: QueryResult) => R1 | PromiseLike<R1>, bad?: (e: unknown) => R2 | PromiseLike<R2>) {
        return self.exec(self.q).then((r) => { if (r.error) throw r.error; return r; }).then(ok, bad);
      },
    };
  }

  then<R1 = QueryResult, R2 = never>(
    onfulfilled?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.exec(this.q).then(onfulfilled, onrejected);
  }
}

class MockStorageBucket {
  constructor(private exec: StorageExecutor, private bucket: string) {}

  upload(path: string, body: Blob | ArrayBuffer | Uint8Array | string, opts: { contentType?: string; upsert?: boolean } = {}) {
    return this.exec.upload(this.bucket, path, body, opts);
  }
  update(path: string, body: Blob | ArrayBuffer | Uint8Array | string, opts: { contentType?: string } = {}) {
    return this.exec.upload(this.bucket, path, body, { ...opts, upsert: true });
  }
  download(path: string) {
    return this.exec.download(this.bucket, path);
  }
  remove(paths: string[]) {
    return this.exec.remove(this.bucket, paths);
  }
  list(prefix?: string) {
    return this.exec.list(this.bucket, prefix);
  }
  getPublicUrl(path: string) {
    return { data: { publicUrl: storageUrl(this.bucket, path) } };
  }
  async createSignedUrl(path: string, _expiresIn: number, opts: { download?: boolean | string } = {}) {
    const url = storageUrl(this.bucket, path) + (opts.download ? "?download=1" : "");
    return { data: { signedUrl: url, signedURL: url }, error: null };
  }
}

/** Files are served by app/api/storage/[bucket]/[...path]/route.ts. */
export function storageUrl(bucket: string, path: string) {
  const base = typeof window === "undefined" ? process.env.NEXT_PUBLIC_APP_URL ?? "" : "";
  return `${base}/api/storage/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export class MockSupabaseClient {
  readonly storage: { from(bucket: string): MockStorageBucket };

  constructor(private exec: QueryExecutor, storage: StorageExecutor) {
    this.storage = { from: (bucket: string) => new MockStorageBucket(storage, bucket) };
  }

  from<T = any>(table: string) {
    return new MockQueryBuilder<T>(this.exec, table);
  }

  async rpc(fn: string): Promise<QueryResult> {
    return {
      data: null,
      error: { code: "PGRST202", message: `RPC "${fn}" is not implemented in the mock DB`, details: null, hint: null },
      count: null,
      status: 404,
      statusText: "Not Found",
    };
  }

  /** Auth isn't used by this app (login is table-based); stubbed for safety. */
  auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  };

  channel() {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: async () => "ok" };
    return ch;
  }
  removeChannel() { return Promise.resolve("ok"); }
}

// ---------------------------------------------------------------------------
// Browser executors (HTTP to the mock API)
// ---------------------------------------------------------------------------

export const httpQueryExecutor: QueryExecutor = async (q) => {
  try {
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(q),
      cache: "no-store",
    });
    return (await res.json()) as QueryResult;
  } catch (e) {
    return {
      data: null,
      error: { code: "FETCH", message: e instanceof Error ? e.message : String(e), details: null, hint: null },
      count: null,
      status: 0,
      statusText: "Network error",
    };
  }
};

export const httpStorageExecutor: StorageExecutor = {
  async upload(bucket, path, body, opts) {
    const res = await fetch(`${storageUrl(bucket, path)}${opts.upsert ? "?upsert=1" : ""}`, {
      method: "PUT",
      headers: { "Content-Type": opts.contentType ?? "application/octet-stream" },
      body: body as BodyInit,
    });
    const json = await res.json();
    return res.ok ? { data: json, error: null } : { data: null, error: json.error };
  },
  async download(bucket, path) {
    const res = await fetch(storageUrl(bucket, path), { cache: "no-store" });
    if (!res.ok) return { data: null, error: { message: "Object not found", statusCode: String(res.status) } };
    return { data: await res.blob(), error: null };
  },
  async remove(bucket, paths) {
    const res = await fetch(`/api/storage/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    const json = await res.json();
    return res.ok ? { data: json, error: null } : { data: null, error: json.error };
  },
  async list(bucket, prefix = "") {
    const res = await fetch(`/api/storage/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(prefix)}`);
    const json = await res.json();
    return res.ok ? { data: json, error: null } : { data: null, error: json.error };
  },
};
