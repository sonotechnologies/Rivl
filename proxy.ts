import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// Signed-in app routes. Everything else (/, /login, /brand, /invite/…) is public.
const APP_ROUTES = ["/today", "/board", "/add", "/feed", "/me", "/task", "/challenge", "/friends", "/recap", "/settings", "/onboarding"];

const isAppRoute = (path: string) => APP_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));

/**
 * Refreshes the Supabase session cookie on every navigation and does the
 * optimistic auth redirects. Pages still verify the user themselves.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = path === "/login" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed auth cookies.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!signedIn && isAppRoute(pathname)) return redirectTo("/login");
  // The landing and login pages are for logged-out visitors only.
  if (signedIn && (pathname === "/" || pathname === "/login")) return redirectTo("/today");

  return response;
}

export const config = {
  matcher: [
    // Skip static files, images, the manifest and icons.
    "/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
