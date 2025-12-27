"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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

export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.id as string;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    assessment_type_ids: [] as string[],
  });
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([]);
  const [loadingAssessmentTypes, setLoadingAssessmentTypes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (planId) {
      fetchPlanDetails();
      fetchAssessmentTypes();
    }
  }, [planId]);

  async function fetchPlanDetails() {
    try {
      setLoading(true);
      setError(null);

      // Fetch plan
      const { data: planData, error: planError } = await supabase
        .from("plans")
        .select("id, name, description, created_at")
        .eq("id", planId)
        .single();

      if (planError) {
        console.error("Error fetching plan:", planError);
        setError(`Failed to load plan: ${planError.message}`);
        setPlan(null);
        return;
      }

      setPlan(planData);

      // Fetch selected assessment types via plan_assessments
      const { data: planAssessments, error: assessmentsError } = await supabase
        .from("plan_assessments")
        .select("assessment_type_id")
        .eq("plan_id", planId);

      if (assessmentsError) {
        console.error("Error fetching plan assessments:", assessmentsError);
        // Continue even if this fails - just won't have selected types
      }

      const selectedAssessmentTypeIds = planAssessments?.map((pa) => pa.assessment_type_id) || [];

      // Populate form with current plan data
      setFormData({
        name: planData.name || "",
        description: planData.description || "",
        assessment_type_ids: selectedAssessmentTypeIds,
      });
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setPlan(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Update plan
      const { error: updateError } = await supabase
        .from("plans")
        .update({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        })
        .eq("id", planId);

      if (updateError) {
        console.error("Error updating plan:", updateError);
        setSubmitError(`Failed to update plan: ${updateError.message}`);
        setSubmitting(false);
        return;
      }

      // Delete existing plan_assessments for this plan
      const { error: deleteError } = await supabase
        .from("plan_assessments")
        .delete()
        .eq("plan_id", planId);

      if (deleteError) {
        console.error("Error deleting plan assessments:", deleteError);
        setSubmitError(`Failed to update assessment types: ${deleteError.message}`);
        setSubmitting(false);
        return;
      }

      // Insert new plan_assessments if assessment types are selected
      if (formData.assessment_type_ids.length > 0) {
        const planAssessmentsToCreate = formData.assessment_type_ids.map((assessmentTypeId) => ({
          plan_id: planId,
          assessment_type_id: assessmentTypeId,
        }));

        const { error: insertError } = await supabase
          .from("plan_assessments")
          .insert(planAssessmentsToCreate);

        if (insertError) {
          console.error("Error creating plan assessments:", insertError);
          setSubmitError(`Failed to link assessment types: ${insertError.message}`);
          setSubmitting(false);
          return;
        }
      }

      // Refresh plan data
      await fetchPlanDetails();
      
      // Navigate back to plans list
      router.push("/settings/plans");
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading plan details...</div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">
          {error || "Plan not found"}
        </div>
        <Button variant="tertiary" onClick={() => router.push("/settings/plans")} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Plans
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
          { label: "Plans", href: "/settings/plans" },
          { label: plan.name },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push("/settings/plans")} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Plans
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Edit Plan</h1>
        <p className="text-muted-foreground mt-2">Update plan details and assessment types</p>
      </div>

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                onClick={() => router.push("/settings/plans")}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

