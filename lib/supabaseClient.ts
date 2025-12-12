"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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
