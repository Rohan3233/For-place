import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

/**
 * Skip static assets, images, and favicon — no reason to run a Supabase
 * session refresh on requests that can't possibly be an authenticated
 * page load. Everything else (including /api routes) still passes
 * through, since app/api/audits/[id]/pdf/route.ts deliberately does its
 * own getUser() check rather than relying on this matcher.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};