import { describe, expect, test } from "vite-plus/test";
import {
  deriveSecret,
  readAuthState,
  readSessionUser,
  signToken,
  verifyToken,
} from "../src/lib/auth/session";

const secret = "0123456789abcdef0123456789abcdef";

describe("session tokens", () => {
  test("round trip keeps the user", () => {
    const user = { sub: "pw_1", name: "Jis", email: null, picture: null };
    const token = signToken(user, deriveSecret(secret, "session"), 60);
    expect(readSessionUser(token, secret)).toEqual(user);
  });

  test("rejects a wrong secret, a tampered body and an expired token", () => {
    const token = signToken({ sub: "pw_1" }, deriveSecret(secret, "session"), 60);
    expect(readSessionUser(token, "another-secret-that-is-long-enough-1234")).toBeNull();
    const [body, signature] = token.split(".");
    expect(readSessionUser(`${body}x.${signature}`, secret)).toBeNull();
    const expired = signToken({ sub: "pw_1" }, deriveSecret(secret, "session"), -1);
    expect(verifyToken(expired, deriveSecret(secret, "session"))).toBeNull();
  });

  test("auth state never passes as a session", () => {
    const state = { state: "s", verifier: "v", next: "/songs/x" };
    const token = signToken(state, deriveSecret(secret, "oauth-state"), 60);
    expect(readAuthState(token, secret)).toEqual(state);
    expect(readSessionUser(token, secret)).toBeNull();
  });
});
