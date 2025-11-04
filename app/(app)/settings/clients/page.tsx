"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/settings/clients/${client.id}`)}
                >
                  <td className="px-6 py-4 text-sm font-medium">{client.name || "-"}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {client.subdomain || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">{client.primary_contact_email || "-"}</td>
                  <td className="px-6 py-4 text-sm">
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
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {client.created_at
                      ? new Date(client.created_at).toLocaleDateString()
                      : "-"}
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
    </div>
  );
}

