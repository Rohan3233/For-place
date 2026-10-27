import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 * ONLY use this where there is no real user session to authenticate as,
 * which in this codebase means exactly one place: the Stripe webhook route
 * (app/api/webhooks/stripe/route.ts). Stripe calls that endpoint directly
 * over HTTP with no cookies and no logged-in user, so there's no session
 * for the normal lib/supabase/server.ts client to read — the webhook has
 * to write to paid_audits as itself, using the service_role key, which is
 * exactly what RLS is designed to let through.
 *
 * Never import this into anything that runs in response to a user's own
 * request (Server Actions, Server Components, Route Handlers behind
 * normal auth) — those must keep using lib/supabase/server.ts so RLS stays
 * the actual enforcement boundary. This client is the one deliberate,
 * narrow exception, not a general-purpose shortcut.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (server-only env var — never
 * NEXT_PUBLIC_-prefixed, never sent to the browser).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
