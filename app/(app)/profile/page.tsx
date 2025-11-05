"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    surname: "",
    email: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("imd_admin");
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setFormData({
          name: userData.name || "",
          surname: userData.surname || "",
          email: userData.email || "",
        });
      } catch (error) {
        console.error("Error parsing user data:", error);
        router.push("/login");
      }
    } else {
      router.push("/login");
    }
    setLoading(false);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: updateError } = await supabase
        .from("imd_users")
        .update({
          name: formData.name.trim() || null,
          surname: formData.surname.trim() || null,
          email: formData.email.toLowerCase().trim(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        setError(`Failed to update profile: ${updateError.message}`);
        setSaving(false);
        return;
      }

      // Update local storage
      const updatedUser = {
        ...user,
        name: formData.name.trim() || null,
        surname: formData.surname.trim() || null,
        email: formData.email.toLowerCase().trim(),
      };
      localStorage.setItem("imd_admin", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setSuccess(true);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <div className="p-8 text-center text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">User not found. Please log in again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-2">Manage your account information</p>
      </div>

      {/* Profile Form */}
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your personal information and email address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  First Name
                </label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter your first name"
                />
              </div>

              {/* Surname */}
              <div className="space-y-2">
                <label htmlFor="surname" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Last Name
                </label>
                <Input
                  id="surname"
                  name="surname"
                  type="text"
                  value={formData.surname}
                  onChange={handleInputChange}
                  placeholder="Enter your last name"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Email <span className="text-destructive">*</span>
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter your email"
                />
              </div>

              {/* Role (Read-only) */}
              {user.role && (
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Role
                  </label>
                  <Input
                    type="text"
                    value={user.role}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">Role cannot be changed from this page</p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="rounded-md bg-destructive/15 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="rounded-md bg-green-50 p-3">
                  <p className="text-sm text-green-800">Profile updated successfully!</p>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end gap-2 pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
