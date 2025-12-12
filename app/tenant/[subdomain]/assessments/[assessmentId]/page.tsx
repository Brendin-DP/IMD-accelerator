"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ToastContainer, useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabaseClient";
import { inviteExternalReviewer } from "@/lib/externalNominationsValidation";

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
  const [newReviewerEmail, setNewReviewerEmail] = useState<string>("");
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [emailValidationMessage, setEmailValidationMessage] = useState<string>("");
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [submittingNominations, setSubmittingNominations] = useState(false);
  const [deletingNomination, setDeletingNomination] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"internal" | "external">("internal");
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
        setNominations([]);
        return;
      }

      const participantIds = participants.map((p: any) => p.id);

      // Fetch the participant_assessment for this assessment and user
      // Use limit(1) instead of maybeSingle() to handle potential duplicates
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
      
      // Fetch nominations if we have a participant assessment
      if (pa?.id) {
        fetchNominations(pa.id, userId);
      } else {
        // Check if there are any nominations for this assessment that might exist
        // by checking all participant_assessments for this assessment
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
      // Fetch all nominations where this user nominated reviewers (regardless of status)
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

      // Separate internal and external nominations
      const internalNominations = nominationsData.filter((n: any) => !n.is_external && n.reviewer_id);
      const externalNominations = nominationsData.filter((n: any) => n.is_external && n.external_reviewer_id);

      // Fetch internal reviewer details
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

      // Fetch external reviewer details, including review_status
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
          };
        } else {
          // Internal reviewer - get review_status from reviewer_nominations table
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
    setNewReviewerEmail("");
    setEmailValid(null);
    setEmailValidationMessage("");
  }

  function handleToggleReviewer(reviewerId: string) {
    setSelectedReviewers((prev) => {
      if (prev.includes(reviewerId)) {
        return prev.filter((id) => id !== reviewerId);
      } else {
        // Limit to 10 total active nominations (existing active + new selections)
        // Only count active nominations (pending or accepted), not rejected ones
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

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return { valid: false, message: "Please enter a valid email address format" };
    }

    // Extract domain from email
    const domain = trimmedEmail.split("@")[1];
    const allowedDomain = `${subdomain}.com`;

    // Validate domain matches allowed domain
    if (!domain || !domain.endsWith(allowedDomain)) {
      return { 
        valid: false, 
        message: `Email must be from ${allowedDomain} domain` 
      };
    }

    // Check if email is already selected
    if (selectedReviewers.includes(trimmedEmail)) {
      return { 
        valid: false, 
        message: "This email has already been added" 
      };
    }

    // Check if we've reached the limit
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

    // Validate email in real-time
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

    // Add the email to selected reviewers
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

      // Get client info
      const clientId = (user as any).client_id;
      
      if (!clientId) {
        showToast("Unable to determine client. Please try again.", "error");
        setSubmittingNominations(false);
        return;
      }

      // If participant assessment doesn't exist, create it first
      let participantAssessmentId = participantAssessment?.id;
      
      if (!participantAssessmentId) {
        // Find the cohort_participant for this user
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

        // Create participant_assessment if it doesn't exist
        const { data: newPA, error: createError } = await supabase
          .from("participant_assessments")
          .insert({
            participant_id: participantIds[0], // Use first participant ID
            cohort_assessment_id: assessmentId,
            status: participantAssessment?.status || "Not started",
            allow_reviewer_nominations: true, // Default to true for new assessments
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

      // Check existing nominations to avoid duplicates
      // Only check for active nominations (pending or accepted), not rejected ones
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

      // Create sets of existing IDs (both internal and external)
      const existingReviewerIds = new Set(existingNominations?.map((n: any) => n.reviewer_id).filter(Boolean) || []);
      const existingExternalIds = new Set(existingNominations?.map((n: any) => n.external_reviewer_id).filter(Boolean) || []);

      // Separate internal and external reviewers
      const internalReviewers = selectedReviewers.filter((item) => !item.includes("@"));
      const externalReviewers = selectedReviewers.filter((item) => item.includes("@"));

      // Filter out already nominated internal reviewers
      const newInternalReviewers = internalReviewers.filter((id) => !existingReviewerIds.has(id));

      // Build nomination payload
      const nominationPayload = [];

      // Process internal reviewers
      for (const reviewerId of newInternalReviewers) {
        nominationPayload.push({
          participant_assessment_id: participantAssessmentId,
          reviewer_id: reviewerId,
          nominated_by_id: user.id,
          is_external: false,
          request_status: "pending",
        });
      }

      // Process external reviewers
      const externalErrors: string[] = [];
      for (const email of externalReviewers) {
        try {
          // Check if this external reviewer was already nominated
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

          // If external reviewer exists and already nominated, skip
          if (existingExternal && existingExternalIds.has(existingExternal.id)) {
            continue;
          }

          // Invite external reviewer (creates or retrieves external_reviewer record)
          // invited_by should be the client_user.id (user.id), not participant_id
          let external;
          try {
            external = await inviteExternalReviewer({
              email,
              subdomain,
              clientId,
              participantId: user.id, // Use user.id (client_users.id) instead of participant_id
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

          // For external reviewers, we need to handle reviewer_id constraint
          // Since reviewer_id has NOT NULL constraint, we'll use a workaround
          // The database schema should ideally allow reviewer_id to be nullable for external reviewers
          nominationPayload.push({
            participant_assessment_id: participantAssessmentId,
            reviewer_id: user.id, // Temporary workaround: use nominated_by_id to satisfy NOT NULL constraint
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

      // Show errors for external reviewers if any
      if (externalErrors.length > 0) {
        console.error("External reviewer errors:", externalErrors);
        // Don't stop the process, just show info message
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

      // Insert nominations
      const { error: insertError } = await supabase
        .from("reviewer_nominations")
        .insert(nominationPayload);

      if (insertError) {
        console.error("Error creating nominations:", insertError);
        console.error("Nomination payload:", JSON.stringify(nominationPayload, null, 2));
        showToast(`Error creating nominations: ${insertError.message || "Please try again"}`, "error");
        setSubmittingNominations(false);
        return;
      }

      // Refresh nominations list and participant assessment
      if (participantAssessmentId) {
        await fetchNominations(participantAssessmentId, user.id);
        // Refresh participant assessment to get updated state
        await fetchParticipantAssessment(user.id);
      }
      
      // Trigger notification count update for reviewers who received the nominations
      window.dispatchEvent(new CustomEvent('notification-update'));
      
      // Close modal and reset
      setIsNominationModalOpen(false);
      setSelectedReviewers([]);
      
      // Show success toast
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

      // Delete the nomination
      const { error: deleteError } = await supabase
        .from("reviewer_nominations")
        .delete()
        .eq("id", nominationId)
        .eq("nominated_by_id", user.id); // Ensure user can only delete their own nominations

      if (deleteError) {
        console.error("Error deleting nomination:", deleteError);
        showToast("Error deleting nomination. Please try again.", "error");
        return;
      }

      // Refresh nominations list
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
      // First, find the cohort_participant for this user
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

      // Check if participant_assessment exists
      let participantAssessmentId = participantAssessment?.id;

      if (!participantAssessmentId) {
        // Create participant_assessment if it doesn't exist
        const { data: newPA, error: createError } = await supabase
          .from("participant_assessments")
          .insert({
            participant_id: participantIds[0], // Use first participant ID
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
        // Update existing participant_assessment status
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

        // Update local state
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

      // Update local state
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

      // Update local state
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

      {/* Assessment Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Assessment Information</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/tenant/${subdomain}/assessments/${assessmentId}/v2`)}
              >
                View V2
              </Button>
            </div>
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
            <div>
              <p className="text-sm font-medium text-muted-foreground">Assessment Status</p>
              {participantAssessment?.status ? (
                <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full mt-1 ${getStatusColor(participantAssessment.status)}`}>
                  {participantAssessment.status}
                </span>
              ) : (
                <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full mt-1 ${getStatusColor("Not started")}`}>
                  Not started
                </span>
              )}
            </div>
            {assessment.assessment_type?.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Description</p>
                <p className="text-base mt-1">{assessment.assessment_type.description}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Start Date</p>
              <p className="text-base mt-1">
                {assessment.start_date ? (
                  new Date(assessment.start_date).toLocaleDateString()
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">End Date</p>
              <p className="text-base mt-1">
                {assessment.end_date ? (
                  new Date(assessment.end_date).toLocaleDateString()
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </p>
            </div>
          </div>
          {/* Assessment Action Buttons */}
          <div className="mt-6 pt-6 border-t flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {(!participantAssessment || participantAssessment.status === "Not started" || !participantAssessment.status) && (
                <Button
                  onClick={handleStartAssessment}
                  disabled={!user?.id || startingAssessment}
                  className="w-full sm:w-auto"
                >
                  {startingAssessment ? "Starting..." : "Start Assessment"}
                </Button>
              )}
              {participantAssessment?.status === "In Progress" && (
                <Button
                  onClick={handleCompleteAssessment}
                  disabled={!user?.id || completingAssessment}
                  className="w-full sm:w-auto"
                >
                  {completingAssessment ? "Completing..." : "Complete Assessment"}
                </Button>
              )}
              {participantAssessment?.status === "Completed" && (
                <Button
                  onClick={handleResetAssessment}
                  disabled={!user?.id || resettingAssessment}
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  {resettingAssessment ? "Resetting..." : "Not started yet"}
                </Button>
              )}
            </div>
            <Button
              onClick={() => router.push(`/tenant/${subdomain}/assessments/${assessmentId}/questionnaire`)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Simulate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* My Assessment Status Card - Hidden for now */}
      {false && (
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
                  {participantAssessment?.status && (
                    <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full mt-2 ${getStatusColor(participantAssessment.status!)}`}>
                      {participantAssessment.status}
                    </span>
                  )}
                  {!participantAssessment?.status && (
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
      )}

      {/* Nominate for Review Section */}
      {/* Show nominations section if participant assessment exists and allows nominations, OR if assessment exists and we should allow by default */}
      {(participantAssessment?.allow_reviewer_nominations !== false) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Nominate for Review</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Search nominations..."
                  value={nominationSearch}
                  onChange={(e) => setNominationSearch(e.target.value)}
                  className="w-64"
                />
                <Button
                  onClick={handleOpenNominationModal}
                  disabled={
                    (!participantAssessment?.id && !assessment) || 
                    nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length >= 10
                  }
                >
                  Request Nomination
                </Button>
              </div>
            </div>
            {nominations.filter(n => n.request_status === "pending" || n.request_status === "accepted").length >= 10 && (
              <p className="text-sm text-muted-foreground mt-2">
                You have reached the maximum of 10 active nominations (internal + external).
              </p>
            )}
          </CardHeader>
          <CardContent>
            {/* Tabs */}
            <div className="flex space-x-1 border-b mb-4">
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
            {activeTab === "internal" ? (
              (() => {
                let internalNominations = nominations.filter((n) => !n.is_external);
                
                // Filter by search term
                if (nominationSearch.trim()) {
                  const searchLower = nominationSearch.toLowerCase();
                  internalNominations = internalNominations.filter((nomination) => {
                    const reviewer = nomination.reviewer;
                    const reviewerName = reviewer ? `${reviewer.name || ""} ${reviewer.surname || ""}`.trim().toLowerCase() || reviewer.email.toLowerCase() : "";
                    const email = reviewer?.email?.toLowerCase() || "";
                    const status = (nomination.request_status || "").toLowerCase();
                    const reviewStatus = (nomination.review_status || "").toLowerCase();
                    return reviewerName.includes(searchLower) || 
                           email.includes(searchLower) || 
                           status.includes(searchLower) ||
                           reviewStatus.includes(searchLower);
                  });
                }
                
                return internalNominations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {nominationSearch.trim() ? "No nominations match your search." : "No internal nominations requested yet."}
                  </p>
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
                          <th className="px-6 py-3 text-left text-sm font-medium">Review Progress</th>
                          <th className="px-6 py-3 text-left text-sm font-medium w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {internalNominations.map((nomination) => {
                          const reviewer = nomination.reviewer;
                          const canDelete = nomination.request_status === "pending";
                          
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
                                {nomination.request_status ? (
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(nomination.request_status)}`}>
                                    {nomination.request_status}
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
                              <td className="px-6 py-4 text-sm">
                                {nomination.review_status ? (
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getReviewStatusColor(nomination.review_status)}`}>
                                    {nomination.review_status}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          if (!canDelete || deletingNomination === nomination.id) return;
                                          handleDeleteNomination(nomination.id);
                                        }}
                                        aria-disabled={!canDelete || deletingNomination === nomination.id}
                                        className={`text-destructive ${!canDelete || deletingNomination === nomination.id ? "pointer-events-none opacity-50" : ""}`}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {deletingNomination === nomination.id ? "Removing..." : "Remove"}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
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
                
                // Filter by search term
                if (nominationSearch.trim()) {
                  const searchLower = nominationSearch.toLowerCase();
                  externalNominations = externalNominations.filter((nomination) => {
                    const externalReviewer = nomination.external_reviewer;
                    const email = externalReviewer?.email?.toLowerCase() || "";
                    const status = (nomination.request_status || "").toLowerCase();
                    const reviewStatus = (nomination.review_status || "").toLowerCase();
                    return email.includes(searchLower) || 
                           status.includes(searchLower) ||
                           reviewStatus.includes(searchLower);
                  });
                }
                
                return externalNominations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {nominationSearch.trim() ? "No nominations match your search." : "No external nominations requested yet."}
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-6 py-3 text-left text-sm font-medium">Email</th>
                          <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                          <th className="px-6 py-3 text-left text-sm font-medium">Requested</th>
                          <th className="px-6 py-3 text-left text-sm font-medium">Review Progress</th>
                          <th className="px-6 py-3 text-left text-sm font-medium w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {externalNominations.map((nomination) => {
                          const externalReviewer = nomination.external_reviewer;
                          const canDelete = nomination.request_status === "pending";
                          
                          return (
                            <tr key={nomination.id} className="border-b hover:bg-muted/50">
                              <td className="px-6 py-4 text-sm font-medium">
                                {externalReviewer?.email || "-"}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                {nomination.request_status ? (
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(nomination.request_status)}`}>
                                    {nomination.request_status}
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
                              <td className="px-6 py-4 text-sm">
                                {nomination.review_status ? (
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getReviewStatusColor(nomination.review_status)}`}>
                                    {nomination.review_status}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          if (!canDelete || deletingNomination === nomination.id) return;
                                          handleDeleteNomination(nomination.id);
                                        }}
                                        aria-disabled={!canDelete || deletingNomination === nomination.id}
                                        className={`text-destructive ${!canDelete || deletingNomination === nomination.id ? "pointer-events-none opacity-50" : ""}`}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {deletingNomination === nomination.id ? "Removing..." : "Remove"}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
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
      )}

      {/* Nomination Modal */}
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
            {/* Add External Reviewer Section */}
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
              {!emailValidationMessage && newReviewerEmail && (
                <p className="text-xs text-muted-foreground">
                  Email must be from {subdomain}.com domain
                </p>
              )}
            </div>

            {/* Selected External Reviewers Display */}
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
                        // Only disable if they have an active nomination (pending or accepted), not rejected
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

