/**
 * Server-side persistence for the mock DB. Never import from client code.
 *
 * Backends (picked automatically, override with MOCKDB_STORE=file|blob|memory):
 *  - file:   data/db.json + data/storage/** on disk (local dev — the default)
 *  - blob:   a private Vercel Blob store (used on Vercel when BLOB_READ_WRITE_TOKEN
 *            or BLOB_STORE_ID is set). Seeded from data/db.json on first read.
 *  - memory: seeded from data/db.json, writes last until the instance recycles
 *            (fallback on Vercel when no Blob store is connected).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execute, type Db, type Query, type QueryResult } from "./engine";
import type { QueryExecutor, StorageExecutor, StorageResult } from "./client";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const STORAGE_DIR = path.join(DATA_DIR, "storage");
const BLOB_DB_PATH = "mockdb/db.json";
const BLOB_STORAGE_PREFIX = "mockdb/storage/";

type Backend = "file" | "blob" | "memory";

export function backend(): Backend {
  const explicit = process.env.MOCKDB_STORE as Backend | undefined;
  if (explicit === "file" || explicit === "blob" || explicit === "memory") return explicit;
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return process.env.VERCEL ? "blob" : "file";
  return process.env.VERCEL ? "memory" : "file";
}

// ---------------------------------------------------------------------------
// Serialise all access within an instance so read-modify-write is atomic.
// ---------------------------------------------------------------------------
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function readSeed(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch (e) {
    console.error("[mockdb] Could not read data/db.json — starting empty.", e);
    return {};
  }
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------------------
// Database load/save
// ---------------------------------------------------------------------------
let cache: { db: Db; version: string | null } | null = null;

async function load(): Promise<Db> {
  const b = backend();

  if (b === "memory") {
    if (!cache) cache = { db: await readSeed(), version: null };
    return cache.db;
  }

  if (b === "file") {
    // Re-read when the file changes on disk (hand edits, git checkout, etc.)
    const stat = await fs.stat(DB_FILE).catch(() => null);
    const version = stat ? String(stat.mtimeMs) : null;
    if (!cache || cache.version !== version) cache = { db: stat ? await readSeed() : {}, version };
    return cache.db;
  }

  const { get } = await import("@vercel/blob");
  const res = await get(BLOB_DB_PATH, {
    access: "private",
    useCache: false,
    ...(cache?.version ? { ifNoneMatch: cache.version } : {}),
  });
  if (res === null) {
    // First run: seed the Blob store from the committed data/db.json.
    const seed = await readSeed();
    await save(seed);
    return seed;
  }
  if (res.statusCode === 304 && cache) return cache.db;
  if (res.statusCode === 200) {
    cache = { db: JSON.parse((await streamToBuffer(res.stream)).toString("utf8")), version: res.blob.etag };
  }
  return cache!.db;
}

async function save(db: Db): Promise<void> {
  const b = backend();
  const json = JSON.stringify(db, null, 2);

  if (b === "memory") {
    cache = { db, version: null };
    return;
  }

  if (b === "file") {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, json + "\n");
    await fs.rename(tmp, DB_FILE);
    const stat = await fs.stat(DB_FILE);
    cache = { db, version: String(stat.mtimeMs) };
    return;
  }

  const { put } = await import("@vercel/blob");
  await put(BLOB_DB_PATH, json, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
  cache = { db, version: null }; // next load refetches the etag
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const serverQueryExecutor: QueryExecutor = (q: Query) =>
  withLock(async (): Promise<QueryResult> => {
    const db = await load();
    const { changed, ...result } = execute(db, q);
    if (changed) await save(db);
    return result;
  });

/** Read the whole database (for tooling, export, and the legacy JSON routes). */
export function readDb(): Promise<Db> {
  return withLock(async () => structuredClone(await load()));
}

/** Apply an arbitrary mutation to the whole database and persist it. */
export function updateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
}

/** Reset the database to the committed data/db.json seed (blob/memory backends). */
export function resetDb(): Promise<void> {
  return withLock(async () => {
    const seed = await readSeed();
    if (backend() === "file") {
      cache = null;
      return;
    }
    await save(seed);
  });
}

// ---------------------------------------------------------------------------
// Storage (Supabase Storage buckets)
// ---------------------------------------------------------------------------

const memoryFiles = new Map<string, { body: Buffer; contentType: string }>();

function safeKey(bucket: string, p: string) {
  const clean = path.posix.normalize(`${bucket}/${p}`).replace(/^\/+/, "");
  if (clean.startsWith("..") || clean.includes("/../")) throw new Error("Invalid storage path");
  return clean;
}

