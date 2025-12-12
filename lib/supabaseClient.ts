"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment variables.\n` +
      `Check your Supabase project's API settings: https://supabase.com/dashboard/project/_/settings/api`
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Lazy singleton instance - only created when accessed in the browser
let _supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

function getSupabase() {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client can only be accessed in the browser');
  }
  if (!_supabaseInstance) {
    _supabaseInstance = createClient();
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
