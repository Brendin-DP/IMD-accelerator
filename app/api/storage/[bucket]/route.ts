import { NextRequest, NextResponse } from "next/server";
import { serverStorageExecutor } from "@/lib/mockdb/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ bucket: string }> };

/** List files in a bucket: GET /api/storage/reports?prefix=pulse */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { bucket } = await params;
  const result = await serverStorageExecutor.list(bucket, req.nextUrl.searchParams.get("prefix") ?? "");
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}

/** Remove files: DELETE /api/storage/reports  { "paths": ["a.pdf"] } */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { bucket } = await params;
  const { paths } = (await req.json().catch(() => ({}))) as { paths?: string[] };
  if (!Array.isArray(paths)) return NextResponse.json({ error: { message: "Body must be { paths: string[] }" } }, { status: 400 });
  const result = await serverStorageExecutor.remove(bucket, paths);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}
