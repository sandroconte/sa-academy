# SA Academy

A cross-platform learning app (**iOS / Android / Web**) for professional **Solution Architect** education, built with Expo + TypeScript.

It turns two GitHub repositories into a structured course:

1. **[`chanakaudaya/solution-architecture-patterns`](https://github.com/chanakaudaya/solution-architecture-patterns)** — ~56 architecture-pattern documents, parsed into formatted lessons and grouped into progressive modules (Foundations → Integration & APIs → Cloud & Microservices → Security & Governance).
2. **[`sandroconte/lectures`](https://github.com/sandroconte/lectures)** → folder **`solution-architecture/`** — your own lessons. Push `.md` files there and they appear in the app automatically after the next sync.

Every document also gets **auto-generated exercises** (cloze deletion, multiple choice, matching, true/false, ordering) for active practice.

---

## Context & architecture

There is no backend. The system is a deterministic **content pipeline** plus a **client-only app** that talks to it through a versioned JSON *content pack*:

```
patterns repo ──┐
                ├─→ GitHub Action (cron 6h · manual · push)
lectures repo ──┘         │
                          ▼
              pipeline/  (Node + TypeScript)
              parse md → structured blocks → extract terms
              → generate seeded exercises → assign modules
                          │
                          ▼
              content-pack/   manifest.json + docs/*.json + exercises/*.json
                (committed back to THIS repo by the Action)
                          │
                          ▼
              client/  (Expo app)
              fetches manifest on launch + pull-to-refresh,
              downloads only changed files, caches in SQLite (+ FTS5 search index)
```

Key properties:

- **Deterministic packs** — same source commit ⇒ byte-identical output (seeded RNG, no timestamps).
- **No API limits** — the app only reads raw files from GitHub; it never calls the REST API.
- **Offline-first** — content is cached locally; if the pack can't be reached the app serves the cache and shows an "offline" banner.
- **Retry-safe sync** — failed downloads stay "dirty" and are retried on the next sync.
- **Multi-subject ready** — sources and curriculum live in `pipeline/subjects.config.json`; adding a new subject later is additive.

### Repository structure

```
sa-academy/
├─ pipeline/                 # content pipeline (Node CLI + GitHub Action job)
│  ├─ subjects.config.json   # ← sources + curriculum definition (multi-subject)
│  ├─ src/
│  │  ├─ main.ts             # entrypoint: clone repos → run stages → write pack
│  │  ├─ discover.ts         # find .md files from config
│  │  ├─ parse.ts            # markdown → blocks / sections / key terms
│  │  ├─ curriculum.ts       # module assignment for patterns
│  │  ├─ pack.ts             # deterministic manifest + file emission
│  │  └─ exercises/          # rng + 5 generators + orchestrator
│  └─ tests/                 # vitest unit tests + fixtures
├─ client/                   # Expo app (iOS / Android / Web)
│  ├─ app/                   # expo-router routes: (tabs)/learn|patterns|lessons|practice, doc/[id], search
│  ├─ src/
│  │  ├─ lib/                # db (SQLite+FTS5), sync, grading, progress, queries, images…
│  │  ├─ stores/             # zustand store
│  │  └─ components/         # Blocks renderer, DocRow, Ring
│  ├─ unit/                  # vitest tests (pure logic only — see Testing)
│  └─ metro.config.js        # wasm asset for expo-sqlite web
├─ content-pack/             # generated output (committed by CI, not by hand)
└─ .github/workflows/content-pipeline.yml
```

### Tech stack

| Area | Technologies |
|---|---|
| Pipeline | Node 20+, TypeScript (strict, ESM), unified / remark-parse / remark-gfm, vitest |
| App | Expo SDK 57, React Native, expo-router, TypeScript |
| Data | expo-sqlite (incl. FTS5 full-text search), zustand, expo-file-system |
| Tests | vitest (both packages) |
| CI | GitHub Actions (public repo = free), commits the pack with `[skip ci]` |

---

## Getting started

Prerequisites: **Node 20+**, npm. For mobile: **Xcode** (iOS simulator, macOS) or **Android Studio** (emulator). Physical devices use **Expo Go**.

```bash
git clone https://github.com/sandroconte/sa-academy.git
cd sa-academy

# 1) build a local content pack (clones the two source repos, needs network)
cd pipeline && npm install && npm test && npm run pipeline
# → writes ../content-pack/   (57 docs expected today)

# 2) install the app
cd ../client && npm install
```

By default the app fetches the pack from
`https://raw.githubusercontent.com/sandroconte/sa-academy/master/content-pack`.
While developing locally, point it at your freshly built pack instead (see below).

### Run on the web

```bash
# terminal 1 — serve the local pack
python3 -m http.server 8173 --directory content-pack

# terminal 2 — start Expo for web
cd client
EXPO_PUBLIC_PACK_BASE=http://localhost:8173 npx expo start --web
```

Production bundle: `npx expo export --platform web` → static site in `client/dist/`.

> The web build needs `metro.config.js` (already included): Metro must serve `.wasm` assets for expo-sqlite's web worker.

### Run on an iOS simulator (macOS)

```bash
cd client
EXPO_PUBLIC_PACK_BASE=http://localhost:8173 npx expo start
# press  i  to launch the iOS simulator
```

`localhost` works as-is inside the simulator.

### Run on an Android emulator

```bash
cd client
EXPO_PUBLIC_PACK_BASE=http://10.0.2.2:8173 npx expo start
# press  a  to launch the Android emulator
```

The Android emulator reaches your machine via the special alias **`10.0.2.2`** — not `localhost`.

### Run on a physical device

1. Install **Expo Go** from the App Store / Play Store.
2. Phone and computer must be on the **same Wi-Fi network**.
3. Find your computer's LAN IP (`ipconfig getifaddr en0` on macOS).
4.
   ```bash
   cd client
   EXPO_PUBLIC_PACK_BASE=http://<LAN-IP>:8173 npx expo start
   ```
5. Scan the QR code shown in the terminal (Android: inside Expo Go).

If the pack fails to load on the device, the app still shows cached/local data with the offline banner — check that port 8173 is reachable from the phone.

---

## Testing

Two independent vitest suites:

```bash
# pipeline logic (parser, generators, pack builder…)
cd pipeline && npm test

# app pure logic (sync diff, grading, progress, FTS query, session…)
cd client && npm test
```

**What is tested where**

- `pipeline/tests/*.test.ts` — everything: parsing, term extraction, all 5 exercise generators, determinism, curriculum, pack emission.
- `client/unit/*.test.ts` — **pure functions only**. Native modules (`expo-sqlite`, React components) cannot run in Node, so SQL correctness is verified against a scratch SQLite DB during review and on-device smoke tests.

### Adding new tests

**Pipeline** — create `pipeline/tests/<name>.test.ts`; it is picked up automatically (`vitest.config.ts` includes `tests/**/*.test.ts`). Fixtures go in `pipeline/tests/fixtures/`. Style: TDD, one describe per module, assert behavior not implementation.

```ts
// pipeline/tests/my-feature.test.ts
import { describe, it, expect } from "vitest";
import { myFn } from "../src/my-module.js"; // note the .js extension (ESM)

describe("myFn", () => {
  it("does X", () => expect(myFn(1)).toBe(2));
});
```

**Client** — create `client/unit/<name>.test.ts` (config includes `unit/**/*.test.ts`). Rules of thumb:

- Test only pure modules under `client/src/lib/` (`syncDiff`, `grading`, `progress`, `searchquery`, `session`, `images`, `types`).
- Inject randomness/time rather than mocking timers where possible (`buildSession(pool, cap, rand)`).
- If you add a pure helper to support UI, export it from `lib/` and pair it with a unit test here.

Run a single file: `npx vitest run unit/grading.test.ts` (or the pipeline equivalent).

---

## Content pipeline & CI

- The Action (`.github/workflows/content-pipeline.yml`) runs on push (paths `pipeline/**`, `subjects.config.json`), every 6 hours, and manually via *workflow_dispatch*.
- It runs the pipeline test suite first, then rebuilds the pack and commits it to `content-pack/` if anything changed (`[skip ci]`).
- A missing `solution-architecture/` folder in the lectures repo is **not** an error — lessons simply stay empty until you push files there.

To change what the app learns from, edit `pipeline/subjects.config.json` (repos, folders, module rules) and re-run the pipeline.

## License

MIT (see pipeline dependencies; source content belongs to the respective repos).
