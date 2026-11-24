"use client";

import { createBrowserClient } from "@supabase/ssr";
import { MockSupabaseClient, httpQueryExecutor, httpStorageExecutor } from "@/lib/mockdb/client";
import { USE_MOCK_DB } from "@/lib/mockdb/mode";

// Get environment variables - these must be available at build time
// Trim whitespace and remove quotes if present
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^["']|["']$/g, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim().replace(/^["']|["']$/g, '');

if (!USE_MOCK_DB && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    "⚠️ Missing Supabase environment variables!\n" +
    "Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.\n" +
    "For Vercel: Add them in Project Settings → Environment Variables\n" +
    "For local: Create a .env.local file with these variables\n" +
    "Get your keys: https://supabase.com/dashboard/project/_/settings/api"
  );
}

// Create the client instance - this will throw if env vars are missing, which is expected
let _supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

function getSupabase() {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client can only be accessed in the browser');
  }
  
  if (!_supabaseInstance && USE_MOCK_DB) {
    // Mock DB: same API, backed by /api/db → data/db.json (see lib/mockdb).
    _supabaseInstance = new MockSupabaseClient(httpQueryExecutor, httpStorageExecutor) as unknown as ReturnType<typeof createBrowserClient>;
  }

  if (!_supabaseInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Supabase environment variables are not configured. ' +
        'Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.'
      );
    }
    _supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  
  return _supabaseInstance;
}

// Export as a Proxy to lazy-load the client
export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    const instance = getSupabase();
    const value = instance[prop as keyof typeof instance];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});

// Also export createClient for direct use if needed
export function createClient() {
  return getSupabase();
}
