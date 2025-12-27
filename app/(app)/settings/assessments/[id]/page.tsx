"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";

interface AssessmentDefinition {
  id: string;
  name: string;
  description?: string;
  assessment_type_id: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  assessment_type?: {
    id: string;
    name: string;
    description?: string;
  };
}

interface AssessmentStep {
  id: string;
  assessment_definition_id: string;
  title: string | null;
  step_order: number;
  created_at: string;
}

interface AssessmentQuestion {
  id: string;
  assessment_definition_id: string;
  question_text: string;
  question_type: string;
  question_order: number;
  required: boolean;
  step_id: string | null;
  created_at: string;
}

interface QuestionGroup {
  step: AssessmentStep | null;
  questions: AssessmentQuestion[];
}

export default function AssessmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;

  const [assessment, setAssessment] = useState<AssessmentDefinition | null>(null);
  const [steps, setSteps] = useState<AssessmentStep[]>([]);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [questionGroups, setQuestionGroups] = useState<QuestionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assessmentId) {
      fetchAssessmentDetails();
      fetchSteps();
      fetchQuestions();
    }
  }, [assessmentId]);

  useEffect(() => {
    // Organize questions by steps whenever steps or questions change
    if (steps.length > 0 || questions.length > 0) {
      organizeQuestionsBySteps();
    }
  }, [steps, questions]);

  async function fetchAssessmentDetails() {
    try {
      setLoading(true);
      setError(null);

      // Fetch assessment definition with assessment_type join
      const { data, error: dbError } = await supabase
        .from("assessment_definitions_v2")
        .select(`
          *,
          assessment_type:assessment_types(id, name, description)
        `)
        .eq("id", assessmentId)
        .single();

      if (dbError) {
        console.error("Error fetching assessment:", dbError);
        // Try fallback without relationship join
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("assessment_definitions_v2")
          .select("*")
          .eq("id", assessmentId)
          .single();

        if (fallbackError) {
          setError(`Failed to load assessment: ${fallbackError.message}`);
          setAssessment(null);
          return;
        }

        // Fetch assessment type separately
        const { data: typeData } = await supabase
          .from("assessment_types")
          .select("id, name, description")
          .eq("id", fallbackData.assessment_type_id)
          .single();

        setAssessment({
          ...fallbackData,
          assessment_type: typeData || null,
        });
      } else {
        setAssessment(data);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setAssessment(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSteps() {
    try {
      const { data, error: dbError } = await supabase
        .from("assessment_steps_v2")
        .select("*")
        .eq("assessment_definition_id", assessmentId)
        .order("step_order", { ascending: true });

      if (dbError) {
        console.error("Error fetching steps:", dbError);
        setSteps([]);
      } else {
        setSteps(data || []);
      }
    } catch (err) {
      console.error("Unexpected error fetching steps:", err);
      setSteps([]);
    }
  }

  async function fetchQuestions() {
    try {
      const { data, error: dbError } = await supabase
        .from("assessment_questions_v2")
        .select("*")
        .eq("assessment_definition_id", assessmentId)
        .order("question_order", { ascending: true });

      if (dbError) {
        console.error("Error fetching questions:", dbError);
        setQuestions([]);
      } else {
        setQuestions(data || []);
      }
    } catch (err) {
      console.error("Unexpected error fetching questions:", err);
      setQuestions([]);
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
          questions: stepQuestions.sort((a, b) => a.question_order - b.question_order),
        });
      }
    });

    // Add ungrouped questions (questions without step_id)
    const ungroupedQuestions = questions.filter((q) => !q.step_id);
    if (ungroupedQuestions.length > 0) {
      groups.push({
        step: null,
        questions: ungroupedQuestions.sort((a, b) => a.question_order - b.question_order),
      });
    }

    setQuestionGroups(groups);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading assessment details...</div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">
          {error || "Assessment not found"}
        </div>
        <Button variant="tertiary" onClick={() => router.push("/settings/assessments")} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessments
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Assessments", href: "/settings/assessments" },
          { label: assessment.name },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push("/settings/assessments")} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Assessments
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{assessment.name}</h1>
        <p className="text-muted-foreground mt-2">Assessment definition details and questions</p>
      </div>

      {/* Assessment Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assessment Name</label>
              <p className="text-sm font-medium mt-1">{assessment.name || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assessment Type</label>
              <p className="text-sm font-medium mt-1">
                {assessment.assessment_type?.name || "-"}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              <p className="text-sm font-medium mt-1">{assessment.description || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created</label>
              <p className="text-sm font-medium mt-1">
                {assessment.created_at
                  ? new Date(assessment.created_at).toLocaleDateString()
                  : "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
              <p className="text-sm font-medium mt-1">
                {assessment.updated_at
                  ? new Date(assessment.updated_at).toLocaleDateString()
                  : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions and Steps Section */}
      {questionGroups.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No questions found for this assessment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {questionGroups.map((group, groupIndex) => {
            // If there's only one step, don't show "Step 1", just show "Assessment Questions"
            const isSingleStep = steps.length === 1 && group.step !== null;
            const showStepTitle = !isSingleStep;
            
            // Determine step heading - avoid duplication if title already contains step number
            let stepHeading = "";
            if (group.step) {
              if (isSingleStep) {
                stepHeading = "Assessment Questions";
              } else {
                const stepTitle = group.step.title || "";
                // Check if title already starts with "Step X" pattern
                const stepPattern = new RegExp(`^Step\\s+${group.step.step_order}`, "i");
                if (stepTitle && stepPattern.test(stepTitle.trim())) {
                  // Title already contains step number, just use the title
                  stepHeading = stepTitle;
                } else if (stepTitle) {
                  // Title exists but doesn't contain step number, show both
                  stepHeading = `Step ${group.step.step_order}: ${stepTitle}`;
                } else {
                  // No title, just show step number
                  stepHeading = `Step ${group.step.step_order}`;
                }
              }
            } else {
              stepHeading = "General Questions";
            }
            
            return (
              <Card key={group.step?.id || `ungrouped-${groupIndex}`}>
                <CardHeader>
                  <CardTitle>{stepHeading}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {group.questions.map((question) => (
                      <div
                        key={question.id}
                        className="border-l-4 border-primary/20 pl-4 py-2 bg-muted/30 rounded-r"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                Q{question.question_order}
                              </span>
                              {question.required && (
                                <span className="text-xs font-medium text-destructive">Required</span>
                              )}
                              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {question.question_type || "text"}
                              </span>
                            </div>
                            <p className="text-sm font-medium">{question.question_text}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}

