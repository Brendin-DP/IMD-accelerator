"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToastContainer, useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabaseClient";

interface MyAssessment {
  id: string;
  status: string | null;
  score: number | null;
  submitted_at: string | null;
  cohort_assessment: {
    id: string;
    name: string | null;
    assessment_type?: {
      name: string;
    };
    cohort?: {
      id: string;
      name: string;
    };
  };
}

interface MyReview {
  id: string;
  status: string | null;
  created_at: string | null;
  participant_assessment: {
    id: string;
    participant?: {
      client_user?: {
        name: string | null;
        surname: string | null;
        email: string;
      };
    };
    cohort_assessment?: {
      name: string | null;
      assessment_type?: {
        name: string;
      };
      cohort?: {
        name: string;
      };
    };
  };
}

interface MyAction {
  id: string;
  status: string | null;
  created_at: string | null;
  nominated_by?: {
    id: string;
    name: string | null;
    surname: string | null;
    email: string;
  };
  participant_assessment: {
    id: string;
    participant?: {
      client_user?: {
        name: string | null;
        surname: string | null;
        email: string;
      };
    };
    cohort_assessment?: {
      name: string | null;
      assessment_type?: {
        name: string;
      };
      cohort?: {
        name: string;
      };
    };
  };
}

export default function TenantDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myAssessments, setMyAssessments] = useState<MyAssessment[]>([]);
  const [myReviews, setMyReviews] = useState<MyReview[]>([]);
  const [myActions, setMyActions] = useState<MyAction[]>([]);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const { toasts, showToast, removeToast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem("participant");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        if (userData.id) {
          fetchMyAssessments(userData.id);
          fetchMyReviews(userData.id);
          fetchMyActions(userData.id);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
    setLoading(false);
  }, []);

  async function fetchMyAssessments(userId: string) {
    try {
      // First, find all cohort_participants for this user
      const { data: participants, error: participantsError } = await supabase
        .from("cohort_participants")
        .select("id, cohort_id")
        .eq("client_user_id", userId);

      if (participantsError || !participants) {
        console.error("Error fetching participants:", participantsError);
        setMyAssessments([]);
        return;
      }

      const participantIds = participants.map((p: any) => p.id);
      const cohortIds = [...new Set(participants.map((p: any) => p.cohort_id).filter(Boolean))];

      if (participantIds.length === 0 || cohortIds.length === 0) {
        setMyAssessments([]);
        return;
      }

      // Fetch all cohort_assessments for cohorts this user is in
      const { data: cohortAssessments, error: cohortAssessmentsError } = await supabase
        .from("cohort_assessments")
        .select(`
          id,
          name,
          start_date,
          end_date,
          assessment_status,
          assessment_type:assessment_types(id, name, description),
          cohort:cohorts(id, name)
        `)
        .in("cohort_id", cohortIds)
        .order("created_at", { ascending: false });

      if (cohortAssessmentsError) {
        console.error("Error fetching cohort assessments:", cohortAssessmentsError);
        setMyAssessments([]);
        return;
      }

      // Fetch existing participant_assessments to get status and score
      const { data: participantAssessments, error: paError } = await supabase
        .from("participant_assessments")
        .select("id, cohort_assessment_id, status, score, submitted_at")
        .in("participant_id", participantIds);

      // Create a map of cohort_assessment_id -> participant_assessment
      const paMap = new Map();
      if (participantAssessments) {
        participantAssessments.forEach((pa: any) => {
          paMap.set(pa.cohort_assessment_id, pa);
        });
      }

      // Combine cohort_assessments with participant_assessment data
      const assessments = (cohortAssessments || []).map((ca: any) => {
        const pa = paMap.get(ca.id);
        return {
          id: pa?.id || ca.id, // Use participant_assessment id if exists, otherwise cohort_assessment id
          status: pa?.status || null,
          score: pa?.score || null,
          submitted_at: pa?.submitted_at || null,
          cohort_assessment: {
            id: ca.id,
            name: ca.name || ca.assessment_type?.name || "Assessment",
            assessment_type: ca.assessment_type,
            cohort: ca.cohort,
          },
        };
      });

      setMyAssessments(assessments);
    } catch (err) {
      console.error("Error fetching my assessments:", err);
      setMyAssessments([]);
    }
  }

  async function fetchMyReviews(userId: string) {
    try {
      // Fetch nominations where this user is the reviewer and status is "accepted"
      const { data: nominations, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          status,
          created_at,
          participant_assessment:participant_assessments(
            id,
            participant:cohort_participants(
              client_user:client_users(id, name, surname, email)
            ),
            cohort_assessment:cohort_assessments(
              name,
              assessment_type:assessment_types(name),
              cohort:cohorts(name)
            )
          )
        `)
        .eq("reviewer_id", userId)
        .eq("status", "accepted")
        .order("created_at", { ascending: false });

      // Handle relationship cache issues
      if (nominationsError && (nominationsError.message?.includes("relationship") || nominationsError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");
        
        const { data: nominationsOnly, error: nominationsOnlyError } = await supabase
          .from("reviewer_nominations")
          .select("id, status, created_at, participant_assessment_id")
          .eq("reviewer_id", userId)
          .eq("status", "accepted")
          .order("created_at", { ascending: false });

        if (nominationsOnlyError) {
          setMyReviews([]);
          return;
        }

        if (nominationsOnly && nominationsOnly.length > 0) {
          const participantAssessmentIds = nominationsOnly.map((n: any) => n.participant_assessment_id);
          
          // Fetch participant assessments
          const { data: participantAssessments, error: paError } = await supabase
            .from("participant_assessments")
            .select("id, participant_id, cohort_assessment_id")
            .in("id", participantAssessmentIds);

          if (paError) {
            setMyReviews([]);
            return;
          }

          // Fetch cohort participants and client users
          const participantIds = [...new Set(participantAssessments?.map((pa: any) => pa.participant_id) || [])];
          const { data: cohortParticipants, error: cpError } = await supabase
            .from("cohort_participants")
            .select("id, client_user_id")
            .in("id", participantIds);

          const clientUserIds = [...new Set(cohortParticipants?.map((cp: any) => cp.client_user_id) || [])];
          const { data: clientUsers, error: cuError } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", clientUserIds);

          // Fetch cohort assessments
          const cohortAssessmentIds = [...new Set(participantAssessments?.map((pa: any) => pa.cohort_assessment_id) || [])];
          const { data: cohortAssessments, error: caError } = await supabase
            .from("cohort_assessments")
            .select("id, name, assessment_type_id, cohort_id")
            .in("id", cohortAssessmentIds);

          // Fetch assessment types and cohorts
          const assessmentTypeIds = [...new Set(cohortAssessments?.map((ca: any) => ca.assessment_type_id).filter(Boolean) || [])];
          const { data: assessmentTypes } = await supabase
            .from("assessment_types")
            .select("id, name")
            .in("id", assessmentTypeIds);

          const cohortIds = [...new Set(cohortAssessments?.map((ca: any) => ca.cohort_id).filter(Boolean) || [])];
          const { data: cohorts } = await supabase
            .from("cohorts")
            .select("id, name")
            .in("id", cohortIds);

          // Merge data
          const merged = nominationsOnly.map((nomination: any) => {
            const participantAssessment = participantAssessments?.find((pa: any) => pa.id === nomination.participant_assessment_id);
            const cohortParticipant = cohortParticipants?.find((cp: any) => cp.id === participantAssessment?.participant_id);
            const clientUser = clientUsers?.find((cu: any) => cu.id === cohortParticipant?.client_user_id);
            const cohortAssessment = cohortAssessments?.find((ca: any) => ca.id === participantAssessment?.cohort_assessment_id);
            const assessmentType = assessmentTypes?.find((at: any) => at.id === cohortAssessment?.assessment_type_id);
            const cohort = cohorts?.find((c: any) => c.id === cohortAssessment?.cohort_id);

            return {
              ...nomination,
              participant_assessment: {
                id: participantAssessment?.id,
                participant: {
                  client_user: clientUser,
                },
                cohort_assessment: {
                  name: cohortAssessment?.name,
                  assessment_type: assessmentType,
                  cohort: cohort,
                },
              },
            };
          });

          setMyReviews(merged || []);
        } else {
          setMyReviews([]);
        }
      } else if (nominations) {
        setMyReviews(nominations || []);
      } else {
        setMyReviews([]);
      }
    } catch (err) {
      console.error("Error fetching my reviews:", err);
      setMyReviews([]);
    }
  }

  async function fetchMyActions(userId: string) {
    try {
      // Fetch nominations where this user is the reviewer and status is "pending"
      const { data: nominations, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          status,
          created_at,
          nominated_by_id,
          participant_assessment:participant_assessments(
            id,
            participant:cohort_participants(
              client_user:client_users(id, name, surname, email)
            ),
            cohort_assessment:cohort_assessments(
              name,
              assessment_type:assessment_types(name),
              cohort:cohorts(name)
            )
          )
        `)
        .eq("reviewer_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      // Handle relationship cache issues
      if (nominationsError && (nominationsError.message?.includes("relationship") || nominationsError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");
        
        const { data: nominationsOnly, error: nominationsOnlyError } = await supabase
          .from("reviewer_nominations")
          .select("id, status, created_at, nominated_by_id, participant_assessment_id")
          .eq("reviewer_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        if (nominationsOnlyError) {
          setMyActions([]);
          return;
        }

        if (nominationsOnly && nominationsOnly.length > 0) {
          const participantAssessmentIds = nominationsOnly.map((n: any) => n.participant_assessment_id);
          const nominatedByIds = [...new Set(nominationsOnly.map((n: any) => n.nominated_by_id) || [])];
          
          // Fetch participant assessments
          const { data: participantAssessments, error: paError } = await supabase
            .from("participant_assessments")
            .select("id, participant_id, cohort_assessment_id")
            .in("id", participantAssessmentIds);

          if (paError) {
            setMyActions([]);
            return;
          }

          // Fetch cohort participants and client users (both for participants and nominated_by)
          const participantIds = [...new Set(participantAssessments?.map((pa: any) => pa.participant_id) || [])];
          const { data: cohortParticipants, error: cpError } = await supabase
            .from("cohort_participants")
            .select("id, client_user_id")
            .in("id", participantIds);

          const clientUserIds = [
            ...new Set([
              ...(cohortParticipants?.map((cp: any) => cp.client_user_id) || []),
              ...nominatedByIds
            ])
          ];
          const { data: clientUsers, error: cuError } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", clientUserIds);

          // Fetch cohort assessments
          const cohortAssessmentIds = [...new Set(participantAssessments?.map((pa: any) => pa.cohort_assessment_id) || [])];
          const { data: cohortAssessments, error: caError } = await supabase
            .from("cohort_assessments")
            .select("id, name, assessment_type_id, cohort_id")
            .in("id", cohortAssessmentIds);

          // Fetch assessment types and cohorts
          const assessmentTypeIds = [...new Set(cohortAssessments?.map((ca: any) => ca.assessment_type_id).filter(Boolean) || [])];
          const { data: assessmentTypes } = await supabase
            .from("assessment_types")
            .select("id, name")
            .in("id", assessmentTypeIds);

          const cohortIds = [...new Set(cohortAssessments?.map((ca: any) => ca.cohort_id).filter(Boolean) || [])];
          const { data: cohorts } = await supabase
            .from("cohorts")
            .select("id, name")
            .in("id", cohortIds);

          // Merge data
          const merged = nominationsOnly.map((nomination: any) => {
            const participantAssessment = participantAssessments?.find((pa: any) => pa.id === nomination.participant_assessment_id);
            const cohortParticipant = cohortParticipants?.find((cp: any) => cp.id === participantAssessment?.participant_id);
            const clientUser = clientUsers?.find((cu: any) => cu.id === cohortParticipant?.client_user_id);
            const nominatedBy = clientUsers?.find((cu: any) => cu.id === nomination.nominated_by_id);
            const cohortAssessment = cohortAssessments?.find((ca: any) => ca.id === participantAssessment?.cohort_assessment_id);
            const assessmentType = assessmentTypes?.find((at: any) => at.id === cohortAssessment?.assessment_type_id);
            const cohort = cohorts?.find((c: any) => c.id === cohortAssessment?.cohort_id);

            return {
              ...nomination,
              nominated_by: nominatedBy,
              participant_assessment: {
                id: participantAssessment?.id,
                participant: {
                  client_user: clientUser,
                },
                cohort_assessment: {
                  name: cohortAssessment?.name,
                  assessment_type: assessmentType,
                  cohort: cohort,
                },
              },
            };
          });

          setMyActions(merged || []);
        } else {
          setMyActions([]);
        }
      } else if (nominations) {
        // If we got data with relationships, we still need to fetch nominated_by separately
        const nominatedByIds = [...new Set(nominations.map((n: any) => n.nominated_by_id).filter(Boolean) || [])];
        
        if (nominatedByIds.length > 0) {
          const { data: clientUsers } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", nominatedByIds);

          const merged = nominations.map((nomination: any) => ({
            ...nomination,
            nominated_by: clientUsers?.find((cu: any) => cu.id === nomination.nominated_by_id) || null,
          }));

          setMyActions(merged || []);
        } else {
          setMyActions(nominations || []);
        }
      } else {
        setMyActions([]);
      }
    } catch (err) {
      console.error("Error fetching my actions:", err);
      setMyActions([]);
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

  async function handleAcceptNomination(nominationId: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent card click
    if (!user || processingAction) return;

    try {
      setProcessingAction(nominationId);

      // Update nomination status to "accepted"
      const { error: updateError } = await supabase
        .from("reviewer_nominations")
        .update({ status: "accepted" })
        .eq("id", nominationId);

      if (updateError) {
        console.error("Error accepting nomination:", updateError);
        showToast("Error accepting nomination. Please try again.", "error");
        return;
      }

      // Refresh both My Actions and My Reviews lists
      await fetchMyActions(user.id);
      await fetchMyReviews(user.id);

      showToast("Nomination accepted successfully.", "success");
    } catch (err) {
      console.error("Error accepting nomination:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setProcessingAction(null);
    }
  }

  async function handleRejectNomination(nominationId: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent card click
    if (!user || processingAction) return;

    try {
      setProcessingAction(nominationId);

      // Update nomination status to "rejected"
      const { error: updateError } = await supabase
        .from("reviewer_nominations")
        .update({ status: "rejected" })
        .eq("id", nominationId);

      if (updateError) {
        console.error("Error rejecting nomination:", updateError);
        showToast("Error rejecting nomination. Please try again.", "error");
        return;
      }

      // Refresh My Actions list
      await fetchMyActions(user.id);

      showToast("Nomination rejected.", "info");
    } catch (err) {
      console.error("Error rejecting nomination:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setProcessingAction(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {user?.name ? `${user.name} ${user.surname || ""}`.trim() : user?.email || "User"}
        </p>
      </div>

      {/* Dashboard Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cohorts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">Your active cohorts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">Pending assessments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">Completed assessments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">New notifications</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </CardContent>
      </Card>

      {/* Three Panels Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* My Assessments */}
        <Card>
          <CardHeader>
            <CardTitle>My Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            {myAssessments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assessments found</p>
            ) : (
              <div className="space-y-3">
                {myAssessments.map((assessment) => {
                  const assessmentName = assessment.cohort_assessment?.name || 
                    assessment.cohort_assessment?.assessment_type?.name || 
                    "Assessment";
                  const cohortName = assessment.cohort_assessment?.cohort?.name || "Cohort";
                  
                  return (
                    <div
                      key={assessment.id}
                      className="p-3 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                      onClick={() => {
                        // Navigate to assessment detail
                        const assessmentId = assessment.cohort_assessment?.id;
                        if (assessmentId) {
                          router.push(`/tenant/${subdomain}/assessments/${assessmentId}`);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{assessmentName}</p>
                          <p className="text-xs text-muted-foreground">{cohortName}</p>
                        </div>
                        {assessment.status && (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(assessment.status)}`}>
                            {assessment.status}
                          </span>
                        )}
                      </div>
                      {assessment.score !== null && (
                        <p className="text-xs text-muted-foreground mt-1">Score: {assessment.score}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Actions */}
        <Card>
          <CardHeader>
            <CardTitle>My Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {myActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No actions required</p>
            ) : (
              <div className="space-y-3">
                {myActions.map((action) => {
                  const nominatedBy = action.nominated_by;
                  const nominatedByName = nominatedBy
                    ? `${nominatedBy.name || ""} ${nominatedBy.surname || ""}`.trim() || nominatedBy.email
                    : "Someone";
                  const assessmentName = action.participant_assessment?.cohort_assessment?.name ||
                    action.participant_assessment?.cohort_assessment?.assessment_type?.name ||
                    "Assessment";
                  
                  return (
                    <div
                      key={action.id}
                      className="p-3 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            Review request from {nominatedByName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{assessmentName}</p>
                          {action.created_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Requested: {new Date(action.created_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => handleRejectNomination(action.id, e)}
                            disabled={processingAction === action.id}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            {processingAction === action.id ? "..." : "Reject"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => handleAcceptNomination(action.id, e)}
                            disabled={processingAction === action.id}
                          >
                            {processingAction === action.id ? "..." : "Accept"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Reviews */}
        <Card>
          <CardHeader>
            <CardTitle>My Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            {myReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews pending</p>
            ) : (
              <div className="space-y-3">
                {myReviews.map((review) => {
                  const participant = review.participant_assessment?.participant?.client_user;
                  const participantName = participant
                    ? `${participant.name || ""} ${participant.surname || ""}`.trim() || participant.email
                    : "Participant";
                  const assessmentName = review.participant_assessment?.cohort_assessment?.name ||
                    review.participant_assessment?.cohort_assessment?.assessment_type?.name ||
                    "Assessment";
                  
                  return (
                    <div
                      key={review.id}
                      className="p-3 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                      onClick={() => {
                        // Navigate to review page if needed
                        const participantAssessmentId = review.participant_assessment?.id;
                        if (participantAssessmentId) {
                          // You can navigate to a review page here
                        }
                      }}
                    >
                      <p className="text-sm font-medium">{participantName}</p>
                      <p className="text-xs text-muted-foreground">{assessmentName}</p>
                      {review.created_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Assigned: {new Date(review.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
