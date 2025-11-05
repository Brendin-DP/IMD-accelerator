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
    <div className="min-h-screen flex">
      {/* Left side - Image/Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-primary/80 items-center justify-center p-12">
        <div className="text-white space-y-6 max-w-md">
          <h1 className="text-5xl font-bold">IMD Accelerator</h1>
          <p className="text-xl text-white/90">
            Welcome to the administrative portal. Manage cohorts, assessments, and participants with ease.
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
            <p className="text-gray-600">Sign in to your admin account</p>
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
            <Button type="submit" className="w-full">
              Sign In
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