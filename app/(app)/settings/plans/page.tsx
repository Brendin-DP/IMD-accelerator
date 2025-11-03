"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

interface Plan {
  id: string;
  name: string;
  description?: string;
  price?: number;
  duration?: number;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      setLoading(true);
      setError(null);
      
      // Query plans table
      const { data, error: dbError } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching plans:", dbError);
        setError(`Failed to load plans: ${dbError.message}`);
        setPlans([]);
      } else {
        setPlans(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Plan Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plan Management</h1>
          <p className="text-muted-foreground mt-2">Manage subscription plans and pricing tiers</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Plan
        </Button>
      </div>

      {/* Plans Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading plans...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : plans.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No plans found. Click "Add Plan" to create your first plan.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Price</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Duration</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">{plan.name || "-"}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {plan.description || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {plan.price !== null && plan.price !== undefined
                      ? `$${plan.price.toFixed(2)}`
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {plan.duration ? `${plan.duration} days` : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {plan.status ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          plan.status === "active"
                            ? "bg-green-100 text-green-800"
                            : plan.status === "inactive"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {plan.status}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {plan.created_at
                      ? new Date(plan.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

