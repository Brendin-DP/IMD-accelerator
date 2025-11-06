"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";
import { useTableSort } from "@/hooks/useTableSort";

interface ReviewerNomination {
  id: string;
  participant_assessment_id: string;
  reviewer_id: string | null;
  external_reviewer_id: string | null;
  is_external: boolean | null;
  nominated_by_id: string | null;
  request_status: string | null;
  review_submitted_at: string | null;
  review_status: string | null;
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
    review_status: string | null;
  } | null;
  nominated_by?: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
  } | null;
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

export default function ParticipantAssessmentDetailPage() {
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
  const [nominationSearch, setNominationSearch] = useState("");

  // Filter nominations based on search
  const filteredNominations = nominations.filter((nomination) => {
    if (!nominationSearch.trim()) return true;
    const searchLower = nominationSearch.toLowerCase();
    const reviewerName = nomination.is_external
      ? (nomination.external_reviewer?.email || "").toLowerCase()
      : nomination.reviewer
      ? `${nomination.reviewer.name || ""} ${nomination.reviewer.surname || ""}`.trim().toLowerCase() || nomination.reviewer.email.toLowerCase()
      : "";
    const nominatedByName = nomination.nominated_by
      ? `${nomination.nominated_by.name || ""} ${nomination.nominated_by.surname || ""}`.trim().toLowerCase() || nomination.nominated_by.email.toLowerCase()
      : "";
    const status = (nomination.request_status || "").toLowerCase();
    const type = nomination.is_external ? "external" : "internal";
    
    return reviewerName.includes(searchLower) || 
           nominatedByName.includes(searchLower) || 
           status.includes(searchLower) ||
           type.includes(searchLower);
  });

  // Prepare nominations for sorting
  const nominationsForSorting = filteredNominations.map((nomination) => ({
    ...nomination,
    reviewerName: nomination.is_external
      ? nomination.external_reviewer?.email || ""
      : nomination.reviewer
      ? `${nomination.reviewer.name || ""} ${nomination.reviewer.surname || ""}`.trim() || nomination.reviewer.email || ""
      : "",
    nominatedByName: nomination.nominated_by
      ? `${nomination.nominated_by.name || ""} ${nomination.nominated_by.surname || ""}`.trim() || nomination.nominated_by.email || ""
      : "",
    isExternalText: nomination.is_external ? "External" : "Internal",
    reviewStatus: nomination.review_status || "",
  }));

  const { sortedData: sortedNominations, sortConfig, handleSort } = useTableSort(nominationsForSorting);

  useEffect(() => {
    if (participantAssessmentId && cohortId && assessmentId) {
      fetchData();
    }
  }, [participantAssessmentId, cohortId, assessmentId]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      await Promise.all([
        fetchParticipantAssessment(),
        fetchNominations(),
        fetchCohortAndAssessmentNames(),
      ]);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

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
      console.error("Error fetching names:", err);
    }
  }

  async function fetchParticipantAssessment() {
    try {
      // Try fetching with relationships first
      let { data, error: dbError } = await supabase
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
          participant:cohort_participants(
            id,
            client_user_id,
            cohort_id,
            client_user:client_users(id, name, surname, email)
          ),
          cohort_assessment:cohort_assessments(
            id,
            name,
            start_date,
            end_date,
            assessment_status,
            assessment_type:assessment_types(id, name, description)
          )
        `)
        .eq("id", participantAssessmentId)
        .single();

      // If relationship query fails, fallback to separate queries
      if (dbError && (dbError.message?.includes("relationship") || dbError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately:", dbError.message);

        // Fetch participant assessment without relationships
        const { data: paData, error: paError } = await supabase
          .from("participant_assessments")
          .select("*")
          .eq("id", participantAssessmentId)
          .single();

        if (paError) {
          throw paError;
        }

        // Fetch participant with client user
        const { data: participantData, error: participantError } = await supabase
          .from("cohort_participants")
          .select("id, client_user_id, cohort_id")
          .eq("id", paData.participant_id)
          .single();

        let clientUser = null;
        if (!participantError && participantData) {
          const { data: userData, error: userError } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .eq("id", participantData.client_user_id)
            .single();

          if (!userError && userData) {
            clientUser = userData;
          }
        }

        // Fetch cohort assessment with assessment type
        const { data: assessmentData, error: assessmentError } = await supabase
          .from("cohort_assessments")
          .select("id, name, start_date, end_date, assessment_status, assessment_type_id")
          .eq("id", paData.cohort_assessment_id)
          .single();

        let assessmentType = null;
        if (!assessmentError && assessmentData?.assessment_type_id) {
          const { data: typeData, error: typeError } = await supabase
            .from("assessment_types")
            .select("id, name, description")
            .eq("id", assessmentData.assessment_type_id)
            .single();

          if (!typeError && typeData) {
            assessmentType = typeData;
          }
        }

        // Merge the data
        data = {
          ...paData,
          participant: participantData
            ? {
                ...participantData,
                client_user: clientUser,
              }
            : null,
          cohort_assessment: assessmentData
            ? {
                ...assessmentData,
                assessment_type: assessmentType,
              }
            : null,
        };

        dbError = null;
      }

      if (dbError) {
        throw dbError;
      }

      setParticipantAssessment(data);
    } catch (err) {
      console.error("Error fetching participant assessment:", err);
      setError(err instanceof Error ? err.message : "Failed to load participant assessment");
      setParticipantAssessment(null);
    }
  }

  async function fetchNominations() {
    try {
      if (!participantAssessmentId) {
        setNominations([]);
        return;
      }

      // Fetch all nominations for this participant assessment, including review_status
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select("*")
        .eq("participant_assessment_id", participantAssessmentId)
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

      // Fetch external reviewers, including review_status
      const externalReviewerIds = [...new Set(externalNominations.map((n: any) => n.external_reviewer_id).filter(Boolean))];
      let externalReviewers: any[] = [];
      if (externalReviewerIds.length > 0) {
        const { data: externalReviewersData, error: externalError } = await supabase
          .from("external_reviewers")
          .select("id, email, review_status")
          .in("id", externalReviewerIds);

        if (!externalError && externalReviewersData) {
          externalReviewers = externalReviewersData;
        }
      }

      // Merge the data
      const mergedNominations = nominationsData.map((nomination: any) => {
        if (nomination.is_external && nomination.external_reviewer_id) {
          // External reviewer - get review_status from external_reviewers table
          const externalReviewer = externalReviewers.find((e: any) => e.id === nomination.external_reviewer_id);
          return {
            ...nomination,
            reviewer: null,
            external_reviewer: externalReviewer || null,
            review_status: externalReviewer?.review_status || nomination.review_status || null,
            nominated_by: clientUsers.find((u: any) => u.id === nomination.nominated_by_id) || null,
          };
        } else {
          // Internal reviewer - get review_status from reviewer_nominations table
          return {
            ...nomination,
            reviewer: clientUsers.find((u: any) => u.id === nomination.reviewer_id) || null,
            external_reviewer: null,
            review_status: nomination.review_status || null,
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

  function getStatusColor(status: string | null): string {
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
  }

  function getReviewStatusColor(status: string | null): string {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed" || statusLower === "done" || statusLower === "submitted") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "in_progress" || statusLower === "in progress") {
      return "bg-blue-100 text-blue-800";
    } else if (statusLower === "draft" || statusLower === "pending" || statusLower === "not started") {
      return "bg-yellow-100 text-yellow-800";
    } else if (statusLower === "cancelled" || statusLower === "rejected") {
      return "bg-red-100 text-red-800";
    }
    return "bg-gray-100 text-gray-800";
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading participant details...</div>
      </div>
    );
  }

  if (error || !participantAssessment) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">
          {error || "Participant assessment not found"}
        </div>
        <Button variant="tertiary" onClick={() => router.push(`/cohorts/${cohortId}/assessments/${assessmentId}`)} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessment
        </Button>
      </div>
    );
  }

  const participant = participantAssessment.participant as any;
  const clientUser = participant?.client_user as any;
  const assessment = participantAssessment.cohort_assessment as any;
  const assessmentType = assessment?.assessment_type as any;

  const participantName = clientUser
    ? `${clientUser.name || ""} ${clientUser.surname || ""}`.trim() || clientUser.email
    : "Participant";

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Cohorts", href: "/cohorts" },
          { label: cohortName, href: `/cohorts/${cohortId}` },
          { label: assessmentName, href: `/cohorts/${cohortId}/assessments/${assessmentId}` },
          { label: participantName },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push(`/cohorts/${cohortId}/assessments/${assessmentId}`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Assessment
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{participantName}</h1>
        <p className="text-muted-foreground mt-2">
          Participant details for {assessmentName}
        </p>
      </div>

      {/* Participant Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Participant Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <p className="text-sm font-medium mt-1">{clientUser?.name || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Surname</label>
              <p className="text-sm font-medium mt-1">{clientUser?.surname || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="text-sm font-medium mt-1">{clientUser?.email || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assessment Status</label>
              <p className="text-sm font-medium mt-1">
                {participantAssessment.status ? (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(participantAssessment.status)}`}>
                    {participantAssessment.status}
                  </span>
                ) : (
                  "-"
                )}
              </p>
            </div>
            {participantAssessment.score !== null && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Score</label>
                <p className="text-sm font-medium mt-1">{participantAssessment.score}</p>
              </div>
            )}
            {participantAssessment.submitted_at && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Submitted At</label>
                <p className="text-sm font-medium mt-1">
                  {new Date(participantAssessment.submitted_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Nominations Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Nominations</CardTitle>
            <Input
              type="text"
              placeholder="Search nominations..."
              value={nominationSearch}
              onChange={(e) => setNominationSearch(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          {sortedNominations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {nominationSearch.trim() 
                ? "No nominations match your search." 
                : "No nominations found for this participant assessment."}
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th 
                      className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                      onClick={() => handleSort("isExternalText")}
                    >
                      <div className="flex items-center gap-2">
                        Type
                        {sortConfig.key === "isExternalText" && (
                          sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                      onClick={() => handleSort("reviewerName")}
                    >
                      <div className="flex items-center gap-2">
                        Reviewer
                        {sortConfig.key === "reviewerName" && (
                          sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                      onClick={() => handleSort("request_status")}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        {sortConfig.key === "request_status" && (
                          sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                      onClick={() => handleSort("nominatedByName")}
                    >
                      <div className="flex items-center gap-2">
                        Nominated By
                        {sortConfig.key === "nominatedByName" && (
                          sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                      onClick={() => handleSort("created_at")}
                    >
                      <div className="flex items-center gap-2">
                        Requested
                        {sortConfig.key === "created_at" && (
                          sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                      onClick={() => handleSort("review_status")}
                    >
                      <div className="flex items-center gap-2">
                        Review Progress
                        {sortConfig.key === "review_status" && (
                          sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedNominations.map((nomination) => {
                    const reviewerName = nomination.is_external
                      ? nomination.external_reviewer?.email || "-"
                      : nomination.reviewer
                      ? `${nomination.reviewer.name || ""} ${nomination.reviewer.surname || ""}`.trim() || nomination.reviewer.email
                      : "-";
                    const nominatedByName = nomination.nominated_by
                      ? `${nomination.nominated_by.name || ""} ${nomination.nominated_by.surname || ""}`.trim() || nomination.nominated_by.email
                      : "-";

                    return (
                      <tr key={nomination.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 text-sm">
                          {nomination.is_external ? (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">External</span>
                          ) : (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Internal</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">{reviewerName}</td>
                        <td className="px-6 py-4 text-sm">
                          {nomination.request_status ? (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getNominationStatusColor(nomination.request_status)}`}>
                              {nomination.request_status}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">{nominatedByName}</td>
                        <td className="px-6 py-4 text-sm">
                          {nomination.created_at
                            ? new Date(nomination.created_at).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {nomination.review_status ? (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getReviewStatusColor(nomination.review_status)}`}>
                              {nomination.review_status}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

