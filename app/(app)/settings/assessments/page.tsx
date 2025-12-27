"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function AssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<AssessmentDefinition[]>([]);
  const [systemAssessments, setSystemAssessments] = useState<AssessmentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingAssessmentId, setDeletingAssessmentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    base_assessment_id: "",
  });

  useEffect(() => {
    fetchAssessments();
  }, []);

  async function fetchAssessments() {
    try {
      setLoading(true);
      setError(null);

      // Fetch ALL assessments (system + custom) with assessment_types join
      const { data, error: dbError } = await supabase
        .from("assessment_definitions_v2")
        .select(`
          *,
          assessment_type:assessment_types(id, name, description)
        `)
        .order("is_system", { ascending: false })
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching assessments:", dbError);
        // Try fallback without relationship join
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("assessment_definitions_v2")
          .select("*")
          .order("is_system", { ascending: false })
          .order("created_at", { ascending: false });

        if (fallbackError) {
          setError(`Failed to load assessments: ${fallbackError.message}`);
          setAssessments([]);
          setSystemAssessments([]);
        } else {
          // Fetch assessment types separately
          const assessmentTypeIds = [...new Set(fallbackData?.map((a: any) => a.assessment_type_id) || [])];
          const { data: typesData } = await supabase
            .from("assessment_types")
            .select("id, name, description")
            .in("id", assessmentTypeIds);

          const assessmentsWithTypes = fallbackData?.map((assessment: AssessmentDefinition) => ({
            ...assessment,
            assessment_type: typesData?.find((t: any) => t.id === assessment.assessment_type_id) || null,
          })) || [];

          setAssessments(assessmentsWithTypes);
          setSystemAssessments(assessmentsWithTypes.filter((a: AssessmentDefinition) => a.is_system));
        }
      } else {
        setAssessments(data || []);
        setSystemAssessments(data?.filter((a: AssessmentDefinition) => a.is_system) || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setAssessments([]);
      setSystemAssessments([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSystemAssessments() {
    // Fetch only system assessments for the base selection dropdown
    const { data, error } = await supabase
      .from("assessment_definitions_v2")
      .select("*")
      .eq("is_system", true)
      .order("name", { ascending: true });

    if (!error && data) {
      setSystemAssessments(data);
    }
  }

  useEffect(() => {
    if (isDialogOpen) {
      fetchSystemAssessments();
    }
  }, [isDialogOpen]);

  function handleAssessmentClick(assessment: AssessmentDefinition) {
    router.push(`/settings/assessments/${assessment.id}`);
  }

  function handleEdit(assessment: AssessmentDefinition, e: React.MouseEvent) {
    e.stopPropagation();
    router.push(`/settings/assessments/${assessment.id}`);
  }

  function handleDeleteClick(assessmentId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingAssessmentId(assessmentId);
    setIsDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingAssessmentId) return;

    try {
      setDeleting(true);

      // Delete questions first (foreign key constraint)
      const { error: questionsError } = await supabase
        .from("assessment_questions_v2")
        .delete()
        .eq("assessment_definition_id", deletingAssessmentId);

      if (questionsError) {
        console.error("Error deleting assessment questions:", questionsError);
        setSubmitError(`Failed to delete assessment: ${questionsError.message}`);
        setDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeletingAssessmentId(null);
        return;
      }

      // Delete steps
      const { error: stepsError } = await supabase
        .from("assessment_steps_v2")
        .delete()
        .eq("assessment_definition_id", deletingAssessmentId);

      if (stepsError) {
        console.error("Error deleting assessment steps:", stepsError);
        setSubmitError(`Failed to delete assessment: ${stepsError.message}`);
        setDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeletingAssessmentId(null);
        return;
      }

      // Delete the assessment definition
      const { error: deleteError } = await supabase
        .from("assessment_definitions_v2")
        .delete()
        .eq("id", deletingAssessmentId);

      if (deleteError) {
        console.error("Error deleting assessment:", deleteError);
        setSubmitError(`Failed to delete assessment: ${deleteError.message}`);
        setDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeletingAssessmentId(null);
        return;
      }

      // Success - close dialog and refresh list
      setIsDeleteDialogOpen(false);
      setDeletingAssessmentId(null);
      await fetchAssessments();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!formData.base_assessment_id) {
        setSubmitError("Please select a base assessment");
        setSubmitting(false);
        return;
      }

      // Get the base assessment to get its assessment_type_id
      const baseAssessment = systemAssessments.find((a) => a.id === formData.base_assessment_id);
      if (!baseAssessment) {
        setSubmitError("Selected base assessment not found");
        setSubmitting(false);
        return;
      }

      // Create the custom assessment
      const { data: newAssessment, error: insertError } = await supabase
        .from("assessment_definitions_v2")
        .insert([
          {
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            is_system: false,
            base_assessment_id: formData.base_assessment_id,
            assessment_type_id: baseAssessment.assessment_type_id,
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating assessment:", insertError);
        setSubmitError(`Failed to create assessment: ${insertError.message}`);
        setSubmitting(false);
        return;
      }

      // Copy steps and questions from base assessment
      await copyBaseAssessmentData(formData.base_assessment_id, newAssessment.id);

      // Reset form and close dialog
      setFormData({
        name: "",
        description: "",
        base_assessment_id: "",
      });
      setIsDialogOpen(false);

      // Refresh assessments list
      await fetchAssessments();

      // Navigate to edit page
      router.push(`/settings/assessments/${newAssessment.id}`);
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyBaseAssessmentData(baseAssessmentId: string, newAssessmentId: string) {
    try {
      // Fetch steps from base assessment
      const { data: baseSteps, error: stepsError } = await supabase
        .from("assessment_steps_v2")
        .select("*")
        .eq("assessment_definition_id", baseAssessmentId)
        .order("step_order", { ascending: true });

      if (stepsError) {
        console.error("Error fetching base steps:", stepsError);
        throw stepsError;
      }

      // Fetch questions from base assessment
      const { data: baseQuestions, error: questionsError } = await supabase
        .from("assessment_questions_v2")
        .select("*")
        .eq("assessment_definition_id", baseAssessmentId)
        .order("question_order", { ascending: true });

      if (questionsError) {
        console.error("Error fetching base questions:", questionsError);
        throw questionsError;
      }

      // Create a map of old step_id to new step_id
      const stepIdMap = new Map<string, string>();

      // Insert steps with new assessment_definition_id
      if (baseSteps && baseSteps.length > 0) {
        const newSteps = baseSteps.map((step: any) => ({
          assessment_definition_id: newAssessmentId,
          step_order: step.step_order,
          title: step.title,
        }));

        const { data: insertedSteps, error: insertStepsError } = await supabase
          .from("assessment_steps_v2")
          .insert(newSteps)
          .select();

        if (insertStepsError) {
          console.error("Error inserting steps:", insertStepsError);
          throw insertStepsError;
        }

        // Map old step IDs to new step IDs
        if (insertedSteps) {
          baseSteps.forEach((oldStep: any, index: number) => {
            if (insertedSteps[index]) {
              stepIdMap.set(oldStep.id, insertedSteps[index].id);
            }
          });
        }
      }

      // Insert questions with new assessment_definition_id and mapped step_id
      if (baseQuestions && baseQuestions.length > 0) {
        const newQuestions = baseQuestions.map((question: any) => ({
          assessment_definition_id: newAssessmentId,
          question_text: question.question_text,
          question_type: question.question_type,
          question_order: question.question_order,
          required: question.required,
          step_id: question.step_id ? stepIdMap.get(question.step_id) || null : null,
        }));

        const { error: insertQuestionsError } = await supabase
          .from("assessment_questions_v2")
          .insert(newQuestions);

        if (insertQuestionsError) {
          console.error("Error inserting questions:", insertQuestionsError);
          throw insertQuestionsError;
        }
      }
    } catch (err) {
      console.error("Error copying base assessment data:", err);
      throw err;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Assessment Management</h1>
          <p className="text-muted-foreground mt-2">View and manage assessment definitions</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Assessment
        </Button>
      </div>

      {/* Assessments Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading assessments...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : assessments.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No system assessments found.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((assessment) => (
                <tr
                  key={assessment.id}
                  className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleAssessmentClick(assessment)}
                >
                  <td className="px-6 py-4 text-sm font-medium">{assessment.name || "-"}</td>
                  <td className="px-6 py-4 text-sm">
                    {assessment.assessment_type?.name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {assessment.description || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      assessment.is_system 
                        ? "bg-blue-100 text-blue-800" 
                        : "bg-green-100 text-green-800"
                    }`}>
                      {assessment.is_system ? "System" : "Custom"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {assessment.created_at
                      ? new Date(assessment.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                    {!assessment.is_system && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleEdit(assessment, e)}
                          className="h-8"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteClick(assessment.id, e)}
                          className="h-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Assessment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Add New Assessment</DialogTitle>
            <DialogDescription>
              Create a custom assessment based on a system assessment
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Assessment Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter assessment name"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="base_assessment" className="text-sm font-medium">
                Which base should this custom survey use? <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.base_assessment_id}
                onValueChange={(value) => setFormData({ ...formData, base_assessment_id: value })}
                required
              >
                <SelectTrigger id="base_assessment">
                  <SelectValue placeholder="Select a base assessment" />
                </SelectTrigger>
                <SelectContent>
                  {systemAssessments.map((assessment) => (
                    <SelectItem key={assessment.id} value={assessment.id}>
                      {assessment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description (optional)
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter assessment description"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            {submitError && (
              <div className="text-sm text-destructive">{submitError}</div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Assessment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Assessment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this custom assessment? This action cannot be undone.
              All associated steps and questions will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingAssessmentId(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Assessment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

