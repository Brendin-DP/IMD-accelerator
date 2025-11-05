"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button, Input, Card } from "@/components/ui";

export default function TenantLogin() {
  const params = useParams();
  const router = useRouter();
  const subdomain = (params?.subdomain as string) || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState<string>("");

  // Fetch client name on mount
  useEffect(() => {
    if (subdomain) {
      supabase
        .from("clients")
        .select("name")
        .eq("subdomain", subdomain)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setClientName(data.name);
          }
        });
    }
  }, [subdomain]);

  // Debug: Log when component mounts
  console.log("🎯 TenantLogin component mounted", { subdomain, params });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🚀 Login form submitted", { subdomain, email });
    setError("");
    setLoading(true);

    if (!subdomain) {
      console.error("❌ No subdomain found");
      setError("Invalid tenant subdomain");
      setLoading(false);
      return;
    }

    try {
      console.log("📡 Fetching client for subdomain:", subdomain);
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("subdomain", subdomain)
        .single();

      if (clientError || !client) {
        console.error("❌ Client not found:", clientError);
        setError("Invalid tenant");
        setLoading(false);
        return;
      }

      console.log("✅ Client found:", client.id);

      // First, check if user exists by email (without client filter)
      const normalizedEmail = email.toLowerCase().trim();
      console.log("📡 Checking if user exists:", { email: normalizedEmail });
      const { data: userByEmail, error: emailCheckError } = await supabase
        .from("client_users")
        .select("id, email, client_id, status")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (emailCheckError) {
        console.error("❌ Error checking user:", emailCheckError);
        setError("An error occurred. Please try again.");
        setLoading(false);
        return;
      }

      // If user doesn't exist at all, show invalid credentials
      if (!userByEmail) {
        console.error("❌ User not found");
        setError("Invalid credentials");
        setLoading(false);
        return;
      }

      // If user exists but doesn't belong to this client, show specific error
      if (userByEmail.client_id !== client.id) {
        console.error("❌ User belongs to different client. User client_id:", userByEmail.client_id, "Subdomain client_id:", client.id);
        setError("You are not part of this organization. Please contact your administrator or use the correct portal.");
        setLoading(false);
        return;
      }

      // If user exists but is not active, show error
      if (userByEmail.status !== "active") {
        console.error("❌ User is not active");
        setError("Your account is not active. Please contact your administrator.");
        setLoading(false);
        return;
      }

      // Now fetch the full user data for this client
      console.log("📡 Fetching full user data:", { client_id: client.id, email: normalizedEmail });
      const { data: user, error: userError } = await supabase
        .from("client_users")
        .select("*")
        .eq("client_id", client.id)
        .eq("email", normalizedEmail)
        .eq("status", "active")
        .single();

      if (userError || !user) {
        console.error("❌ Error fetching user data:", userError);
        setError("An error occurred. Please try again.");
        setLoading(false);
        return;
      }

      console.log("✅ User found:", { id: user.id, email: user.email });

      // Check if password field exists (it might be password_hash or password)
      const userPassword = (user as any).password_hash || (user as any).password;
      
      console.log("🔑 Password check:", { 
        hasPasswordHash: !!(user as any).password_hash,
        hasPassword: !!(user as any).password,
        userFields: Object.keys(user)
      });
      
      if (!userPassword) {
        console.error("❌ No password field found");
        setError("Password not set for this user. Please contact support.");
        setLoading(false);
        return;
      }

      // Compare passwords
      if (userPassword !== password) {
        console.error("❌ Password mismatch");
        setError("Invalid credentials");
        setLoading(false);
        return;
      }

      console.log("✅ Login successful, redirecting...");

      localStorage.setItem("participant", JSON.stringify(user));
      
      // Redirect to tenant dashboard with subdomain
      const dashboardPath = `/tenant/${subdomain}/dashboard`;
      console.log("🔄 Redirecting to:", dashboardPath);
      
      setLoading(false);
      router.push(dashboardPath);
    } catch (err) {
      console.error("❌ Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image/Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 items-center justify-center p-12">
        <div className="text-white space-y-6 max-w-md">
          <h1 className="text-5xl font-bold">IMD Accelerator</h1>
          <p className="text-xl text-white/90">
            Access your assessment portal. Complete assessments, nominate reviewers, and track your progress.
          </p>
          <div className="flex items-center gap-2 pt-4">
            <div className="w-12 h-1 bg-white/30 rounded"></div>
            <div className="w-24 h-1 bg-white rounded"></div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <Card className="p-8 w-full max-w-md space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-gray-900">Welcome Back</h2>
            <p className="text-gray-600">
              {clientName ? `Sign in to your ${clientName} account` : "Sign in to your account"}
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Logging in..." : "Sign In"}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
              >
                Login with SSO
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
