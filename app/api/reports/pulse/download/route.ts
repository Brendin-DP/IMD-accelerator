// app/api/reports/pulse/download/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const participant_assessment_id = url.searchParams.get("participant_assessment_id");
  if (!participant_assessment_id) {
    return NextResponse.json({ error: "participant_assessment_id is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Lookup current report row
  const { data: reportRow } = await supabase
    .from("assessment_reports")
    .select("storage_path")
    .eq("participant_assessment_id", participant_assessment_id)
    .eq("report_type", "pulse")
    .maybeSingle();

  // If none exists, you can call regenerate route (or inline generate here)
  if (!reportRow?.storage_path) {
    return NextResponse.json(
      { error: "No report yet. Call /api/reports/pulse/regenerate first." },
      { status: 404 }
    );
  }

  const signed = await supabase.storage.from("reports").createSignedUrl(reportRow.storage_path, 60);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message || "Failed to create signed url" }, { status: 500 });
  }

  return NextResponse.json({ signed_url: signed.data.signedUrl });
}