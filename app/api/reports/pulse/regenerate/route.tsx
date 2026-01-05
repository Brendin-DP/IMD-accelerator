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

    // Get assessment_definition_id from plan mapping or system assessment
    const assessmentTypeId = cohortAssessment.assessment_type_id;
    let assessmentDefinitionId: string | null = null;

    // Get cohort_id from cohort_assessment
    const { data: cohortAssessmentFull } = await supabase
      .from("cohort_assessments")
      .select("cohort_id")
      .eq("id", participantAssessment.cohort_assessment_id)
      .single();

    if (cohortAssessmentFull?.cohort_id) {
      const { data: cohort } = await supabase
        .from("cohorts")
        .select("id, plan_id, name")
        .eq("id", cohortAssessmentFull.cohort_id)
        .single();

      if (cohort?.plan_id) {
        const { data: planData } = await supabase
          .from("plans")
          .select("description")
          .eq("id", cohort.plan_id)
          .single();

        if (planData?.description) {
          const planMappingMatch = planData.description.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
          if (planMappingMatch) {
            try {
              const mapping = JSON.parse(planMappingMatch[1]);
              const selectedDefId = mapping[assessmentTypeId];
              if (selectedDefId) {
                const { data: selectedDef } = await supabase
                  .from("assessment_definitions_v2")
                  .select("id")
                  .eq("id", selectedDefId)
                  .eq("assessment_type_id", assessmentTypeId)
                  .maybeSingle();

                if (selectedDef) {
                  assessmentDefinitionId = selectedDef.id;
                }
              }
            } catch (e) {
              // Fall through to system assessment
            }
          }
        }
      }
    }

    // Fall back to system assessment
    if (!assessmentDefinitionId) {
      const { data: systemDef } = await supabase
        .from("assessment_definitions_v2")
        .select("id")
        .eq("assessment_type_id", assessmentTypeId)
        .eq("is_system", true)
        .maybeSingle();

      if (systemDef) {
        assessmentDefinitionId = systemDef.id;
      }
    }

    // Fetch participant information
    const { data: participantData } = await supabase
      .from("cohort_participants")
      .select("client_user_id, client_users(name, surname, email)")
      .eq("id", participantAssessment.participant_id)
      .single();

    const participantName = participantData?.client_users
      ? `${participantData.client_users.name || ""} ${participantData.client_users.surname || ""}`.trim() || participantData.client_users.email
      : "Participant";

    // Fetch cohort name
    let cohortName = "Cohort";
    if (cohortAssessmentFull?.cohort_id) {
      const { data: cohortData } = await supabase
        .from("cohorts")
        .select("name")
        .eq("id", cohortAssessmentFull.cohort_id)
        .single();
      cohortName = cohortData?.name || "Cohort";
    }

    // Fetch completed reviewer data
    const reviewers: PulseReportData["reviewers"] = [];

    if (assessmentDefinitionId) {
      // Query completed reviewer sessions
      const { data: reviewerSessions, error: sessionsError } = await supabase
        .from("assessment_response_sessions")
        .select("id, reviewer_nomination_id, respondent_type, respondent_client_user_id, respondent_external_reviewer_id")
        .eq("participant_assessment_id", participant_assessment_id)
        .eq("assessment_definition_id", assessmentDefinitionId)
        .eq("status", "completed")
        .in("respondent_type", ["client_user", "external_reviewer"])
        .not("reviewer_nomination_id", "is", null);

      if (!sessionsError && reviewerSessions && reviewerSessions.length > 0) {
        // Process each completed session
        for (const session of reviewerSessions) {
          if (!session.reviewer_nomination_id) continue;

          // Get reviewer nomination
          const { data: nomination } = await supabase
            .from("reviewer_nominations")
            .select("reviewer_id, external_reviewer_id")
            .eq("id", session.reviewer_nomination_id)
            .maybeSingle();

          if (!nomination) continue;

          let reviewerName = "";
          let reviewerEmail = "";

          // Get reviewer info (internal or external)
          if (nomination.reviewer_id) {
            // Internal reviewer
            const { data: clientUser } = await supabase
              .from("client_users")
              .select("name, surname, email")
              .eq("id", nomination.reviewer_id)
              .single();

            if (clientUser) {
              reviewerName = `${clientUser.name || ""} ${clientUser.surname || ""}`.trim() || clientUser.email;
              reviewerEmail = clientUser.email;
            }
          } else if (nomination.external_reviewer_id) {
            // External reviewer
            const { data: externalReviewer } = await supabase
              .from("external_reviewers")
              .select("email")
              .eq("id", nomination.external_reviewer_id)
              .single();

            if (externalReviewer) {
              reviewerName = externalReviewer.email;
              reviewerEmail = externalReviewer.email;
            }
          }

          if (!reviewerEmail) continue; // Skip if we can't get reviewer info

          // Fetch reviewer responses
          const { data: responses } = await supabase
            .from("assessment_responses")
            .select(`
              question_id,
              answer_text,
              question:assessment_questions_v2(
                id,
                question_text,
                text,
                question_order,
                step_id,
                step:assessment_steps_v2(step_order)
              )
            `)
            .eq("session_id", session.id)
            .eq("is_answered", true)
            .order("created_at", { ascending: true });

          if (!responses || responses.length === 0) continue;

          // Map responses to QA format, maintaining order
          const qaResponses: Array<{ question: string; answer: string | null }> = [];

          // Sort responses by step_order and question_order
          const sortedResponses = [...responses].sort((a: any, b: any) => {
            const aStepOrder = a.question?.step?.step_order ?? 0;
            const bStepOrder = b.question?.step?.step_order ?? 0;
            if (aStepOrder !== bStepOrder) {
              return aStepOrder - bStepOrder;
            }
            const aQOrder = a.question?.question_order ?? 0;
            const bQOrder = b.question?.question_order ?? 0;
            return aQOrder - bQOrder;
          });

          for (const response of sortedResponses) {
            const question = (response as any).question;
            const questionText = question?.question_text || question?.text || `Question ${response.question_id}`;
            qaResponses.push({
              question: questionText,
              answer: response.answer_text,
            });
          }

          reviewers.push({
            reviewerName,
            reviewerEmail,
            responses: qaResponses,
          });
        }
      }
    }

    // Prepare report data
    const data: PulseReportData = {
      title: `${assessmentType.name} Survey Report`,
      participantName,
      cohortName,
      generatedAt: new Date().toISOString(),
      reviewers,
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