import { defineConfig } from "drizzle-kit";

// drizzle-kit generate writes SQL migrations to drizzle/, the app applies them
// on startup (src/instrumentation.ts). DATABASE_URL is only needed for
// drizzle-kit studio or push.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://piano:piano@localhost:5432/piano" },
});
