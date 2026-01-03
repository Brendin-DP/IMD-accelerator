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
    console.log("🔍 [REPORT] POST handler started");
    
    let requestBody;
    try {
      requestBody = await req.json();
      console.log("✅ [REPORT] Request body parsed:", { hasParticipantAssessmentId: !!requestBody?.participant_assessment_id });
    } catch (parseError) {
      console.error("❌ [REPORT] Failed to parse request body:", {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        stack: parseError instanceof Error ? parseError.stack : undefined,
      });
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    
    const { participant_assessment_id } = requestBody;
    
    console.log("🔍 [REPORT] Regenerate route called:", {
      participant_assessment_id,
      timestamp: new Date().toISOString(),
    });
    
    if (!participant_assessment_id) {
      console.error("❌ [REPORT] Missing participant_assessment_id");
      return NextResponse.json({ error: "participant_assessment_id is required" }, { status: 400 });
    }

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log("🔍 [REPORT] Environment check:", {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      serviceRoleKeyLength: serviceRoleKey?.length || 0,
    });
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ [REPORT] Missing environment variables:", {
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceRoleKey: !!serviceRoleKey,
      });
      return NextResponse.json({ 
        error: "Server configuration error: Missing Supabase credentials",
        details: "Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables"
      }, { status: 500 });
    }

    let supabase;
    try {
      supabase = createServerClient();
      console.log("✅ [REPORT] Supabase client created (service role)");
    } catch (clientError) {
      console.error("❌ [REPORT] Failed to create Supabase client:", {
        error: clientError instanceof Error ? clientError.message : String(clientError),
        stack: clientError instanceof Error ? clientError.stack : undefined,
      });
      return NextResponse.json({ 
        error: "Failed to initialize Supabase client",
        details: clientError instanceof Error ? clientError.message : String(clientError)
      }, { status: 500 });
    }

    // 1) Fetch participant assessment with cohort_assessment and assessment_type
    console.log("🔍 [REPORT] Step 1: Fetching participant assessment with assessment type...");
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
      console.error("❌ [REPORT] Participant assessment fetch failed:", {
        error: paErr,
        participant_assessment_id,
        errorCode: paErr?.code,
        errorMessage: paErr?.message,
        errorDetails: paErr?.details,
        errorHint: paErr?.hint,
      });
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
    
    console.log("✅ [REPORT] Participant assessment found:", {
      id: participantAssessment.id,
      participant_id: participantAssessment.participant_id,
      cohort_assessment_id: participantAssessment.cohort_assessment_id,
      assessment_type_id: cohortAssessment?.assessment_type_id,
      assessment_type_name: assessmentTypeName,
    });

    // Validate that we have assessment type information
    if (!cohortAssessment || !assessmentType) {
      console.warn("⚠️ [REPORT] Assessment type information not found, defaulting to 'pulse'");
    }
    
    // Validation: Ensure participant_assessment_id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(participant_assessment_id)) {
      console.error("❌ [REPORT] Invalid participant_assessment_id format:", {
        participant_assessment_id,
      });
      return NextResponse.json({ 
        error: "Invalid participant_assessment_id format",
        participant_assessment_id,
      }, { status: 400 });
    }
    
    // Validation: Ensure participant assessment ID matches the fetched record
    if (participantAssessment.id !== participant_assessment_id) {
      console.error("❌ [REPORT] Participant assessment ID mismatch:", {
        requested: participant_assessment_id,
        found: participantAssessment.id,
      });
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
    console.log("🔍 [REPORT] Step 3: Rendering PDF...");
    let pdfBuffer;
    try {
      pdfBuffer = await renderToBuffer(<PulseReportPDF data={data} />);
      console.log("✅ [REPORT] PDF rendered:", {
        bufferSize: pdfBuffer.length,
        bufferSizeKB: Math.round(pdfBuffer.length / 1024),
      });
    } catch (renderError) {
      console.error("❌ [REPORT] PDF rendering failed:", {
        error: renderError instanceof Error ? renderError.message : String(renderError),
        stack: renderError instanceof Error ? renderError.stack : undefined,
        data,
      });
      return NextResponse.json({ 
        error: "Failed to render PDF",
        details: renderError instanceof Error ? renderError.message : String(renderError)
      }, { status: 500 });
    }

    // 4) Upload to Supabase Storage
    // Use assessment type name for storage path (supports custom plans that inherit from pulse)
    const storagePath = `${assessmentTypeName}/${participant_assessment_id}.pdf`;
    console.log("🔍 [REPORT] Step 4: Uploading to storage...", { 
      storagePath,
      assessmentTypeName,
      reportType: assessmentTypeName,
    });
    const upload = await supabase.storage
      .from("reports")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (upload.error) {
      console.error("❌ [REPORT] Storage upload failed:", {
        error: upload.error,
        errorMessage: upload.error.message,
        storagePath,
      });
      return NextResponse.json({ 
        error: upload.error.message,
        storagePath,
      }, { status: 500 });
    }
    
    console.log("✅ [REPORT] PDF uploaded to storage:", {
      storagePath,
      path: upload.data?.path,
    });

    // 5) Upsert pointer row
    // Create admin client with service role for database writes (bypasses RLS)
    let supabaseAdmin;
    try {
      supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      console.log("✅ [REPORT] Admin client created (service role, no session persistence)");
    } catch (adminClientError) {
      console.error("❌ [REPORT] Failed to create admin client:", {
        error: adminClientError instanceof Error ? adminClientError.message : String(adminClientError),
        stack: adminClientError instanceof Error ? adminClientError.stack : undefined,
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
      return NextResponse.json({ 
        error: "Failed to create admin Supabase client",
        details: adminClientError instanceof Error ? adminClientError.message : String(adminClientError)
      }, { status: 500 });
    }
    
    // First, check if record exists (use dynamic report_type)
    console.log("🔍 [REPORT] Step 5: Checking for existing report record...", {
      participant_assessment_id,
      report_type: assessmentTypeName,
    });
    const { data: existingReport, error: checkError } = await supabaseAdmin
      .from("assessment_reports")
      .select("id, participant_assessment_id, report_type, storage_path")
      .eq("participant_assessment_id", participant_assessment_id)
      .eq("report_type", assessmentTypeName)
      .maybeSingle();

    if (checkError) {
      console.error("❌ [REPORT] Error checking existing report:", {
        error: checkError,
        errorCode: checkError.code,
        errorMessage: checkError.message,
        errorDetails: checkError.details,
        errorHint: checkError.hint,
      });
      // Continue anyway - might be table doesn't exist or permission issue
    }

    const upsertPayload = {
      participant_assessment_id,
      report_type: assessmentTypeName, // Use dynamic assessment type name
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
      source_updated_at: new Date().toISOString(),
    };
    
    console.log("🔍 [REPORT] Step 5b: Upserting to assessment_reports table (using admin client)...", {
      payload: upsertPayload,
      existingReport: existingReport ? { id: existingReport.id } : null,
      onConflict: "participant_assessment_id,report_type",
    });
    
    let dbResult;
    if (existingReport) {
      // Update existing record
      console.log("🔍 [REPORT] Updating existing record...");
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
      console.log("🔍 [REPORT] Attempting upsert...");
      dbResult = await supabaseAdmin
        .from("assessment_reports")
        .upsert(
          upsertPayload,
          { onConflict: "participant_assessment_id,report_type" }
        )
        .select();
      
      // If upsert fails due to constraint issue, try insert
      if (dbResult.error && dbResult.error.code === "23505") {
        console.warn("⚠️ [REPORT] Upsert failed (constraint), trying insert...");
        dbResult = await supabaseAdmin
          .from("assessment_reports")
          .insert(upsertPayload)
          .select();
      }
    }

    if (dbResult.error) {
      console.error("❌ [REPORT] Database write failed:", {
        error: dbResult.error,
        errorCode: dbResult.error.code,
        errorMessage: dbResult.error.message,
        errorDetails: dbResult.error.details,
        errorHint: dbResult.error.hint,
        payload: upsertPayload,
        operation: existingReport ? "update" : "upsert/insert",
      });
      return NextResponse.json({ 
        error: dbResult.error.message,
        code: dbResult.error.code,
        details: dbResult.error.details,
        hint: dbResult.error.hint,
        payload: upsertPayload,
        operation: existingReport ? "update" : "upsert/insert",
      }, { status: 500 });
    }
    
    console.log("✅ [REPORT] Database write succeeded:", {
      data: dbResult.data,
      rowCount: dbResult.data?.length || 0,
      operation: existingReport ? "update" : "insert",
    });

    // 6) Return signed URL
    console.log("🔍 [REPORT] Step 6: Creating signed URL...");
    const signed = await supabase.storage.from("reports").createSignedUrl(storagePath, 60);
    if (signed.error || !signed.data?.signedUrl) {
      console.error("❌ [REPORT] Failed to create signed URL:", {
        error: signed.error,
        storagePath,
      });
      return NextResponse.json({ 
        error: signed.error?.message || "Failed to create signed url",
        storagePath,
      }, { status: 500 });
    }

    console.log("✅ [REPORT] Report generation completed successfully:", {
      storage_path: storagePath,
      signed_url: signed.data.signedUrl.substring(0, 50) + "...",
    });

    return NextResponse.json({
      ok: true,
      storage_path: storagePath,
      signed_url: signed.data.signedUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("❌ [REPORT] Unexpected error:", {
      error: e,
      message: msg,
      stack,
    });
    return NextResponse.json({ 
      error: msg,
      stack: process.env.NODE_ENV === "development" ? stack : undefined,
    }, { status: 500 });
  }
}