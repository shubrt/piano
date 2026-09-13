import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // The Turbopack root is the monorepo, otherwise it warns about the shared lockfile.
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  agentRules: false,
};

export default config;
