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
  nominated_by_id: string;
  status: string | null;
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
  const [nominationsLoading, setNominationsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"internal" | "external">("internal");
  const [nominationSearch, setNominationSearch] = useState("");

  useEffect(() => {
    if (participantAssessmentId && cohortId && assessmentId) {
      const loadData = async () => {
        setLoading(true);
        setNominationsLoading(true);
        try {
          await Promise.all([
            fetchParticipantAssessment(),
            fetchNominations(),
            fetchCohortAndAssessmentNames(),
          ]);
        } finally {
          setLoading(false);
          setNominationsLoading(false);
        }
      };
      loadData();
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
      // Try to fetch with relationship first, but always have fallback
      const { data, error: dbError } = await supabase
        .from("participant_assessments")
        .select(`
          *,
          participant:cohort_participants(
            id,
            client_user_id,
            client_user:client_users!cohort_participants_client_user_id_fkey(id, name, surname, email)
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
        // Normalize the data structure - ensure client_user is always populated
        const participant = data.participant as any;
        let normalizedData = { ...data };
        
        if (participant) {
          // If client_user is missing but we have client_user_id, fetch it
          if (!participant.client_user && participant.client_user_id) {
            console.log("Client user missing, fetching for client_user_id:", participant.client_user_id);
            const { data: clientUserData, error: userError } = await supabase
              .from("client_users")
              .select("id, name, surname, email")
              .eq("id", participant.client_user_id)
              .single();
            
            if (!userError && clientUserData) {
              normalizedData = {
                ...data,
                participant: {
                  ...participant,
                  client_user: clientUserData,
                },
              };
            } else {
              console.error("Error fetching client user:", userError);
            }
          }
        } else if (data.participant_id) {
          // If participant object is missing entirely, fetch it
          console.log("Participant object missing, fetching for participant_id:", data.participant_id);
          const { data: participantData, error: participantError } = await supabase
            .from("cohort_participants")
            .select("id, client_user_id")
            .eq("id", data.participant_id)
            .single();

          if (!participantError && participantData && participantData.client_user_id) {
            const { data: clientUserData, error: userError } = await supabase
              .from("client_users")
              .select("id, name, surname, email")
              .eq("id", participantData.client_user_id)
              .single();

            if (!userError && clientUserData) {
              normalizedData = {
                ...data,
                participant: {
                  ...participantData,
                  client_user: clientUserData,
                },
              };
            }
          }
        }
        
        console.log("Participant assessment data:", normalizedData);
        setParticipantAssessment(normalizedData);
      } else {
        // If no data returned, try fetching separately as fallback
        console.warn("No data returned from relationship query, trying separate fetch");
        const { data: paData, error: paError } = await supabase
          .from("participant_assessments")
          .select("*")
          .eq("id", participantAssessmentId)
          .single();

        if (!paError && paData?.participant_id) {
          const { data: participantData, error: participantError } = await supabase
            .from("cohort_participants")
            .select("id, client_user_id")
            .eq("id", paData.participant_id)
            .single();

          if (!participantError && participantData && participantData.client_user_id) {
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
        }
      }

      setError(null);
    } catch (err) {
      console.error("Error fetching participant assessment:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setParticipantAssessment(null);
    }
  }

  async function fetchNominations() {
    try {
      setNominationsLoading(true);
      console.log("Fetching nominations for participant_assessment_id:", participantAssessmentId);
      
      if (!participantAssessmentId) {
        console.error("participant_assessment_id is missing");
        setError("Participant assessment ID is missing");
        setNominations([]);
        return;
      }

      // Fetch ALL reviewer nominations for this participant assessment (regardless of status)
      // Explicitly query from reviewer_nominations table
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select("*")
        .eq("participant_assessment_id", participantAssessmentId)
        .order("created_at", { ascending: false });

      if (nominationsError) {
        console.error("Error fetching nominations from reviewer_nominations:", nominationsError);
        setError(`Error fetching nominations: ${nominationsError.message}`);
        setNominations([]);
        return;
      }

      console.log("Fetched nominations from reviewer_nominations:", nominationsData?.length || 0, nominationsData);

      if (!nominationsData || nominationsData.length === 0) {
        console.log("No nominations found for participant_assessment_id:", participantAssessmentId);
        setNominations([]);
        return;
      }

      // Separate internal and external nominations
      const internalNominations = nominationsData.filter((n: any) => !n.is_external && n.reviewer_id);
      const externalNominations = nominationsData.filter((n: any) => n.is_external && n.external_reviewer_id);

      // Get unique reviewer and nominated_by IDs for internal nominations
      const reviewerIds = [...new Set(internalNominations.map((n: any) => n.reviewer_id).filter(Boolean))];
      const nominatedByIds = [...new Set(nominationsData.map((n: any) => n.nominated_by_id).filter(Boolean))];
      const allUserIds = [...new Set([...reviewerIds, ...nominatedByIds])];

      console.log("Fetching client users for IDs:", allUserIds);

      // Fetch client users
      const { data: clientUsers, error: usersError } = await supabase
        .from("client_users")
        .select("id, name, surname, email")
        .in("id", allUserIds);

      if (usersError) {
        console.error("Error fetching client users:", usersError);
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

      console.log("Fetched client users:", clientUsers?.length || 0);
      console.log("Fetched external reviewers:", externalReviewers?.length || 0);

      // Merge the data
      const mergedNominations = nominationsData.map((nomination: any) => {
        if (nomination.is_external && nomination.external_reviewer_id) {
          // External reviewer
          return {
            ...nomination,
            reviewer: null,
            external_reviewer: externalReviewers.find((e: any) => e.id === nomination.external_reviewer_id) || null,
            nominated_by: clientUsers?.find((u: any) => u.id === nomination.nominated_by_id) || null,
          };
        } else {
          // Internal reviewer
          return {
            ...nomination,
            reviewer: clientUsers?.find((u: any) => u.id === nomination.reviewer_id) || null,
            external_reviewer: null,
            nominated_by: clientUsers?.find((u: any) => u.id === nomination.nominated_by_id) || null,
          };
        }
      });

      console.log("Merged nominations:", mergedNominations.length);
      setNominations(mergedNominations);
    } catch (err) {
      console.error("Error fetching nominations:", err);
      setError(`Error fetching nominations: ${err instanceof Error ? err.message : "Unknown error"}`);
      setNominations([]);
    } finally {
      setNominationsLoading(false);
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
        <Button variant="tertiary" onClick={() => router.push(`/cohorts/${cohortId}/assessments/${assessmentId}`)} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Assessment
        </Button>
      </div>
    );
  }

  // Extract participant client_user info - handle both structures
  const participantObj = participantAssessment.participant as any;
  const participant = participantObj?.client_user || participantObj?.client_users || null;
  const participantName = participant
    ? `${participant.name || ""} ${participant.surname || ""}`.trim() || participant.email
    : "Participant";
  
  console.log("Participant object:", participantObj);
  console.log("Participant client_user:", participant);

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

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push(`/cohorts/${cohortId}/assessments/${assessmentId}`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Assessment
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Nomination Requests</h1>
        <p className="text-muted-foreground mt-2">
          Review nominations for {participantName}
        </p>
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
      <Card>
        <CardHeader>
          <CardTitle>Reviewer Nominations</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Tabs and Search */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex space-x-1 border-b">
              <button
                onClick={() => setActiveTab("internal")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "internal"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Internal Nominations
              </button>
              <button
                onClick={() => setActiveTab("external")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "external"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                External Nominations
              </button>
            </div>
            <Input
              type="text"
              placeholder="Search nominations..."
              value={nominationSearch}
              onChange={(e) => setNominationSearch(e.target.value)}
              className="w-64"
            />
          </div>

          {nominationsLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading nominations...
            </div>
          ) : activeTab === "internal" ? (
            (() => {
              let internalNominations = nominations.filter((n) => !n.is_external);
              
              // Filter by search
              if (nominationSearch.trim()) {
                const searchLower = nominationSearch.toLowerCase();
                internalNominations = internalNominations.filter((nomination) => {
                  const reviewer = nomination.reviewer as any;
                  const nominatedBy = nomination.nominated_by as any;
                  const reviewerName = `${reviewer?.name || ""} ${reviewer?.surname || ""}`.trim().toLowerCase() || reviewer?.email?.toLowerCase() || "";
                  const nominatedByName = `${nominatedBy?.name || ""} ${nominatedBy?.surname || ""}`.trim().toLowerCase() || nominatedBy?.email?.toLowerCase() || "";
                  const status = (nomination.status || "").toLowerCase();
                  
                  return reviewerName.includes(searchLower) || 
                         nominatedByName.includes(searchLower) || 
                         status.includes(searchLower);
                });
              }
              
              // Prepare internal nominations for sorting
              const internalForSorting = internalNominations.map((nomination) => ({
                ...nomination,
                reviewerName: `${(nomination.reviewer as any)?.name || ""} ${(nomination.reviewer as any)?.surname || ""}`.trim() || (nomination.reviewer as any)?.email || "",
                nominatedByName: nomination.nominated_by
                  ? `${nomination.nominated_by.name || ""} ${nomination.nominated_by.surname || ""}`.trim() || nomination.nominated_by.email || ""
                  : "",
              }));

              const { sortedData: sortedInternal, sortConfig: sortConfigInternal, handleSort: handleSortInternal } = useTableSort(internalForSorting);

              return sortedInternal.length === 0 ? (
                <p className="text-sm text-muted-foreground">No internal nominations found for this participant.</p>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortInternal("reviewerName")}
                        >
                          <div className="flex items-center gap-2">
                            Reviewer
                            {sortConfigInternal.key === "reviewerName" && (
                              sortConfigInternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortInternal("nominatedByName")}
                        >
                          <div className="flex items-center gap-2">
                            Nominated By
                            {sortConfigInternal.key === "nominatedByName" && (
                              sortConfigInternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortInternal("status")}
                        >
                          <div className="flex items-center gap-2">
                            Status
                            {sortConfigInternal.key === "status" && (
                              sortConfigInternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortInternal("review_submitted_at")}
                        >
                          <div className="flex items-center gap-2">
                            Review Submitted
                            {sortConfigInternal.key === "review_submitted_at" && (
                              sortConfigInternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortInternal("created_at")}
                        >
                          <div className="flex items-center gap-2">
                            Created
                            {sortConfigInternal.key === "created_at" && (
                              sortConfigInternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedInternal.map((nomination) => {
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
                </div>
              );
            })()
          ) : (
            (() => {
              let externalNominations = nominations.filter((n) => n.is_external);
              
              // Filter by search
              if (nominationSearch.trim()) {
                const searchLower = nominationSearch.toLowerCase();
                externalNominations = externalNominations.filter((nomination) => {
                  const externalReviewer = nomination.external_reviewer as any;
                  const nominatedBy = nomination.nominated_by as any;
                  const email = (externalReviewer?.email || "").toLowerCase();
                  const nominatedByName = `${nominatedBy?.name || ""} ${nominatedBy?.surname || ""}`.trim().toLowerCase() || nominatedBy?.email?.toLowerCase() || "";
                  const status = (nomination.status || "").toLowerCase();
                  
                  return email.includes(searchLower) || 
                         nominatedByName.includes(searchLower) || 
                         status.includes(searchLower);
                });
              }
              
              // Prepare external nominations for sorting
              const externalForSorting = externalNominations.map((nomination) => ({
                ...nomination,
                email: (nomination.external_reviewer as any)?.email || "",
                nominatedByName: nomination.nominated_by
                  ? `${nomination.nominated_by.name || ""} ${nomination.nominated_by.surname || ""}`.trim() || nomination.nominated_by.email || ""
                  : "",
              }));

              const { sortedData: sortedExternal, sortConfig: sortConfigExternal, handleSort: handleSortExternal } = useTableSort(externalForSorting);

              return sortedExternal.length === 0 ? (
                <p className="text-sm text-muted-foreground">No external nominations found for this participant.</p>
              ) : (
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortExternal("email")}
                        >
                          <div className="flex items-center gap-2">
                            Email
                            {sortConfigExternal.key === "email" && (
                              sortConfigExternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortExternal("nominatedByName")}
                        >
                          <div className="flex items-center gap-2">
                            Nominated By
                            {sortConfigExternal.key === "nominatedByName" && (
                              sortConfigExternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortExternal("status")}
                        >
                          <div className="flex items-center gap-2">
                            Status
                            {sortConfigExternal.key === "status" && (
                              sortConfigExternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortExternal("review_submitted_at")}
                        >
                          <div className="flex items-center gap-2">
                            Review Submitted
                            {sortConfigExternal.key === "review_submitted_at" && (
                              sortConfigExternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                          onClick={() => handleSortExternal("created_at")}
                        >
                          <div className="flex items-center gap-2">
                            Created
                            {sortConfigExternal.key === "created_at" && (
                              sortConfigExternal.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedExternal.map((nomination) => {
                        const externalReviewer = nomination.external_reviewer as any;
                        const nominatedBy = nomination.nominated_by as any;
                        return (
                          <tr key={nomination.id} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium">
                              {externalReviewer?.email || "-"}
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
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}

