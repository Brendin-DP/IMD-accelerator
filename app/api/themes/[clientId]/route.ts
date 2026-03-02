import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_JSON_PATH = path.join(process.cwd(), "public", "db.json");

interface Theme {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  appTitle?: string;
}

interface DbJson {
  assessment_questions_360?: any[];
  themes: Record<string, Theme>;
}

function readDbJson(): DbJson {
  try {
    const fileContent = fs.readFileSync(DB_JSON_PATH, "utf-8");
    return JSON.parse(fileContent);
  } catch (error) {
    console.error("Error reading db.json:", error);
    return { themes: {} };
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

function validateTheme(theme: any): theme is Theme {
  if (typeof theme !== "object" || theme === null) return false;
  
  if (theme.primaryColor && typeof theme.primaryColor !== "string") return false;
  if (theme.secondaryColor && typeof theme.secondaryColor !== "string") return false;
  if (theme.logoUrl && typeof theme.logoUrl !== "string") return false;
  if (theme.appTitle && typeof theme.appTitle !== "string") return false;
  
  // Validate color format (hex)
  if (theme.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(theme.primaryColor)) return false;
  if (theme.secondaryColor && !/^#[0-9A-Fa-f]{6}$/.test(theme.secondaryColor)) return false;
  
  return true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const { clientId } = params;
    const db = readDbJson();
    const theme = db.themes[clientId] || null;
    
    return NextResponse.json({ theme });
  } catch (error) {
    console.error("Error fetching theme:", error);
    return NextResponse.json(
      { error: "Failed to fetch theme" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const { clientId } = params;
    const body = await request.json();
    
    if (!validateTheme(body)) {
      return NextResponse.json(
        { error: "Invalid theme data" },
        { status: 400 }
      );
    }
    
    const db = readDbJson();
    db.themes[clientId] = body as Theme;
    writeDbJson(db);
    
    return NextResponse.json({ success: true, theme: body });
  } catch (error) {
    console.error("Error saving theme:", error);
    return NextResponse.json(
      { error: "Failed to save theme" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  // PUT works the same as POST for this use case
  return POST(request, { params });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const { clientId } = params;
    const db = readDbJson();
    
    if (db.themes[clientId]) {
      delete db.themes[clientId];
      writeDbJson(db);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting theme:", error);
    return NextResponse.json(
      { error: "Failed to delete theme" },
      { status: 500 }
    );
  }
}
