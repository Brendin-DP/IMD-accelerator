"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

type AssessmentResponseRow = {
  question_id: string | number;
  answer_text: string | null;
  is_answered: boolean;
};

export default function ReviewQuestionnaire() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const reviewId = params.reviewId as string;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [steps, setSteps] = useState<AssessmentStep[]>([]);
  const [questionGroups, setQuestionGroups] = useState<QuestionGroup[]>([]);
  const [current, setCurrent] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string | number, string>>({});
  const [participantAssessmentId, setParticipantAssessmentId] = useState<string | null>(null);
  const [cohortAssessmentId, setCohortAssessmentId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [responseSessionId, setResponseSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [reviewerNominationId, setReviewerNominationId] = useState<string | null>(null);
  const [isExternalReviewer, setIsExternalReviewer] = useState(false);
  const [externalReviewerId, setExternalReviewerId] = useState<string | null>(null);
  const [assessmentDefinitionId, setAssessmentDefinitionId] = useState<string | null>(null);
  const [assessmentType, setAssessmentType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [hasResumed, setHasResumed] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch review details to get participant_assessment_id and cohort_assessment_id
        const storedUser = localStorage.getItem("participant");
        if (!storedUser) {
          setLoading(false);
          return;
        }

        try {
          const userData = JSON.parse(storedUser);
          let paId: string | null = null;
          let nominationId: string | null = null;
          let extReviewerId: string | null = null;
          let isExternal = false;

          // Fetch the review/nomination to get participant_assessment_id
          const { data: nomination, error: nominationError } = await supabase
            .from("reviewer_nominations")
            .select("participant_assessment_id, id, external_reviewer_id")
            .eq("id", reviewId)
            .maybeSingle();

          if (nominationError || !nomination) {
            // Try as external reviewer
            const { data: currentUser } = await supabase
              .from("client_users")
              .select("email")
              .eq("id", userData.id)
              .single();

            if (currentUser?.email) {
              const { data: externalReviewer } = await supabase
                .from("external_reviewers")
                .select("id")
                .eq("email", currentUser.email.toLowerCase())
                .single();

              if (externalReviewer) {
                const { data: extNomination } = await supabase
                  .from("reviewer_nominations")
                  .select("participant_assessment_id, id")
                  .eq("id", reviewId)
                  .eq("external_reviewer_id", externalReviewer.id)
                  .maybeSingle();

                if (extNomination) {
                  paId = extNomination.participant_assessment_id;
                  nominationId = extNomination.id;
                  extReviewerId = externalReviewer.id;
                  isExternal = true;
                }
              }
            }
          } else {
            paId = nomination.participant_assessment_id;
            nominationId = nomination.id;
            if (nomination.external_reviewer_id) {
              extReviewerId = nomination.external_reviewer_id;
              isExternal = true;
            }
          }

          setReviewerNominationId(nominationId);
          setIsExternalReviewer(isExternal);
          setExternalReviewerId(extReviewerId);

          if (paId) {
            setParticipantAssessmentId(paId);

            // Fetch cohort_assessment_id and assessment_type_id from participant_assessment
            const { data: participantAssessment, error: paError } = await supabase
              .from("participant_assessments")
              .select("cohort_assessment_id, cohort_assessments(assessment_type_id, cohort_id)")
              .eq("id", paId)
              .single();

            if (!paError && participantAssessment) {
              setCohortAssessmentId(participantAssessment.cohort_assessment_id);
              
              // Get assessment_type_id from cohort_assessments
              const cohortAssessment = participantAssessment.cohort_assessments as any;
              if (cohortAssessment?.assessment_type_id) {
                const assessmentTypeId = cohortAssessment.assessment_type_id;
                const cohortId = cohortAssessment.cohort_id;

                // Fetch assessment type name
                const { data: assessmentTypeData } = await supabase
                  .from("assessment_types")
                  .select("name")
                  .eq("id", assessmentTypeId)
                  .single();

                setAssessmentType(assessmentTypeData?.name || "");

                // Get the cohort to find the plan
                const { data: cohort } = await supabase
                  .from("cohorts")
                  .select("plan_id")
                  .eq("id", cohortId)
                  .single();

                if (cohort?.plan_id) {
                  // Fetch the plan's description to get the assessment definition mapping
                  const { data: planData } = await supabase
                    .from("plans")
                    .select("description")
                    .eq("id", cohort.plan_id)
                    .single();

                  let defId: string | null = null;

                  if (planData?.description) {
                    const planMappingMatch = planData.description.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
                    if (planMappingMatch) {
                      try {
                        const mapping = JSON.parse(planMappingMatch[1]);
                        const selectedDefId = mapping[assessmentTypeId];
                        if (selectedDefId) {
                          const { data: selectedDef } = await supabase
                            .from("assessment_definitions_v2")
                            .select("id, assessment_type_id")
                            .eq("id", selectedDefId)
                            .eq("assessment_type_id", assessmentTypeId)
                            .maybeSingle();

                          if (selectedDef) {
                            defId = selectedDef.id;
                          }
                        }
                      } catch (e) {
                        console.error("Error parsing plan assessment mapping:", e);
                      }
                    }
                  }

                  // Fall back to system assessment if no custom found
                  if (!defId) {
                    const { data: systemDef } = await supabase
                      .from("assessment_definitions_v2")
                      .select("id")
                      .eq("assessment_type_id", assessmentTypeId)
                      .eq("is_system", true)
                      .maybeSingle();

                    if (systemDef) {
                      defId = systemDef.id;
                    }
                  }

                  if (defId) {
                    setAssessmentDefinitionId(defId);
                    await loadQuestionsFromDB(defId, assessmentTypeId, assessmentTypeData?.name || "");
                    
                    // Create or get response session
                    // Validate required data before calling
                    if (!nominationId) {
                      console.error("Error: nominationId is required to create reviewer session");
                    } else if (!paId) {
                      console.error("Error: participant_assessment_id is required to create reviewer session");
                    } else if (!defId) {
                      console.error("Error: assessment_definition_id is required to create reviewer session");
                    } else if (isExternal && !extReviewerId) {
                      console.error("Error: external_reviewer_id is required for external reviewer");
                    } else if (!isExternal && !userData.id) {
                      console.error("Error: client_user_id is required for internal reviewer");
                    } else {
                      await createOrGetResponseSession(
                        paId,
                        defId,
                        "reviewer",
                        nominationId,
                        isExternal ? (extReviewerId || undefined) : undefined,
                        isExternal ? undefined : userData.id
                      );
                    }
                  } else {
                    // Fallback to JSON
                    await loadQuestionsFromJSON();
                  }
                } else {
                  // Fallback to JSON
                  await loadQuestionsFromJSON();
                }
              } else {
                // Fallback to JSON
                await loadQuestionsFromJSON();
              }
            } else {
              // Fallback to JSON
              await loadQuestionsFromJSON();
            }
          } else {
            // Fallback to JSON
            await loadQuestionsFromJSON();
          }
        } catch (error) {
          console.error("Error loading data:", error);
          await loadQuestionsFromJSON();
        }
      } catch (error) {
        console.error("Unexpected error:", error);
        await loadQuestionsFromJSON();
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [reviewId]);

  // Organize questions by steps when steps and questions are loaded
  useEffect(() => {
    if (assessmentType?.toLowerCase() === "pulse" && steps.length > 0 && questions.length > 0) {
      organizeQuestionsBySteps();
    } else if (questions.length > 0) {
      // No steps - create single group
      setQuestionGroups([{ step: null, questions }]);
    }
  }, [steps, questions, assessmentType]);

  // Resume from last question when session and questions are loaded
  useEffect(() => {
    const resumeFromLastQuestion = async () => {
      if (
        !hasResumed &&
        responseSessionId &&
        assessmentDefinitionId &&
        (questionGroups.length > 0 || questions.length > 0)
      ) {
        const resumePos = await determineResumePosition(
          responseSessionId,
          questions,
          questionGroups.length > 0 ? questionGroups : undefined
        );

        setCurrent(resumePos.questionIndex);
        if (resumePos.stepIndex !== undefined) {
          setCurrentStep(resumePos.stepIndex);
        }
        setHasResumed(true);
      }
    };

    resumeFromLastQuestion();
  }, [responseSessionId, questions, questionGroups, assessmentDefinitionId, hasResumed]);

  // Update currentStep when current question index changes (for Pulse)
  useEffect(() => {
    if (assessmentType?.toLowerCase() === "pulse" && questionGroups.length > 0) {
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
  }, [current, questionGroups, assessmentType]);

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
          // Continue without steps
        } else if (stepsData && stepsData.length > 0) {
          setSteps(stepsData);
        } else {
          setSteps([]);
        }
      } else {
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
      await loadQuestionsFromJSON();
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

  async function loadQuestionsFromJSON() {
    try {
      const res = await fetch("/db.json");
      const data = await res.json();
      const questionsData = data.assessment_questions_360 || [];
      setQuestions(questionsData);
    } catch (error) {
      console.error("Error loading questions from JSON:", error);
    }
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

      // Validate reviewer session requirements
      if (respondentType === "reviewer") {
        if (!reviewerNominationId) {
          console.error("Error: reviewer_nomination_id is required for reviewer sessions");
          return null;
        }
        
        const hasClientUserId = !!clientUserId;
        const hasExternalReviewerId = !!externalReviewerId;
        
        if (hasClientUserId && hasExternalReviewerId) {
          console.error("Error: Cannot set both client_user_id and external_reviewer_id");
          return null;
        }
        
        if (!hasClientUserId && !hasExternalReviewerId) {
          console.error("Error: Must set either client_user_id or external_reviewer_id for reviewer");
          return null;
        }
      }

      // Determine the actual respondent_type value based on reviewer type
      // Database constraint expects: "participant", "client_user", or "external_reviewer"
      // Note: "reviewer" is NOT a valid value - must use "client_user" or "external_reviewer"
      let actualRespondentType: string;
      if (respondentType === "reviewer") {
        if (externalReviewerId) {
          actualRespondentType = "external_reviewer";
        } else {
          actualRespondentType = "client_user"; // clientUserId is guaranteed to exist due to validation above
        }
      } else {
        actualRespondentType = "participant";
      }

      // Check if session already exists
      let query = supabase
        .from("assessment_response_sessions")
        .select("id")
        .eq("participant_assessment_id", participantAssessmentId)
        .eq("assessment_definition_id", assessmentDefinitionId)
        .eq("respondent_type", actualRespondentType);

      if (reviewerNominationId) {
        query = query.eq("reviewer_nomination_id", reviewerNominationId);
      }

      const { data: existingSession, error: checkError } = await query.maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Error checking for existing session:", {
          message: checkError.message,
          code: checkError.code,
          details: checkError.details,
          hint: checkError.hint,
        });
        return null;
      }

      if (existingSession) {
        setResponseSessionId(existingSession.id);
        // Load existing responses
        await loadExistingResponses(existingSession.id);
        return existingSession.id;
      }

      // Create new session
      // Required fields for reviewer sessions:
      // - participant_assessment_id: Links to the participant assessment being reviewed
      // - assessment_definition_id: Links to the assessment definition (questions)
      // - reviewer_nomination_id: Links to the reviewer_nominations table (required for reviewers)
      // - respondent_type: Set to "client_user" or "external_reviewer" based on reviewer type (database constraint)
      // - respondent_client_user_id OR respondent_external_reviewer_id: Exactly one must be set
      const sessionData: any = {
        participant_assessment_id: participantAssessmentId,
        assessment_definition_id: assessmentDefinitionId,
        respondent_type: actualRespondentType, // "participant", "client_user", or "external_reviewer"
        status: "not_started",
        started_at: new Date().toISOString(),
        completion_percent: 0,
      };

      // For reviewers, always set reviewer_nomination_id (required field)
      // This links the session to the reviewer_nominations table
      if (respondentType === "reviewer") {
        if (!reviewerNominationId) {
          console.error("Error: reviewer_nomination_id is required for reviewer sessions");
          return null;
        }
        sessionData.reviewer_nomination_id = reviewerNominationId;
      } else if (reviewerNominationId) {
        sessionData.reviewer_nomination_id = reviewerNominationId;
      }

      // Set respondent ID fields - ensure only one is set for reviewers
      if (respondentType === "reviewer") {
        if (externalReviewerId) {
          sessionData.respondent_external_reviewer_id = externalReviewerId;
          // Explicitly set client_user_id to null to avoid conflicts
          sessionData.respondent_client_user_id = null;
        } else if (clientUserId) {
          sessionData.respondent_client_user_id = clientUserId;
          // Explicitly set external_reviewer_id to null to avoid conflicts
          sessionData.respondent_external_reviewer_id = null;
        }
      } else {
        // For participants, set client_user_id if provided
        if (clientUserId) {
          sessionData.respondent_client_user_id = clientUserId;
        }
        if (externalReviewerId) {
          sessionData.respondent_external_reviewer_id = externalReviewerId;
        }
      }

      const { data: newSession, error: createError } = await supabase
        .from("assessment_response_sessions")
        .insert([sessionData])
        .select()
        .single();

      if (createError) {
        console.error("Error creating response session:", {
          message: createError.message,
          code: createError.code,
          details: createError.details,
          hint: createError.hint,
          sessionData: {
            participant_assessment_id: sessionData.participant_assessment_id,
            assessment_definition_id: sessionData.assessment_definition_id,
            respondent_type: sessionData.respondent_type,
            reviewer_nomination_id: sessionData.reviewer_nomination_id,
            respondent_client_user_id: sessionData.respondent_client_user_id,
            respondent_external_reviewer_id: sessionData.respondent_external_reviewer_id,
          },
        });
        return null;
      }

      if (newSession) {
        setResponseSessionId(newSession.id);
        return newSession.id;
      }

      return null;
    } catch (error) {
      console.error("Unexpected error creating/getting session:", error);
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

      // Check if there are any answered responses
      const hasAnsweredResponses = responses && responses.length > 0 && 
        responses.some((r: any) => r.is_answered === true);

      // Resume if session is in_progress OR if there are saved responses (even if status is not_started)
      // This handles the case where responses were saved but status wasn't updated
      if (session.status !== "in_progress" && !hasAnsweredResponses) {
        return { questionIndex: 0, stepIndex: 0 };
      }

      if (responsesError) {
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
          
          const stepId = r.question?.step_id ?? "__no_step__";
          if (!answeredByStep.has(stepId)) {
            answeredByStep.set(stepId, new Set());
          }
          answeredByStep.get(stepId)!.add(questionId);
        }
      });

      // If we have last_question_id, try to resume from there
      if (session.last_question_id && questionGroups && questionGroups.length > 0) {
        const allQuestions = questionGroups.flatMap(g => g.questions);
        let questionIndex = -1;
        let stepIndex = 0;

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

          return { questionIndex, stepIndex };
        }
      } else if (session.last_question_id) {
        // No steps - simple lookup
        const questionIndex = questions.findIndex((q) => q.id === session.last_question_id);
        if (questionIndex >= 0) {
          return { questionIndex };
        }
      }

      // Find first unanswered question
      if (questionGroups && questionGroups.length > 0) {
        const allQuestions = questionGroups.flatMap(g => g.questions);
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

        return { questionIndex: lastIndex, stepIndex };
      } else {
        // No steps - simple sequential
        for (let i = 0; i < questions.length; i++) {
          if (!answeredQuestionIds.has(String(questions[i].id))) {
            return { questionIndex: i };
          }
        }

        return { questionIndex: questions.length - 1 };
      }
    } catch (error) {
      console.error("Error determining resume position:", error);
      return { questionIndex: 0, stepIndex: 0 };
    }
  }

  // Helper function to load existing responses
  async function loadExistingResponses(sessionId: string) {
    try {
      if (!sessionId) {
        // No session ID, initialize empty answers
        setAnswers({});
        return;
      }

      const { data: responses, error } = await supabase
        .from("assessment_responses")
        .select("question_id, answer_text")
        .eq("session_id", sessionId);

      if (error) {
        console.error("Error loading existing responses:", error);
        // Initialize empty answers on error
        setAnswers({});
        return;
      }

      // Handle null/undefined responses gracefully
      if (!responses || responses.length === 0) {
        // No responses yet, initialize empty answers
        setAnswers({});
        return;
      }

      // Load existing responses, handling null answer_text
      const existingAnswers: Record<string | number, string> = {};
      (responses as AssessmentResponseRow[]).forEach((response) => {
        if (response && response.question_id && response.answer_text) {
          existingAnswers[response.question_id] = response.answer_text;
        }
      });
      setAnswers((prev) => ({ ...prev, ...existingAnswers }));
    } catch (error) {
      console.error("Unexpected error loading responses:", error);
      // Initialize empty answers on unexpected error
      setAnswers({});
    }
  }

  // Helper function to save question response
  async function saveQuestionResponse(
    sessionId: string,
    questionId: string,
    answerText: string | null
  ): Promise<void> {
    try {
      if (!sessionId || !questionId) {
        return;
      }

      if (!answerText || answerText.trim() === "") {
        // Don't save empty answers, but mark as not answered if exists
        const { data: existingResponse } = await supabase
          .from("assessment_responses")
          .select("id")
          .eq("session_id", sessionId)
          .eq("question_id", questionId)
          .maybeSingle();

        if (existingResponse) {
          await supabase
            .from("assessment_responses")
            .update({
              answer_text: null,
              is_answered: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingResponse.id);
        }
        return;
      }

      // Use upsert to handle insert/update in one operation
      const upsertData = {
        session_id: sessionId,
        question_id: questionId,
        answer_text: answerText,
        is_answered: true,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("assessment_responses")
        .upsert(upsertData, {
          onConflict: "session_id,question_id",
        });

      if (upsertError) {
        console.error("Error saving response:", upsertError);
      }
    } catch (error) {
      console.error("Unexpected error saving response:", error);
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

  // Helper function to update review status
  async function updateReviewStatus(status: "In progress" | "Completed") {
    if (!reviewerNominationId) return;

    try {
      if (isExternalReviewer && externalReviewerId) {
        await supabase
          .from("external_reviewers")
          .update({ review_status: status })
          .eq("id", externalReviewerId);
      } else {
        await supabase
          .from("reviewer_nominations")
          .update({ review_status: status })
          .eq("id", reviewerNominationId);
      }
    } catch (error) {
      console.error("Error updating review status:", error);
    }
  }

  const handleAnswerChange = (questionId: number | string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleNext = async () => {
    if (!responseSessionId || !assessmentDefinitionId) return;

    let currentQuestion: Question;
    let currentStepId: string | null = null;

    if (assessmentType?.toLowerCase() === "pulse" && questionGroups.length > 0) {
      const allQuestions = questionGroups.flatMap(g => g.questions);
      currentQuestion = allQuestions[current];
      const currentGroup = questionGroups[currentStep];
      if (currentGroup?.step) {
        currentStepId = currentGroup.step.id;
      }
    } else {
      currentQuestion = questions[current];
    }

    if (currentQuestion && typeof currentQuestion.id === "string") {
      const answerText = answers[currentQuestion.id] || null;
      await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

      // Check if assessment has steps
      const { data: stepsCheck } = await supabase
        .from("assessment_steps_v2")
        .select("id")
        .eq("assessment_definition_id", assessmentDefinitionId)
        .limit(1);

      const hasSteps = stepsCheck && stepsCheck.length > 0;
      let answeredCount = 0;
      let totalQuestions = 0;

      if (hasSteps) {
        // Pulse assessment with steps - count questions per step
        const { data: stepsData } = await supabase
          .from("assessment_steps_v2")
          .select("id")
          .eq("assessment_definition_id", assessmentDefinitionId)
          .order("step_order", { ascending: true });

        if (stepsData) {
          for (const step of stepsData) {
            const { count: stepQuestionCount } = await supabase
              .from("assessment_questions_v2")
              .select("*", { count: "exact", head: true })
              .eq("assessment_definition_id", assessmentDefinitionId)
              .eq("step_id", step.id);

            totalQuestions += stepQuestionCount || 0;
          }
        }

        const { count: dbAnsweredCount } = await supabase
          .from("assessment_responses")
          .select("*", { count: "exact", head: true })
          .eq("session_id", responseSessionId)
          .eq("is_answered", true);

        answeredCount = dbAnsweredCount || 0;
      } else {
        // 360 assessment without steps
        const { count: dbAnsweredCount } = await supabase
          .from("assessment_responses")
          .select("*", { count: "exact", head: true })
          .eq("session_id", responseSessionId)
          .eq("is_answered", true);

        const { count: dbTotalQuestions } = await supabase
          .from("assessment_questions_v2")
          .select("*", { count: "exact", head: true })
          .eq("assessment_definition_id", assessmentDefinitionId);

        answeredCount = dbAnsweredCount || 0;
        totalQuestions = dbTotalQuestions || 0;
      }

      await updateSessionProgress(
        responseSessionId,
        currentQuestion.id,
        currentStepId,
        totalQuestions,
        answeredCount
      );

      // Update session status to in_progress and review status on first save
      if (answeredCount === 1) {
        await supabase
          .from("assessment_response_sessions")
          .update({ status: "in_progress" })
          .eq("id", responseSessionId);

        await updateReviewStatus("In progress");
      }
    }

    // Navigate to next question
    if (assessmentType?.toLowerCase() === "pulse" && questionGroups.length > 0) {
      const allQuestions = questionGroups.flatMap(g => g.questions);
      
      if (current < 0 || current >= allQuestions.length) {
        await handleCompleteReview();
        return;
      }
      
      const currentQuestionForNav = allQuestions[current];
      const currentGroup = questionGroups[currentStep];
      const questionIndexInStep = currentGroup.questions.indexOf(currentQuestionForNav);
      
      if (questionIndexInStep < currentGroup.questions.length - 1) {
        // Next question in same step
        setCurrent(current + 1);
      } else if (currentStep < questionGroups.length - 1) {
        // Move to next step
        if (currentQuestionForNav && typeof currentQuestionForNav.id === "string" && responseSessionId && assessmentDefinitionId) {
          const answerText = answers[currentQuestionForNav.id] || null;
          const stepId = currentGroup.step?.id || null;
          
          await saveQuestionResponse(responseSessionId, currentQuestionForNav.id, answerText);
          
          // Update progress
          const { data: stepsCheck } = await supabase
            .from("assessment_steps_v2")
            .select("id")
            .eq("assessment_definition_id", assessmentDefinitionId)
            .limit(1);

          const hasSteps = stepsCheck && stepsCheck.length > 0;
          let answeredCount = 0;
          let totalQuestions = 0;

          if (hasSteps) {
            const { data: stepsData } = await supabase
              .from("assessment_steps_v2")
              .select("id")
              .eq("assessment_definition_id", assessmentDefinitionId)
              .order("step_order", { ascending: true });

            if (stepsData) {
              for (const step of stepsData) {
                const { count: stepQuestionCount } = await supabase
                  .from("assessment_questions_v2")
                  .select("*", { count: "exact", head: true })
                  .eq("assessment_definition_id", assessmentDefinitionId)
                  .eq("step_id", step.id);

                totalQuestions += stepQuestionCount || 0;
              }
            }

            const { count: dbAnsweredCount } = await supabase
              .from("assessment_responses")
              .select("*", { count: "exact", head: true })
              .eq("session_id", responseSessionId)
              .eq("is_answered", true);

            answeredCount = dbAnsweredCount || 0;
          } else {
            const { count: dbAnsweredCount } = await supabase
              .from("assessment_responses")
              .select("*", { count: "exact", head: true })
              .eq("session_id", responseSessionId)
              .eq("is_answered", true);

            const { count: dbTotalQuestions } = await supabase
              .from("assessment_questions_v2")
              .select("*", { count: "exact", head: true })
              .eq("assessment_definition_id", assessmentDefinitionId);

            answeredCount = dbAnsweredCount || 0;
            totalQuestions = dbTotalQuestions || 0;
          }
          
          await updateSessionProgress(
            responseSessionId,
            currentQuestionForNav.id,
            stepId,
            totalQuestions,
            answeredCount
          );
        }
        
        // Move to next step, first question
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
        let nextQuestionIndex = 0;
        for (let i = 0; i < nextStep; i++) {
          nextQuestionIndex += questionGroups[i].questions.length;
        }
        setCurrent(nextQuestionIndex);
      } else {
        // Last question - complete
        await handleCompleteReview();
      }
    } else {
      // 360 or no steps - simple sequential navigation
      if (current < questions.length - 1) {
        setCurrent(current + 1);
      } else {
        await handleCompleteReview();
      }
    }
  };

  const handleCompleteReview = async () => {
    if (!reviewId || !responseSessionId || !assessmentDefinitionId) {
      alert("Error: Could not find review. Please try again.");
      return;
    }

    setCompleting(true);
    try {
      let currentQuestion: Question | undefined;
      let currentStepId: string | null = null;

      if (assessmentType?.toLowerCase() === "pulse" && questionGroups.length > 0) {
        const allQuestions = questionGroups.flatMap(g => g.questions);
        if (current >= 0 && current < allQuestions.length) {
          currentQuestion = allQuestions[current];
          if (currentStep >= 0 && currentStep < questionGroups.length) {
            const currentGroup = questionGroups[currentStep];
            if (currentGroup?.step) {
              currentStepId = currentGroup.step.id;
            }
          }
        }
      } else {
        if (current >= 0 && current < questions.length) {
          currentQuestion = questions[current];
        }
      }

      if (currentQuestion && typeof currentQuestion.id === "string") {
        const answerText = answers[currentQuestion.id] || null;
        await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

        // Count answered questions from database for accuracy
        const { data: stepsCheck } = await supabase
          .from("assessment_steps_v2")
          .select("id")
          .eq("assessment_definition_id", assessmentDefinitionId)
          .limit(1);

        const hasSteps = stepsCheck && stepsCheck.length > 0;
        let answered = 0;
        let total = 0;

        if (hasSteps) {
          // Pulse assessment with steps - count questions per step
          const { data: stepsData } = await supabase
            .from("assessment_steps_v2")
            .select("id")
            .eq("assessment_definition_id", assessmentDefinitionId)
            .order("step_order", { ascending: true });

          if (stepsData) {
            for (const step of stepsData) {
              const { count: stepQuestionCount } = await supabase
                .from("assessment_questions_v2")
                .select("*", { count: "exact", head: true })
                .eq("assessment_definition_id", assessmentDefinitionId)
                .eq("step_id", step.id);

              total += stepQuestionCount || 0;
            }
          }

          const { count: answeredCount } = await supabase
            .from("assessment_responses")
            .select("*", { count: "exact", head: true })
            .eq("session_id", responseSessionId)
            .eq("is_answered", true);

          answered = answeredCount || 0;
        } else {
          // 360 assessment without steps
          const { count: answeredCount } = await supabase
            .from("assessment_responses")
            .select("*", { count: "exact", head: true })
            .eq("session_id", responseSessionId)
            .eq("is_answered", true);

          const { count: totalQuestions } = await supabase
            .from("assessment_questions_v2")
            .select("*", { count: "exact", head: true })
            .eq("assessment_definition_id", assessmentDefinitionId);

          answered = answeredCount || 0;
          total = totalQuestions || 0;
        }

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
      }

      // Update review status to Completed
      await updateReviewStatus("Completed");

      // Redirect back to review detail page (NOT report page)
      router.push(`/tenant/${subdomain}/reviews/${reviewId}`);
    } catch (err) {
      console.error("Error completing review:", err);
      alert("An unexpected error occurred. Please try again.");
      setCompleting(false);
    }
  };

  const handlePrevious = () => {
    if (assessmentType?.toLowerCase() === "pulse" && questionGroups.length > 0) {
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
      // 360 or no steps - simple sequential navigation
      if (current > 0) {
        setCurrent(current - 1);
      }
    }
  };

  if (loading || loadingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading questions...</p>
        </div>
      </div>
    );
  }

  if (!questions.length && questionGroups.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No questions found.</p>
        </div>
      </div>
    );
  }

  // Determine current question and progress
  let currentQuestion: Question;
  let totalQuestions: number;
  let progress: number;
  let isLastStepOverall: boolean;
  let isFirstInStep: boolean;
  let isLastInStep: boolean;
  let questionIndexInStep: number;
  let currentGroup: QuestionGroup | undefined;

  if (assessmentType?.toLowerCase() === "pulse" && questionGroups.length > 0) {
    const allQuestions = questionGroups.flatMap(g => g.questions);
    currentQuestion = allQuestions[current];
    totalQuestions = allQuestions.length;
    progress = ((current + 1) / totalQuestions) * 100;
    isLastStepOverall = current === allQuestions.length - 1;
    currentGroup = questionGroups[currentStep];
    questionIndexInStep = currentGroup.questions.indexOf(currentQuestion);
    isFirstInStep = questionIndexInStep === 0;
    isLastInStep = questionIndexInStep === currentGroup.questions.length - 1;
  } else {
    currentQuestion = questions[current];
    totalQuestions = questions.length;
    progress = ((current + 1) / totalQuestions) * 100;
    isLastStepOverall = current === questions.length - 1;
    isFirstInStep = current === 0;
    isLastInStep = current === questions.length - 1;
    questionIndexInStep = current;
  }

  // Render Pulse assessment with steps
  if (assessmentType?.toLowerCase() === "pulse" && questionGroups.length > 0) {
    const stepperSteps: StepperStep[] = questionGroups.map((group, index) => {
      const isStepCompleted = index < currentStep;
      const isStepActive = index === currentStep;
      const isStepPending = index > currentStep;

      return {
        title: group.step?.title || `Step ${index + 1}`,
        description: `${group.questions.length} question${group.questions.length !== 1 ? 's' : ''}`,
        status: isStepCompleted ? "completed" : isStepActive ? "active" : "pending",
        content: isStepActive ? (
          <div className="mt-4">
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
                  <Button onClick={handleCompleteReview} disabled={completing}>
                    {completing ? "Completing..." : "Complete Review"}
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
        <h1 className="text-2xl font-bold">Review Assessment</h1>
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

  // Render 360 assessment (no steps)
  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Review Assessment</h1>
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
      
      <div className="flex items-center justify-between gap-4">
        <div>
          {current > 0 && (
            <Button onClick={handlePrevious} variant="outline" disabled={completing}>
              Previous
            </Button>
          )}
        </div>
        <Button onClick={handleNext} disabled={completing}>
          {completing ? "Completing..." : isLastStepOverall ? "Complete Review" : "Next"}
        </Button>
      </div>
    </div>
  );
}

