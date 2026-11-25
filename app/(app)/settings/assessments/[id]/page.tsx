"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, GripVertical, Save } from "lucide-react";
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
import { QuestionTypeIcon } from "@/components/ui/question-type-icon";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// Drag-and-drop containers are steps; questions without a step share one key.
const NO_STEP = "__none__";
const CONTAINER_PREFIX = "step:";
const containerKey = (stepId: string | null) => stepId ?? NO_STEP;
const containerId = (stepId: string | null) => `${CONTAINER_PREFIX}${containerKey(stepId)}`;
/** Which step a draggable/droppable id belongs to (question id or step container id). */
function questionContainer(list: AssessmentQuestion[], id: string): string | null {
  if (id.startsWith(CONTAINER_PREFIX)) return id.slice(CONTAINER_PREFIX.length);
  const q = list.find((x) => x.id === id);
  return q ? containerKey(q.step_id) : null;
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

  // Drag and drop sensors
  const sensors = useSensors(
    // Small threshold so clicks into the text field don't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

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
  }, [steps, questions, isEditMode]);

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

  /**
   * Moves a dragged question onto another question (or an empty step) — within
   * a step this reorders, across steps it re-homes the question. Both affected
   * steps are renumbered. Local state only; persisted by Save.
   */
  function moveQuestion(activeId: string, overId: string) {
    setQuestions((prev) => {
      const from = questionContainer(prev, activeId);
      const to = questionContainer(prev, overId);
      if (from === null || to === null) return prev;
      const inStep = (key: string, list: AssessmentQuestion[]) =>
        list.filter((q) => containerKey(q.step_id) === key).sort((a, b) => a.question_order - b.question_order);
      const toStepId = to === NO_STEP ? null : to;

      let target: AssessmentQuestion[];
      if (from === to) {
        const current = inStep(to, prev);
        const oldIndex = current.findIndex((q) => q.id === activeId);
        const newIndex = current.findIndex((q) => q.id === overId);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
        target = arrayMove(current, oldIndex, newIndex);
      } else {
        const moving = prev.find((q) => q.id === activeId)!;
        target = inStep(to, prev).filter((q) => q.id !== activeId);
        const overIndex = target.findIndex((q) => q.id === overId);
        target.splice(overIndex < 0 ? target.length : overIndex, 0, { ...moving, step_id: toStepId });
      }

      const next = new Map<string, Partial<AssessmentQuestion>>();
      target.forEach((q, i) => next.set(q.id, { question_order: i + 1, step_id: toStepId }));
      if (from !== to) inStep(from, prev).filter((q) => q.id !== activeId).forEach((q, i) => next.set(q.id, { question_order: i + 1 }));
      return prev.map((q) => (next.has(q.id) ? { ...q, ...next.get(q.id) } : q));
    });
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

      // Update steps and questions in place, keeping their ids. Deleting and
      // re-inserting would give questions new ids, and the database cascades
      // that delete to every answer already given to them.
      if (steps.length > 0) {
        const { error: stepsError } = await supabase.from("assessment_steps_v2").upsert(
          steps.map((step, index) => ({
            id: step.id,
            assessment_definition_id: assessmentId,
            title: step.title,
            step_order: index + 1,
          })),
          { onConflict: "id" }
        );
        if (stepsError) throw stepsError;
      }

      if (questions.length > 0) {
        const stepIds = new Set(steps.map((s) => s.id));
        const { error: questionsError } = await supabase.from("assessment_questions_v2").upsert(
          questions.map((question) => ({
            id: question.id,
            assessment_definition_id: assessmentId,
            question_text: question.question_text,
            question_type: question.question_type,
            question_order: question.question_order,
            required: question.required,
            step_id: question.step_id && stepIds.has(question.step_id) ? question.step_id : null,
          })),
          { onConflict: "id" }
        );
        if (questionsError) throw questionsError;
      }

      // Remove rows that were deleted locally but still exist in the database.
      const keepQuestions = new Set(questions.map((q) => q.id));
      const keepSteps = new Set(steps.map((s) => s.id));
      const [{ data: dbQuestions }, { data: dbSteps }] = await Promise.all([
        supabase.from("assessment_questions_v2").select("id").eq("assessment_definition_id", assessmentId),
        supabase.from("assessment_steps_v2").select("id").eq("assessment_definition_id", assessmentId),
      ]);
      const staleQuestions = (dbQuestions ?? []).map((q: { id: string }) => q.id).filter((id: string) => !keepQuestions.has(id));
      const staleSteps = (dbSteps ?? []).map((s: { id: string }) => s.id).filter((id: string) => !keepSteps.has(id));
      if (staleQuestions.length > 0) {
        const { error } = await supabase.from("assessment_questions_v2").delete().in("id", staleQuestions);
        if (error) throw error;
      }
      if (staleSteps.length > 0) {
        const { error } = await supabase.from("assessment_steps_v2").delete().in("id", staleSteps);
        if (error) throw error;
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

      {/* Steps and Questions */}
      {questionGroups.length === 0 && !isEditMode ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No questions found for this assessment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Questions</h2>
              <p className="text-xs text-muted-foreground">
                {questions.length} question{questions.length === 1 ? "" : "s"}
                {steps.length > 0 && ` across ${steps.length} step${steps.length === 1 ? "" : "s"}`}
                {isEditMode && " · drag to reorder or move between steps"}
              </p>
            </div>
            {isEditMode && (
              <div className="flex items-center gap-2">
                {steps.length === 0 && (
                  <Button variant="outline" size="sm" onClick={() => handleAddQuestion(null)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Question
                  </Button>
                )}
                <Button size="sm" onClick={handleAddStep}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Step
                </Button>
              </div>
            )}
          </div>

          {isEditMode && questionGroups.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-muted-foreground">
              No questions yet. Add a step or a question to get started.
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e: DragStartEvent) => setDraggingId(e.active.id as string)}
            onDragOver={(e: DragOverEvent) => {
              const { active, over } = e;
              if (!over) return;
              // Cross-step moves happen live so the target step opens up a slot.
              if (questionContainer(questions, active.id as string) !== questionContainer(questions, over.id as string)) {
                moveQuestion(active.id as string, over.id as string);
              }
            }}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              setDraggingId(null);
              if (over && active.id !== over.id) moveQuestion(active.id as string, over.id as string);
            }}
            onDragCancel={() => setDraggingId(null)}
          >
            {questionGroups.map((group, groupIndex) => {
              const isSingleStep = steps.length === 1 && group.step !== null;
              const stepLabel = group.step ? (isSingleStep ? "Questions" : `Step ${group.step.step_order}`) : "General";
              const stepTitle = group.step?.title?.trim() || "";
              const showTitle = stepTitle && !new RegExp(`^Step\\s+${group.step?.step_order}$`, "i").test(stepTitle);
              return (
                <StepGroup
                  key={group.step?.id || `ungrouped-${groupIndex}`}
                  id={containerId(group.step?.id ?? null)}
                  label={stepLabel}
                  title={group.step && isEditMode ? group.step.title || "" : showTitle ? stepTitle : ""}
                  count={group.questions.length}
                  isEditMode={isEditMode}
                  onTitleChange={
                    group.step
                      ? (value) => setSteps(steps.map((s) => (s.id === group.step!.id ? { ...s, title: value } : s)))
                      : undefined
                  }
                  onAddQuestion={() => handleAddQuestion(group.step?.id || null)}
                  onDeleteStep={group.step ? () => handleDeleteStep(group.step!.id) : undefined}
                >
                  <SortableContext items={group.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                    {group.questions.map((question, i) => (
                      <SortableQuestionItem
                        key={question.id}
                        index={i + 1}
                        question={question}
                        isEditMode={isEditMode}
                        questions={questions}
                        setQuestions={setQuestions}
                        onDelete={handleDeleteQuestion}
                      />
                    ))}
                  </SortableContext>
                </StepGroup>
              );
            })}
            <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
              {draggingId ? (
                <QuestionRowPreview question={questions.find((q) => q.id === draggingId)} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
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

// A step: compact header (inline title in edit mode) and a drop zone for questions.
function StepGroup({
  id,
  label,
  title,
  count,
  isEditMode,
  onTitleChange,
  onAddQuestion,
  onDeleteStep,
  children,
}: {
  id: string;
  label: string;
  title: string;
  count: number;
  isEditMode: boolean;
  onTitleChange?: (value: string) => void;
  onAddQuestion: () => void;
  onDeleteStep?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      className={cn(
        "rounded-xl border bg-white shadow-sm transition-colors",
        isOver ? "border-primary/60 ring-2 ring-primary/15" : "border-gray-200",
      )}
    >
      <header className="group/step flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          {label}
        </span>
        {isEditMode && onTitleChange ? (
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled step"
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:border-gray-200 focus:border-gray-300 focus:outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{title}</span>
        )}
        <span className="shrink-0 text-xs tabular-nums text-gray-400">{count}</span>
        {isEditMode && (
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onAddQuestion}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Question
            </Button>
            {onDeleteStep && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-gray-400 hover:text-destructive"
                onClick={onDeleteStep}
                aria-label="Delete step"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </header>
      <div ref={setNodeRef} className="divide-y divide-gray-100">
        {children}
        {count === 0 && (
          <p className={cn("px-3 py-4 text-center text-xs", isOver ? "text-primary" : "text-gray-400")}>
            {isEditMode ? "Drop questions here" : "No questions in this step"}
          </p>
        )}
      </div>
    </section>
  );
}

// One compact, sortable question row.
function SortableQuestionItem({
  index,
  question,
  isEditMode,
  questions,
  setQuestions,
  onDelete,
}: {
  index: number;
  question: AssessmentQuestion;
  isEditMode: boolean;
  questions: AssessmentQuestion[];
  setQuestions: (questions: AssessmentQuestion[]) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
    disabled: !isEditMode,
  });
  const update = (patch: Partial<AssessmentQuestion>) =>
    setQuestions(questions.map((q) => (q.id === question.id ? { ...q, ...patch } : q)));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2 bg-white px-2 py-1.5 transition-colors hover:bg-gray-50/80",
        isDragging && "relative z-10 opacity-40",
      )}
    >
      {isEditMode && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-gray-400">{index}</span>
      <QuestionTypeIcon type={question.question_type} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      {isEditMode ? (
        <input
          value={question.question_text}
          onChange={(e) => update({ question_text: e.target.value })}
          placeholder="Enter question text"
          className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none"
        />
      ) : (
        <p className="min-w-0 flex-1 truncate px-1.5 text-sm text-gray-900" title={question.question_text}>
          {question.question_text}
        </p>
      )}
      {isEditMode ? (
        <button
          type="button"
          onClick={() => update({ required: !question.required })}
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
            question.required ? "bg-red-50 text-red-700 hover:bg-red-100" : "text-gray-400 hover:bg-gray-100",
          )}
          title="Toggle required"
        >
          {question.required ? "Required" : "Optional"}
        </button>
      ) : (
        question.required && <span className="shrink-0 text-[11px] font-medium text-red-600">Required</span>
      )}
      {isEditMode && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(question.id)}
          className="h-7 w-7 shrink-0 p-0 text-gray-300 opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Delete question"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// What follows the cursor while dragging.
function QuestionRowPreview({ question }: { question?: AssessmentQuestion }) {
  if (!question) return null;
  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 shadow-lg ring-1 ring-black/5">
      <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
      <QuestionTypeIcon type={question.question_type} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{question.question_text || "Untitled question"}</span>
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
