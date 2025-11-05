"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, ArrowLeft, ChevronDown, UserPlus, Upload, Download, FileUp, MoreVertical, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
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

interface ClientUser {
  id: string;
  name?: string;
  surname?: string;
  email?: string;
  [key: string]: any;
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    surname: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    subdomain: "",
    primary_contact_email: "",
    status: "active" as string,
  });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [editUserFormData, setEditUserFormData] = useState({
    name: "",
    surname: "",
    email: "",
  });
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) {
      fetchClientDetails();
      fetchClientUsers();
    }
  }, [clientId]);

  async function fetchClientDetails() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("clients")
        .select("id, name, subdomain, primary_contact_email, status, created_at")
        .eq("id", clientId)
        .single();

      if (dbError) {
        console.error("Error fetching client:", dbError);
        setError(`Failed to load client: ${dbError.message}`);
        setClient(null);
      } else {
        console.log("Fetched client data:", data); // Debug log
        setClient(data);
        // Populate edit form with current client data
        setEditFormData({
          name: data.name || "",
          subdomain: data.subdomain || "",
          primary_contact_email: data.primary_contact_email || "",
          status: data.status || "active",
        });
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setClient(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchClientUsers() {
    try {
      // Query client_users table - adjust table name if different
      const { data, error: dbError } = await supabase
        .from("client_users")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching client users:", dbError);
        // If table doesn't exist, just set empty array
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    } catch (err) {
      console.error("Error fetching client users:", err);
      setUsers([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const { data, error: dbError } = await supabase
        .from("client_users")
        .insert([
          {
            client_id: clientId,
            name: formData.name,
            surname: formData.surname || null,
            email: formData.email,
          },
        ])
        .select()
        .single();

      if (dbError) {
        console.error("Error creating client user:", dbError);
        setSubmitError(dbError.message);
        return;
      }

      // Reset form and close dialog
      setFormData({
        name: "",
        surname: "",
        email: "",
      });
      setIsDialogOpen(false);

      // Refresh the users list
      await fetchClientUsers();
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function checkSubdomainAvailability(subdomain: string, currentClientId: string) {
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

      // Available if no existing client found, or if it's the current client
      setSubdomainAvailable(!data || data.id === currentClientId);
    } catch (err) {
      console.error("Error checking subdomain:", err);
      setSubdomainAvailable(null);
    } finally {
      setCheckingSubdomain(false);
    }
  }

  function handleEditInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
    
    // Check subdomain availability when subdomain field changes
    if (name === "subdomain") {
      // Normalize to lowercase
      const normalizedValue = value.toLowerCase().trim();
      setEditFormData((prev) => ({ ...prev, subdomain: normalizedValue }));
      checkSubdomainAvailability(normalizedValue, clientId);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEditing(true);
    setEditError(null);

    // Validate subdomain if provided
    if (editFormData.subdomain && editFormData.subdomain.trim() !== "") {
      // Re-check availability before submitting
      await checkSubdomainAvailability(editFormData.subdomain, clientId);
      
      if (subdomainAvailable === false) {
        setEditError("Subdomain is already taken. Please choose a different one.");
        setEditing(false);
        return;
      }

      // Validate subdomain format
      const subdomainRegex = /^[a-z0-9-]+$/;
      if (!subdomainRegex.test(editFormData.subdomain.toLowerCase().trim())) {
        setEditError("Subdomain can only contain lowercase letters, numbers, and hyphens.");
        setEditing(false);
        return;
      }
    }

    try {
      const { error: dbError } = await supabase
        .from("clients")
        .update({
          name: editFormData.name,
          subdomain: editFormData.subdomain ? editFormData.subdomain.toLowerCase().trim() : null,
          primary_contact_email: editFormData.primary_contact_email || null,
          status: editFormData.status,
        })
        .eq("id", clientId);

      if (dbError) {
        console.error("Error updating client:", dbError);
        setEditError(dbError.message);
        return;
      }

      // Refresh client data
      await fetchClientDetails();
      setSubdomainAvailable(null);
      setIsEditDialogOpen(false);
    } catch (err) {
      console.error("Unexpected error:", err);
      setEditError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setEditing(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
        setImportError(null);
      } else {
        setImportError("Please upload a CSV file");
        setSelectedFile(null);
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
        setImportError(null);
      } else {
        setImportError("Please upload a CSV file");
        setSelectedFile(null);
      }
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function downloadCSVTemplate() {
    const headers = ["name", "surname", "email"];
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "user_import_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleEditUserSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setSubmitting(true);
      setSubmitError(null);

      const { error: updateError } = await supabase
        .from("client_users")
        .update({
          name: editUserFormData.name.trim(),
          surname: editUserFormData.surname.trim(),
          email: editUserFormData.email.trim().toLowerCase(),
        })
        .eq("id", editingUser.id);

      if (updateError) {
        console.error("Error updating user:", updateError);
        setSubmitError(`Failed to update user: ${updateError.message}`);
        return;
      }

      // Refresh users list
      await fetchClientUsers();
      setIsEditUserDialogOpen(false);
      setEditingUser(null);
      setEditUserFormData({ name: "", surname: "", email: "" });
    } catch (err) {
      console.error("Unexpected error:", err);
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingUserId(userId);

      const { error: deleteError } = await supabase
        .from("client_users")
        .delete()
        .eq("id", userId);

      if (deleteError) {
        console.error("Error deleting user:", deleteError);
        alert(`Failed to delete user: ${deleteError.message}`);
        return;
      }

      // Refresh users list
      await fetchClientUsers();
    } catch (err) {
      console.error("Unexpected error:", err);
      alert(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleImport() {
    if (!selectedFile) {
      setImportError("Please select a CSV file");
      return;
    }

    setImporting(true);
    setImportError(null);

    try {
      const text = await selectedFile.text();
      const lines = text.split("\n").filter((line) => line.trim());
      
      if (lines.length < 2) {
        setImportError("CSV file must contain at least a header row and one data row");
        setImporting(false);
        return;
      }

      // Parse CSV (simple parser - assumes no commas in values)
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIndex = headers.indexOf("name");
      const surnameIndex = headers.indexOf("surname");
      const emailIndex = headers.indexOf("email");

      if (nameIndex === -1 || surnameIndex === -1 || emailIndex === -1) {
        setImportError("CSV must contain columns: name, surname, email");
        setImporting(false);
        return;
      }

      const usersToImport = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        if (values[nameIndex] && values[surnameIndex] && values[emailIndex]) {
          usersToImport.push({
            client_id: clientId,
            name: values[nameIndex],
            surname: values[surnameIndex],
            email: values[emailIndex],
          });
        }
      }

      if (usersToImport.length === 0) {
        setImportError("No valid users found in CSV file");
        setImporting(false);
        return;
      }

      // Insert users into database
      const { error: dbError } = await supabase
        .from("client_users")
        .insert(usersToImport);

      if (dbError) {
        console.error("Error importing users:", dbError);
        setImportError(dbError.message);
        setImporting(false);
        return;
      }

      // Reset and close dialog
      setSelectedFile(null);
      setIsImportDialogOpen(false);
      
      // Refresh the users list
      await fetchClientUsers();
    } catch (err) {
      console.error("Error processing CSV:", err);
      setImportError(err instanceof Error ? err.message : "Failed to process CSV file");
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading client details...</div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">
          {error || "Client not found"}
        </div>
        <Button variant="tertiary" onClick={() => router.push("/settings/clients")} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Clients", href: "/settings/clients" },
          { label: client.name },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push("/settings/clients")} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Clients
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{client.name}</h1>
        <p className="text-muted-foreground mt-2">Client details and user management</p>
      </div>

      {/* Client Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Client Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Client Name</label>
              <p className="text-sm font-medium mt-1">{client.name || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Subdomain</label>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm font-medium">{client?.subdomain || "-"}</p>
                {client?.subdomain && (
                  <span className="text-xs text-muted-foreground">
                    ({client.subdomain}.yourdomain.com)
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Refresh edit form data from current client state
                    if (client) {
                      setEditFormData({
                        name: client.name || "",
                        subdomain: client.subdomain || "",
                        primary_contact_email: client.primary_contact_email || "",
                        status: client.status || "active",
                      });
                      setSubdomainAvailable(null);
                    }
                    setIsEditDialogOpen(true);
                  }}
                  className="ml-auto"
                >
                  Edit
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Primary Contact Email</label>
              <p className="text-sm font-medium mt-1">{client.primary_contact_email || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <p className="text-sm font-medium mt-1">
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
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created</label>
              <p className="text-sm font-medium mt-1">
                {client.created_at
                  ? new Date(client.created_at).toLocaleDateString()
                  : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Users Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Client Users</h2>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-64"
            />
            <div className="flex items-center">
              <Button onClick={() => setIsDialogOpen(true)} className="rounded-r-none border-r-0">
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" className="rounded-l-none px-2 border-l border-primary/20">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite a User
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsImportDialogOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Users
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="rounded-md border">
          {(() => {
            // Filter users based on search
            const filteredUsers = users.filter((user) => {
              if (!userSearch.trim()) return true;
              const searchLower = userSearch.toLowerCase();
              const name = (user.name || "").toLowerCase();
              const surname = (user.surname || "").toLowerCase();
              const email = (user.email || "").toLowerCase();
              return name.includes(searchLower) || surname.includes(searchLower) || email.includes(searchLower);
            });

            if (filteredUsers.length === 0) {
              return (
                <div className="p-8 text-center text-muted-foreground">
                  {userSearch.trim() 
                    ? "No users match your search." 
                    : "No users found. Click \"Add User\" to add users to this client."}
                </div>
              );
            }

            return (
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Surname</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium">{user.name || "-"}</td>
                      <td className="px-6 py-4 text-sm font-medium">{user.surname || "-"}</td>
                      <td className="px-6 py-4 text-sm">{user.email || "-"}</td>
                      <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingUser(user);
                                setEditUserFormData({
                                  name: user.name || "",
                                  surname: user.surname || "",
                                  email: user.email || "",
                                });
                                setIsEditUserDialogOpen(true);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-destructive"
                              disabled={deletingUserId === user.id}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {deletingUserId === user.id ? "Deleting..." : "Delete User"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Add a new user to this client by entering their information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="First name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="surname" className="text-sm font-medium">
                Surname <span className="text-destructive">*</span>
              </label>
              <Input
                id="surname"
                name="surname"
                value={formData.surname}
                onChange={handleInputChange}
                required
                placeholder="Last name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="user@example.com"
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
                {submitting ? "Inviting..." : "Invite User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Users Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsImportDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Import Users</DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import users. The file should contain name, surname, and email columns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* File Upload Area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                selectedFile
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <FileUp className="h-10 w-10 text-muted-foreground" />
                {selectedFile ? (
                  <div className="mt-2">
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-sm font-medium">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      CSV file only
                    </p>
                  </div>
                )}
              </label>
            </div>

            {importError && (
              <p className="text-sm text-destructive">{importError}</p>
            )}

            {/* Download Template Button */}
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={downloadCSVTemplate}
                disabled={importing}
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV Template
              </Button>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsImportDialogOpen(false);
                  setSelectedFile(null);
                  setImportError(null);
                }}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={!selectedFile || importing}
              >
                {importing ? "Importing..." : "Import Users"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsEditUserDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUserSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="edit_user_name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_user_name"
                name="name"
                value={editUserFormData.name}
                onChange={(e) => setEditUserFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit_user_surname" className="text-sm font-medium">
                Surname <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_user_surname"
                name="surname"
                value={editUserFormData.surname}
                onChange={(e) => setEditUserFormData((prev) => ({ ...prev, surname: e.target.value }))}
                required
                placeholder="Last name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit_user_email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_user_email"
                name="email"
                type="email"
                value={editUserFormData.email}
                onChange={(e) => setEditUserFormData((prev) => ({ ...prev, email: e.target.value }))}
                required
                placeholder="user@example.com"
              />
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditUserDialogOpen(false);
                  setEditingUser(null);
                  setEditUserFormData({ name: "", surname: "", email: "" });
                  setSubmitError(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating..." : "Update User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogClose onClick={() => setIsEditDialogOpen(false)} />
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>
              Update client information below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="edit_name" className="text-sm font-medium">
                Client Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_name"
                name="name"
                value={editFormData.name}
                onChange={handleEditInputChange}
                required
                placeholder="Client name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit_subdomain" className="text-sm font-medium">
                Subdomain
              </label>
              <Input
                id="edit_subdomain"
                name="subdomain"
                value={editFormData.subdomain}
                onChange={handleEditInputChange}
                placeholder="client-name"
                className={subdomainAvailable === false ? "border-red-500" : subdomainAvailable === true ? "border-green-500" : ""}
              />
              {checkingSubdomain && (
                <p className="text-xs text-muted-foreground">Checking availability...</p>
              )}
              {subdomainAvailable === true && editFormData.subdomain && (
                <p className="text-xs text-green-600">✓ Subdomain is available</p>
              )}
              {subdomainAvailable === false && editFormData.subdomain && (
                <p className="text-xs text-red-600">✗ Subdomain is already taken</p>
              )}
              {editFormData.subdomain && !/^[a-z0-9-]+$/.test(editFormData.subdomain.toLowerCase()) && (
                <p className="text-xs text-red-600">Subdomain can only contain lowercase letters, numbers, and hyphens</p>
              )}
              <p className="text-xs text-muted-foreground">
                This will be used for the subdomain URL (e.g., {editFormData.subdomain || "client-name"}.yourdomain.com)
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="edit_primary_contact_email" className="text-sm font-medium">
                Primary Contact Email
              </label>
              <Input
                id="edit_primary_contact_email"
                name="primary_contact_email"
                type="email"
                value={editFormData.primary_contact_email}
                onChange={handleEditInputChange}
                placeholder="contact@example.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit_status" className="text-sm font-medium">
                Status
              </label>
              <select
                id="edit_status"
                name="status"
                value={editFormData.status}
                onChange={handleEditInputChange}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSubdomainAvailable(null);
                }}
                disabled={editing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editing}>
                {editing ? "Updating..." : "Update Client"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

