import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless session: the cookie carries the user's shoo claims plus an expiry,
// signed with SESSION_SECRET. No session table, logout clears the cookie.
// Ported from pushdraft's signToken/verifyToken.

export const SESSION_COOKIE = "__Host-piano_session";
export const AUTH_STATE_COOKIE = "__Host-piano_auth_state";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_STATE_TTL_SECONDS = 10 * 60;

export type SessionUser = {
  // shoo's pairwise subject, stable per origin.
  sub: string;
  name: string | null;
  email: string | null;
  picture: string | null;
};

export type AuthState = { state: string; verifier: string; next: string };

export function signToken<Payload extends Record<string, unknown>>(
  payload: Payload,
  secret: string,
  ttlSeconds: number,
): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: nowSeconds() + ttlSeconds })).toString(
    "base64url",
  );
  return `${body}.${hmac(body, secret)}`;
}

export function verifyToken<Payload extends Record<string, unknown>>(
  token: string,
  secret: string,
): (Payload & { exp: number }) | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(hmac(body, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isRecord(payload) || typeof payload.exp !== "number" || payload.exp < nowSeconds())
      return null;
    return payload as Payload & { exp: number };
  } catch {
    return null;
  }
}

// One secret per purpose so a session token can never pass as auth state.
export function deriveSecret(secret: string, purpose: "session" | "oauth-state"): string {
  return createHmac("sha256", secret).update(`piano:${purpose}`).digest("base64url");
}

export function readSessionUser(token: string | null, secret: string): SessionUser | null {
  if (!token) return null;
  const payload = verifyToken<SessionUser>(token, deriveSecret(secret, "session"));
  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
  return {
    sub: payload.sub,
    name: text(payload.name),
    email: text(payload.email),
    picture: text(payload.picture),
  };
}

export function readAuthState(token: string | null, secret: string): AuthState | null {
  if (!token) return null;
  const payload = verifyToken<AuthState>(token, deriveSecret(secret, "oauth-state"));
  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.verifier !== "string" ||
    typeof payload.next !== "string"
  )
    return null;
  return { state: payload.state, verifier: payload.verifier, next: payload.next };
}

// __Host- cookies need Path=/, Secure and no Domain. Browsers accept them on
// http://localhost, which keeps local dev working.
export function serializeCookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
  ].join("; ");
}

export function readCookie(headers: Headers, name: string): string | null {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
