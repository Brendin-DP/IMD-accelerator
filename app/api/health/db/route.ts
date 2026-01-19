import { createServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const startTime = Date.now();
  
  try {
    const supabase = createServerClient();
    
    // Perform a lightweight read-only query to keep the database active
    const { error, data } = await supabase
      .from("clients")
      .select("id")
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      console.error("DB healthcheck error:", error);
      return new Response(
        JSON.stringify({
          status: "error",
          message: "DB error",
          error: error.message,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        message: "OK",
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("Healthcheck endpoint error:", error);
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Internal error",
        error: error instanceof Error ? error.message : String(error),
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

