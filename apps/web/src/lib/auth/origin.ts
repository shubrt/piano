import { env } from "../env";

// The origin the browser is on. Production pins it with PUBLIC_URL, so a
// forged Host header cannot steer the login. Without PUBLIC_URL it comes from
// the request, which lets every portless worktree URL and plain localhost log
// in: shoo needs no registration and binds the pairwise subject to the origin.
export function requestOrigin(request: Request): string {
  if (env.PUBLIC_URL) return new URL(env.PUBLIC_URL).origin;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
