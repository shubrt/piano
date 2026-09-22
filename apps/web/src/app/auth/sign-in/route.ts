import { env } from "@/lib/env";
import {
  AUTH_STATE_COOKIE,
  AUTH_STATE_TTL_SECONDS,
  deriveSecret,
  serializeCookie,
  signToken,
} from "@/lib/auth/session";
import { requestOrigin } from "@/lib/auth/origin";
import { buildAuthorizeUrl, buildPkce } from "@/lib/auth/shoo";

// Starts the shoo login. PKCE verifier and state travel in a signed short-lived
// cookie, ?next= is the path to return to afterwards.
export function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const pkce = buildPkce();
  const state = signToken(
    { state: pkce.state, verifier: pkce.verifier, next },
    deriveSecret(env.SESSION_SECRET, "oauth-state"),
    AUTH_STATE_TTL_SECONDS,
  );
  return new Response(null, {
    status: 303,
    headers: {
      Location: buildAuthorizeUrl(requestOrigin(request), pkce),
      "Set-Cookie": serializeCookie(AUTH_STATE_COOKIE, state, AUTH_STATE_TTL_SECONDS),
    },
  });
}

// Only same-origin paths, never a full URL someone put in the link.
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
