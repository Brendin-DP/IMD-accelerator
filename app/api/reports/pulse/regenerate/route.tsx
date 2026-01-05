// app/api/reports/pulse/regenerate/route.tsx
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { createClient } from "@supabase/supabase-js";
import { PulseReportPDF, type PulseReportData } from "../_pdf";
import { createServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {

    let requestBody;
    try {
      requestBody = await req.json();

    } catch (parseError) {

      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    
    const { participant_assessment_id } = requestBody;

    if (!participant_assessment_id) {

      return NextResponse.json({ error: "participant_assessment_id is required" }, { status: 400 });
    }

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {

      return NextResponse.json({ 
        error: "Server configuration error: Missing Supabase credentials",
        details: "Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables"
      }, { status: 500 });
    }

    let supabase;
    try {
      supabase = createServerClient();

    } catch (clientError) {

      return NextResponse.json({ 
        error: "Failed to initialize Supabase client",
        details: clientError instanceof Error ? clientError.message : String(clientError)
      }, { status: 500 });
    }

    // 1) Fetch participant assessment with cohort_assessment and assessment_type

    const { data: participantAssessment, error: paErr } = await supabase
      .from("participant_assessments")
      .select(`
        id,
        participant_id,
        cohort_assessment_id,
        cohort_assessment:cohort_assessments(
          id,
          assessment_type_id,
          assessment_type:assessment_types(
            id,
            name,
            description
          )
        )
      `)
      .eq("id", participant_assessment_id)
      .single();

    if (paErr || !participantAssessment) {

      return NextResponse.json({ 
        error: paErr?.message || "Participant assessment not found",
        details: paErr?.details,
        hint: paErr?.hint,
      }, { status: 404 });
    }

    // Extract assessment type information
    const cohortAssessment = (participantAssessment as any).cohort_assessment;
    const assessmentType = cohortAssessment?.assessment_type;
    const assessmentTypeName = assessmentType?.name?.toLowerCase() || "pulse"; // Default to "pulse" for backward compatibility

    // Validate that we have assessment type information
    if (!cohortAssessment || !assessmentType) {

    }
    
    // Validation: Ensure participant_assessment_id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(participant_assessment_id)) {

      return NextResponse.json({ 
        error: "Invalid participant_assessment_id format",
        participant_assessment_id,
      }, { status: 400 });
    }
    
    // Validation: Ensure participant assessment ID matches the fetched record
    if (participantAssessment.id !== participant_assessment_id) {

      return NextResponse.json({ 
        error: "Participant assessment ID mismatch",
        requested: participant_assessment_id,
        found: participantAssessment.id,
      }, { status: 400 });
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

    let pdfBuffer;
    try {
      pdfBuffer = await renderToBuffer(<PulseReportPDF data={data} />);

    } catch (renderError) {

      return NextResponse.json({ 
        error: "Failed to render PDF",
        details: renderError instanceof Error ? renderError.message : String(renderError)
      }, { status: 500 });
    }

    // 4) Upload to Supabase Storage
    // Use assessment type name for storage path (supports custom plans that inherit from pulse)
    const storagePath = `${assessmentTypeName}/${participant_assessment_id}.pdf`;

    const upload = await supabase.storage
      .from("reports")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (upload.error) {

      return NextResponse.json({ 
        error: upload.error.message,
        storagePath,
      }, { status: 500 });
    }

    // 5) Upsert pointer row
    // Create admin client with service role for database writes (bypasses RLS)
    let supabaseAdmin;
    try {
      supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

    } catch (adminClientError) {

      return NextResponse.json({ 
        error: "Failed to create admin Supabase client",
        details: adminClientError instanceof Error ? adminClientError.message : String(adminClientError)
      }, { status: 500 });
    }
    
    // First, check if record exists (use dynamic report_type)

    const { data: existingReport, error: checkError } = await supabaseAdmin
      .from("assessment_reports")
      .select("id, participant_assessment_id, report_type, storage_path")
      .eq("participant_assessment_id", participant_assessment_id)
      .eq("report_type", assessmentTypeName)
      .maybeSingle();

    if (checkError) {

      // Continue anyway - might be table doesn't exist or permission issue
    }

    const upsertPayload = {
      participant_assessment_id,
      report_type: assessmentTypeName, // Use dynamic assessment type name
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
    };

    let dbResult;
    if (existingReport) {
      // Update existing record

      dbResult = await supabaseAdmin
        .from("assessment_reports")
        .update({
          storage_path: storagePath,
          updated_at: new Date().toISOString(),
          source_updated_at: new Date().toISOString(),
        })
        .eq("id", existingReport.id)
        .select();
    } else {
      // Try upsert first

      dbResult = await supabaseAdmin
        .from("assessment_reports")
        .upsert(
          upsertPayload,
          { onConflict: "participant_assessment_id,report_type" }
        )
        .select();
      
      // If upsert fails due to constraint issue, try insert
      if (dbResult.error && dbResult.error.code === "23505") {

        dbResult = await supabaseAdmin
          .from("assessment_reports")
          .insert(upsertPayload)
          .select();
      }
    }

    if (dbResult.error) {

      return NextResponse.json({ 
        error: dbResult.error.message,
        code: dbResult.error.code,
        details: dbResult.error.details,
        hint: dbResult.error.hint,
        payload: upsertPayload,
        operation: existingReport ? "update" : "upsert/insert",
      }, { status: 500 });
    }

    // 6) Return signed URL

    const signed = await supabase.storage.from("reports").createSignedUrl(storagePath, 60);
    if (signed.error || !signed.data?.signedUrl) {

      return NextResponse.json({ 
        error: signed.error?.message || "Failed to create signed url",
        storagePath,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      storage_path: storagePath,
      signed_url: signed.data.signedUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;

    return NextResponse.json({ 
      error: msg,
      stack: process.env.NODE_ENV === "development" ? stack : undefined,
    }, { status: 500 });
  }
}