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

export default function Assessment360() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const assessmentId = params.assessmentId as string;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [participantAssessment, setParticipantAssessment] = useState<ParticipantAssessment | null>(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      // Fetch questions from public/db.json
      const res = await fetch("/db.json");
      const data = await res.json();
      const questionsData = data.assessment_questions_360 || [];
      setQuestions(questionsData);

      // Get assessmentId (cohort_assessment_id) from URL and user from localStorage
      const storedUser = localStorage.getItem("participant");
      if (!storedUser) {
        console.error("No user found in localStorage");
        return;
      }

      try {
        const userData = JSON.parse(storedUser);

        // Get the cohort_assessment to find the cohort_id
        const { data: cohortAssessment, error: caError } = await supabase
          .from("cohort_assessments")
          .select("cohort_id")
          .eq("id", assessmentId)
          .single();

        if (caError || !cohortAssessment) {
          console.error("Error fetching cohort assessment:", caError);
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
          return;
        }

        if (participantAssessmentData) {
          setParticipantAssessment(participantAssessmentData as ParticipantAssessment);
        } else {
          console.warn("Participant assessment not found. It may need to be created.");
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    loadData();
  }, [assessmentId]);

  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleNext = async () => {
    if (current < questions.length - 1) {
      setCurrent(current + 1);
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

  const handleSkipToLast = () => {
    setCurrent(questions.length - 1);
  };

  if (!questions.length) return <p>Loading questions...</p>;

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