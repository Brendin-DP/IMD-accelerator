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

  // Debug: Log component mount and params
  console.log("TenantLogin component rendered", { subdomain, params });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Login form submitted"); // Debug log
    setError("");
    setLoading(true);

    console.log("Subdomain:", subdomain); // Debug log
    console.log("Email:", email); // Debug log

    if (!subdomain) {
      console.error("No subdomain found");
      setError("Invalid tenant subdomain");
      setLoading(false);
      return;
    }

    try {
      console.log("Starting login process..."); // Debug log
      console.log("Fetching client for subdomain:", subdomain); // Debug log
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("subdomain", subdomain)
        .single();

      console.log("Client query result:", { client, clientError }); // Debug log

      if (clientError || !client) {
        console.error("Client not found:", clientError);
        setError("Invalid tenant");
        setLoading(false);
        return;
      }

      // First, find the user by email and client_id
      console.log("Fetching user for client_id:", client.id, "email:", email); // Debug log
      const { data: user, error: userError } = await supabase
        .from("client_users")
        .select("*")
        .eq("client_id", client.id)
        .eq("email", email.toLowerCase().trim())
        .eq("status", "active")
        .maybeSingle();

      console.log("User query result:", { user, userError }); // Debug log

      if (userError) {
        console.error("Error fetching user:", userError);
        setError("An error occurred. Please try again.");
        setLoading(false);
        return;
      }

      if (!user) {
        setError("Invalid credentials");
        setLoading(false);
        return;
      }

      // Check if password field exists (it might be password_hash or password)
      // Try password_hash first (like imd_users), then password
      const userPassword = (user as any).password_hash || (user as any).password;
      
      // Debug: Log available fields (remove in production)
      console.log("User found:", { 
        id: user.id, 
        email: user.email, 
        hasPasswordHash: !!(user as any).password_hash,
        hasPassword: !!(user as any).password,
        userFields: Object.keys(user)
      });
      
      if (!userPassword) {
        console.error("No password field found for user. Available fields:", Object.keys(user));
        setError("Password not set for this user. Please contact support.");
        setLoading(false);
        return;
      }

      // Compare passwords (plain text comparison for now, or hash comparison)
      if (userPassword !== password) {
        console.log("Password mismatch - user password:", userPassword, "provided:", password);
        setError("Invalid credentials");
        setLoading(false);
        return;
      }

      localStorage.setItem("participant", JSON.stringify(user));
      router.push(`/tenant/${subdomain}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <form
        onSubmit={(e) => {
          console.log("Form onSubmit triggered", e);
          handleLogin(e);
        }}
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
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          onClick={(e) => {
            console.log("Button clicked", e);
            // Don't prevent default - let form handle it
          }}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}