"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";

interface ParticipantAssessment {
  id: string;
  participant_id: string;
  cohort_assessment_id: string;
  score: number | null;
  status: string | null;
  submitted_at: string | null;
  allow_reviewer_nominations: boolean | null;
  created_at: string | null;
  cohort_assessment?: {
    id: string;
    name: string | null;
    start_date: string | null;
    end_date: string | null;
    assessment_status: string | null;
    assessment_type?: {
      id: string;
      name: string;
      description: string | null;
    };
  };
}

interface ReviewerNomination {
  id: string;
  participant_assessment_id: string;
  reviewer_id: string | null;
  external_reviewer_id: string | null;
  is_external: boolean | null;
  nominated_by_id: string;
  request_status: string | null;
  review_submitted_at: string | null;
  created_at: string | null;
  reviewer?: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
  } | null;
  external_reviewer?: {
    id: string;
    email: string;
  } | null;
}

interface Participant {
  id: string;
  client_user_id: string;
  cohort_id: string;
  client_user?: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
  };
}

interface Cohort {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export default function ParticipantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cohortId = params.id as string;
  const participantId = params.participantId as string;

  const [participant, setParticipant] = useState<Participant | null>(null);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [participantAssessments, setParticipantAssessments] = useState<ParticipantAssessment[]>([]);
  const [nominations, setNominations] = useState<ReviewerNomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (participantId && cohortId) {
      fetchData();
    }
  }, [participantId, cohortId]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Fetch participant details
      const { data: participantData, error: participantError } = await supabase
        .from("cohort_participants")
        .select(`
          id,
          client_user_id,
          cohort_id,
          client_user:client_users(id, name, surname, email)
        `)
        .eq("id", participantId)
        .single();

      if (participantError || !participantData) {
        setError("Participant not found");
        return;
      }

      // Supabase relationship selects sometimes return nested rows as an array.
      // Normalize `client_user` to a single object for our Participant type.
      const normalizedClientUser = Array.isArray((participantData as any).client_user)
        ? (participantData as any).client_user[0] ?? null
        : (participantData as any).client_user ?? null;

      const normalizedParticipant: Participant = {
        ...(participantData as any),
        client_user: normalizedClientUser,
      };

      setParticipant(normalizedParticipant);

      // Fetch cohort details
      const { data: cohortData, error: cohortError } = await supabase
        .from("cohorts")
        .select("id, name, start_date, end_date")
        .eq("id", cohortId)
        .single();

      if (!cohortError && cohortData) {
        setCohort(cohortData as Cohort);
      }

      // Fetch all participant assessments for this participant
      const { data: assessmentsData, error: assessmentsError } = await supabase
        .from("participant_assessments")
        .select(`
          id,
          participant_id,
          cohort_assessment_id,
          score,
          status,
          submitted_at,
          allow_reviewer_nominations,
          created_at,
          cohort_assessment:cohort_assessments(
            id,
            name,
            start_date,
            end_date,
            assessment_status,
            assessment_type:assessment_types(id, name, description)
          )
        `)
        .eq("participant_id", participantId);

      if (assessmentsError) {
        console.error("Error fetching participant assessments:", assessmentsError);
        setParticipantAssessments([]);
      } else {
        const normalized: ParticipantAssessment[] = (assessmentsData || []).map((row: any) => {
          const ca = Array.isArray(row.cohort_assessment)
            ? row.cohort_assessment[0] ?? null
            : row.cohort_assessment ?? null;

          const at = ca
            ? (Array.isArray(ca.assessment_type) ? ca.assessment_type[0] ?? null : ca.assessment_type ?? null)
            : null;

          return {
            ...row,
            cohort_assessment: ca
              ? {
                  ...ca,
                  assessment_type: at,
                }
              : null,
          };
        });

        setParticipantAssessments(normalized);
        
        // Fetch nominations for all participant assessments
        if (assessmentsData && assessmentsData.length > 0) {
          const participantAssessmentIds = assessmentsData.map((pa: any) => pa.id);
          fetchNominations(participantAssessmentIds);
        }
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function fetchNominations(participantAssessmentIds: string[]) {
    try {
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          participant_assessment_id,
          reviewer_id,
          external_reviewer_id,
          is_external,
          nominated_by_id,
          request_status,
          review_submitted_at,
          created_at,
          reviewer:client_users(id, name, surname, email),
          external_reviewer:external_reviewers(id, email)
        `)
        .in("participant_assessment_id", participantAssessmentIds)
        .order("created_at", { ascending: false });

      if (nominationsError) {
        console.error("Error fetching nominations:", nominationsError);
        setNominations([]);
      } else {
        setNominations(nominationsData || []);
      }
    } catch (err) {
      console.error("Error fetching nominations:", err);
      setNominations([]);
    }
  }

  function getNominationStatusColor(status: string | null): string {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "accepted") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "rejected" || statusLower === "cancelled") {
      return "bg-red-100 text-red-800";
    } else if (statusLower === "pending") {
      return "bg-yellow-100 text-yellow-800";
    } else if (statusLower === "completed") {
      return "bg-blue-100 text-blue-800";
    }
    return "bg-gray-100 text-gray-800";
  }

  function getNominationsForAssessment(participantAssessmentId: string): ReviewerNomination[] {
    return nominations.filter((n) => n.participant_assessment_id === participantAssessmentId);
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="p-8 text-center text-muted-foreground">Loading participant details...</div>
      </div>
    );
  }

  if (error || !participant) {
    return (
      <div className="container mx-auto p-6">
        <div className="p-8 text-center text-destructive">{error || "Participant not found"}</div>
        <Button onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const user = participant.client_user as any;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Breadcrumb
        items={[
          { label: "Cohorts", href: "/cohorts" },
          { label: cohort?.name || "Cohort", href: `/cohorts/${cohortId}` },
          { label: `${user?.name || ""} ${user?.surname || ""}`.trim() || "Participant" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {user?.name || ""} {user?.surname || ""}
          </h1>
          <p className="text-muted-foreground mt-2">{user?.email || ""}</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Cohort
        </Button>
      </div>

      {/* Participant Assessments */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Assessments</h2>
        {participantAssessments.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No assessments found for this participant.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {participantAssessments.map((pa) => {
              const assessment = pa.cohort_assessment as any;
              const assessmentType = assessment?.assessment_type as any;
              const assessmentName = assessment?.name || assessmentType?.name || "Assessment";
              const assessmentNominations = getNominationsForAssessment(pa.id);

              return (
                <Card key={pa.id}>
                  <CardHeader>
                    <CardTitle>{assessmentName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Assessment Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Status: </span>
                        <span className="font-medium">{pa.status || "Not started"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Score: </span>
                        <span className="font-medium">{pa.score !== null ? pa.score : "Not scored"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Start Date: </span>
                        <span className="font-medium">
                          {assessment?.start_date
                            ? new Date(assessment.start_date).toLocaleDateString()
                            : "Not set"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">End Date: </span>
                        <span className="font-medium">
                          {assessment?.end_date
                            ? new Date(assessment.end_date).toLocaleDateString()
                            : "Not set"}
                        </span>
                      </div>
                      {pa.submitted_at && (
                        <div>
                          <span className="text-muted-foreground">Submitted: </span>
                          <span className="font-medium">
                            {new Date(pa.submitted_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Nominations Section */}
                    <div className="border-t pt-4">
                      <h3 className="text-lg font-semibold mb-3">Nominations ({assessmentNominations.length})</h3>
                      {assessmentNominations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No nominations found for this assessment.</p>
                      ) : (
                        <div className="space-y-2">
                          {assessmentNominations.map((nomination) => {
                            const reviewerName = nomination.is_external
                              ? nomination.external_reviewer?.email || "External Reviewer"
                              : nomination.reviewer
                              ? `${nomination.reviewer.name || ""} ${nomination.reviewer.surname || ""}`.trim() || nomination.reviewer.email
                              : "Unknown";

                            return (
                              <div
                                key={nomination.id}
                                className="flex items-center justify-between p-3 border rounded-md"
                              >
                                <div>
                                  <p className="font-medium">{reviewerName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {nomination.is_external ? "External Reviewer" : "Internal Reviewer"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-1 text-xs font-medium rounded-full ${getNominationStatusColor(
                                      nomination.request_status
                                    )}`}
                                  >
                                    {nomination.request_status || "Pending"}
                                  </span>
                                  {nomination.review_submitted_at && (
                                    <span className="text-xs text-muted-foreground">
                                      Reviewed: {new Date(nomination.review_submitted_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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
    </div>
  );
}

