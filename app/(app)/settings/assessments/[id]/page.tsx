"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, GripVertical, Save, SlidersHorizontal, Settings2, AlignLeft, Type, Heading, ArrowRightLeft } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { parseConfig, renderQuestionPreview, DEFAULT_SLIDER, DEFAULT_NOMINATION_RULES, DEFAULT_COPY, type DefinitionConfig, type QuestionConfig } from "@/lib/assessment-config";
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
  config?: unknown;
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
  step_key?: string | null;
  phase_number?: number;
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
  config?: QuestionConfig | null;
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
  // Programme config (assessment_definitions_v2.config) — null for classic definitions.
  const [programmeConfig, setProgrammeConfig] = useState<DefinitionConfig | null>(null);
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
  // Habit-journey programmes split steps by phase; the editor shows one phase at a time.
  const [activePhase, setActivePhase] = useState(1);

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
      setProgrammeConfig(parseConfig<DefinitionConfig>(assessment.config));
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
            phase_number: programmeConfig?.variant ? activePhase : 1,
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

  async function handleSaveQuestion(questionText: string, required: boolean, stepId: string | null, questionType = "textarea") {
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
            question_type: questionType,
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
          ...(programmeConfig ? { config: programmeConfig } : {}),
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
            step_key: step.step_key ?? null,
            phase_number: step.phase_number ?? 1,
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
            config: question.config ?? null,
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

  const grid = gridKey(isEditMode, !!programmeConfig?.variant);

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

      {programmeConfig?.variant && (
        <ProgrammeSettingsCard config={programmeConfig} onChange={setProgrammeConfig} editable={isEditMode} />
      )}

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
                  {programmeConfig?.variant ? `Step in Phase ${activePhase}` : "Step"}
                </Button>
              </div>
            )}
          </div>

          {isEditMode && questionGroups.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-muted-foreground">
              No questions yet. Add a step or a question to get started.
            </div>
          )}

          {questionGroups.length > 0 && (
            <>
              {programmeConfig?.variant && (
                <PhaseTabs
                  config={programmeConfig}
                  active={activePhase}
                  onChange={setActivePhase}
                  counts={[1, 2].map((n) => {
                    const phaseGroups = questionGroups.filter((g) => (g.step?.phase_number ?? 1) === n);
                    return { steps: phaseGroups.filter((g) => g.step).length, questions: phaseGroups.reduce((t, g) => t + g.questions.length, 0) };
                  })}
                />
              )}
              <QuestionTableHeader grid={grid} programme={!!programmeConfig?.variant} edit={isEditMode} />
            </>
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
            {questionGroups
              .filter((group) => !programmeConfig?.variant || (group.step?.phase_number ?? 1) === activePhase)
              .map((group, groupIndex) => {
              const isSingleStep = steps.length === 1 && group.step !== null;
              const stepLabel = group.step ? (isSingleStep ? "Questions" : `Step ${group.step.step_order}`) : "General";
              const stepTitle = group.step?.title?.trim() || "";
              const showTitle = stepTitle && !new RegExp(`^Step\\s+${group.step?.step_order}$`, "i").test(stepTitle);
              return (
                <StepGroup
                  key={group.step?.id || `ungrouped-${groupIndex}`}
                  id={containerId(group.step?.id ?? null)}
                  grid={grid}
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
                  phase={programmeConfig?.variant ? group.step?.phase_number ?? 1 : undefined}
                  stepKey={group.step?.step_key ?? null}
                  onPhaseChange={
                    group.step
                      ? (value) => setSteps(steps.map((s) => (s.id === group.step!.id ? { ...s, phase_number: value } : s)))
                      : undefined
                  }
                >
                  <SortableContext items={group.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                    {group.questions.map((question, i) => (
                      <SortableQuestionItem
                        key={question.id}
                        index={group.questions.slice(0, i + 1).filter((q) => q.question_type !== "heading" && q.question_type !== "info").length}
                        question={question}
                        isEditMode={isEditMode}
                        questions={questions}
                        setQuestions={setQuestions}
                        onDelete={handleDeleteQuestion}
                        showProgrammeFields={!!programmeConfig?.variant}
                        defaultSlider={programmeConfig?.slider}
                        grid={grid}
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

// ---------------------------------------------------------------- question table layout
//
// Step headers, the column header and every question row share one grid, so
// "Answered by", "Type", "Required" and the actions always line up.
// (Literal class strings so Tailwind can see them.)
const GRID = {
  edit: "grid-cols-[20px_28px_minmax(0,1fr)_136px_88px_64px]",
  editProgramme: "grid-cols-[20px_28px_minmax(0,1fr)_152px_136px_88px_64px]",
  view: "grid-cols-[28px_minmax(0,1fr)_136px_88px]",
  viewProgramme: "grid-cols-[28px_minmax(0,1fr)_152px_136px_88px]",
} as const;
type GridKey = keyof typeof GRID;
const gridKey = (edit: boolean, programme: boolean): GridKey =>
  edit ? (programme ? "editProgramme" : "edit") : programme ? "viewProgramme" : "view";

const QUESTION_TYPES: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "textarea", label: "Long text", icon: AlignLeft },
  { value: "text", label: "Short text", icon: Type },
  { value: "slider", label: "Slider", icon: SlidersHorizontal },
  { value: "heading", label: "Heading", icon: Heading },
];
const typeMeta = (t?: string | null) => QUESTION_TYPES.find((x) => x.value === t) ?? QUESTION_TYPES[0];

const AUDIENCES: { value: string; label: string; dot: string }[] = [
  { value: "__all__", label: "Everyone", dot: "bg-gray-300" },
  { value: "participant", label: "Participant", dot: "bg-sky-500" },
  { value: "reviewer", label: "Reviewer", dot: "bg-amber-500" },
  { value: "self_reflection", label: "Self-reflection", dot: "bg-violet-500" },
];
const audienceMeta = (v?: string | null) => AUDIENCES.find((a) => a.value === (v ?? "__all__")) ?? AUDIENCES[0];

const isHeadingType = (t?: string | null) => t === "heading" || t === "info";

/** Phase 1 / Phase 2 tabs for habit-journey programmes. */
function PhaseTabs({
  config,
  active,
  onChange,
  counts,
}: {
  config: DefinitionConfig;
  active: number;
  onChange: (phase: number) => void;
  counts: { steps: number; questions: number }[];
}) {
  const phases = [1, 2].map((n) => {
    const cfg = config.phases?.[String(n)];
    return {
      n,
      title: cfg?.isSelfReflection ? "Self-reflection" : n === 1 ? "Habit & feedback" : "Follow-up",
      tag: cfg?.name ?? `T${n}`,
      hint: cfg?.isSelfReflection
        ? "Reflection, re-invite reviewers, final report — eligible participants only"
        : "Define the habit, nominate reviewers, first report",
    };
  });
  return (
    <div role="tablist" aria-label="Phases" className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100/80 p-1">
      {phases.map((p, i) => {
        const selected = p.n === active;
        return (
          <button
            key={p.n}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(p.n)}
            className={cn(
              "flex items-start gap-3 rounded-lg px-4 py-2.5 text-left transition-all",
              selected ? "bg-white shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:bg-white/60",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                selected ? "bg-primary text-primary-foreground" : "bg-gray-200 text-gray-500",
              )}
            >
              {p.n}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold", selected ? "text-gray-900" : "text-gray-600")}>
                  Phase {p.n} · {p.title}
                </span>
                <span className="rounded bg-gray-100 px-1.5 py-px font-mono text-[10px] text-gray-500">{p.tag}</span>
              </span>
              <span className="block truncate text-xs text-gray-500">
                {counts[i].steps} step{counts[i].steps === 1 ? "" : "s"} · {counts[i].questions} item{counts[i].questions === 1 ? "" : "s"} — {p.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Column titles above all steps. */
function QuestionTableHeader({ grid, programme, edit }: { grid: GridKey; programme: boolean; edit: boolean }) {
  return (
    <div className={cn("grid items-center gap-3 px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400", GRID[grid])}>
      {edit && <span />}
      <span className="text-right">#</span>
      <span className={edit ? "pl-2" : ""}>Question</span>
      {programme && <span>Answered by</span>}
      <span>Type</span>
      <span>Required</span>
      {edit && <span />}
    </div>
  );
}

// A step: header on the shared grid + a drop zone for its questions.
function StepGroup({
  id,
  grid,
  label,
  title,
  count,
  isEditMode,
  onTitleChange,
  onAddQuestion,
  onDeleteStep,
  phase,
  stepKey,
  onPhaseChange,
  children,
}: {
  id: string;
  grid: GridKey;
  label: string;
  title: string;
  count: number;
  isEditMode: boolean;
  onTitleChange?: (value: string) => void;
  onAddQuestion: () => void;
  onDeleteStep?: () => void;
  /** Programme phase (habit journeys); undefined hides the control. */
  phase?: number;
  stepKey?: string | null;
  onPhaseChange?: (value: number) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const programme = phase !== undefined;
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-white shadow-sm transition-colors",
        isOver ? "border-primary/60 ring-2 ring-primary/15" : "border-gray-200",
      )}
    >
      <header className={cn("group/step grid min-h-[44px] items-center gap-3 border-b border-gray-100 bg-gray-50/70 px-3 py-1.5", GRID[grid])}>
        {/* Step label + title span the handle, number and question columns */}
        <div className={cn("flex min-w-0 items-center gap-2", isEditMode ? "col-span-3" : "col-span-2")}>
          <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600 ring-1 ring-gray-200">
            {label}
          </span>
          {isEditMode && onTitleChange ? (
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Untitled step"
              aria-label="Step title"
              className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 hover:border-gray-200 hover:bg-white focus:border-gray-300 focus:bg-white focus:outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{title}</span>
          )}
          <span className="shrink-0 text-xs tabular-nums text-gray-400">
            {count} {count === 1 ? "item" : "items"}
          </span>
        </div>

        {programme && (
          <span className="truncate font-mono text-[11px] text-gray-400" title="Step key">
            {stepKey || "—"}
          </span>
        )}

        {/* "Move to the other phase" sits in the "Type" column */}
        <div>
          {programme && isEditMode && onPhaseChange && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-500 opacity-0 transition-opacity hover:text-gray-900 focus-visible:opacity-100 group-hover/step:opacity-100"
              onClick={() => onPhaseChange(phase === 1 ? 2 : 1)}
              title={`Move this step to Phase ${phase === 1 ? 2 : 1}`}
            >
              <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
              To Phase {phase === 1 ? 2 : 1}
            </Button>
          )}
        </div>

        {/* "+ Question" sits in the "Required" column, the bin in the actions column */}
        {isEditMode ? (
          <>
            <Button variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs text-primary hover:text-primary" onClick={onAddQuestion}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Question
            </Button>
            <div className="flex justify-end">
              {onDeleteStep && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-gray-400 hover:bg-red-50 hover:text-destructive"
                  onClick={onDeleteStep}
                  aria-label="Delete step"
                  title="Delete step"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </>
        ) : (
          <span />
        )}
      </header>
      <div ref={setNodeRef} className="divide-y divide-gray-100">
        {children}
        {count === 0 && (
          <p className={cn("px-3 py-4 text-center text-xs", isOver ? "text-primary" : "text-gray-400")}>
            {isEditMode ? "Drop questions here, or add one" : "No questions in this step"}
          </p>
        )}
      </div>
    </section>
  );
}

/** Question text shown formatted (bold/italics, placeholder chips); click to edit the source. */
function QuestionTextCell({
  value,
  editable,
  isHeading,
  onChange,
}: {
  value: string;
  editable: boolean;
  isHeading: boolean;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const preview = (
    <div
      className={cn(
        "line-clamp-2 text-sm leading-snug text-gray-900 [&_b]:font-semibold [&_strong]:font-semibold",
        isHeading && "text-gray-600",
        !value && "italic text-gray-400",
      )}
      dangerouslySetInnerHTML={{ __html: value ? renderQuestionPreview(value) : isHeading ? "Heading text" : "Question text" }}
    />
  );
  if (!editable) return <div title={value.replace(/<[^>]*>/g, " ")}>{preview}</div>;
  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === "Escape" && (e.currentTarget as HTMLTextAreaElement).blur()}
        rows={Math.min(5, Math.max(2, Math.ceil(value.length / 90)))}
        className="w-full resize-none rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-[12px] leading-relaxed text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-gray-100/80"
      title="Click to edit"
    >
      {preview}
    </button>
  );
}

// One sortable question row on the shared grid (with an expandable settings panel).
function SortableQuestionItem({
  index,
  question,
  isEditMode,
  questions,
  setQuestions,
  onDelete,
  showProgrammeFields,
  defaultSlider,
  grid,
}: {
  index: number;
  question: AssessmentQuestion;
  isEditMode: boolean;
  questions: AssessmentQuestion[];
  setQuestions: (questions: AssessmentQuestion[]) => void;
  onDelete: (id: string) => void;
  showProgrammeFields?: boolean;
  defaultSlider?: DefinitionConfig["slider"];
  grid: GridKey;
}) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
    disabled: !isEditMode,
  });
  const update = (patch: Partial<AssessmentQuestion>) =>
    setQuestions(questions.map((q) => (q.id === question.id ? { ...q, ...patch } : q)));
  const config = (question.config ?? {}) as QuestionConfig;
  const isHeading = isHeadingType(question.question_type);
  const type = typeMeta(question.question_type);
  const audience = audienceMeta(config.context);
  const TypeIcon = type.icon;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("bg-white", isDragging && "relative z-10 opacity-40", isHeading && "bg-gray-50/40")}
    >
      <div className={cn("group grid min-h-[44px] items-center gap-3 px-3 py-1.5", GRID[grid])}>
        {isEditMode && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-7 w-5 cursor-grab items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <span className="flex justify-end text-xs tabular-nums text-gray-400">
          {isHeading ? <Heading className="h-3.5 w-3.5 text-gray-300" /> : index}
        </span>

        <QuestionTextCell
          value={question.question_text}
          editable={isEditMode}
          isHeading={isHeading}
          onChange={(v) => update({ question_text: v })}
        />

        {showProgrammeFields &&
          (isEditMode ? (
            <Select
              value={config.context ?? "__all__"}
              onValueChange={(v) =>
                update({ config: { ...config, context: v === "__all__" ? undefined : (v as QuestionConfig["context"]) } })
              }
            >
              <SelectTrigger className="h-8 w-full text-xs" aria-label="Answered by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", a.dot)} />
                      {a.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="flex items-center gap-2 text-xs text-gray-700">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", audience.dot)} />
              {audience.label}
            </span>
          ))}

        {isEditMode ? (
          <Select value={type.value} onValueChange={(v) => update({ question_type: v })}>
            <SelectTrigger className="h-8 w-full text-xs" aria-label="Question type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <span className="flex items-center gap-2">
                    <t.icon className="h-3.5 w-3.5 text-gray-400" />
                    {t.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex items-center gap-2 text-xs text-gray-700">
            <TypeIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {type.label}
          </span>
        )}

        {/* Required: a switch in edit mode; headings can't be required */}
        {isHeading ? (
          <span className="text-xs text-gray-300">—</span>
        ) : isEditMode ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
            <Switch checked={question.required} onCheckedChange={(checked) => update({ required: checked })} aria-label="Required" />
            <span className={question.required ? "font-medium text-gray-900" : "text-gray-400"}>{question.required ? "Yes" : "No"}</span>
          </label>
        ) : (
          <span className={cn("text-xs", question.required ? "font-medium text-gray-900" : "text-gray-400")}>
            {question.required ? "Required" : "Optional"}
          </span>
        )}

        {isEditMode && (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen((v) => !v)}
              className={cn("h-7 w-7 p-0 text-gray-400 hover:text-gray-700", open && "bg-gray-100 text-gray-700")}
              aria-label="Question settings"
              aria-expanded={open}
              title="Settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(question.id)}
              className="h-7 w-7 p-0 text-gray-400 hover:bg-red-50 hover:text-destructive"
              aria-label="Delete question"
              title="Delete question"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {isEditMode && open && (
        <QuestionSettingsPanel
          question={question}
          config={config}
          onChange={(next) => update({ config: next })}
          defaultSlider={defaultSlider}
        />
      )}
    </div>
  );
}

function SettingsField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

const fieldClass =
  "h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none";

// Per-question config: who answers it, slider bounds/labels, length limits, help text.
function QuestionSettingsPanel({
  question,
  config,
  onChange,
  defaultSlider,
}: {
  question: AssessmentQuestion;
  config: QuestionConfig;
  onChange: (config: QuestionConfig) => void;
  defaultSlider?: DefinitionConfig["slider"];
}) {
  const set = (patch: Partial<QuestionConfig>) => {
    const next: Record<string, unknown> = { ...config, ...patch };
    Object.keys(next).forEach((k) => (next[k] === "" || next[k] === undefined) && delete next[k]);
    onChange(next as QuestionConfig);
  };
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const slider = { ...DEFAULT_SLIDER, ...(defaultSlider ?? {}) };
  const isSlider = question.question_type === "slider";
  const isHeading = question.question_type === "heading" || question.question_type === "info";

  return (
    <div className="mx-3 mb-3 grid gap-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <SettingsField label="Key" hint="Stable id used by reports">
        <input className={fieldClass} value={config.key ?? ""} placeholder="e.g. observe_actions" onChange={(e) => set({ key: e.target.value.trim() || undefined })} />
      </SettingsField>
      {isSlider && (
        <>
          <SettingsField label="Scale">
            <div className="flex items-center gap-1.5">
              <input type="number" className={fieldClass} value={config.min ?? ""} placeholder={String(slider.min)} onChange={(e) => set({ min: num(e.target.value) })} aria-label="Minimum" />
              <span className="text-gray-400">–</span>
              <input type="number" className={fieldClass} value={config.max ?? ""} placeholder={String(slider.max)} onChange={(e) => set({ max: num(e.target.value) })} aria-label="Maximum" />
            </div>
          </SettingsField>
          <SettingsField label="End labels">
            <div className="flex items-center gap-1.5">
              <input className={fieldClass} value={config.labels?.min ?? ""} placeholder={slider.labels?.min} onChange={(e) => set({ labels: { ...config.labels, min: e.target.value || undefined } })} aria-label="Low label" />
              <input className={fieldClass} value={config.labels?.max ?? ""} placeholder={slider.labels?.max} onChange={(e) => set({ labels: { ...config.labels, max: e.target.value || undefined } })} aria-label="High label" />
            </div>
          </SettingsField>
        </>
      )}
      {!isSlider && !isHeading && (
        <>
          <SettingsField label="Max length">
            <input type="number" className={fieldClass} value={config.maxLength ?? ""} placeholder="No limit" onChange={(e) => set({ maxLength: num(e.target.value) })} />
          </SettingsField>
          <SettingsField label="Placeholder">
            <input className={fieldClass} value={config.placeholder ?? ""} onChange={(e) => set({ placeholder: e.target.value })} />
          </SettingsField>
        </>
      )}
      <SettingsField label="Tooltip" hint="Shown as help next to the step">
        <input className={fieldClass} value={config.tooltip ?? ""} onChange={(e) => set({ tooltip: e.target.value })} />
      </SettingsField>
      {!isSlider && !isHeading && (
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={!!config.sharedWithReviewers}
            onChange={(e) => set({ sharedWithReviewers: e.target.checked || undefined })}
          />
          Shown to reviewers as the commitment
        </label>
      )}
      <p className="text-[11px] leading-relaxed text-gray-400 sm:col-span-2 lg:col-span-4">
        Question text supports <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code> and <code>&lt;br&gt;</code>, plus{" "}
        <code>{"{participant_name}"}</code> and <code>{"{t1_commitment}"}</code> (the participant&apos;s shared answer).
      </p>
    </div>
  );
}

// Programme-level config: nomination rules, slider defaults, report threshold, copy.
function ProgrammeSettingsCard({
  config,
  onChange,
  editable,
}: {
  config: DefinitionConfig;
  onChange: (config: DefinitionConfig) => void;
  editable: boolean;
}) {
  const rules = { ...DEFAULT_NOMINATION_RULES, ...(config.nominationRules ?? {}) };
  const slider = { ...DEFAULT_SLIDER, ...(config.slider ?? {}) };
  const copy = { ...DEFAULT_COPY, ...(config.copy ?? {}) };
  const num = (v: string, fallback: number) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));
  const setRule = (channel: "internal" | "external", bound: "min" | "max", v: string) =>
    onChange({ ...config, nominationRules: { ...rules, [channel]: { ...rules[channel], [bound]: num(v, rules[channel][bound]) } } });

  const cell = ({ label, value, onValue, type = "number" }: { label: string; value: string | number; onValue: (v: string) => void; type?: string }) => (
    <SettingsField key={label} label={label}>
      <input type={type} className={fieldClass} value={value} disabled={!editable} onChange={(e) => onValue(e.target.value)} />
    </SettingsField>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Programme settings</CardTitle>
          <code className="rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500">{config.variant}</code>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cell({ label: "Programme name", type: "text", value: copy.programName, onValue: (v) => onChange({ ...config, copy: { ...config.copy, programName: v } }) })}
          {cell({ label: "Internal reviewers min", value: rules.internal.min, onValue: (v) => setRule("internal", "min", v) })}
          {cell({ label: "Internal reviewers max", value: rules.internal.max, onValue: (v) => setRule("internal", "max", v) })}
          {cell({ label: "Report min responses", value: config.report?.minResponses ?? 2, onValue: (v) => onChange({ ...config, report: { ...config.report, minResponses: num(v, 2) } }) })}
          {cell({ label: "Slider scale (min)", value: slider.min, onValue: (v) => onChange({ ...config, slider: { ...slider, min: num(v, slider.min) } }) })}
          {cell({ label: "External reviewers min", value: rules.external.min, onValue: (v) => setRule("external", "min", v) })}
          {cell({ label: "External reviewers max", value: rules.external.max, onValue: (v) => setRule("external", "max", v) })}
          {cell({ label: "Self-reflection min reviews", value: rules.selfReflectionMinReviews, onValue: (v) => onChange({ ...config, nominationRules: { ...rules, selfReflectionMinReviews: num(v, rules.selfReflectionMinReviews) } }) })}
          {cell({ label: "Slider scale (max)", value: slider.max, onValue: (v) => onChange({ ...config, slider: { ...slider, max: num(v, slider.max) } }) })}
          {cell({ label: "Slider low label", type: "text", value: slider.labels?.min ?? "", onValue: (v) => onChange({ ...config, slider: { ...slider, labels: { ...slider.labels, min: v } } }) })}
          {cell({ label: "Slider high label", type: "text", value: slider.labels?.max ?? "", onValue: (v) => onChange({ ...config, slider: { ...slider, labels: { ...slider.labels, max: v } } }) })}
          {cell({ label: "Report marker label", type: "text", value: copy.reportYouLabel, onValue: (v) => onChange({ ...config, copy: { ...config.copy, reportYouLabel: v } }) })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Changes apply when you save the assessment. Avoid changing scales or thresholds while a cohort is running.
        </p>
      </CardContent>
    </Card>
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
  onSave: (text: string, required: boolean, stepId: string | null, questionType: string) => void;
  onClose: () => void;
}) {
  const [questionText, setQuestionText] = useState(question?.question_text || "");
  const [questionType, setQuestionType] = useState(question?.question_type || "textarea");
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
      <div className="space-y-2">
        <label htmlFor="question-type" className="text-sm font-medium">
          Type
        </label>
        <Select value={questionType} onValueChange={setQuestionType}>
          <SelectTrigger id="question-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Button onClick={() => onSave(questionText, required, stepId, questionType)} disabled={!questionText.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
