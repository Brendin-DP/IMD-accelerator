import { NextRequest, NextResponse } from "next/server";
import type { Query } from "@/lib/mockdb/engine";
import { backend, readDb, serverQueryExecutor } from "@/lib/mockdb/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = new Set(["select", "insert", "update", "upsert", "delete"]);

/**
 * Mock DB query endpoint. The browser-side mock Supabase client POSTs a
 * serialised query here (see lib/mockdb/client.ts).
 */
export async function POST(req: NextRequest) {
  let q: Query;
  try {
    q = await req.json();
  } catch {
    return NextResponse.json({ data: null, error: { code: "PGRST102", message: "Invalid JSON body", details: null, hint: null } }, { status: 400 });
  }
  if (!q || typeof q.table !== "string" || !ACTIONS.has(q.action) || !Array.isArray(q.filters) || !Array.isArray(q.order)) {
    return NextResponse.json({ data: null, error: { code: "PGRST100", message: "Malformed mock DB query", details: null, hint: null } }, { status: 400 });
  }

  const result = await serverQueryExecutor(q);
  // Always 200 so the client can read the PostgREST-style error body.
  return NextResponse.json(result);
}

/**
 * GET /api/db               → summary of tables and row counts
 * GET /api/db?table=clients → rows of one table
 * GET /api/db?export=1      → full JSON snapshot (download)
 */
export async function GET(req: NextRequest) {
  const db = await readDb();
  const table = req.nextUrl.searchParams.get("table");
  if (table) {
    if (!db[table]) return NextResponse.json({ error: `Unknown table "${table}"` }, { status: 404 });
    return NextResponse.json(db[table]);
  }
  if (req.nextUrl.searchParams.get("export")) {
    return new NextResponse(JSON.stringify(db, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="db-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json"`,
      },
    });
  }
  return NextResponse.json({
    backend: backend(),
    tables: Object.fromEntries(Object.entries(db).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v])),
  });
}
