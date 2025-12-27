import { createServerClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const templateId = searchParams.get("template_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("assessment_template_versions")
      .select(`
        *,
        template:assessment_templates(id, name)
      `)
      .order("created_at", { ascending: false });

    if (templateId && templateId !== "all") {
      query = query.eq("template_id", templateId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching versions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("assessment_template_versions")
      .insert([
        {
          template_id: body.template_id,
          version_name: body.version_name,
          status: body.status || "draft",
        },
      ])
      .select(`
        *,
        template:assessment_templates(id, name)
      `)
      .single();

    if (error) {
      console.error("Error creating version:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

