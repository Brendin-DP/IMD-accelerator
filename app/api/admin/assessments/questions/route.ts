import { createServerClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const versionId = searchParams.get("template_version_id");

    if (!versionId) {
      return NextResponse.json({ error: "template_version_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("assessment_questions")
      .select("*")
      .eq("template_version_id", versionId)
      .order("question_order", { ascending: true });

    if (error) {
      console.error("Error fetching questions:", error);
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
      .from("assessment_questions")
      .insert([
        {
          template_version_id: body.template_version_id,
          question_text: body.question_text,
          category: body.category || null,
          question_order: body.question_order,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating question:", error);
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

