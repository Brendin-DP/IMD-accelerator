"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, FileText, CheckCircle2, UserPlus, UserCheck, UserX, Play, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";

interface Cohort {
  id: string;
  name: string;
  client_id: string;
  plan_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  client?: {
    id: string;
    name: string;
  } | null;
  plan?: {
    id: string;
    name: string;
  } | null;
}

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
  } | null;
  cohort?: {
    id: string;
    name: string;
  } | null;
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
    default:
      return "bg-gray-100 text-gray-800";
  }
}

interface ActivityItem {
  id: string;
  type: "nomination_requested" | "nomination_accepted" | "nomination_rejected" | "assessment_started" | "assessment_completed" | "review_started" | "review_completed";
  user_name: string;
  user_email: string;
  details: string;
  timestamp: string;
  cohort_name?: string;
  assessment_name?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeCohortsCount, setActiveCohortsCount] = useState<number>(0);
  const [assessmentsCount, setAssessmentsCount] = useState<number>(0);
  const [completedCohortsCount, setCompletedCohortsCount] = useState<number>(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split('T')[0];

      // Fetch counts using count queries for better performance
      const [activeCohortsResult, completedCohortsResult, assessmentsResult] = await Promise.all([
        supabase
          .from("cohorts")
          .select("*", { count: "exact", head: true })
          .gte("end_date", today),
        supabase
          .from("cohorts")
          .select("*", { count: "exact", head: true })
          .lt("end_date", today),
        supabase
          .from("cohort_assessments")
          .select("*", { count: "exact", head: true })
      ]);

      setActiveCohortsCount(activeCohortsResult.count || 0);
      setCompletedCohortsCount(completedCohortsResult.count || 0);
      setAssessmentsCount(assessmentsResult.count || 0);

      // Fetch activity feed data
      await fetchActivityFeed();
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function fetchActivityFeed() {
    try {
      const allActivities: ActivityItem[] = [];

      // Fetch recent nomination requests (last 50)
      let nominationRequests: any[] = [];
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          created_at,
          request_status,
          nominated_by:client_users!reviewer_nominations_nominated_by_id_fkey(id, name, surname, email),
          participant_assessment:participant_assessments(
            cohort_assessment:cohort_assessments(
              name,
              cohort:cohorts(name)
            )
          )
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      // Handle relationship cache issues
      if (nominationsError && (nominationsError.message?.includes("relationship") || nominationsError.message?.includes("cache"))) {
        console.warn("Relationship query failed for nominations, fetching separately");
        
        const { data: nominationsOnly } = await supabase
          .from("reviewer_nominations")
          .select("id, created_at, request_status, nominated_by_id, participant_assessment_id")
          .order("created_at", { ascending: false })
          .limit(50);

        if (nominationsOnly && nominationsOnly.length > 0) {
          const nominatedByIds = [...new Set(nominationsOnly.map((n: any) => n.nominated_by_id).filter(Boolean))];
          const participantAssessmentIds = [...new Set(nominationsOnly.map((n: any) => n.participant_assessment_id).filter(Boolean))];

          // Fetch users
          const { data: clientUsers } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", nominatedByIds);

          // Fetch participant assessments
          const { data: participantAssessments } = await supabase
            .from("participant_assessments")
            .select("id, cohort_assessment_id")
            .in("id", participantAssessmentIds);

          const cohortAssessmentIds = [...new Set(participantAssessments?.map((pa: any) => pa.cohort_assessment_id).filter(Boolean) || [])];
          
          // Fetch cohort assessments
          const { data: cohortAssessments } = await supabase
            .from("cohort_assessments")
            .select("id, name, cohort_id")
            .in("id", cohortAssessmentIds);

          const cohortIds = [...new Set(cohortAssessments?.map((ca: any) => ca.cohort_id).filter(Boolean) || [])];
          
          // Fetch cohorts
          const { data: cohorts } = await supabase
            .from("cohorts")
            .select("id, name")
            .in("id", cohortIds);

          // Merge data
          nominationRequests = nominationsOnly.map((nomination: any) => ({
            ...nomination,
            nominated_by: clientUsers?.find((u: any) => u.id === nomination.nominated_by_id) || null,
            participant_assessment: {
              cohort_assessment: cohortAssessments?.find((ca: any) => 
                participantAssessments?.find((pa: any) => pa.id === nomination.participant_assessment_id && pa.cohort_assessment_id === ca.id)
              ) ? {
                name: cohortAssessments?.find((ca: any) => 
                  participantAssessments?.find((pa: any) => pa.id === nomination.participant_assessment_id && pa.cohort_assessment_id === ca.id)
                )?.name,
                cohort: cohorts?.find((c: any) => 
                  cohortAssessments?.find((ca: any) => 
                    participantAssessments?.find((pa: any) => pa.id === nomination.participant_assessment_id && pa.cohort_assessment_id === ca.id) && ca.cohort_id === c.id
                  )
                ) || null,
              } : null,
            },
          }));
        }
      } else if (nominationsData) {
        nominationRequests = nominationsData;
      }

      if (nominationRequests && nominationRequests.length > 0) {
        nominationRequests.forEach((nomination: any) => {
          const nominatedBy = nomination.nominated_by;
          const assessment = nomination.participant_assessment?.cohort_assessment;
          const cohort = assessment?.cohort;
          
          const userName = nominatedBy 
            ? `${nominatedBy.name || ""} ${nominatedBy.surname || ""}`.trim() || nominatedBy.email
            : "Unknown";
          
          if (nomination.request_status === "pending") {
            allActivities.push({
              id: `nom_req_${nomination.id}`,
              type: "nomination_requested",
              user_name: userName,
              user_email: nominatedBy?.email || "",
              details: `requested a review nomination`,
              timestamp: nomination.created_at,
              cohort_name: cohort?.name,
              assessment_name: assessment?.name,
            });
          } else if (nomination.request_status === "accepted") {
            allActivities.push({
              id: `nom_acc_${nomination.id}`,
              type: "nomination_accepted",
              user_name: userName,
              user_email: nominatedBy?.email || "",
              details: `accepted a review nomination`,
              timestamp: nomination.created_at,
              cohort_name: cohort?.name,
              assessment_name: assessment?.name,
            });
          } else if (nomination.request_status === "rejected") {
            allActivities.push({
              id: `nom_rej_${nomination.id}`,
              type: "nomination_rejected",
              user_name: userName,
              user_email: nominatedBy?.email || "",
              details: `rejected a review nomination`,
              timestamp: nomination.created_at,
              cohort_name: cohort?.name,
              assessment_name: assessment?.name,
            });
          }
        });
      }

      // Fetch recent assessment status changes (last 50)
      let participantAssessmentsData: any[] = [];
      const { data: pasData, error: pasError } = await supabase
        .from("participant_assessments")
        .select(`
          id,
          status,
          created_at,
          participant:cohort_participants(
            client_user:client_users(id, name, surname, email)
          ),
          cohort_assessment:cohort_assessments(
            name,
            cohort:cohorts(name)
          )
        `)
        .in("status", ["In Progress", "Completed"])
        .order("created_at", { ascending: false })
        .limit(50);

      // Handle relationship cache issues
      if (pasError && (pasError.message?.includes("relationship") || pasError.message?.includes("cache"))) {
        console.warn("Relationship query failed for participant assessments, fetching separately");
        
        const { data: pasOnly } = await supabase
          .from("participant_assessments")
          .select("id, status, created_at, participant_id, cohort_assessment_id")
          .in("status", ["In Progress", "Completed"])
          .order("created_at", { ascending: false })
          .limit(50);

        if (pasOnly && pasOnly.length > 0) {
          const participantIds = [...new Set(pasOnly.map((pa: any) => pa.participant_id).filter(Boolean))];
          const cohortAssessmentIds = [...new Set(pasOnly.map((pa: any) => pa.cohort_assessment_id).filter(Boolean))];

          // Fetch cohort participants
          const { data: cohortParticipants } = await supabase
            .from("cohort_participants")
            .select("id, client_user_id")
            .in("id", participantIds);

          const clientUserIds = [...new Set(cohortParticipants?.map((cp: any) => cp.client_user_id).filter(Boolean) || [])];

          // Fetch client users
          const { data: clientUsers } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", clientUserIds);

          // Fetch cohort assessments
          const { data: cohortAssessments } = await supabase
            .from("cohort_assessments")
            .select("id, name, cohort_id")
            .in("id", cohortAssessmentIds);

          const cohortIds = [...new Set(cohortAssessments?.map((ca: any) => ca.cohort_id).filter(Boolean) || [])];

          // Fetch cohorts
          const { data: cohorts } = await supabase
            .from("cohorts")
            .select("id, name")
            .in("id", cohortIds);

          // Merge data
          participantAssessmentsData = pasOnly.map((pa: any) => {
            const cohortParticipant = cohortParticipants?.find((cp: any) => cp.id === pa.participant_id);
            const clientUser = clientUsers?.find((u: any) => u.id === cohortParticipant?.client_user_id);
            const cohortAssessment = cohortAssessments?.find((ca: any) => ca.id === pa.cohort_assessment_id);
            const cohort = cohorts?.find((c: any) => c.id === cohortAssessment?.cohort_id);

            return {
              ...pa,
              participant: {
                client_user: clientUser || null,
              },
              cohort_assessment: cohortAssessment ? {
                name: cohortAssessment.name,
                cohort: cohort || null,
              } : null,
            };
          });
        }
      } else if (pasData) {
        participantAssessmentsData = pasData;
      }

      if (participantAssessmentsData && participantAssessmentsData.length > 0) {
        participantAssessmentsData.forEach((pa: any) => {
          const clientUser = pa.participant?.client_user;
          const assessment = pa.cohort_assessment;
          const cohort = assessment?.cohort;
          
          const userName = clientUser
            ? `${clientUser.name || ""} ${clientUser.surname || ""}`.trim() || clientUser.email
            : "Unknown";

          if (pa.status === "In Progress") {
            allActivities.push({
              id: `ass_start_${pa.id}`,
              type: "assessment_started",
              user_name: userName,
              user_email: clientUser?.email || "",
              details: `started an assessment`,
              timestamp: pa.created_at,
              cohort_name: cohort?.name,
              assessment_name: assessment?.name,
            });
          } else if (pa.status === "Completed") {
            allActivities.push({
              id: `ass_comp_${pa.id}`,
              type: "assessment_completed",
              user_name: userName,
              user_email: clientUser?.email || "",
              details: `completed an assessment`,
              timestamp: pa.created_at,
              cohort_name: cohort?.name,
              assessment_name: assessment?.name,
            });
          }
        });
      }

      // Fetch recent review status changes (review started and completed)
      // For internal reviewers, review_status may be in reviewer_nominations (if field exists)
      // For external reviewers, review_status is in external_reviewers
      let reviewStatusChanges: any[] = [];
      
      // First, fetch all accepted nominations (both internal and external)
      const { data: allNominationsData, error: reviewStatusNominationsError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          review_status,
          created_at,
          is_external,
          reviewer_id,
          external_reviewer_id,
          reviewer:client_users!reviewer_nominations_reviewer_id_fkey(id, name, surname, email),
          participant_assessment:participant_assessments(
            cohort_assessment:cohort_assessments(
              name,
              cohort:cohorts(name)
            )
          )
        `)
        .eq("request_status", "accepted")
        .order("created_at", { ascending: false })
        .limit(100);
      
      // Also fetch all external reviewers with review_status to join later
      const { data: allExternalReviewers } = await supabase
        .from("external_reviewers")
        .select("id, review_status, email, name");
      
      // Create a map for quick lookup
      const externalReviewerMap = new Map();
      if (allExternalReviewers) {
        allExternalReviewers.forEach((er: any) => {
          externalReviewerMap.set(er.id, er);
        });
      }

      // Handle relationship cache issues
      if (reviewStatusNominationsError && (reviewStatusNominationsError.message?.includes("relationship") || reviewStatusNominationsError.message?.includes("cache"))) {
        console.warn("Relationship query failed for review status changes, fetching separately");
        
        const { data: nominationsOnly } = await supabase
          .from("reviewer_nominations")
          .select("id, review_status, created_at, is_external, reviewer_id, external_reviewer_id, participant_assessment_id")
          .eq("request_status", "accepted")
          .order("created_at", { ascending: false })
          .limit(100);

        if (nominationsOnly && nominationsOnly.length > 0) {
          const reviewerIds = [...new Set(nominationsOnly.filter((r: any) => r.reviewer_id).map((r: any) => r.reviewer_id))];
          const externalReviewerIds = [...new Set(nominationsOnly.filter((r: any) => r.external_reviewer_id).map((r: any) => r.external_reviewer_id))];
          const participantAssessmentIds = [...new Set(nominationsOnly.map((r: any) => r.participant_assessment_id).filter(Boolean))];

          // Fetch internal reviewers
          let clientUsers: any[] = [];
          if (reviewerIds.length > 0) {
            const { data: users } = await supabase
              .from("client_users")
              .select("id, name, surname, email")
              .in("id", reviewerIds);
            clientUsers = users || [];
          }

          // Fetch external reviewers (with review_status)
          let externalReviewers: any[] = [];
          if (externalReviewerIds.length > 0) {
            const { data: externals } = await supabase
              .from("external_reviewers")
              .select("id, email, name, review_status")
              .in("id", externalReviewerIds);
            externalReviewers = externals || [];
            // Update the map
            externals?.forEach((er: any) => {
              externalReviewerMap.set(er.id, er);
            });
          }

          // Fetch participant assessments
          const { data: participantAssessments } = await supabase
            .from("participant_assessments")
            .select("id, cohort_assessment_id")
            .in("id", participantAssessmentIds);

          const cohortAssessmentIds = [...new Set(participantAssessments?.map((pa: any) => pa.cohort_assessment_id).filter(Boolean) || [])];

          // Fetch cohort assessments
          const { data: cohortAssessments } = await supabase
            .from("cohort_assessments")
            .select("id, name, cohort_id")
            .in("id", cohortAssessmentIds);

          const cohortIds = [...new Set(cohortAssessments?.map((ca: any) => ca.cohort_id).filter(Boolean) || [])];

          // Fetch cohorts
          const { data: cohorts } = await supabase
            .from("cohorts")
            .select("id, name")
            .in("id", cohortIds);

          // Merge data and filter by review_status
          const allMerged = nominationsOnly.map((review: any) => {
            const participantAssessment = participantAssessments?.find((pa: any) => pa.id === review.participant_assessment_id);
            const cohortAssessment = cohortAssessments?.find((ca: any) => ca.id === participantAssessment?.cohort_assessment_id);
            const cohort = cohorts?.find((c: any) => c.id === cohortAssessment?.cohort_id);

            let reviewer = null;
            let reviewStatus = review.review_status; // Try from nomination first
            
            if (review.is_external && review.external_reviewer_id) {
              const extReviewer = externalReviewers?.find((e: any) => e.id === review.external_reviewer_id);
              reviewer = extReviewer;
              reviewStatus = extReviewer?.review_status || reviewStatus; // Use external_reviewers review_status
            } else if (review.reviewer_id) {
              reviewer = clientUsers?.find((u: any) => u.id === review.reviewer_id);
            }

            return {
              ...review,
              review_status: reviewStatus,
              reviewer: reviewer || null,
              external_reviewer: review.is_external ? reviewer : null,
              participant_assessment: {
                cohort_assessment: cohortAssessment ? {
                  name: cohortAssessment.name,
                  cohort: cohort || null,
                } : null,
              },
            };
          });
          
          // Filter by review_status (case-insensitive)
          reviewStatusChanges = allMerged.filter((r: any) => {
            const status = r.review_status;
            return status === "In progress" || status === "Completed" || 
                   status === "in progress" || status === "completed" ||
                   status?.toLowerCase() === "in progress" || status?.toLowerCase() === "completed";
          });
        }
      } else if (allNominationsData) {
        // Process all nominations and get review_status from appropriate source
        reviewStatusChanges = allNominationsData
          .map((nomination: any) => {
            // For external reviewers, get review_status from external_reviewers table
            if (nomination.is_external && nomination.external_reviewer_id) {
              const extReviewer = externalReviewerMap.get(nomination.external_reviewer_id);
              const reviewStatus = extReviewer?.review_status || nomination.review_status;
              return {
                ...nomination,
                review_status: reviewStatus,
                external_reviewer: extReviewer || null,
              };
            }
            // For internal reviewers, review_status should be in nomination (if field exists)
            return nomination;
          })
          .filter((nom: any) => {
            const status = nom.review_status;
            const matches = status === "In progress" || status === "Completed" || 
                           status === "in progress" || status === "completed" ||
                           status?.toLowerCase() === "in progress" || status?.toLowerCase() === "completed";
            return matches;
          });
      }
      
      console.log("Review status changes found:", reviewStatusChanges?.length || 0, reviewStatusChanges);

      if (reviewStatusChanges && reviewStatusChanges.length > 0) {
        reviewStatusChanges.forEach((review: any) => {
          const reviewer = review.is_external ? review.external_reviewer : review.reviewer;
          const assessment = review.participant_assessment?.cohort_assessment;
          const cohort = assessment?.cohort;
          
          const reviewerName = reviewer
            ? (review.is_external 
                ? (reviewer.name || reviewer.email || "External Reviewer")
                : `${reviewer.name || ""} ${reviewer.surname || ""}`.trim() || reviewer.email)
            : "Unknown";
          
          const reviewerEmail = reviewer?.email || "";

          if (review.review_status === "In progress") {
            allActivities.push({
              id: `rev_start_${review.id}`,
              type: "review_started",
              user_name: reviewerName,
              user_email: reviewerEmail,
              details: `started a review`,
              timestamp: review.created_at,
              cohort_name: cohort?.name,
              assessment_name: assessment?.name,
            });
          } else if (review.review_status === "Completed") {
            allActivities.push({
              id: `rev_comp_${review.id}`,
              type: "review_completed",
              user_name: reviewerName,
              user_email: reviewerEmail,
              details: `completed a review`,
              timestamp: review.created_at,
              cohort_name: cohort?.name,
              assessment_name: assessment?.name,
            });
          }
        });
      }

      // Sort all activities by timestamp (most recent first) and limit to 30
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(allActivities.slice(0, 30));
    } catch (err) {
      console.error("Error fetching activity feed:", err);
      setActivities([]);
    }
  }

  function getActivityIcon(type: ActivityItem["type"]) {
    switch (type) {
      case "nomination_requested":
        return <UserPlus className="h-4 w-4 text-blue-600" />;
      case "nomination_accepted":
        return <UserCheck className="h-4 w-4 text-green-600" />;
      case "nomination_rejected":
        return <UserX className="h-4 w-4 text-red-600" />;
      case "assessment_started":
        return <Play className="h-4 w-4 text-blue-600" />;
      case "assessment_completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "review_started":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "review_completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  }

  function formatTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="p-8 text-center text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your cohorts and assessments</p>
      </div>

      {/* Stats Panels - Top Row */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Active Cohorts Stat */}
        <div 
          className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
          onClick={() => router.push("/cohorts")}
        >
          <dt>
            <div className="absolute rounded-md bg-blue-500 p-3">
              <Users className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Active Cohorts</p>
          </dt>
          <dd className="ml-16 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{activeCohortsCount}</p>
            <p className="ml-2 text-sm text-gray-500">cohorts</p>
          </dd>
        </div>

        {/* Assessments Stat */}
        <div 
          className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
          onClick={() => router.push("/cohorts")}
        >
          <dt>
            <div className="absolute rounded-md bg-indigo-500 p-3">
              <FileText className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Assessments</p>
          </dt>
          <dd className="ml-16 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{assessmentsCount}</p>
            <p className="ml-2 text-sm text-gray-500">total</p>
          </dd>
        </div>

        {/* Completed Cohorts Stat */}
        <div 
          className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
          onClick={() => router.push("/cohorts")}
        >
          <dt>
            <div className="absolute rounded-md bg-green-500 p-3">
              <CheckCircle2 className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Completed</p>
          </dt>
          <dd className="ml-16 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{completedCohortsCount}</p>
            <p className="ml-2 text-sm text-gray-500">cohorts</p>
          </dd>
        </div>
      </div>

      {/* Activity Feed and Action Items Section */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Activity Feed - 40% width */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Activity Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 h-full overflow-y-auto">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
                    <div className="flex-shrink-0 mt-0.5">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{activity.user_name}</span>{" "}
                        <span className="text-gray-600">{activity.details}</span>
                      </p>
                      {(activity.cohort_name || activity.assessment_name) && (
                        <p className="text-xs text-gray-500 mt-1">
                          {activity.assessment_name && (
                            <span>{activity.assessment_name}</span>
                          )}
                          {activity.cohort_name && activity.assessment_name && " • "}
                          {activity.cohort_name && (
                            <span>{activity.cohort_name}</span>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatTimestamp(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* My Action Items - 60% width */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>My Action Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 h-full overflow-y-auto">
              <p className="text-sm text-muted-foreground text-center py-4">No action items at this time</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
