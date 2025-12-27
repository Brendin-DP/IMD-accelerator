"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";

interface Question {
  id: number;
  category: string;
  text: string;
}

interface ParticipantAssessment {
  id: string;
  participant_id: string;
  cohort_assessment_id: string;
  score: number | null;
  status: string | null;
  submitted_at: string | null;
  allow_reviewer_nominations: boolean | null;
  created_at: string | null;
}

interface AssessmentProgress {
  id: string;
  participant_assessment_id: string;
  current_question: number;
  total_questions: number;
  answers: Record<string, any> | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AssessmentQuestion {
  id: string;
  template_version_id: string;
  question_text: string;
  question_order: number;
  category: string | null;
  created_at: string | null;
}

export default function Assessment360() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const assessmentId = params.assessmentId as string;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [participantAssessment, setParticipantAssessment] = useState<ParticipantAssessment | null>(null);
  const [assessmentProgress, setAssessmentProgress] = useState<AssessmentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // Get assessmentId (cohort_assessment_id) from URL and user from localStorage
      const storedUser = localStorage.getItem("participant");
      if (!storedUser) {
        console.error("No user found in localStorage");
        setLoading(false);
        return;
      }

      try {
        const userData = JSON.parse(storedUser);

        // Get the cohort_assessment to find the cohort_id
        const { data: cohortAssessment, error: caError } = await supabase
          .from("cohort_assessments")
          .select("cohort_id, template_version_id")
          .eq("id", assessmentId)
          .single();

        if (caError || !cohortAssessment) {
          console.error("Error fetching cohort assessment:", caError);
          setLoading(false);
          return;
        }

        // Find the cohort_participant for this user AND this specific cohort
        const { data: participant, error: participantsError } = await supabase
          .from("cohort_participants")
          .select("id")
          .eq("client_user_id", userData.id)
          .eq("cohort_id", cohortAssessment.cohort_id)
          .maybeSingle();

        if (participantsError || !participant) {
          console.warn("No participant found for this user in this cohort");
          setLoading(false);
          return;
        }

        // Direct query: select * from participant_assessments
        // where cohort_assessment_id = ? and participant_id = ?
        const { data: participantAssessmentData, error: paError } = await supabase
          .from("participant_assessments")
          .select("*")
          .eq("cohort_assessment_id", assessmentId)
          .eq("participant_id", participant.id)
          .maybeSingle();

        if (paError && paError.code !== "PGRST116") {
          console.error("Error fetching participant assessment:", paError);
          setLoading(false);
          return;
        }

        if (!participantAssessmentData) {
          console.warn("Participant assessment not found. It may need to be created.");
          setLoading(false);
          return;
        }

        setParticipantAssessment(participantAssessmentData as ParticipantAssessment);

        // Phase 2: Check if template_version_id exists
        const templateVersionId = (cohortAssessment as any).template_version_id;

        if (templateVersionId) {
          // New flow: Load questions from assessment_questions table
          const { data: assessmentQuestions, error: questionsError } = await supabase
            .from("assessment_questions")
            .select("*")
            .eq("template_version_id", templateVersionId)
            .order("question_order", { ascending: true });

          if (questionsError) {
            console.error("Error fetching assessment questions:", questionsError);
            setLoading(false);
            return;
          }

          if (!assessmentQuestions || assessmentQuestions.length === 0) {
            console.warn("No questions found for template version");
            setLoading(false);
            return;
          }

          // Transform assessment_questions to Question format
          const transformedQuestions: Question[] = assessmentQuestions.map((q: AssessmentQuestion) => ({
            id: q.question_order,
            category: q.category || "",
            text: q.question_text,
          }));

          setQuestions(transformedQuestions);

          // Fetch existing progress or initialize
          const { data: existingProgress, error: progressError } = await supabase
            .from("assessment_progress")
            .select("*")
            .eq("participant_assessment_id", participantAssessmentData.id)
            .maybeSingle();

          if (progressError && progressError.code !== "PGRST116") {
            console.error("Error fetching assessment progress:", progressError);
            setLoading(false);
            return;
          }

          // Upsert assessment_progress
          const progressData = {
            participant_assessment_id: participantAssessmentData.id,
            total_questions: transformedQuestions.length,
            current_question: existingProgress?.current_question ?? 0,
            answers: existingProgress?.answers ?? {},
            updated_at: new Date().toISOString(),
          };

          const { data: upsertedProgress, error: upsertError } = await supabase
            .from("assessment_progress")
            .upsert(progressData, {
              onConflict: "participant_assessment_id",
            })
            .select()
            .single();

          if (upsertError) {
            console.error("Error upserting assessment progress:", upsertError);
            setLoading(false);
            return;
          }

          if (upsertedProgress) {
            setAssessmentProgress(upsertedProgress as AssessmentProgress);
            setCurrent(upsertedProgress.current_question ?? 0);
            setAnswers((upsertedProgress.answers as Record<number, string>) || {});
          }
        } else {
          // Backward compatibility: Load from db.json
          const res = await fetch("/db.json");
          const data = await res.json();
          const questionsData = data.assessment_questions_360 || [];
          setQuestions(questionsData);

          // Try to load existing progress even for legacy assessments
          const { data: existingProgress, error: progressError } = await supabase
            .from("assessment_progress")
            .select("*")
            .eq("participant_assessment_id", participantAssessmentData.id)
            .maybeSingle();

          if (!progressError && existingProgress) {
            setAssessmentProgress(existingProgress as AssessmentProgress);
            setCurrent(existingProgress.current_question ?? 0);
            setAnswers((existingProgress.answers as Record<number, string>) || {});
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [assessmentId]);

  const handleAnswerChange = async (questionId: number, value: string) => {
    const newAnswers = {
      ...answers,
      [questionId]: value,
    };
    setAnswers(newAnswers);

    // Persist to assessment_progress if we have a participant assessment
    if (participantAssessment && assessmentProgress) {
      const { error: updateError } = await supabase
        .from("assessment_progress")
        .update({
          answers: newAnswers,
          updated_at: new Date().toISOString(),
        })
        .eq("participant_assessment_id", participantAssessment.id);

      if (updateError) {
        console.error("Error updating progress answers:", updateError);
      } else {
        // Update local progress state
        setAssessmentProgress((prev) =>
          prev ? { ...prev, answers: newAnswers as any } : null
        );
      }
    }
  };

  const handleNext = async () => {
    if (current < questions.length - 1) {
      const newCurrent = current + 1;
      setCurrent(newCurrent);

      // Update current_question in assessment_progress
      if (participantAssessment && assessmentProgress) {
        const { error: updateError } = await supabase
          .from("assessment_progress")
          .update({
            current_question: newCurrent,
            updated_at: new Date().toISOString(),
          })
          .eq("participant_assessment_id", participantAssessment.id);

        if (updateError) {
          console.error("Error updating progress current_question:", updateError);
        } else {
          // Update local progress state
          setAssessmentProgress((prev) =>
            prev ? { ...prev, current_question: newCurrent } : null
          );
        }
      }
    } else {
      await handleCompleteAssessment();
    }
  };

  const handleCompleteAssessment = async () => {
    if (!participantAssessment) {
      alert("Error: Could not find assessment. Please try again.");
      return;
    }

    setCompleting(true);
    try {
      // Update participant_assessments status
      const { error: updateError } = await supabase
        .from("participant_assessments")
        .update({ status: "Completed" })
        .eq("id", participantAssessment.id);

      if (updateError) {
        console.error("Error completing assessment:", updateError);
        alert(`Error: ${updateError.message}`);
        setCompleting(false);
        return;
      }

      // Update assessment_progress if it exists
      if (assessmentProgress) {
        const { error: progressError } = await supabase
          .from("assessment_progress")
          .update({
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("participant_assessment_id", participantAssessment.id);

        if (progressError) {
          console.error("Error updating progress completion:", progressError);
          // Don't fail the whole operation if progress update fails
        }
      }

      // Update local state
      setParticipantAssessment((prev) => 
        prev ? { ...prev, status: "Completed" } : null
      );

      // Redirect to assessment overview
      router.push(`/tenant/${subdomain}/assessments/${assessmentId}`);
    } catch (err) {
      console.error("Error completing assessment:", err);
      alert("An unexpected error occurred. Please try again.");
      setCompleting(false);
    }
  };

  const handleSkipToLast = async () => {
    const lastIndex = questions.length - 1;
    setCurrent(lastIndex);

    // Update current_question in assessment_progress
    if (participantAssessment && assessmentProgress) {
      const { error: updateError } = await supabase
        .from("assessment_progress")
        .update({
          current_question: lastIndex,
          updated_at: new Date().toISOString(),
        })
        .eq("participant_assessment_id", participantAssessment.id);

      if (updateError) {
        console.error("Error updating progress current_question:", updateError);
      } else {
        // Update local progress state
        setAssessmentProgress((prev) =>
          prev ? { ...prev, current_question: lastIndex } : null
        );
      }
    }
  };

  if (loading) return <p>Loading questions...</p>;
  if (!questions.length) return <p>No questions available.</p>;

  const currentQuestion = questions[current];
  const progress = ((current + 1) / questions.length) * 100;
  const isLastStep = current === questions.length - 1;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">360 Assessment</h1>
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
        <p className="text-lg font-medium">{currentQuestion.text}</p>
        
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
          {completing ? "Completing..." : isLastStep ? "Complete Assessment" : "Next"}
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