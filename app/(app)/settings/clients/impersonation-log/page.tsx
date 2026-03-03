"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface ImpersonationLog {
  id: string;
  impersonated_user_id: string;
  impersonated_user_name: string;
  client_id: string;
  client_name: string;
  impersonator_id: string;
  impersonator_name: string;
  created_at: string;
}

export default function ImpersonationLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<ImpersonationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchImpersonationLogs();
  }, []);

  async function fetchImpersonationLogs() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/impersonation-logs");
      if (!response.ok) {
        throw new Error("Failed to fetch impersonation logs");
      }
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Error fetching impersonation logs:", err);
      setError(err instanceof Error ? err.message : "Failed to load logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Clients", href: "/settings/clients" },
          { label: "Impersonation Log" },
        ]}
      />

      {/* Back Button */}
      <Button variant="tertiary" onClick={() => router.push("/settings/clients")} className="p-0 h-auto">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Clients
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Impersonation Log
        </h1>
        <p className="text-muted-foreground mt-2">
          View all impersonation attempts across all clients
        </p>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Impersonation Attempts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading logs...</div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">{error}</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No impersonation logs found.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-3 text-left text-sm font-medium">User Impersonated</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Client</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Impersonator</th>
                    <th className="px-6 py-3 text-left text-sm font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium">{log.impersonated_user_name || "-"}</td>
                      <td className="px-6 py-4 text-sm">{log.client_name || "-"}</td>
                      <td className="px-6 py-4 text-sm">{log.impersonator_name || "-"}</td>
                      <td className="px-6 py-4 text-sm">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
