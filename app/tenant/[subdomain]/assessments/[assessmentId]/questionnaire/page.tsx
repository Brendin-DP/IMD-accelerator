"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Stepper, StepperStep } from "@/components/ui/stepper";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";

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
          const { data: participantAssessmentData, error: paError } = await supabase
            .from("participant_assessments")
            .select("*")
            .eq("cohort_assessment_id", assessmentId)
            .in("participant_id", participantIds)
            .maybeSingle();

                if (!paError && participantAssessmentData) {
                  setParticipantAssessmentId(participantAssessmentData.id);
                  
                  // Create or get response session - use local variable, not state
                  console.log("🔵 [DEBUG] Creating/getting response session for participant");
                  console.log("🔵 [DEBUG] Using assessmentDefinitionId:", assessmentDefinitionId);
                  const sessionId = await createOrGetResponseSession(
                    participantAssessmentData.id,
                    assessmentDefinitionId, // Use local variable, not state
                    "participant",
                    undefined,
                    undefined,
                    userData.id
                  );
                  console.log("🔵 [DEBUG] Session ID result:", sessionId);
                } else {
                  console.warn("⚠️ [DEBUG] No participant assessment found:", paError);
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
      console.log("🔵 [DEBUG] createOrGetResponseSession called with:", {
        participantAssessmentId,
        assessmentDefinitionId,
        respondentType,
        reviewerNominationId,
        externalReviewerId,
        clientUserId,
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

      console.log("🔵 [DEBUG] Session check result:", { existingSession, checkError });

      if (checkError && checkError.code !== "PGRST116") {
        console.error("❌ [DEBUG] Error checking for existing session:", checkError);
        return null;
      }

      if (existingSession) {
        console.log("✅ [DEBUG] Found existing session:", existingSession.id);
        setResponseSessionId(existingSession.id);
        // Load existing responses
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

      console.log("🔵 [DEBUG] Creating new session with data:", sessionData);

      const { data: newSession, error: createError } = await supabase
        .from("assessment_response_sessions")
        .insert([sessionData])
        .select()
        .single();

      if (createError) {
        console.error("❌ [DEBUG] Error creating response session:", createError);
        return null;
      }

      if (newSession) {
        console.log("✅ [DEBUG] Created new session:", newSession.id);
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

      // Fetch all responses for this session
      const { data: responses, error: responsesError } = await supabase
        .from("assessment_responses")
        .select("question_id, is_answered")
        .eq("session_id", sessionId);

      if (responsesError) {
        console.error("Error fetching responses for resume:", responsesError);
        return { questionIndex: 0, stepIndex: 0 };
      }

      const answeredQuestionIds = new Set(
        responses?.filter((r) => r.is_answered).map((r) => r.question_id) || []
      );

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
          if (!answeredQuestionIds.has(allQuestions[i].id)) {
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
          if (!answeredQuestionIds.has(questions[i].id)) {
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
      const { data: responses, error } = await supabase
        .from("assessment_responses")
        .select("question_id, answer_text")
        .eq("session_id", sessionId);

      if (error) {
        console.error("Error loading existing responses:", error);
        return;
      }

      if (responses && responses.length > 0) {
        const existingAnswers: Record<string | number, string> = {};
        responses.forEach((response) => {
          if (response.answer_text) {
            existingAnswers[response.question_id] = response.answer_text;
          }
        });
        setAnswers((prev) => ({ ...prev, ...existingAnswers }));
      }
    } catch (error) {
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
      console.log("💾 [DEBUG] saveQuestionResponse called:", {
        sessionId,
        questionId,
        answerText: answerText ? `${answerText.substring(0, 50)}...` : null,
        answerLength: answerText?.length || 0,
      });

      if (!sessionId) {
        console.error("❌ [DEBUG] No sessionId provided!");
        return;
      }

      if (!questionId) {
        console.error("❌ [DEBUG] No questionId provided!");
        return;
      }

      if (!answerText || answerText.trim() === "") {
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

      // Check if response exists
      const { data: existingResponse, error: checkError } = await supabase
        .from("assessment_responses")
        .select("id")
        .eq("session_id", sessionId)
        .eq("question_id", questionId)
        .maybeSingle();

      console.log("🔵 [DEBUG] Response existence check:", { existingResponse, checkError });

      if (existingResponse) {
        // Update existing response
        console.log("🔄 [DEBUG] Updating existing response:", existingResponse.id);
        const { error: updateError } = await supabase
          .from("assessment_responses")
          .update({
            answer_text: answerText,
            is_answered: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingResponse.id);

        if (updateError) {
          console.error("❌ [DEBUG] Error updating response:", updateError);
        } else {
          console.log("✅ [DEBUG] Successfully updated response");
        }
      } else {
        // Insert new response
        console.log("➕ [DEBUG] Inserting new response");
        const insertData = {
          session_id: sessionId,
          question_id: questionId,
          answer_text: answerText,
          is_answered: true,
        };
        console.log("🔵 [DEBUG] Insert data:", insertData);

        const { data: insertedData, error: insertError } = await supabase
          .from("assessment_responses")
          .insert(insertData)
          .select();

        if (insertError) {
          console.error("❌ [DEBUG] Error inserting response:", insertError);
          console.error("❌ [DEBUG] Insert error details:", JSON.stringify(insertError, null, 2));
        } else {
          console.log("✅ [DEBUG] Successfully inserted response:", insertedData);
        }
      }
    } catch (error) {
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
    console.log("🔵 [DEBUG] Current state:", {
      responseSessionId,
      usesNewPlan,
      assessmentDefinitionId,
      current,
      currentStep,
      answersCount: Object.keys(answers).length,
    });

    // Save current question response before navigating
    if (responseSessionId && usesNewPlan && assessmentDefinitionId) {
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
        console.log("💾 [DEBUG] About to save response:", {
          questionId: currentQuestion.id,
          answerText: answerText ? `${answerText.substring(0, 50)}...` : null,
        });
        await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

        // Calculate progress
        const allQuestions = assessmentType && assessmentType.toLowerCase() === "pulse" && questionGroups.length > 0
          ? questionGroups.flatMap(g => g.questions)
          : questions;
        
        const totalQuestions = allQuestions.length;
        const answeredCount = allQuestions.filter((q: Question) => {
          const answer = answers[q.id];
          return answer && answer.trim() !== "";
        }).length;

        await updateSessionProgress(
          responseSessionId,
          currentQuestion.id,
          currentStepId,
          totalQuestions,
          answeredCount
        );

        // Update participant assessment status if this is the first answer
        if (answeredCount === 1 && participantAssessmentId) {
          const { error: statusError } = await supabase
            .from("participant_assessments")
            .update({ status: "In Progress" })
            .eq("id", participantAssessmentId);

          if (statusError) {
            console.error("Error updating status to In Progress:", statusError);
          }
        }
      }
    }

    // Navigate to next question
    if (assessmentType && assessmentType.toLowerCase() === "pulse" && usesNewPlan && questionGroups.length > 0) {
      // Pulse with steps - navigate to next question in current step or next step
      const allQuestions = questionGroups.flatMap(g => g.questions);
      const currentQuestion = allQuestions[current];
      const currentGroup = questionGroups[currentStep];
      const questionIndexInStep = currentGroup.questions.indexOf(currentQuestion);
      
      if (questionIndexInStep < currentGroup.questions.length - 1) {
        // Next question in same step
        setCurrent(current + 1);
      } else if (currentStep < questionGroups.length - 1) {
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
        let currentQuestion: Question;
        let currentStepId: string | null = null;

        if (assessmentType && assessmentType.toLowerCase() === "pulse" && questionGroups.length > 0) {
          const allQuestions = questionGroups.flatMap(g => g.questions);
          currentQuestion = allQuestions[current];
          const currentGroup = questionGroups[currentStep];
          if (currentGroup.step) {
            currentStepId = currentGroup.step.id;
          }
        } else {
          currentQuestion = questions[current];
        }

        if (currentQuestion && typeof currentQuestion.id === "string") {
          const answerText = answers[currentQuestion.id] || null;
          await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

          // Update session to completed
          const allQuestions = assessmentType && assessmentType.toLowerCase() === "pulse" && questionGroups.length > 0
            ? questionGroups.flatMap(g => g.questions)
            : questions;
          
          const totalQuestions = allQuestions.length;
          const answeredCount = allQuestions.filter((q: Question) => {
            const answer = answers[q.id];
            return answer && answer.trim() !== "";
          }).length;

          await supabase
            .from("assessment_response_sessions")
            .update({
              status: "completed",
              submitted_at: new Date().toISOString(),
              last_question_id: currentQuestion.id,
              last_step_id: currentStepId,
              completion_percent: Math.round((answeredCount / totalQuestions) * 100),
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

      // Redirect to assessment overview
      router.push(`/tenant/${subdomain}/assessments/${assessmentId}`);
    } catch (err) {
      console.error("Error completing assessment:", err);
      alert("An unexpected error occurred. Please try again.");
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
                <textarea
                  id={`answer-${currentQuestion.id}`}
                  value={answers[currentQuestion.id] || ""}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  placeholder="Enter your response here..."
                  rows={6}
                  className={cn(
                    "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    "resize-none"
                  )}
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
                  <Button onClick={() => handleStepClick(currentStep + 1)} variant="outline" disabled={completing}>
                    Next Step
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
          <textarea
            id={`answer-${currentQuestion.id}`}
            value={answers[currentQuestion.id] || ""}
            onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
            placeholder="Enter your response here..."
            rows={6}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              "resize-none"
            )}
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