import { type NextRequest, NextResponse } from "next/server";
import { readCookie, readSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

// Everything except the login routes and the health check needs a session.
// Pages redirect to the login, API calls get a 401. The secret is read from
// process.env directly: env.ts pulls in fs and os, which the proxy bundle
// does not need.
export function proxy(request: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "";
  const user = readSessionUser(readCookie(request.headers, SESSION_COOKIE), secret);
  if (user) {
    // Cross-site POSTs carry no Lax cookie, but a same-site subdomain would.
    // Requiring the Origin to match closes that for every writing request.
    if (request.method !== "GET" && request.method !== "HEAD") {
      const origin = request.headers.get("origin");
      if (origin && origin !== request.nextUrl.origin)
        return NextResponse.json({ error: "Falscher Origin" }, { status: 403 });
    }
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/"))
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const signIn = new URL("/auth/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/((?!auth/|api/health|_next/|favicon.ico).*)"],
};
