# SA Academy — Design Document

Date: 2026-08-21
Status: Approved (pending implementation plan)

## Extensibility — multiple subjects

Adding further study subjects later requires **no re-engineering**, only a
small additive refactor when the second subject arrives:

- **v1 (now):** pipeline sources + curriculum are driven by a
  `pipeline/subjects.config.json` file:

  ```json
  {
    "subjects": [
      {
        "id": "solution-architecture",
        "name": "Solution Architecture",
        "sources": [
          { "repo": "chanakaudaya/solution-architecture-patterns", "paths": ["vendor-neutral", "industry-specific", "technology-selection-guides", "vendor-specific"] },
          { "repo": "sandroconte/lectures", "path": "solution-architecture", "kind": "lectures" }
        ],
        "curriculum": { "moduleOrder": ["foundations", "integration-apis", "cloud-microservices", "security-governance"], "extraModuleTitle": "Extra patterns" }
      }
    ]
  }
  ```

  Tab titles, course name, and parsing targets derive from this config.
- **Subject #2 (future refactor):** add `subject_id` column to `documents`,
  `modules`, `exercises`; add `subjects[]` map to the manifest; group the UI by
  subject. Pack format, parser, exercise engine, grading, sync, and SQLite
  schema are content-agnostic and stay untouched.

## 1. Overview

SA Academy is a cross-platform learning app (iOS, Android, Web) for professional
Solution Architect education. It has two content sources:

1. **`chanakaudaya/solution-architecture-patterns`** — a curated collection of
   solution-architecture pattern documents (markdown), organized into four
   categories: `vendor-neutral`, `industry-specific`,
   `technology-selection-guides`, `vendor-specific`.
2. **`sandroconte/lectures`** → folder **`solution-architecture/`** — the user's
   own lessons (markdown). This folder may not exist yet; the app must handle
   that gracefully.

The app turns the patterns repo into a structured course (modules of formatted
lessons + auto-generated exercises) and continuously mirrors the user's own
lectures into a readable format.

### Goals

- Single TypeScript codebase targeting iOS, Android, and Web.
- Zero backend, zero runtime cost for the user.
- Always useful from day one: the patterns repo is converted into a full course,
  so there is never an empty state.
- New personal lectures appear in the app automatically after being pushed to
  the lectures repo.

### Non-goals (v1)

- User accounts / cloud progress sync.
- AI-generated exercises.
- Content editing inside the app.
- Offline exercise generation (generation happens in the pipeline only).

## 2. Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Stack | Expo / React Native + TypeScript | One codebase → iOS + Android + Web |
| Architecture | Client app + GitHub Actions content pipeline ("Approach B") | Richer exercises than pure client-side, still no hosting cost |
| Sync strategy | On launch + pull-to-refresh | Simple, respects rate limits |
| Guide structure | Learning path AND browsable reference | Course feel + pocket reference |
| Exercises | Auto-generated from markdown in the pipeline | Deterministic, scales with content |
| Project location | `~/Proj/sa-academy` | User choice |

## 3. System overview & content flow

```
chanakaudaya/solution-architecture-patterns ──┐
                                              │
sandroconte/lectures/solution-architecture ───┤
                                              ▼
                    GitHub Action (in sa-academy repo)
                    triggers: cron every 6h + workflow_dispatch
                    (manual) + push to sa-academy itself
                    ├─ clones both repos
                    ├─ parses every .md → structured JSON
                    │   (title, section tree, key terms, definitions,
                    │    image list, reading time)
                    ├─ generates exercises per document
                    └─ writes versioned content pack
                       (manifest.json + one JSON per document)
                              │
                              ▼
                    App: on launch fetches manifest.json (raw URL),
                    downloads changed files only, caches in SQLite
```

### Content pack

- Lives in the `sa-academy` GitHub repository under `content-pack/`, committed
  by the Action.
- Structure:
  - `manifest.json` — pack version (source commit SHAs), list of documents
    with per-file hashes.
  - `docs/<id>.json` — one structured document per file.
  - `exercises/<id>.json` — exercises per document.
- Versioning = source commit SHAs; the app diffs via the manifest (1 request).
- Images keep absolute `raw.githubusercontent.com` URLs pointing at the source
  repos — no binaries in the pack.
- The sa-academy repo must be public (free unlimited GitHub Actions).

### Lessons are never empty

The pipeline always generates a **course package derived from the patterns
repo**, grouped into progressive modules:

```
Lessons tab
├─ 📚 Course: Solution Architecture Patterns   ← generated from patterns repo
│   ├─ Module 1: Foundations (Layered, Enterprise stack, …)
│   ├─ Module 2: Integration & APIs (API-led, GraphQL, EDA, …)
│   ├─ Module 3: Cloud & Microservices (Strangler, service mesh, …)
│   └─ Module 4: Security & Governance (IAM, API security, …)
└─ 🎓 Your Lectures                            ← from sandroconte/lectures
    └─ (appears automatically when .md files are pushed)
```

