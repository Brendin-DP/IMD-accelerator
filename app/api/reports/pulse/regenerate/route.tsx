// app/api/reports/pulse/regenerate/route.tsx
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { PulseReportPDF, type PulseReportData } from "../_pdf";
import { createServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { participant_assessment_id } = await req.json();
    if (!participant_assessment_id) {
      return NextResponse.json({ error: "participant_assessment_id is required" }, { status: 400 });
    }

    const supabase = createServerClient();

    // 1) Fetch whatever you need to build the report
    // TODO: Replace these queries with YOUR schema for reviewers + responses.
    // Below is intentionally “shape-based” rather than exact.
    const { data: participantAssessment, error: paErr } = await supabase
      .from("participant_assessments")
      .select("id, participant_id, cohort_assessment_id")
      .eq("id", participant_assessment_id)
      .single();

    if (paErr || !participantAssessment) {
      return NextResponse.json({ error: paErr?.message || "Participant assessment not found" }, { status: 404 });
    }

    // Minimal empty data for testing create/download vertical
    const data: PulseReportData = {
      title: "Pulse Survey Report",
      participantName: "Participant",
      cohortName: "Cohort",
      generatedAt: new Date().toISOString(),
      reviewers: [], // Empty reviewers array for blank report
    };

    // 3) Render PDF bytes
    const pdfBuffer = await renderToBuffer(<PulseReportPDF data={data} />);

    // 4) Upload to Supabase Storage
    const storagePath = `pulse/${participant_assessment_id}.pdf`;
    const upload = await supabase.storage
      .from("reports")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message }, { status: 500 });
    }

    // 5) Upsert pointer row
    const upsert = await supabase
      .from("assessment_reports")
      .upsert(
        {
          participant_assessment_id,
          report_type: "pulse",
          storage_path: storagePath,
          updated_at: new Date().toISOString(),
          source_updated_at: new Date().toISOString(),
        },
        { onConflict: "participant_assessment_id,report_type" }
      );

    if (upsert.error) {
      return NextResponse.json({ error: upsert.error.message }, { status: 500 });
    }

    // 6) Return signed URL
    const signed = await supabase.storage.from("reports").createSignedUrl(storagePath, 60);
    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json({ error: signed.error?.message || "Failed to create signed url" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      storage_path: storagePath,
      signed_url: signed.data.signedUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}