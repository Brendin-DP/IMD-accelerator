import { createServerClient } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = createServerClient();
    
    // Perform a lightweight read-only query to keep the database active
    const { error } = await supabase
      .from("clients")
      .select("id")
      .limit(1);

    if (error) {
      console.error("DB healthcheck error:", error);
      return new Response("DB error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Healthcheck endpoint error:", error);
    return new Response("Internal error", { status: 500 });
  }
}

