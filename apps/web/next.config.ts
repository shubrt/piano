import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(import.meta.dirname, "../..");

const config: NextConfig = {
  // The Turbopack root is the monorepo, otherwise it warns about the shared lockfile.
  turbopack: { root },
  // The Dockerfile copies .next/standalone, traced from the monorepo root so
  // hoisted workspace packages end up in the image.
  output: "standalone",
  outputFileTracingRoot: root,
  agentRules: false,
};

export default config;
