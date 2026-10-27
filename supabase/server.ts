import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers — anything running on the server. Reads/writes the session via
 * Next.js's cookies() API.
 *
 * SECURITY NOTE (from Supabase's own current guidance): when checking
 * whether a user is authenticated in server code, always call
 * `supabase.auth.getUser()`, never `getSession()`. getUser() re-verifies
 * the token against the auth server; getSession() just reads whatever is
 * in the cookie, which could be stale or tampered with. Every protected
 * page/action in this app follows that rule — see app/dashboard/page.tsx.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll can be called from a Server Component, where cookies
            // can't actually be written (only Server Actions/Route
            // Handlers can). That's fine as long as middleware.ts is also
            // refreshing sessions — this is the documented, expected
            // pattern, not a bug to fix.
          }
        },
      },
    }
  );
}
