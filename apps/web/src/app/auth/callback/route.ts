import { env } from "@/lib/env";
import {
  AUTH_STATE_COOKIE,
  deriveSecret,
  readAuthState,
  readCookie,
  serializeCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionUser,
  signToken,
} from "@/lib/auth/session";
import { exchangeCode } from "@/lib/auth/shoo";

// shoo sends the browser back here with ?code and ?state. On success the
// session cookie is set and the user lands on the page they came from.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clearState = serializeCookie(AUTH_STATE_COOKIE, "", 0);
  const state = readAuthState(readCookie(request.headers, AUTH_STATE_COOKIE), env.SESSION_SECRET);
  if (!state || url.searchParams.get("state") !== state.state)
    return fail("Anmeldung abgelaufen oder ungültig.", 400, clearState);
  if (url.searchParams.get("error")) return fail("Anmeldung abgebrochen.", 403, clearState);
  const code = url.searchParams.get("code");
  if (!code) return fail("Kein Autorisierungscode.", 400, clearState);

  try {
    const claims = await exchangeCode({ code, verifier: state.verifier });
    const user: SessionUser = {
      sub: claims.pairwise_sub,
      name: claims.name ?? null,
      email: claims.email ?? null,
      picture: claims.picture ?? null,
    };
    const session = signToken(
      user,
      deriveSecret(env.SESSION_SECRET, "session"),
      SESSION_TTL_SECONDS,
    );
    const headers = new Headers({ Location: new URL(state.next, env.PUBLIC_URL).toString() });
    headers.append("Set-Cookie", clearState);
    headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS));
    return new Response(null, { status: 303, headers });
  } catch (error) {
    console.error("Shoo sign-in failed:", error);
    return fail("Anmeldung fehlgeschlagen, bitte noch einmal versuchen.", 502, clearState);
  }
}

function fail(message: string, status: number, cookie: string) {
  return new Response(`${message}\n\nZurück: ${env.PUBLIC_URL}`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Set-Cookie": cookie },
  });
}
