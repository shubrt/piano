import { createEnv } from "@t3-oss/env-core";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

// The .env lives in the monorepo root (t3.json symlinks it into worktrees).
// Next only reads the app folder, so load the root file by hand first. Bun
// below 1.3.10 lacks loadEnvFile; the benchmark script passes --env-file instead.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv) && typeof process.loadEnvFile === "function") process.loadEnvFile(rootEnv);

export const env = createEnv({
  server: {
    OPENROUTER_API_KEY: z.string().optional(),
    STRUCTURE_MODEL: z.string().default("anthropic/claude-opus-5"),
    // Folder with one subfolder per song. Lives outside the repository so every
    // worktree sees the same songs. The repo's own songs/ holds only the two
    // benchmark references, the benchmark script points SONGS_DIR there.
    SONGS_DIR: z.string().default(path.join(os.homedir(), ".piano", "songs")),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
