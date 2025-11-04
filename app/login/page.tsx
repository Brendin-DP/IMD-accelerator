"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button, Input, Card } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Query your custom imd_users table - explicitly select name and surname fields
    const { data: user, error: dbError } = await supabase
      .from("imd_users")
      .select("id, email, name, surname, role, status, created_at")
      .eq("email", email)
      .eq("password_hash", password)
      .eq("status", "active")
      .single();

    if (dbError || !user) {
      setError("Invalid credentials");
      return;
    }

    // Temporarily store login info in localStorage
    localStorage.setItem("imd_admin", JSON.stringify(user));
    router.push("/dashboard");
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="p-6 w-full max-w-md space-y-4">
        <h2 className="text-xl font-semibold text-center">IMD Accelerator Login</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  );
}