"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Stepper, StepperStep } from "@/components/ui/stepper";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { MicTextarea } from "@/components/mictextarea";

interface Question {
  id: number | string;
  category?: string;
  text: string;
  question_text?: string;
  question_order?: number;
  question_type?: string;
  required?: boolean;
  step_id?: string | null;
}

interface AssessmentStep {
  id: string;
  title: string | null;
  step_order: number;
}

interface QuestionGroup {
  step: AssessmentStep | null;
  questions: Question[];
}

export default function Assessment360() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const subdomain = params.subdomain as string;
  const assessmentId = params.assessmentId as string;
  const source = searchParams.get("source");
  const useDb = source === "db";

  const [questions, setQuestions] = useState<Question[]>([]);
  const [steps, setSteps] = useState<AssessmentStep[]>([]);
  const [questionGroups, setQuestionGroups] = useState<QuestionGroup[]>([]);
  const [current, setCurrent] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string | number, string>>({});
  const [participantAssessmentId, setParticipantAssessmentId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usesNewPlan, setUsesNewPlan] = useState(false);
  const [assessmentType, setAssessmentType] = useState<string>("");
  const [assessmentDefinitionId, setAssessmentDefinitionId] = useState<string | null>(null);
  const [responseSessionId, setResponseSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [hasResumed, setHasResumed] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch cohort_assessment to get assessment_type_id and cohort_id
          const { data: cohortAssessment, error: caError } = await supabase
            .from("cohort_assessments")
          .select("assessment_type_id, cohort_id")
            .eq("id", assessmentId)
            .single();

          if (caError || !cohortAssessment) {
            console.error("Error fetching cohort assessment:", caError);
          setLoading(false);
            return;
          }

        const assessmentTypeId = cohortAssessment.assessment_type_id;
        
        // Fetch assessment type name to determine if it's Pulse
        const { data: assessmentTypeData, error: typeError } = await supabase
          .from("assessment_types")
          .select("name")
          .eq("id", assessmentTypeId)
          .single();

        const assessmentTypeName = assessmentTypeData?.name || "";
        setAssessmentType(assessmentTypeName);

        // Check query parameter to determine source
        if (useDb) {
          // Start Assessment: Always load from DB
          // First, check if the cohort's plan has a custom assessment definition for this type
          let assessmentDefinitionId: string | null = null;

          // Get the cohort to find the plan
          const { data: cohort, error: cohortError } = await supabase
            .from("cohorts")
            .select("plan_id")
            .eq("id", cohortAssessment.cohort_id)
            .single();

          if (!cohortError && cohort?.plan_id) {
            // Fetch the plan's description to get the assessment definition mapping
            const { data: planData, error: planError } = await supabase
              .from("plans")
              .select("description")
              .eq("id", cohort.plan_id)
              .single();

            if (!planError && planData?.description) {
              // Extract the assessment definition mapping from plan description
              const planMappingMatch = planData.description.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
              if (planMappingMatch) {
                try {
                  const mapping = JSON.parse(planMappingMatch[1]);
                  const selectedDefId = mapping[assessmentTypeId];
                  
                    if (selectedDefId) {
                      // Verify this assessment definition exists and is for this type
                      const { data: selectedDef, error: defCheckError } = await supabase
                        .from("assessment_definitions_v2")
                        .select("id, assessment_type_id")
                        .eq("id", selectedDefId)
                        .eq("assessment_type_id", assessmentTypeId)
                        .maybeSingle();

                      if (!defCheckError && selectedDef) {
                        // Use the selected assessment definition (could be custom or system)
                        assessmentDefinitionId = selectedDef.id;
                      }
                    }
                } catch (e) {
                  console.error("Error parsing plan assessment mapping:", e);
                }
              }
            }
          }

          // If no custom assessment found, fall back to system assessment
          if (!assessmentDefinitionId) {
            const { data: systemDef, error: defError } = await supabase
              .from("assessment_definitions_v2")
              .select("id")
              .eq("assessment_type_id", assessmentTypeId)
              .eq("is_system", true)
              .maybeSingle();

            if (defError || !systemDef) {
              console.error("Error fetching assessment definition:", defError);
              alert("Error: Could not find assessment definition. Please try again.");
              setLoading(false);
            return;
            }

            assessmentDefinitionId = systemDef.id;
          }

          if (!assessmentDefinitionId) {
            throw new Error("Missing assessmentDefinitionId for this assessment");
          }

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:159',message:'Assessment definition ID resolved',data:{assessmentDefinitionId,assessmentTypeId,assessmentTypeName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion

          setAssessmentDefinitionId(assessmentDefinitionId);
          setUsesNewPlan(true);
          await loadQuestionsFromDB(assessmentDefinitionId, assessmentTypeId, assessmentTypeName);

          // Fetch participant_assessment_id and create session AFTER assessmentDefinitionId is determined
          const storedUser = localStorage.getItem("participant");
          if (storedUser) {
            try {
              const userData = JSON.parse(storedUser);

          // Find the cohort_participant for this user AND this specific cohort
          const { data: participants, error: participantsError } = await supabase
            .from("cohort_participants")
            .select("id")
            .eq("client_user_id", userData.id)
            .eq("cohort_id", cohortAssessment.cohort_id);

          if (participantsError || !participants || participants.length === 0) {
                console.warn("⚠️ [DEBUG] No participants found for this user in this cohort");
              } else {
          const participantIds = participants.map((p: any) => p.id);

          // Fetch participant_assessment
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:182',message:'Looking up participant_assessment',data:{assessmentId,participantIds},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Use limit(1) instead of maybeSingle() to handle potential duplicates (same as detail page)
          const { data: participantAssessmentData, error: paError } = await supabase
            .from("participant_assessments")
            .select("*")
            .eq("cohort_assessment_id", assessmentId)
            .in("participant_id", participantIds)
            .limit(1);

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:189',message:'Participant assessment lookup result',data:{found:!!participantAssessmentData?.length,count:participantAssessmentData?.length||0,error:paError?.message,participantAssessmentId:participantAssessmentData?.[0]?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion

          let finalParticipantAssessmentId: string | null = null;

          const pa = participantAssessmentData && participantAssessmentData.length > 0 
            ? participantAssessmentData[0] 
            : null;

          if (!paError && pa) {
            finalParticipantAssessmentId = pa.id;
            setParticipantAssessmentId(pa.id);
          } else {
            // Create participant_assessment if it doesn't exist (fallback)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:206',message:'Creating participant_assessment (fallback)',data:{assessmentId,participantId:participantIds[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const { data: newPA, error: createError } = await supabase
              .from("participant_assessments")
              .insert({
                participant_id: participantIds[0],
                cohort_assessment_id: assessmentId,
                status: "Not started",
              })
              .select()
              .single();

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:220',message:'Participant assessment creation result',data:{success:!!newPA,error:createError?.message,participantAssessmentId:newPA?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            if (createError) {
              console.error("❌ [DEBUG] Error creating participant assessment:", createError);
            } else if (newPA) {
              finalParticipantAssessmentId = newPA.id;
              setParticipantAssessmentId(newPA.id);
            }
          }

          // Create or get response session if we have participant_assessment_id
          if (finalParticipantAssessmentId && assessmentDefinitionId) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:222',message:'Creating/getting response session',data:{participantAssessmentId:finalParticipantAssessmentId,assessmentDefinitionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            const sessionId = await createOrGetResponseSession(
              finalParticipantAssessmentId,
              assessmentDefinitionId,
              "participant",
              undefined,
              undefined,
              userData.id
            );
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:232',message:'Session creation result',data:{sessionId,responseSessionIdState:responseSessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            console.log("🔵 [DEBUG] Session ID result:", sessionId);
          } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:237',message:'Cannot create session - missing requirements',data:{hasParticipantAssessment:!!finalParticipantAssessmentId,hasAssessmentDefinitionId:!!assessmentDefinitionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            console.warn("⚠️ [DEBUG] Cannot create session - missing participant_assessment or assessmentDefinitionId");
          }
              }
            } catch (error) {
              console.error("❌ [DEBUG] Error loading participant data:", error);
            }
          }
        } else {
          // Simulate: Always load from db.json
          await loadQuestionsFromJSON();
          
          // Still try to fetch participant_assessment_id for old plan (but won't create session)
          const storedUser = localStorage.getItem("participant");
          if (storedUser) {
            try {
              const userData = JSON.parse(storedUser);

              const { data: participants, error: participantsError } = await supabase
                .from("cohort_participants")
                .select("id")
                .eq("client_user_id", userData.id)
                .eq("cohort_id", cohortAssessment.cohort_id);

              if (!participantsError && participants && participants.length > 0) {
                const participantIds = participants.map((p: any) => p.id);

                const { data: participantAssessmentData, error: paError } = await supabase
                  .from("participant_assessments")
                  .select("*")
                  .eq("cohort_assessment_id", assessmentId)
                  .in("participant_id", participantIds)
                  .maybeSingle();

                if (!paError && participantAssessmentData) {
            setParticipantAssessmentId(participantAssessmentData.id);
                }
          }
        } catch (error) {
              console.error("Error loading participant data:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
        // Fallback to old plan
        await loadQuestionsFromJSON();
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [assessmentId, useDb]);

  useEffect(() => {
    // Organize questions by steps if we have steps and questions
    if (usesNewPlan && steps.length > 0 && questions.length > 0) {
      organizeQuestionsBySteps();
    } else if (usesNewPlan && steps.length > 0 && questions.length === 0) {
      // Pulse with steps but no questions yet - create empty groups for steps
      const groups: QuestionGroup[] = steps.map((step) => ({
        step,
        questions: [],
      }));
      setQuestionGroups(groups);
    } else if (usesNewPlan && steps.length === 0 && questions.length > 0) {
      // Questions but no steps - create ungrouped group
      setQuestionGroups([{
        step: null,
        questions: questions.sort((a, b) => (a.question_order || 0) - (b.question_order || 0)),
      }]);
    }
  }, [steps, questions, usesNewPlan]);

  // Resume from last question when session and questions are loaded
  useEffect(() => {
    const resumeFromLastQuestion = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:334',message:'resumeFromLastQuestion CHECK',data:{hasResumed,responseSessionId,usesNewPlan,questionsLength:questions.length,questionGroupsLength:questionGroups.length,assessmentType,willResume:!hasResumed&&!!responseSessionId&&usesNewPlan&&questions.length>0&&(assessmentType?.toLowerCase()==='pulse'?questionGroups.length>0:true)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      
      if (
        !hasResumed &&
        responseSessionId &&
        usesNewPlan &&
        questions.length > 0 &&
        (assessmentType?.toLowerCase() === "pulse" ? questionGroups.length > 0 : true)
      ) {
        console.log("🔵 [DEBUG] Determining resume position...");
        const resumePos = await determineResumePosition(
          responseSessionId,
          questions,
          questionGroups.length > 0 ? questionGroups : undefined
        );

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:349',message:'resumeFromLastQuestion RESULT',data:{questionIndex:resumePos.questionIndex,stepIndex:resumePos.stepIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        console.log("✅ [DEBUG] Resume position determined:", resumePos);
        setCurrent(resumePos.questionIndex);
        if (resumePos.stepIndex !== undefined) {
          setCurrentStep(resumePos.stepIndex);
        }
        setHasResumed(true);
      }
    };

    resumeFromLastQuestion();
  }, [responseSessionId, questions, questionGroups, usesNewPlan, assessmentType, hasResumed]);

  useEffect(() => {
    // Update currentStep when current question index changes (for Pulse)
    if (assessmentType && assessmentType.toLowerCase() === "pulse" && usesNewPlan && questionGroups.length > 0) {
      const allQuestions = questionGroups.flatMap(g => g.questions);
      let questionStartIndex = 0;
      let newStep = 0;
      
      for (let i = 0; i < questionGroups.length; i++) {
        const stepEndIndex = questionStartIndex + questionGroups[i].questions.length;
        if (current >= questionStartIndex && current < stepEndIndex) {
          newStep = i;
          break;
        }
        questionStartIndex = stepEndIndex;
      }
      
      if (newStep !== currentStep) {
        setCurrentStep(newStep);
      }
    }
  }, [current, questionGroups, assessmentType, usesNewPlan]);

  async function loadQuestionsFromDB(assessmentDefinitionId: string, assessmentTypeId: string, assessmentTypeName: string) {
    try {
      const isPulse = assessmentTypeName?.toLowerCase() === "pulse";

      // Fetch steps if Pulse
      if (isPulse) {
        const { data: stepsData, error: stepsError } = await supabase
          .from("assessment_steps_v2")
          .select("*")
          .eq("assessment_definition_id", assessmentDefinitionId)
          .order("step_order", { ascending: true });

        if (stepsError) {
          console.error("Error fetching steps:", stepsError);
        } else if (stepsData && stepsData.length > 0) {
          setSteps(stepsData);
        } else {
          console.warn("No steps found for Pulse assessment");
          // Still set empty array so we know it's Pulse but has no steps
          setSteps([]);
        }
      } else {
        // Not Pulse, ensure steps are empty
        setSteps([]);
      }

      // Fetch questions
      const { data: questionsData, error: questionsError } = await supabase
        .from("assessment_questions_v2")
        .select("*")
        .eq("assessment_definition_id", assessmentDefinitionId)
        .order("question_order", { ascending: true });

      if (questionsError) {
        console.error("Error fetching questions from DB:", questionsError);
        // Fallback to JSON
        await loadQuestionsFromJSON();
        return;
      }

      // Transform DB questions to match Question interface
      const transformedQuestions = questionsData?.map((q: any) => ({
        id: q.id,
        text: q.question_text,
        question_text: q.question_text,
        question_order: q.question_order,
        question_type: q.question_type,
        required: q.required,
        step_id: q.step_id,
      })) || [];

      setQuestions(transformedQuestions);
    } catch (error) {
      console.error("Error loading questions from DB:", error);
      // Fallback to JSON
      await loadQuestionsFromJSON();
    }
  }

  async function loadQuestionsFromJSON() {
    try {
      const res = await fetch("/db.json");
      const data = await res.json();
      const questionsData = data.assessment_questions_360 || [];
      setQuestions(questionsData);
      setUsesNewPlan(false);
    } catch (error) {
      console.error("Error loading questions from JSON:", error);
    }
  }

  function organizeQuestionsBySteps() {
    const groups: QuestionGroup[] = [];

    // Group questions by step_id
    steps.forEach((step) => {
      const stepQuestions = questions.filter((q) => q.step_id === step.id);
      if (stepQuestions.length > 0) {
        groups.push({
          step,
          questions: stepQuestions.sort((a, b) => (a.question_order || 0) - (b.question_order || 0)),
        });
      }
    });

    // Add ungrouped questions (questions without step_id)
    const ungroupedQuestions = questions.filter((q) => !q.step_id);
    if (ungroupedQuestions.length > 0) {
      groups.push({
        step: null,
        questions: ungroupedQuestions.sort((a, b) => (a.question_order || 0) - (b.question_order || 0)),
      });
    }

    setQuestionGroups(groups);
  }

  // Helper function to create or get response session
  async function createOrGetResponseSession(
    participantAssessmentId: string,
    assessmentDefinitionId: string,
    respondentType: "participant" | "reviewer",
    reviewerNominationId?: string,
    externalReviewerId?: string,
    clientUserId?: string
  ): Promise<string | null> {
    try {
      setLoadingSession(true);
      console.log("🔵 [CUSTOM PULSE] createOrGetResponseSession called with:", {
        participantAssessmentId,
        assessmentDefinitionId,
        respondentType,
        reviewerNominationId,
        externalReviewerId,
        clientUserId,
        assessmentId, // Add assessmentId for context
      });

      // Check if session already exists
      let query = supabase
        .from("assessment_response_sessions")
        .select("id")
        .eq("participant_assessment_id", participantAssessmentId)
        .eq("assessment_definition_id", assessmentDefinitionId)
        .eq("respondent_type", respondentType);

      if (reviewerNominationId) {
        query = query.eq("reviewer_nomination_id", reviewerNominationId);
      }

      const { data: existingSession, error: checkError } = await query.maybeSingle();

      console.log("🔵 [CUSTOM PULSE] Session check result:", { 
        existingSession, 
        checkError,
        assessmentDefinitionId,
        participantAssessmentId,
      });

      if (checkError && checkError.code !== "PGRST116") {
        console.error("❌ [DEBUG] Error checking for existing session:", checkError);
        return null;
      }

      if (existingSession) {
        console.log("✅ [DEBUG] Found existing session:", existingSession.id);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:517',message:'Setting responseSessionId from existing session',data:{sessionId:existingSession.id,status:existingSession.status,completionPercent:existingSession.completion_percent},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        setResponseSessionId(existingSession.id);
        // Load existing responses
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:523',message:'About to call loadExistingResponses',data:{sessionId:existingSession.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        await loadExistingResponses(existingSession.id);
        
        // Determine resume position after questions are loaded
        // This will be called after questions are set in state
        return existingSession.id;
      }

      // Create new session
      const sessionData: any = {
        participant_assessment_id: participantAssessmentId,
        assessment_definition_id: assessmentDefinitionId,
        respondent_type: respondentType,
        status: "in_progress",
        started_at: new Date().toISOString(),
        completion_percent: 0,
      };

      if (reviewerNominationId) {
        sessionData.reviewer_nomination_id = reviewerNominationId;
      }

      if (externalReviewerId) {
        sessionData.respondent_external_reviewer_id = externalReviewerId;
      }

      if (clientUserId) {
        sessionData.respondent_client_user_id = clientUserId;
      }

      console.log("🔵 [CUSTOM PULSE] Creating new session with data:", {
        ...sessionData,
        assessmentDefinitionId, // Explicitly log this
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:503',message:'About to insert session',data:{sessionData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      const { data: newSession, error: createError } = await supabase
        .from("assessment_response_sessions")
        .insert([sessionData])
        .select()
        .single();

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:510',message:'Session insert result',data:{success:!!newSession,error:createError?{message:createError.message,code:createError.code,details:createError.details,hint:createError.hint}:null,sessionId:newSession?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      if (createError) {
        console.error("❌ [DEBUG] Error creating response session:", createError);
        console.error("❌ [DEBUG] Error message:", createError.message);
        console.error("❌ [DEBUG] Error code:", createError.code);
        console.error("❌ [DEBUG] Error details:", createError.details);
        console.error("❌ [DEBUG] Error hint:", createError.hint);
        console.error("❌ [DEBUG] Full error object:", JSON.stringify(createError, Object.getOwnPropertyNames(createError)));
        console.error("❌ [DEBUG] Session data that failed:", JSON.stringify(sessionData, null, 2));
        return null;
      }

      if (newSession) {
        console.log("✅ [DEBUG] Created new session:", newSession.id);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:516',message:'Setting responseSessionId state',data:{sessionId:newSession.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        setResponseSessionId(newSession.id);
        return newSession.id;
      }

      console.warn("⚠️ [DEBUG] No session returned from create");
      return null;
    } catch (error) {
      console.error("❌ [DEBUG] Unexpected error creating/getting session:", error);
      return null;
    } finally {
      setLoadingSession(false);
    }
  }

  // Helper function to determine resume position
  async function determineResumePosition(
    sessionId: string,
    questions: Question[],
    questionGroups?: QuestionGroup[]
  ): Promise<{ questionIndex: number; stepIndex?: number }> {
    try {
      // Fetch session to get last_question_id and last_step_id
      const { data: session, error: sessionError } = await supabase
        .from("assessment_response_sessions")
        .select("last_question_id, last_step_id, status")
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        console.log("🔵 [DEBUG] No session data found, starting from beginning");
        return { questionIndex: 0, stepIndex: 0 };
      }

      // Only resume if session is in_progress
      if (session.status !== "in_progress") {
        console.log("🔵 [DEBUG] Session not in progress, starting from beginning");
        return { questionIndex: 0, stepIndex: 0 };
      }

      // Fetch all responses for this session with joined question data
      const { data: responses, error: responsesError } = await supabase
        .from("assessment_responses")
        .select(`
          question_id,
          is_answered,
          question:assessment_questions_v2 (
            id,
            step_id,
            question_order
          )
        `)
        .eq("session_id", sessionId);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:639',message:'determineResumePosition fetched responses',data:{sessionId,responseCount:responses?.length||0,responses:responses?.map((r:any)=>({qId:r.question_id,answered:r.is_answered,stepId:r.question?.step_id})),error:responsesError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion

      if (responsesError) {
        console.error("Error fetching responses for resume:", responsesError);
        return { questionIndex: 0, stepIndex: 0 };
      }

      type AssessmentResponseRow = {
        question_id: string | number;
        is_answered: boolean;
        question?: {
          id: string;
          step_id: string | null;
          question_order: number | null;
        } | null;
      };

      // Build answered ids per step
      const answeredByStep = new Map<string, Set<string>>();
      const answeredQuestionIds = new Set<string>();

      ((responses ?? []) as AssessmentResponseRow[]).forEach((r) => {
        if (r.is_answered) {
          const questionId = String(r.question_id);
          answeredQuestionIds.add(questionId);
          
          // Organize by step
          const stepId = r.question?.step_id ?? "__no_step__";
          if (!answeredByStep.has(stepId)) {
            answeredByStep.set(stepId, new Set());
          }
          answeredByStep.get(stepId)!.add(questionId);
        }
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:658',message:'determineResumePosition answeredQuestionIds',data:{answeredCount:answeredQuestionIds.size,answeredIds:Array.from(answeredQuestionIds),answeredByStep:Object.fromEntries(Array.from(answeredByStep.entries()).map(([stepId,qIds])=>[stepId,Array.from(qIds)]))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion

      // If we have last_question_id, try to resume from there
      if (session.last_question_id) {
        let questionIndex = -1;
        let stepIndex = 0;

        if (questionGroups && questionGroups.length > 0) {
          // Pulse assessment with steps
          const allQuestions = questionGroups.flatMap((g) => g.questions);
          questionIndex = allQuestions.findIndex((q) => q.id === session.last_question_id);

          if (questionIndex >= 0) {
            // Find which step this question belongs to
            let currentIndex = 0;
            for (let i = 0; i < questionGroups.length; i++) {
              const stepEndIndex = currentIndex + questionGroups[i].questions.length;
              if (questionIndex >= currentIndex && questionIndex < stepEndIndex) {
                stepIndex = i;
                break;
              }
              currentIndex = stepEndIndex;
            }

            console.log("✅ [DEBUG] Resuming from last_question_id:", {
              questionId: session.last_question_id,
              questionIndex,
              stepIndex,
            });
            return { questionIndex, stepIndex };
          }
        } else {
          // 360 assessment without steps
          questionIndex = questions.findIndex((q) => q.id === session.last_question_id);

          if (questionIndex >= 0) {
            console.log("✅ [DEBUG] Resuming from last_question_id:", {
              questionId: session.last_question_id,
              questionIndex,
            });
            return { questionIndex };
          }
        }

        // last_question_id exists but question not found (maybe deleted/changed)
        console.log("⚠️ [DEBUG] last_question_id not found in questions, finding first unanswered");
      }

      // Find first unanswered question
      if (questionGroups && questionGroups.length > 0) {
        // Pulse assessment with steps
        const allQuestions = questionGroups.flatMap((g) => g.questions);
        for (let i = 0; i < allQuestions.length; i++) {
          if (!answeredQuestionIds.has(String(allQuestions[i].id))) {
            // Find which step this question belongs to
            let currentIndex = 0;
            let stepIndex = 0;
            for (let j = 0; j < questionGroups.length; j++) {
              const stepEndIndex = currentIndex + questionGroups[j].questions.length;
              if (i >= currentIndex && i < stepEndIndex) {
                stepIndex = j;
                break;
              }
              currentIndex = stepEndIndex;
            }

            console.log("✅ [DEBUG] Resuming at first unanswered question:", {
              questionIndex: i,
              stepIndex,
            });
            return { questionIndex: i, stepIndex };
          }
        }

        // All answered, return last question
        const lastIndex = allQuestions.length - 1;
        let stepIndex = 0;
        let currentIndex = 0;
        for (let j = 0; j < questionGroups.length; j++) {
          const stepEndIndex = currentIndex + questionGroups[j].questions.length;
          if (lastIndex >= currentIndex && lastIndex < stepEndIndex) {
            stepIndex = j;
            break;
          }
          currentIndex = stepEndIndex;
        }

        console.log("✅ [DEBUG] All questions answered, resuming at last question:", {
          questionIndex: lastIndex,
          stepIndex,
        });
        return { questionIndex: lastIndex, stepIndex };
      } else {
        // 360 assessment without steps
        for (let i = 0; i < questions.length; i++) {
          if (!answeredQuestionIds.has(String(questions[i].id))) {
            console.log("✅ [DEBUG] Resuming at first unanswered question:", { questionIndex: i });
            return { questionIndex: i };
          }
        }

        // All answered, return last question
        const lastIndex = questions.length - 1;
        console.log("✅ [DEBUG] All questions answered, resuming at last question:", {
          questionIndex: lastIndex,
        });
        return { questionIndex: lastIndex };
      }
    } catch (error) {
      console.error("❌ [DEBUG] Error determining resume position:", error);
      return { questionIndex: 0, stepIndex: 0 };
    }
  }

  // Helper function to load existing responses
  async function loadExistingResponses(sessionId: string) {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:765',message:'loadExistingResponses ENTRY',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      type ResponseRow = {
        id: string;
        question_id: string | number;
        answer_text: string | null;
        is_answered: boolean;
        question?: {
          id: string;
          step_id: string | null;
          question_order: number | null;
        } | null;
      };

      const { data: responses, error } = await supabase
        .from("assessment_responses")
        .select(`
          id,
          session_id,
          question_id,
          answer_text,
          is_answered,
          created_at,
          updated_at,
          question:assessment_questions_v2 (
            id,
            step_id,
            question_order
          )
        `)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      console.log("🔍 [DEBUG] All responses for assessment (360/Pulse):", {
        sessionId,
        assessmentType,
        totalResponses: responses?.length || 0,
        answeredResponses: responses?.filter((r: any) => r.is_answered).length || 0,
        responses: responses?.map((r: any) => ({
          questionId: r.question_id,
          hasAnswer: !!r.answer_text,
          isAnswered: r.is_answered,
          answerPreview: r.answer_text ? r.answer_text.substring(0, 50) : null,
        })),
      });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:772',message:'loadExistingResponses QUERY RESULT',data:{sessionId,responseCount:responses?.length||0,responses:responses?.map((r:any)=>({qId:r.question_id,hasText:!!r.answer_text,isAnswered:r.is_answered})),error:error?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:777',message:'loadExistingResponses ERROR',data:{sessionId,error:error.message,code:error.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        console.error("Error loading existing responses:", error);
        return;
      }

      if (responses && responses.length > 0) {
        const existingAnswers: Record<string | number, string> = {};
        const answeredByStep = new Map<string, Set<string>>();
        
        (responses as ResponseRow[]).forEach((response) => {
          // Only load answered responses with text
          if (response.is_answered && response.answer_text) {
            existingAnswers[response.question_id] = response.answer_text;
            
            // Build answered ids per step
            const stepId = response.question?.step_id ?? "__no_step__";
            if (!answeredByStep.has(stepId)) {
              answeredByStep.set(stepId, new Set());
            }
            answeredByStep.get(stepId)!.add(String(response.question_id));
          }
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:825',message:'loadExistingResponses LOADED ANSWERS',data:{sessionId,loadedCount:Object.keys(existingAnswers).length,loadedQuestionIds:Object.keys(existingAnswers),answeredByStep:Object.fromEntries(Array.from(answeredByStep.entries()).map(([stepId, qIds])=>[stepId,Array.from(qIds)]))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        setAnswers((prev) => ({ ...prev, ...existingAnswers }));
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:791',message:'loadExistingResponses NO RESPONSES',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:792',message:'loadExistingResponses EXCEPTION',data:{sessionId,error:error instanceof Error?error.message:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error("Unexpected error loading responses:", error);
    }
  }

  // Helper function to save question response
  async function saveQuestionResponse(
    sessionId: string,
    questionId: string,
    answerText: string | null
  ): Promise<void> {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:789',message:'saveQuestionResponse ENTRY',data:{sessionId,questionId,answerText:answerText?answerText.substring(0,100):null,answerLength:answerText?.length||0,isEmpty:!answerText||answerText.trim()===''},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.log("💾 [DEBUG] saveQuestionResponse called:", {
        sessionId,
        questionId,
        answerText: answerText ? `${answerText.substring(0, 50)}...` : null,
        answerLength: answerText?.length || 0,
      });

      if (!sessionId) {
        console.error("❌ [DEBUG] No sessionId provided!");
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:802',message:'saveQuestionResponse EARLY RETURN - no sessionId',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return;
      }

      if (!questionId) {
        console.error("❌ [DEBUG] No questionId provided!");
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:807',message:'saveQuestionResponse EARLY RETURN - no questionId',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return;
      }

      if (!answerText || answerText.trim() === "") {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:812',message:'saveQuestionResponse EMPTY ANSWER - returning early',data:{questionId,hasExistingResponse:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.log("ℹ️ [DEBUG] Empty answer, checking for existing response to mark as not answered");
        // Don't save empty answers, but mark as not answered if exists
        const { data: existingResponse, error: checkError } = await supabase
          .from("assessment_responses")
          .select("id")
          .eq("session_id", sessionId)
          .eq("question_id", questionId)
          .maybeSingle();

        console.log("🔵 [DEBUG] Empty answer check:", { existingResponse, checkError });

        if (existingResponse) {
          const { error: updateError } = await supabase
            .from("assessment_responses")
            .update({
              answer_text: null,
              is_answered: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingResponse.id);

          if (updateError) {
            console.error("❌ [DEBUG] Error updating empty response:", updateError);
          } else {
            console.log("✅ [DEBUG] Marked existing response as not answered");
          }
        }
        return;
      }

      // Use upsert to handle insert/update in one operation
      // This assumes unique constraint on (session_id, question_id) exists
      console.log("💾 [DEBUG] Upserting response");
      const upsertData = {
        session_id: sessionId,
        question_id: questionId,
        answer_text: answerText,
        is_answered: true,
        updated_at: new Date().toISOString(),
      };
      console.log("🔵 [DEBUG] Upsert data:", upsertData);

      const { data: upsertedData, error: upsertError } = await supabase
        .from("assessment_responses")
        .upsert(upsertData, {
          onConflict: "session_id,question_id",
        })
        .select();

      if (upsertError) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:971',message:'saveQuestionResponse UPSERT ERROR',data:{questionId,error:upsertError.message,code:upsertError.code,details:upsertError.details},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.error("❌ [DEBUG] Error upserting response:", upsertError);
        console.error("❌ [DEBUG] Upsert error details:", JSON.stringify(upsertError, null, 2));
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:976',message:'saveQuestionResponse UPSERT SUCCESS',data:{questionId,responseId:upsertedData?.[0]?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.log("✅ [DEBUG] Successfully upserted response:", upsertedData);
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:893',message:'saveQuestionResponse EXCEPTION',data:{questionId,error:error instanceof Error?error.message:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error("❌ [DEBUG] Unexpected error saving response:", error);
    }
  }

  // Helper function to update session progress
  async function updateSessionProgress(
    sessionId: string,
    lastQuestionId: string,
    lastStepId?: string | null,
    totalQuestions?: number,
    answeredCount?: number
  ): Promise<void> {
    try {
      const updateData: any = {
        last_question_id: lastQuestionId,
        updated_at: new Date().toISOString(),
      };

      if (lastStepId !== undefined) {
        updateData.last_step_id = lastStepId;
      }

      if (totalQuestions !== undefined && answeredCount !== undefined) {
        updateData.completion_percent = Math.round((answeredCount / totalQuestions) * 100);
      }

      const { error } = await supabase
        .from("assessment_response_sessions")
        .update(updateData)
        .eq("id", sessionId);

      if (error) {
        console.error("Error updating session progress:", error);
      }
    } catch (error) {
      console.error("Unexpected error updating session progress:", error);
    }
  }

  const handleAnswerChange = (questionId: number | string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleNext = async () => {
    console.log("➡️ [DEBUG] handleNext called");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:873',message:'handleNext called',data:{responseSessionId,usesNewPlan,assessmentDefinitionId,current,currentStep,answersCount:Object.keys(answers).length,assessmentType,questionGroupsLength:questionGroups.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Save current question response before navigating
    if (responseSessionId && usesNewPlan && assessmentDefinitionId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:886',message:'Conditions met for saving',data:{responseSessionId,usesNewPlan,assessmentDefinitionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      console.log("✅ [DEBUG] Conditions met for saving response");
      let currentQuestion: Question;
      let currentStepId: string | null = null;

      if (assessmentType && assessmentType.toLowerCase() === "pulse" && questionGroups.length > 0) {
        const allQuestions = questionGroups.flatMap(g => g.questions);
        currentQuestion = allQuestions[current];
        const currentGroup = questionGroups[currentStep];
        if (currentGroup.step) {
          currentStepId = currentGroup.step.id;
        }
        console.log("🔵 [DEBUG] Pulse assessment - current question:", {
          questionId: currentQuestion?.id,
          questionText: currentQuestion?.text?.substring(0, 50),
          stepId: currentStepId,
        });
      } else {
        currentQuestion = questions[current];
        console.log("🔵 [DEBUG] 360 assessment - current question:", {
          questionId: currentQuestion?.id,
          questionText: currentQuestion?.text?.substring(0, 50),
        });
      }

      if (currentQuestion && typeof currentQuestion.id === "string") {
        const answerText = answers[currentQuestion.id] || null;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:975',message:'handleNext BEFORE saveQuestionResponse',data:{questionId:currentQuestion.id,answerText:answerText?answerText.substring(0,100):null,answerInState:!!answers[currentQuestion.id],allAnswerKeys:Object.keys(answers)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.log("💾 [DEBUG] About to save response:", {
          questionId: currentQuestion.id,
          answerText: answerText ? `${answerText.substring(0, 50)}...` : null,
        });
        await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

        // Calculate progress - use database counts for accuracy
        // Check if assessment has steps
        const { data: stepsCheck, error: stepsCheckError } = await supabase
          .from("assessment_steps_v2")
          .select("id")
          .eq("assessment_definition_id", assessmentDefinitionId)
          .limit(1);

        const hasSteps = !stepsCheckError && stepsCheck && stepsCheck.length > 0;
        let answeredCount = 0;
        let totalQuestions = 0;

        if (hasSteps) {
          // Pulse assessment with steps - count questions per step
          const { data: stepsData, error: stepsError } = await supabase
            .from("assessment_steps_v2")
            .select("id")
            .eq("assessment_definition_id", assessmentDefinitionId)
            .order("step_order", { ascending: true });

          if (!stepsError && stepsData) {
            // Count total questions across all steps
            for (const step of stepsData) {
              const { count: stepQuestionCount, error: stepQError } = await supabase
                .from("assessment_questions_v2")
                .select("*", { count: "exact", head: true })
                .eq("assessment_definition_id", assessmentDefinitionId)
                .eq("step_id", step.id);

              if (!stepQError) {
                totalQuestions += stepQuestionCount || 0;
              }
            }
          }

          // Count answered questions
          const { count: dbAnsweredCount, error: dbCountError } = await supabase
            .from("assessment_responses")
            .select("*", { count: "exact", head: true })
            .eq("session_id", responseSessionId)
            .eq("is_answered", true);

          answeredCount = dbAnsweredCount || 0;
        } else {
          // 360 assessment without steps - use simple count
          const { count: dbAnsweredCount, error: dbCountError } = await supabase
            .from("assessment_responses")
            .select("*", { count: "exact", head: true })
            .eq("session_id", responseSessionId)
            .eq("is_answered", true);

          const { count: dbTotalQuestions, error: dbTotalError } = await supabase
            .from("assessment_questions_v2")
            .select("*", { count: "exact", head: true })
            .eq("assessment_definition_id", assessmentDefinitionId);

          answeredCount = dbAnsweredCount || 0;
          totalQuestions = dbTotalQuestions || 0;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:1076',message:'handleNext progress calculation',data:{hasSteps,answeredCount,totalQuestions,currentQuestionId:currentQuestion.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion

        await updateSessionProgress(
          responseSessionId,
          currentQuestion.id,
          currentStepId,
          totalQuestions,
          answeredCount
        );

        // Update participant assessment status if this is the first answer
        if (answeredCount === 1 && participantAssessmentId) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:1003',message:'handleNext updating status to In Progress',data:{answeredCount,participantAssessmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          const { error: statusError } = await supabase
            .from("participant_assessments")
            .update({ status: "In Progress" })
            .eq("id", participantAssessmentId);

          if (statusError) {
            console.error("Error updating status to In Progress:", statusError);
          }
        }
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:950',message:'Conditions NOT met for saving',data:{responseSessionId,usesNewPlan,assessmentDefinitionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
    }

    // Navigate to next question
    if (assessmentType && assessmentType.toLowerCase() === "pulse" && usesNewPlan && questionGroups.length > 0) {
      // Pulse with steps - navigate to next question in current step or next step
      const allQuestions = questionGroups.flatMap(g => g.questions);
      
      // Safety check: ensure current index is valid
      if (current < 0 || current >= allQuestions.length) {
        console.error("Invalid current index for pulse assessment:", current);
        await handleCompleteAssessment();
        return;
      }
      
      const currentQuestion = allQuestions[current];
      
      // Safety check: ensure currentStep is valid
      if (currentStep < 0 || currentStep >= questionGroups.length) {
        console.error("Invalid currentStep for pulse assessment:", currentStep);
        await handleCompleteAssessment();
        return;
      }
      
      const currentGroup = questionGroups[currentStep];
      const questionIndexInStep = currentGroup.questions.indexOf(currentQuestion);
      
      if (questionIndexInStep < currentGroup.questions.length - 1) {
        // Next question in same step
        setCurrent(current + 1);
      } else if (currentStep < questionGroups.length - 1) {
        // Move to next step - ensure current question is saved before navigating
        // This is critical: save the last question of the current step
        if (currentQuestion && typeof currentQuestion.id === "string" && responseSessionId && assessmentDefinitionId) {
          const answerText = answers[currentQuestion.id] || null;
          const currentStepId = currentGroup.step?.id || null;
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:1050',message:'handleNext moving to next step - BEFORE save',data:{questionId:currentQuestion.id,stepId:currentStepId,answerText:answerText?answerText.substring(0,100):null,answerInState:!!answers[currentQuestion.id],currentStep,questionIndexInStep,questionsInStep:currentGroup.questions.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          console.log("💾 [DEBUG] Saving last question of step before moving to next step:", {
            questionId: currentQuestion.id,
            stepId: currentStepId,
            answerText: answerText ? `${answerText.substring(0, 50)}...` : null,
          });
          
          await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);
          
          // Update progress - use database counts for accuracy
          // Check if assessment has steps
          const { data: stepsCheck, error: stepsCheckError } = await supabase
            .from("assessment_steps_v2")
            .select("id")
            .eq("assessment_definition_id", assessmentDefinitionId)
            .limit(1);

          const hasSteps = !stepsCheckError && stepsCheck && stepsCheck.length > 0;
          let answeredCount = 0;
          let totalQuestions = 0;

          if (hasSteps) {
            // Pulse assessment with steps - count questions per step
            const { data: stepsData, error: stepsError } = await supabase
              .from("assessment_steps_v2")
              .select("id")
              .eq("assessment_definition_id", assessmentDefinitionId)
              .order("step_order", { ascending: true });

            if (!stepsError && stepsData) {
              // Count total questions across all steps
              for (const step of stepsData) {
                const { count: stepQuestionCount, error: stepQError } = await supabase
                  .from("assessment_questions_v2")
                  .select("*", { count: "exact", head: true })
                  .eq("assessment_definition_id", assessmentDefinitionId)
                  .eq("step_id", step.id);

                if (!stepQError) {
                  totalQuestions += stepQuestionCount || 0;
                }
              }
            }

            // Count answered questions
            const { count: dbAnsweredCount, error: dbCountError } = await supabase
              .from("assessment_responses")
              .select("*", { count: "exact", head: true })
              .eq("session_id", responseSessionId)
              .eq("is_answered", true);

            answeredCount = dbAnsweredCount || 0;
          } else {
            // 360 assessment without steps - use simple count
            const { count: dbAnsweredCount, error: dbCountError } = await supabase
              .from("assessment_responses")
              .select("*", { count: "exact", head: true })
              .eq("session_id", responseSessionId)
              .eq("is_answered", true);

            const { count: dbTotalQuestions, error: dbTotalError } = await supabase
              .from("assessment_questions_v2")
              .select("*", { count: "exact", head: true })
              .eq("assessment_definition_id", assessmentDefinitionId);

            answeredCount = dbAnsweredCount || 0;
            totalQuestions = dbTotalQuestions || 0;
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/ca92d4d9-564c-4650-95a1-d06408ad98ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'questionnaire/page.tsx:1200',message:'handleNext next step progress calculation',data:{hasSteps,answeredCount,totalQuestions,currentQuestionId:currentQuestion.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          await updateSessionProgress(
            responseSessionId,
            currentQuestion.id,
            currentStepId,
            totalQuestions,
            answeredCount
          );
        }
        
        // Move to next step, first question
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        // Calculate global index for first question of next step
        let nextQuestionIndex = 0;
        for (let i = 0; i < nextStep; i++) {
          nextQuestionIndex += questionGroups[i].questions.length;
        }
        setCurrent(nextQuestionIndex);
      } else {
        // Last question - complete
        await handleCompleteAssessment();
      }
    } else {
      // 360 or old plan - simple sequential navigation
    if (current < questions.length - 1) {
      setCurrent(current + 1);
    } else {
      await handleCompleteAssessment();
      }
    }
  };

  const handlePrevious = () => {
    if (assessmentType && assessmentType.toLowerCase() === "pulse" && usesNewPlan && questionGroups.length > 0) {
      // Pulse with steps - navigate to previous question or previous step
      if (current > 0) {
        const allQuestions = questionGroups.flatMap(g => g.questions);
        const currentQuestion = allQuestions[current];
        const currentGroup = questionGroups[currentStep];
        const questionIndexInStep = currentGroup.questions.indexOf(currentQuestion);
        
        if (questionIndexInStep === 0 && currentStep > 0) {
          // Move to previous step, last question
          const prevStep = currentStep - 1;
          setCurrentStep(prevStep);
          // Calculate global index for last question of previous step
          let prevQuestionIndex = 0;
          for (let i = 0; i < prevStep; i++) {
            prevQuestionIndex += questionGroups[i].questions.length;
          }
          prevQuestionIndex += questionGroups[prevStep].questions.length - 1;
          setCurrent(prevQuestionIndex);
        } else {
          // Previous question in same step
          setCurrent(current - 1);
        }
      }
    } else {
      // 360 or old plan - simple sequential navigation
      if (current > 0) {
        setCurrent(current - 1);
      }
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (assessmentType && assessmentType.toLowerCase() === "pulse" && usesNewPlan && questionGroups.length > 0) {
      setCurrentStep(stepIndex);
      // Calculate question index for first question of this step
      let questionIndex = 0;
      for (let i = 0; i < stepIndex; i++) {
        questionIndex += questionGroups[i].questions.length;
      }
      setCurrent(questionIndex);
    }
  };

  const handleCompleteAssessment = async () => {
    if (!participantAssessmentId) {
      alert("Error: Could not find assessment. Please try again.");
      return;
    }

    setCompleting(true);
    try {
      // Save final question response if using new plan
      if (responseSessionId && usesNewPlan && assessmentDefinitionId) {
        let currentQuestion: Question | undefined;
        let currentStepId: string | null = null;

        if (assessmentType && assessmentType.toLowerCase() === "pulse" && questionGroups.length > 0) {
          const allQuestions = questionGroups.flatMap(g => g.questions);
          // Add safety check for current index
          if (current >= 0 && current < allQuestions.length) {
            currentQuestion = allQuestions[current];
            // Add safety check for currentStep
            if (currentStep >= 0 && currentStep < questionGroups.length) {
              const currentGroup = questionGroups[currentStep];
              if (currentGroup?.step) {
                currentStepId = currentGroup.step.id;
              }
            }
          }
        } else {
          // Add safety check for 360 assessments too
          if (current >= 0 && current < questions.length) {
            currentQuestion = questions[current];
          }
        }

        if (currentQuestion && typeof currentQuestion.id === "string") {
          const answerText = answers[currentQuestion.id] || null;
          await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

          // Update session to completed
          // Count answered questions from database for accuracy
          // Check if assessment has steps
          const { data: stepsCheck, error: stepsCheckError } = await supabase
            .from("assessment_steps_v2")
            .select("id")
            .eq("assessment_definition_id", assessmentDefinitionId)
            .limit(1);

          const hasSteps = !stepsCheckError && stepsCheck && stepsCheck.length > 0;
          let answered = 0;
          let total = 0;

          if (hasSteps) {
            // Pulse assessment with steps - count questions per step
            const { data: stepsData, error: stepsError } = await supabase
              .from("assessment_steps_v2")
              .select("id")
              .eq("assessment_definition_id", assessmentDefinitionId)
              .order("step_order", { ascending: true });

            if (!stepsError && stepsData) {
              // Count total questions across all steps
              for (const step of stepsData) {
                const { count: stepQuestionCount, error: stepQError } = await supabase
                  .from("assessment_questions_v2")
                  .select("*", { count: "exact", head: true })
                  .eq("assessment_definition_id", assessmentDefinitionId)
                  .eq("step_id", step.id);

                if (!stepQError) {
                  total += stepQuestionCount || 0;
                }
              }
            }

            // Count answered questions
            const { count: answeredCount, error: countError } = await supabase
              .from("assessment_responses")
              .select("*", { count: "exact", head: true })
              .eq("session_id", responseSessionId)
              .eq("is_answered", true);

            answered = answeredCount || 0;
          } else {
            // 360 assessment without steps - use simple count
            const { count: answeredCount, error: countError } = await supabase
              .from("assessment_responses")
              .select("*", { count: "exact", head: true })
              .eq("session_id", responseSessionId)
              .eq("is_answered", true);

            const { count: totalQuestions, error: totalError } = await supabase
              .from("assessment_questions_v2")
              .select("*", { count: "exact", head: true })
              .eq("assessment_definition_id", assessmentDefinitionId);

            answered = answeredCount || 0;
            total = totalQuestions || 0;
          }

          // Ensure completion_percent is 100% when status is Completed
          const completionPercent = 100;

          await supabase
            .from("assessment_response_sessions")
            .update({
              status: "completed",
              submitted_at: new Date().toISOString(),
              last_question_id: currentQuestion.id,
              last_step_id: currentStepId,
              completion_percent: completionPercent,
              updated_at: new Date().toISOString(),
            })
            .eq("id", responseSessionId);
        } else {
          // If currentQuestion is undefined, still mark session as completed
          // This can happen if we're completing from an invalid state
          console.warn("⚠️ [DEBUG] Completing assessment without currentQuestion, updating session status only");
          
          // Count answered questions from database for accuracy
          const { count: answeredCount, error: countError } = await supabase
            .from("assessment_responses")
            .select("*", { count: "exact", head: true })
            .eq("session_id", responseSessionId)
            .eq("is_answered", true);

          // Get total questions count from database
          const { count: totalQuestions, error: totalError } = await supabase
            .from("assessment_questions_v2")
            .select("*", { count: "exact", head: true })
            .eq("assessment_definition_id", assessmentDefinitionId);

          // Ensure completion_percent is 100% when status is Completed
          const completionPercent = 100;

          await supabase
            .from("assessment_response_sessions")
            .update({
              status: "completed",
              submitted_at: new Date().toISOString(),
              completion_percent: completionPercent,
              updated_at: new Date().toISOString(),
            })
            .eq("id", responseSessionId);
        }
      }

      // Update participant assessment status
      const { error: updateError } = await supabase
        .from("participant_assessments")
        .update({ status: "Completed" })
        .eq("id", participantAssessmentId);

      if (updateError) {
        console.error("Error completing assessment:", updateError);
        alert(`Error: ${updateError.message}`);
        setCompleting(false);
        return;
      }

      // Create PDF report for pulse assessments
      const isPulse = assessmentType && assessmentType.toLowerCase() === "pulse";
      if (isPulse && participantAssessmentId) {
        try {
          const response = await fetch("/api/reports/pulse/regenerate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              participant_assessment_id: participantAssessmentId,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Error creating PDF report:", errorData.error || "Unknown error");
            // Don't block completion if report creation fails
          }
        } catch (err) {
          console.error("Error creating PDF report:", err);
          // Don't block completion if report creation fails
        }
      }

      // Redirect to assessment overview
      router.push(`/tenant/${subdomain}/assessments/${assessmentId}`);
    } catch (err) {
      console.error("Error completing assessment:", err);
      alert("An unexpected error occurred. Please try again.");
    } finally {
      setCompleting(false);
    }
  };

  const handleSkipToLast = () => {
    if (assessmentType && assessmentType.toLowerCase() === "pulse" && usesNewPlan && questionGroups.length > 0) {
      // Go to last step, last question
      const lastStepIndex = questionGroups.length - 1;
      setCurrentStep(lastStepIndex);
      const totalQuestions = questionGroups.reduce((sum, g) => sum + g.questions.length, 0);
      setCurrent(totalQuestions - 1);
    } else {
    setCurrent(questions.length - 1);
    }
  };

  if (loading) return <p>Loading questions...</p>;
  if (!questions.length) return <p>No questions found.</p>;

  // Check if it's Pulse assessment - assessmentType should be the name, not ID
  const isPulse = assessmentType && assessmentType.toLowerCase() === "pulse" && usesNewPlan && questionGroups.length > 0;
  
  // Get current question based on assessment type
  let currentQuestion: Question;
  let totalQuestions: number;
  let progress: number;
  let isLastStep: boolean;

  if (isPulse && questionGroups.length > 0) {
    // Pulse with steps
    const allQuestions = questionGroups.flatMap(g => g.questions);
    totalQuestions = allQuestions.length;
    currentQuestion = allQuestions[current] || questions[0];
    progress = ((current + 1) / totalQuestions) * 100;
    isLastStep = current >= totalQuestions - 1;
  } else {
    // 360 or old plan - sequential
    currentQuestion = questions[current];
    totalQuestions = questions.length;
    progress = ((current + 1) / totalQuestions) * 100;
    isLastStep = current === questions.length - 1;
  }

  // Render Pulse assessment with stepper
  if (isPulse && questionGroups.length > 0) {
    const allQuestions = questionGroups.flatMap(g => g.questions);
    const currentQuestion = allQuestions[current];
    const currentGroup = questionGroups[currentStep];
    
    // Find which question in the current step we're on
    let questionIndexInStep = 0;
    let questionStartIndex = 0;
    for (let i = 0; i < currentStep; i++) {
      questionStartIndex += questionGroups[i].questions.length;
    }
    questionIndexInStep = current - questionStartIndex;
    
    const isFirstInStep = questionIndexInStep === 0;
    const isLastInStep = questionIndexInStep === currentGroup.questions.length - 1;
    const isFirstStep = currentStep === 0;
    const isLastStepOverall = currentStep === questionGroups.length - 1 && isLastInStep;

    const stepperSteps: StepperStep[] = questionGroups.map((group, index) => {
      const isActive = index === currentStep;
      const isCompleted = index < currentStep;
      const isPending = index > currentStep;

      // Determine step title
      let stepTitle = "";
      if (group.step) {
        const stepTitleText = group.step.title || "";
        // Avoid duplication if title already contains step number
        const stepPattern = new RegExp(`^Step\\s+${group.step.step_order}`, "i");
        if (stepTitleText && stepPattern.test(stepTitleText.trim())) {
          stepTitle = stepTitleText;
        } else if (stepTitleText) {
          stepTitle = `Step ${group.step.step_order}: ${stepTitleText}`;
        } else {
          stepTitle = `Step ${group.step.step_order}`;
        }
      } else {
        stepTitle = "General Questions";
      }

      return {
        title: stepTitle,
        status: isCompleted ? "completed" : isActive ? "active" : "pending",
        content: isActive ? (
          <div className="space-y-4">
            <div className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Q{currentQuestion.question_order || questionIndexInStep + 1}
                </span>
                {currentQuestion.required && (
                  <span className="text-xs font-medium text-destructive">Required</span>
                )}
                {currentQuestion.question_type && (
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {currentQuestion.question_type}
                  </span>
                )}
              </div>
              <p className="text-lg font-medium">{currentQuestion.text || currentQuestion.question_text}</p>
              
              <div className="border-t my-4" />
              
              <div className="space-y-2">
                <label htmlFor={`answer-${currentQuestion.id}`} className="text-sm font-medium">
                  Your response {currentQuestion.required ? "" : "(optional)"}
                </label>
                <MicTextarea
                  value={answers[currentQuestion.id] || ""}
                  onChange={(next) => handleAnswerChange(currentQuestion.id, next)}
                  placeholder="Type your answer… or hold the mic to speak"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-4 pt-4">
              <div className="flex items-center gap-4">
                <p className="text-muted-foreground text-sm">
                  Question {questionIndexInStep + 1} of {currentGroup.questions.length} in this step
                </p>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-xs">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${((questionIndexInStep + 1) / currentGroup.questions.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {!isFirstInStep && (
                  <Button onClick={handlePrevious} variant="outline" disabled={completing}>
                    Previous
                  </Button>
                )}
                {isLastInStep && !isLastStepOverall && (
                  <Button onClick={handleNext} variant="outline" disabled={completing}>
                    Save & Next Step
                  </Button>
                )}
                {!isLastInStep && (
                  <Button onClick={handleNext} disabled={completing}>
                    Next Question
                  </Button>
                )}
                {isLastStepOverall && (
                  <Button onClick={handleCompleteAssessment} disabled={completing}>
                    {completing ? "Completing..." : "Complete Assessment"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : undefined,
      };
    });

    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Pulse Assessment</h1>
        <div className="flex items-center gap-4 mb-6">
          <p className="text-muted-foreground whitespace-nowrap">
            Question {current + 1} of {totalQuestions}
          </p>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <Stepper steps={stepperSteps} />
      </div>
    );
  }

  // Render 360 assessment (existing UI)
  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">360 Assessment</h1>
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground whitespace-nowrap">
          Question {current + 1} of {totalQuestions}
        </p>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="border rounded-lg p-6 space-y-4">
        <p className="text-lg font-medium">{currentQuestion.text || currentQuestion.question_text}</p>
        
        <div className="border-t my-4" />
        
        <div className="space-y-2">
          <label htmlFor={`answer-${currentQuestion.id}`} className="text-sm font-medium">
            Your response (optional)
          </label>
          <MicTextarea
            value={answers[currentQuestion.id] || ""}
            onChange={(next) => handleAnswerChange(currentQuestion.id, next)}
            placeholder="Type your answer… or hold the mic to speak"
          />
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {current > 0 && (
            <Button onClick={handlePrevious} variant="outline" disabled={completing}>
              Previous
            </Button>
          )}
        <Button onClick={handleNext} disabled={completing}>
          {completing ? "Completing..." : isLastStep ? "Complete Assessment" : "Next"}
        </Button>
        </div>
        {!isLastStep && (
          <Button onClick={handleSkipToLast} variant="tertiary">
            Skip to last step
          </Button>
        )}
      </div>
    </div>
  );
}