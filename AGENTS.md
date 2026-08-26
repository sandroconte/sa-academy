# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

**SA Academy** — cross-platform learning app (iOS / Android / Web) for Solution Architect education. A deterministic content **pipeline** converts two GitHub repos into a JSON *content pack*; an Expo **client** consumes it offline-first. No backend.

- Source 1: `chanakaudaya/solution-architecture-patterns` → course modules + auto-generated exercises.
- Source 2: `sandroconte/lectures` (`solution-architecture/` folder) → personal lessons, synced continuously.
- Spec: `docs/superpowers/specs/2026-08-21-sa-academy-design.md`
- Plans: `docs/superpowers/plans/`

## Context & flow

```
repos ──► pipeline/ (Node CLI, subjects.config.json) ──► content-pack/
              GitHub Action: cron 6h · manual · push          │
                                                              ▼
                                        client/ (Expo) fetches manifest on launch
                                        + pull-to-refresh, caches in SQLite (+FTS5)
```

Rules that keep this working:

- The pack is **deterministic**: no timestamps in output; seeded RNG only (`pipeline/src/exercises/rng.ts`). Same source commit ⇒ identical bytes.
- The app **never** calls the GitHub REST API — only raw file URLs (`client/src/lib/config.ts` → `PACK_BASE`, overridable via `EXPO_PUBLIC_PACK_BASE`).
- Sync semantics (spec §8): manifest fetch failure ⇒ serve cache + stale banner; individual file failures are skipped and retried on the next sync (`mergeFailedIntoPrev` keeps failed docs dirty).
- `content-pack/` is written by CI, never by hand. Locally it appears as untracked output — do not gitignore it and do not commit it manually unless intentional.

## Technologies

| Area | Stack |
|---|---|
| Pipeline | Node 20+, TypeScript strict ESM, unified/remark, vitest |
| Client | Expo SDK 57, React Native, expo-router, expo-sqlite (FTS5), zustand |
| CI | GitHub Actions |

Expo SDK moves fast: before writing client code, check the versioned docs at <https://docs.expo.dev/versions/v57.0.0/> (see also `client/AGENTS.md`).

## Structure

```
pipeline/
  src/main.ts            entrypoint (npm run pipeline)
  src/{discover,parse,curriculum,pack}.ts
  src/exercises/*        rng + cloze/mcq/matching/truefalse/ordering + orchestrator
  subjects.config.json   sources + curriculum (multi-subject extensibility point)
  tests/                 vitest suite + fixtures
client/
  app/(tabs)/            learn | patterns | lessons | practice
  app/doc/[id].tsx       shared reader (blocks, reading progress, mark-as-read)
  app/search.tsx         global FTS5 search
  src/lib/               db, sync, syncDiff, queries, grading, progress,
                         searchquery, session, images, types, config
  src/stores/content.ts  zustand store (syncing/stale/version)
  unit/                  vitest tests for pure lib functions ONLY
content-pack/            generated (CI-owned)
docs/superpowers/        spec + implementation plans
.github/workflows/content-pipeline.yml
```

## Commands

### Build the content pack locally (required before first app run)

```bash
cd pipeline && npm install && npm test && npm run pipeline
# writes ../content-pack/ (needs network to clone the two source repos)
```

### Run the app

Serve a local pack while developing:

```bash
python3 -m http.server 8173 --directory content-pack
```

| Target | Command | Pack base |
|---|---|---|
| Web | `cd client && EXPO_PUBLIC_PACK_BASE=http://localhost:8173 npx expo start --web` | `localhost:8173` |
| iOS simulator | `… npx expo start` then press `i` | `localhost:8173` |
| Android emulator | `… EXPO_PUBLIC_PACK_BASE=http://10.0.2.2:8173 npx expo start` then press `a` | `10.0.2.2:8173` (host alias) |
| Physical device | Expo Go + QR from `npx expo start` | `http://<LAN-IP>:8173` (`ipconfig getifaddr en0`) |

Production web bundle: `npx expo export --platform web` → `client/dist/` (requires `client/metro.config.js` wasm asset ext — already present).

### Tests

```bash
cd pipeline && npm test     # full pipeline suite
cd client  && npm test      # pure-logic unit suite
npx vitest run <file>       # single file (either package)
```

Typecheck gate for the client: `cd client && npx tsc --noEmit`.

## Adding new tests

- **Pipeline**: new file `pipeline/tests/<name>.test.ts` is auto-discovered (`include: tests/**/*.test.ts`). Fixtures in `tests/fixtures/`. Import source with `.js` extension (ESM/Node16 resolution).
- **Client**: new file `client/unit/<name>.test.ts` (auto-discovered, node environment). Only pure modules are testable here — `expo-sqlite`/RN components cannot run in vitest. When you extract new pure logic to support UI, put it in `client/src/lib/` and pair it with a test.
- Style: TDD (red → green), describe-per-function, assert observable behavior, inject randomness/time instead of mocking when possible.

## Conventions

- Conventional commits (`feat(client): …`, `fix(pipeline): …`, `chore:`/`ci:`/`test:`/`docs:`).
- TypeScript strict everywhere; no `any` unless quarantined at a boundary with a comment.
- Branch work on `feature/*`; never commit directly to `master` without consent.
- Do not add comments-heavy code; names carry the meaning (repo house style).
- Never commit secrets, tokens, or machine-local paths. `.gitignore` covers node_modules/dist/.expo/.sources.
- When touching SQL, verify against a scratch SQLite DB with the real DDL from `client/src/lib/db.ts` (FTS5 included) — tsc cannot catch SQL errors.
