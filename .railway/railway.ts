import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

// Railway project "piano" as code. Preview with `railway config plan`, apply
// with `railway config apply`, both from the repository root with the CLI
// linked to the project. Secrets stay in Railway (preserve()), everything else
// is spelled out here. PR environments duplicate production; the root
// railway.json adds sleeping for them.
export default defineRailway(() => {
  const repo = github("shubrt/piano", { checkSuites: false });
  const region = "europe-west4-drams3a";

  const db = postgres("Postgres", { region });
  db.networking = { privateNetworkEndpoint: "postgres" };
  const dbVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region,
    sizeMB: 5000,
  });

  // Audio to MIDI. Woken by web over the private network, asleep otherwise.
  const worker = service("worker", {
    source: repo,
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "apps/web/import/Dockerfile",
      watchPatterns: ["apps/web/import/**"],
    },
    healthcheck: "/health",
    replicas: { [region]: 1 },
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3, sleepApplication: true },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      PORT: "8000",
      WORKER_TOKEN: preserve(),
    },
  });

  // Next.js app. No PUBLIC_URL: the login takes the origin from each request,
  // so PR environments work on their generated domain.
  const web = service("web", {
    source: repo,
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "apps/web/Dockerfile",
      watchPatterns: [
        "apps/web/**",
        "!apps/web/import/**",
        "tools/**",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "package.json",
      ],
    },
    healthcheck: "/api/health",
    replicas: { [region]: 1 },
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3 },
    domains: ["piano.shubrt.me"],
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      WORKER_URL: "http://${{worker.RAILWAY_PRIVATE_DOMAIN}}:8000",
      WORKER_TOKEN: preserve(),
      SESSION_SECRET: preserve(),
      OPENROUTER_API_KEY: preserve(),
      STRUCTURE_MODEL: "anthropic/claude-opus-5",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  return project("piano", { resources: [db, dbVolume, worker, web] });
});
