"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssessments();
  }, []);

  async function fetchAssessments() {
    try {
      setLoading(true);
      setError(null);

      // Query assessment_definitions_v2 with is_system = true and join assessment_types
      const { data, error: dbError } = await supabase
        .from("assessment_definitions_v2")
        .select(`
          *,
          assessment_type:assessment_types(id, name, description)
        `)
        .eq("is_system", true)
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching assessments:", dbError);
        // Try fallback without relationship join
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("assessment_definitions_v2")
          .select("*")
          .eq("is_system", true)
          .order("created_at", { ascending: false });

        if (fallbackError) {
          setError(`Failed to load assessments: ${fallbackError.message}`);
          setAssessments([]);
        } else {
          // Fetch assessment types separately
          const assessmentTypeIds = [...new Set(fallbackData?.map((a: any) => a.assessment_type_id) || [])];
          const { data: typesData } = await supabase
            .from("assessment_types")
            .select("id, name, description")
            .in("id", assessmentTypeIds);

          const assessmentsWithTypes = fallbackData?.map((assessment: any) => ({
            ...assessment,
            assessment_type: typesData?.find((t: any) => t.id === assessment.assessment_type_id) || null,
          })) || [];

          setAssessments(assessmentsWithTypes);
        }
      } else {
        setAssessments(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }

  function handleAssessmentClick(assessment: AssessmentDefinition) {
    router.push(`/settings/assessments/${assessment.id}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Assessment Management</h1>
        <p className="text-muted-foreground mt-2">View and explore system assessment definitions</p>
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
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
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
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {assessment.created_at
                      ? new Date(assessment.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

