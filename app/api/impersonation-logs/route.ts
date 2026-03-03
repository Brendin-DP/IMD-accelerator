import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_JSON_PATH = path.join(process.cwd(), "public", "db.json");

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

interface DbJson {
  assessment_questions_360?: any[];
  themes?: Record<string, any>;
  impersonation_logs?: ImpersonationLog[];
}

function readDbJson(): DbJson {
  try {
    const fileContent = fs.readFileSync(DB_JSON_PATH, "utf-8");
    const parsed = JSON.parse(fileContent);
    // Ensure impersonation_logs exists
    if (!parsed.impersonation_logs) {
      parsed.impersonation_logs = [];
    }
    return parsed;
  } catch (error) {
    console.error("Error reading db.json:", error);
    return { themes: {}, impersonation_logs: [] };
  }
}

function writeDbJson(data: DbJson): void {
  try {
    fs.writeFileSync(DB_JSON_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing db.json:", error);
    throw error;
  }
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
    const db = readDbJson();
    const logs = db.impersonation_logs || [];
    
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
    
    const db = readDbJson();
    if (!db.impersonation_logs) {
      db.impersonation_logs = [];
    }
    
    // Add the new log entry
    db.impersonation_logs.push(body as ImpersonationLog);
    writeDbJson(db);
    
    return NextResponse.json({ success: true, log: body });
  } catch (error) {
    console.error("Error saving impersonation log:", error);
    return NextResponse.json(
      { error: "Failed to save impersonation log" },
      { status: 500 }
    );
  }
}