Module assignment is defined by a static curriculum mapping shipped in the
pipeline (pattern slug → module); unmapped patterns go to an "Extra patterns"
module so nothing is lost.

## 4. Pipeline (GitHub Action)

Node + TypeScript program under `pipeline/` in the sa-academy repo.

Steps:

1. Shallow-clone both source repos at their default branches.
2. Discover markdown files:
   - Patterns repo: all `.md` under the four category folders (skip READMEs).
   - Lectures repo: every `.md` under `solution-architecture/` (recursive);
     missing folder → skip silently.
3. Parse each file into a structured document:
   - Title (first H1 or filename), summary (first paragraph), section tree,
     ordered content blocks (heading / paragraph / list / code / image /
     table / blockquote), key terms (headings, bold text, definition
     sentences like "X is a…", "X: …"), estimated reading time.
4. Generate exercises (see §6).
5. Emit the content pack deterministically (seeded RNG keyed by content hash).
6. Commit the pack to `content-pack/` if anything changed (single commit,
   `[skip ci]` in message).
7. Publish an Action summary: counts parsed/generated/skipped + failures.

Failure policy: one unparseable file is logged and skipped; the pack is still
published. Pipeline tests must pass before any pack commit.

## 5. App architecture

Expo + TypeScript. Navigation via `expo-router`, 4 tabs:

| Tab | Content |
|---|---|
| **Learn** | Course path: modules with progress rings, "continue where you left off" |
| **Patterns** | Reference catalog: search + filter by category |
| **Lessons** | Course (patterns-derived) + Your Lectures (from lectures repo) |
| **Practice** | Mixed quiz sessions, missed-question review queue, streak/stats |

Shared **reader screen**: renders structured blocks natively (no runtime MD
parsing), images loaded from source-repo raw URLs, reading progress bar,
"Practice this lesson" button, and a **"Mark as read"** toggle (also available
per module, marking all its documents).

### Global search

Search reachable from every tab (header search icon → full-screen search):
queries run against an SQLite FTS5 index built app-side during pack import from
document blocks (titles, headings, body text, key terms). Results are grouped
by area (Course / Patterns / Your Lectures), ranked by relevance, support
prefix matching, and deep-link into the reader screen at the matching heading.
The index is rebuilt incrementally for changed documents only.

Stack details: `expo-sqlite`, `zustand` (UI state), `expo-file-system`
(downloads). Grading and sync logic are pure functions.

## 6. Data model (SQLite)

```
documents        (id, source, category, title, slug, sha, blocks_json, reading_min)
modules          (id, title, position)
module_docs      (module_id, doc_id, position)
exercises        (id, doc_id, type, payload_json, answer_key)
progress         (doc_id, status: unread|reading|read, percent,
                  last_read_at, read_marked_at)   ← 'read' set automatically
                  (percent ≥ 95) or via manual mark-as-read
search_index     (FTS5 virtual table: doc_id, title, headings, body, terms)
attempts         (exercise_id, correct, answered_at)
sync_state       (pack_version, last_synced_at)
```

No account, no token: everything local; the pack is public.

## 7. Exercise generation

| Type | Generation rule |
|---|---|
| Cloze | Definition sentence with the term blanked; 3 distractors from same category |
| MCQ | "What is X?" → correct definition + 3 other terms' definitions |
| Matching | 4 terms ↔ 4 definitions from the same document |
| True/False | Real sentence or perturbed one (swapped pattern names / negation) — conservative, marked auto-generated |
| Ordering | Numbered step lists → sequence-order question |

Quality gates: minimum sentence length, deduplication, cap 8–12 exercises per
document, seeded RNG by content hash → identical source commit always yields an
identical pack. Grading happens in-app against `answer_key`.

## 8. Sync & error handling

- On launch: fetch `manifest.json` from raw URL → diff against `sync_state` →
  download changed files only → upsert into SQLite.
- Pull-to-refresh repeats the same flow.
- Manifest fetch failure → serve cache + "content may be stale" banner.
- Partial download failure → keep previous entries for failed files.
- Corrupt JSON → discard that entry only.
- Raw URLs are not API-rate-limited; ETags avoid redundant downloads.

## 9. Testing

- **Pipeline**: vitest unit tests against fixture markdown files; determinism
  test (same input + seed = same output); golden snapshot of a small pack.
- **App**: vitest for sync diffing, grading, progress calculation (including
  auto-read threshold and module-level mark-as-read), and FTS indexing/search
  ranking; render smoke tests; manual e2e checklist for v1.
- The Action runs pipeline tests before committing any pack.

## 10. Future work (out of scope v1)

- Optional PAT setting for higher raw-CDN limits (not needed today).
- Spaced-repetition scheduling beyond simple missed-question queue.
- Cloud progress sync / accounts.
- AI-generated scenario exercises (interface already isolates the generator).
