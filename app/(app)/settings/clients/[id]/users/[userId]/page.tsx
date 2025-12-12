"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";

interface ClientUser {
  id: string;
  name?: string;
  surname?: string;
  email?: string;
  status?: string;
  password_hash?: string;
  created_at?: string;
  [key: string]: any;
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const userId = params.userId as string;

  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (userId && clientId) {
      fetchUserDetails();
    }
  }, [userId, clientId]);

  async function fetchUserDetails() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("client_users")
        .select("*")
        .eq("id", userId)
        .eq("client_id", clientId)
        .single();

      if (dbError) {
        console.error("Error fetching user:", dbError);
        setError(`Failed to load user: ${dbError.message}`);
        setUser(null);
      } else {
        setUser(data);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    if (!password.trim()) {
      setSaveError("Password cannot be empty");
      setSaving(false);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("client_users")
        .update({ password_hash: password })
        .eq("id", userId)
        .eq("client_id", clientId);

      if (updateError) {
        console.error("Error updating password:", updateError);
        setSaveError(`Failed to update password: ${updateError.message}`);
      } else {
        setSaveSuccess(true);
        setPassword("");
        // Refresh user data
        await fetchUserDetails();
        // Clear success message after 3 seconds
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setSaveError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading user details...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-6">
        <Button variant="tertiary" onClick={() => router.push(`/settings/clients/${clientId}`)} className="p-0 h-auto">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Client
        </Button>
        <div className="p-8 text-center text-destructive">{error || "User not found"}</div>
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
          { label: "Client", href: `/settings/clients/${clientId}` },
          { label: `${user.name || ""} ${user.surname || ""}`.trim() || user.email || "User" },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push(`/settings/clients/${clientId}`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Client
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          {user.name || user.surname ? `${user.name || ""} ${user.surname || ""}`.trim() : user.email || "User"}
        </h1>
        <p className="text-muted-foreground mt-2">User details and password management</p>
      </div>

      {/* User Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <p className="text-sm font-medium mt-1">{user.name || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Surname</label>
              <p className="text-sm font-medium mt-1">{user.surname || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="text-sm font-medium mt-1">{user.email || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <p className="text-sm font-medium mt-1">{user.status || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Created At</label>
              <p className="text-sm font-medium mt-1">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Password Set</label>
              <p className="text-sm font-medium mt-1">{user.password_hash ? "Yes" : "No"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Management Card */}
      <Card>
        <CardHeader>
          <CardTitle>Password Management</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Set Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="max-w-md"
              />
              <p className="text-sm text-muted-foreground">
                This will update the password_hash field in the database. The password will be stored as plain text (temporary workaround).
              </p>
            </div>

            {saveError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                Password updated successfully!
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !password.trim()}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