const contentTypeFor = (p: string) =>
  ({ ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".csv": "text/csv", ".txt": "text/plain" })[
    path.extname(p).toLowerCase()
  ] ?? "application/octet-stream";

async function toBuffer(body: Blob | ArrayBuffer | Uint8Array | string): Promise<Buffer> {
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await body.arrayBuffer());
}

export async function readFile(bucket: string, p: string): Promise<{ body: Buffer; contentType: string } | null> {
  const key = safeKey(bucket, p);
  const b = backend();
  if (b === "memory") {
    const mem = memoryFiles.get(key);
    if (mem) return mem;
    // fall through to committed files
  }
  if (b === "blob") {
    const { get } = await import("@vercel/blob");
    const res = await get(BLOB_STORAGE_PREFIX + key, { access: "private", useCache: false });
    if (res?.statusCode === 200) return { body: await streamToBuffer(res.stream), contentType: res.blob.contentType };
  }
  try {
    return { body: await fs.readFile(path.join(STORAGE_DIR, key)), contentType: contentTypeFor(p) };
  } catch {
    return null;
  }
}

export async function writeFile(bucket: string, p: string, body: Buffer, contentType?: string) {
  const key = safeKey(bucket, p);
  const type = contentType ?? contentTypeFor(p);
  const b = backend();
  if (b === "memory") memoryFiles.set(key, { body, contentType: type });
  else if (b === "blob") {
    const { put } = await import("@vercel/blob");
    await put(BLOB_STORAGE_PREFIX + key, body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: type });
  } else {
    const dest = path.join(STORAGE_DIR, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body);
  }
}

export async function deleteFile(bucket: string, p: string) {
  const key = safeKey(bucket, p);
  const b = backend();
  if (b === "memory") memoryFiles.delete(key);
  else if (b === "blob") {
    const { del } = await import("@vercel/blob");
    await del(BLOB_STORAGE_PREFIX + key);
  } else await fs.rm(path.join(STORAGE_DIR, key), { force: true });
}

export async function listFiles(bucket: string, prefix = ""): Promise<{ name: string; id: string | null }[]> {
  const base = safeKey(bucket, prefix || ".").replace(/\/\.$/, "");
  const b = backend();
  if (b === "blob") {
    const { list } = await import("@vercel/blob");
    const res = await list({ prefix: `${BLOB_STORAGE_PREFIX}${base}/`, mode: "folded" });
    return [
      ...res.folders.map((f) => ({ name: f.slice(`${BLOB_STORAGE_PREFIX}${base}/`.length).replace(/\/$/, ""), id: null })),
      ...res.blobs.map((x) => ({ name: x.pathname.split("/").pop()!, id: x.pathname })),
    ];
  }
  const names = new Map<string, string | null>();
  if (b === "memory") {
    for (const k of memoryFiles.keys()) {
      if (!k.startsWith(base + "/")) continue;
      const rest = k.slice(base.length + 1).split("/");
      names.set(rest[0], rest.length > 1 ? null : k);
    }
  }
  const entries = await fs.readdir(path.join(STORAGE_DIR, base), { withFileTypes: true }).catch(() => []);
  for (const e of entries) names.set(e.name, e.isDirectory() ? null : `${base}/${e.name}`);
  return [...names].map(([name, id]) => ({ name, id }));
}

const ok = <T,>(data: T): StorageResult<T> => ({ data, error: null });
const err = (e: unknown): StorageResult<never> => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } });

export const serverStorageExecutor: StorageExecutor = {
  async upload(bucket, p, body, opts) {
    try {
      if (!opts.upsert && (await readFile(bucket, p))) {
        return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
      }
      await writeFile(bucket, p, await toBuffer(body), opts.contentType);
      return ok({ path: p, fullPath: `${bucket}/${p}` });
    } catch (e) {
      return err(e);
    }
  },
  async download(bucket, p) {
    try {
      const f = await readFile(bucket, p);
      if (!f) return { data: null, error: { message: "Object not found", statusCode: "404" } };
      return ok(new Blob([new Uint8Array(f.body)], { type: f.contentType }));
    } catch (e) {
      return err(e);
    }
  },
  async remove(bucket, paths) {
    try {
      for (const p of paths) await deleteFile(bucket, p);
      return ok(paths.map((name) => ({ name })));
    } catch (e) {
      return err(e);
    }
  },
  async list(bucket, prefix) {
    try {
      return ok(await listFiles(bucket, prefix));
    } catch (e) {
      return err(e);
    }
  },
};
