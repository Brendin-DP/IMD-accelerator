"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";

interface ReviewData {
  id: string;
  request_status: string | null;
  review_status: string | null;
  is_external: boolean | null;
  external_reviewer_id: string | null;
  created_at: string | null;
  participant_assessment: {
    id: string;
    status: string | null;
    score: number | null;
    submitted_at: string | null;
    participant?: {
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
      assessment_type?: {
        id: string;
        name: string;
        description: string | null;
      };
      cohort?: {
        id: string;
        name: string;
      };
    };
  };
}

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const reviewId = params.reviewId as string;

  const [user, setUser] = useState<any>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewSessionStatus, setReviewSessionStatus] = useState<string | null>(null);
  const [loadingSessionStatus, setLoadingSessionStatus] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("participant");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        if (userData.id && reviewId) {
          fetchReviewDetails(userData.id);
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
  }, [reviewId]);

  async function fetchReviewDetails(userId: string) {
    try {
      setLoading(true);
      setError(null);

      // Fetch the nomination/review, including review_status
      let { data: nomination, error: nominationError } = await supabase
        .from("reviewer_nominations")
        .select("*")
        .eq("id", reviewId)
        .eq("reviewer_id", userId)
        .eq("request_status", "accepted")
        .single();

      // If not found as internal reviewer, check if it's an external reviewer
      if (nominationError || !nomination) {
        // Try fetching as external reviewer
        const { data: currentUser } = await supabase
          .from("client_users")
          .select("email")
          .eq("id", userId)
          .single();

        if (currentUser?.email) {
          const { data: externalReviewer } = await supabase
            .from("external_reviewers")
            .select("id, review_status")
            .eq("email", currentUser.email.toLowerCase())
            .single();

          if (externalReviewer) {
            const { data: extNomination } = await supabase
              .from("reviewer_nominations")
              .select("*")
              .eq("id", reviewId)
              .eq("external_reviewer_id", externalReviewer.id)
              .eq("request_status", "accepted")
              .single();

            if (extNomination) {
              nomination = {
                ...extNomination,
                review_status: externalReviewer.review_status,
              };
              nominationError = null;
            }
          }
        }
      }

      if (nominationError || !nomination) {
        throw new Error("Review not found or access denied");
      }

      const participantAssessmentId = nomination.participant_assessment_id;

      // Try fetching with relationships first
      let { data: participantAssessment, error: paError } = await supabase
        .from("participant_assessments")
        .select(`
          id,
          status,
          score,
          submitted_at,
          participant:cohort_participants(
            client_user:client_users(id, name, surname, email)
          ),
          cohort_assessment:cohort_assessments(
            id,
            name,
            start_date,
            end_date,
            assessment_type:assessment_types(id, name, description),
            cohort:cohorts(id, name)
          )
        `)
        .eq("id", participantAssessmentId)
        .single();

      // If relationship query fails, fallback to separate queries
      if (paError && (paError.message?.includes("relationship") || paError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");

        const { data: paData, error: paDataError } = await supabase
          .from("participant_assessments")
          .select("*")
          .eq("id", participantAssessmentId)
          .single();

        if (paDataError) {
          throw paDataError;
        }

        // Fetch participant with client user
        const { data: participantData } = await supabase
          .from("cohort_participants")
          .select("id, client_user_id")
          .eq("id", paData.participant_id)
          .single();

        let clientUser = null;
        if (participantData) {
          const { data: userData } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .eq("id", participantData.client_user_id)
            .single();
          clientUser = userData;
        }

        // Fetch cohort assessment with assessment type and cohort
        const { data: assessmentData } = await supabase
          .from("cohort_assessments")
          .select("id, name, start_date, end_date, assessment_type_id, cohort_id")
          .eq("id", paData.cohort_assessment_id)
          .single();

        let assessmentType = null;
        let cohort = null;

        if (assessmentData) {
          if (assessmentData.assessment_type_id) {
            const { data: typeData } = await supabase
              .from("assessment_types")
              .select("id, name, description")
              .eq("id", assessmentData.assessment_type_id)
              .single();
            assessmentType = typeData;
          }

          if (assessmentData.cohort_id) {
            const { data: cohortData } = await supabase
              .from("cohorts")
              .select("id, name")
              .eq("id", assessmentData.cohort_id)
              .single();
            cohort = cohortData;
          }
        }

        participantAssessment = {
          ...paData,
          participant: participantData
            ? {
                client_user: clientUser,
              }
            : null,
          cohort_assessment: assessmentData
            ? {
                ...assessmentData,
                assessment_type: assessmentType,
                cohort: cohort,
              }
            : null,
        };
      } else if (paError) {
        throw paError;
      }

      setReview({
        ...nomination,
        participant_assessment: participantAssessment as any,
      });

      // Fetch review session status
      await fetchReviewSessionStatus(participantAssessmentId, reviewId);
    } catch (err) {
      console.error("Error fetching review details:", err);
      setError(err instanceof Error ? err.message : "Failed to load review details");
      setReview(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchReviewSessionStatus(participantAssessmentId: string, nominationId: string) {
    try {
      setLoadingSessionStatus(true);
      
      // First, get the assessment_definition_id from the participant assessment
      const { data: paData } = await supabase
        .from("participant_assessments")
        .select("cohort_assessment_id, cohort_assessments(assessment_type_id, cohort_id)")
        .eq("id", participantAssessmentId)
        .single();

      if (!paData) return;

      const cohortAssessment = paData.cohort_assessments as any;
      if (!cohortAssessment?.assessment_type_id || !cohortAssessment?.cohort_id) return;

      const assessmentTypeId = cohortAssessment.assessment_type_id;
      const cohortId = cohortAssessment.cohort_id;

      // Get the plan to find assessment definition
      const { data: cohort } = await supabase
        .from("cohorts")
        .select("plan_id")
        .eq("id", cohortId)
        .single();

      if (!cohort?.plan_id) return;

      const { data: planData } = await supabase
        .from("plans")
        .select("description")
        .eq("id", cohort.plan_id)
        .single();

      let assessmentDefinitionId: string | null = null;

      if (planData?.description) {
        const planMappingMatch = planData.description.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
        if (planMappingMatch) {
          try {
            const mapping = JSON.parse(planMappingMatch[1]);
            const selectedDefId = mapping[assessmentTypeId];
            if (selectedDefId) {
              const { data: selectedDef } = await supabase
                .from("assessment_definitions_v2")
                .select("id")
                .eq("id", selectedDefId)
                .eq("assessment_type_id", assessmentTypeId)
                .maybeSingle();

              if (selectedDef) {
                assessmentDefinitionId = selectedDef.id;
              }
            }
          } catch (e) {
            // Fall through to system assessment
          }
        }
      }

      // Fall back to system assessment
      if (!assessmentDefinitionId) {
        const { data: systemDef } = await supabase
          .from("assessment_definitions_v2")
          .select("id")
          .eq("assessment_type_id", assessmentTypeId)
          .eq("is_system", true)
          .maybeSingle();

        if (systemDef) {
          assessmentDefinitionId = systemDef.id;
        }
      }

      if (!assessmentDefinitionId) return;

      // Determine if reviewer is internal or external to use correct respondent_type
      // Check the nomination to see if it has external_reviewer_id or reviewer_id
      const { data: nomination } = await supabase
        .from("reviewer_nominations")
        .select("external_reviewer_id, reviewer_id")
        .eq("id", nominationId)
        .maybeSingle();

      if (!nomination) return;

      // Determine respondent_type based on nomination
      const isExternal = !!nomination.external_reviewer_id;
      const respondentType = isExternal ? "external_reviewer" : "client_user";

      // Query for review session with correct respondent_type
      const { data: session } = await supabase
        .from("assessment_response_sessions")
        .select("id, status, last_question_id")
        .eq("participant_assessment_id", participantAssessmentId)
        .eq("assessment_definition_id", assessmentDefinitionId)
        .eq("respondent_type", respondentType)
        .eq("reviewer_nomination_id", nominationId)
        .maybeSingle();

      // If session exists, check if there are any responses saved
      if (session?.id) {
        const { data: responses } = await supabase
          .from("assessment_responses")
          .select("id")
          .eq("session_id", session.id)
          .eq("is_answered", true)
          .limit(1);

        // If session exists and has responses, it's in progress (even if status is not_started)
        if (responses && responses.length > 0) {
          setReviewSessionStatus("in_progress");
        } else {
          // Use session status, or default to not_started
          setReviewSessionStatus(session.status || "not_started");
        }
      } else {
        // No session found
        setReviewSessionStatus(null);
      }
    } catch (err) {
      // Silently fail - status will default to null
      console.error("Error fetching review session status:", err);
    } finally {
      setLoadingSessionStatus(false);
    }
  }


  function getStatusColor(status: string | null): string {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed" || statusLower === "submitted") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "in progress" || statusLower === "in_progress") {
      return "bg-blue-100 text-blue-800";
    } else if (statusLower === "not started" || statusLower === "not_started") {
      return "bg-gray-100 text-gray-800";
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
    } else if (statusLower === "draft" || statusLower === "pending" || statusLower === "not started" || statusLower === "not_started") {
      return "bg-yellow-100 text-yellow-800";
    } else if (statusLower === "cancelled" || statusLower === "rejected") {
      return "bg-red-100 text-red-800";
    }
    return "bg-gray-100 text-gray-800";
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading review details...</div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">
          {error || "Review not found"}
        </div>
        <Button variant="tertiary" onClick={() => router.push(`/tenant/${subdomain}/dashboard`)} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const participant = review.participant_assessment?.participant?.client_user;
  const assessment = review.participant_assessment?.cohort_assessment;
  const assessmentType = assessment?.assessment_type;
  const cohort = assessment?.cohort;

  const participantName = participant
    ? `${participant.name || ""} ${participant.surname || ""}`.trim() || participant.email
    : "Participant";

  const assessmentName = assessment?.name || assessmentType?.name || "Assessment";

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/tenant/${subdomain}/dashboard` },
          { label: "Review Details" },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push(`/tenant/${subdomain}/dashboard`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Review Details</h1>
        <p className="text-muted-foreground mt-2">
          Assessment information for {participantName}
        </p>
      </div>

      {/* Participant Information */}
      <Card>
        <CardHeader>
          <CardTitle>Participant Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
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

      {/* Assessment Information */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assessment Name</label>
              <p className="text-sm font-medium mt-1">{assessmentName}</p>
            </div>
            {assessmentType && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Assessment Type</label>
                <p className="text-sm font-medium mt-1">{assessmentType.name}</p>
                {assessmentType.description && (
                  <p className="text-sm text-muted-foreground mt-1">{assessmentType.description}</p>
                )}
              </div>
            )}
            {cohort && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Cohort</label>
                <p className="text-sm font-medium mt-1">{cohort.name}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assessment Status</label>
              <p className="text-sm font-medium mt-1">
                {review.participant_assessment.status ? (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(review.participant_assessment.status)}`}>
                    {review.participant_assessment.status}
                  </span>
                ) : (
                  "-"
                )}
              </p>
            </div>
            {assessment?.start_date && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Start Date</label>
                <p className="text-sm font-medium mt-1">
                  {new Date(assessment.start_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {assessment?.end_date && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">End Date</label>
                <p className="text-sm font-medium mt-1">
                  {new Date(assessment.end_date).toLocaleDateString()}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Review Status</label>
              <p className="text-sm font-medium mt-1">
                {review.review_status ? (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getReviewStatusColor(review.review_status)}`}>
                    {review.review_status}
                  </span>
                ) : (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                    Not started
                  </span>
                )}
              </p>
            </div>
            {review.participant_assessment.score !== null && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Score</label>
                <p className="text-sm font-medium mt-1">{review.participant_assessment.score}</p>
              </div>
            )}
            {review.participant_assessment.submitted_at && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Submitted At</label>
                <p className="text-sm font-medium mt-1">
                  {new Date(review.participant_assessment.submitted_at).toLocaleString()}
                </p>
              </div>
            )}
            {review.created_at && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Review Assigned</label>
                <p className="text-sm font-medium mt-1">
                  {new Date(review.created_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="mt-6 pt-6 border-t flex justify-end items-center gap-4">
            {(() => {
              const sessionStatus = reviewSessionStatus?.toLowerCase();
              // Determine button text based on session status
              // If status is "in_progress" or there are saved responses, show "Continue Review"
              // If status is "completed", show "View Review"
              // Otherwise, show "Start Review"
              const buttonText = 
                !sessionStatus || sessionStatus === "not_started" ? "Start Review" :
                sessionStatus === "in_progress" || sessionStatus === "in progress" ? "Continue Review" :
                sessionStatus === "completed" ? "View Review" :
                "Start Review";

              return (
                <Button
                  onClick={() => router.push(`/tenant/${subdomain}/reviews/${reviewId}/questionnaire`)}
                  variant="default"
                  className="w-full sm:w-auto"
                  disabled={loadingSessionStatus}
                >
                  {loadingSessionStatus ? "Loading..." : buttonText}
                </Button>
              );
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

