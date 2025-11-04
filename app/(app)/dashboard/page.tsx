"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";

interface Cohort {
  id: string;
  name: string;
  client_id: string;
  plan_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  client?: {
    id: string;
    name: string;
  } | null;
  plan?: {
    id: string;
    name: string;
  } | null;
}

interface CohortAssessment {
  id: string;
  cohort_id: string;
  assessment_type_id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  created_at: string | null;
  assessment_type?: {
    id: string;
    name: string;
  } | null;
  cohort?: {
    id: string;
    name: string;
  } | null;
}

function getStatusColor(status: string | null): string {
  if (!status) return "bg-gray-100 text-gray-800";
  
  const statusLower = status.toLowerCase();
  switch (statusLower) {
    case "draft":
      return "bg-gray-100 text-gray-800";
    case "active":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeCohortsCount, setActiveCohortsCount] = useState<number>(0);
  const [assessmentsCount, setAssessmentsCount] = useState<number>(0);
  const [completedCohortsCount, setCompletedCohortsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split('T')[0];

      // Fetch counts using count queries for better performance
      const [activeCohortsResult, completedCohortsResult, assessmentsResult] = await Promise.all([
        supabase
          .from("cohorts")
          .select("*", { count: "exact", head: true })
          .gte("end_date", today),
        supabase
          .from("cohorts")
          .select("*", { count: "exact", head: true })
          .lt("end_date", today),
        supabase
          .from("cohort_assessments")
          .select("*", { count: "exact", head: true })
      ]);

      setActiveCohortsCount(activeCohortsResult.count || 0);
      setCompletedCohortsCount(completedCohortsResult.count || 0);
      setAssessmentsCount(assessmentsResult.count || 0);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="p-8 text-center text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your cohorts and assessments</p>
      </div>

      {/* Stats Panels Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Active Cohorts Stat */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/cohorts")}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Cohorts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{activeCohortsCount}</div>
            <p className="text-xs text-muted-foreground mt-2">Cohorts currently active</p>
          </CardContent>
        </Card>

        {/* Assessments Stat */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/cohorts")}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{assessmentsCount}</div>
            <p className="text-xs text-muted-foreground mt-2">Total assessments</p>
          </CardContent>
        </Card>

        {/* Completed Cohorts Stat */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/cohorts")}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{completedCohortsCount}</div>
            <p className="text-xs text-muted-foreground mt-2">Completed cohorts</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
