"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, ArrowLeft, MoreVertical, Pencil, Calendar, ArrowUp, ArrowDown, Info, Building2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import { useTableSort } from "@/hooks/useTableSort";

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

interface Participant {
  id: string;
  client_user_id: string;
  cohort_id: string;
  client_user?: {
    id: string;
    name?: string;
    surname?: string;
    email?: string;
  };
  [key: string]: any;
}

interface CohortAssessment {
  id: string;
  cohort_id: string;
  assessment_type_id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  assessment_status: string | null;
  created_at: string | null;
  assessment_type?: {
    id: string;
    name: string;
    description: string | null;
  };
}

export default function CohortDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cohortId = params.id as string;

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [assessments, setAssessments] = useState<CohortAssessment[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMoreInfoSheetOpen, setIsMoreInfoSheetOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [formData, setFormData] = useState({
    participant_ids: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [isEditAssessmentDialogOpen, setIsEditAssessmentDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [participantSearch, setParticipantSearch] = useState("");
  const [editingAssessment, setEditingAssessment] = useState<CohortAssessment | null>(null);
  const [assessmentFormData, setAssessmentFormData] = useState({
    start_date: "",
    end_date: "",
  });
  const [updatingAssessment, setUpdatingAssessment] = useState(false);
  const [isEditCohortDialogOpen, setIsEditCohortDialogOpen] = useState(false);
  const [cohortFormData, setCohortFormData] = useState({
    name: "",
    start_date: "",
    end_date: "",
  });
  const [updatingCohort, setUpdatingCohort] = useState(false);

  // Filter participants based on search
  const filteredParticipants = participants.filter((participant) => {
    if (!participantSearch.trim()) return true;
    const user = participant.client_user as any;
    const searchLower = participantSearch.toLowerCase();
    const name = (user?.name || "").toLowerCase();
    const surname = (user?.surname || "").toLowerCase();
    const email = (user?.email || "").toLowerCase();
    return name.includes(searchLower) || surname.includes(searchLower) || email.includes(searchLower);
  });

  // Prepare participants for sorting (flatten nested objects)
  const participantsForSorting = filteredParticipants.map((participant) => ({
    ...participant,
    name: (participant.client_user as any)?.name || "",
    surname: (participant.client_user as any)?.surname || "",
    email: (participant.client_user as any)?.email || "",
  }));

  const { sortedData: sortedParticipants, sortConfig, handleSort } = useTableSort(participantsForSorting);

  useEffect(() => {
    if (cohortId) {
      fetchCohortDetails();
      fetchParticipants();
    }
  }, [cohortId]);

  useEffect(() => {
    if (cohort?.plan_id) {
      fetchAssessments();
    }
  }, [cohort?.plan_id, cohortId]);

  useEffect(() => {
    if (isDialogOpen && cohort) {
      fetchAvailableUsers();
    }
  }, [isDialogOpen, cohort]);

  async function fetchCohortDetails() {
    try {
      setLoading(true);
      setError(null);

      // Try fetching with relationships first
      let { data, error: dbError } = await supabase
        .from("cohorts")
        .select(`
          *,
          client:clients(name),
          plan:plans(name)
        `)
        .eq("id", cohortId)
        .single();

      // If relationship query fails, fallback to separate queries
      if (dbError && (dbError.message?.includes("relationship") || dbError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately:", dbError.message);
        
        // Fetch cohort without relationships
        const { data: cohortData, error: cohortError } = await supabase
          .from("cohorts")
          .select("*")
          .eq("id", cohortId)
          .single();

        if (cohortError) {
          throw cohortError;
        }

        // Fetch client and plan separately
        const [clientResult, planResult] = await Promise.all([
          cohortData?.client_id ? supabase.from("clients").select("id, name").eq("id", cohortData.client_id).single() : { data: null, error: null },
          cohortData?.plan_id ? supabase.from("plans").select("id, name").eq("id", cohortData.plan_id).single() : { data: null, error: null }
        ]);

        // Merge the data
        data = {
          ...cohortData,
          client: clientResult.data || null,
          plan: planResult.data || null,
        };

        dbError = null;
      }

      if (dbError) {
        console.error("Error fetching cohort:", dbError);
        setError(`Failed to load cohort: ${dbError.message}`);
        setCohort(null);
      } else {
        setCohort(data);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setCohort(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchParticipants() {
    try {
      // First fetch participant records
      const { data: participantRecords, error: participantsError } = await supabase
        .from("cohort_participants")
        .select("*")
        .eq("cohort_id", cohortId);

      if (participantsError) {
        console.error("Error fetching participant records:", participantsError);
        setParticipants([]);
        return;
      }

      if (!participantRecords || participantRecords.length === 0) {
        setParticipants([]);
        return;
      }

      // Get all client_user_ids
      const clientUserIds = participantRecords.map((p: any) => p.client_user_id);

      // Fetch client users
      const { data: clientUsers, error: usersError } = await supabase
        .from("client_users")
        .select("id, name, surname, email")
        .in("id", clientUserIds);

      if (usersError) {
        console.error("Error fetching client users:", usersError);
        setParticipants([]);
        return;
      }

      // Combine the data
      const participantsWithUsers = participantRecords.map((participant: any) => {
        const clientUser = clientUsers?.find((user: any) => user.id === participant.client_user_id);
        return {
          ...participant,
          client_user: clientUser || null,
        };
      });

      setParticipants(participantsWithUsers);
    } catch (err) {
      console.error("Error fetching participants:", err);
      setParticipants([]);
    }
  }

  async function fetchAssessments() {
    try {
      setAssessmentsLoading(true);
      
      // First, check if cohort has assessments
      const { data: existingAssessments, error: fetchError } = await supabase
        .from("cohort_assessments")
        .select(`
          *,
          assessment_type:assessment_types(id, name, description)
        `)
        .eq("cohort_id", cohortId);

      if (fetchError) {
        console.error("Error fetching assessments:", fetchError);
        setAssessments([]);
        return;
      }

      // Sort assessments: 360 first, then Pulse, then others
      if (existingAssessments && existingAssessments.length > 0) {
        existingAssessments.sort((a: any, b: any) => {
          const aName = (a.assessment_type?.name || "").toLowerCase();
          const bName = (b.assessment_type?.name || "").toLowerCase();
          
          // 360 always first
          if (aName === "360") return -1;
          if (bName === "360") return 1;
          
          // Pulse second
          if (aName === "pulse") return -1;
          if (bName === "pulse") return 1;
          
          // Others alphabetically
          return aName.localeCompare(bName);
        });
      }

      // If no assessments exist and we have cohort data, check plan assessments and create cohort assessments
      if ((!existingAssessments || existingAssessments.length === 0) && cohort?.plan_id) {
        // Get plan assessments
        const { data: planAssessments, error: planAssessmentsError } = await supabase
          .from("plan_assessments")
          .select("assessment_type_id")
          .eq("plan_id", cohort.plan_id);

        if (planAssessmentsError) {
          console.error("Error fetching plan assessments:", planAssessmentsError);
          setAssessments([]);
          return;
        }

        // Create cohort assessments from plan assessments
        // Use assessment_type_id from plan_assessments to link to assessment_types
        if (planAssessments && planAssessments.length > 0) {
          // Explicitly create objects with only the fields we want to insert
          // Ensure we don't include 'status' field - only use 'assessment_status'
          const cohortAssessmentsToCreate = planAssessments.map((pa: any) => {
            // Extract assessment_type_id from pa
            const assessmentTypeId = pa.assessment_type_id;
            return {
              cohort_id: cohortId,
              assessment_type_id: assessmentTypeId,
              name: null,
              assessment_status: "Not started",
            };
          });

          console.log("Creating cohort assessments:", JSON.stringify(cohortAssessmentsToCreate, null, 2));
          const { error: createError } = await supabase
            .from("cohort_assessments")
            .insert(cohortAssessmentsToCreate);

          if (createError) {
            console.error("Error creating cohort assessments:", createError);
            setAssessments([]);
            return;
          }

          // Fetch the newly created assessments
          const { data: newAssessments, error: newFetchError } = await supabase
            .from("cohort_assessments")
            .select(`
              *,
              assessment_type:assessment_types(id, name, description)
            `)
            .eq("cohort_id", cohortId);

          if (newFetchError) {
            console.error("Error fetching new assessments:", newFetchError);
            setAssessments([]);
            return;
          }

          // Sort assessments: 360 first, then Pulse, then others
          if (newAssessments && newAssessments.length > 0) {
            newAssessments.sort((a: any, b: any) => {
              const aName = (a.assessment_type?.name || "").toLowerCase();
              const bName = (b.assessment_type?.name || "").toLowerCase();
              
              // 360 always first
              if (aName === "360") return -1;
              if (bName === "360") return 1;
              
              // Pulse second
              if (aName === "pulse") return -1;
              if (bName === "pulse") return 1;
              
              // Others alphabetically
              return aName.localeCompare(bName);
            });
          }

          setAssessments(newAssessments || []);
        } else {
          setAssessments([]);
        }
      } else {
        setAssessments(existingAssessments || []);
      }
    } catch (err) {
      console.error("Error fetching assessments:", err);
      setAssessments([]);
    } finally {
      setAssessmentsLoading(false);
    }
  }

  function calculateStatus(assessment: CohortAssessment, cohort: Cohort): string {
    if (!assessment.start_date || !cohort.start_date) {
      return assessment.assessment_status || "Not started";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const assessmentStartDate = new Date(assessment.start_date);
    assessmentStartDate.setHours(0, 0, 0, 0);
    
    const cohortStartDate = new Date(cohort.start_date);
    cohortStartDate.setHours(0, 0, 0, 0);

    // If assessment start date >= cohort start date, status should be "In Progress"
    if (assessmentStartDate >= cohortStartDate) {
      // Check if current date > assessment end date, then "Completed"
      if (assessment.end_date) {
        const assessmentEndDate = new Date(assessment.end_date);
        assessmentEndDate.setHours(0, 0, 0, 0);
        if (today > assessmentEndDate) {
          return "Completed";
        }
      }
      return "In Progress";
    }

    return assessment.assessment_status || "Not started";
  }

  function getStatusColor(status: string): string {
    const statusLower = status.toLowerCase();
    if (statusLower === "completed") {
      return "bg-green-100 text-green-800";
    } else if (statusLower === "in progress" || statusLower === "in_progress") {
      return "bg-blue-100 text-blue-800";
    } else {
      return "bg-gray-100 text-gray-800";
    }
  }

  async function fetchAvailableUsers() {
    if (!cohort) return;

    try {
      setUsersLoading(true);
      // Get all client users for this cohort's client
      const { data: allUsers, error: allUsersError } = await supabase
        .from("client_users")
        .select("id, name, surname, email")
        .eq("client_id", cohort.client_id)
        .order("name");

      if (allUsersError) {
        console.error("Error fetching client users:", allUsersError);
        setAvailableUsers([]);
        return;
      }

      // Get already added participants
      const participantIds = participants.map((p) => p.client_user_id);

      // Filter out already added users
      const available = allUsers?.filter((user: any) => !participantIds.includes(user.id)) || [];
      setAvailableUsers(available);
    } catch (err) {
      console.error("Error fetching available users:", err);
      setAvailableUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  function handleParticipantToggle(userId: string) {
    setFormData((prev) => {
      const participantIds = prev.participant_ids.includes(userId)
        ? prev.participant_ids.filter((id) => id !== userId)
        : [...prev.participant_ids, userId];
      return { ...prev, participant_ids: participantIds };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (formData.participant_ids.length === 0) {
        setSubmitError("Please select at least one participant");
        setSubmitting(false);
        return;
      }

      // Add participants to cohort
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

      // Reset form and close dialog
      setFormData({
        participant_ids: [],
      });
      setIsDialogOpen(false);

      // Refresh the participants list
      await fetchParticipants();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveParticipant(participantId: string) {
    setRemoving(participantId);
    try {
      const { error } = await supabase
        .from("cohort_participants")
        .delete()
        .eq("id", participantId);

      if (error) {
        console.error("Error removing participant:", error);
        setSubmitError(error.message);
      } else {
        // Refresh participants list
        await fetchParticipants();
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setRemoving(null);
    }
  }

  function handleEditAssessment(assessment: CohortAssessment, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent card click
    setEditingAssessment(assessment);
    setAssessmentFormData({
      start_date: assessment.start_date ? assessment.start_date.split('T')[0] : "",
      end_date: assessment.end_date ? assessment.end_date.split('T')[0] : "",
    });
    setIsEditAssessmentDialogOpen(true);
  }

  async function handleUpdateAssessment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAssessment) return;

    setUpdatingAssessment(true);
    setSubmitError(null);

    try {
      const updateData: any = {};
      if (assessmentFormData.start_date) {
        updateData.start_date = assessmentFormData.start_date;
      } else {
        updateData.start_date = null;
      }
      if (assessmentFormData.end_date) {
        updateData.end_date = assessmentFormData.end_date;
      } else {
        updateData.end_date = null;
      }

      const { error } = await supabase
        .from("cohort_assessments")
        .update(updateData)
        .eq("id", editingAssessment.id);

      if (error) {
        console.error("Error updating assessment:", error);
        setSubmitError(error.message);
        setUpdatingAssessment(false);
        return;
      }

      // Close dialog and refresh assessments
      setIsEditAssessmentDialogOpen(false);
      setEditingAssessment(null);
      await fetchAssessments();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setUpdatingAssessment(false);
    }
  }

  async function handleUpdateCohort(e: React.FormEvent) {
    e.preventDefault();
    if (!cohort) return;

    setUpdatingCohort(true);
    setSubmitError(null);

    try {
      const updateData: any = {
        name: cohortFormData.name,
      };
      
      if (cohortFormData.start_date) {
        updateData.start_date = cohortFormData.start_date;
      } else {
        updateData.start_date = null;
      }
      
      if (cohortFormData.end_date) {
        updateData.end_date = cohortFormData.end_date;
      } else {
        updateData.end_date = null;
      }

      const { error } = await supabase
        .from("cohorts")
        .update(updateData)
        .eq("id", cohort.id);

      if (error) {
        console.error("Error updating cohort:", error);
        setSubmitError(error.message);
        setUpdatingCohort(false);
        return;
      }

      // Close dialog and refresh cohort details
      setIsEditCohortDialogOpen(false);
      await fetchCohortDetails();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setUpdatingCohort(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading cohort details...</div>
      </div>
    );
  }

  if (error || !cohort) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">
          {error || "Cohort not found"}
        </div>
        <Button variant="tertiary" onClick={() => router.push("/cohorts")} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Cohorts
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Cohorts", href: "/cohorts" },
          { label: cohort.name },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push("/cohorts")} className="p-0 h-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Cohorts
          </Button>

      {/* Header with Meta and Actions */}
      <div className="border-b border-gray-200 pb-4">
        <div className="sm:flex sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-900">{cohort.name}</h1>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMoreInfoSheetOpen(true)}
                >
                  <Info className="mr-2 h-4 w-4" />
                  More Info
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCohortFormData({
                      name: cohort.name,
                      start_date: cohort.start_date ? cohort.start_date.split('T')[0] : "",
                      end_date: cohort.end_date ? cohort.end_date.split('T')[0] : "",
                    });
                    setIsEditCohortDialogOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Cohort
                </Button>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Cohort details and participant management
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              {/* Client Name */}
              {(cohort.client as any)?.name && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>{(cohort.client as any)?.name}</span>
                </div>
              )}
              
              {/* Date Range */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {cohort.start_date && cohort.end_date ? (
                    <>
                      {new Date(cohort.start_date).toLocaleDateString()} - {new Date(cohort.end_date).toLocaleDateString()}
                    </>
                  ) : cohort.start_date ? (
                    <>
                      {new Date(cohort.start_date).toLocaleDateString()} - Not set
                    </>
                  ) : cohort.end_date ? (
                    <>
                      Not set - {new Date(cohort.end_date).toLocaleDateString()}
                    </>
                  ) : (
                    "Not set"
                  )}
                </span>
              </div>
              
              {/* Cohort Status */}
              {(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const endDate = cohort.end_date ? new Date(cohort.end_date) : null;
                const status = endDate && endDate < today ? "Completed" : "Active";
                const statusColor = status === "Completed" 
                  ? "bg-green-100 text-green-800" 
                  : "bg-blue-100 text-blue-800";
                
                return (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>
                      {status}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
      {/* Cohort Details Card - Hidden */}
      <Card className="hidden">
        <CardHeader>
          <CardTitle>Cohort Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Cohort Name</label>
              <p className="text-sm font-medium mt-1">{cohort.name || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Client</label>
              <p className="text-sm font-medium mt-1">
                {(cohort.client as any)?.name || "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Plan</label>
              <p className="text-sm font-medium mt-1">
                {(cohort.plan as any)?.name || "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Start Date</label>
              <p className="text-sm font-medium mt-1">
                {cohort.start_date
                  ? new Date(cohort.start_date).toLocaleDateString()
                  : "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">End Date</label>
              <p className="text-sm font-medium mt-1">
                {cohort.end_date
                  ? new Date(cohort.end_date).toLocaleDateString()
                  : "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created</label>
              <p className="text-sm font-medium mt-1">
                {cohort.created_at
                  ? new Date(cohort.created_at).toLocaleDateString()
                  : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

          {/* Assessments Section */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Assessments</h2>
        {assessmentsLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading assessments...</div>
        ) : assessments.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground rounded-md border">
            No assessments found for this cohort.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assessments.map((assessment) => {
              const assessmentType = assessment.assessment_type as any;
              const assessmentName = assessment.name || assessmentType?.name || "Assessment";
              const status = cohort ? calculateStatus(assessment, cohort) : (assessment.assessment_status || "Not started");
            

              return (
                <Card 
                  key={assessment.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer relative"
                  onClick={(e) => {
                    // Only navigate if click is not on the dropdown menu or its children
                    const target = e.target as HTMLElement;
                    if (!target.closest('[role="menu"]') && !target.closest('button')) {
                      router.push(`/cohorts/${cohortId}/assessments/${assessment.id}`);
                    }
                  }}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg pr-8">{assessmentName}</CardTitle>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {status && (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(status)}`}>
                            {status}
                          </span>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={(e) => handleEditAssessment(assessment, e)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      {assessment.start_date && (
                        <div>
                          <span className="text-muted-foreground">Start: </span>
                          <span className="font-medium">
                            {new Date(assessment.start_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {assessment.end_date && (
                        <div>
                          <span className="text-muted-foreground">End: </span>
                          <span className="font-medium">
                            {new Date(assessment.end_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {!assessment.start_date && !assessment.end_date && (
                        <div className="text-muted-foreground text-xs">
                          No dates set
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
          </div>
        </TabsContent>

        {/* Participants Tab */}
        <TabsContent value="participants">
      <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Participants</h2>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Search participants..."
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  className="w-64"
                />
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Participant
                </Button>
              </div>
            </div>
            <div className="rounded-md border">
          {sortedParticipants.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {participantSearch.trim() 
                ? "No participants match your search." 
                : "No participants found. Click \"Add Participant\" to add participants to this cohort."}
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
                  <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                  {sortedParticipants.map((participant) => {
                  const user = participant.client_user as any;
                  return (
                      <tr 
                        key={participant.id} 
                        className="border-b hover:bg-muted/50 transition-colors"
                      >
                      <td className="px-6 py-4 text-sm font-medium">{user?.name || "-"}</td>
                      <td className="px-6 py-4 text-sm font-medium">{user?.surname || "-"}</td>
                      <td className="px-6 py-4 text-sm">{user?.email || "-"}</td>
                        <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() => {
                                if (removing === participant.id) return;
                                handleRemoveParticipant(participant.id);
                              }}
                              aria-disabled={removing === participant.id}
                              className={`text-destructive ${removing === participant.id ? "pointer-events-none opacity-50" : ""}`}
                            >
                              {removing === participant.id ? "Removing..." : "Remove"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
        </TabsContent>
      </Tabs>

      {/* Add Participant Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Add Participants</DialogTitle>
            <DialogDescription>
              Select participants from the client to add to this cohort.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Participants Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Participants <span className="text-destructive">*</span>
              </label>
              <div className="border rounded-md max-h-60 overflow-y-auto p-2">
                {usersLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Loading users...
                  </div>
                ) : availableUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No available users to add. All client users are already participants.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableUsers.map((user) => (
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
                    participant_ids: [],
                  });
                  setSubmitError(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || formData.participant_ids.length === 0}>
                {submitting ? "Adding..." : "Add Participants"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Assessment Dialog */}
      <Dialog open={isEditAssessmentDialogOpen} onOpenChange={setIsEditAssessmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogClose onClick={() => setIsEditAssessmentDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Edit Assessment Dates</DialogTitle>
            <DialogDescription>
              Update the start and end dates for this assessment. Dates are optional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateAssessment} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <div className="relative">
                <Calendar 
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer z-10" 
                  onClick={(e) => {
                    const input = e.currentTarget.nextElementSibling as HTMLInputElement;
                    if (input) {
                      input.showPicker?.();
                      input.focus();
                    }
                  }}
                />
                <Input
                  type="date"
                  value={assessmentFormData.start_date}
                  onChange={(e) =>
                    setAssessmentFormData((prev) => ({ ...prev, start_date: e.target.value }))
                  }
                  onClick={(e) => {
                    const input = e.currentTarget as HTMLInputElement;
                    input.showPicker?.();
                  }}
                  placeholder="Select start date (optional)"
                  className="pl-10 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'none' }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <div className="relative">
                <Calendar 
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer z-10" 
                  onClick={(e) => {
                    const input = e.currentTarget.nextElementSibling as HTMLInputElement;
                    if (input) {
                      input.showPicker?.();
                      input.focus();
                    }
                  }}
                />
                <Input
                  type="date"
                  value={assessmentFormData.end_date}
                  onChange={(e) =>
                    setAssessmentFormData((prev) => ({ ...prev, end_date: e.target.value }))
                  }
                  onClick={(e) => {
                    const input = e.currentTarget as HTMLInputElement;
                    input.showPicker?.();
                  }}
                  placeholder="Select end date (optional)"
                  className="pl-10 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'none' }}
                />
              </div>
            </div>

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditAssessmentDialogOpen(false);
                  setEditingAssessment(null);
                  setAssessmentFormData({ start_date: "", end_date: "" });
                  setSubmitError(null);
                }}
                disabled={updatingAssessment}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingAssessment}>
                {updatingAssessment ? "Updating..." : "Update Assessment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Cohort Dialog */}
      <Dialog open={isEditCohortDialogOpen} onOpenChange={setIsEditCohortDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogClose onClick={() => setIsEditCohortDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Edit Cohort</DialogTitle>
            <DialogDescription>
              Update the cohort name and dates. Dates are optional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateCohort} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Cohort Name <span className="text-destructive">*</span>
              </label>
              <Input
                type="text"
                value={cohortFormData.name}
                onChange={(e) =>
                  setCohortFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                required
                placeholder="Enter cohort name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <div className="relative">
                  <Calendar 
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer z-10" 
                    onClick={(e) => {
                      const input = e.currentTarget.nextElementSibling as HTMLInputElement;
                      if (input) {
                        input.showPicker?.();
                        input.focus();
                      }
                    }}
                  />
                  <Input
                    type="date"
                    value={cohortFormData.start_date}
                    onChange={(e) =>
                      setCohortFormData((prev) => ({ ...prev, start_date: e.target.value }))
                    }
                    onClick={(e) => {
                      const input = e.currentTarget as HTMLInputElement;
                      input.showPicker?.();
                    }}
                    placeholder="Select start date (optional)"
                    className="pl-10 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none cursor-pointer"
                    style={{ WebkitAppearance: 'none' }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <div className="relative">
                  <Calendar 
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer z-10" 
                    onClick={(e) => {
                      const input = e.currentTarget.nextElementSibling as HTMLInputElement;
                      if (input) {
                        input.showPicker?.();
                        input.focus();
                      }
                    }}
                  />
                  <Input
                    type="date"
                    value={cohortFormData.end_date}
                    onChange={(e) =>
                      setCohortFormData((prev) => ({ ...prev, end_date: e.target.value }))
                    }
                    onClick={(e) => {
                      const input = e.currentTarget as HTMLInputElement;
                      input.showPicker?.();
                    }}
                    placeholder="Select end date (optional)"
                    className="pl-10 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none cursor-pointer"
                    style={{ WebkitAppearance: 'none' }}
                  />
                </div>
              </div>
            </div>

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditCohortDialogOpen(false);
                  setSubmitError(null);
                }}
                disabled={updatingCohort}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingCohort}>
                {updatingCohort ? "Updating..." : "Update Cohort"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* More Info Sheet */}
      <Sheet open={isMoreInfoSheetOpen} onOpenChange={setIsMoreInfoSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Cohort Information</SheetTitle>
            <SheetDescription>
              Detailed information about this cohort
            </SheetDescription>
          </SheetHeader>
          <SheetClose onClose={() => setIsMoreInfoSheetOpen(false)} />
          
          <div className="mt-6 space-y-6 overflow-y-auto flex-1">
            <div className="grid gap-4 px-6">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Cohort Name</label>
                <p className="text-sm font-medium mt-1">{cohort.name || "-"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Client</label>
                <p className="text-sm font-medium mt-1">
                  {(cohort.client as any)?.name || "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Plan</label>
                <p className="text-sm font-medium mt-1">
                  {(cohort.plan as any)?.name || "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Start Date</label>
                <p className="text-sm font-medium mt-1">
                  {cohort.start_date
                    ? new Date(cohort.start_date).toLocaleDateString()
                    : "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">End Date</label>
                <p className="text-sm font-medium mt-1">
                  {cohort.end_date
                    ? new Date(cohort.end_date).toLocaleDateString()
                    : "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <p className="text-sm font-medium mt-1">
                  {cohort.created_at
                    ? new Date(cohort.created_at).toLocaleDateString()
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

