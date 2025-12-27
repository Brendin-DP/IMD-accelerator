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
import { supabase } from "@/lib/supabaseClient";

interface Plan {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  [key: string]: any;
}

interface AssessmentType {
  id: string;
  name: string;
  description?: string;
}

interface AssessmentDefinition {
  id: string;
  name: string;
  description?: string;
  assessment_type_id: string;
  is_system: boolean;
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNewPlanDialogOpen, setIsNewPlanDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    assessment_type_ids: [] as string[],
  });
  const [newPlanFormData, setNewPlanFormData] = useState({
    name: "",
    description: "",
    assessment_definition_ids: [] as string[],
  });
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([]);
  const [assessmentDefinitions, setAssessmentDefinitions] = useState<AssessmentDefinition[]>([]);
  const [loadingAssessmentTypes, setLoadingAssessmentTypes] = useState(false);
  const [loadingAssessmentDefinitions, setLoadingAssessmentDefinitions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingNewPlan, setSubmittingNewPlan] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNewPlanError, setSubmitNewPlanError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    if (isDialogOpen) {
      fetchAssessmentTypes();
    } else {
      // Reset form when dialog closes
      setFormData({
        name: "",
        description: "",
        assessment_type_ids: [],
      });
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (isNewPlanDialogOpen) {
      fetchAssessmentDefinitions();
    } else {
      // Reset form when dialog closes
      setNewPlanFormData({
        name: "",
        description: "",
        assessment_definition_ids: [],
      });
    }
  }, [isNewPlanDialogOpen]);

  async function fetchPlans() {
    try {
      setLoading(true);
      setError(null);
      
      // Query plans table
      const { data, error: dbError } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching plans:", dbError);
        setError(`Failed to load plans: ${dbError.message}`);
        setPlans([]);
      } else {
        setPlans(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssessmentTypes() {
    try {
      setLoadingAssessmentTypes(true);
      const { data, error: dbError } = await supabase
        .from("assessment_types")
        .select("id, name, description")
        .order("name", { ascending: true });

      if (dbError) {
        console.error("Error fetching assessment types:", dbError);
        setAssessmentTypes([]);
      } else {
        setAssessmentTypes(data || []);
      }
    } catch (err) {
      console.error("Unexpected error fetching assessment types:", err);
      setAssessmentTypes([]);
    } finally {
      setLoadingAssessmentTypes(false);
    }
  }

  async function fetchAssessmentDefinitions() {
    try {
      setLoadingAssessmentDefinitions(true);
      const { data, error: dbError } = await supabase
        .from("assessment_definitions_v2")
        .select("id, name, description, assessment_type_id, is_system")
        .order("name", { ascending: true });

      if (dbError) {
        console.error("Error fetching assessment definitions:", dbError);
        setAssessmentDefinitions([]);
      } else {
        setAssessmentDefinitions(data || []);
      }
    } catch (err) {
      console.error("Unexpected error fetching assessment definitions:", err);
      setAssessmentDefinitions([]);
    } finally {
      setLoadingAssessmentDefinitions(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleAssessmentTypeToggle(assessmentTypeId: string) {
    setFormData((prev) => {
      const isSelected = prev.assessment_type_ids.includes(assessmentTypeId);
      return {
        ...prev,
        assessment_type_ids: isSelected
          ? prev.assessment_type_ids.filter((id) => id !== assessmentTypeId)
          : [...prev.assessment_type_ids, assessmentTypeId],
      };
    });
  }

  function handleNewPlanInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setNewPlanFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleAssessmentDefinitionToggle(assessmentDefinitionId: string) {
    setNewPlanFormData((prev) => {
      const isSelected = prev.assessment_definition_ids.includes(assessmentDefinitionId);
      return {
        ...prev,
        assessment_definition_ids: isSelected
          ? prev.assessment_definition_ids.filter((id) => id !== assessmentDefinitionId)
          : [...prev.assessment_definition_ids, assessmentDefinitionId],
      };
    });
  }

  function handleEdit(plan: Plan) {
    router.push(`/settings/plans/${plan.id}`);
  }

  function handleDeleteClick(planId: string) {
    setDeletingPlanId(planId);
    setIsDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingPlanId) return;

    try {
      setDeleting(true);

      // Delete plan_assessments first (foreign key constraint)
      const { error: assessmentsError } = await supabase
        .from("plan_assessments")
        .delete()
        .eq("plan_id", deletingPlanId);

      if (assessmentsError) {
        console.error("Error deleting plan assessments:", assessmentsError);
        setSubmitError(`Failed to delete plan: ${assessmentsError.message}`);
        setDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeletingPlanId(null);
        return;
      }

      // Delete the plan
      const { error: deleteError } = await supabase
        .from("plans")
        .delete()
        .eq("id", deletingPlanId);

      if (deleteError) {
        console.error("Error deleting plan:", deleteError);
        setSubmitError(`Failed to delete plan: ${deleteError.message}`);
        setDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeletingPlanId(null);
        return;
      }

      // Close dialog and refresh plans list
      setIsDeleteDialogOpen(false);
      setDeletingPlanId(null);
      await fetchPlans();
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
      // Prepare plan data
      const planData: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
      };

      // Insert plan
      const { data: plan, error: insertError } = await supabase
        .from("plans")
        .insert([planData])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating plan:", insertError);
        setSubmitError(`Failed to create plan: ${insertError.message}`);
        setSubmitting(false);
        return;
      }

      // Insert plan_assessments if assessment types are selected
      if (formData.assessment_type_ids.length > 0) {
        const planAssessmentsToCreate = formData.assessment_type_ids.map((assessmentTypeId) => ({
          plan_id: plan.id,
          assessment_type_id: assessmentTypeId,
        }));

        const { error: assessmentsError } = await supabase
          .from("plan_assessments")
          .insert(planAssessmentsToCreate);

        if (assessmentsError) {
          console.error("Error creating plan assessments:", assessmentsError);
          setSubmitError(`Failed to link assessment types: ${assessmentsError.message}`);
          setSubmitting(false);
          return;
        }
      }

      // Reset form and close dialog
      setFormData({
        name: "",
        description: "",
        assessment_type_ids: [],
      });
      setIsDialogOpen(false);
      
      // Refresh plans list
      await fetchPlans();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNewPlanSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingNewPlan(true);
    setSubmitNewPlanError(null);

    try {
      // Prepare plan data
      const planData: any = {
        name: newPlanFormData.name.trim(),
        description: newPlanFormData.description.trim() || null,
      };

      // Insert plan
      const { data: plan, error: insertError } = await supabase
        .from("plans")
        .insert([planData])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating plan:", insertError);
        setSubmitNewPlanError(`Failed to create plan: ${insertError.message}`);
        setSubmittingNewPlan(false);
        return;
      }

      // Insert plan_assessments if assessment definitions are selected
      // Using plan_assessments table to link plans to assessment_definitions_v2
      // We need to get the assessment_type_id from each selected assessment_definition
      if (newPlanFormData.assessment_definition_ids.length > 0) {
        // Fetch the assessment_type_id for each selected assessment definition
        const { data: definitionsData, error: definitionsError } = await supabase
          .from("assessment_definitions_v2")
          .select("id, assessment_type_id")
          .in("id", newPlanFormData.assessment_definition_ids);

        if (definitionsError) {
          console.error("Error fetching assessment definitions:", definitionsError);
          setSubmitNewPlanError(`Failed to fetch assessment definitions: ${definitionsError.message}`);
          setSubmittingNewPlan(false);
          return;
        }

        // Create a map of assessment_type_id -> assessment_definition_id
        // Store the selected assessment_definition_id for each assessment_type_id
        // This allows us to know which specific assessment definition was selected (custom or system)
        const typeToDefinitionMap = new Map<string, string>();
        
        // For each selected definition, map its assessment_type_id to its definition id
        definitionsData?.forEach((def: any) => {
          typeToDefinitionMap.set(def.assessment_type_id, def.id);
        });

        // Extract unique assessment_type_ids from the selected definitions
        const assessmentTypeIds = [...new Set(definitionsData?.map((d: any) => d.assessment_type_id) || [])];

        if (assessmentTypeIds.length > 0) {
          // Insert plan_assessments with assessment_type_id
          const planAssessmentsToCreate = assessmentTypeIds.map((assessmentTypeId) => ({
            plan_id: plan.id,
            assessment_type_id: assessmentTypeId,
          }));

          const { error: assessmentsError } = await supabase
            .from("plan_assessments")
            .insert(planAssessmentsToCreate);

          if (assessmentsError) {
            console.error("Error creating plan assessments:", assessmentsError);
            setSubmitNewPlanError(`Failed to link assessment definitions: ${assessmentsError.message}`);
            setSubmittingNewPlan(false);
            return;
          }

          // Store the assessment_definition_id mapping in the plan's description as JSON
          // This is a workaround until we can add a proper table/column
          // Format: <!--PLAN_ASSESSMENT_DEFINITIONS:{"type_id_1":"def_id_1","type_id_2":"def_id_2"}-->
          if (typeToDefinitionMap.size > 0) {
            const definitionMapping = Object.fromEntries(typeToDefinitionMap);
            const mappingJson = JSON.stringify(definitionMapping);
            const mappingMarker = `<!--PLAN_ASSESSMENT_DEFINITIONS:${mappingJson}-->`;
            
            const currentDesc = plan.description || "";
            // Remove old mapping if it exists
            const descWithoutOldMapping = currentDesc.replace(/<!--PLAN_ASSESSMENT_DEFINITIONS:.*?-->/g, "").trim();
            const updatedDesc = descWithoutOldMapping 
              ? `${descWithoutOldMapping}\n${mappingMarker}`
              : mappingMarker;
            
            await supabase
              .from("plans")
              .update({ description: updatedDesc })
              .eq("id", plan.id);
          }
        }
      }

      // Reset form and close dialog
      setNewPlanFormData({
        name: "",
        description: "",
        assessment_definition_ids: [],
      });
      setIsNewPlanDialogOpen(false);
      
      // Refresh plans list
      await fetchPlans();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitNewPlanError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmittingNewPlan(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Plan Buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plan Management</h1>
          <p className="text-muted-foreground mt-2">Manage subscription plans and pricing tiers</p>
        </div>
        <Button onClick={() => setIsNewPlanDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Plan
        </Button>
      </div>

      {/* Plans Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading plans...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : plans.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No plans found. Click "Add Plan" to create your first plan.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">{plan.name || "-"}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {plan.description || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {plan.created_at
                      ? new Date(plan.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(plan)}
                        className="h-8"
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(plan.id)}
                        className="h-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Plan Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Add New Plan</DialogTitle>
            <DialogDescription>
              Create a new plan by filling in the information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2.5">
              <label htmlFor="name" className="text-sm font-medium">
                Plan Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="e.g., Basic Plan, Premium Plan"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Plan description"
                rows={3}
                className="w-full border border-input bg-background px-3 py-2 rounded-md text-sm resize-none"
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium">
                Assessment Types
              </label>
              {loadingAssessmentTypes ? (
                <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                  Loading assessment types...
                </div>
              ) : assessmentTypes.length === 0 ? (
                <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                  No assessment types available
                </div>
              ) : (
                <>
                  <div className="border rounded-md max-h-60 overflow-y-auto p-2">
                    <div className="space-y-2">
                      {assessmentTypes.map((assessmentType) => (
                        <label
                          key={assessmentType.id}
                          className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.assessment_type_ids.includes(assessmentType.id)}
                            onChange={() => handleAssessmentTypeToggle(assessmentType.id)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">
                            {assessmentType.name}
                            {assessmentType.description && (
                              <span className="text-muted-foreground ml-1">
                                - {assessmentType.description}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formData.assessment_type_ids.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formData.assessment_type_ids.length} assessment type(s) selected
                    </p>
                  )}
                </>
              )}
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
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
                {submitting ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add New Plan Dialog (using assessment_definitions_v2) */}
      <Dialog open={isNewPlanDialogOpen} onOpenChange={setIsNewPlanDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsNewPlanDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Add New Plan</DialogTitle>
            <DialogDescription>
              Create a new plan by linking assessment definitions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleNewPlanSubmit} className="space-y-4">
            <div className="space-y-2.5">
              <label htmlFor="new-plan-name" className="text-sm font-medium">
                Plan Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="new-plan-name"
                name="name"
                value={newPlanFormData.name}
                onChange={handleNewPlanInputChange}
                required
                placeholder="e.g., Basic Plan, Premium Plan"
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="new-plan-description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="new-plan-description"
                name="description"
                value={newPlanFormData.description}
                onChange={handleNewPlanInputChange}
                placeholder="Plan description"
                rows={3}
                className="w-full border border-input bg-background px-3 py-2 rounded-md text-sm resize-none"
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium">
                Assessment Definitions
              </label>
              {loadingAssessmentDefinitions ? (
                <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                  Loading assessment definitions...
                </div>
              ) : assessmentDefinitions.length === 0 ? (
                <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                  No assessment definitions available
                </div>
              ) : (
                <>
                  <div className="border rounded-md max-h-60 overflow-y-auto p-2">
                    <div className="space-y-2">
                      {assessmentDefinitions.map((assessmentDefinition) => (
                        <label
                          key={assessmentDefinition.id}
                          className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={newPlanFormData.assessment_definition_ids.includes(assessmentDefinition.id)}
                            onChange={() => handleAssessmentDefinitionToggle(assessmentDefinition.id)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">
                            {assessmentDefinition.name}
                            {assessmentDefinition.description && (
                              <span className="text-muted-foreground ml-1">
                                - {assessmentDefinition.description}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {newPlanFormData.assessment_definition_ids.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {newPlanFormData.assessment_definition_ids.length} assessment definition(s) selected
                    </p>
                  )}
                </>
              )}
            </div>

            {submitNewPlanError && (
              <p className="text-sm text-destructive">{submitNewPlanError}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewPlanDialogOpen(false)}
                disabled={submittingNewPlan}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submittingNewPlan}>
                {submittingNewPlan ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Plan Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsDeleteDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this plan? This action cannot be undone. All associated plan assessments will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingPlanId(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

