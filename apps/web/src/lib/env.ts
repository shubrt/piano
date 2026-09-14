import { createEnv } from "@t3-oss/env-core";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// The .env lives in the monorepo root (t3.json symlinks it into worktrees).
// Next only reads the app folder, so load the root file by hand first.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const env = createEnv({
  server: {
    OPENROUTER_API_KEY: z.string().optional(),
    STRUCTURE_MODEL: z.string().default("anthropic/claude-opus-5"),
    // Folder with one subfolder per song, relative to the app directory.
    SONGS_DIR: z.string().default("songs"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
