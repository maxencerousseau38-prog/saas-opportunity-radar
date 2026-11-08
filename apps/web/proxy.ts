// Refreshes Supabase session cookies and applies the per-request CSP.
// Signed-out visitors are sent to the public, read-only preview instead of
// being stopped by the login screen. Workspace pages and APIs remain protected.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { CSP_HEADER, buildCsp, newNonce } from "@/lib/security-headers";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/"];

export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : undefined;
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
    supabaseOrigin,
    reportUri: "/api/csp-report",
  });
  // Next.js reads the nonce from the request's CSP header and adds it to its
  // own scripts; the browser receives the policy on the response.
  request.headers.set("content-security-policy", csp);
  request.headers.set("x-nonce", nonce);
  const secured = (res: NextResponse) => {
    res.headers.set(CSP_HEADER, csp);
    return res;
  };

  let response = NextResponse.next({ request });
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !key) return secured(response);

  const supabase = createServerClient(supabaseUrl, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p));
  if (!data.user && !isPublic && !path.startsWith("/api/")) {
    // Temporary no-login experience: show the public demo instead of a login wall.
    // The demo is read-only; API routes and workspace data remain authenticated.
    const preview = request.nextUrl.clone();
    preview.pathname = "/";
    preview.search = "";
    return secured(NextResponse.redirect(preview));
  }
  return secured(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
