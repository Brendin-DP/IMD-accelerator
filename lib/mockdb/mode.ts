/**
 * The mock DB is on unless NEXT_PUBLIC_USE_MOCK_DB is explicitly "false".
 * Set it to "false" (and provide the Supabase env vars) to talk to Supabase again.
 */
export const USE_MOCK_DB = process.env.NEXT_PUBLIC_USE_MOCK_DB !== "false";
