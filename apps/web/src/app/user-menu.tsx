import type { SessionUser } from "@/lib/auth/session";

// Who is signed in, and the way out. Songs are shared, so this is the only
// place the account shows up.
export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) return null;
  return (
    <form className="user-menu dim" method="post" action="/auth/sign-out">
      <span>{user.name ?? user.email ?? "Angemeldet"}</span>
      <button type="submit">Abmelden</button>
    </form>
  );
}
