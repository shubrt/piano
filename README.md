# piano

Monorepo for piano, a MIDI player with YouTube import and AI structure
detection for practicing piano bar by bar and block by block.

## Structure

- `apps/web` the Next.js app: pages, API routes, analysis, player. Songs live
  in `apps/web/songs/<id>/` as `notes.mid` plus `song.json`. The Python side of
  the YouTube import (yt-dlp, ffmpeg, Transkun) is in `apps/web/import/`.
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
cp .env.example .env        # OPENROUTER_API_KEY, STRUCTURE_MODEL
vp run dev                  # https://piano.localhost, in a worktree https://<branch>.piano.localhost
```

Without `OPENROUTER_API_KEY` the player works, but new songs get no parts and
the song list marks them "ohne Struktur".

YouTube import needs the Python toolchain once:

```bash
brew install yt-dlp ffmpeg uv
cd apps/web/import && uv python install 3.12 && uv sync
```

The first transcription downloads the Transkun model. Without a GPU a song
takes one to three minutes.

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
