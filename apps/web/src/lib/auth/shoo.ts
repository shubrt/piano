import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { env } from "../env";

// Login through shoo.dev, the same flow pushdraft uses: PKCE authorization
// code, id_token verified against shoo's JWKS. No client registration, shoo
// derives the client from the redirect origin and issues a pairwise subject
// per origin.

export type ShooClaims = JWTPayload & {
  pairwise_sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export function buildPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(24).toString("base64url"),
  };
}

export function redirectUri(): string {
  return new URL("/auth/callback", env.PUBLIC_URL).toString();
}

export function buildAuthorizeUrl(values: { state: string; challenge: string }): string {
  const url = new URL("/authorize", env.SHOO_BASE_URL);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", values.state);
  url.searchParams.set("code_challenge", values.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Asks for email, name and picture; shoo shows a consent screen.
  url.searchParams.set("pii", "true");
  return url.toString();
}

export async function exchangeCode(values: {
  code: string;
  verifier: string;
}): Promise<ShooClaims> {
  const response = await fetch(new URL("/token", env.SHOO_BASE_URL), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
      code: values.code,
      code_verifier: values.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json().catch(() => null);
  const idToken = readString(body, "id_token");
  if (!response.ok || !idToken) throw new Error(`Shoo token exchange failed (${response.status})`);

  const discovery = await fetch(new URL("/.well-known/openid-configuration", env.SHOO_BASE_URL), {
    signal: AbortSignal.timeout(10_000),
  });
  const issuer = readString(await discovery.json().catch(() => null), "issuer");
  if (!discovery.ok || !issuer) throw new Error("Shoo discovery failed");

  const { payload } = await jwtVerify(
    idToken,
    createRemoteJWKSet(new URL("/.well-known/jwks.json", env.SHOO_BASE_URL)),
    { issuer, audience: `origin:${new URL(env.PUBLIC_URL).origin}`, algorithms: ["ES256"] },
  );
  if (typeof payload.pairwise_sub !== "string" || !payload.pairwise_sub)
    throw new Error("Shoo id_token is missing pairwise_sub");
  return payload as ShooClaims;
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = Reflect.get(value, key);
  return typeof candidate === "string" ? candidate : null;
}
