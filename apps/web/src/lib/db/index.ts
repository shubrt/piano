import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

// One pool per process. Idle connections close after 10 seconds so a sleeping
// Railway PR environment has no outbound traffic that would keep it awake.
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type Db = typeof db;
export { schema };
