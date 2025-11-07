"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToastContainer, useToast } from "@/components/ui/toast";
import { Stepper, StepperStep } from "@/components/ui/stepper";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { inviteExternalReviewer } from "@/lib/externalNominationsValidation";
import { cn } from "@/lib/utils";

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
  cohort_assessment_id?: string | null;
  reviewer_id: string | null;
  external_reviewer_id: string | null;
  is_external: boolean | null;
  nominated_by_id: string;
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
}

interface ClientUser {
  id: string;
  name: string | null;
  surname: string | null;
  email: string;
  client_id: string;
}

export default function TenantAssessmentV2Page() {
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
  const [newReviewerEmail, setNewReviewerEmail] = useState<string>("");
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [emailValidationMessage, setEmailValidationMessage] = useState<string>("");
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [submittingNominations, setSubmittingNominations] = useState(false);
  const [deletingNomination, setDeletingNomination] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"internal" | "external">("internal");
  const [viewTab, setViewTab] = useState<"vertical" | "horizontal">("vertical");
  const [startingAssessment, setStartingAssessment] = useState(false);
  const [completingAssessment, setCompletingAssessment] = useState(false);
  const [resettingAssessment, setResettingAssessment] = useState(false);
  const [nominationSearch, setNominationSearch] = useState("");
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

      let { data, error: dbError } = await supabase
        .from("cohort_assessments")
        .select(`
          *,
          assessment_type:assessment_types(id, name, description),
          cohort:cohorts(id, name)
        `)
        .eq("id", assessmentId)
        .single();

      if (dbError && (dbError.message?.includes("relationship") || dbError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately:", dbError.message);
        
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

        let assessmentType = null;
        if (assessmentData.assessment_type_id) {
          const { data: typeData } = await supabase
            .from("assessment_types")
            .select("*")
            .eq("id", assessmentData.assessment_type_id)
            .single();
          assessmentType = typeData;
        }

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
      const { data: participants, error: participantsError } = await supabase
        .from("cohort_participants")
        .select("id")
        .eq("client_user_id", userId);

      if (participantsError || !participants || participants.length === 0) {
        console.warn("No participants found for this user");
        setParticipantAssessment(null);
        setNominations([]);
        return;
      }

      const participantIds = participants.map((p: any) => p.id);

      const { data: participantAssessmentData, error: paError } = await supabase
        .from("participant_assessments")
        .select("*")
        .eq("cohort_assessment_id", assessmentId)
        .in("participant_id", participantIds)
        .limit(1);

      if (paError) {
        console.error("Error fetching participant assessment:", paError);
        setParticipantAssessment(null);
        setNominations([]);
        return;
      }

      const pa = participantAssessmentData && participantAssessmentData.length > 0 
        ? participantAssessmentData[0] 
        : null;

      setParticipantAssessment(pa as ParticipantAssessment | null);
      
      if (pa?.id) {
        fetchNominations(pa.id, userId);
      } else {
        const { data: allPAs } = await supabase
          .from("participant_assessments")
          .select("id")
          .eq("cohort_assessment_id", assessmentId)
          .in("participant_id", participantIds)
          .limit(1);
        
        if (allPAs && allPAs.length > 0 && allPAs[0]?.id) {
          fetchNominations(allPAs[0].id, userId);
        } else {
          setNominations([]);
        }
      }
    } catch (err) {
      console.error("Error fetching participant assessment:", err);
      setParticipantAssessment(null);
      setNominations([]);
    }
  }

  async function fetchNominations(participantAssessmentId: string, userId: string) {
    try {
      const { data: nominationsData, error: nominationsError } = await supabase
        .from("reviewer_nominations")
        .select("*")
        .eq("participant_assessment_id", participantAssessmentId)
        .eq("nominated_by_id", userId)
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

      const internalNominations = nominationsData.filter((n: any) => !n.is_external && n.reviewer_id);
      const externalNominations = nominationsData.filter((n: any) => n.is_external && n.external_reviewer_id);

      const reviewerIds = [...new Set(internalNominations.map((n: any) => n.reviewer_id).filter(Boolean))];
      let clientUsers: any[] = [];
      
      if (reviewerIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from("client_users")
          .select("id, name, surname, email")
          .in("id", reviewerIds);

        if (!usersError && users) {
          clientUsers = users;
        }
      }

      const externalReviewerIds = [...new Set(externalNominations.map((n: any) => n.external_reviewer_id).filter(Boolean))];
      let externalReviewers: any[] = [];
      
      if (externalReviewerIds.length > 0) {
        const { data: externals, error: externalsError } = await supabase
          .from("external_reviewers")
          .select("id, email, review_status")
          .in("id", externalReviewerIds);

        if (!externalsError && externals) {
          externalReviewers = externals;
        }
      }

      const mergedNominations = nominationsData.map((nomination: any) => {
        if (nomination.is_external && nomination.external_reviewer_id) {
          const externalReviewer = externalReviewers.find((e: any) => e.id === nomination.external_reviewer_id);
          return {
            ...nomination,
            reviewer: null,
            external_reviewer: externalReviewer || null,
            review_status: externalReviewer?.review_status || nomination.review_status || null,
          };
        } else {
          return {
            ...nomination,
            reviewer: clientUsers.find((u: any) => u.id === nomination.reviewer_id) || null,
            external_reviewer: null,
            review_status: nomination.review_status || null,
          };
        }
      });

      setNominations(mergedNominations as ReviewerNomination[]);
    } catch (err) {
      console.error("Error fetching nominations:", err);
      setNominations([]);
    }
  }

  async function fetchClientRoster(clientId: string, currentUserId: string) {
    try {
      setLoadingRoster(true);
      
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
    
    const clientId = (user as any).client_id;
    if (!clientId) {
      console.error("User client_id not found:", user);
      alert("Unable to load client roster. Please try logging out and back in.");
      return;
    }
    
    fetchClientRoster(clientId, user.id);
    setIsNominationModalOpen(true);
    setSelectedReviewers([]);
    setNewReviewerEmail("");
    setEmailValid(null);
    setEmailValidationMessage("");
  }

  function handleToggleReviewer(reviewerId: string) {
    setSelectedReviewers((prev) => {
      if (prev.includes(reviewerId)) {
        return prev.filter((id) => id !== reviewerId);
      } else {
        const activeNominationsCount = nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length;
        const maxNewSelections = 10 - activeNominationsCount;
        if (prev.length >= maxNewSelections) {
          showToast(`You can only select up to ${maxNewSelections} more reviewer(s). You already have ${activeNominationsCount} active nomination(s).`, "info");
          return prev;
        }
        return [...prev, reviewerId];
      }
    });
  }

  function validateEmail(email: string): { valid: boolean; message: string } {
    if (!email || !email.trim()) {
      return { valid: false, message: "" };
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return { valid: false, message: "Please enter a valid email address format" };
    }

    const domain = trimmedEmail.split("@")[1];
    const allowedDomain = `${subdomain}.com`;

    if (!domain || !domain.endsWith(allowedDomain)) {
      return { 
        valid: false, 
        message: `Email must be from ${allowedDomain} domain` 
      };
    }

    if (selectedReviewers.includes(trimmedEmail)) {
      return { 
        valid: false, 
        message: "This email has already been added" 
      };
    }

    const activeNominationsCount = nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length;
    const maxNewSelections = 10 - activeNominationsCount;
    if (selectedReviewers.length >= maxNewSelections) {
      return { 
        valid: false, 
        message: `You can only select up to ${maxNewSelections} more reviewer(s)` 
      };
    }

    return { valid: true, message: `✓ Valid email from ${allowedDomain}` };
  }

  function handleEmailInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNewReviewerEmail(value);

    if (!value || !value.trim()) {
      setEmailValid(null);
      setEmailValidationMessage("");
      return;
    }

    const validation = validateEmail(value);
    setEmailValid(validation.valid);
    setEmailValidationMessage(validation.message);
  }

  function addReviewer(email: string) {
    if (!email || !email.trim()) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    const validation = validateEmail(email);
    if (!validation.valid) {
      showToast(validation.message || "Please enter a valid email address.", "error");
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    setSelectedReviewers((prev) => [...prev, trimmedEmail]);
    setNewReviewerEmail("");
    setEmailValid(null);
    setEmailValidationMessage("");
    showToast("External reviewer added.", "success");
  }

  async function handleSubmitNominations() {
    if (!user || selectedReviewers.length === 0) {
      showToast("Please select at least one reviewer.", "error");
      return;
    }

    try {
      setSubmittingNominations(true);

      const clientId = (user as any).client_id;
      
      if (!clientId) {
        showToast("Unable to determine client. Please try again.", "error");
        setSubmittingNominations(false);
        return;
      }

      let participantAssessmentId = participantAssessment?.id;
      
      if (!participantAssessmentId) {
        const { data: participants, error: participantsError } = await supabase
          .from("cohort_participants")
          .select("id")
          .eq("client_user_id", user.id);

        if (participantsError || !participants || participants.length === 0) {
          showToast("Error: Participant not found.", "error");
          setSubmittingNominations(false);
          return;
        }

        const participantIds = participants.map((p: any) => p.id);

        const { data: newPA, error: createError } = await supabase
          .from("participant_assessments")
          .insert({
            participant_id: participantIds[0],
            cohort_assessment_id: assessmentId,
            status: participantAssessment?.status || "Not started",
            allow_reviewer_nominations: true,
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating participant assessment:", createError);
          showToast(`Error: ${createError.message}`, "error");
          setSubmittingNominations(false);
          return;
        }

        participantAssessmentId = newPA.id;
        setParticipantAssessment(newPA as ParticipantAssessment);
      }

      const { data: existingNominations, error: checkError } = await supabase
        .from("reviewer_nominations")
        .select("reviewer_id, external_reviewer_id, request_status")
        .eq("participant_assessment_id", participantAssessmentId)
        .eq("nominated_by_id", user.id)
        .or("request_status.eq.pending,request_status.eq.accepted");

      if (checkError) {
        console.error("Error checking existing nominations:", checkError);
        showToast("Error checking existing nominations. Please try again.", "error");
        setSubmittingNominations(false);
        return;
      }

      const existingReviewerIds = new Set(existingNominations?.map((n: any) => n.reviewer_id).filter(Boolean) || []);
      const existingExternalIds = new Set(existingNominations?.map((n: any) => n.external_reviewer_id).filter(Boolean) || []);

      const internalReviewers = selectedReviewers.filter((item) => !item.includes("@"));
      const externalReviewers = selectedReviewers.filter((item) => item.includes("@"));

      const newInternalReviewers = internalReviewers.filter((id) => !existingReviewerIds.has(id));

      const nominationPayload = [];

      for (const reviewerId of newInternalReviewers) {
        nominationPayload.push({
          participant_assessment_id: participantAssessmentId,
          reviewer_id: reviewerId,
          nominated_by_id: user.id,
          is_external: false,
          request_status: "pending",
        });
      }

      const externalErrors: string[] = [];
      for (const email of externalReviewers) {
        try {
          const { data: existingExternal, error: externalCheckError } = await supabase
            .from("external_reviewers")
            .select("id")
            .eq("email", email)
            .eq("client_id", clientId)
            .maybeSingle();

          if (externalCheckError) {
            console.error("Error checking external reviewer:", externalCheckError);
            externalErrors.push(`${email}: ${externalCheckError.message}`);
            continue;
          }

          if (existingExternal && existingExternalIds.has(existingExternal.id)) {
            continue;
          }

          let external;
          try {
            external = await inviteExternalReviewer({
              email,
              subdomain,
              clientId,
              participantId: user.id,
            });
          } catch (inviteError: any) {
            console.error(`Error inviting external reviewer ${email}:`, inviteError);
            externalErrors.push(`${email}: ${inviteError.message || "Failed to invite reviewer"}`);
            continue;
          }

          if (!external || !external.id) {
            console.error(`Failed to get external reviewer ID for ${email}`);
            externalErrors.push(`${email}: Failed to create reviewer record`);
            continue;
          }

          nominationPayload.push({
            participant_assessment_id: participantAssessmentId,
            reviewer_id: user.id,
            is_external: true,
            external_reviewer_id: external.id,
            nominated_by_id: user.id,
            request_status: "pending",
          });
        } catch (err: any) {
          console.error(`Error processing external reviewer ${email}:`, err);
          externalErrors.push(`${email}: ${err.message || "Unknown error"}`);
        }
      }

      if (externalErrors.length > 0) {
        console.error("External reviewer errors:", externalErrors);
        showToast(`Some external reviewers could not be added: ${externalErrors.join(", ")}`, "info");
      }

      if (nominationPayload.length === 0) {
        if (externalErrors.length > 0) {
          showToast("No nominations could be created. Please check the errors above.", "error");
        } else {
          showToast("All selected reviewers have already been nominated or have pending/accepted nominations.", "info");
        }
        setSubmittingNominations(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("reviewer_nominations")
        .insert(nominationPayload);

      if (insertError) {
        console.error("Error creating nominations:", insertError);
        showToast(`Error creating nominations: ${insertError.message || "Please try again"}`, "error");
        setSubmittingNominations(false);
        return;
      }

      if (participantAssessmentId) {
        await fetchNominations(participantAssessmentId, user.id);
        await fetchParticipantAssessment(user.id);
      }
      
      window.dispatchEvent(new CustomEvent('notification-update'));
      
      setIsNominationModalOpen(false);
      setSelectedReviewers([]);
      
      showToast(
        `Successfully requested ${nominationPayload.length} nomination${nominationPayload.length > 1 ? "s" : ""}.`,
        "success"
      );
    } catch (err: any) {
      console.error("Error submitting nominations:", err);
      showToast(err.message || "An unexpected error occurred. Please try again.", "error");
    } finally {
      setSubmittingNominations(false);
    }
  }

  async function handleDeleteNomination(nominationId: string) {
    if (!participantAssessment || !user) return;

    try {
      setDeletingNomination(nominationId);

      const { error: deleteError } = await supabase
        .from("reviewer_nominations")
        .delete()
        .eq("id", nominationId)
        .eq("nominated_by_id", user.id);

      if (deleteError) {
        console.error("Error deleting nomination:", deleteError);
        showToast("Error deleting nomination. Please try again.", "error");
        return;
      }

      if (participantAssessment?.id) {
        await fetchNominations(participantAssessment.id, user.id);
      }

      showToast("Nomination request removed successfully.", "success");
    } catch (err) {
      console.error("Error deleting nomination:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setDeletingNomination(null);
    }
  }

  async function handleStartAssessment() {
    if (!user?.id) {
      showToast("User not found. Please log in again.", "error");
      return;
    }

    setStartingAssessment(true);
    try {
      const { data: participants, error: participantsError } = await supabase
        .from("cohort_participants")
        .select("id")
        .eq("client_user_id", user.id);

      if (participantsError || !participants || participants.length === 0) {
        showToast("Error: Participant not found.", "error");
        setStartingAssessment(false);
        return;
      }

      const participantIds = participants.map((p: any) => p.id);

      let participantAssessmentId = participantAssessment?.id;

      if (!participantAssessmentId) {
        const { data: newPA, error: createError } = await supabase
          .from("participant_assessments")
          .insert({
            participant_id: participantIds[0],
            cohort_assessment_id: assessmentId,
            status: "In Progress",
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating participant assessment:", createError);
          showToast(`Error: ${createError.message}`, "error");
          setStartingAssessment(false);
          return;
        }

        participantAssessmentId = newPA.id;
        setParticipantAssessment(newPA as ParticipantAssessment);
      } else {
        const { error: updateError } = await supabase
          .from("participant_assessments")
          .update({ status: "In Progress" })
          .eq("id", participantAssessmentId);

        if (updateError) {
          console.error("Error updating participant assessment:", updateError);
          showToast(`Error: ${updateError.message}`, "error");
          setStartingAssessment(false);
          return;
        }

        setParticipantAssessment((prev) => 
          prev ? { ...prev, status: "In Progress" } : null
        );
      }

      showToast("Assessment started successfully!", "success");
    } catch (err) {
      console.error("Error starting assessment:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setStartingAssessment(false);
    }
  }

  async function handleCompleteAssessment() {
    if (!user?.id || !participantAssessment?.id) {
      showToast("Assessment not found. Please try again.", "error");
      return;
    }

    setCompletingAssessment(true);
    try {
      const { error: updateError } = await supabase
        .from("participant_assessments")
        .update({ status: "Completed" })
        .eq("id", participantAssessment.id);

      if (updateError) {
        console.error("Error completing assessment:", updateError);
        showToast(`Error: ${updateError.message}`, "error");
        setCompletingAssessment(false);
        return;
      }

      setParticipantAssessment((prev) => 
        prev ? { ...prev, status: "Completed" } : null
      );

      showToast("Assessment completed successfully!", "success");
    } catch (err) {
      console.error("Error completing assessment:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setCompletingAssessment(false);
    }
  }

  async function handleResetAssessment() {
    if (!user?.id || !participantAssessment?.id) {
      showToast("Assessment not found. Please try again.", "error");
      return;
    }

    setResettingAssessment(true);
    try {
      const { error: updateError } = await supabase
        .from("participant_assessments")
        .update({ status: "Not started" })
        .eq("id", participantAssessment.id);

      if (updateError) {
        console.error("Error resetting assessment:", updateError);
        showToast(`Error: ${updateError.message}`, "error");
        setResettingAssessment(false);
        return;
      }

      setParticipantAssessment((prev) => 
        prev ? { ...prev, status: "Not started" } : null
      );

      showToast("Assessment reset to not started.", "success");
    } catch (err) {
      console.error("Error resetting assessment:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setResettingAssessment(false);
    }
  }

  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed" || statusLower === "submitted") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "in progress" || statusLower === "in_progress" || statusLower === "pending") {
      return "bg-blue-100 text-blue-800";
    } else if (statusLower === "not started" || statusLower === "not_started") {
      return "bg-gray-100 text-gray-800";
    }
    return "bg-gray-100 text-gray-800";
  };

  const getReviewStatusColor = (status: string | null) => {
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
            { label: "Dashboard", href: `/tenant/${subdomain}/dashboard` },
            { label: "Assessment" },
          ]}
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">{error || "Assessment not found"}</p>
            <Button
              variant="outline"
              onClick={() => router.push(`/tenant/${subdomain}/dashboard`)}
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

  // Determine step states
  const assessmentStatus = participantAssessment?.status || "Not started";
  const isStep1Completed = assessmentStatus === "In Progress" || assessmentStatus === "Completed";
  const isStep1Active = assessmentStatus === "Not started" || !assessmentStatus;
  const isStep2Active = isStep1Completed;
  const isStep2Completed = nominations.length > 0;
  const isStep3Active = assessmentStatus === "Completed" && isStep2Completed;
  const isStep3Completed = nominations.some(n => n.request_status === "accepted" && (n.review_status === "completed" || n.review_status === "Completed"));
  const isStep4Active = isStep3Completed;

  // Build stepper steps
  const steps: StepperStep[] = [
    {
      title: "Complete Your Assessment",
      description: "Start and complete your self-assessment questionnaire.",
      status: isStep1Completed ? "completed" : isStep1Active ? "active" : "pending",
      content: (
        <div className="mt-4">
          {(!participantAssessment || assessmentStatus === "Not started" || !assessmentStatus) && (
            <Button
              onClick={handleStartAssessment}
              disabled={!user?.id || startingAssessment}
            >
              {startingAssessment ? "Starting..." : "Start Assessment"}
            </Button>
          )}
          {assessmentStatus === "In Progress" && (
            <Button
              onClick={handleCompleteAssessment}
              disabled={!user?.id || completingAssessment}
            >
              {completingAssessment ? "Completing..." : "Complete Assessment"}
            </Button>
          )}
          {assessmentStatus === "Completed" && (
            <Button
              onClick={handleResetAssessment}
              disabled={!user?.id || resettingAssessment}
              variant="secondary"
            >
              {resettingAssessment ? "Resetting..." : "Not started yet"}
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "Review Nominations",
      description: "Request nominations from reviewers to provide feedback on your assessment.",
      status: isStep2Completed ? "completed" : isStep2Active ? "active" : "pending",
      content: (
        <div className="mt-4">
          <Button
            onClick={handleOpenNominationModal}
            disabled={
              (!participantAssessment?.id && !assessment) || 
              nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length >= 10
            }
          >
            Request Nominations
          </Button>
          {nominations.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              {nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length} active nomination(s)
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Review Process",
      description: "Track the progress of your nominated reviewers as they complete their reviews.",
      status: isStep3Completed ? "completed" : isStep3Active ? "active" : "pending",
      content: (
        <div className="mt-4">
          {nominations.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {nominations.filter(n => n.request_status === "accepted").length} accepted nomination(s)
              </p>
              <p className="text-sm text-muted-foreground">
                {nominations.filter(n => n.request_status === "accepted" && (n.review_status === "completed" || n.review_status === "Completed")).length} completed review(s)
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Complete nominations in Step 2 to begin the review process.
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Review Report",
      description: "View your assessment report and set your commitment based on the feedback received.",
      status: isStep4Active ? "active" : "pending",
      content: (
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              // Placeholder for View Report functionality
              showToast("View Report functionality coming soon.", "info");
            }}
          >
            View Report
          </Button>
          <Button
            onClick={() => {
              // Placeholder for Set commitment functionality
              showToast("Set commitment functionality coming soon.", "info");
            }}
          >
            Set commitment
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/tenant/${subdomain}/dashboard` },
          { label: cohortName, href: assessment.cohort_id ? `/tenant/${subdomain}/cohort/${assessment.cohort_id}` : undefined },
          { label: assessmentName },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => {
        if (assessment.cohort_id) {
          router.push(`/tenant/${subdomain}/cohort/${assessment.cohort_id}`);
        } else {
          router.push(`/tenant/${subdomain}/dashboard`);
        }
      }} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {assessment.cohort_id ? "Back to Cohort" : "Back to Dashboard"}
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{assessmentName}</h1>
        <p className="text-muted-foreground mt-2">
          {cohortName}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={viewTab} onValueChange={(value) => setViewTab(value as "vertical" | "horizontal")}>
        <TabsList>
          <TabsTrigger value="vertical">Vertical</TabsTrigger>
          <TabsTrigger value="horizontal">Horizontal</TabsTrigger>
        </TabsList>

        {/* Assessment Info Panel */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Assessment Information</CardTitle>
          </CardHeader>
          <CardContent>
            <TabsContent value="vertical">
              <Stepper steps={steps} />
            </TabsContent>
            <TabsContent value="horizontal">
              <div className="mt-4">
                {/* Horizontal Steps */}
                <div className="flex flex-col gap-6">
                  {/* Step 1: Complete Your Assessment */}
                  <div className="border rounded-lg p-6">
                    <div className="flex gap-6">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0">
                        <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center border-2 border-primary/20">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">1</div>
                            <div className="text-xs text-muted-foreground mt-1">Step</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-2">Complete Your Assessment</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Start and complete your self-assessment questionnaire.
                        </p>
                        
                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-muted-foreground">Progress</span>
                            <span className="text-sm font-medium">
                              {assessmentStatus === "Not started" || !assessmentStatus
                                ? "0%"
                                : assessmentStatus === "In Progress"
                                ? "50%"
                                : "100%"}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full bg-primary transition-all duration-300 rounded-full",
                                {
                                  "w-0": assessmentStatus === "Not started" || !assessmentStatus,
                                  "w-1/2": assessmentStatus === "In Progress",
                                  "w-full": assessmentStatus === "Completed",
                                }
                              )}
                            />
                          </div>
                        </div>
                        
                        {/* Button */}
                        <div>
                          {(!participantAssessment || assessmentStatus === "Not started" || !assessmentStatus) && (
                            <Button
                              onClick={handleStartAssessment}
                              disabled={!user?.id || startingAssessment}
                            >
                              {startingAssessment ? "Starting..." : "Start Assessment"}
                            </Button>
                          )}
                          {assessmentStatus === "In Progress" && (
                            <Button
                              onClick={handleCompleteAssessment}
                              disabled={!user?.id || completingAssessment}
                            >
                              {completingAssessment ? "Completing..." : "Complete Assessment"}
                            </Button>
                          )}
                          {assessmentStatus === "Completed" && (
                            <Button
                              onClick={handleResetAssessment}
                              disabled={!user?.id || resettingAssessment}
                              variant="secondary"
                            >
                              {resettingAssessment ? "Resetting..." : "Not started yet"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Review Nominations */}
                  <div className="border rounded-lg p-6 opacity-60">
                    <div className="flex gap-6">
                      <div className="flex-shrink-0">
                        <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center border-2 border-muted-foreground/20">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-muted-foreground">2</div>
                            <div className="text-xs text-muted-foreground mt-1">Step</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-2 text-muted-foreground">Review Nominations</h3>
                        <p className="text-sm text-muted-foreground">
                          Coming soon...
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Review Report */}
                  <div className="border rounded-lg p-6 opacity-60">
                    <div className="flex gap-6">
                      <div className="flex-shrink-0">
                        <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center border-2 border-muted-foreground/20">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-muted-foreground">3</div>
                            <div className="text-xs text-muted-foreground mt-1">Step</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-2 text-muted-foreground">Review Report</h3>
                        <p className="text-sm text-muted-foreground">
                          Coming soon...
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      {/* Nomination Modal - Reused from original page */}
      <Dialog open={isNominationModalOpen} onOpenChange={setIsNominationModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Nomination</DialogTitle>
            <DialogDescription>
              Select up to {10 - nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length} reviewers from your client roster or add external reviewers by email. You have {nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length} active nomination(s).
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => setIsNominationModalOpen(false)} />

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder={`Add reviewer email (e.g., name@${subdomain}.com)`}
                    value={newReviewerEmail}
                    onChange={handleEmailInputChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && emailValid === true) {
                        e.preventDefault();
                        addReviewer(newReviewerEmail);
                      }
                    }}
                    className={
                      emailValid === false && newReviewerEmail
                        ? "border-red-500"
                        : emailValid === true && newReviewerEmail
                        ? "border-green-500"
                        : ""
                    }
                  />
                </div>
                <Button 
                  onClick={() => addReviewer(newReviewerEmail)}
                  disabled={emailValid !== true}
                >
                  Add
                </Button>
              </div>
              {emailValidationMessage && (
                <p
                  className={`text-xs ${
                    emailValid === true
                      ? "text-green-600"
                      : emailValid === false
                      ? "text-red-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {emailValidationMessage}
                </p>
              )}
            </div>

            {selectedReviewers.filter(email => email.includes("@")).length > 0 && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">External Reviewers Added:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedReviewers
                    .filter(email => email.includes("@"))
                    .map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-background rounded-md text-sm"
                      >
                        {email}
                        <button
                          onClick={() => {
                            setSelectedReviewers((prev) => prev.filter((e) => e !== email));
                          }}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}

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
                        const activeNominationsCount = nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length;
                        const isAlreadyNominated = nominations.some(
                          (n) => n.reviewer_id === user.id && (n.request_status === "pending" || n.request_status === "accepted")
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
                    {selectedReviewers.length} of {10 - nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length} selected
                    {selectedReviewers.filter(email => email.includes("@")).length > 0 && (
                      <span className="ml-2">
                        ({selectedReviewers.filter(email => email.includes("@")).length} external)
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsNominationModalOpen(false);
                        setNewReviewerEmail("");
                        setEmailValid(null);
                        setEmailValidationMessage("");
                      }}
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

