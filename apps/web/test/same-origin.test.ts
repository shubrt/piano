import { describe, expect, test } from "vite-plus/test";
import { sameOrigin } from "../src/lib/auth/same-origin";

describe("sameOrigin", () => {
  test("accepts the forwarded host behind a proxy, whatever the scheme", () => {
    const headers = new Headers({
      origin: "https://piano.shubrt.me",
      host: "web.railway.internal:3000",
      "x-forwarded-host": "piano.shubrt.me",
    });
    expect(sameOrigin(headers)).toBe(true);
  });

  test("falls back to Host and rejects another site", () => {
    expect(sameOrigin(new Headers({ origin: "https://a.localhost", host: "a.localhost" }))).toBe(
      true,
    );
    expect(sameOrigin(new Headers({ origin: "https://evil.example", host: "a.localhost" }))).toBe(
      false,
    );
    expect(sameOrigin(new Headers({ origin: "not a url", host: "a.localhost" }))).toBe(false);
  });

  test("lets requests without Origin through", () => {
    expect(sameOrigin(new Headers({ host: "a.localhost" }))).toBe(true);
  });
});
