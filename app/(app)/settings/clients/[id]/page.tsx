"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, ArrowLeft, ChevronDown, UserPlus, Upload, Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  domain?: string;
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
        .select("*")
        .eq("id", clientId)
        .single();

      if (dbError) {
        console.error("Error fetching client:", dbError);
        setError(`Failed to load client: ${dbError.message}`);
        setClient(null);
      } else {
        setClient(data);
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
        <Button variant="outline" onClick={() => router.push("/settings/clients")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Back and Add User Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push("/settings/clients")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{client.name}</h1>
            <p className="text-muted-foreground mt-2">Client details and user management</p>
          </div>
        </div>
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
              <label className="text-sm font-medium text-muted-foreground">Domain</label>
              <p className="text-sm font-medium mt-1">{client.domain || "-"}</p>
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
        <h2 className="text-2xl font-bold mb-4">Client Users</h2>
        <div className="rounded-md border">
          {users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No users found. Click "Add User" to add users to this client.
            </div>
          ) : (
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
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">{user.name || "-"}</td>
                    <td className="px-6 py-4 text-sm font-medium">{user.surname || "-"}</td>
                    <td className="px-6 py-4 text-sm">{user.email || "-"}</td>
                    <td className="px-6 py-4 text-sm">
                      {/* Actions will go here */}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
    </div>
  );
}

