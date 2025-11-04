"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";

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
  cohort?: {
    id: string;
    name: string;
  };
}

interface ParticipantAssessment {
  id: string;
  participant_id: string;
  cohort_assessment_id: string;
  score: number | null;
  status: string | null;
  submitted_at: string | null;
  allow_reviewer_nominations: boolean | null;
  created_at: string | null;
}

export default function TenantAssessmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const assessmentId = params.assessmentId as string;

  const [user, setUser] = useState<any>(null);
  const [assessment, setAssessment] = useState<CohortAssessment | null>(null);
  const [participantAssessment, setParticipantAssessment] = useState<ParticipantAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("participant");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        if (userData.id && assessmentId) {
          fetchAssessmentDetails();
          fetchParticipantAssessment(userData.id);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
        setError("Failed to load user data");
        setLoading(false);
      }
    } else {
      setError("User not found. Please log in again.");
      setLoading(false);
    }
  }, [assessmentId]);

  async function fetchAssessmentDetails() {
    try {
      setLoading(true);
      setError(null);

      // Try fetching with relationships first
      let { data, error: dbError } = await supabase
        .from("cohort_assessments")
        .select(`
          *,
          assessment_type:assessment_types(id, name, description),
          cohort:cohorts(id, name)
        `)
        .eq("id", assessmentId)
        .single();

      // If relationship query fails, fallback to separate queries
      if (dbError && (dbError.message?.includes("relationship") || dbError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately:", dbError.message);
        
        // Fetch assessment without relationships
        const { data: assessmentData, error: assessmentError } = await supabase
          .from("cohort_assessments")
          .select("*")
          .eq("id", assessmentId)
          .single();

        if (assessmentError) {
          throw assessmentError;
        }

        if (!assessmentData) {
          throw new Error("Assessment not found");
        }

        // Fetch assessment type separately
        let assessmentType = null;
        if (assessmentData.assessment_type_id) {
          const { data: typeData } = await supabase
            .from("assessment_types")
            .select("*")
            .eq("id", assessmentData.assessment_type_id)
            .single();
          assessmentType = typeData;
        }

        // Fetch cohort separately
        let cohort = null;
        if (assessmentData.cohort_id) {
          const { data: cohortData } = await supabase
            .from("cohorts")
            .select("id, name")
            .eq("id", assessmentData.cohort_id)
            .single();
          cohort = cohortData;
        }

        setAssessment({
          ...assessmentData,
          assessment_type: assessmentType,
          cohort: cohort,
        } as CohortAssessment);
      } else if (dbError) {
        throw dbError;
      } else if (data) {
        setAssessment(data as CohortAssessment);
      } else {
        throw new Error("Assessment not found");
      }
    } catch (err) {
      console.error("Error fetching assessment details:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setAssessment(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchParticipantAssessment(userId: string) {
    try {
      // First, find the cohort_participant for this user
      const { data: participants, error: participantsError } = await supabase
        .from("cohort_participants")
        .select("id")
        .eq("client_user_id", userId);

      if (participantsError || !participants || participants.length === 0) {
        console.warn("No participants found for this user");
        setParticipantAssessment(null);
        return;
      }

      const participantIds = participants.map((p: any) => p.id);

      // Fetch the participant_assessment for this assessment and user
      const { data: participantAssessmentData, error: paError } = await supabase
        .from("participant_assessments")
        .select("*")
        .eq("cohort_assessment_id", assessmentId)
        .in("participant_id", participantIds)
        .maybeSingle();

      if (paError) {
        console.error("Error fetching participant assessment:", paError);
        setParticipantAssessment(null);
        return;
      }

      setParticipantAssessment(participantAssessmentData as ParticipantAssessment);
    } catch (err) {
      console.error("Error fetching participant assessment:", err);
      setParticipantAssessment(null);
    }
  }

  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed" || statusLower === "submitted") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "pending" || statusLower === "in_progress") {
      return "bg-yellow-100 text-yellow-800";
    } else if (statusLower === "not_started") {
      return "bg-gray-100 text-gray-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: `/dashboard` },
            { label: "Assessment" },
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">{error || "Assessment not found"}</p>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard`)}
              className="mt-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const assessmentName = assessment.name || assessment.assessment_type?.name || "Assessment";
  const cohortName = (assessment.cohort as any)?.name || "Cohort";

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/dashboard` },
          { label: assessmentName },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => router.push(`/dashboard`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{assessmentName}</h1>
          <p className="text-muted-foreground mt-2">
            {cohortName}
          </p>
        </div>
      </div>

      {/* Assessment Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle>Assessment Information</CardTitle>
            {assessment.status && (
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(assessment.status)}`}>
                {assessment.status}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Assessment Type</p>
              <p className="text-base mt-1">{assessment.assessment_type?.name || "N/A"}</p>
            </div>
            {assessment.assessment_type?.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Description</p>
                <p className="text-base mt-1">{assessment.assessment_type.description}</p>
              </div>
            )}
            {assessment.start_date && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Start Date</p>
                <p className="text-base mt-1">
                  {new Date(assessment.start_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {assessment.end_date && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">End Date</p>
                <p className="text-base mt-1">
                  {new Date(assessment.end_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* My Assessment Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>My Assessment Status</CardTitle>
        </CardHeader>
        <CardContent>
          {participantAssessment ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  {participantAssessment.status && (
                    <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full mt-2 ${getStatusColor(participantAssessment.status)}`}>
                      {participantAssessment.status}
                    </span>
                  )}
                  {!participantAssessment.status && (
                    <p className="text-base mt-1 text-muted-foreground">Not started</p>
                  )}
                </div>
                {participantAssessment.score !== null && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Score</p>
                    <p className="text-2xl font-bold mt-1">{participantAssessment.score}</p>
                  </div>
                )}
                {participantAssessment.submitted_at && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Submitted At</p>
                    <p className="text-base mt-1">
                      {new Date(participantAssessment.submitted_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
              {participantAssessment.allow_reviewer_nominations && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Reviewer nominations are enabled for this assessment.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Your assessment has not been started yet.</p>
              <Button
                className="mt-4"
                onClick={() => {
                  // TODO: Implement assessment start/launch functionality
                  alert("Assessment launch functionality will be implemented here");
                }}
              >
                Start Assessment
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assessment Description/Instructions */}
      {assessment.assessment_type?.description && (
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {assessment.assessment_type.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

