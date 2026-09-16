# piano

Monorepo for piano, a MIDI player with YouTube import and AI structure
detection for practicing piano bar by bar and block by block.

## Structure

- `apps/web` the Next.js app: pages, API routes, analysis, player. Songs live
  in `~/.piano/songs/<id>/` as `notes.mid` plus `song.json`, shared by every
  worktree (`SONGS_DIR` overrides the folder). `apps/web/songs/` holds only the
  two benchmark reference songs. The Python side of the YouTube import (yt-dlp,
  ffmpeg, Transkun) is in `apps/web/import/`.
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

New songs get their parts from the local heuristic in
`apps/web/src/lib/structure/heuristic.ts`. The "KI-Analyse" button in the song
list asks `STRUCTURE_MODEL` via OpenRouter instead and overwrites the parts, so
`OPENROUTER_API_KEY` is only needed for that button and for benchmark references.

YouTube import needs the Python toolchain once:

```bash
brew install yt-dlp ffmpeg uv
cd apps/web/import && uv python install 3.12 && uv sync
```

The first transcription downloads the Transkun model. Without a GPU a song
takes one to three minutes.

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

The hand assignment has its own benchmark over every song in `SONGS_DIR`
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
