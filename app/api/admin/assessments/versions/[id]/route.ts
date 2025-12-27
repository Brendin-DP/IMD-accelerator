import { createServerClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("assessment_template_versions")
      .update(body)
      .eq("id", params.id)
      .select(`
        *,
        template:assessment_templates(id, name)
      `)
      .single();

    if (error) {
      console.error("Error updating version:", error);
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

