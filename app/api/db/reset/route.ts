import { NextResponse } from "next/server";
import { backend, resetDb } from "@/lib/mockdb/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/db/reset — restore the deployed mock DB (Blob / memory) to the
 * committed data/db.json seed. Locally the file *is* the DB; use
 * `git checkout data/db.json` instead.
 */
export async function POST() {
  if (backend() === "file") {
    return NextResponse.json(
      { ok: false, message: "Local file backend: run `git checkout data/db.json` to reset." },
      { status: 400 }
    );
  }
  await resetDb();
  return NextResponse.json({ ok: true, backend: backend() });
}
