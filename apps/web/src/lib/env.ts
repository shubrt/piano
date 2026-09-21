import { createEnv } from "@t3-oss/env-core";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

// The .env lives in the monorepo root (t3.json symlinks it into worktrees).
// Next only reads the app folder, so load the root file by hand first. In the
// Docker image the variables come from Railway and the file does not exist.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv) && typeof process.loadEnvFile === "function") process.loadEnvFile(rootEnv);

export const env = createEnv({
  server: {
    // Songs, import jobs and nothing else. Railway's Postgres provides the URL.
    DATABASE_URL: z.string().url(),
    // Origin the browser uses, set in production. Unset, the login takes the
    // origin from each request (portless worktree URLs, localhost).
    PUBLIC_URL: z.string().url().optional(),
    // Signs the session cookie, at least 32 bytes.
    SESSION_SECRET: z.string().min(32),
    SHOO_BASE_URL: z.string().url().default("https://shoo.dev"),
    // The Python worker that turns audio into MIDI. Private network on Railway,
    // uv run worker.py locally.
    WORKER_URL: z.string().url().default("http://localhost:8000"),
    // Shared secret the worker requires on every job request.
    WORKER_TOKEN: z.string().min(1),
    OPENROUTER_API_KEY: z.string().optional(),
    STRUCTURE_MODEL: z.string().default("anthropic/claude-opus-5"),
    // Song folders for the benchmarks only. The app itself reads Postgres.
    SONGS_DIR: z.string().default(path.join(os.homedir(), ".piano", "songs")),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // next build imports the routes without a database; the Dockerfile sets this.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
