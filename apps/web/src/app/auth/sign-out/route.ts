import { serializeCookie, SESSION_COOKIE } from "@/lib/auth/session";

// Clears the session cookie. POST only, so a link on another site cannot log
// the user out; SameSite=Lax keeps the cookie away from cross-site POSTs anyway.
export function POST() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/auth/sign-in", "Set-Cookie": serializeCookie(SESSION_COOKIE, "", 0) },
  });
}
