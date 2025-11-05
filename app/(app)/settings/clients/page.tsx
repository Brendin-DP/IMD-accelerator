"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
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

interface Client {
  id: string;
  name: string;
  subdomain?: string;
  primary_contact_email?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    subdomain: "",
    primary_contact_email: "",
    status: "active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      setLoading(true);
      setError(null);
      
      // Query clients table - try different possible table names
      const { data, error: dbError } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching clients:", dbError);
        setError(`Failed to load clients: ${dbError.message}`);
        setClients([]);
      } else {
        setClients(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    // Validate subdomain if provided
    if (formData.subdomain && formData.subdomain.trim() !== "") {
      // Re-check availability before submitting
      await checkSubdomainAvailability(formData.subdomain);
      
      if (subdomainAvailable === false) {
        setSubmitError("Subdomain is already taken. Please choose a different one.");
        setSubmitting(false);
        return;
      }

      // Validate subdomain format
      const subdomainRegex = /^[a-z0-9-]+$/;
      if (!subdomainRegex.test(formData.subdomain.toLowerCase().trim())) {
        setSubmitError("Subdomain can only contain lowercase letters, numbers, and hyphens.");
        setSubmitting(false);
        return;
      }
    }

    try {
      const { data, error: dbError } = await supabase
        .from("clients")
        .insert([
          {
            name: formData.name,
            subdomain: formData.subdomain ? formData.subdomain.toLowerCase().trim() : null,
            primary_contact_email: formData.primary_contact_email || null,
            status: formData.status,
          },
        ])
        .select()
        .single();

      if (dbError) {
        console.error("Error creating client:", dbError);
        setSubmitError(dbError.message);
        return;
      }

      // Reset form and close dialog
      setFormData({
        name: "",
        subdomain: "",
        primary_contact_email: "",
        status: "active",
      });
      setSubdomainAvailable(null);
      setIsDialogOpen(false);
      
      // Refresh the clients list
      await fetchClients();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function checkSubdomainAvailability(subdomain: string) {
    if (!subdomain || subdomain.trim() === "") {
      setSubdomainAvailable(null);
      return;
    }

    // Validate subdomain format (alphanumeric and hyphens only, lowercase)
    const subdomainRegex = /^[a-z0-9-]+$/;
    if (!subdomainRegex.test(subdomain.toLowerCase())) {
      setSubdomainAvailable(false);
      return;
    }

    setCheckingSubdomain(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, subdomain")
        .eq("subdomain", subdomain.toLowerCase().trim())
        .maybeSingle();

      if (error) {
        console.error("Error checking subdomain:", error);
        setSubdomainAvailable(null);
        return;
      }

      setSubdomainAvailable(!data); // Available if no existing client found
    } catch (err) {
      console.error("Error checking subdomain:", err);
      setSubdomainAvailable(null);
    } finally {
      setCheckingSubdomain(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Check subdomain availability when subdomain field changes
    if (name === "subdomain") {
      // Normalize to lowercase
      const normalizedValue = value.toLowerCase().trim();
      setFormData((prev) => ({ ...prev, subdomain: normalizedValue }));
      checkSubdomainAvailability(normalizedValue);
    }
  }

  function handleEdit(client: Client) {
    router.push(`/settings/clients/${client.id}`);
  }

  function handleDeleteClick(clientId: string) {
    setDeletingClientId(clientId);
    setIsDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingClientId) return;

    try {
      setDeleting(true);
      
      // Delete all related data first (cascade delete)
      // Delete cohorts and their related data
      const { data: cohorts } = await supabase
        .from("cohorts")
        .select("id")
        .eq("client_id", deletingClientId);

      if (cohorts && cohorts.length > 0) {
        const cohortIds = cohorts.map((c) => c.id);
        
        // Get all cohort assessments for these cohorts
        const { data: cohortAssessments } = await supabase
          .from("cohort_assessments")
          .select("id")
          .in("cohort_id", cohortIds);

        if (cohortAssessments && cohortAssessments.length > 0) {
          const cohortAssessmentIds = cohortAssessments.map((ca) => ca.id);
          
          // Get participant assessments for these cohort assessments
          const { data: participantAssessments } = await supabase
            .from("participant_assessments")
            .select("id")
            .in("cohort_assessment_id", cohortAssessmentIds);

          if (participantAssessments && participantAssessments.length > 0) {
            const participantAssessmentIds = participantAssessments.map((pa) => pa.id);
            
            // Delete nominations
            await supabase
              .from("reviewer_nominations")
              .delete()
              .in("participant_assessment_id", participantAssessmentIds);
          }

          // Delete participant assessments
          await supabase
            .from("participant_assessments")
            .delete()
            .in("cohort_assessment_id", cohortAssessmentIds);
        }

        // Delete cohort assessments
        await supabase
          .from("cohort_assessments")
          .delete()
          .in("cohort_id", cohortIds);

        // Delete cohort participants
        await supabase
          .from("cohort_participants")
          .delete()
          .in("cohort_id", cohortIds);

        // Delete cohorts
        await supabase
          .from("cohorts")
          .delete()
          .eq("client_id", deletingClientId);
      }

      // Delete client users and their related data
      const { data: clientUsers } = await supabase
        .from("client_users")
        .select("id")
        .eq("client_id", deletingClientId);

      if (clientUsers && clientUsers.length > 0) {
        const clientUserIds = clientUsers.map((cu) => cu.id);
        
        // Delete external reviewers invited by these users
        await supabase
          .from("external_reviewers")
          .delete()
          .in("invited_by_id", clientUserIds);

        // Delete client users
        await supabase
          .from("client_users")
          .delete()
          .eq("client_id", deletingClientId);
      }

      // Finally, delete the client
      const { error: deleteError } = await supabase
        .from("clients")
        .delete()
        .eq("id", deletingClientId);

      if (deleteError) {
        console.error("Error deleting client:", deleteError);
        setSubmitError(deleteError.message);
        return;
      }

      // Close dialog and refresh list
      setIsDeleteDialogOpen(false);
      setDeletingClientId(null);
      await fetchClients();
    } catch (err) {
      console.error("Error deleting client:", err);
      setSubmitError(err instanceof Error ? err.message : "An error occurred while deleting the client");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Client Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Client Management</h1>
          <p className="text-muted-foreground mt-2">Manage clients and organizations</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      {/* Clients Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading clients...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No clients found. Click "Add Client" to create your first client.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Client Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Subdomain</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Primary Contact Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="border-b hover:bg-muted/50 transition-colors"
                >
                  <td 
                    className="px-6 py-4 text-sm font-medium cursor-pointer"
                    onClick={() => router.push(`/settings/clients/${client.id}`)}
                  >
                    {client.name || "-"}
                  </td>
                  <td 
                    className="px-6 py-4 text-sm text-muted-foreground cursor-pointer"
                    onClick={() => router.push(`/settings/clients/${client.id}`)}
                  >
                    {client.subdomain || "-"}
                  </td>
                  <td 
                    className="px-6 py-4 text-sm cursor-pointer"
                    onClick={() => router.push(`/settings/clients/${client.id}`)}
                  >
                    {client.primary_contact_email || "-"}
                  </td>
                  <td 
                    className="px-6 py-4 text-sm cursor-pointer"
                    onClick={() => router.push(`/settings/clients/${client.id}`)}
                  >
                    {client.status ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          client.status === "active"
                            ? "bg-green-100 text-green-800"
                            : client.status === "inactive"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {client.status}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td 
                    className="px-6 py-4 text-sm text-muted-foreground cursor-pointer"
                    onClick={() => router.push(`/settings/clients/${client.id}`)}
                  >
                    {client.created_at
                      ? new Date(client.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
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
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(client);
                        }}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Client
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(client.id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Client
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Client Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client by filling in the information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Client Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Client name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="subdomain" className="text-sm font-medium">
                Subdomain
              </label>
              <Input
                id="subdomain"
                name="subdomain"
                value={formData.subdomain}
                onChange={handleInputChange}
                placeholder="client-name"
                className={subdomainAvailable === false ? "border-red-500" : subdomainAvailable === true ? "border-green-500" : ""}
              />
              {checkingSubdomain && (
                <p className="text-xs text-muted-foreground">Checking availability...</p>
              )}
              {subdomainAvailable === true && formData.subdomain && (
                <p className="text-xs text-green-600">✓ Subdomain is available</p>
              )}
              {subdomainAvailable === false && formData.subdomain && (
                <p className="text-xs text-red-600">✗ Subdomain is already taken</p>
              )}
              {formData.subdomain && !/^[a-z0-9-]+$/.test(formData.subdomain.toLowerCase()) && (
                <p className="text-xs text-red-600">Subdomain can only contain lowercase letters, numbers, and hyphens</p>
              )}
              <p className="text-xs text-muted-foreground">
                This will be used for the subdomain URL (e.g., {formData.subdomain || "client-name"}.yourdomain.com)
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="primary_contact_email" className="text-sm font-medium">
                Primary Contact Email
              </label>
              <Input
                id="primary_contact_email"
                name="primary_contact_email"
                type="email"
                value={formData.primary_contact_email}
                onChange={handleInputChange}
                placeholder="contact@example.com"
              />
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this client? This action cannot be undone and will delete all associated data including cohorts, participants, and assessments.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingClientId(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Client"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

