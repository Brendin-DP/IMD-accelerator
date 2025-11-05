"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
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
  participant?: {
    id: string;
    client_user_id: string;
    cohort_id: string;
    client_user?: {
      id: string;
      name: string | null;
      surname: string | null;
      email: string;
    };
  };
}

interface ReviewerNomination {
  id: string;
  participant_assessment_id: string;
  reviewer_id: string | null;
  external_reviewer_id: string | null;
  is_external: boolean | null;
  nominated_by_id: string | null;
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
  nominated_by?: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
  } | null;
}

export default function AssessmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cohortId = params.id as string;
  const assessmentId = params.assessmentId as string;

  const [assessment, setAssessment] = useState<CohortAssessment | null>(null);
  const [participantAssessments, setParticipantAssessments] = useState<ParticipantAssessment[]>([]);
  const [nominations, setNominations] = useState<ReviewerNomination[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assessmentId && cohortId) {
      fetchAssessmentDetails();
      fetchParticipantAssessments();
    }
  }, [assessmentId, cohortId]);

  useEffect(() => {
    // Fetch nominations when participant assessments are loaded
    if (participantAssessments.length > 0) {
      fetchAllNominations(participantAssessments);
    }
  }, [participantAssessments]);

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

        // Fetch assessment type and cohort separately
        const [assessmentTypeResult, cohortResult] = await Promise.all([
          assessmentData?.assessment_type_id 
            ? supabase.from("assessment_types").select("id, name, description").eq("id", assessmentData.assessment_type_id).single()
            : { data: null, error: null },
          assessmentData?.cohort_id
            ? supabase.from("cohorts").select("id, name").eq("id", assessmentData.cohort_id).single()
            : { data: null, error: null }
        ]);

        // Merge the data
        data = {
          ...assessmentData,
          assessment_type: assessmentTypeResult.data || null,
          cohort: cohortResult.data || null,
        };

        dbError = null;
      }

      if (dbError) {
        console.error("Error fetching assessment:", dbError);
        setError(`Failed to load assessment: ${dbError.message}`);
        setAssessment(null);
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

  async function fetchParticipantAssessments() {
    try {
      // First, fetch all participants in the cohort
      const { data: cohortParticipants, error: cpError } = await supabase
        .from("cohort_participants")
        .select(`
          id,
          client_user_id,
          client_users!cohort_participants_client_user_id_fkey(id, name, surname, email)
        `)
        .eq("cohort_id", cohortId);

      // If relationship query fails, fetch separately
      let participantsData: any[] = [];
      let clientUsersData: any[] = [];

      if (cpError && (cpError.message?.includes("relationship") || cpError.message?.includes("cache"))) {
        console.warn("Relationship query failed for participants, fetching separately");
        
        const { data: participants, error: participantsError } = await supabase
          .from("cohort_participants")
          .select("id, client_user_id")
          .eq("cohort_id", cohortId);

        if (participantsError) {
          console.error("Error fetching participants:", participantsError);
          setParticipantAssessments([]);
          return;
        }

        participantsData = participants || [];
        const clientUserIds = participantsData.map((p: any) => p.client_user_id);
        
        const { data: clientUsers, error: usersError } = await supabase
          .from("client_users")
          .select("id, name, surname, email")
          .in("id", clientUserIds);

        if (usersError) {
          console.error("Error fetching client users:", usersError);
          setParticipantAssessments([]);
          return;
        }

        clientUsersData = clientUsers || [];
      } else if (cohortParticipants) {
        participantsData = cohortParticipants;
      }

      // Now fetch participant assessments for this cohort assessment
      const { data: participantAssessmentsData, error: paError } = await supabase
        .from("participant_assessments")
        .select("*")
        .eq("cohort_assessment_id", assessmentId);

      if (paError) {
        console.error("Error fetching participant assessments:", paError);
        // Continue anyway - we'll show participants without assessment data
      }

      // Create a map of participant_id -> participant_assessment
      const assessmentMap = new Map();
      (participantAssessmentsData || []).forEach((pa: any) => {
        assessmentMap.set(pa.participant_id, pa);
      });

      // Merge cohort participants with their assessment data
      const mergedData = participantsData.map((participant: any) => {
        const participantAssessment = assessmentMap.get(participant.id);
        
        // If we fetched separately, merge client user data
        let clientUser = null;
        if (cpError && clientUsersData.length > 0) {
          clientUser = clientUsersData.find((u: any) => u.id === participant.client_user_id);
        } else {
          clientUser = (participant as any).client_users || null;
        }

        // If participant has assessment, use that data; otherwise create empty assessment record
        if (participantAssessment) {
          return {
            ...participantAssessment,
            participant: {
              ...participant,
              client_user: clientUser,
            },
          };
        } else {
          // Participant hasn't started assessment yet
          return {
            id: null,
            participant_id: participant.id,
            cohort_assessment_id: assessmentId,
            score: null,
            status: "not_started",
            submitted_at: null,
            allow_reviewer_nominations: null,
            created_at: null,
            participant: {
              ...participant,
              client_user: clientUser,
            },
          };
        }
      });

      setParticipantAssessments(mergedData);
    } catch (err) {
      console.error("Error fetching participant assessments:", err);
      setParticipantAssessments([]);
    }
  }

  async function fetchAllNominations(participantAssessmentsData: ParticipantAssessment[]) {
    try {
      // Get all participant assessment IDs (filter out nulls)
      const participantAssessmentIds = participantAssessmentsData
        .map((pa) => pa.id)
        .filter((id): id is string => id !== null);

      if (participantAssessmentIds.length === 0) {
        setNominations([]);
        return;
      }

      // Fetch all nominations for these participant assessments
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select("*")
        .in("participant_assessment_id", participantAssessmentIds)
        .order("created_at", { ascending: false });

      if (nominationsError) {
        console.error("Error fetching nominations:", nominationsError);
        setNominations([]);
        return;
      }

      if (!nominationsData || nominationsData.length === 0) {
        setNominations([]);
        return;
      }

      // Separate internal and external nominations
      const internalNominations = nominationsData.filter((n: any) => !n.is_external && n.reviewer_id);
      const externalNominations = nominationsData.filter((n: any) => n.is_external && n.external_reviewer_id);

      // Get unique reviewer and nominated_by IDs
      const reviewerIds = [...new Set(internalNominations.map((n: any) => n.reviewer_id).filter(Boolean))];
      const nominatedByIds = [...new Set(nominationsData.map((n: any) => n.nominated_by_id).filter(Boolean))];
      const allUserIds = [...new Set([...reviewerIds, ...nominatedByIds])];

      // Fetch client users
      let clientUsers: any[] = [];
      if (allUserIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from("client_users")
          .select("id, name, surname, email")
          .in("id", allUserIds);

        if (!usersError && users) {
          clientUsers = users;
        }
      }

      // Fetch external reviewers
      const externalReviewerIds = [...new Set(externalNominations.map((n: any) => n.external_reviewer_id).filter(Boolean))];
      let externalReviewers: any[] = [];
      if (externalReviewerIds.length > 0) {
        const { data: externalReviewersData, error: externalError } = await supabase
          .from("external_reviewers")
          .select("id, email")
          .in("id", externalReviewerIds);

        if (!externalError && externalReviewersData) {
          externalReviewers = externalReviewersData;
        }
      }

      // Merge the data
      const mergedNominations = nominationsData.map((nomination: any) => {
        if (nomination.is_external && nomination.external_reviewer_id) {
          // External reviewer
          return {
            ...nomination,
            reviewer: null,
            external_reviewer: externalReviewers.find((e: any) => e.id === nomination.external_reviewer_id) || null,
            nominated_by: clientUsers.find((u: any) => u.id === nomination.nominated_by_id) || null,
          };
        } else {
          // Internal reviewer
          return {
            ...nomination,
            reviewer: clientUsers.find((u: any) => u.id === nomination.reviewer_id) || null,
            external_reviewer: null,
            nominated_by: clientUsers.find((u: any) => u.id === nomination.nominated_by_id) || null,
          };
        }
      });

      setNominations(mergedNominations);
    } catch (err) {
      console.error("Error fetching nominations:", err);
      setNominations([]);
    }
  }

  function toggleRow(participantAssessmentId: string | null) {
    if (!participantAssessmentId) return;
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(participantAssessmentId)) {
      newExpanded.delete(participantAssessmentId);
    } else {
      newExpanded.add(participantAssessmentId);
    }
    setExpandedRows(newExpanded);
  }

  function getNominationsForParticipant(participantAssessmentId: string | null): ReviewerNomination[] {
    if (!participantAssessmentId) return [];
    return nominations.filter((n) => n.participant_assessment_id === participantAssessmentId);
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
        <Button variant="tertiary" onClick={() => router.push(`/cohorts/${cohortId}`)} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Cohort
        </Button>
      </div>
    );
  }

  const assessmentName = assessment.name || assessment.assessment_type?.name || "Assessment";
  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "active" || statusLower === "in_progress") {
      return "bg-blue-100 text-blue-800";
    } else if (statusLower === "completed" || statusLower === "done" || statusLower === "submitted") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "draft" || statusLower === "pending") {
      return "bg-yellow-100 text-yellow-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  const cohortName = (assessment.cohort as any)?.name || "Cohort";

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Cohorts", href: "/cohorts" },
          { label: cohortName, href: `/cohorts/${cohortId}` },
          { label: assessmentName },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push(`/cohorts/${cohortId}`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Cohort
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{assessmentName}</h1>
        <p className="text-muted-foreground mt-2">
          Assessment participants for {cohortName}
        </p>
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
              <label className="text-sm font-medium text-muted-foreground">Assessment Name</label>
              <p className="text-sm font-medium mt-1">{assessmentName}</p>
            </div>
            {assessment.assessment_type?.description && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="text-sm font-medium mt-1">{assessment.assessment_type.description}</p>
              </div>
            )}
            {assessment.start_date && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Start Date</label>
                <p className="text-sm font-medium mt-1">
                  {new Date(assessment.start_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {assessment.end_date && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">End Date</label>
                <p className="text-sm font-medium mt-1">
                  {new Date(assessment.end_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Participants List */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Participants</h2>
        <div className="rounded-md border">
          {participantAssessments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No participants found for this assessment.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-6 py-3 text-left text-sm font-medium w-10"></th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Surname</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Score</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Submitted</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Nominations</th>
                </tr>
              </thead>
              <tbody>
                {participantAssessments.map((pa) => {
                  const clientUser = (pa.participant as any)?.client_user as any;
                  const participantNominations = getNominationsForParticipant(pa.id);
                  const isExpanded = pa.id ? expandedRows.has(pa.id) : false;
                  const nominationsCount = participantNominations.length;
                  const acceptedCount = participantNominations.filter((n) => n.request_status?.toLowerCase() === "accepted").length;

                  return (
                    <>
                      <tr 
                        key={pa.id || `pa-${pa.participant_id}`}
                        className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <td 
                          className="px-6 py-4 text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(pa.id);
                          }}
                        >
                          {pa.id && nominationsCount > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )
                          ) : null}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">{clientUser?.name || "-"}</td>
                        <td className="px-6 py-4 text-sm font-medium">{clientUser?.surname || "-"}</td>
                        <td className="px-6 py-4 text-sm">{clientUser?.email || "-"}</td>
                        <td className="px-6 py-4 text-sm">
                          {pa.status ? (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(pa.status)}`}>
                              {pa.status}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">{pa.score !== null ? pa.score : "-"}</td>
                        <td className="px-6 py-4 text-sm">
                          {pa.submitted_at
                            ? new Date(pa.submitted_at).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {nominationsCount > 0 ? (
                            <span className="text-sm font-medium">
                              {acceptedCount}/{nominationsCount}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                      {isExpanded && pa.id && nominationsCount > 0 && (
                        <tr key={`nominations-${pa.id}`}>
                          <td colSpan={8} className="px-6 py-4 bg-muted/30">
                            <div className="mt-2">
                              <h4 className="text-sm font-semibold mb-3">Nominations</h4>
                              <table className="w-full border rounded-md">
                                <thead>
                                  <tr className="bg-muted/50 border-b">
                                    <th className="px-4 py-2 text-left text-xs font-medium">Type</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium">Reviewer</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium">Nominated By</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium">Submitted</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium">Created</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {participantNominations.map((nomination) => {
                                    const reviewerName = nomination.is_external
                                      ? nomination.external_reviewer?.email || "-"
                                      : nomination.reviewer
                                      ? `${nomination.reviewer.name || ""} ${nomination.reviewer.surname || ""}`.trim() || nomination.reviewer.email
                                      : "-";
                                    const nominatedByName = nomination.nominated_by
                                      ? `${nomination.nominated_by.name || ""} ${nomination.nominated_by.surname || ""}`.trim() || nomination.nominated_by.email
                                      : "-";

                                    return (
                                      <tr key={nomination.id} className="border-b">
                                        <td className="px-4 py-2 text-xs">
                                          {nomination.is_external ? (
                                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">External</span>
                                          ) : (
                                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Internal</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-xs">{reviewerName}</td>
                                        <td className="px-4 py-2 text-xs">
                                          {nomination.request_status ? (
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getNominationStatusColor(nomination.request_status)}`}>
                                              {nomination.request_status}
                                            </span>
                                          ) : (
                                            "-"
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-xs">{nominatedByName}</td>
                                        <td className="px-4 py-2 text-xs">
                                          {nomination.review_submitted_at
                                            ? new Date(nomination.review_submitted_at).toLocaleDateString()
                                            : "-"}
                                        </td>
                                        <td className="px-4 py-2 text-xs">
                                          {nomination.created_at
                                            ? new Date(nomination.created_at).toLocaleDateString()
                                            : "-"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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

