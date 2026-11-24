import { NextRequest, NextResponse } from "next/server";
import { readFile, serverStorageExecutor } from "@/lib/mockdb/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ bucket: string; path: string[] }> };

/** Serve a stored file (stands in for Supabase signed/public URLs). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { bucket, path } = await params;
  const p = path.join("/");
  const file = await readFile(bucket, p).catch(() => null);
  if (!file) return NextResponse.json({ error: { message: "Object not found" } }, { status: 404 });
  const download = req.nextUrl.searchParams.get("download");
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="${path[path.length - 1]}"` } : {}),
    },
  });
}

/** Upload a file (used by the browser-side mock storage client). */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { bucket, path } = await params;
  const body = Buffer.from(await req.arrayBuffer());
  const result = await serverStorageExecutor.upload(bucket, path.join("/"), body, {
    contentType: req.headers.get("content-type") ?? undefined,
    upsert: req.nextUrl.searchParams.get("upsert") === "1",
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: Number(result.error.statusCode) || 400 });
  return NextResponse.json(result.data);
}
