"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button, Input, Card } from "@/components/ui";

export default function TenantLoginPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // First, verify the subdomain/client exists
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id, name, subdomain")
        .eq("subdomain", subdomain)
        .single();

      if (clientError || !client) {
        setError("Invalid subdomain or client not found");
        setLoading(false);
        return;
      }

      // Query client_users table for this client
      const { data: user, error: dbError } = await supabase
        .from("client_users")
        .select("id, email, name, surname, role, status, client_id")
        .eq("email", email)
        .eq("client_id", client.id)
        .eq("status", "active")
        .single();

      if (dbError || !user) {
        setError("Invalid credentials");
        setLoading(false);
        return;
      }

      // TODO: Implement proper password verification
      // For now, we'll need to check password_hash or implement authentication
      // Store user info in localStorage with tenant context
      localStorage.setItem("tenant_user", JSON.stringify({ ...user, client_id: client.id, client_name: client.name }));
      router.push(`/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="p-6 w-full max-w-md space-y-4">
        <h2 className="text-xl font-semibold text-center">Login</h2>
        <p className="text-sm text-center text-muted-foreground">{subdomain}</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

