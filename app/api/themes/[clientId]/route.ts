import { NextRequest, NextResponse } from "next/server";
import { readDb, updateDb } from "@/lib/mockdb/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Theme {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  appTitle?: string;
}

type Ctx = { params: Promise<{ clientId: string }> };

// Themes live in the mock DB under the "themes" key as { [clientId]: Theme }.
const themesOf = (db: Record<string, unknown>) => {
  if (!db.themes || Array.isArray(db.themes)) db.themes = {};
  return db.themes as unknown as Record<string, Theme>;
};

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

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { clientId } = await params;
    const db = await readDb();
    const theme = themesOf(db)[clientId] || null;
    return NextResponse.json({ theme });
  } catch (error) {
    console.error("Error fetching theme:", error);
    return NextResponse.json({ error: "Failed to fetch theme" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { clientId } = await params;
    const body = await request.json();

    if (!validateTheme(body)) {
      return NextResponse.json({ error: "Invalid theme data" }, { status: 400 });
    }

    await updateDb((db) => {
      themesOf(db)[clientId] = body as Theme;
    });

    return NextResponse.json({ success: true, theme: body });
  } catch (error) {
    console.error("Error saving theme:", error);
    return NextResponse.json({ error: "Failed to save theme" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  // PUT works the same as POST for this use case
  return POST(request, ctx);
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const { clientId } = await params;
    await updateDb((db) => {
      delete themesOf(db)[clientId];
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting theme:", error);
    return NextResponse.json({ error: "Failed to delete theme" }, { status: 500 });
  }
}
