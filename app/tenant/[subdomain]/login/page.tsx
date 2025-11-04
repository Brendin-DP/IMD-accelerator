"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TenantLogin() {
  const params = useParams();
  const router = useRouter();
  const subdomain = (params?.subdomain as string) || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

      // First, find the user by email and client_id
      console.log("📡 Fetching user:", { client_id: client.id, email });
      const { data: user, error: userError } = await supabase
        .from("client_users")
        .select("*")
        .eq("client_id", client.id)
        .eq("email", email.toLowerCase().trim())
        .eq("status", "active")
        .maybeSingle();

      if (userError) {
        console.error("❌ Error fetching user:", userError);
        setError("An error occurred. Please try again.");
        setLoading(false);
        return;
      }

      if (!user) {
        console.error("❌ User not found");
        setError("Invalid credentials");
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
      
      // Try router.push first, fallback to window.location if needed
      try {
        const dashboardPath = `/dashboard`;
        console.log("🔄 Redirecting to:", dashboardPath);
        router.push(dashboardPath);
        // Also update URL directly as fallback
        setTimeout(() => {
          window.location.href = dashboardPath;
        }, 100);
      } catch (redirectError) {
        console.error("❌ Redirect error:", redirectError);
        // Fallback to window.location
        window.location.href = `/dashboard`;
      }
    } catch (err) {
      console.error("❌ Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <form
        onSubmit={handleLogin}
        className="bg-white p-6 rounded-lg shadow-md w-full max-w-md space-y-4"
      >
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {subdomain ? subdomain.charAt(0).toUpperCase() + subdomain.slice(1) : "Portal"}
          </h1>
          <h2 className="text-lg font-medium text-gray-600">
            Login
          </h2>
          {subdomain && (
            <p className="text-sm text-gray-500">
              Access your {subdomain} portal
            </p>
          )}
        </div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
