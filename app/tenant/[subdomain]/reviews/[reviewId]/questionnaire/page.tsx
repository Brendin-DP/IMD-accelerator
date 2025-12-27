"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

export default function ReviewQuestionnaire() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const reviewId = params.reviewId as string;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
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
  const [loading, setLoading] = useState(true);

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
                    await loadQuestionsFromDB(defId);
                    
                    // Create or get response session
                    if (nominationId) {
                      await createOrGetResponseSession(
                        paId,
                        defId,
                        "reviewer",
                        nominationId,
                        extReviewerId || undefined,
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

  async function loadQuestionsFromDB(assessmentDefinitionId: string) {
    try {
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

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Error checking for existing session:", checkError);
        return null;
      }

      if (existingSession) {
        setResponseSessionId(existingSession.id);
        // Load existing responses
        await loadExistingResponses(existingSession.id);
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

      const { data: newSession, error: createError } = await supabase
        .from("assessment_response_sessions")
        .insert([sessionData])
        .select()
        .single();

      if (createError) {
        console.error("Error creating response session:", createError);
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
      console.log("💾 [DEBUG REVIEWER] saveQuestionResponse called:", {
        sessionId,
        questionId,
        answerText: answerText ? `${answerText.substring(0, 50)}...` : null,
        answerLength: answerText?.length || 0,
      });

      if (!sessionId) {
        console.error("❌ [DEBUG REVIEWER] No sessionId provided!");
        return;
      }

      if (!questionId) {
        console.error("❌ [DEBUG REVIEWER] No questionId provided!");
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

      // Check if response exists
      const { data: existingResponse } = await supabase
        .from("assessment_responses")
        .select("id")
        .eq("session_id", sessionId)
        .eq("question_id", questionId)
        .maybeSingle();

      if (existingResponse) {
        // Update existing response
        const { error: updateError } = await supabase
          .from("assessment_responses")
          .update({
            answer_text: answerText,
            is_answered: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingResponse.id);

        if (updateError) {
          console.error("Error updating response:", updateError);
        }
      } else {
        // Insert new response
        console.log("➕ [DEBUG REVIEWER] Inserting new response");
        const insertData = {
          session_id: sessionId,
          question_id: questionId,
          answer_text: answerText,
          is_answered: true,
        };
        console.log("🔵 [DEBUG REVIEWER] Insert data:", insertData);

        const { data: insertedData, error: insertError } = await supabase
          .from("assessment_responses")
          .insert(insertData)
          .select();

        if (insertError) {
          console.error("❌ [DEBUG REVIEWER] Error inserting response:", insertError);
          console.error("❌ [DEBUG REVIEWER] Insert error details:", JSON.stringify(insertError, null, 2));
        } else {
          console.log("✅ [DEBUG REVIEWER] Successfully inserted response:", insertedData);
        }
      }
    } catch (error) {
      console.error("Unexpected error saving response:", error);
    }
  }

  // Helper function to update session progress
  async function updateSessionProgress(
    sessionId: string,
    lastQuestionId: string,
    totalQuestions?: number,
    answeredCount?: number
  ): Promise<void> {
    try {
      const updateData: any = {
        last_question_id: lastQuestionId,
        updated_at: new Date().toISOString(),
      };

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
    console.log("➡️ [DEBUG REVIEWER] handleNext called");
    console.log("🔵 [DEBUG REVIEWER] Current state:", {
      responseSessionId,
      assessmentDefinitionId,
      current,
      answersCount: Object.keys(answers).length,
    });

    // Save current question response before navigating
    if (responseSessionId && assessmentDefinitionId) {
      console.log("✅ [DEBUG REVIEWER] Conditions met for saving response");
      const currentQuestion = questions[current];
      console.log("🔵 [DEBUG REVIEWER] Current question:", {
        questionId: currentQuestion?.id,
        questionText: currentQuestion?.text?.substring(0, 50),
      });

      if (currentQuestion && typeof currentQuestion.id === "string") {
        const answerText = answers[currentQuestion.id] || null;
        console.log("💾 [DEBUG REVIEWER] About to save response:", {
          questionId: currentQuestion.id,
          answerText: answerText ? `${answerText.substring(0, 50)}...` : null,
        });
        await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

        // Calculate progress
        const totalQuestions = questions.length;
        const answeredCount = questions.filter((q: Question) => {
          const answer = answers[q.id];
          return answer && answer.trim() !== "";
        }).length;

        await updateSessionProgress(
          responseSessionId,
          currentQuestion.id,
          totalQuestions,
          answeredCount
        );
      }
    }

    // Navigate to next question
    if (current < questions.length - 1) {
      setCurrent(current + 1);
    } else {
      await handleCompleteReview();
    }
  };

  const handleCompleteReview = async () => {
    if (!reviewId) {
      alert("Error: Could not find review. Please try again.");
      return;
    }

    setCompleting(true);
    try {
      // Save final question response if using database
      if (responseSessionId && assessmentDefinitionId) {
        const currentQuestion = questions[current];
        if (currentQuestion && typeof currentQuestion.id === "string") {
          const answerText = answers[currentQuestion.id] || null;
          await saveQuestionResponse(responseSessionId, currentQuestion.id, answerText);

          // Update session to completed
          const totalQuestions = questions.length;
          const answeredCount = questions.filter((q: Question) => {
            const answer = answers[q.id];
            return answer && answer.trim() !== "";
          }).length;

          await supabase
            .from("assessment_response_sessions")
            .update({
              status: "completed",
              submitted_at: new Date().toISOString(),
              last_question_id: currentQuestion.id,
              completion_percent: Math.round((answeredCount / totalQuestions) * 100),
              updated_at: new Date().toISOString(),
            })
            .eq("id", responseSessionId);
        }
      }

      // Update review status to Completed
      const storedUser = localStorage.getItem("participant");
      if (storedUser) {
        const userData = JSON.parse(storedUser);

        // Check if external reviewer
        const { data: currentUser } = await supabase
          .from("client_users")
          .select("email")
          .eq("id", userData.id)
          .single();

        let isExternal = false;
        let externalReviewerId = null;

        if (currentUser?.email) {
          const { data: externalReviewer } = await supabase
            .from("external_reviewers")
            .select("id")
            .eq("email", currentUser.email.toLowerCase())
            .single();

          if (externalReviewer) {
            isExternal = true;
            externalReviewerId = externalReviewer.id;
          }
        }

        if (isExternal && externalReviewerId) {
          // Update external_reviewers table
          const { error: updateError } = await supabase
            .from("external_reviewers")
            .update({ review_status: "Completed" })
            .eq("id", externalReviewerId);

          if (updateError) {
            throw updateError;
          }
        } else {
          // Update reviewer_nominations table
          const { error: updateError } = await supabase
            .from("reviewer_nominations")
            .update({ review_status: "Completed" })
            .eq("id", reviewId);

          if (updateError) {
            throw updateError;
          }
        }
      }

      // Redirect back to review detail page
      router.push(`/tenant/${subdomain}/reviews/${reviewId}`);
    } catch (err) {
      console.error("Error completing review:", err);
      alert("An unexpected error occurred. Please try again.");
      setCompleting(false);
    }
  };

  const handleSkipToLast = () => {
    setCurrent(questions.length - 1);
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

  if (!questions.length) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No questions found.</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[current];
  const progress = ((current + 1) / questions.length) * 100;
  const isLastStep = current === questions.length - 1;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">360 Review</h1>
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground whitespace-nowrap">
          Question {current + 1} of {questions.length}
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
        <Button onClick={handleNext} disabled={completing}>
          {completing ? "Completing..." : isLastStep ? "Complete Review" : "Next"}
        </Button>
        {!isLastStep && (
          <Button onClick={handleSkipToLast} variant="tertiary">
            Skip to last step
          </Button>
        )}
      </div>
    </div>
  );
}

