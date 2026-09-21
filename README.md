# piano

Monorepo for piano, a MIDI player with YouTube import and AI structure
detection for practicing piano bar by bar and block by block.

## Structure

- `apps/web` the Next.js app: pages, API routes, analysis, player. Songs live
  in Postgres (`songs` table, metadata as jsonb plus the MIDI bytes), the
  schema is in `src/lib/db/schema.ts` and migrations in `drizzle/` run on boot.
  `apps/web/songs/` holds only the two benchmark reference songs as folders.
  `apps/web/import/` is the Python worker that turns YouTube URLs and audio
  files into MIDI (yt-dlp, ffmpeg, Transkun).
- `libs/` shared packages, currently empty
- `tools/typescript` the shared `@tool/tsconfig` presets: `core`, `lib`, `react`

pnpm workspaces cover `apps/*`, `libs/*` and `tools/*`. Shared dependency
versions live in the `catalog` block of `pnpm-workspace.yaml`.

## Setup

Requirements: Vite+ (`vp`), Node 22+, Bun 1.3.10+, [portless](https://github.com/vercel-labs/portless)
for the dev server URL (`npm i -g portless`, `portless doctor` checks it). `vp` drives installs,
scripts, linting, formatting and tests.

```bash
vp i
cp .env.example .env        # DATABASE_URL, SESSION_SECRET, WORKER_TOKEN, OPENROUTER_API_KEY
docker compose up -d        # Postgres on localhost:5432, shared by every worktree
vp run dev                  # https://piano.localhost, in a worktree https://<branch>.piano.localhost
```

Every page needs a login through [shoo.dev](https://shoo.dev). Locally the
login binds to whatever origin the browser is on, so every worktree URL works.
Production pins it with `PUBLIC_URL`. All signed-in users share one song list.

Songs that still sit in folders (`~/.piano/songs/<id>/` with `notes.mid` and
`song.json`, the format before Postgres) move into the database once:

```bash
cd apps/web && bun --env-file=../../.env scripts/import-songs.ts
```

New songs get their parts from the local heuristic in
`apps/web/src/lib/structure/heuristic.ts`. The "KI-Analyse" button in the song
list asks `STRUCTURE_MODEL` via OpenRouter instead and overwrites the parts, so
`OPENROUTER_API_KEY` is only needed for that button and for benchmark references.

YouTube and audio imports run in the worker. Locally:

```bash
brew install ffmpeg uv
cd apps/web/import && uv python install 3.12 && uv sync
vp run dev:worker           # https://<branch>.piano-worker.localhost through portless
```

The web app inserts a row into `import_jobs` and wakes the worker over HTTP;
the browser polls the job. Locally the app finds the worker through
`portless get piano-worker`, so both run under the same worktree prefix. Without a GPU a song takes one to three minutes.

## Hosting

Production is `https://piano.shubrt.me` on Railway, project `piano`, three
services from this repository: `web` (`apps/web/Dockerfile`), `worker`
(`apps/web/import/Dockerfile`) and a Railway Postgres. Every push to `main`
deploys, every pull request gets its own environment with an empty database.
The `railway.json` next to each Dockerfile holds build, healthcheck and
watch paths; `web` sleeps only in PR environments, `worker` always sleeps
between imports. Variables per service:

| Service | Variables                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web     | `DATABASE_URL=${{postgres.DATABASE_URL}}`, `PUBLIC_URL`, `SESSION_SECRET`, `WORKER_URL=http://${{worker.RAILWAY_PRIVATE_DOMAIN}}:8000`, `WORKER_TOKEN`, `OPENROUTER_API_KEY`, `STRUCTURE_MODEL` |
| worker  | `DATABASE_URL=${{postgres.DATABASE_URL}}`, `WORKER_TOKEN`, `PORT=8000`                                                                                                                          |

PR environments leave `PUBLIC_URL` unset and take the origin from the request. DNS
is a DNS-only CNAME plus the TXT record Railway shows, both at Cloudflare.

## Structure benchmark

The benchmark scores the heuristic per song against `songs/<id>/reference.json`,
100 means identical part starts and block grids:

```bash
cd apps/web
vp run benchmark                                   # score songs with a reference
vp run benchmark -- --reference                    # write missing references with STRUCTURE_MODEL
vp run benchmark -- --reference anthropic/claude-opus-5
```

A reference is one model answer. Check it in the player and edit the file where
the model was wrong. The run exits with 1 when any song scores below 100.

## Hands benchmark

The hand assignment has its own benchmark over every song folder in `SONGS_DIR`
(default `~/.piano/songs`), so it also covers songs that are not in the repo:

```bash
cd apps/web
vp run benchmark:hands                          # console summary
vp run benchmark:hands -- --html report.html    # plus a static HTML report
```

Truth comes from two sources. A MIDI file with two note tracks carries the
hands, the heuristic runs on the flattened notes and is scored against the
tracks. A `hands.json` next to a song labels single bars by the pitches the
left hand plays, everything else in the bar is the right hand:

```json
{ "bars": { "17": ["G3", "E3", "B3", "E4", "C3"] } }
```

Every song is also linted without a reference for grips wider than a hand,
jumps over an octave within 120 ms, crossed hands and repeated bars with a
different hand split. The run exits with 1 when any referenced song is below
100 %.

## Checks

```bash
vp run qa
```

`qa` runs formatting, lint, sherif, typecheck and the test suite. Tests live in
each package's `test/` directory and run from the repository root:

```bash
vp test run     # single pass
vp test watch   # watch mode
```

The `.vite-hooks` git hooks run `vp staged` before each commit and check the
message with commitlint, which requires the conventional commit format.

## License

MIT. See [LICENSE](LICENSE).
