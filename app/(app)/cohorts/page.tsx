"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
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
import { supabase } from "@/lib/supabaseClient";

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
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [cohortsError, setCohortsError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  useEffect(() => {
    fetchCohorts();
  }, []);

  useEffect(() => {
    if (isDialogOpen) {
      fetchClients();
      fetchPlans();
    }
  }, [isDialogOpen]);

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

      // Fetch active cohorts (end_date >= today)
      const { data, error } = await supabase
        .from("cohorts")
        .select(`
          *,
          client:clients(name),
          plan:plans(name)
        `)
        .gte("end_date", today)
        .order("start_date", { ascending: false });

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!formData.name || !formData.client_id || !formData.plan_id || !formData.start_date || !formData.end_date) {
        setSubmitError("Please fill in all required fields");
        setSubmitting(false);
        return;
      }

      if (formData.participant_ids.length === 0) {
        setSubmitError("Please select at least one participant");
        setSubmitting(false);
        return;
      }

      // Create cohort
      const { data: cohort, error: cohortError } = await supabase
        .from("cohorts")
        .insert([
          {
            name: formData.name,
            client_id: formData.client_id,
            plan_id: formData.plan_id,
            start_date: formData.start_date,
            end_date: formData.end_date,
          },
        ])
        .select()
        .single();

      if (cohortError) {
        console.error("Error creating cohort:", cohortError);
        setSubmitError(cohortError.message);
        setSubmitting(false);
        return;
      }

      // Add participants to cohort
      const cohortParticipants = formData.participant_ids.map((client_user_id) => ({
        cohort_id: cohort.id,
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
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Cohort
        </Button>
      </div>

      {/* Cohorts Table */}
      <div className="rounded-md border">
        {cohortsLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading cohorts...</div>
        ) : cohortsError ? (
          <div className="p-8 text-center text-destructive">{cohortsError}</div>
        ) : cohorts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No active cohorts found. Click "Create Cohort" to create your first cohort.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Client</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Plan</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Start Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium">End Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.id} className="border-b hover:bg-muted/50 transition-colors">
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
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {cohort.created_at
                      ? new Date(cohort.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Cohort Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Create Cohort</DialogTitle>
            <DialogDescription>
              Create a new cohort by selecting a client, dates, and participants.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cohort Name */}
            <div className="space-y-2">
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
            <div className="space-y-2">
              <label htmlFor="client_id" className="text-sm font-medium">
                Client <span className="text-destructive">*</span>
              </label>
              <select
                id="client_id"
                name="client_id"
                value={formData.client_id}
                onChange={handleInputChange}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Plan Selection */}
            <div className="space-y-2">
              <label htmlFor="plan_id" className="text-sm font-medium">
                Plan <span className="text-destructive">*</span>
              </label>
              <select
                id="plan_id"
                name="plan_id"
                value={formData.plan_id}
                onChange={handleInputChange}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="start_date" className="text-sm font-medium">
                  Start Date <span className="text-destructive">*</span>
                </label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="end_date" className="text-sm font-medium">
                  End Date <span className="text-destructive">*</span>
                </label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            {/* Participants Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Participants <span className="text-destructive">*</span>
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
                {submitting ? "Creating..." : "Create Cohort"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
