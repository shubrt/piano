import { headers } from "next/headers";
import { env } from "../env";
import { readCookie, readSessionUser, SESSION_COOKIE, type SessionUser } from "./session";

// The signed-in user of the current server component or route. proxy.ts has
// already turned away requests without a valid cookie, so null only happens
// on paths the matcher excludes.
export async function currentUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers();
  return readSessionUser(readCookie(requestHeaders, SESSION_COOKIE), env.SESSION_SECRET);
}
