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

export default function ReviewQuestionnaire() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const reviewId = params.reviewId as string;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [participantAssessmentId, setParticipantAssessmentId] = useState<string | null>(null);
  const [cohortAssessmentId, setCohortAssessmentId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      // Fetch questions
      const res = await fetch("http://localhost:4000/assessment_questions_360");
      const questionsData = await res.json();
      setQuestions(questionsData);

      // Fetch review details to get participant_assessment_id and cohort_assessment_id
      const storedUser = localStorage.getItem("participant");
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          let paId: string | null = null;

          // Fetch the review/nomination to get participant_assessment_id
          const { data: nomination, error: nominationError } = await supabase
            .from("reviewer_nominations")
            .select("participant_assessment_id")
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
                  .select("participant_assessment_id")
                  .eq("id", reviewId)
                  .eq("external_reviewer_id", externalReviewer.id)
                  .maybeSingle();

                if (extNomination) {
                  paId = extNomination.participant_assessment_id;
                }
              }
            }
          } else {
            paId = nomination.participant_assessment_id;
          }

          if (paId) {
            setParticipantAssessmentId(paId);

            // Fetch cohort_assessment_id from participant_assessment
            const { data: participantAssessment, error: paError } = await supabase
              .from("participant_assessments")
              .select("cohort_assessment_id")
              .eq("id", paId)
              .single();

            if (!paError && participantAssessment) {
              setCohortAssessmentId(participantAssessment.cohort_assessment_id);
            }
          }
        } catch (error) {
          console.error("Error loading data:", error);
        }
      }
    };

    loadData();
  }, [reviewId]);

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

  if (!questions.length) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading questions...</p>
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

