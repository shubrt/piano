# piano

Monorepo for piano, a MIDI player with YouTube import and AI structure
detection for practicing piano bar by bar and block by block. No application
code yet, just the workspace shell.

## Structure

- `apps/` application packages, currently empty
- `libs/` shared packages, currently empty
- `tools/typescript` the shared `@tool/tsconfig` presets: `core`, `lib`, `react`

pnpm workspaces cover `apps/*`, `libs/*` and `tools/*`. Shared dependency
versions live in the `catalog` block of `pnpm-workspace.yaml`.

## Setup

Requirements: Vite+ (`vp`), Node 22+, Bun 1.3.10+. `vp` drives installs,
scripts, linting, formatting and tests.

```bash
vp i
```

## Checks

```bash
vp run qa
```

`qa` runs formatting, lint, sherif, typecheck and the test suite. It fails
until the first workspace package exists, because `vp run -r typecheck` finds
no task and `vp test run` finds no test files. `vp check` and `vp run sherif`
pass on their own in the meantime.

Tests live in each package's `test/` directory and run from the repository
root:

```bash
vp test run     # single pass
vp test watch   # watch mode
```

The `.vite-hooks` git hooks run `vp staged` before each commit and check the
message with commitlint, which requires the conventional commit format.

## License

MIT. See [LICENSE](LICENSE).
