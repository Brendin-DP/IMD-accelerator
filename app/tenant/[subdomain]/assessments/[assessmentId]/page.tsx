"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { ToastContainer, useToast } from "@/components/ui/toast";
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
}

interface ClientUser {
  id: string;
  name: string | null;
  surname: string | null;
  email: string;
  client_id: string;
}

export default function TenantAssessmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const assessmentId = params.assessmentId as string;

  const [user, setUser] = useState<any>(null);
  const [assessment, setAssessment] = useState<CohortAssessment | null>(null);
  const [participantAssessment, setParticipantAssessment] = useState<ParticipantAssessment | null>(null);
  const [nominations, setNominations] = useState<ReviewerNomination[]>([]);
  const [clientRoster, setClientRoster] = useState<ClientUser[]>([]);
  const [isNominationModalOpen, setIsNominationModalOpen] = useState(false);
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [submittingNominations, setSubmittingNominations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toasts, showToast, removeToast } = useToast();

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
      
      // If we have a participant assessment, fetch nominations
      if (participantAssessmentData) {
        fetchNominations(participantAssessmentData.id, userId);
      }
    } catch (err) {
      console.error("Error fetching participant assessment:", err);
      setParticipantAssessment(null);
    }
  }

  async function fetchNominations(participantAssessmentId: string, userId: string) {
    try {
      // Fetch nominations where this user nominated reviewers
      // Only fetch active nominations (pending or accepted), exclude rejected ones for counting
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select("*")
        .eq("participant_assessment_id", participantAssessmentId)
        .eq("nominated_by_id", userId)
        .or("status.eq.pending,status.eq.accepted")
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

      // Fetch reviewer details
      const reviewerIds = [...new Set(nominationsData.map((n: any) => n.reviewer_id))];
      const { data: clientUsers, error: usersError } = await supabase
        .from("client_users")
        .select("id, name, surname, email")
        .in("id", reviewerIds);

      if (usersError) {
        console.error("Error fetching client users:", usersError);
        setNominations(nominationsData as ReviewerNomination[]);
        return;
      }

      // Merge the data
      const mergedNominations = nominationsData.map((nomination: any) => ({
        ...nomination,
        reviewer: clientUsers?.find((u: any) => u.id === nomination.reviewer_id) || null,
      }));

      setNominations(mergedNominations as ReviewerNomination[]);
    } catch (err) {
      console.error("Error fetching nominations:", err);
      setNominations([]);
    }
  }

  async function fetchClientRoster(clientId: string, currentUserId: string) {
    try {
      setLoadingRoster(true);
      
      // Fetch all client_users for this client, excluding the current user
      const { data: rosterData, error: rosterError } = await supabase
        .from("client_users")
        .select("id, name, surname, email, client_id")
        .eq("client_id", clientId)
        .neq("id", currentUserId)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (rosterError) {
        console.error("Error fetching client roster:", rosterError);
        setClientRoster([]);
        return;
      }

      setClientRoster(rosterData || []);
    } catch (err) {
      console.error("Error fetching client roster:", err);
      setClientRoster([]);
    } finally {
      setLoadingRoster(false);
    }
  }

  function handleOpenNominationModal() {
    if (!user || !participantAssessment) {
      alert("Please ensure you are logged in and have an active assessment.");
      return;
    }
    
    // Get client_id from user
    const clientId = (user as any).client_id;
    if (!clientId) {
      console.error("User client_id not found:", user);
      alert("Unable to load client roster. Please try logging out and back in.");
      return;
    }
    
    fetchClientRoster(clientId, user.id);
    setIsNominationModalOpen(true);
    setSelectedReviewers([]);
  }

  function handleToggleReviewer(reviewerId: string) {
    setSelectedReviewers((prev) => {
      if (prev.includes(reviewerId)) {
        return prev.filter((id) => id !== reviewerId);
      } else {
        // Limit to 10 total active nominations (existing active + new selections)
        // Only count active nominations (pending or accepted), not rejected ones
        const activeNominationsCount = nominations.filter(n => n.status === "pending" || n.status === "accepted").length;
        const maxNewSelections = 10 - activeNominationsCount;
        if (prev.length >= maxNewSelections) {
          showToast(`You can only select up to ${maxNewSelections} more reviewer(s). You already have ${activeNominationsCount} active nomination(s).`, "info");
          return prev;
        }
        return [...prev, reviewerId];
      }
    });
  }

  async function handleSubmitNominations() {
    if (!participantAssessment || !user || selectedReviewers.length === 0) {
      return;
    }

    try {
      setSubmittingNominations(true);

      // Check existing nominations to avoid duplicates
      // Only check for active nominations (pending or accepted), not rejected ones
      const { data: existingNominations, error: checkError } = await supabase
        .from("reviewer_nominations")
        .select("reviewer_id, status")
        .eq("participant_assessment_id", participantAssessment.id)
        .eq("nominated_by_id", user.id)
        .or("status.eq.pending,status.eq.accepted");

      if (checkError) {
        console.error("Error checking existing nominations:", checkError);
        showToast("Error checking existing nominations. Please try again.", "error");
        setSubmittingNominations(false);
        return;
      }

      const existingReviewerIds = new Set(existingNominations?.map((n: any) => n.reviewer_id) || []);
      const newReviewerIds = selectedReviewers.filter((id) => !existingReviewerIds.has(id));

      if (newReviewerIds.length === 0) {
        showToast("All selected reviewers have already been nominated or have pending/accepted nominations.", "info");
        setSubmittingNominations(false);
        return;
      }

      // Create nominations
      const nominationsToInsert = newReviewerIds.map((reviewerId) => ({
        participant_assessment_id: participantAssessment.id,
        reviewer_id: reviewerId,
        nominated_by_id: user.id,
        status: "pending", // Default status - pending review
      }));

      const { error: insertError } = await supabase
        .from("reviewer_nominations")
        .insert(nominationsToInsert);

      if (insertError) {
        console.error("Error creating nominations:", insertError);
        showToast("Error creating nominations. Please try again.", "error");
        return;
      }

      // Refresh nominations list
      await fetchNominations(participantAssessment.id, user.id);
      
      // Close modal and reset
      setIsNominationModalOpen(false);
      setSelectedReviewers([]);
      
      // Show success toast
      showToast(
        `Successfully requested ${newReviewerIds.length} nomination${newReviewerIds.length > 1 ? "s" : ""}.`,
        "success"
      );
    } catch (err) {
      console.error("Error submitting nominations:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setSubmittingNominations(false);
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

      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.push(`/dashboard`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{assessmentName}</h1>
        <p className="text-muted-foreground mt-2">
          {cohortName}
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

      {/* Nominate for Review Section */}
      {participantAssessment && participantAssessment.allow_reviewer_nominations && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Nominate for Review</CardTitle>
              <Button
                onClick={handleOpenNominationModal}
                disabled={nominations.filter(n => n.status === "pending" || n.status === "accepted").length >= 10}
              >
                Request Nomination
              </Button>
            </div>
            {nominations.filter(n => n.status === "pending" || n.status === "accepted").length >= 10 && (
              <p className="text-sm text-muted-foreground mt-2">
                You have reached the maximum of 10 active nominations.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {nominations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No nominations requested yet.</p>
            ) : (
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Surname</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Email</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                      <th className="px-6 py-3 text-left text-sm font-medium">Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nominations.map((nomination) => {
                      const reviewer = nomination.reviewer;
                      
                      return (
                        <tr key={nomination.id} className="border-b hover:bg-muted/50">
                          <td className="px-6 py-4 text-sm font-medium">
                            {reviewer?.name || "-"}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium">
                            {reviewer?.surname || "-"}
                          </td>
                          <td className="px-6 py-4 text-sm">{reviewer?.email || "-"}</td>
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
            )}
          </CardContent>
        </Card>
      )}

      {/* Nomination Modal */}
      <Dialog open={isNominationModalOpen} onOpenChange={setIsNominationModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Nomination</DialogTitle>
            <DialogDescription>
              Select up to {10 - nominations.filter(n => n.status === "pending" || n.status === "accepted").length} reviewers from your client roster. You have {nominations.filter(n => n.status === "pending" || n.status === "accepted").length} active nomination(s).
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => setIsNominationModalOpen(false)} />

          <div className="space-y-4">
            {loadingRoster ? (
              <div className="p-8 text-center text-muted-foreground">Loading roster...</div>
            ) : clientRoster.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No users available in your roster.</div>
            ) : (
              <>
                <div className="border rounded-md max-h-96 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left text-sm font-medium w-12"></th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Surname</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientRoster.map((user) => {
                        const isSelected = selectedReviewers.includes(user.id);
                        // Only disable if they have an active nomination (pending or accepted), not rejected
                        const activeNominationsCount = nominations.filter(n => n.status === "pending" || n.status === "accepted").length;
                        const isAlreadyNominated = nominations.some(
                          (n) => n.reviewer_id === user.id && (n.status === "pending" || n.status === "accepted")
                        );
                        
                        return (
                          <tr
                            key={user.id}
                            className={`border-b hover:bg-muted/50 ${
                              isAlreadyNominated ? "opacity-50" : ""
                            }`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={
                                  isAlreadyNominated ||
                                  (!isSelected && selectedReviewers.length >= (10 - activeNominationsCount))
                                }
                                onChange={() => handleToggleReviewer(user.id)}
                                className="h-4 w-4 rounded border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {user.name || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {user.surname || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm">{user.email}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    {selectedReviewers.length} of {10 - nominations.filter(n => n.status === "pending" || n.status === "accepted").length} selected
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsNominationModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmitNominations}
                      disabled={
                        selectedReviewers.length === 0 || submittingNominations
                      }
                    >
                      {submittingNominations ? "Submitting..." : "Submit Request"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

