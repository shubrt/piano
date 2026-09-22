// Whether a writing request comes from our own page. Behind Railway's edge
// (and Cloudflare in front of it) the server sees an internal host over http,
// so the check trusts the forwarded host, never request.url. Only the host is
// compared: the proxy terminates TLS, so the scheme differs by design.
export function sameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  // Browsers send Origin on every cross-site and same-site POST. No header
  // means an old browser or a non-browser client; the session cookie is then
  // the only thing that could have come along, and cross-site it does not.
  if (!origin) return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(",")[0]?.trim();
  } catch {
    return false;
  }
}
