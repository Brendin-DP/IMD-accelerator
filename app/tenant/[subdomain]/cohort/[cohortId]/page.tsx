"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface CohortAssessment {
  id: string;
  cohort_id: string;
  assessment_type_id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  created_at: string | null;
  assessment_type?: {
    id: string;
    name: string;
    description: string | null;
  };
}

interface Cohort {
  id: string;
  name: string;
  client_id: string;
  plan_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
}

function getStatusColor(status: string | null): string {
  if (!status) return "bg-gray-100 text-gray-800";
  
  const statusLower = status.toLowerCase();
  switch (statusLower) {
    case "draft":
      return "bg-gray-100 text-gray-800";
    case "active":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "not_started":
      return "bg-yellow-100 text-yellow-800";
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "accepted":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function TenantCohortDetailPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const cohortId = params.cohortId as string;

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [assessments, setAssessments] = useState<CohortAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cohortId) {
      fetchCohortDetails();
      fetchAssessments();
    }
  }, [cohortId]);

  async function fetchCohortDetails() {
    try {
      const { data: cohortData, error: cohortError } = await supabase
        .from("cohorts")
        .select("*")
        .eq("id", cohortId)
        .single();

      if (cohortError) {
        console.error("Error fetching cohort:", cohortError);
        setError("Cohort not found");
        return;
      }

      setCohort(cohortData);
    } catch (err) {
      console.error("Error fetching cohort:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  }

  async function fetchAssessments() {
    try {
      setLoading(true);
      setError(null);

      // Fetch assessments for this cohort
      const { data: assessmentsData, error: assessmentsError } = await supabase
        .from("cohort_assessments")
        .select(`
          *,
          assessment_type:assessment_types(id, name, description)
        `)
        .eq("cohort_id", cohortId);

      // Handle relationship cache issues
      if (assessmentsError && (assessmentsError.message?.includes("relationship") || assessmentsError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");
        
        const { data: assessmentsOnly, error: assessmentsOnlyError } = await supabase
          .from("cohort_assessments")
          .select("*")
          .eq("cohort_id", cohortId);

        if (assessmentsOnlyError) {
          throw assessmentsOnlyError;
        }

        if (assessmentsOnly && assessmentsOnly.length > 0) {
          const assessmentTypeIds = [...new Set(assessmentsOnly.map((a: any) => a.assessment_type_id))];
          const { data: assessmentTypes, error: typesError } = await supabase
            .from("assessment_types")
            .select("id, name, description")
            .in("id", assessmentTypeIds);

          const mergedAssessments = assessmentsOnly.map((assessment: any) => ({
            ...assessment,
            assessment_type: assessmentTypes?.find((t: any) => t.id === assessment.assessment_type_id) || null,
          }));

          // Sort assessments: 360 first, then Pulse, then others alphabetically
          mergedAssessments.sort((a: any, b: any) => {
            const aName = (a.assessment_type?.name || "").toLowerCase();
            const bName = (b.assessment_type?.name || "").toLowerCase();
            
            // 360 always first
            if (aName === "360") return -1;
            if (bName === "360") return 1;
            
            // Pulse second
            if (aName === "pulse") return -1;
            if (bName === "pulse") return 1;
            
            // Others alphabetically
            return aName.localeCompare(bName);
          });

          setAssessments(mergedAssessments || []);
        } else {
          setAssessments([]);
        }
      } else if (assessmentsData) {
        // Sort assessments: 360 first, then Pulse, then others alphabetically
        assessmentsData.sort((a: any, b: any) => {
          const aName = (a.assessment_type?.name || "").toLowerCase();
          const bName = (b.assessment_type?.name || "").toLowerCase();
          
          // 360 always first
          if (aName === "360") return -1;
          if (bName === "360") return 1;
          
          // Pulse second
          if (aName === "pulse") return -1;
          if (bName === "pulse") return 1;
          
          // Others alphabetically
          return aName.localeCompare(bName);
        });

        setAssessments(assessmentsData || []);
      } else {
        setAssessments([]);
      }
    } catch (err) {
      console.error("Error fetching assessments:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading cohort...</div>
      </div>
    );
  }

  if (error || !cohort) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: `/tenant/${subdomain}/dashboard` },
            { label: "Cohorts", href: `/tenant/${subdomain}/cohort` },
            { label: "Cohort" },
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">{error || "Cohort not found"}</p>
            <Button
              variant="outline"
              onClick={() => router.push(`/tenant/${subdomain}/cohort`)}
              className="mt-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Cohorts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/tenant/${subdomain}/dashboard` },
          { label: "Cohorts", href: `/tenant/${subdomain}/cohort` },
          { label: cohort.name },
        ]}
      />

      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.push(`/tenant/${subdomain}/cohort`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Cohorts
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{cohort.name}</h1>
        <p className="text-muted-foreground mt-2">
          {cohort.start_date && cohort.end_date && (
            <>
              {new Date(cohort.start_date).toLocaleDateString()} - {new Date(cohort.end_date).toLocaleDateString()}
            </>
          )}
        </p>
      </div>

      {/* Assessments */}
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading assessments...
          </CardContent>
        </Card>
      ) : assessments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No assessments found for this cohort.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assessments.map((assessment) => {
            const assessmentName = assessment.name || assessment.assessment_type?.name || "Assessment";
            
            return (
              <Card
                key={assessment.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/tenant/${subdomain}/assessments/${assessment.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{assessmentName}</CardTitle>
                    {assessment.status && (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(assessment.status)}`}>
                        {assessment.status}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {assessment.assessment_type?.description && (
                      <p className="text-muted-foreground line-clamp-2">
                        {assessment.assessment_type.description}
                      </p>
                    )}
                    {assessment.start_date && (
                      <div>
                        <span className="text-muted-foreground">Start: </span>
                        <span className="font-medium">
                          {new Date(assessment.start_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {assessment.end_date && (
                      <div>
                        <span className="text-muted-foreground">End: </span>
                        <span className="font-medium">
                          {new Date(assessment.end_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
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

