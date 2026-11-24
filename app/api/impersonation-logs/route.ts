import { NextRequest, NextResponse } from "next/server";
import { readDb, updateDb } from "@/lib/mockdb/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

// Logs live in the mock DB as the "impersonation_logs" table.
async function readLogs(): Promise<ImpersonationLog[]> {
  const db = await readDb();
  return (db.impersonation_logs as ImpersonationLog[] | undefined) ?? [];
}

function validateLogEntry(entry: any): entry is ImpersonationLog {
  if (typeof entry !== "object" || entry === null) return false;
  
  if (!entry.id || typeof entry.id !== "string") return false;
  if (!entry.impersonated_user_id || typeof entry.impersonated_user_id !== "string") return false;
  if (!entry.impersonated_user_name || typeof entry.impersonated_user_name !== "string") return false;
  if (!entry.client_id || typeof entry.client_id !== "string") return false;
  if (!entry.client_name || typeof entry.client_name !== "string") return false;
  if (!entry.impersonator_id || typeof entry.impersonator_id !== "string") return false;
  if (!entry.impersonator_name || typeof entry.impersonator_name !== "string") return false;
  if (!entry.created_at || typeof entry.created_at !== "string") return false;
  
  return true;
}

export async function GET() {
  try {
    const logs = await readLogs();
    
    // Sort by created_at descending (newest first)
    const sortedLogs = [...logs].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    return NextResponse.json({ logs: sortedLogs });
  } catch (error) {
    console.error("Error fetching impersonation logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch impersonation logs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!validateLogEntry(body)) {
      return NextResponse.json(
        { error: "Invalid log entry data" },
        { status: 400 }
      );
    }
    
    await updateDb((db) => {
      (db.impersonation_logs ??= []).push(body as ImpersonationLog);
    });
    
    return NextResponse.json({ success: true, log: body });
  } catch (error) {
    console.error("Error saving impersonation log:", error);
    return NextResponse.json(
      { error: "Failed to save impersonation log" },
      { status: 500 }
    );
  }
}
