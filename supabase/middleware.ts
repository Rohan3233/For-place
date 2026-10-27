import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request that passes through
 * middleware.ts, and keeps cookies in sync. Without this, sessions can
 * expire mid-use even while the user is actively using the app, since
 * nothing else in a Server-Component-heavy app naturally triggers a token
 * refresh on every navigation.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Re-verifies against the auth server (not just reading the cookie) —
  // this call is what actually performs the refresh when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route protection lives here, in one place, rather than repeated in
  // every page — simplest way to guarantee no protected route is
  // accidentally left unguarded.
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/audit");

  if (!user && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    // Already logged in — no reason to show the login/signup forms again.
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
