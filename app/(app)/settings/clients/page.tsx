"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

interface Client {
  id: string;
  name: string;
  email?: string;
  company?: string;
  phone?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      setLoading(true);
      setError(null);
      
      // Query clients table - try different possible table names
      const { data, error: dbError } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (dbError) {
        console.error("Error fetching clients:", dbError);
        setError(`Failed to load clients: ${dbError.message}`);
        setClients([]);
      } else {
        setClients(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Client Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Client Management</h1>
          <p className="text-muted-foreground mt-2">Manage clients and organizations</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      {/* Clients Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading clients...</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{error}</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No clients found. Click "Add Client" to create your first client.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Company</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Phone</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">{client.name || "-"}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {client.company || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm">{client.email || "-"}</td>
                  <td className="px-6 py-4 text-sm">{client.phone || "-"}</td>
                  <td className="px-6 py-4 text-sm">
                    {client.status ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          client.status === "active"
                            ? "bg-green-100 text-green-800"
                            : client.status === "inactive"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {client.status}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {client.created_at
                      ? new Date(client.created_at).toLocaleDateString()
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

