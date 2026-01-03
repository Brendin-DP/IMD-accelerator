"use client";

import { useState, useEffect, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Search, Calendar, Users, MoreVertical, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import { useTableSort } from "@/hooks/useTableSort";

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
    client_id?: string;
    plan_id?: string;
    start_date?: string;
    end_date?: string;
    client?: {
      id: string;
      name: string;
    };
    plan?: {
      id: string;
      name: string;
    };
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
  review_status: string | null;
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
    review_status: string | null;
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
  const [nominationSortStates, setNominationSortStates] = useState<Map<string, { key: string | null; direction: "asc" | "desc" | null }>>(new Map());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [participantProgress, setParticipantProgress] = useState<Map<string, { answered: number; total: number; percentage: number }>>(new Map());
  const [reviewerProgress, setReviewerProgress] = useState<Map<string, { answered: number; total: number; percentage: number }>>(new Map());

  // Prepare participant assessments for sorting
  const participantsForSorting = participantAssessments.map((pa) => {
    const progress = pa.id ? participantProgress.get(pa.id) : null;
    return {
      ...pa,
      name: ((pa.participant as any)?.client_user as any)?.name || "",
      surname: ((pa.participant as any)?.client_user as any)?.surname || "",
      email: ((pa.participant as any)?.client_user as any)?.email || "",
      progressPercentage: progress?.percentage || 0,
    };
  });

  // Filter participants based on search query
  const filteredParticipants = participantsForSorting.filter((pa) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = pa.name.toLowerCase();
    const surname = pa.surname.toLowerCase();
    const email = pa.email.toLowerCase();
    return name.includes(query) || surname.includes(query) || email.includes(query);
  });

  const { sortedData: sortedParticipantAssessments, sortConfig, handleSort } = useTableSort(filteredParticipants);

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
      fetchParticipantProgress();
    }
  }, [participantAssessments, assessment]);

  useEffect(() => {
    // Fetch reviewer progress when nominations are loaded
    if (nominations.length > 0 && assessment) {
      fetchReviewerProgress();
    }
  }, [nominations, assessment]);

  // Refresh progress when page gains focus or becomes visible (user returns to tab/window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (participantAssessments.length > 0 && assessment) {
          fetchParticipantProgress();
        }
        if (nominations.length > 0 && assessment) {
          fetchReviewerProgress();
        }
      }
    };

    const handleFocus = () => {
      if (participantAssessments.length > 0 && assessment) {
        fetchParticipantProgress();
      }
      if (nominations.length > 0 && assessment) {
        fetchReviewerProgress();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [participantAssessments, nominations, assessment]);

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
          cohort:cohorts(
            id,
            name,
            client_id,
            plan_id,
            start_date,
            end_date,
            client:clients(id, name),
            plan:plans(id, name)
          )
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
            ? supabase.from("cohorts").select("id, name, client_id, plan_id, start_date, end_date").eq("id", assessmentData.cohort_id).single()
            : { data: null, error: null }
        ]);

        // Fetch client and plan separately if cohort exists
        let clientData = null;
        let planData = null;
        if (cohortResult.data) {
          const [clientResult, planResult] = await Promise.all([
            cohortResult.data.client_id
              ? supabase.from("clients").select("id, name").eq("id", cohortResult.data.client_id).single()
              : { data: null, error: null },
            cohortResult.data.plan_id
              ? supabase.from("plans").select("id, name").eq("id", cohortResult.data.plan_id).single()
              : { data: null, error: null }
          ]);
          clientData = clientResult.data;
          planData = planResult.data;
        }

        // Merge the data
        data = {
          ...assessmentData,
          assessment_type: assessmentTypeResult.data || null,
          cohort: cohortResult.data ? {
            ...cohortResult.data,
            client: clientData,
            plan: planData,
          } : null,
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
            status: "Not started",
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

  async function fetchParticipantProgress() {
    try {
      if (!assessment) return;

      // Get assessment_definition_id
      let assessmentDefinitionId: string | null = null;

      // First, try to get it directly from cohort_assessment
      if ((assessment as any).assessment_definition_id) {
        assessmentDefinitionId = (assessment as any).assessment_definition_id;
      } else {
        // Fallback: get from plan mapping (workaround)
        const cohortId = assessment.cohort_id;
        const { data: cohort } = await supabase
          .from("cohorts")
          .select("plan_id")
          .eq("id", cohortId)
          .single();

        if (cohort?.plan_id) {
          const { data: planData } = await supabase
            .from("plans")
            .select("description")
            .eq("id", cohort.plan_id)
            .single();

          if (planData?.description) {
            const planMappingMatch = planData.description.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
            if (planMappingMatch) {
              try {
                const mapping = JSON.parse(planMappingMatch[1]);
                const assessmentTypeId = assessment.assessment_type_id;
                assessmentDefinitionId = mapping[assessmentTypeId] || null;
              } catch (e) {
                console.error("Error parsing plan assessment mapping:", e);
              }
            }
          }
        }

        // If still no custom assessment, fall back to system assessment
        if (!assessmentDefinitionId) {
          const { data: systemAssessment } = await supabase
            .from("assessment_definitions_v2")
            .select("id")
            .eq("assessment_type_id", assessment.assessment_type_id)
            .eq("is_system", true)
            .maybeSingle();

          if (systemAssessment) {
            assessmentDefinitionId = systemAssessment.id;
          }
        }
      }

      if (!assessmentDefinitionId) {
        console.warn("Could not determine assessment_definition_id");
        return;
      }

      // Count total questions for this assessment
      const { count: totalQuestionsCount, error: countError } = await supabase
        .from("assessment_questions_v2")
        .select("*", { count: "exact", head: true })
        .eq("assessment_definition_id", assessmentDefinitionId);

      const total = totalQuestionsCount || 0;

      // Get all participant assessment IDs
      const participantAssessmentIds = participantAssessments
        .map((pa) => pa.id)
        .filter((id): id is string => id !== null);

      if (participantAssessmentIds.length === 0) {
        return;
      }

      // Fetch all response sessions for these participant assessments
      const { data: responseSessions, error: sessionsError } = await supabase
        .from("assessment_response_sessions")
        .select("id, participant_assessment_id")
        .in("participant_assessment_id", participantAssessmentIds);

      if (sessionsError) {
        console.error("Error fetching response sessions:", sessionsError);
        return;
      }

      if (!responseSessions || responseSessions.length === 0) {
        // No sessions yet, set all progress to 0
        const progressMap = new Map<string, { answered: number; total: number; percentage: number }>();
        participantAssessments.forEach((pa) => {
          if (pa.id) {
            progressMap.set(pa.id, { answered: 0, total, percentage: 0 });
          }
        });
        setParticipantProgress(progressMap);
        return;
      }

      // Get all session IDs
      const sessionIds = responseSessions.map((s: any) => s.id);

      // Count answered questions per session - use is_answered flag for accurate tracking
      // Join with questions to get step_id for step-aware progress
      const { data: responses, error: responsesError } = await supabase
        .from("assessment_responses")
        .select(`
          id,
          session_id,
          question_id,
          is_answered,
          answer_text,
          created_at,
          updated_at,
          question:assessment_questions_v2 (
            id,
            step_id,
            question_order
          )
        `)
        .in("session_id", sessionIds)
        .eq("is_answered", true)
        .order("created_at", { ascending: true });

      if (responsesError) {
        console.error("Error fetching responses:", responsesError);
        return;
      }

      // Create a map of session_id -> participant_assessment_id
      const sessionToParticipantMap = new Map<string, string>();
      responseSessions.forEach((s: any) => {
        sessionToParticipantMap.set(s.id, s.participant_assessment_id);
      });

      console.log("🔍 [ADMIN] Participant Progress - All Responses:", {
        assessmentId,
        assessmentDefinitionId,
        totalQuestions: total,
        totalResponses: responses?.length || 0,
        sessionIds: sessionIds.length,
        responses: responses?.map((r: any) => ({
          responseId: r.id,
          sessionId: r.session_id,
          questionId: r.question_id,
          isAnswered: r.is_answered,
          hasAnswer: !!r.answer_text,
          answerPreview: r.answer_text ? r.answer_text.substring(0, 50) : null,
          stepId: r.question?.step_id ?? null,
          questionOrder: r.question?.question_order ?? null,
          participantAssessmentId: sessionToParticipantMap.get(r.session_id),
        })),
      });

      // Count answered questions per participant assessment
      const progressMap = new Map<string, { answered: number; total: number; percentage: number }>();
      
      // Initialize all participants with 0 progress
      participantAssessments.forEach((pa) => {
        if (pa.id) {
          progressMap.set(pa.id, { answered: 0, total, percentage: 0 });
        }
      });

      // Count unique answered questions per participant (using is_answered = true)
      // Build answered ids per step for better tracking
      const participantAnsweredMap = new Map<string, Set<string>>();
      const participantAnsweredByStep = new Map<string, Map<string, Set<string>>>();
      
      (responses || []).forEach((r: any) => {
        // Only count if is_answered is true
        if (r.is_answered) {
          const participantAssessmentId = sessionToParticipantMap.get(r.session_id);
          if (participantAssessmentId) {
            // Add to overall answered set
            if (!participantAnsweredMap.has(participantAssessmentId)) {
              participantAnsweredMap.set(participantAssessmentId, new Set());
            }
            participantAnsweredMap.get(participantAssessmentId)!.add(String(r.question_id));
            
            // Organize by step
            if (!participantAnsweredByStep.has(participantAssessmentId)) {
              participantAnsweredByStep.set(participantAssessmentId, new Map());
            }
            const stepMap = participantAnsweredByStep.get(participantAssessmentId)!;
            const stepId = r.question?.step_id ?? "__no_step__";
            if (!stepMap.has(stepId)) {
              stepMap.set(stepId, new Set());
            }
            stepMap.get(stepId)!.add(String(r.question_id));
          }
        }
      });

      // Calculate percentages
      participantAnsweredMap.forEach((answeredSet, participantAssessmentId) => {
        const answered = answeredSet.size;
        const percentage = total > 0 ? Math.round((answered / total) * 100) : 0;
        progressMap.set(participantAssessmentId, { answered, total, percentage });
      });

      console.log("🔍 [ADMIN] Participant Progress - Final Calculation:", {
        assessmentId,
        totalQuestions: total,
        participantProgress: Array.from(progressMap.entries()).map(([paId, progress]) => ({
          participantAssessmentId: paId,
          answered: progress.answered,
          total: progress.total,
          percentage: progress.percentage,
          answeredQuestionIds: Array.from(participantAnsweredMap.get(paId) || []),
          answeredByStep: participantAnsweredByStep.get(paId) 
            ? Object.fromEntries(
                Array.from(participantAnsweredByStep.get(paId)!.entries()).map(([stepId, qIds]) => [
                  stepId,
                  Array.from(qIds),
                ])
              )
            : {},
        })),
      });

      setParticipantProgress(progressMap);
    } catch (err) {
      console.error("Error fetching participant progress:", err);
    }
  }

  async function fetchReviewerProgress() {
    try {
      if (!assessment) return;

      // Get assessment_definition_id (same logic as participant progress)
      let assessmentDefinitionId: string | null = null;

      if ((assessment as any).assessment_definition_id) {
        assessmentDefinitionId = (assessment as any).assessment_definition_id;
      } else {
        const cohortId = assessment.cohort_id;
        const { data: cohort } = await supabase
          .from("cohorts")
          .select("plan_id")
          .eq("id", cohortId)
          .single();

        if (cohort?.plan_id) {
          const { data: planData } = await supabase
            .from("plans")
            .select("description")
            .eq("id", cohort.plan_id)
            .single();

          if (planData?.description) {
            const planMappingMatch = planData.description.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
            if (planMappingMatch) {
              try {
                const mapping = JSON.parse(planMappingMatch[1]);
                const assessmentTypeId = assessment.assessment_type_id;
                assessmentDefinitionId = mapping[assessmentTypeId] || null;
              } catch (e) {
                console.error("Error parsing plan assessment mapping:", e);
              }
            }
          }
        }

        if (!assessmentDefinitionId) {
          const { data: systemAssessment } = await supabase
            .from("assessment_definitions_v2")
            .select("id")
            .eq("assessment_type_id", assessment.assessment_type_id)
            .eq("is_system", true)
            .maybeSingle();

          if (systemAssessment) {
            assessmentDefinitionId = systemAssessment.id;
          }
        }
      }

      if (!assessmentDefinitionId) {
        console.warn("Could not determine assessment_definition_id for reviewer progress");
        return;
      }

      // Count total questions for this assessment
      const { count: totalQuestionsCount } = await supabase
        .from("assessment_questions_v2")
        .select("*", { count: "exact", head: true })
        .eq("assessment_definition_id", assessmentDefinitionId);

      const total = totalQuestionsCount || 0;

      // Get all reviewer nomination IDs
      const reviewerNominationIds = nominations
        .map((n) => n.id)
        .filter((id): id is string => id !== null);

      if (reviewerNominationIds.length === 0) {
        return;
      }

      // Fetch all response sessions for reviewers
      const { data: responseSessions, error: sessionsError } = await supabase
        .from("assessment_response_sessions")
        .select("id, reviewer_nomination_id")
        .in("reviewer_nomination_id", reviewerNominationIds)
        .eq("respondent_type", "reviewer");

      if (sessionsError) {
        console.error("Error fetching reviewer response sessions:", sessionsError);
        return;
      }

      if (!responseSessions || responseSessions.length === 0) {
        // No sessions yet, set all progress to 0
        const progressMap = new Map<string, { answered: number; total: number; percentage: number }>();
        nominations.forEach((n) => {
          if (n.id) {
            progressMap.set(n.id, { answered: 0, total, percentage: 0 });
          }
        });
        setReviewerProgress(progressMap);
        return;
      }

      // Get all session IDs
      const sessionIds = responseSessions.map((s: any) => s.id);

      // Count answered questions per session - use is_answered flag
      // Join with questions to get step_id for step-aware progress
      const { data: responses, error: responsesError } = await supabase
        .from("assessment_responses")
        .select(`
          id,
          session_id,
          question_id,
          is_answered,
          answer_text,
          created_at,
          updated_at,
          question:assessment_questions_v2 (
            id,
            step_id,
            question_order
          )
        `)
        .in("session_id", sessionIds)
        .eq("is_answered", true)
        .order("created_at", { ascending: true });

      if (responsesError) {
        console.error("Error fetching reviewer responses:", responsesError);
        return;
      }

      // Create a map of session_id -> reviewer_nomination_id
      const sessionToNominationMap = new Map<string, string>();
      responseSessions.forEach((s: any) => {
        sessionToNominationMap.set(s.id, s.reviewer_nomination_id);
      });

      console.log("🔍 [ADMIN] Reviewer Progress - All Responses:", {
        assessmentId,
        assessmentDefinitionId,
        totalQuestions: total,
        totalResponses: responses?.length || 0,
        sessionIds: sessionIds.length,
        responses: responses?.map((r: any) => ({
          responseId: r.id,
          sessionId: r.session_id,
          questionId: r.question_id,
          isAnswered: r.is_answered,
          hasAnswer: !!r.answer_text,
          answerPreview: r.answer_text ? r.answer_text.substring(0, 50) : null,
          stepId: r.question?.step_id ?? null,
          questionOrder: r.question?.question_order ?? null,
          reviewerNominationId: sessionToNominationMap.get(r.session_id),
        })),
      });

      // Count answered questions per reviewer nomination
      const progressMap = new Map<string, { answered: number; total: number; percentage: number }>();
      
      // Initialize all nominations with 0 progress
      nominations.forEach((n) => {
        if (n.id) {
          progressMap.set(n.id, { answered: 0, total, percentage: 0 });
        }
      });

      // Count unique answered questions per reviewer nomination
      // Build answered ids per step for better tracking
      const nominationAnsweredMap = new Map<string, Set<string>>();
      const nominationAnsweredByStep = new Map<string, Map<string, Set<string>>>();
      
      (responses || []).forEach((r: any) => {
        if (r.is_answered) {
          const nominationId = sessionToNominationMap.get(r.session_id);
          if (nominationId) {
            // Add to overall answered set
            if (!nominationAnsweredMap.has(nominationId)) {
              nominationAnsweredMap.set(nominationId, new Set());
            }
            nominationAnsweredMap.get(nominationId)!.add(String(r.question_id));
            
            // Organize by step
            if (!nominationAnsweredByStep.has(nominationId)) {
              nominationAnsweredByStep.set(nominationId, new Map());
            }
            const stepMap = nominationAnsweredByStep.get(nominationId)!;
            const stepId = r.question?.step_id ?? "__no_step__";
            if (!stepMap.has(stepId)) {
              stepMap.set(stepId, new Set());
            }
            stepMap.get(stepId)!.add(String(r.question_id));
          }
        }
      });

      // Calculate percentages
      nominationAnsweredMap.forEach((answeredSet, nominationId) => {
        const answered = answeredSet.size;
        const percentage = total > 0 ? Math.round((answered / total) * 100) : 0;
        progressMap.set(nominationId, { answered, total, percentage });
      });

      console.log("🔍 [ADMIN] Reviewer Progress - Final Calculation:", {
        assessmentId,
        totalQuestions: total,
        reviewerProgress: Array.from(progressMap.entries()).map(([nominationId, progress]) => ({
          reviewerNominationId: nominationId,
          answered: progress.answered,
          total: progress.total,
          percentage: progress.percentage,
          answeredQuestionIds: Array.from(nominationAnsweredMap.get(nominationId) || []),
          answeredByStep: nominationAnsweredByStep.get(nominationId)
            ? Object.fromEntries(
                Array.from(nominationAnsweredByStep.get(nominationId)!.entries()).map(([stepId, qIds]) => [
                  stepId,
                  Array.from(qIds),
                ])
              )
            : {},
        })),
      });

      setReviewerProgress(progressMap);
    } catch (err) {
      console.error("Error fetching reviewer progress:", err);
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
        .select("*, review_status")
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

      // Fetch external reviewers with review_status
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
          const extReviewer = externalReviewers.find((e: any) => e.id === nomination.external_reviewer_id);
          return {
            ...nomination,
            review_status: extReviewer?.review_status || nomination.review_status || null,
            reviewer: null,
            external_reviewer: extReviewer || null,
            nominated_by: clientUsers.find((u: any) => u.id === nomination.nominated_by_id) || null,
          };
        } else {
          // Internal reviewer - review_status should be in reviewer_nominations
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

  function sortNominationsForParticipant(participantNominations: ReviewerNomination[], sortKey: string | null, sortDirection: "asc" | "desc" | null) {
    if (!sortKey || !sortDirection) return participantNominations;

    return [...participantNominations].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortKey === "reviewerName") {
        aValue = a.is_external
          ? a.external_reviewer?.email || ""
          : a.reviewer
          ? `${a.reviewer.name || ""} ${a.reviewer.surname || ""}`.trim() || a.reviewer.email || ""
          : "";
        bValue = b.is_external
          ? b.external_reviewer?.email || ""
          : b.reviewer
          ? `${b.reviewer.name || ""} ${b.reviewer.surname || ""}`.trim() || b.reviewer.email || ""
          : "";
      } else if (sortKey === "review_status") {
        // Get review status (from external_reviewers for external, from reviewer_nominations for internal)
        aValue = a.is_external
          ? (a.external_reviewer?.review_status || a.review_status || "Not started")
          : (a.review_status || "Not started");
        bValue = b.is_external
          ? (b.external_reviewer?.review_status || b.review_status || "Not started")
          : (b.review_status || "Not started");
      } else if (sortKey === "isExternalText") {
        aValue = a.is_external ? "External" : "Internal";
        bValue = b.is_external ? "External" : "Internal";
      } else {
        aValue = (a as any)[sortKey];
        bValue = (b as any)[sortKey];
      }

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
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

  function getReviewStatusColor(status: string | null): string {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "in progress" || statusLower === "in_progress") {
      return "bg-blue-100 text-blue-800";
    } else if (statusLower === "not started" || statusLower === "not_started") {
      return "bg-gray-100 text-gray-800";
    }
    return "bg-gray-100 text-gray-800";
  }

  async function handleSendReminders() {
    try {
      // Get all participant assessment IDs for this assessment
      const participantAssessmentIds = participantAssessments
        .map((pa) => pa.id)
        .filter((id): id is string => id !== null);

      if (participantAssessmentIds.length === 0) {
        window.alert("No participants found for this assessment.");
        return;
      }

      // Fetch all pending nominations (not accepted) for this assessment
      // Get all nominations first, then filter in JavaScript for better control
      const { data: allNominations, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select("id, reviewer_id, external_reviewer_id, is_external, request_status")
        .in("participant_assessment_id", participantAssessmentIds);

      if (nominationsError) {
        console.error("Error fetching nominations:", nominationsError);
        window.alert("Error fetching nominations. Please try again.");
        return;
      }

      // Filter for pending nominations (not accepted)
      const pendingNominations = (allNominations || []).filter(
        (n: any) => !n.request_status || n.request_status.toLowerCase() !== "accepted"
      );

      if (!pendingNominations || pendingNominations.length === 0) {
        window.alert("No pending nominations found. All reviewers have accepted their requests.");
        return;
      }

      // Separate internal and external reviewers
      const internalReviewerIds = [
        ...new Set(
          pendingNominations
            .filter((n: any) => !n.is_external && n.reviewer_id)
            .map((n: any) => n.reviewer_id)
        ),
      ];
      const externalReviewerIds = [
        ...new Set(
          pendingNominations
            .filter((n: any) => n.is_external && n.external_reviewer_id)
            .map((n: any) => n.external_reviewer_id)
        ),
      ];

      // Fetch internal reviewers
      let internalReviewers: any[] = [];
      if (internalReviewerIds.length > 0) {
        const { data: clientUsers, error: usersError } = await supabase
          .from("client_users")
          .select("id, name, surname, email")
          .in("id", internalReviewerIds);

        if (!usersError && clientUsers) {
          internalReviewers = clientUsers;
        }
      }

      // Fetch external reviewers
      let externalReviewers: any[] = [];
      if (externalReviewerIds.length > 0) {
        const { data: externalReviewersData, error: externalError } = await supabase
          .from("external_reviewers")
          .select("id, email, name")
          .in("id", externalReviewerIds);

        if (!externalError && externalReviewersData) {
          externalReviewers = externalReviewersData;
        }
      }

      // Format user list
      const userList: string[] = [];

      // Add internal reviewers
      internalReviewers.forEach((user) => {
        const name = `${user.name || ""} ${user.surname || ""}`.trim() || user.email;
        userList.push(name);
      });

      // Add external reviewers
      externalReviewers.forEach((reviewer) => {
        const name = reviewer.name || reviewer.email;
        userList.push(name);
      });

      if (userList.length === 0) {
        window.alert("No reviewers found for pending nominations.");
        return;
      }

      // Display alert with user list
      const userListString = userList.join(", ");
      window.alert(`Reminder email successfully sent to ${userListString}`);
    } catch (err) {
      console.error("Error sending reminders:", err);
      window.alert("An error occurred while sending reminders. Please try again.");
    }
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
  
  // Calculate stats
  const totalParticipants = participantAssessments.length;
  const completedParticipants = participantAssessments.filter(
    (pa) => pa.status?.toLowerCase() === "completed"
  ).length;
  const participantsCompletedPercent = totalParticipants > 0 
    ? Math.round((completedParticipants / totalParticipants) * 100) 
    : 0;

  // Calculate reviews completed percentage
  // For each participant, check if all their accepted reviewers have completed reviews
  let participantsWithAllReviewsCompleted = 0;
  let participantsWithAcceptedReviews = 0;

  participantAssessments.forEach((pa) => {
    if (!pa.id) return;
    
    const participantNominations = getNominationsForParticipant(pa.id);
    const acceptedNominations = participantNominations.filter(
      (n) => n.request_status?.toLowerCase() === "accepted"
    );

    if (acceptedNominations.length > 0) {
      participantsWithAcceptedReviews++;
      
      // Check if all accepted reviewers have completed their reviews
      const allCompleted = acceptedNominations.every((nomination) => {
        const reviewStatus = nomination.is_external
          ? (nomination.external_reviewer?.review_status || nomination.review_status)
          : nomination.review_status;
        return reviewStatus?.toLowerCase() === "completed";
      });

      if (allCompleted) {
        participantsWithAllReviewsCompleted++;
      }
    }
  });

  const reviewsCompletedPercent = participantsWithAcceptedReviews > 0
    ? Math.round((participantsWithAllReviewsCompleted / participantsWithAcceptedReviews) * 100)
    : 0;

  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "not started" || statusLower === "not_started") {
      return "bg-gray-100 text-gray-800";
    } else if (statusLower === "in progress" || statusLower === "in_progress" || statusLower === "active") {
      return "bg-blue-100 text-blue-800";
    } else if (statusLower === "completed" || statusLower === "done" || statusLower === "submitted") {
      return "bg-green-100 text-green-800";
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

      {/* Header with Meta and Actions */}
      <div className="border-b border-gray-200 pb-4">
        <div className="sm:flex sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">{assessmentName}</h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSendReminders}>
                    <Mail className="mr-2 h-4 w-4" />
                    Send reminder email
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Assessment participants for {cohortName}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              {/* Date Range */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {assessment.start_date && assessment.end_date ? (
                    <>
                      {new Date(assessment.start_date).toLocaleDateString()} - {new Date(assessment.end_date).toLocaleDateString()}
                    </>
                  ) : assessment.start_date ? (
                    <>
                      {new Date(assessment.start_date).toLocaleDateString()} - Not set
                    </>
                  ) : assessment.end_date ? (
                    <>
                      Not set - {new Date(assessment.end_date).toLocaleDateString()}
                    </>
                  ) : (
                    "Not set"
                  )}
                </span>
              </div>
              
              {/* Participants Count */}
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>{participantAssessments.length} {participantAssessments.length === 1 ? 'participant' : 'participants'}</span>
              </div>
              
              {/* Status */}
              {assessment.status && (
                <div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(assessment.status)}`}>
                    {assessment.status}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          {/* Participants Completed % */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Participants Completed</p>
                <p className="mt-2 text-3xl font-semibold text-primary">
                  {participantsCompletedPercent}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {completedParticipants} of {totalParticipants} participants
                </p>
              </div>
            </div>
          </div>

          {/* Reviews Completed % */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reviews Completed</p>
                <p className="mt-2 text-3xl font-semibold text-primary">
                  {reviewsCompletedPercent}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {participantsWithAllReviewsCompleted} of {participantsWithAcceptedReviews} participants
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Participants List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Participants</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search participants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
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
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-2">
                      Name
                      {sortConfig.key === "name" && (
                        sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort("surname")}
                  >
                    <div className="flex items-center gap-2">
                      Surname
                      {sortConfig.key === "surname" && (
                        sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort("email")}
                  >
                    <div className="flex items-center gap-2">
                      Email
                      {sortConfig.key === "email" && (
                        sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none w-[140px]"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-2">
                      Status
                      {sortConfig.key === "status" && (
                        sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none w-[200px]"
                    onClick={() => handleSort("progressPercentage")}
                  >
                    <div className="flex items-center gap-2">
                      Progress
                      {sortConfig.key === "progressPercentage" && (
                        sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Nominations Accepted</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Reviews Completed</th>
                </tr>
              </thead>
              <tbody>
                {sortedParticipantAssessments.map((pa) => {
                  const clientUser = (pa.participant as any)?.client_user as any;
                  const participantNominations = getNominationsForParticipant(pa.id);
                  const isExpanded = pa.id ? expandedRows.has(pa.id) : false;
                  const nominationsCount = participantNominations.length;
                  const acceptedCount = participantNominations.filter((n) => n.request_status?.toLowerCase() === "accepted").length;
                  
                  // Count completed reviews (only for accepted nominations)
                  const acceptedNominations = participantNominations.filter((n) => n.request_status?.toLowerCase() === "accepted");
                  const completedCount = acceptedNominations.filter((n) => {
                    const reviewStatus = n.is_external 
                      ? (n.external_reviewer?.review_status || n.review_status)
                      : n.review_status;
                    return reviewStatus?.toLowerCase() === "completed";
                  }).length;
                  
                  // Get sort state for this participant
                  const participantId = pa.id || `pa-${pa.participant_id}`;
                  const sortState = nominationSortStates.get(participantId) || { key: null, direction: null };
                  
                  const sortedParticipantNominations = sortNominationsForParticipant(
                    participantNominations,
                    sortState.key,
                    sortState.direction
                  );

                  const handleNominationSort = (key: string) => {
                    const newMap = new Map(nominationSortStates);
                    const currentState = newMap.get(participantId) || { key: null, direction: null };
                    
                    if (currentState.key === key && currentState.direction === "asc") {
                      newMap.set(participantId, { key, direction: "desc" });
                    } else if (currentState.key === key && currentState.direction === "desc") {
                      newMap.set(participantId, { key: null, direction: null });
                    } else {
                      newMap.set(participantId, { key, direction: "asc" });
                    }
                    
                    setNominationSortStates(newMap);
                  };

                  const rowKey = pa.id || `pa-${pa.participant_id}`;
                  
                  const handleRowClick = async (e: React.MouseEvent) => {
                    // Prevent navigation if clicking on the chevron (which expands/collapses)
                    const target = e.target as HTMLElement;
                    if (target.closest('svg') || target.closest('[role="button"]')) {
                      return;
                    }

                    let participantAssessmentId = pa.id;
                    
                    // If participant_assessment doesn't exist, create it first
                    if (!participantAssessmentId && pa.participant_id) {
                      try {
                        console.log("Creating participant assessment for participant_id:", pa.participant_id);
                        const { data: newPA, error: createError } = await supabase
                          .from("participant_assessments")
                          .insert({
                            participant_id: pa.participant_id,
                            cohort_assessment_id: assessmentId,
                            status: "Not started",
                          })
                          .select()
                          .single();

                        if (createError) {
                          console.error("Error creating participant assessment:", createError);
                          alert(`Error: ${createError.message}`);
                          return;
                        }

                        participantAssessmentId = newPA.id;
                        console.log("Created participant assessment with ID:", participantAssessmentId);
                        // Update local state to reflect the new assessment
                        setParticipantAssessments((prev) =>
                          prev.map((p) =>
                            p.participant_id === pa.participant_id
                              ? { ...p, id: participantAssessmentId }
                              : p
                          )
                        );
                      } catch (err) {
                        console.error("Error creating participant assessment:", err);
                        alert(`Error: ${err instanceof Error ? err.message : "Failed to create participant assessment"}`);
                        return;
                      }
                    }

                    if (participantAssessmentId) {
                      console.log("Navigating to participant detail page:", participantAssessmentId);
                      router.push(`/cohorts/${cohortId}/assessments/${assessmentId}/participants/${participantAssessmentId}`);
                    } else {
                      console.warn("No participant assessment ID available for navigation");
                    }
                  };

                  return (
                    <Fragment key={rowKey}>
                      <tr 
                        className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={handleRowClick}
                      >
                        <td 
                          className="px-6 py-4 text-sm cursor-pointer"
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
                        <td className="px-6 py-4 text-sm font-medium cursor-pointer">
                          {clientUser?.name || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium cursor-pointer">
                          {clientUser?.surname || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm cursor-pointer">
                          {clientUser?.email || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm cursor-pointer">
                          {pa.status ? (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(pa.status)}`}>
                              {pa.status}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm cursor-pointer">
                          {pa.id ? (() => {
                            const progress = participantProgress.get(pa.id) || { answered: 0, total: 0, percentage: 0 };
                            return (
                              <div className="flex items-center gap-3 min-w-[120px]">
                                <div className="flex-1 min-w-[80px]">
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary transition-all duration-300 rounded-full"
                                      style={{ width: `${progress.percentage}%` }}
                                    />
                                  </div>
                                </div>
                                <span className="text-sm font-medium whitespace-nowrap">
                                  {progress.percentage}%
                                </span>
                              </div>
                            );
                          })() : (
                            "-"
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm cursor-pointer">
                          {nominationsCount > 0 ? (
                            <span className="text-sm font-medium">
                              {acceptedCount}/{nominationsCount}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm cursor-pointer">
                          {acceptedCount > 0 ? (
                            <span className="text-sm font-medium">
                              {completedCount}/{acceptedCount}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                      {isExpanded && pa.id && nominationsCount > 0 && (
                        <tr key={`nominations-${pa.id}`}>
                          <td colSpan={8} className="px-0 py-4 bg-muted/30">
                            <div className="px-6">
                              <h4 className="text-sm font-semibold mb-3">Nominations</h4>
                              <div className="w-full overflow-x-auto">
                                <table className="w-full border rounded-md">
                                <thead>
                                  <tr className="bg-muted/50 border-b">
                                    <th 
                                      className="px-4 py-2 text-left text-xs font-medium cursor-pointer hover:bg-muted/70 select-none"
                                      onClick={() => handleNominationSort("isExternalText")}
                                    >
                                      <div className="flex items-center gap-1">
                                        Type
                                        {sortState.key === "isExternalText" && (
                                          sortState.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-4 py-2 text-left text-xs font-medium cursor-pointer hover:bg-muted/70 select-none"
                                      onClick={() => handleNominationSort("reviewerName")}
                                    >
                                      <div className="flex items-center gap-1">
                                        Reviewer
                                        {sortState.key === "reviewerName" && (
                                          sortState.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-4 py-2 text-left text-xs font-medium cursor-pointer hover:bg-muted/70 select-none"
                                      onClick={() => handleNominationSort("request_status")}
                                    >
                                      <div className="flex items-center gap-1">
                                        Status
                                        {sortState.key === "request_status" && (
                                          sortState.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-4 py-2 text-left text-xs font-medium cursor-pointer hover:bg-muted/70 select-none"
                                      onClick={() => handleNominationSort("created_at")}
                                    >
                                      <div className="flex items-center gap-1">
                                        Requested
                                        {sortState.key === "created_at" && (
                                          sortState.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-4 py-2 text-left text-xs font-medium cursor-pointer hover:bg-muted/70 select-none w-[120px]"
                                      onClick={() => handleNominationSort("review_status")}
                                    >
                                      <div className="flex items-center gap-1">
                                        Review Status
                                        {sortState.key === "review_status" && (
                                          sortState.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-4 py-2 text-left text-xs font-medium cursor-pointer hover:bg-muted/70 select-none w-[150px]"
                                    >
                                      Review Progress
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedParticipantNominations.map((nomination) => {
                                    const reviewerName = nomination.is_external
                                      ? nomination.external_reviewer?.email || "-"
                                      : nomination.reviewer
                                      ? `${nomination.reviewer.name || ""} ${nomination.reviewer.surname || ""}`.trim() || nomination.reviewer.email
                                      : "-";
                                    
                                    // Get review status (from external_reviewers for external, from reviewer_nominations for internal)
                                    const reviewStatus = nomination.is_external
                                      ? (nomination.external_reviewer?.review_status || nomination.review_status)
                                      : nomination.review_status;

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
                                        <td className="px-4 py-2 text-xs">
                                          {nomination.created_at
                                            ? new Date(nomination.created_at).toLocaleDateString()
                                            : "-"}
                                        </td>
                                        <td className="px-4 py-2 text-xs">
                                          {reviewStatus ? (
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getReviewStatusColor(reviewStatus)}`}>
                                              {reviewStatus}
                                            </span>
                                          ) : (
                                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                              Not started
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-xs">
                                          {(() => {
                                            const progress = reviewerProgress.get(nomination.id) || { answered: 0, total: 0, percentage: 0 };
                                            return (
                                              <div className="flex items-center gap-2 min-w-[120px]">
                                                <div className="flex-1 min-w-[60px]">
                                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                      className="h-full bg-primary transition-all duration-300 rounded-full"
                                                      style={{ width: `${progress.percentage}%` }}
                                                    />
                                                  </div>
                                                </div>
                                                <span className="text-xs font-medium whitespace-nowrap">
                                                  {progress.percentage}%
                                                </span>
                                              </div>
                                            );
                                          })()}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

