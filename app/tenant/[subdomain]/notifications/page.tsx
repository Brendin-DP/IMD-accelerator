"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";

interface Notification {
  id: string;
  type: "review_request" | "nomination_accepted" | "nomination_rejected";
  message: string;
  nomination_id: string;
  created_at: string;
  reviewer?: {
    name: string | null;
    surname: string | null;
    email: string;
  };
  participant?: {
    name: string | null;
    surname: string | null;
    email: string;
  };
  assessment?: {
    name: string | null;
  };
}

export default function TenantNotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("participant");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        if (userData.id) {
          fetchNotifications(userData.id);
          // Don't trigger update - notifications should persist until new session
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
    setLoading(false);
  }, []);

  async function fetchNotifications(userId: string) {
    try {
      setLoading(true);

      // Get last checked timestamp from sessionStorage (or set to session start)
      const sessionStart = sessionStorage.getItem(`session_start_${userId}`);
      if (!sessionStart) {
        sessionStorage.setItem(`session_start_${userId}`, new Date().toISOString());
      }
      // For notifications page, show all notifications from session start (not filtered by lastChecked)
      // This ensures users see all notifications when they visit the page
      const sessionStartTime = sessionStorage.getItem(`session_start_${userId}`) || new Date(0).toISOString();

      // Fetch new review requests (where user is reviewer, request_status = pending, created after session start)
      // Exclude self-nominated external reviewers
      const { data: reviewRequests, error: reviewError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          created_at,
          is_external,
          nominated_by_id,
          nominated_by:client_users!reviewer_nominations_nominated_by_id_fkey(id, name, surname, email),
          participant_assessment:participant_assessments(
            cohort_assessment:cohort_assessments(name)
          )
        `)
        .eq("reviewer_id", userId)
        .eq("request_status", "pending")
        .gt("created_at", sessionStartTime)
        .order("created_at", { ascending: false });

      // Handle relationship cache issues for review requests
      let reviewRequestsData = reviewRequests;
      if (reviewError && (reviewError.message?.includes("relationship") || reviewError.message?.includes("cache"))) {
        console.warn("Relationship query failed for review requests, fetching separately");
        
        const { data: requestsOnly, error: requestsOnlyError } = await supabase
          .from("reviewer_nominations")
          .select("id, created_at, nominated_by_id, participant_assessment_id, is_external")
          .eq("reviewer_id", userId)
          .eq("request_status", "pending")
          .gt("created_at", sessionStartTime)
          .order("created_at", { ascending: false });

        if (!requestsOnlyError && requestsOnly) {
          // Fetch related data separately
          const nominatedByIds = [...new Set(requestsOnly.map((r: any) => r.nominated_by_id))];
          const participantAssessmentIds = [...new Set(requestsOnly.map((r: any) => r.participant_assessment_id))];

          const { data: clientUsers } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", nominatedByIds);

          const { data: participantAssessments } = await supabase
            .from("participant_assessments")
            .select("id, cohort_assessment_id")
            .in("id", participantAssessmentIds);

          const cohortAssessmentIds = [...new Set(participantAssessments?.map((pa: any) => pa.cohort_assessment_id) || [])];
          const { data: cohortAssessments } = await supabase
            .from("cohort_assessments")
            .select("id, name")
            .in("id", cohortAssessmentIds);

          // Merge the data and filter out self-nominated external reviewers
          reviewRequestsData = requestsOnly
            .filter((req: any) => {
              // Exclude self-nominated external reviewers
              return !(req.is_external === true && req.nominated_by_id === userId);
            })
            .map((req: any) => ({
              ...req,
              nominated_by: clientUsers?.find((u: any) => u.id === req.nominated_by_id) || null,
              participant_assessment: {
                cohort_assessment: cohortAssessments?.find((ca: any) => 
                  participantAssessments?.find((pa: any) => pa.id === req.participant_assessment_id && pa.cohort_assessment_id === ca.id)
                ) || null
              }
            }));
        }
      }

      // Fetch nomination status changes (where user created the nomination, request_status is accepted/rejected)
      const { data: statusChanges, error: statusError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          request_status,
          created_at,
          reviewer:client_users!reviewer_nominations_reviewer_id_fkey(id, name, surname, email),
          participant_assessment:participant_assessments(
            cohort_assessment:cohort_assessments(name)
          )
        `)
        .eq("nominated_by_id", userId)
        .in("request_status", ["accepted", "rejected"])
        .order("created_at", { ascending: false });

      // Handle relationship cache issues for status changes
      let statusChangesData = statusChanges;
      if (statusError && (statusError.message?.includes("relationship") || statusError.message?.includes("cache"))) {
        console.warn("Relationship query failed for status changes, fetching separately");
        
        const { data: changesOnly, error: changesOnlyError } = await supabase
          .from("reviewer_nominations")
          .select("id, request_status, created_at, reviewer_id, participant_assessment_id")
          .eq("nominated_by_id", userId)
          .in("request_status", ["accepted", "rejected"])
          .order("created_at", { ascending: false });

        if (!changesOnlyError && changesOnly) {
          // Fetch related data separately
          const reviewerIds = [...new Set(changesOnly.map((c: any) => c.reviewer_id))];
          const participantAssessmentIds = [...new Set(changesOnly.map((c: any) => c.participant_assessment_id))];

          const { data: clientUsers } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", reviewerIds);

          const { data: participantAssessments } = await supabase
            .from("participant_assessments")
            .select("id, cohort_assessment_id")
            .in("id", participantAssessmentIds);

          const cohortAssessmentIds = [...new Set(participantAssessments?.map((pa: any) => pa.cohort_assessment_id) || [])];
          const { data: cohortAssessments } = await supabase
            .from("cohort_assessments")
            .select("id, name")
            .in("id", cohortAssessmentIds);

          // Merge the data
          statusChangesData = changesOnly.map((change: any) => ({
            ...change,
            reviewer: clientUsers?.find((u: any) => u.id === change.reviewer_id) || null,
            participant_assessment: {
              cohort_assessment: cohortAssessments?.find((ca: any) => 
                participantAssessments?.find((pa: any) => pa.id === change.participant_assessment_id && pa.cohort_assessment_id === ca.id)
              ) || null
            }
          }));
        }
      }

      // Filter status changes by session start (only show those that changed during this session)
      // Don't filter by seenNotifications - show all notifications from this session
      const filteredStatusChanges = statusChangesData?.filter((change: any) => {
        // Show if created after session start
        return new Date(change.created_at) >= new Date(sessionStartTime);
      }) || [];

      const allNotifications: Notification[] = [];

      // Process review requests (already filtered for self-nominated external reviewers in fallback query)
      if (reviewRequestsData) {
        // Additional filter for the main query result
        const filteredReviewRequests = reviewRequestsData.filter((req: any) => {
          return !(req.is_external === true && req.nominated_by_id === userId);
        });

        filteredReviewRequests.forEach((req: any) => {
          const nominatedBy = req.nominated_by || req.nominated_by_id;
          const assessment = req.participant_assessment?.cohort_assessment || null;
          const assessmentName = assessment?.name || "Assessment";
          const requesterName = nominatedBy && typeof nominatedBy === 'object'
            ? `${nominatedBy.name || ""} ${nominatedBy.surname || ""}`.trim() || nominatedBy.email
            : "Someone";

          allNotifications.push({
            id: `review_request_${req.id}`,
            type: "review_request",
            message: `${requesterName} requested you to review their ${assessmentName}`,
            nomination_id: req.id,
            created_at: req.created_at,
            reviewer: nominatedBy && typeof nominatedBy === 'object' ? nominatedBy : undefined,
            assessment: assessment,
          });
        });
      }

      // Process status changes
      if (filteredStatusChanges) {
        filteredStatusChanges.forEach((change: any) => {
          const reviewer = change.reviewer || change.reviewer_id;
          const assessment = change.participant_assessment?.cohort_assessment || null;
          const assessmentName = assessment?.name || "Assessment";
          const reviewerName = reviewer && typeof reviewer === 'object'
            ? `${reviewer.name || ""} ${reviewer.surname || ""}`.trim() || reviewer.email
            : "Someone";

          allNotifications.push({
            id: `status_change_${change.id}`,
            type: change.request_status === "accepted" ? "nomination_accepted" : "nomination_rejected",
            message: `${reviewerName} ${change.request_status === "accepted" ? "accepted" : "rejected"} your review request for ${assessmentName}`,
            nomination_id: change.id,
            created_at: change.created_at,
            participant: reviewer && typeof reviewer === 'object' ? reviewer : undefined,
            assessment: assessment,
          });
        });
      }

      // Sort by created_at descending
      allNotifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      console.log("Fetched notifications:", allNotifications.length, allNotifications);
      setNotifications(allNotifications);

      // Update last checked timestamp to reset the notification badge count
      // But keep the notification messages visible until new login session
      sessionStorage.setItem(`notifications_last_checked_${userId}`, new Date().toISOString());
      
      // Trigger notification count refresh to update the badge
      window.dispatchEvent(new CustomEvent('notification-update'));
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "review_request":
        return "🔔";
      case "nomination_accepted":
        return "✅";
      case "nomination_rejected":
        return "❌";
      default:
        return "📢";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "review_request":
        return "border-blue-200 bg-blue-50";
      case "nomination_accepted":
        return "border-green-200 bg-green-50";
      case "nomination_rejected":
        return "border-red-200 bg-red-50";
      default:
        return "border-gray-200 bg-gray-50";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/tenant/${subdomain}/dashboard` },
          { label: "Notifications" },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push(`/tenant/${subdomain}/dashboard`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-2">Review your recent activity</p>
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No new notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card key={notification.id} className={getNotificationColor(notification.type)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getNotificationIcon(notification.type)}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

