"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Download, MoreVertical, Calendar, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { useTableSort } from "@/hooks/useTableSort";

interface Client {
  id: string;
  name: string;
  [key: string]: any;
}

interface User {
  id: string;
  name?: string;
  surname?: string;
  email?: string;
  [key: string]: any;
}

interface Plan {
  id: string;
  name: string;
  [key: string]: any;
}

interface Cohort {
  id: string;
  name: string;
  client_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  created_at?: string;
  client?: { name: string };
  plan?: { name: string };
  [key: string]: any;
}

export default function CohortsPage() {
  const router = useRouter();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [cohortsError, setCohortsError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);
  const [deletingCohortId, setDeletingCohortId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    client_id: "",
    plan_id: "",
    start_date: "",
    end_date: "",
    participant_ids: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Prepare cohorts data for sorting (flatten nested objects)
  const cohortsForSorting = cohorts.map((cohort) => ({
    ...cohort,
    clientName: (cohort.client as any)?.name || "",
    planName: (cohort.plan as any)?.name || "",
  }));

  const { sortedData: sortedCohorts, sortConfig, handleSort } = useTableSort(cohortsForSorting);

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (isDialogOpen) {
      fetchClients();
      fetchPlans();
      if (editingCohortId) {
        fetchCohortForEdit(editingCohortId);
      }
    } else {
      // Reset form when dialog closes
      setEditingCohortId(null);
      setFormData({
        name: "",
        client_id: "",
        plan_id: "",
        start_date: "",
        end_date: "",
        participant_ids: [],
      });
    }
  }, [isDialogOpen, editingCohortId]);

  useEffect(() => {
    if (formData.client_id) {
      fetchClientUsers(formData.client_id);
    } else {
      setUsers([]);
      setFormData((prev) => ({ ...prev, participant_ids: [] }));
    }
  }, [formData.client_id]);

  async function fetchClients() {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("Error fetching clients:", error);
      } else {
        setClients(data || []);
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  }

  async function fetchPlans() {
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("Error fetching plans:", error);
      } else {
        setPlans(data || []);
      }
    } catch (err) {
      console.error("Error fetching plans:", err);
    }
  }

  async function fetchCohorts() {
    try {
      setCohortsLoading(true);
      setCohortsError(null);

      const today = new Date().toISOString().split('T')[0];

      // Try fetching with relationships first
      let { data, error } = await supabase
        .from("cohorts")
        .select(`
          *,
          client:clients(name),
          plan:plans(name)
        `)
        .gte("end_date", today)
        .order("start_date", { ascending: false });

      // If relationship query fails, fallback to separate queries
      if (error && (error.message?.includes("relationship") || error.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately:", error.message);
        
        // Fetch cohorts without relationships
        const { data: cohortsData, error: cohortsError } = await supabase
          .from("cohorts")
          .select("*")
          .gte("end_date", today)
          .order("start_date", { ascending: false });

        if (cohortsError) {
          throw cohortsError;
        }

        // Fetch all unique client and plan IDs
        const clientIds = [...new Set(cohortsData?.map((c: any) => c.client_id) || [])];
        const planIds = [...new Set(cohortsData?.map((c: any) => c.plan_id) || [])];

        // Fetch clients and plans
        const [clientsResult, plansResult] = await Promise.all([
          clientIds.length > 0 ? supabase.from("clients").select("id, name").in("id", clientIds) : { data: [], error: null },
          planIds.length > 0 ? supabase.from("plans").select("id, name").in("id", planIds) : { data: [], error: null }
        ]);

        // Merge the data
        data = cohortsData?.map((cohort: any) => ({
          ...cohort,
          client: clientsResult.data?.find((c: any) => c.id === cohort.client_id) || null,
          plan: plansResult.data?.find((p: any) => p.id === cohort.plan_id) || null,
        })) || [];

        error = null;
      }

      if (error) {
        console.error("Error fetching cohorts:", error);
        setCohortsError(`Failed to load cohorts: ${error.message}`);
        setCohorts([]);
      } else {
        setCohorts(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setCohortsError(err instanceof Error ? err.message : "An unexpected error occurred");
      setCohorts([]);
    } finally {
      setCohortsLoading(false);
    }
  }

  async function fetchClientUsers(clientId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("client_users")
        .select("id, name, surname, email")
        .eq("client_id", clientId)
        .order("name");

      if (error) {
        console.error("Error fetching client users:", error);
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      console.error("Error fetching client users:", err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCohortForEdit(cohortId: string) {
    try {
      setLoading(true);
      // Fetch cohort details
      const { data: cohort, error: cohortError } = await supabase
        .from("cohorts")
        .select("*")
        .eq("id", cohortId)
        .single();

      if (cohortError) {
        console.error("Error fetching cohort:", cohortError);
        return;
      }

      // Fetch participants
      const { data: participants, error: participantsError } = await supabase
        .from("cohort_participants")
        .select("client_user_id")
        .eq("cohort_id", cohortId);

      if (participantsError) {
        console.error("Error fetching participants:", participantsError);
      }

      // Set form data
      setFormData({
        name: cohort.name || "",
        client_id: cohort.client_id || "",
        plan_id: cohort.plan_id || "",
        start_date: cohort.start_date ? cohort.start_date.split('T')[0] : "",
        end_date: cohort.end_date ? cohort.end_date.split('T')[0] : "",
        participant_ids: participants?.map((p) => p.client_user_id) || [],
      });

      // Fetch client users for the selected client
      if (cohort.client_id) {
        await fetchClientUsers(cohort.client_id);
      }
    } catch (err) {
      console.error("Error fetching cohort for edit:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(cohort: Cohort) {
    setEditingCohortId(cohort.id);
    setIsDialogOpen(true);
  }

  function handleDeleteClick(cohortId: string) {
    setDeletingCohortId(cohortId);
    setIsDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingCohortId) return;

    setDeleting(true);
    try {
      // Step 1: Get all cohort_assessments for this cohort
      const { data: cohortAssessments, error: assessmentsFetchError } = await supabase
        .from("cohort_assessments")
        .select("id")
        .eq("cohort_id", deletingCohortId);

      if (assessmentsFetchError) {
        console.error("Error fetching cohort assessments:", assessmentsFetchError);
      }

      const cohortAssessmentIds = cohortAssessments?.map((ca: any) => ca.id) || [];

      if (cohortAssessmentIds.length > 0) {
        // Step 2: Get all participant_assessments for these cohort assessments
        const { data: participantAssessments, error: paFetchError } = await supabase
          .from("participant_assessments")
          .select("id")
          .in("cohort_assessment_id", cohortAssessmentIds);

        if (paFetchError) {
          console.error("Error fetching participant assessments:", paFetchError);
        }

        const participantAssessmentIds = participantAssessments?.map((pa: any) => pa.id) || [];

        if (participantAssessmentIds.length > 0) {
          // Step 3: Delete reviewer_nominations linked to these participant assessments
          const { error: nominationsError } = await supabase
            .from("reviewer_nominations")
            .delete()
            .in("participant_assessment_id", participantAssessmentIds);

          if (nominationsError) {
            console.error("Error deleting reviewer nominations:", nominationsError);
          }

          // Step 4: Delete participant_assessments
          const { error: paDeleteError } = await supabase
            .from("participant_assessments")
            .delete()
            .in("cohort_assessment_id", cohortAssessmentIds);

          if (paDeleteError) {
            console.error("Error deleting participant assessments:", paDeleteError);
          }
        }

        // Step 5: Delete cohort_assessments
        const { error: assessmentsDeleteError } = await supabase
          .from("cohort_assessments")
          .delete()
          .eq("cohort_id", deletingCohortId);

        if (assessmentsDeleteError) {
          console.error("Error deleting cohort assessments:", assessmentsDeleteError);
        }
      }

      // Step 6: Delete cohort_participants
      const { error: participantsError } = await supabase
        .from("cohort_participants")
        .delete()
        .eq("cohort_id", deletingCohortId);

      if (participantsError) {
        console.error("Error deleting participants:", participantsError);
      }

      // Step 7: Finally delete the cohort itself
      const { error: cohortError } = await supabase
        .from("cohorts")
        .delete()
        .eq("id", deletingCohortId);

      if (cohortError) {
        console.error("Error deleting cohort:", cohortError);
        setSubmitError(cohortError.message);
        setDeleting(false);
        return;
      }

      setIsDeleteDialogOpen(false);
      setDeletingCohortId(null);
      await fetchCohorts();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleParticipantToggle(userId: string) {
    setFormData((prev) => {
      const participantIds = prev.participant_ids.includes(userId)
        ? prev.participant_ids.filter((id) => id !== userId)
        : [...prev.participant_ids, userId];
      return { ...prev, participant_ids: participantIds };
    });
  }

  function getCohortStatus(cohort: Cohort): { label: string; color: string } {
    if (!cohort.start_date || !cohort.end_date) {
      return { label: "Unknown", color: "bg-gray-100 text-gray-800" };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(cohort.start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(cohort.end_date);
    endDate.setHours(0, 0, 0, 0);

    if (startDate > today) {
      return { label: "Upcoming", color: "bg-blue-100 text-blue-800" };
    } else if (endDate < today) {
      return { label: "Completed", color: "bg-gray-100 text-gray-800" };
    } else {
      return { label: "Active", color: "bg-green-100 text-green-800" };
    }
  }

  async function handleDownloadData() {
    try {
      // Fetch all cohorts without relationships first
      const { data: allCohorts, error: cohortsError } = await supabase
        .from("cohorts")
        .select("*")
        .order("created_at", { ascending: false });

      if (cohortsError) {
        console.error("Error fetching cohorts:", cohortsError);
        alert("Failed to fetch cohorts data");
        return;
      }

      if (!allCohorts || allCohorts.length === 0) {
        alert("No cohorts found to export");
        return;
      }

      // Fetch clients and plans separately
      const clientIds = [...new Set(allCohorts.map((c: any) => c.client_id).filter(Boolean))];
      const planIds = [...new Set(allCohorts.map((c: any) => c.plan_id).filter(Boolean))];

      const [clientsResult, plansResult] = await Promise.all([
        clientIds.length > 0 
          ? supabase.from("clients").select("id, name").in("id", clientIds)
          : { data: [], error: null },
        planIds.length > 0
          ? supabase.from("plans").select("id, name").in("id", planIds)
          : { data: [], error: null }
      ]);

      const clientsMap = new Map((clientsResult.data || []).map((c: any) => [c.id, c.name]));
      const plansMap = new Map((plansResult.data || []).map((p: any) => [p.id, p.name]));

      // Prepare cohorts data
      const cohortsData = allCohorts.map((cohort: any) => ({
        "Cohort ID": cohort.id,
        "Cohort Name": cohort.name || "",
        "Client": clientsMap.get(cohort.client_id) || "",
        "Plan": plansMap.get(cohort.plan_id) || "",
        "Start Date": cohort.start_date ? new Date(cohort.start_date).toLocaleDateString() : "",
        "End Date": cohort.end_date ? new Date(cohort.end_date).toLocaleDateString() : "",
        "Created At": cohort.created_at ? new Date(cohort.created_at).toLocaleDateString() : "",
      }));

      // Fetch all participants for all cohorts
      const cohortIds = allCohorts.map((c: any) => c.id);
      const { data: allParticipants, error: participantsError } = await supabase
        .from("cohort_participants")
        .select("*")
        .in("cohort_id", cohortIds);

      if (participantsError) {
        console.error("Error fetching participants:", participantsError);
      }

      // Fetch client users separately
      const clientUserIds = [...new Set((allParticipants || []).map((p: any) => p.client_user_id).filter(Boolean))];
      let clientUsers: any[] = [];
      if (clientUserIds.length > 0) {
        const { data, error: usersError } = await supabase
          .from("client_users")
          .select("id, name, surname, email")
          .in("id", clientUserIds);
        if (!usersError && data) {
          clientUsers = data;
        }
      }

      const usersMap = new Map(clientUsers.map((u: any) => [
        u.id,
        { name: u.name || "", surname: u.surname || "", email: u.email || "" }
      ]));

      // Create cohorts map for participants
      const cohortsMap = new Map(allCohorts.map((c: any) => [c.id, { name: c.name || "", clientId: c.client_id }]));

      // Prepare participants data
      const participantsData = (allParticipants || []).map((participant: any) => {
        const cohort = cohortsMap.get(participant.cohort_id);
        const user = usersMap.get(participant.client_user_id);
        return {
          "Participant ID": participant.id,
          "Cohort Name": cohort?.name || "",
          "Client": clientsMap.get(cohort?.clientId || "") || "",
          "Participant Name": `${user?.name || ""} ${user?.surname || ""}`.trim() || "",
          "Participant Email": user?.email || "",
          "Added At": participant.created_at ? new Date(participant.created_at).toLocaleDateString() : "",
        };
      });

      // Fetch all cohort assessments
      const { data: cohortAssessments, error: cohortAssessmentsError } = await supabase
        .from("cohort_assessments")
        .select("*")
        .in("cohort_id", cohortIds);

      if (cohortAssessmentsError) {
        console.error("Error fetching cohort assessments:", cohortAssessmentsError);
      }

      const cohortAssessmentIds = (cohortAssessments || []).map((ca: any) => ca.id);
      const cohortAssessmentsMap = new Map((cohortAssessments || []).map((ca: any) => [ca.id, ca.cohort_id]));

      // Fetch all participant assessments
      let participantAssessments: any[] = [];
      if (cohortAssessmentIds.length > 0) {
        const { data, error: assessmentsError } = await supabase
          .from("participant_assessments")
          .select("*")
          .in("cohort_assessment_id", cohortAssessmentIds);
        if (assessmentsError) {
          console.error("Error fetching participant assessments:", assessmentsError);
        } else if (data) {
          participantAssessments = data;
        }
      }

      // Fetch all nominations
      const participantAssessmentIds = participantAssessments.map((pa: any) => pa.id);
      let nominationsData: any[] = [];

      if (participantAssessmentIds.length > 0) {
        const { data: nominations, error: nominationsError } = await supabase
          .from("reviewer_nominations")
          .select("*")
          .in("participant_assessment_id", participantAssessmentIds);

        if (nominationsError) {
          console.error("Error fetching nominations:", nominationsError);
        } else {
          // Create maps for lookups
          const participantAssessmentsMap = new Map(participantAssessments.map((pa: any) => [
            pa.id,
            { clientUserId: pa.client_user_id, cohortAssessmentId: pa.cohort_assessment_id }
          ]));

          // Fetch external reviewers
          const externalReviewerIds = [...new Set((nominations || [])
            .filter((n: any) => n.is_external && n.external_reviewer_id)
            .map((n: any) => n.external_reviewer_id))];
          
          let externalReviewers: any[] = [];
          if (externalReviewerIds.length > 0) {
            const { data, error: extReviewersError } = await supabase
              .from("external_reviewers")
              .select("id, email")
              .in("id", externalReviewerIds);
            if (!extReviewersError && data) {
              externalReviewers = data;
            }
          }

          const externalReviewersMap = new Map(externalReviewers.map((er: any) => [er.id, er.email]));

          // Fetch internal reviewers
          const reviewerIds = [...new Set((nominations || [])
            .filter((n: any) => !n.is_external && n.reviewer_id)
            .map((n: any) => n.reviewer_id))];

          let reviewers: any[] = [];
          if (reviewerIds.length > 0) {
            const { data, error: reviewersError } = await supabase
              .from("client_users")
              .select("id, name, surname, email")
              .in("id", reviewerIds);
            if (!reviewersError && data) {
              reviewers = data;
            }
          }

          const reviewersMap = new Map(reviewers.map((r: any) => [
            r.id,
            { name: r.name || "", surname: r.surname || "", email: r.email || "" }
          ]));

          nominationsData = (nominations || []).map((nomination: any) => {
            const pa = participantAssessmentsMap.get(nomination.participant_assessment_id);
            const cohortAssessmentId = pa?.cohortAssessmentId;
            const cohortId = cohortAssessmentsMap.get(cohortAssessmentId || "");
            const cohort = cohortsMap.get(cohortId || "");
            const participant = usersMap.get(pa?.clientUserId || "");

            let reviewerName = "";
            let reviewerEmail = "";

            if (nomination.is_external) {
              reviewerEmail = externalReviewersMap.get(nomination.external_reviewer_id) || "";
            } else {
              const reviewer = reviewersMap.get(nomination.reviewer_id);
              reviewerName = `${reviewer?.name || ""} ${reviewer?.surname || ""}`.trim();
              reviewerEmail = reviewer?.email || "";
            }

            return {
              "Nomination ID": nomination.id,
              "Cohort Name": cohort?.name || "",
              "Client": clientsMap.get(cohort?.clientId || "") || "",
              "Participant Name": `${participant?.name || ""} ${participant?.surname || ""}`.trim() || "",
              "Participant Email": participant?.email || "",
              "Reviewer Type": nomination.is_external ? "External" : "Internal",
              "Reviewer Name": reviewerName,
              "Reviewer Email": reviewerEmail,
              "Status": nomination.status || "",
              "Created At": nomination.created_at ? new Date(nomination.created_at).toLocaleDateString() : "",
            };
          });
        }
      }

      // Create workbook with multiple sheets
      const workbook = XLSX.utils.book_new();

      // Add Cohorts sheet
      const cohortsSheet = XLSX.utils.json_to_sheet(cohortsData);
      XLSX.utils.book_append_sheet(workbook, cohortsSheet, "Cohorts");

      // Add Participants sheet
      const participantsSheet = XLSX.utils.json_to_sheet(participantsData);
      XLSX.utils.book_append_sheet(workbook, participantsSheet, "Participants");

      // Add Nominations sheet
      const nominationsSheet = XLSX.utils.json_to_sheet(nominationsData);
      XLSX.utils.book_append_sheet(workbook, nominationsSheet, "Nominations");

      // Generate filename with current date
      const fileName = `cohorts_export_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Write and download
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error("Error exporting data:", err);
      alert("Failed to export data. Please try again.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!formData.name || !formData.client_id || !formData.plan_id) {
        setSubmitError("Please fill in all required fields (Name, Client, and Type)");
        setSubmitting(false);
        return;
      }

      let cohortId: string;

      if (editingCohortId) {
        // Update existing cohort
        const { data: cohort, error: cohortError } = await supabase
          .from("cohorts")
          .update({
            name: formData.name,
            client_id: formData.client_id,
            plan_id: formData.plan_id,
            start_date: formData.start_date,
            end_date: formData.end_date,
          })
          .eq("id", editingCohortId)
          .select()
          .single();

        if (cohortError) {
          console.error("Error updating cohort:", cohortError);
          setSubmitError(cohortError.message);
          setSubmitting(false);
          return;
        }

        cohortId = cohort.id;

        // Delete existing participants
        const { error: deleteError } = await supabase
          .from("cohort_participants")
          .delete()
          .eq("cohort_id", cohortId);

        if (deleteError) {
          console.error("Error deleting existing participants:", deleteError);
        }
      } else {
        // Create new cohort
        const insertData: any = {
          name: formData.name,
          client_id: formData.client_id,
          plan_id: formData.plan_id,
          status: "draft",
        };
        
        if (formData.start_date) {
          insertData.start_date = formData.start_date;
        }
        if (formData.end_date) {
          insertData.end_date = formData.end_date;
        }

        const { data: cohort, error: cohortError } = await supabase
          .from("cohorts")
          .insert([insertData])
          .select()
          .single();

        if (cohortError) {
          console.error("Error creating cohort:", cohortError);
          setSubmitError(cohortError.message);
          setSubmitting(false);
          return;
        }

        cohortId = cohort.id;

        // Create cohort assessments from plan assessments
        console.log("📋 Fetching plan assessments for plan_id:", formData.plan_id);
        const { data: planAssessments, error: planAssessmentsError } = await supabase
          .from("plan_assessments")
          .select("assessment_type_id")
          .eq("plan_id", formData.plan_id);

        if (planAssessmentsError) {
          console.error("❌ Error fetching plan assessments:", planAssessmentsError);
          setSubmitError(`Failed to fetch plan assessments: ${planAssessmentsError.message}`);
          setSubmitting(false);
          return;
        }

        console.log("📋 Plan assessments found:", planAssessments);

        if (planAssessments && planAssessments.length > 0) {
          // Create cohort assessments for each plan assessment
          const cohortAssessmentsToCreate = planAssessments.map((pa: any) => {
            const assessmentTypeId = pa.assessment_type_id;
            return {
              cohort_id: cohortId,
              assessment_type_id: assessmentTypeId,
              name: null,
              assessment_status: "Not started",
            };
          });

          console.log("📝 Creating cohort assessments:", cohortAssessmentsToCreate);

          const { data: createdAssessments, error: assessmentsError } = await supabase
            .from("cohort_assessments")
            .insert(cohortAssessmentsToCreate)
            .select();

          if (assessmentsError) {
            console.error("❌ Error creating cohort assessments:", assessmentsError);
            setSubmitError(`Failed to create cohort assessments: ${assessmentsError.message}`);
            setSubmitting(false);
            return;
          }

          console.log("✅ Successfully created cohort assessments:", createdAssessments);
        } else {
          console.warn("⚠️ No plan assessments found for plan_id:", formData.plan_id);
        }
      }

      // Add participants to cohort (if any selected)
      if (formData.participant_ids.length > 0) {

        const cohortParticipants = formData.participant_ids.map((client_user_id) => ({
          cohort_id: cohortId,
          client_user_id,
        }));

        const { error: participantsError } = await supabase
          .from("cohort_participants")
          .insert(cohortParticipants);

        if (participantsError) {
          console.error("Error adding participants:", participantsError);
          setSubmitError(participantsError.message);
          setSubmitting(false);
          return;
        }
      }

      // Reset form and close dialog
      setFormData({
        name: "",
        client_id: "",
        plan_id: "",
        start_date: "",
        end_date: "",
        participant_ids: [],
      });
      setIsDialogOpen(false);
      
      // Refresh cohorts list
      await fetchCohorts();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Cohort Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cohorts</h1>
          <p className="text-muted-foreground mt-2">Manage cohorts and participants</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleDownloadData}>
            <Download className="mr-2 h-4 w-4" />
            Download Data
          </Button>
          <Button onClick={() => {
            setEditingCohortId(null);
            setIsDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Cohort
          </Button>
        </div>
      </div>

      {/* Cohorts Table */}
      <div className="rounded-md border">
        {cohortsLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading cohorts...</div>
        ) : cohortsError ? (
          <div className="p-8 text-center text-destructive">{cohortsError}</div>
        ) : cohorts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No active cohorts found.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
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
                  onClick={() => handleSort("clientName")}
                >
                  <div className="flex items-center gap-2">
                    Client
                    {sortConfig.key === "clientName" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("planName")}
                >
                  <div className="flex items-center gap-2">
                    Plan
                    {sortConfig.key === "planName" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("start_date")}
                >
                  <div className="flex items-center gap-2">
                    Start Date
                    {sortConfig.key === "start_date" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("end_date")}
                >
                  <div className="flex items-center gap-2">
                    End Date
                    {sortConfig.key === "end_date" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                <th 
                  className="px-6 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 select-none"
                  onClick={() => handleSort("created_at")}
                >
                  <div className="flex items-center gap-2">
                    Created
                    {sortConfig.key === "created_at" && (
                      sortConfig.direction === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCohorts.map((cohort) => (
                <tr
                  key={cohort.id}
                  className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/cohorts/${cohort.id}`)}
                >
                  <td className="px-6 py-4 text-sm font-medium">{cohort.name || "-"}</td>
                  <td className="px-6 py-4 text-sm">
                    {(cohort.client as any)?.name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {(cohort.plan as any)?.name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {cohort.start_date ? new Date(cohort.start_date).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {cohort.end_date ? new Date(cohort.end_date).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {(() => {
                      const status = getCohortStatus(cohort);
                      return (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {cohort.created_at
                      ? new Date(cohort.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => handleEdit(cohort)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Cohort
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(cohort.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Cohort
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Cohort Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>
              {editingCohortId ? "Edit Cohort" : "Create Cohort"}
            </DialogTitle>
            <DialogDescription>
              {editingCohortId
                ? "Update the cohort details below."
                : "Create a new cohort by selecting a client, type, and optionally dates and participants."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cohort Name */}
            <div className="space-y-2.5">
              <label htmlFor="name" className="text-sm font-medium">
                Cohort Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter cohort name"
              />
            </div>

            {/* Client Selection */}
            <div className="space-y-2.5">
              <label htmlFor="client_id" className="text-sm font-medium">
                Client <span className="text-destructive">*</span>
              </label>
              <select
                id="client_id"
                name="client_id"
                value={formData.client_id}
                onChange={handleInputChange}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-10 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Type (Plan) Selection */}
            <div className="space-y-2.5">
              <label htmlFor="plan_id" className="text-sm font-medium">
                Type <span className="text-destructive">*</span>
              </label>
              <select
                id="plan_id"
                name="plan_id"
                value={formData.plan_id}
                onChange={handleInputChange}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-10 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a type</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <label htmlFor="start_date" className="text-sm font-medium">
                  Start Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={handleInputChange}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2.5">
                <label htmlFor="end_date" className="text-sm font-medium">
                  End Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="end_date"
                    name="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={handleInputChange}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Participants Selection */}
            <div className="space-y-2.5">
              <label className="text-sm font-medium">
                Participants
              </label>
              {!formData.client_id ? (
                <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                  Please select a client first to see available participants
                </div>
              ) : (
                <>
                  <div className="border rounded-md max-h-60 overflow-y-auto p-2">
                    {loading ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Loading users...
                      </div>
                    ) : users.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No users available for this client
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {users.map((user) => (
                          <label
                            key={user.id}
                            className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.participant_ids.includes(user.id)}
                              onChange={() => handleParticipantToggle(user.id)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm">
                              {user.name || ""} {user.surname || ""} {user.email ? `(${user.email})` : ""}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {formData.participant_ids.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formData.participant_ids.length} participant(s) selected
                    </p>
                  )}
                </>
              )}
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setFormData({
                    name: "",
                    client_id: "",
                    plan_id: "",
                    start_date: "",
                    end_date: "",
                    participant_ids: [],
                  });
                  setSubmitError(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? editingCohortId
                    ? "Updating..."
                    : "Creating..."
                  : editingCohortId
                  ? "Update Cohort"
                  : "Create Cohort"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsDeleteDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Delete Cohort</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this cohort? This action cannot be undone and will also remove all associated participants, assessments, and nominations.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingCohortId(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Cohort"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
