"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Palette, Image, Save, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { supabase } from "@/lib/supabaseClient";
import { Theme } from "@/lib/useTheme";

interface Client {
  id: string;
  name: string;
  subdomain?: string;
  [key: string]: any;
}

export default function ThemeCustomizationPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [themeFormData, setThemeFormData] = useState({
    primaryColor: "#7335d6",
    secondaryColor: "#64748b",
    logoUrl: "",
    appTitle: "",
  });
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);

  useEffect(() => {
    if (clientId) {
      fetchClientDetails();
      fetchTheme();
    }
  }, [clientId]);

  // Don't apply theme to admin page - only show in preview components

  async function fetchClientDetails() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: dbError } = await supabase
        .from("clients")
        .select("id, name, subdomain")
        .eq("id", clientId)
        .single();

      if (dbError) {
        console.error("Error fetching client:", dbError);
        setError(`Failed to load client: ${dbError.message}`);
        return;
      }

      setClient(data);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTheme() {
    if (!clientId) return;

    try {
      const response = await fetch(`/api/themes/${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentTheme(data.theme);
        if (data.theme) {
          const themeData = {
            primaryColor: data.theme.primaryColor || "#7335d6",
            secondaryColor: data.theme.secondaryColor || "#64748b",
            logoUrl: data.theme.logoUrl || "",
            appTitle: data.theme.appTitle || client?.name || "",
          };
          setThemeFormData(themeData);
          setPreviewTheme(data.theme);
        } else if (client) {
          setThemeFormData({
            primaryColor: "#7335d6",
            secondaryColor: "#64748b",
            logoUrl: "",
            appTitle: client.name || "",
          });
        }
      }
    } catch (err) {
      console.error("Error fetching theme:", err);
    }
  }

  useEffect(() => {
    if (client) {
      fetchTheme();
    }
  }, [client]);

  async function handleSaveTheme(e: React.FormEvent) {
    e.preventDefault();
    setSavingTheme(true);
    setThemeError(null);

    try {
      const themeData = {
        primaryColor: themeFormData.primaryColor,
        secondaryColor: themeFormData.secondaryColor || undefined,
        logoUrl: themeFormData.logoUrl || undefined,
        appTitle: themeFormData.appTitle || undefined,
      };

      const response = await fetch(`/api/themes/${clientId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(themeData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save theme");
      }

      const data = await response.json();
      setCurrentTheme(data.theme);
      setPreviewTheme(data.theme);
      // Show success message (could use toast)
      alert("Theme saved successfully!");
    } catch (err) {
      console.error("Error saving theme:", err);
      setThemeError(err instanceof Error ? err.message : "Failed to save theme");
    } finally {
      setSavingTheme(false);
    }
  }

  function handleThemeInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setThemeFormData((prev) => ({ ...prev, [name]: value }));
    
    // Update preview theme immediately
    const updatedPreview: Theme = {
      primaryColor: name === "primaryColor" ? value : themeFormData.primaryColor,
      secondaryColor: name === "secondaryColor" ? value : themeFormData.secondaryColor,
      logoUrl: name === "logoUrl" ? value : themeFormData.logoUrl,
      appTitle: name === "appTitle" ? value : themeFormData.appTitle,
    };
    setPreviewTheme(updatedPreview);
  }

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const logoUrl = `/logos/${clientId}-${file.name}`;
        setThemeFormData((prev) => ({ ...prev, logoUrl }));
        setPreviewTheme((prev) => prev ? { ...prev, logoUrl } : { logoUrl } as Theme);
      };
      reader.readAsDataURL(file);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading theme customization...</div>
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
          { label: client.name, href: `/settings/clients/${clientId}` },
          { label: "Theme" },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push(`/settings/clients/${clientId}`)} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Client Details
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Theme Customization</h1>
        <p className="text-muted-foreground mt-2">
          Customize the theme for {client.name}'s tenant portal
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Theme Configuration Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Theme Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveTheme} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="appTitle" className="text-sm font-medium">
                  App Title <span className="text-destructive">*</span>
                </label>
                <Input
                  id="appTitle"
                  name="appTitle"
                  value={themeFormData.appTitle}
                  onChange={handleThemeInputChange}
                  required
                  placeholder={client?.name || "Client Name Portal"}
                />
                <p className="text-xs text-muted-foreground">
                  This will replace "IMD Accelerator" in the sidebar and login page
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="primaryColor" className="text-sm font-medium">
                    Primary Color <span className="text-destructive">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="primaryColor"
                      name="primaryColor"
                      value={themeFormData.primaryColor}
                      onChange={handleThemeInputChange}
                      className="h-10 w-20 rounded border cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={themeFormData.primaryColor}
                      onChange={handleThemeInputChange}
                      name="primaryColor"
                      placeholder="#7335d6"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for primary buttons, sidebar, and accents
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="secondaryColor" className="text-sm font-medium">
                    Secondary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="secondaryColor"
                      name="secondaryColor"
                      value={themeFormData.secondaryColor}
                      onChange={handleThemeInputChange}
                      className="h-10 w-20 rounded border cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={themeFormData.secondaryColor}
                      onChange={handleThemeInputChange}
                      name="secondaryColor"
                      placeholder="#64748b"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional: Used for secondary elements
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="logoUrl" className="text-sm font-medium">
                  Logo URL
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="logoUrl"
                    name="logoUrl"
                    type="text"
                    value={themeFormData.logoUrl}
                    onChange={handleThemeInputChange}
                    placeholder="/logos/client-logo.png"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                    id="logo-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("logo-upload")?.click()}
                  >
                    <Image className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                </div>
                {themeFormData.logoUrl && (
                  <div className="mt-2">
                    <img
                      src={themeFormData.logoUrl}
                      alt="Logo preview"
                      className="h-16 object-contain border rounded p-2"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  URL or path to the logo image (e.g., /logos/client-logo.png)
                </p>
              </div>

              {themeError && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {themeError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/settings/clients/${clientId}`)}
                  disabled={savingTheme}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingTheme}>
                  <Save className="mr-2 h-4 w-4" />
                  {savingTheme ? "Saving..." : "Save Theme"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Live Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Preview how the theme will look on the tenant portal
              </p>
              
              {/* Sidebar Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div
                  className="p-4 text-white"
                  style={{
                    backgroundColor: previewTheme?.primaryColor || themeFormData.primaryColor,
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {previewTheme?.logoUrl && (
                      <img
                        src={previewTheme.logoUrl}
                        alt="Logo"
                        className="h-8 w-auto object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <h3 className="text-lg font-semibold">
                      {previewTheme?.appTitle || themeFormData.appTitle || "IMD Accelerator"}
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <div className="px-3 py-2 rounded bg-white/20 text-sm">Dashboard</div>
                    <div className="px-3 py-2 rounded bg-white/10 text-sm opacity-80">Cohorts</div>
                  </div>
                </div>
              </div>

              {/* Login Page Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div
                  className="p-6 text-white"
                  style={{
                    background: `linear-gradient(to bottom right, ${previewTheme?.primaryColor || themeFormData.primaryColor}, ${previewTheme?.primaryColor || themeFormData.primaryColor}dd)`,
                  }}
                >
                  <div className="text-center space-y-4">
                    {previewTheme?.logoUrl && (
                      <img
                        src={previewTheme.logoUrl}
                        alt="Logo"
                        className="h-12 w-auto object-contain mx-auto"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <h2 className="text-2xl font-bold">
                      {previewTheme?.appTitle || themeFormData.appTitle || "IMD Accelerator"}
                    </h2>
                    <p className="text-sm opacity-90">Access your assessment portal</p>
                  </div>
                </div>
                <div className="p-6 bg-gray-50">
                  <div className="space-y-3">
                    <div className="h-10 bg-white border rounded"></div>
                    <div className="h-10 bg-white border rounded"></div>
                    <div
                      className="h-10 rounded text-white text-center flex items-center justify-center text-sm font-medium"
                      style={{
                        backgroundColor: previewTheme?.primaryColor || themeFormData.primaryColor,
                      }}
                    >
                      Sign In
                    </div>
                  </div>
                </div>
              </div>

              {/* Color Swatches */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Primary Color
                  </label>
                  <div
                    className="h-16 rounded border"
                    style={{
                      backgroundColor: previewTheme?.primaryColor || themeFormData.primaryColor,
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {previewTheme?.primaryColor || themeFormData.primaryColor}
                  </p>
                </div>
                {previewTheme?.secondaryColor && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-2 block">
                      Secondary Color
                    </label>
                    <div
                      className="h-16 rounded border"
                      style={{
                        backgroundColor: previewTheme.secondaryColor,
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {previewTheme.secondaryColor}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
