"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Cohort {
  id: string;
  name: string;
  client_id: string;
  plan_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  plan?: {
    id: string;
    name: string;
  };
}

export default function TenantCohortPage() {
  const params = useParams();
  const router = useRouter();
  const subdomain = params.subdomain as string;

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    fetchClientAndCohorts();
  }, [subdomain]);

  /**
   * Add active cohorts the signed-in participant is enrolled in that belong to
   * another client (e.g. a cross-client programme cohort), so every cohort on
   * their dashboard is also reachable from here.
   */
  async function withOwnEnrolments(list: any[], ownClientId: string) {
    try {
      const stored = localStorage.getItem("participant");
      const userId = stored ? JSON.parse(stored)?.id : null;
      if (!userId) return list;
      const { data: enrolments } = await supabase
        .from("cohort_participants")
        .select("cohort_id")
        .eq("client_user_id", userId);
      const known = new Set(list.map((c) => c.id));
      const extraIds = [...new Set((enrolments ?? []).map((e: any) => e.cohort_id))].filter((id) => !known.has(id));
      if (!extraIds.length) return list;
      const { data: extra } = await supabase
        .from("cohorts")
        .select("*, plan:plans(id, name)")
        .in("id", extraIds)
        .neq("client_id", ownClientId)
        .gte("end_date", new Date().toISOString().split("T")[0]);
      return [...list, ...(extra ?? [])].sort((a, b) => String(b.start_date ?? "").localeCompare(String(a.start_date ?? "")));
    } catch {
      return list;
    }
  }

  async function fetchClientAndCohorts() {
    try {
      setLoading(true);
      setError(null);

      // First, get the client ID from subdomain
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id, name")
        .eq("subdomain", subdomain)
        .single();

      if (clientError || !client) {
        setError("Client not found");
        setLoading(false);
        return;
      }

      setClientId(client.id);

      // Fetch cohorts for this client
      const { data: cohortsData, error: cohortsError } = await supabase
        .from("cohorts")
        .select(`
          *,
          plan:plans(id, name)
        `)
        .eq("client_id", client.id)
        .gte("end_date", new Date().toISOString().split('T')[0])
        .order("start_date", { ascending: false });

      // Handle relationship cache issues
      if (cohortsError && (cohortsError.message?.includes("relationship") || cohortsError.message?.includes("cache"))) {
        console.warn("Relationship query failed, fetching separately");
        
        const { data: cohortsOnly, error: cohortsOnlyError } = await supabase
          .from("cohorts")
          .select("*")
          .eq("client_id", client.id)
          .gte("end_date", new Date().toISOString().split('T')[0])
          .order("start_date", { ascending: false });

        if (cohortsOnlyError) {
          throw cohortsOnlyError;
        }

        if (cohortsOnly && cohortsOnly.length > 0) {
          const planIds = [...new Set(cohortsOnly.map((c: any) => c.plan_id))];
          const { data: plansData, error: plansError } = await supabase
            .from("plans")
            .select("id, name")
            .in("id", planIds);

          const mergedCohorts = cohortsOnly.map((cohort: any) => ({
            ...cohort,
            plan: plansData?.find((p: any) => p.id === cohort.plan_id) || null,
          }));

          setCohorts(await withOwnEnrolments(mergedCohorts || [], client.id));
        } else {
          setCohorts(await withOwnEnrolments([], client.id));
        }
      } else if (cohortsData) {
        setCohorts(await withOwnEnrolments(cohortsData || [], client.id));
      } else {
        setCohorts(await withOwnEnrolments([], client.id));
      }
    } catch (err) {
      console.error("Error fetching cohorts:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-muted-foreground">Loading cohorts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cohorts</h1>
        <p className="text-muted-foreground mt-2">View your active cohorts</p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading cohorts...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : cohorts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No active cohorts found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cohorts.map((cohort) => (
            <Card
              key={cohort.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/tenant/${subdomain}/cohort/${cohort.id}`)}
            >
              <CardHeader>
                <CardTitle>{cohort.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {(cohort.plan as any)?.name && (
                    <div>
                      <span className="text-muted-foreground">Plan: </span>
                      <span className="font-medium">{(cohort.plan as any).name}</span>
                    </div>
                  )}
                  {cohort.start_date && (
                    <div>
                      <span className="text-muted-foreground">Start: </span>
                      <span className="font-medium">
                        {new Date(cohort.start_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {cohort.end_date && (
                    <div>
                      <span className="text-muted-foreground">End: </span>
                      <span className="font-medium">
                        {new Date(cohort.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

