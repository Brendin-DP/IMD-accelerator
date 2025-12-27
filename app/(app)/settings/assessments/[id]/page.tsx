"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Edit, Trash2, GripVertical, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";

// Note: Install @dnd-kit packages: npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
// For now, drag & drop is commented out until packages are installed

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
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState({ name: "", description: "" });
  const [editingStep, setEditingStep] = useState<AssessmentStep | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<AssessmentQuestion | null>(null);
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

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

  useEffect(() => {
    // Set edit mode based on is_system flag
    if (assessment) {
      setIsEditMode(!assessment.is_system);
      setEditingAssessment({
        name: assessment.name,
        description: assessment.description || "",
      });
    }
  }, [assessment]);

  async function fetchAssessmentDetails() {
    try {
      setLoading(true);
      setError(null);

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
      if (stepQuestions.length > 0 || isEditMode) {
        groups.push({
          step,
          questions: stepQuestions.sort((a, b) => a.question_order - b.question_order),
        });
      }
    });

    // Add ungrouped questions (questions without step_id)
    const ungroupedQuestions = questions.filter((q) => !q.step_id);
    if (ungroupedQuestions.length > 0 || (isEditMode && steps.length === 0)) {
      groups.push({
        step: null,
        questions: ungroupedQuestions.sort((a, b) => a.question_order - b.question_order),
      });
    }

    setQuestionGroups(groups);
  }

  // Step CRUD functions
  function handleAddStep() {
    setEditingStep(null);
    setIsStepDialogOpen(true);
  }

  function handleEditStep(step: AssessmentStep) {
    setEditingStep(step);
    setIsStepDialogOpen(true);
  }

  async function handleSaveStep(stepTitle: string) {
    if (!assessmentId) return;

    try {
      if (editingStep) {
        // Update existing step
        const { error } = await supabase
          .from("assessment_steps_v2")
          .update({ title: stepTitle || null })
          .eq("id", editingStep.id);

        if (error) throw error;
      } else {
        // Create new step
        const maxOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) : 0;
        const { error } = await supabase
          .from("assessment_steps_v2")
          .insert({
            assessment_definition_id: assessmentId,
            title: stepTitle || null,
            step_order: maxOrder + 1,
          });

        if (error) throw error;
      }

      setIsStepDialogOpen(false);
      setEditingStep(null);
      await fetchSteps();
    } catch (err) {
      console.error("Error saving step:", err);
      alert(err instanceof Error ? err.message : "Failed to save step");
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm("Are you sure you want to delete this step? All questions in this step will also be deleted.")) {
      return;
    }

    try {
      // Delete questions in this step first
      await supabase
        .from("assessment_questions_v2")
        .delete()
        .eq("step_id", stepId);

      // Delete the step
      const { error } = await supabase
        .from("assessment_steps_v2")
        .delete()
        .eq("id", stepId);

      if (error) throw error;

      await fetchSteps();
      await fetchQuestions();
    } catch (err) {
      console.error("Error deleting step:", err);
      alert(err instanceof Error ? err.message : "Failed to delete step");
    }
  }

  // Question CRUD functions
  function handleAddQuestion(stepId: string | null = null) {
    setSelectedStepId(stepId);
    setEditingQuestion(null);
    setIsQuestionDialogOpen(true);
  }

  function handleEditQuestion(question: AssessmentQuestion) {
    setEditingQuestion(question);
    setSelectedStepId(question.step_id);
    setIsQuestionDialogOpen(true);
  }

  async function handleSaveQuestion(questionText: string, required: boolean, stepId: string | null) {
    if (!assessmentId) return;

    try {
      if (editingQuestion) {
        // Update existing question
        const { error } = await supabase
          .from("assessment_questions_v2")
          .update({
            question_text: questionText,
            required,
            step_id: stepId,
          })
          .eq("id", editingQuestion.id);

        if (error) throw error;
      } else {
        // Create new question
        const stepQuestions = questions.filter((q) => q.step_id === stepId);
        const maxOrder = stepQuestions.length > 0 
          ? Math.max(...stepQuestions.map((q) => q.question_order)) 
          : 0;

        const { error } = await supabase
          .from("assessment_questions_v2")
          .insert({
            assessment_definition_id: assessmentId,
            question_text: questionText,
            question_type: "text",
            question_order: maxOrder + 1,
            required,
            step_id: stepId,
          });

        if (error) throw error;
      }

      setIsQuestionDialogOpen(false);
      setEditingQuestion(null);
      setSelectedStepId(null);
      await fetchQuestions();
    } catch (err) {
      console.error("Error saving question:", err);
      alert(err instanceof Error ? err.message : "Failed to save question");
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm("Are you sure you want to delete this question?")) {
      return;
    }

    try {
      const question = questions.find((q) => q.id === questionId);
      const { error } = await supabase
        .from("assessment_questions_v2")
        .delete()
        .eq("id", questionId);

      if (error) throw error;

      // Reorder remaining questions in the step
      if (question?.step_id) {
        const stepQuestions = questions
          .filter((q) => q.step_id === question.step_id && q.id !== questionId)
          .sort((a, b) => a.question_order - b.question_order);

        for (let i = 0; i < stepQuestions.length; i++) {
          await supabase
            .from("assessment_questions_v2")
            .update({ question_order: i + 1 })
            .eq("id", stepQuestions[i].id);
        }
      }

      await fetchQuestions();
    } catch (err) {
      console.error("Error deleting question:", err);
      alert(err instanceof Error ? err.message : "Failed to delete question");
    }
  }

  async function handleReorderQuestion(questionId: string, newOrder: number, stepId: string | null) {
    try {
      const stepQuestions = questions
        .filter((q) => q.step_id === stepId && q.id !== questionId)
        .sort((a, b) => a.question_order - b.question_order);

      // Update question order
      await supabase
        .from("assessment_questions_v2")
        .update({ question_order: newOrder })
        .eq("id", questionId);

      // Reorder other questions
      let order = 1;
      for (const q of stepQuestions) {
        if (order >= newOrder) order++;
        await supabase
          .from("assessment_questions_v2")
          .update({ question_order: order })
          .eq("id", q.id);
        order++;
      }

      await fetchQuestions();
    } catch (err) {
      console.error("Error reordering question:", err);
      alert(err instanceof Error ? err.message : "Failed to reorder question");
    }
  }

  async function handleSaveAssessment() {
    if (!assessmentId || !assessment) return;

    setSaving(true);
    try {
      // Update assessment definition
      const { error: updateError } = await supabase
        .from("assessment_definitions_v2")
        .update({
          name: editingAssessment.name.trim(),
          description: editingAssessment.description.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assessmentId);

      if (updateError) throw updateError;

      // Delete all existing steps
      const { error: deleteStepsError } = await supabase
        .from("assessment_steps_v2")
        .delete()
        .eq("assessment_definition_id", assessmentId);

      if (deleteStepsError) throw deleteStepsError;

      // Delete all existing questions
      const { error: deleteQuestionsError } = await supabase
        .from("assessment_questions_v2")
        .delete()
        .eq("assessment_definition_id", assessmentId);

      if (deleteQuestionsError) throw deleteQuestionsError;

      // Insert new steps
      if (steps.length > 0) {
        const newSteps = steps.map((step, index) => ({
          assessment_definition_id: assessmentId,
          title: step.title,
          step_order: index + 1,
        }));

        const { data: insertedSteps, error: insertStepsError } = await supabase
          .from("assessment_steps_v2")
          .insert(newSteps)
          .select();

        if (insertStepsError) throw insertStepsError;

        // Create step ID map
        const stepIdMap = new Map<string, string>();
        steps.forEach((oldStep, index) => {
          if (insertedSteps && insertedSteps[index]) {
            stepIdMap.set(oldStep.id, insertedSteps[index].id);
          }
        });

        // Insert new questions with mapped step IDs
        if (questions.length > 0) {
          const newQuestions = questions.map((question) => ({
            assessment_definition_id: assessmentId,
            question_text: question.question_text,
            question_type: question.question_type,
            question_order: question.question_order,
            required: question.required,
            step_id: question.step_id ? stepIdMap.get(question.step_id) || null : null,
          }));

          const { error: insertQuestionsError } = await supabase
            .from("assessment_questions_v2")
            .insert(newQuestions);

          if (insertQuestionsError) throw insertQuestionsError;
        }
      } else {
        // No steps, insert questions without step_id
        if (questions.length > 0) {
          const newQuestions = questions.map((question) => ({
            assessment_definition_id: assessmentId,
            question_text: question.question_text,
            question_type: question.question_type,
            question_order: question.question_order,
            required: question.required,
            step_id: null,
          }));

          const { error: insertQuestionsError } = await supabase
            .from("assessment_questions_v2")
            .insert(newQuestions);

          if (insertQuestionsError) throw insertQuestionsError;
        }
      }

      // Refresh data
      await fetchAssessmentDetails();
      await fetchSteps();
      await fetchQuestions();

      alert("Assessment saved successfully!");
    } catch (err) {
      console.error("Error saving assessment:", err);
      alert(err instanceof Error ? err.message : "Failed to save assessment");
    } finally {
      setSaving(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{assessment.name}</h1>
          <p className="text-muted-foreground mt-2">
            {isEditMode ? "Edit assessment definition" : "Assessment definition details and questions"}
          </p>
        </div>
        {isEditMode && (
          <Button onClick={handleSaveAssessment} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Update Assessment"}
          </Button>
        )}
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
              {isEditMode ? (
                <Input
                  value={editingAssessment.name}
                  onChange={(e) => setEditingAssessment({ ...editingAssessment, name: e.target.value })}
                  className="mt-1"
                />
              ) : (
                <p className="text-sm font-medium mt-1">{assessment.name || "-"}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assessment Type</label>
              <p className="text-sm font-medium mt-1">
                {assessment.assessment_type?.name || "-"}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              {isEditMode ? (
                <textarea
                  value={editingAssessment.description}
                  onChange={(e) => setEditingAssessment({ ...editingAssessment, description: e.target.value })}
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  rows={3}
                />
              ) : (
                <p className="text-sm font-medium mt-1">{assessment.description || "-"}</p>
              )}
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

      {/* Steps and Questions Section */}
      {isEditMode && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Steps</CardTitle>
              <Button onClick={handleAddStep} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Step
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No steps yet. Add a step to organize questions.</p>
            ) : (
              <div className="space-y-2">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">Step {step.step_order}</span>
                      <Input
                        value={step.title || ""}
                        onChange={(e) => {
                          const updatedSteps = steps.map((s) =>
                            s.id === step.id ? { ...s, title: e.target.value } : s
                          );
                          setSteps(updatedSteps);
                        }}
                        placeholder="Step title (optional)"
                        className="w-64"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditStep(step)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteStep(step.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Questions Section */}
      {questionGroups.length === 0 && !isEditMode ? (
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
            const isSingleStep = steps.length === 1 && group.step !== null;
            
            let stepHeading = "";
            if (group.step) {
              if (isSingleStep) {
                stepHeading = "Assessment Questions";
              } else {
                const stepTitle = group.step.title || "";
                const stepPattern = new RegExp(`^Step\\s+${group.step.step_order}`, "i");
                if (stepTitle && stepPattern.test(stepTitle.trim())) {
                  stepHeading = stepTitle;
                } else if (stepTitle) {
                  stepHeading = `Step ${group.step.step_order}: ${stepTitle}`;
                } else {
                  stepHeading = `Step ${group.step.step_order}`;
                }
              }
            } else {
              stepHeading = "General Questions";
            }
            
            return (
              <Card key={group.step?.id || `ungrouped-${groupIndex}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{stepHeading}</CardTitle>
                    {isEditMode && (
                      <Button
                        onClick={() => handleAddQuestion(group.step?.id || null)}
                        size="sm"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Question
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {group.questions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No questions in this step.</p>
                  ) : (
                    <div className="space-y-4">
                      {group.questions.map((question, qIndex) => (
                        <div
                          key={question.id}
                          className="border-l-4 border-primary/20 pl-4 py-2 bg-muted/30 rounded-r flex items-start gap-3"
                        >
                          {isEditMode && (
                            <div className="flex flex-col gap-1 pt-1">
                              <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditQuestion(question)}
                                className="h-6 w-6 p-0"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteQuestion(question.id)}
                                className="h-6 w-6 p-0"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          )}
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
                            {isEditMode ? (
                              <Input
                                value={question.question_text}
                                onChange={(e) => {
                                  const updatedQuestions = questions.map((q) =>
                                    q.id === question.id ? { ...q, question_text: e.target.value } : q
                                  );
                                  setQuestions(updatedQuestions);
                                }}
                                className="mt-1"
                              />
                            ) : (
                              <p className="text-sm font-medium">{question.question_text}</p>
                            )}
                            {isEditMode && (
                              <div className="flex items-center gap-2 mt-2">
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={question.required}
                                    onChange={(e) => {
                                      const updatedQuestions = questions.map((q) =>
                                        q.id === question.id ? { ...q, required: e.target.checked } : q
                                      );
                                      setQuestions(updatedQuestions);
                                    }}
                                  />
                                  Required
                                </label>
                                {steps.length > 0 && (
                                  <Select
                                    value={question.step_id || "__none__"}
                                    onValueChange={(value) => {
                                      const updatedQuestions = questions.map((q) =>
                                        q.id === question.id ? { ...q, step_id: value === "__none__" ? null : value } : q
                                      );
                                      setQuestions(updatedQuestions);
                                    }}
                                  >
                                    <SelectTrigger className="w-48">
                                      <SelectValue placeholder="Select step" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">General Questions</SelectItem>
                                      {steps.map((step) => (
                                        <SelectItem key={step.id} value={step.id}>
                                          Step {step.step_order}: {step.title || "Untitled"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Question for assessments without steps */}
      {isEditMode && steps.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent>
            {questions.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">No questions yet.</p>
                <Button onClick={() => handleAddQuestion(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Question
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {questions.map((question) => (
                  <div
                    key={question.id}
                    className="border-l-4 border-primary/20 pl-4 py-2 bg-muted/30 rounded-r flex items-start gap-3"
                  >
                    <div className="flex flex-col gap-1 pt-1">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditQuestion(question)}
                        className="h-6 w-6 p-0"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteQuestion(question.id)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          Q{question.question_order}
                        </span>
                        {question.required && (
                          <span className="text-xs font-medium text-destructive">Required</span>
                        )}
                      </div>
                      <Input
                        value={question.question_text}
                        onChange={(e) => {
                          const updatedQuestions = questions.map((q) =>
                            q.id === question.id ? { ...q, question_text: e.target.value } : q
                          );
                          setQuestions(updatedQuestions);
                        }}
                        className="mt-1"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(e) => {
                              const updatedQuestions = questions.map((q) =>
                                q.id === question.id ? { ...q, required: e.target.checked } : q
                              );
                              setQuestions(updatedQuestions);
                            }}
                          />
                          Required
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
                <Button onClick={() => handleAddQuestion(null)} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Question
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step Dialog */}
      <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsStepDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>{editingStep ? "Edit Step" : "Add Step"}</DialogTitle>
            <DialogDescription>
              {editingStep ? "Update the step title" : "Create a new step to organize questions"}
            </DialogDescription>
          </DialogHeader>
          <StepDialogContent
            step={editingStep}
            onSave={handleSaveStep}
            onClose={() => {
              setIsStepDialogOpen(false);
              setEditingStep(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Question Dialog */}
      <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsQuestionDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>{editingQuestion ? "Edit Question" : "Add Question"}</DialogTitle>
            <DialogDescription>
              {editingQuestion ? "Update the question details" : "Add a new question to this assessment"}
            </DialogDescription>
          </DialogHeader>
          <QuestionDialogContent
            question={editingQuestion}
            steps={steps}
            selectedStepId={selectedStepId}
            onSave={handleSaveQuestion}
            onClose={() => {
              setIsQuestionDialogOpen(false);
              setEditingQuestion(null);
              setSelectedStepId(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Step Dialog Component
function StepDialogContent({
  step,
  onSave,
  onClose,
}: {
  step: AssessmentStep | null;
  onSave: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(step?.title || "");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="step-title" className="text-sm font-medium">
          Step Title (optional)
        </label>
        <Input
          id="step-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter step title"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(title)}>Save</Button>
      </div>
    </div>
  );
}

// Question Dialog Component
function QuestionDialogContent({
  question,
  steps,
  selectedStepId,
  onSave,
  onClose,
}: {
  question: AssessmentQuestion | null;
  steps: AssessmentStep[];
  selectedStepId: string | null;
  onSave: (text: string, required: boolean, stepId: string | null) => void;
  onClose: () => void;
}) {
  const [questionText, setQuestionText] = useState(question?.question_text || "");
  const [required, setRequired] = useState(question?.required || false);
  const [stepId, setStepId] = useState<string | null>(selectedStepId || question?.step_id || null);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="question-text" className="text-sm font-medium">
          Question Text <span className="text-destructive">*</span>
        </label>
        <textarea
          id="question-text"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="Enter question text"
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          required
        />
      </div>
      {steps.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="question-step" className="text-sm font-medium">
            Step
          </label>
          <Select value={stepId || "__none__"} onValueChange={(value) => setStepId(value === "__none__" ? null : value)}>
            <SelectTrigger id="question-step">
              <SelectValue placeholder="Select a step (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">General Questions</SelectItem>
              {steps.map((step) => (
                <SelectItem key={step.id} value={step.id}>
                  Step {step.step_order}: {step.title || "Untitled"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="question-required"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        <label htmlFor="question-required" className="text-sm font-medium">
          Required
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(questionText, required, stepId)} disabled={!questionText.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
