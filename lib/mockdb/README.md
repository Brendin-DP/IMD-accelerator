# Mock DB

The prototype runs on a JSON database (`data/db.json`) instead of Supabase.
App code is unchanged: `supabase.from(...)` and `createServerClient()` return a
Supabase-compatible mock client unless `NEXT_PUBLIC_USE_MOCK_DB=false`.

```
browser: supabase.from("cohorts").select(...)  ──POST /api/db──┐
server:  createServerClient().from(...)  ─────── direct ───────┤
                                                               ▼
                                     lib/mockdb/engine.ts  (query engine)
                                                               ▼
                       data/db.json (local) | Vercel Blob (deployed) | memory
```

| File | Role |
| --- | --- |
| `engine.ts` | Runs PostgREST-style queries: filters, embeds via foreign keys, order/limit, single, insert/update/upsert/delete, defaults, unique + not-null checks, cascades. Writes are all-or-nothing. |
| `client.ts` | Supabase-like builder (`from`, `storage.from`) + browser HTTP executors. |
| `server.ts` | Persistence (file / Blob / memory), serialised writes, storage buckets. |
| `schema.json` | Generated from `src/types/database.types.ts` — `npm run generate:mock-schema`. |
| `config.ts` | Things the types don't capture: unique constraints, text defaults, delete behaviour. |

## Common tasks

- **Refresh data from Supabase** (project must be running): `npm run db:export`.
  This also runs `npm run db:demo-logins`, which swaps real IMD admin identities for the
  demo ones in `data/demo-logins.json` (matched by user id), and moves every other
  email onto `example.com` (`jo@spacex.com` → `jo@spacex.example.com`). Admin demo
  logins (email + password) are listed in that file.
- **Inspect data**: `GET /api/db` (row counts), `/api/db?table=clients`, `/api/db?export=1`
- **Reset locally**: `git checkout data/db.json`
- **Reset on Vercel**: `POST /api/db/reset` (re-seeds Blob from the committed file)
- **Add a table/column**: add rows to `data/db.json`, update `database.types.ts`, run
  `npm run generate:mock-schema`; add constraints/defaults to `config.ts` if needed.
- **New features**: keep using `supabase.from(...)`, or add a dedicated route under
  `app/api/` that uses `createServerClient()` / `readDb()` / `updateDb()`.

## Deployed (Vercel)

Connect a **private** Blob store to the project (`vercel blob create-store <name> --access private`);
the store then persists writes across requests. Without one, writes live in memory and reset
when the function instance recycles. Force a backend with `MOCKDB_STORE=file|blob|memory`.

## Not emulated

Foreign-key existence checks on insert, RLS, triggers, RPC functions, realtime, and Supabase
Auth (the app uses table-based login). `/api/db` is unauthenticated — fine for a prototype,
not for real data.
