import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (anything with "use client").
 * Uses the anon/publishable key — safe to expose to the browser, since
 * Row Level Security on your Supabase tables is what actually enforces
 * access control, not this key being secret.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
