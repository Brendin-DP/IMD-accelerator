"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";

interface ReviewerNomination {
  id: string;
  participant_assessment_id: string;
  reviewer_id: string;
  nominated_by_id: string;
  status: string | null;
  review_submitted_at: string | null;
  created_at: string | null;
  reviewer?: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
  };
  nominated_by?: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
  };
}

interface ParticipantAssessment {
  id: string;
  participant_id: string;
  cohort_assessment_id: string;
  participant?: {
    id: string;
    client_user_id: string;
    client_user?: {
      id: string;
      name: string | null;
      surname: string | null;
      email: string;
    };
  };
}

export default function ParticipantNominationsPage() {
  const params = useParams();
  const router = useRouter();
  const cohortId = params.id as string;
  const assessmentId = params.assessmentId as string;
  const participantAssessmentId = params.participantAssessmentId as string;

  const [participantAssessment, setParticipantAssessment] = useState<ParticipantAssessment | null>(null);
  const [nominations, setNominations] = useState<ReviewerNomination[]>([]);
  const [cohortName, setCohortName] = useState<string>("Cohort");
  const [assessmentName, setAssessmentName] = useState<string>("Assessment");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (participantAssessmentId && cohortId && assessmentId) {
      fetchParticipantAssessment();
      fetchNominations();
      fetchCohortAndAssessmentNames();
    }
  }, [participantAssessmentId, cohortId, assessmentId]);

  async function fetchCohortAndAssessmentNames() {
    try {
      // Fetch cohort name
      const { data: cohortData, error: cohortError } = await supabase
        .from("cohorts")
        .select("name")
        .eq("id", cohortId)
        .single();

      if (!cohortError && cohortData) {
        setCohortName(cohortData.name);
      }

      // Fetch assessment name
      const { data: assessmentData, error: assessmentError } = await supabase
        .from("cohort_assessments")
        .select(`
          name,
          assessment_type:assessment_types(name)
        `)
        .eq("id", assessmentId)
        .single();

      if (!assessmentError && assessmentData) {
        const name = assessmentData.name || (assessmentData.assessment_type as any)?.name || "Assessment";
        setAssessmentName(name);
      }
    } catch (err) {
      console.error("Error fetching cohort/assessment names:", err);
    }
  }

  async function fetchParticipantAssessment() {
    try {
      const { data, error: dbError } = await supabase
        .from("participant_assessments")
        .select(`
          *,
          participant:cohort_participants(
            id,
            client_user_id,
            client_users!cohort_participants_client_user_id_fkey(id, name, surname, email)
          )
        `)
        .eq("id", participantAssessmentId)
        .single();

      // If relationship query fails, fetch separately
      if (dbError && (dbError.message?.includes("relationship") || dbError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");
        
        const { data: paData, error: paError } = await supabase
          .from("participant_assessments")
          .select("*")
          .eq("id", participantAssessmentId)
          .single();

        if (paError) {
          throw paError;
        }

        if (paData?.participant_id) {
          const { data: participantData, error: participantError } = await supabase
            .from("cohort_participants")
            .select("id, client_user_id")
            .eq("id", paData.participant_id)
            .single();

          if (!participantError && participantData) {
            const { data: clientUserData, error: userError } = await supabase
              .from("client_users")
              .select("id, name, surname, email")
              .eq("id", participantData.client_user_id)
              .single();

            setParticipantAssessment({
              ...paData,
              participant: {
                ...participantData,
                client_user: clientUserData || null,
              },
            });
          } else {
            setParticipantAssessment(paData);
          }
        } else {
          setParticipantAssessment(paData);
        }
      } else if (data) {
        setParticipantAssessment(data);
      }

      setError(null);
    } catch (err) {
      console.error("Error fetching participant assessment:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setParticipantAssessment(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNominations() {
    try {
      // Fetch reviewer nominations for this participant assessment
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select("*")
        .eq("participant_assessment_id", participantAssessmentId);

      if (nominationsError) {
        console.error("Error fetching nominations:", nominationsError);
        setNominations([]);
        return;
      }

      if (!nominationsData || nominationsData.length === 0) {
        setNominations([]);
        return;
      }

      // Get unique reviewer and nominated_by IDs
      const reviewerIds = [...new Set(nominationsData.map((n: any) => n.reviewer_id))];
      const nominatedByIds = [...new Set(nominationsData.map((n: any) => n.nominated_by_id))];
      const allUserIds = [...new Set([...reviewerIds, ...nominatedByIds])];

      // Fetch client users
      const { data: clientUsers, error: usersError } = await supabase
        .from("client_users")
        .select("id, name, surname, email")
        .in("id", allUserIds);

      if (usersError) {
        console.error("Error fetching client users:", usersError);
        setNominations(nominationsData);
        return;
      }

      // Merge the data
      const mergedNominations = nominationsData.map((nomination: any) => ({
        ...nomination,
        reviewer: clientUsers?.find((u: any) => u.id === nomination.reviewer_id) || null,
        nominated_by: clientUsers?.find((u: any) => u.id === nomination.nominated_by_id) || null,
      }));

      setNominations(mergedNominations);
    } catch (err) {
      console.error("Error fetching nominations:", err);
      setNominations([]);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading nomination requests...</div>
      </div>
    );
  }

  if (error || !participantAssessment) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">
          {error || "Participant assessment not found"}
        </div>
        <Button variant="outline" onClick={() => router.push(`/cohorts/${cohortId}/assessments/${assessmentId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessment
        </Button>
      </div>
    );
  }

  const participant = (participantAssessment.participant as any)?.client_user as any;
  const participantName = participant
    ? `${participant.name || ""} ${participant.surname || ""}`.trim() || participant.email
    : "Participant";

  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "accepted" || statusLower === "approved") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "pending" || statusLower === "awaiting") {
      return "bg-yellow-100 text-yellow-800";
    } else if (statusLower === "rejected" || statusLower === "declined") {
      return "bg-red-100 text-red-800";
    } else if (statusLower === "completed" || statusLower === "submitted") {
      return "bg-blue-100 text-blue-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Cohorts", href: "/cohorts" },
          { label: cohortName, href: `/cohorts/${cohortId}` },
          { label: assessmentName, href: `/cohorts/${cohortId}/assessments/${assessmentId}` },
          { label: `${participantName} - Nominations` },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => router.push(`/cohorts/${cohortId}/assessments/${assessmentId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessment
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Nomination Requests</h1>
          <p className="text-muted-foreground mt-2">
            Review nominations for {participantName}
          </p>
        </div>
      </div>

      {/* Participant Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Participant Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <p className="text-sm font-medium mt-1">{participant?.name || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Surname</label>
              <p className="text-sm font-medium mt-1">{participant?.surname || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="text-sm font-medium mt-1">{participant?.email || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nominations Table */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Reviewer Nominations</h2>
        <div className="rounded-md border">
          {nominations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No nomination requests found for this participant.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-6 py-3 text-left text-sm font-medium">Reviewer</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Nominated By</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Review Submitted</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {nominations.map((nomination) => {
                  const reviewer = nomination.reviewer as any;
                  const nominatedBy = nomination.nominated_by as any;
                  return (
                    <tr key={nomination.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <div>
                          <div className="font-medium">
                            {reviewer?.name || ""} {reviewer?.surname || ""}
                          </div>
                          <div className="text-muted-foreground text-xs">{reviewer?.email || "-"}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div>
                          <div className="font-medium">
                            {nominatedBy?.name || ""} {nominatedBy?.surname || ""}
                          </div>
                          <div className="text-muted-foreground text-xs">{nominatedBy?.email || "-"}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {nomination.status ? (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(nomination.status)}`}>
                            {nomination.status}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {nomination.review_submitted_at
                          ? new Date(nomination.review_submitted_at).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {nomination.created_at
                          ? new Date(nomination.created_at).toLocaleDateString()
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

