import { migrate } from "drizzle-orm/node-postgres/migrator";

// Runs once when the Node server boots, in dev and in the container. Applies
// the SQL files in drizzle/ so a fresh Postgres (local compose, a Railway PR
// environment) is ready without a separate migrate step.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { db } = await import("./lib/db");
  await migrate(db, { migrationsFolder: "drizzle" });
}
