import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MockSupabaseClient } from "@/lib/mockdb/client";
import { serverQueryExecutor, serverStorageExecutor } from "@/lib/mockdb/server";
import { USE_MOCK_DB } from "@/lib/mockdb/mode";

let mock: MockSupabaseClient | null = null;

/**
 * Server-side DB client for API routes. Returns the mock DB client (reading
 * and writing data/db.json or Vercel Blob directly, no HTTP hop) unless
 * NEXT_PUBLIC_USE_MOCK_DB=false, in which case it's the Supabase service-role client.
 */
export function createServerClient(): SupabaseClient {
  if (USE_MOCK_DB) {
    mock ??= new MockSupabaseClient(serverQueryExecutor, serverStorageExecutor);
    return mock as unknown as SupabaseClient;
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
