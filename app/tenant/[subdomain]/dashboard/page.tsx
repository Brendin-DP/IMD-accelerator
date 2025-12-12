"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { FileText, Bell, CheckCircle2, UserPlus, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToastContainer, useToast } from "@/components/ui/toast";
import { PieChart } from "@/components/ui/pie-chart";
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
  request_status: string | null;
  review_status: string | null;
  created_at: string | null;
  is_external: boolean | null;
  external_reviewer_id: string | null;
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
  request_status: string | null;
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
  const [nominationStats, setNominationStats] = useState({ requested: 0, accepted: 0 });
  const [reviewProgressStats, setReviewProgressStats] = useState({ notStarted: 0, inProgress: 0, completed: 0 });
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
          fetchDashboardStats(userData.id);
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
      // Fetch nominations where this user is the reviewer and request_status is "accepted"
      // Exclude self-nominated external reviewers (where is_external=true and nominated_by_id=userId)
      const { data: nominations, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          request_status,
          review_status,
          created_at,
          is_external,
          external_reviewer_id,
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
        .eq("request_status", "accepted")
        .order("created_at", { ascending: false });

      // Handle relationship cache issues
      if (nominationsError && (nominationsError.message?.includes("relationship") || nominationsError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");
        
        const { data: nominationsOnly, error: nominationsOnlyError } = await supabase
          .from("reviewer_nominations")
          .select("id, request_status, review_status, created_at, participant_assessment_id, is_external, external_reviewer_id, nominated_by_id")
          .eq("reviewer_id", userId)
          .eq("request_status", "accepted")
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

          // Fetch external reviewers' review_status if needed
          const externalReviewerIds = nominationsOnly
            .filter((n: any) => n.is_external && n.external_reviewer_id)
            .map((n: any) => n.external_reviewer_id);
          
          let externalReviewersMap = new Map();
          if (externalReviewerIds.length > 0) {
            const { data: externalReviewers } = await supabase
              .from("external_reviewers")
              .select("id, review_status")
              .in("id", externalReviewerIds);
            
            if (externalReviewers) {
              externalReviewers.forEach((er: any) => {
                externalReviewersMap.set(er.id, er.review_status);
              });
            }
          }

          // Merge data and filter out self-nominated external reviewers
          const merged = nominationsOnly
            .filter((nomination: any) => {
              // Exclude self-nominated external reviewers
              return !(nomination.is_external === true && nomination.nominated_by_id === userId);
            })
            .map((nomination: any) => {
              const participantAssessment = participantAssessments?.find((pa: any) => pa.id === nomination.participant_assessment_id);
              const cohortParticipant = cohortParticipants?.find((cp: any) => cp.id === participantAssessment?.participant_id);
              const clientUser = clientUsers?.find((cu: any) => cu.id === cohortParticipant?.client_user_id);
              const cohortAssessment = cohortAssessments?.find((ca: any) => ca.id === participantAssessment?.cohort_assessment_id);
              const assessmentType = assessmentTypes?.find((at: any) => at.id === cohortAssessment?.assessment_type_id);
              const cohort = cohorts?.find((c: any) => c.id === cohortAssessment?.cohort_id);

              // Get review_status - for external reviewers, get from external_reviewers table
              let reviewStatus = nomination.review_status;
              if (nomination.is_external && nomination.external_reviewer_id) {
                reviewStatus = externalReviewersMap.get(nomination.external_reviewer_id) || null;
              }

              return {
                ...nomination,
                review_status: reviewStatus,
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
        // Fetch external reviewers' review_status if needed
        const externalReviewerIds = nominations
          .filter((n: any) => n.is_external && n.external_reviewer_id)
          .map((n: any) => n.external_reviewer_id);
        
        let externalReviewersMap = new Map();
        if (externalReviewerIds.length > 0) {
          const { data: externalReviewers } = await supabase
            .from("external_reviewers")
            .select("id, review_status")
            .in("id", externalReviewerIds);
          
          if (externalReviewers) {
            externalReviewers.forEach((er: any) => {
              externalReviewersMap.set(er.id, er.review_status);
            });
          }
        }

        // Filter out self-nominated external reviewers and add review_status for external reviewers
        const filtered = nominations
          .filter((nomination: any) => {
            return !(nomination.is_external === true && nomination.nominated_by_id === userId);
          })
          .map((nomination: any) => {
            // Get review_status - for external reviewers, get from external_reviewers table
            let reviewStatus = nomination.review_status;
            if (nomination.is_external && nomination.external_reviewer_id) {
              reviewStatus = externalReviewersMap.get(nomination.external_reviewer_id) || null;
            }
            return {
              ...nomination,
              review_status: reviewStatus,
            };
          });
        setMyReviews(filtered || []);
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
      // Fetch nominations where this user is the reviewer and request_status is "pending"
      // Exclude self-nominated external reviewers (where is_external=true and nominated_by_id=userId)
      const { data: nominations, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select(`
          id,
          request_status,
          created_at,
          nominated_by_id,
          is_external,
          participant_assessment_id,
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
        .eq("request_status", "pending")
        .order("created_at", { ascending: false });

      // Handle relationship cache issues
      if (nominationsError && (nominationsError.message?.includes("relationship") || nominationsError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");
        
        const { data: nominationsOnly, error: nominationsOnlyError } = await supabase
          .from("reviewer_nominations")
          .select("id, request_status, created_at, nominated_by_id, participant_assessment_id, is_external")
          .eq("reviewer_id", userId)
          .eq("request_status", "pending")
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

          // Merge data and filter out self-nominated external reviewers
          const merged = nominationsOnly
            .filter((nomination: any) => {
              // Exclude self-nominated external reviewers
              return !(nomination.is_external === true && nomination.nominated_by_id === userId);
            })
            .map((nomination: any) => {
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
        // Filter out self-nominated external reviewers first
        const filteredNominations = nominations.filter((nomination: any) => {
          return !(nomination.is_external === true && nomination.nominated_by_id === userId);
        });

        // If we got data with relationships, we still need to fetch nominated_by separately
        const nominatedByIds = [...new Set(filteredNominations.map((n: any) => n.nominated_by_id).filter(Boolean) || [])];
        
        if (nominatedByIds.length > 0) {
          const { data: clientUsers } = await supabase
            .from("client_users")
            .select("id, name, surname, email")
            .in("id", nominatedByIds);

          // Supabase embedded selects sometimes return nested relations as arrays.
          // Normalize participant_assessment, participant, client_user, and cohort_assessment to single objects.
          const merged = filteredNominations.map((nomination: any): MyAction => {
            const pa = Array.isArray(nomination.participant_assessment)
              ? nomination.participant_assessment[0] ?? null
              : nomination.participant_assessment ?? null;

            const participant = pa
              ? (Array.isArray(pa.participant)
                  ? pa.participant[0] ?? null
                  : pa.participant ?? null)
              : null;

            const clientUser = participant
              ? (Array.isArray(participant.client_user)
                  ? participant.client_user[0] ?? null
                  : participant.client_user ?? null)
              : null;

            const cohortAssessment = pa
              ? (Array.isArray(pa.cohort_assessment)
                  ? pa.cohort_assessment[0] ?? null
                  : pa.cohort_assessment ?? null)
              : null;

            return {
              id: nomination.id,
              request_status: nomination.request_status,
              created_at: nomination.created_at,
              nominated_by: clientUsers?.find((cu: any) => cu.id === nomination.nominated_by_id) || undefined,
              participant_assessment: pa
                ? {
                    id: pa.id,
                    participant: participant
                      ? {
                          client_user: clientUser
                            ? {
                                name: clientUser.name,
                                surname: clientUser.surname,
                                email: clientUser.email,
                              }
                            : undefined,
                        }
                      : undefined,
                    cohort_assessment: cohortAssessment
                      ? {
                          name: cohortAssessment.name,
                          assessment_type: cohortAssessment.assessment_type
                            ? (Array.isArray(cohortAssessment.assessment_type)
                                ? cohortAssessment.assessment_type[0] ?? undefined
                                : cohortAssessment.assessment_type ?? undefined)
                            : undefined,
                          cohort: cohortAssessment.cohort
                            ? (Array.isArray(cohortAssessment.cohort)
                                ? cohortAssessment.cohort[0] ?? undefined
                                : cohortAssessment.cohort ?? undefined)
                            : undefined,
                        }
                      : undefined,
                  }
                : {
                    id: nomination.participant_assessment_id || nomination.id,
                  },
            };
          });

          setMyActions(merged || []);
        } else {
          // Normalize even when there are no nominated_by users to fetch
          const normalized = filteredNominations.map((nomination: any): MyAction => {
            const pa = Array.isArray(nomination.participant_assessment)
              ? nomination.participant_assessment[0] ?? null
              : nomination.participant_assessment ?? null;

            const participant = pa
              ? (Array.isArray(pa.participant)
                  ? pa.participant[0] ?? null
                  : pa.participant ?? null)
              : null;

            const clientUser = participant
              ? (Array.isArray(participant.client_user)
                  ? participant.client_user[0] ?? null
                  : participant.client_user ?? null)
              : null;

            const cohortAssessment = pa
              ? (Array.isArray(pa.cohort_assessment)
                  ? pa.cohort_assessment[0] ?? null
                  : pa.cohort_assessment ?? null)
              : null;

            return {
              id: nomination.id,
              request_status: nomination.request_status,
              created_at: nomination.created_at,
              participant_assessment: pa
                ? {
                    id: pa.id,
                    participant: participant
                      ? {
                          client_user: clientUser
                            ? {
                                name: clientUser.name,
                                surname: clientUser.surname,
                                email: clientUser.email,
                              }
                            : undefined,
                        }
                      : undefined,
                    cohort_assessment: cohortAssessment
                      ? {
                          name: cohortAssessment.name,
                          assessment_type: cohortAssessment.assessment_type
                            ? (Array.isArray(cohortAssessment.assessment_type)
                                ? cohortAssessment.assessment_type[0] ?? undefined
                                : cohortAssessment.assessment_type ?? undefined)
                            : undefined,
                          cohort: cohortAssessment.cohort
                            ? (Array.isArray(cohortAssessment.cohort)
                                ? cohortAssessment.cohort[0] ?? undefined
                                : cohortAssessment.cohort ?? undefined)
                            : undefined,
                        }
                      : undefined,
                  }
                : {
                    id: nomination.participant_assessment_id || nomination.id,
                  },
            };
          });

          setMyActions(normalized || []);
        }
      } else {
        setMyActions([]);
      }
    } catch (err) {
      console.error("Error fetching my actions:", err);
      setMyActions([]);
    }
  }

  async function fetchDashboardStats(userId: string) {
    try {
      // 1. Fetch nomination stats (where user is the nominator)
      const { data: myNominations } = await supabase
        .from("reviewer_nominations")
        .select("id, request_status")
        .eq("nominated_by_id", userId);

      if (myNominations) {
        const requested = myNominations.length; // Total nominations requested
        const accepted = myNominations.filter((n: any) => n.request_status === "accepted").length;
        setNominationStats({ requested, accepted });
      }

      // 2. Fetch review progress stats (where user is the participant being reviewed)
      // First get all participant_assessments for this user
      const { data: userParticipants } = await supabase
        .from("cohort_participants")
        .select("id")
        .eq("client_user_id", userId);

      if (userParticipants && userParticipants.length > 0) {
        const participantIds = userParticipants.map((p: any) => p.id);
        
        const { data: participantAssessments } = await supabase
          .from("participant_assessments")
          .select("id")
          .in("participant_id", participantIds);

        if (participantAssessments && participantAssessments.length > 0) {
          const participantAssessmentIds = participantAssessments.map((pa: any) => pa.id);

          // Fetch all nominations for these participant assessments
          const { data: reviewNominations } = await supabase
            .from("reviewer_nominations")
            .select("id, review_status, is_external, external_reviewer_id, request_status")
            .in("participant_assessment_id", participantAssessmentIds)
            .eq("request_status", "accepted");

          // Fetch external reviewers with review_status
          const externalReviewerIds = reviewNominations
            ?.filter((n: any) => n.is_external && n.external_reviewer_id)
            .map((n: any) => n.external_reviewer_id) || [];
          
          let externalReviewersMap = new Map();
          if (externalReviewerIds.length > 0) {
            const { data: externalReviewers } = await supabase
              .from("external_reviewers")
              .select("id, review_status")
              .in("id", externalReviewerIds);
            
            externalReviewers?.forEach((er: any) => {
              externalReviewersMap.set(er.id, er.review_status);
            });
          }

          // Count review progress
          let notStarted = 0;
          let inProgress = 0;
          let completed = 0;

          reviewNominations?.forEach((nomination: any) => {
            let reviewStatus = nomination.review_status;
            
            // For external reviewers, get status from external_reviewers table
            if (nomination.is_external && nomination.external_reviewer_id) {
              reviewStatus = externalReviewersMap.get(nomination.external_reviewer_id) || reviewStatus;
            }

            if (!reviewStatus || reviewStatus.toLowerCase() === "not started" || reviewStatus.toLowerCase() === "not_started") {
              notStarted++;
            } else if (reviewStatus.toLowerCase() === "in progress" || reviewStatus.toLowerCase() === "in_progress") {
              inProgress++;
            } else if (reviewStatus.toLowerCase() === "completed") {
              completed++;
            } else {
              notStarted++; // Default to not started
            }
          });

          setReviewProgressStats({ notStarted, inProgress, completed });
        }
      }
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
    }
  }

  const getReviewStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed" || statusLower === "done" || statusLower === "submitted") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "in progress" || statusLower === "in_progress") {
      return "bg-blue-100 text-blue-800";
    } else if (statusLower === "not started" || statusLower === "not_started") {
      return "bg-gray-100 text-gray-800";
    }
    return "bg-gray-100 text-gray-800";
  };

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

      // Update nomination request_status to "accepted"
      const { error: updateError } = await supabase
        .from("reviewer_nominations")
        .update({ request_status: "accepted" })
        .eq("id", nominationId);

      if (updateError) {
        console.error("Error accepting nomination:", updateError);
        showToast("Error accepting nomination. Please try again.", "error");
        return;
      }

      // Refresh both My Actions and My Reviews lists
      await fetchMyActions(user.id);
      await fetchMyReviews(user.id);
      await fetchDashboardStats(user.id);

      // Trigger notification count update (will create notification for the nominator)
      window.dispatchEvent(new CustomEvent('notification-update'));

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

      // Update nomination request_status to "rejected"
      const { error: updateError } = await supabase
        .from("reviewer_nominations")
        .update({ request_status: "rejected" })
        .eq("id", nominationId);

      if (updateError) {
        console.error("Error rejecting nomination:", updateError);
        showToast("Error rejecting nomination. Please try again.", "error");
        return;
      }

      // Refresh My Actions list
      await fetchMyActions(user.id);
      await fetchDashboardStats(user.id);

      // Trigger notification count update (will create notification for the nominator)
      window.dispatchEvent(new CustomEvent('notification-update'));

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

      {/* Dashboard Stats Cards - Hidden */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 hidden">
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

      {/* Stats Panels Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Nominations Stat with Pie Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <UserPlus className="h-8 w-8 text-orange-600" aria-hidden="true" />
            </div>
            <CardTitle className="text-center">Nominations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <PieChart
                data={[
                  { label: "Pending/Rejected", value: nominationStats.requested - nominationStats.accepted, color: "#fbbf24" },
                  { label: "Accepted", value: nominationStats.accepted, color: "#10b981" },
                ]}
                size={120}
              />
              <div className="flex flex-col gap-2 text-sm w-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <span className="text-muted-foreground">Requested</span>
                  </div>
                  <span className="font-medium">{nominationStats.requested}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">Accepted</span>
                  </div>
                  <span className="font-medium">{nominationStats.accepted}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Review Progress Stat with Pie Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <TrendingUp className="h-8 w-8 text-green-600" aria-hidden="true" />
            </div>
            <CardTitle className="text-center">Review Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <PieChart
                data={[
                  { label: "Not Started", value: reviewProgressStats.notStarted, color: "#9ca3af" },
                  { label: "In Progress", value: reviewProgressStats.inProgress, color: "#3b82f6" },
                  { label: "Completed", value: reviewProgressStats.completed, color: "#10b981" },
                ]}
                size={120}
              />
              <div className="flex flex-col gap-2 text-sm w-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                    <span className="text-muted-foreground">Not Started</span>
                  </div>
                  <span className="font-medium">{reviewProgressStats.notStarted}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-muted-foreground">In Progress</span>
                  </div>
                  <span className="font-medium">{reviewProgressStats.inProgress}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">Completed</span>
                  </div>
                  <span className="font-medium">{reviewProgressStats.completed}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Three Panels Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* My Assessments */}
        <div className="overflow-hidden rounded-lg bg-white shadow border border-gray-200">
          <div className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-blue-600" aria-hidden="true" />
              </div>
              <dl>
                <dt className="text-sm font-medium text-gray-900 text-center">My Assessments</dt>
                <dd className="mt-3">
                  <div className="border-t border-gray-200 pt-4">
                    {myAssessments.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center">No assessments found</p>
                    ) : (
                      <div className="space-y-0">
                        {myAssessments.map((assessment, index) => {
                          const assessmentName = assessment.cohort_assessment?.name || 
                            assessment.cohort_assessment?.assessment_type?.name || 
                            "Assessment";
                          const cohortName = assessment.cohort_assessment?.cohort?.name || "Cohort";
                          
                          return (
                            <div
                              key={assessment.id}
                              className={`cursor-pointer hover:bg-gray-50 py-3 transition-colors ${index !== myAssessments.length - 1 ? 'border-b border-gray-200' : ''}`}
                              onClick={() => {
                                const assessmentId = assessment.cohort_assessment?.id;
                                if (assessmentId) {
                                  router.push(`/tenant/${subdomain}/assessments/${assessmentId}`);
                                }
                              }}
                            >
                              <dl className="flex flex-wrap gap-x-4 gap-y-2">
                                <div className="flex-1 min-w-0">
                                  <dt className="text-sm font-medium text-gray-900">{assessmentName}</dt>
                                  <dd className="text-sm text-gray-500">{cohortName}</dd>
                                </div>
                                <div className="flex-shrink-0">
                                  <dt className="sr-only">Status</dt>
                                  <dd>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(assessment.status || "Not started")}`}>
                                      {assessment.status || "Not started"}
                                    </span>
                                  </dd>
                                </div>
                                {assessment.score !== null && (
                                  <div className="w-full">
                                    <dt className="sr-only">Score</dt>
                                    <dd className="text-sm text-gray-500">Score: {assessment.score}</dd>
                                  </div>
                                )}
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* My Actions */}
        <div className="overflow-hidden rounded-lg bg-white shadow border border-gray-200">
          <div className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center justify-center mb-4">
                <Bell className="h-8 w-8 text-orange-600" aria-hidden="true" />
              </div>
              <dl>
                <dt className="text-sm font-medium text-gray-900 text-center">My Actions</dt>
                <dd className="mt-3">
                  <div className="border-t border-gray-200 pt-4">
                    {myActions.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center">No actions required</p>
                    ) : (
                      <div className="space-y-0">
                        {myActions.map((action, index) => {
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
                              className={`py-3 ${index !== myActions.length - 1 ? 'border-b border-gray-200' : ''}`}
                            >
                              <dl className="flex flex-wrap gap-x-4 gap-y-2">
                                <div className="flex-1 min-w-0">
                                  <dt className="text-sm font-medium text-gray-900">
                                    Review request from {nominatedByName}
                                  </dt>
                                  <dd className="text-sm text-gray-500">{assessmentName}</dd>
                                  {action.created_at && (
                                    <dd className="text-sm text-gray-500 mt-1">
                                      Requested: {new Date(action.created_at).toLocaleDateString()}
                                    </dd>
                                  )}
                                </div>
                                <div className="w-full flex gap-2 mt-2">
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
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* My Reviews */}
        <div className="overflow-hidden rounded-lg bg-white shadow border border-gray-200">
          <div className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden="true" />
              </div>
              <dl>
                <dt className="text-sm font-medium text-gray-900 text-center">My Reviews</dt>
                <dd className="mt-3">
                  <div className="border-t border-gray-200 pt-4">
                    {myReviews.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center">No reviews pending</p>
                    ) : (
                      <div className="space-y-0">
                        {myReviews.map((review, index) => {
                          const participant = review.participant_assessment?.participant?.client_user;
                          const participantName = participant
                            ? `${participant.name || ""} ${participant.surname || ""}`.trim() || participant.email
                            : "Participant";
                          const assessmentName = review.participant_assessment?.cohort_assessment?.name ||
                            review.participant_assessment?.cohort_assessment?.assessment_type?.name ||
                            "Assessment";
                          const reviewStatus = review.review_status || "Not started";
                          
                          return (
                            <div
                              key={review.id}
                              className={`cursor-pointer hover:bg-gray-50 py-3 transition-colors ${index !== myReviews.length - 1 ? 'border-b border-gray-200' : ''}`}
                              onClick={() => {
                                router.push(`/tenant/${subdomain}/reviews/${review.id}`);
                              }}
                            >
                              <dl className="flex flex-wrap gap-x-4 gap-y-2">
                                <div className="flex-1 min-w-0">
                                  <dt className="text-sm font-medium text-gray-900">{participantName}</dt>
                                  <dd className="text-sm text-gray-500">{assessmentName}</dd>
                                  {review.created_at && (
                                    <dd className="text-sm text-gray-500 mt-1">
                                      Assigned: {new Date(review.created_at).toLocaleDateString()}
                                    </dd>
                                  )}
                                </div>
                                <div className="flex-shrink-0">
                                  <dt className="sr-only">Review Status</dt>
                                  <dd>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getReviewStatusColor(reviewStatus)}`}>
                                      {reviewStatus}
                                    </span>
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
