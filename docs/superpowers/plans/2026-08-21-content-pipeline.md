# Content Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TypeScript pipeline that turns the two source repos into a deterministic, versioned content pack (structured docs + auto-generated exercises) committed to `content-pack/`.

**Architecture:** Node CLI under `pipeline/` driven by `subjects.config.json`. Stages: discover → parse (mdast → blocks/terms) → generate exercises (seeded RNG) → assign curriculum → emit pack (manifest + per-doc JSON). A GitHub Action runs tests then the pipeline on cron/manual/push.

**Tech Stack:** Node 20+, TypeScript, unified/remark-parse/remark-gfm, vitest, node:crypto, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-21-sa-academy-design.md` (§3, §4, §7, Extensibility).

---

## File structure

```
pipeline/
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ .gitignore                      # node_modules, dist, .sources
├─ subjects.config.json
├─ src/
│  ├─ types.ts                     # all shared interfaces
│  ├─ discover.ts                  # find .md files from config sources
│  ├─ parse.ts                     # md → ParsedDoc (blocks, sections, terms)
│  ├─ exercises/
│  │  ├─ rng.ts                    # fnv1a hash + mulberry32 + shuffle/pickN
│  │  ├─ cloze.ts
│  │  ├─ mcq.ts
│  │  ├─ matching.ts
│  │  ├─ truefalse.ts
│  │  ├─ ordering.ts
│  │  └─ generate.ts               # orchestrator, quality gates, caps
│  ├─ curriculum.ts                # module assignment for pattern docs
│  ├─ pack.ts                      # manifest + file emission (deterministic)
│  └─ main.ts                      # clone repos → run stages → write pack
└─ tests/
   ├─ fixtures/pattern-sample.md
   ├─ fixtures/lecture-sample.md
   ├─ discover.test.ts
   ├─ parse.test.ts
   ├─ rng.test.ts
   ├─ exercises.test.ts
   ├─ curriculum.test.ts
   └─ pack.test.ts
.github/workflows/content-pipeline.yml
.gitignore                         # root: node_modules, .sources, dist
```

---

### Task 1: Scaffold pipeline package

**Files:**
- Create: `pipeline/package.json`
- Create: `pipeline/tsconfig.json`
- Create: `pipeline/vitest.config.ts`
- Create: `pipeline/.gitignore`
- Create: `.gitignore` (root)
- Create: `pipeline/tests/smoke.test.ts`

- [ ] **Step 1: Create `pipeline/package.json`**

```json
{
  "name": "sa-academy-pipeline",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json",
    "pipeline": "npm run build && node dist/main.js"
  },
  "dependencies": {
    "remark-gfm": "^4.0.0",
    "remark-parse": "^11.0.0",
    "unified": "^11.0.0"
  },
  "devDependencies": {
    "@types/mdast": "^4.0.0",
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `pipeline/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `pipeline/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: Create ignore files**

`pipeline/.gitignore`:
```
node_modules/
dist/
.sources/
```

Root `.gitignore`:
```
node_modules/
.sources/
dist/
.DS_Store
```

- [ ] **Step 5: Write smoke test `pipeline/tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs vitest with TS", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install and verify**

Run: `cd pipeline && npm install && npm test`
Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add pipeline .gitignore && git commit -m "chore(pipeline): scaffold package with vitest"
```

---

### Task 2: Shared types + subjects config + fixtures

**Files:**
- Create: `pipeline/src/types.ts`
- Create: `pipeline/subjects.config.json`
- Create: `pipeline/tests/fixtures/pattern-sample.md`
- Create: `pipeline/tests/fixtures/lecture-sample.md`

- [ ] **Step 1: Create `pipeline/src/types.ts`**

```ts
export interface RepoSource {
  repo: string; // "owner/name"
  paths?: string[]; // subpaths to scan (repo root if omitted)
  path?: string; // single subpath (lectures case)
  kind: "patterns" | "lectures";
}

export interface SubjectConfig {
  id: string;
  name: string;
  sources: RepoSource[];
  curriculum: {
    modules: { id: string; title: string; rules: string[] }[];
    extraModuleTitle: string;
  };
}

export interface SubjectsConfig {
  subjects: SubjectConfig[];
}

export type BlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "ordered-list"
  | "code"
  | "image"
  | "table"
  | "blockquote";

export interface Block {
  type: BlockType;
  level?: number; // heading level
  text?: string; // paragraph/blockquote/heading text
  items?: string[]; // list items
  lang?: string; // code language
  value?: string; // code content
  url?: string; // image url
  alt?: string; // image alt
  rows?: string[][]; // table rows
}

export interface Term {
  term: string;
  definition: string | null; // defining sentence containing the term, if found
}

export interface ParsedDoc {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string; // source folder or "lectures"
  title: string;
  slug: string;
  readingMin: number;
  blocks: Block[];
  sections: { title: string }[];
  terms: Term[];
}

export type ExerciseType = "cloze" | "mcq" | "matching" | "truefalse" | "ordering";

export interface Exercise {
  id: string;
  type: ExerciseType;
  // prompt+options for cloze/mcq, pairs for matching, statement for truefalse, items for ordering
  payload: Record<string, unknown>;
  answerKey: number | number[] | boolean;
}

export interface ModuleRef {
  id: string;
  subjectId: string;
  title: string;
  position: number;
}

export interface ModuleDocRef {
  moduleId: string;
  docId: string;
  position: number;
}

export interface ManifestDocEntry {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string;
  title: string;
  file: string;
  exercisesFile: string;
  sha256: string;
}

export interface Manifest {
  version: Record<string, string>; // repo label -> commit sha
  subjects: { id: string; name: string }[];
  docs: ManifestDocEntry[];
  modules: ModuleRef[];
  moduleDocs: ModuleDocRef[];
}

export interface RepoInput {
  label: string; // "patterns" | "lectures"
  url: string; // https://github.com/owner/name
  localDir: string; // cloned checkout
  sha: string;
  sources: RepoSource[];
}
```

- [ ] **Step 2: Create `pipeline/subjects.config.json`**

```json
{
  "subjects": [
    {
      "id": "solution-architecture",
      "name": "Solution Architecture",
      "sources": [
        {
          "repo": "chanakaudaya/solution-architecture-patterns",
          "kind": "patterns",
          "paths": ["vendor-neutral", "industry-specific", "technology-selection-guides", "vendor-specific"]
        },
        {
          "repo": "sandroconte/lectures",
          "kind": "lectures",
          "path": "solution-architecture"
        }
      ],
      "curriculum": {
        "modules": [
          {
            "id": "foundations",
            "title": "Foundations",
            "rules": ["layered", "enterprise-software-stack", "decentralized-enterpise", "micro-architecture", "innovation-driven"]
          },
          {
            "id": "integration-apis",
            "title": "Integration & APIs",
            "rules": ["api", "graphql", "openapi", "event-driven", "kafka", "nats", "change-data-capture", "hybrid-integration", "soa"]
          },
          {
            "id": "cloud-microservices",
            "title": "Cloud & Microservices",
            "rules": ["cloud", "kubernetes", "istio", "service-mesh", "microservice", "strangler", "cicd", "sidecar"]
          },
          {
            "id": "security-governance",
            "title": "Security & Governance",
            "rules": ["security", "identity", "access-management", "governance"]
          }
        ],
        "extraModuleTitle": "Extra patterns"
      }
    }
  ]
}
```

- [ ] **Step 3: Create fixture `pipeline/tests/fixtures/pattern-sample.md`**

```markdown
# API Security Pattern

The **API Security Pattern** is a pattern that protects APIs using authentication, authorization, and throttling at a dedicated gateway layer.

## Overview

An API gateway is a component that sits between clients and backend services.
It enforces security policies centrally.

### Key elements

1. Authenticate every request at the edge
2. Authorize access with scoped tokens
3. Throttle abusive clients

## Threats

Common threats include token leakage and replay attacks.

| Threat | Mitigation |
| ------ | ---------- |
| Replay | Nonces |
| Leak   | Short TTL |

![Gateway diagram](images/gateway.png)

```yaml
gateway:
  auth: jwt
```

> Defense in depth beats a single control.
```

(Inside the plan file the nested fence above is literal content of the fixture; when creating the actual fixture file the inner ```yaml block is normal fenced content.)

- [ ] **Step 4: Create fixture `pipeline/tests/fixtures/lecture-sample.md`**

```markdown
# Lecture 01 — Intro to Solution Architecture

A **solution architect** is a person who designs end-to-end technical solutions for business problems.

## Agenda

- Roles and responsibilities
- Architecture decisions

## Summary

Architecture decisions are long-lived and costly to reverse.
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/types.ts pipeline/subjects.config.json pipeline/tests/fixtures
git commit -m "feat(pipeline): shared types, subjects config, test fixtures"
```

---

### Task 3: discover — find markdown files from config

**Files:**
- Create: `pipeline/src/discover.ts`
- Test: `pipeline/tests/discover.test.ts`

- [ ] **Step 1: Write failing test `pipeline/tests/discover.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { discoverSource } from "../src/discover.js";
import type { RepoSource } from "../src/types.js";

const root = join(import.meta.dirname, "fixtures-repo");

describe("discoverSource", () => {
  const patterns: RepoSource = {
    repo: "x/y",
    kind: "patterns",
    paths: ["cat-a"],
  };

  it("finds md files under configured paths, skipping READMEs", () => {
    const files = discoverSource(root, patterns);
    expect(files.map((f) => f.relPath)).toEqual(["cat-a/doc-one.md"]);
    expect(files[0].category).toBe("cat-a");
    expect(files[0].kind).toBe("patterns");
  });

  const lectures: RepoSource = { repo: "a/b", kind: "lectures", path: "solution-architecture" };
  it("returns empty array when configured folder is missing", () => {
    const files = discoverSource(root, lectures);
    expect(files).toEqual([]);
  });
});
```

- [ ] **Step 2: Create test tree `pipeline/tests/fixtures-repo/`**

Create empty dirs and files:
- `pipeline/tests/fixtures-repo/cat-a/doc-one.md` (empty file)
- `pipeline/tests/fixtures-repo/cat-b/hidden.md` (empty file — outside configured path)
- `pipeline/tests/fixtures-repo/cat-a/README.md` (empty file)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && npx vitest run tests/discover.test.ts`
Expected: FAIL — cannot find module `../src/discover.js`.

- [ ] **Step 4: Implement `pipeline/src/discover.ts`**

```ts
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import type { RepoSource } from "./types.js";

export interface DiscoveredFile {
  repoLabel: string;
  absPath: string;
  relPath: string;
  category: string;
  kind: RepoSource["kind"];
}

function walk(dir: string, base: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(full);
  }
  void base;
}

export function discoverSource(repoRoot: string, source: RepoSource): DiscoveredFile[] {
  const roots = source.paths ?? [source.path ?? "."];
  const out: DiscoveredFile[] = [];
  for (const sub of roots) {
    const abs = join(repoRoot, sub);
    if (!existsSync(abs)) continue;
    const files: string[] = [];
    walk(abs, abs, files);
    for (const f of files) {
      const name = basename(f);
      if (!name.toLowerCase().endsWith(".md")) continue;
      if (/^readme/i.test(name)) continue;
      out.push({
        repoLabel: source.repo,
        absPath: f,
        relPath: relative(repoRoot, f),
        category: source.kind === "lectures" ? "lectures" : sub,
        kind: source.kind,
      });
    }
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd pipeline && npx vitest run tests/discover.test.ts`
Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/discover.ts pipeline/tests/discover.test.ts pipeline/tests/fixtures-repo
git commit -m "feat(pipeline): discover markdown sources from config"
```

---

### Task 4: parse — markdown → structured blocks, sections, terms

**Files:**
- Create: `pipeline/src/parse.ts`
- Test: `pipeline/tests/parse.test.ts`

- [ ] **Step 1: Write failing test `pipeline/tests/parse.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown, makeSlug } from "../src/parse.js";

const md = readFileSync(join(import.meta.dirname, "fixtures/pattern-sample.md"), "utf8");

describe("makeSlug", () => {
  it("kebab-cases filenames", () => {
    expect(makeSlug("API-Security-Pattern.md")).toBe("api-security-pattern");
  });
});

describe("parseMarkdown", () => {
  const doc = parseMarkdown(md, {
    id: "sa-pattern-api-security-pattern",
    subjectId: "solution-architecture",
    kind: "pattern",
    category: "vendor-neutral",
  });

  it("extracts title from first H1", () => {
    expect(doc.title).toBe("API Security Pattern");
  });

  it("emits ordered block types", () => {
    const types = doc.blocks.map((b) => b.type);
    expect(types[0]).toBe("heading");
    expect(types).toContain("paragraph");
    expect(types).toContain("ordered-list");
    expect(types).toContain("table");
    expect(types).toContain("image");
    expect(types).toContain("code");
    expect(types).toContain("blockquote");
  });

  it("collects level-2 sections", () => {
    expect(doc.sections).toEqual([{ title: "Overview" }, { title: "Threats" }]);
  });

  it("computes reading time >= 1", () => {
    expect(doc.readingMin).toBeGreaterThanOrEqual(1);
  });

  it("extracts bold terms with defining sentence", () => {
    const t = doc.terms.find((x) => x.term === "API Security Pattern");
    expect(t?.definition).toContain("protects APIs");
  });

  it("extracts definition-style terms from prose", () => {
    const t = doc.terms.find((x) => x.term === "API gateway");
    expect(t?.definition?.toLowerCase()).toContain("between clients and backend");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && npx vitest run tests/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/src/parse.ts`**

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, ListContent, TableContent, PhrasingContent } from "mdast";
import type { Block, ParsedDoc, Term } from "./types.js";

const processor = unified().use(remarkParse).use(remarkGfm);

export function makeSlug(filename: string): string {
  return filename
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface ParseMeta {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string;
  slug?: string;
}

function phrasingText(nodes: PhrasingContent[]): { text: string; bold: string[] } {
  let text = "";
  const bold: string[] = [];
  const visit = (n: PhrasingContent): void => {
    if (n.type === "text") text += n.value;
    else if (n.type === "strong") {
      const inner = phrasingText(n.children);
      bold.push(inner.text.trim());
      text += inner.text;
    } else if ("children" in n) n.children.forEach(visit);
    else if (n.type === "inlineCode") text += n.value;
  };
  nodes.forEach(visit);
  return { text: text.replace(/\s+/g, " ").trim(), bold };
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"`])/g).filter((s) => s.length > 0);
}

export function extractTerms(
  blocksText: string[],
  boldTerms: string[],
  headings: string[],
): Term[] {
  const terms = new Map<string, Term>();
  const add = (term: string, definition: string | null): void => {
    const key = term.toLowerCase();
    if (key.length < 3 || key.length > 60) return;
    if (!terms.has(key)) terms.set(key, { term, definition });
    else if (definition && !terms.get(key)!.definition) terms.get(key)!.definition = definition;
  };

  for (const h of headings) add(h, null);
  for (const b of boldTerms) add(b, null);

  const defRe = /^(?:the\s+)?([A-Z][A-Za-z0-9 .\-]{2,58}?)\s+\b(is|are)\b\s+(?:a|an|the)?\s*(.{15,})$/;
  const colonRe = /^([A-Z][A-Za-z0-9 .\-]{2,58}?):\s+(.{15,})$/;

  for (const para of blocksText) {
    for (const sentence of splitSentences(para)) {
      const m = defRe.exec(sentence) ?? colonRe.exec(sentence);
      if (m) add(m[1].trim(), sentence.trim());
    }
  }

  // attach first sentence containing a bold/heading term as its definition
  for (const t of terms.values()) {
    if (t.definition) continue;
    const re = new RegExp(`[^.!?]*\\b${escapeRe(t.term)}\\b[^.!?]*[.!?]`, "i");
    for (const para of blocksText) {
      const m = re.exec(para);
      if (m && m[0].length < 300) {
        t.definition = m[0].trim();
        break;
      }
    }
  }
  return [...terms.values()];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseMarkdown(raw: string, meta: ParseMeta): ParsedDoc {
  const tree = processor.parse(raw) as Root;
  const blocks: Block[] = [];
  const sections: { title: string }[] = [];
  const paragraphsAsText: string[] = [];
  const boldAll: string[] = [];
  let title = "";
  let words = 0;

  const pushPhrasing = (children: PhrasingContent[], block: Block): void => {
    const { text, bold } = phrasingText(children);
    block.text = text;
    words += text.split(/\s+/).filter(Boolean).length;
    boldAll.push(...bold);
  };

  const visit = (node: RootContent | ListContent | TableContent): void => {
    switch (node.type) {
      case "heading": {
        const b: Block = { type: "heading", level: node.depth };
        pushPhrasing(node.children, b);
        if (node.depth === 1 && !title) title = b.text ?? "";
        if (node.depth === 2 && b.text) sections.push({ title: b.text });
        blocks.push(b);
        break;
      }
      case "paragraph": {
        const images = node.children.filter((c): c is Extract<PhrasingContent, { type: "image" }> => c.type === "image");
        const b: Block = { type: "paragraph" };
        pushPhrasing(node.children.filter((c) => c.type !== "image"), b);
        if (b.text) {
          blocks.push(b);
          paragraphsAsText.push(b.text);
        }
        for (const img of images)
          blocks.push({ type: "image", url: img.url, alt: img.alt ?? "" });
        break;
      }
      case "list": {
        const items = node.children.map((li) => {
          const texts = li.children
            .filter((c): c is Extract<ListContent, { type: "paragraph" }> => c.type === "paragraph")
            .map((p) => phrasingText(p.children).text);
          const nested = li.children.filter((c) => c.type === "list") as unknown as ListContent[];
          nested.forEach(visit);
          return texts.join(" ");
        });
        blocks.push({ type: node.ordered ? "ordered-list" : "list", items });
        words += items.join(" ").split(/\s+/).length;
        break;
      }
      case "code":
        blocks.push({ type: "code", lang: node.lang ?? "", value: node.value });
        break;
      case "blockquote": {
        const inner = node.children.find((c) => c.type === "paragraph");
        const b: Block = { type: "blockquote" };
        if (inner && inner.type === "paragraph") pushPhrasing(inner.children, b);
        blocks.push(b);
        break;
      }
      case "table": {
        const rows = node.children.map((row) =>
          row.children.map((cell) => phrasingText(cell.children).text),
        );
        blocks.push({ type: "table", rows });
        break;
      }
      default:
        break;
    }
  };

  tree.children.forEach((c) => visit(c as RootContent));

  const fallbackTitle = meta.id.split("-").slice(-3).join("-");
  const doc: ParsedDoc = {
    ...meta,
    title: title || fallbackTitle,
    slug: meta.slug ?? makeSlug(`${meta.id}.md`),
    readingMin: Math.max(1, Math.round(words / 200)),
    blocks,
    sections,
    terms: [],
  };
  doc.terms = extractTerms(paragraphsAsText, boldAll, sections.map((s) => s.title));
  return doc;
}
```

Note: `ParseMeta.slug` overrides the id-derived slug when provided; Task 10 passes the filename-based slug there.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && npx vitest run tests/parse.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/parse.ts pipeline/tests/parse.test.ts
git commit -m "feat(pipeline): markdown parser producing blocks, sections, terms"
```

---

### Task 5: rng — seeded randomness utilities

**Files:**
- Create: `pipeline/src/exercises/rng.ts`
- Test: `pipeline/tests/rng.test.ts`

- [ ] **Step 1: Write failing test `pipeline/tests/rng.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fnv1a32, mulberry32, shuffle, pickN } from "../src/exercises/rng.js";

describe("rng", () => {
  it("fnv1a32 is stable", () => {
    expect(fnv1a32("abc")).toBe(fnv1a32("abc"));
    expect(fnv1a32("abc")).not.toBe(fnv1a32("abd"));
  });

  it("mulberry32 same seed -> same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("shuffle keeps members and is deterministic", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr, mulberry32(7))).toEqual(shuffle(arr, mulberry32(7)));
    expect([...shuffle(arr, mulberry32(7))].sort()).toEqual(arr);
  });

  it("pickN returns n distinct items", () => {
    const picked = pickN(["a", "b", "c", "d"], 2, mulberry32(1));
    expect(new Set(picked).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && npx vitest run tests/rng.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/src/exercises/rng.ts`**

```ts
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rand: Rand): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function pickN<T>(arr: readonly T[], n: number, rand: Rand): T[] {
  return shuffle(arr, rand).slice(0, n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && npx vitest run tests/rng.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/exercises/rng.ts pipeline/tests/rng.test.ts
git commit -m "feat(pipeline): seeded rng utilities"
```

---

### Task 6: exercise generators (all five types)

**Files:**
- Create: `pipeline/src/exercises/cloze.ts`
- Create: `pipeline/src/exercises/mcq.ts`
- Create: `pipeline/src/exercises/matching.ts`
- Create: `pipeline/src/exercises/truefalse.ts`
- Create: `pipeline/src/exercises/ordering.ts`
- Test: `pipeline/tests/exercises.test.ts`

- [ ] **Step 1: Write failing test `pipeline/tests/exercises.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../src/exercises/rng.js";
import { genCloze, genMcq } from "../src/exercises/cloze.js";
import { genMatching } from "../src/exercises/matching.js";
import { genTrueFalse } from "../src/exercises/truefalse.js";
import { genOrdering } from "../src/exercises/ordering.js";
import type { Term } from "../src/types.js";

const terms: Term[] = [
  { term: "API gateway", definition: "An API gateway is a component that sits between clients and backend services." },
  { term: "Service mesh", definition: "A service mesh is a dedicated infrastructure layer for service-to-service communication." },
  { term: "Strangler pattern", definition: "The strangler pattern is a technique to incrementally migrate a legacy system." },
  { term: "Sidecar", definition: "A sidecar is a helper process deployed alongside a main container." },
];

describe("genCloze", () => {
  it("blanks the term and offers 4 options", () => {
    const ex = genCloze(terms[0]!, terms, "doc1", 0, mulberry32(1));
    expect(ex).not.toBeNull();
    expect(ex!.payload.prompt).toContain("_____");
    expect((ex!.payload.options as string[])).toHaveLength(4);
    expect([0, 1, 2, 3]).toContain(ex!.answerKey);
    expect((ex!.payload.options as string[])[ex!.answerKey as number]).toBe("API gateway");
  });
});

describe("genMcq", () => {
  it("asks what-is-X with distractor definitions", () => {
    const ex = genMcq(terms[1]!, terms, "doc1", 1, mulberry32(2));
    expect(ex!.payload.prompt).toBe("What is Service mesh?");
    expect(ex!.payload.options).toHaveLength(4);
  });
  it("needs >= 4 defined terms", () => {
    expect(genMcq(terms[1]!, terms.slice(0, 2), "doc1", 0, mulberry32(2))).toBeNull();
  });
});

describe("genMatching", () => {
  it("pairs four terms with four definitions", () => {
    const ex = genMatching(terms, "doc1", mulberry32(3));
    expect(ex).not.toBeNull();
    expect(ex!.payload.pairsLeft).toHaveLength(4);
    expect(ex!.payload.pairsRight).toHaveLength(4);
    const key = ex!.answerKey as number[];
    expect(new Set(key).size).toBe(4);
  });
});

describe("genTrueFalse", () => {
  it("creates mixed true/false statements", () => {
    const exs = genTrueFalse(terms, "doc1", mulberry32(4));
    expect(exs.length).toBeGreaterThan(0);
    expect(exs.some((e) => e.answerKey === true)).toBe(true);
    expect(exs.some((e) => e.answerKey === false)).toBe(true);
    for (const e of exs) expect(typeof e.payload.statement).toBe("string");
  });
});

describe("genOrdering", () => {
  it("shuffles numbered steps keeping an answer key", () => {
    const ex = genOrdering(["Step one", "Step two", "Step three"], "doc1", mulberry32(5));
    expect(ex).not.toBeNull();
    const items = ex!.payload.items as string[];
    expect(items).toHaveLength(3);
    const key = ex!.answerKey as number[];
    expect(key.map((i) => items[i])).toEqual(["Step one", "Step two", "Step three"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && npx vitest run tests/exercises.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement cloze + mcq in `pipeline/src/exercises/cloze.ts`**

```ts
import { pickN, shuffle, type Rand } from "./rng.js";
import type { Exercise, Term } from "../types.js";

function base(id: string, type: Exercise["type"], n: number): Omit<Exercise, "answerKey"> {
  return { id: `${id}-${type}-${n}`, type, payload: {} };
}

function distractorTerms(correct: Term, pool: Term[], rand: Rand, n: number): Term[] {
  const others = pool.filter(
    (t) => t.term !== correct.term && t.definition !== null && t.term.length > 2,
  );
  const unique = [...new Map(others.map((t) => [t.term.toLowerCase(), t])).values()];
  return pickN(unique, n, rand);
}

export function genCloze(
  term: Term,
  pool: Term[],
  docId: string,
  n: number,
  rand: Rand,
): Exercise | null {
  if (!term.definition) return null;
  const re = new RegExp(term.definition ? term.definition.replace(term.term, term.term) : "", "i");
  void re;
  const idx = term.definition.toLowerCase().indexOf(term.term.toLowerCase());
  if (idx < 0) return null;
  const blanked =
    term.definition.slice(0, idx) +
    "_____" +
    term.definition.slice(idx + term.term.length);
  const distract = distractorTerms(term, pool, rand, 3);
  if (distract.length < 3) return null;
  const options = shuffle([term.term, ...distract.map((d) => d.term)], rand);
  return {
    ...base(docId, "cloze", n),
    payload: { prompt: blanked, options },
    answerKey: options.indexOf(term.term),
  };
}

export function genMcq(
  term: Term,
  pool: Term[],
  docId: string,
  n: number,
  rand: Rand,
): Exercise | null {
  if (!term.definition) return null;
  const defined = pool.filter((t) => t.definition !== null && t.term !== term.term);
  const unique = [...new Map(defined.map((t) => [t.term.toLowerCase(), t])).values()];
  if (unique.length < 3) return null;
  const distract = pickN(unique, 3, rand);
  const options = shuffle([term.definition, ...distract.map((d) => d.definition!)], rand);
  return {
    ...base(docId, "mcq", n),
    payload: { prompt: `What is ${term.term}?`, options },
    answerKey: options.indexOf(term.definition!),
  };
}
```

- [ ] **Step 4: Implement `pipeline/src/exercises/matching.ts`**

```ts
import { pickN, shuffle, type Rand } from "./rng.js";
import type { Exercise, Term } from "../types.js";

export function genMatching(pool: Term[], docId: string, rand: Rand): Exercise | null {
  const defined = pool.filter((t) => t.definition !== null && t.definition.length < 220);
  const unique = [...new Map(defined.map((t) => [t.term.toLowerCase(), t])).values()];
  if (unique.length < 4) return null;
  const chosen = pickN(unique, 4, rand);
  const left = shuffle(chosen, rand);
  const right = shuffle(chosen, rand);
  return {
    id: `${docId}-matching-0`,
    type: "matching",
    payload: {
      pairsLeft: left.map((t) => t.term),
      pairsRight: right.map((t) => t.definition!),
    },
    answerKey: left.map((l) => right.findIndex((r) => r.term === l.term)),
  };
}
```

- [ ] **Step 5: Implement `pipeline/src/exercises/truefalse.ts`**

```ts
import { pickN, type Rand } from "./rng.js";
import type { Exercise, Term } from "../types.js";

export function genTrueFalse(pool: Term[], docId: string, rand: Rand): Exercise[] {
  const defined = pool.filter((t) => t.definition !== null);
  const out: Exercise[] = [];
  if (defined.length === 0) return out;

  // true statements: real definitions
  for (const t of pickN(defined, Math.min(2, defined.length), rand)) {
    out.push({
      id: `${docId}-truefalse-${out.length}`,
      type: "truefalse",
      payload: { statement: t.definition! },
      answerKey: true,
    });
  }

  // false statements: pair a term with another term's definition
  const swappable = defined.filter((t) => t.definition!.toLowerCase().includes(t.term.toLowerCase()));
  for (const t of pickN(swappable, Math.min(2, swappable.length), rand)) {
    const others = defined.filter((o) => o.term !== t.term && o.definition !== null);
    if (others.length === 0) continue;
    const victim = pickN(others, 1, rand)[0]!;
    const swapped = t.definition!.replace(
      new RegExp(t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      victim.term,
    );
    if (swapped === t.definition) continue;
    out.push({
      id: `${docId}-truefalse-${out.length}`,
      type: "truefalse",
      payload: { statement: swapped },
      answerKey: false,
    });
  }
  return out;
}
```

- [ ] **Step 6: Implement `pipeline/src/exercises/ordering.ts`**

```ts
import { shuffle, type Rand } from "./rng.js";
import type { Exercise } from "../types.js";

export function genOrdering(steps: string[], docId: string, rand: Rand): Exercise | null {
  if (steps.length < 3 || steps.length > 8) return null;
  const indexed = steps.map((text, originalIdx) => ({ text, originalIdx }));
  const shuffled = shuffle(indexed, rand);
  const items = shuffled.map((s) => s.text);
  let key = shuffled.map((s) => s.originalIdx);
  // answerKey[i] = index into items of the step that goes i-th
  key = steps.map((_, targetOriginal) => shuffled.findIndex((s) => s.originalIdx === targetOriginal));
  return {
    id: `${docId}-ordering-0`,
    type: "ordering",
    payload: { items },
    answerKey: key,
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd pipeline && npx vitest run tests/exercises.test.ts`
Expected: `7 passed`.

- [ ] **Step 8: Commit**

```bash
git add pipeline/src/exercises pipeline/tests/exercises.test.ts
git commit -m "feat(pipeline): five exercise generators"
```

---

### Task 7: generate — orchestrator with quality gates and caps

**Files:**
- Create: `pipeline/src/exercises/generate.ts`
- Modify: `pipeline/src/parse.ts` (export ordered-list steps helper)
- Test: `pipeline/tests/generate.test.ts`

- [ ] **Step 1: Add helper export at end of `pipeline/src/parse.ts`**

```ts
export function orderedSteps(blocks: Block[]): string[][] {
  return blocks
    .filter((b): b is Block & { type: "ordered-list"; items: string[] } => b.type === "ordered-list")
    .map((b) => b.items)
    .filter((items) => items.length >= 3);
}
```

- [ ] **Step 2: Write failing test `pipeline/tests/generate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { generateExercises } from "../src/exercises/generate.js";
import type { ParsedDoc } from "../src/types.js";

function fakeDoc(definedTerms: number): ParsedDoc {
  return {
    id: "sa-pattern-fake",
    subjectId: "solution-architecture",
    kind: "pattern",
    category: "vendor-neutral",
    title: "Fake",
    slug: "fake",
    readingMin: 2,
    blocks: [
      { type: "heading", level: 1, text: "Fake" },
      { type: "ordered-list", items: ["one", "two", "three"] },
    ],
    sections: [],
    terms: Array.from({ length: definedTerms }, (_, i) => ({
      term: `Term ${i}`,
      definition: `Term ${i} is a fictional concept used for testing purposes here.`,
    })),
  };
}

describe("generateExercises", () => {
  it("produces capped, deduplicated, typed exercises", () => {
    const exs = generateExercises(fakeDoc(10));
    expect(exs.length).toBeGreaterThanOrEqual(5);
    expect(exs.length).toBeLessThanOrEqual(12);
    const types = new Set(exs.map((e) => e.type));
    expect(types.has("ordering")).toBe(true);
    const ids = new Set(exs.map((e) => e.id));
    expect(ids.size).toBe(exs.length);
  });

  it("is deterministic for same input", () => {
    expect(generateExercises(fakeDoc(10))).toEqual(generateExercises(fakeDoc(10)));
  });

  it("degrades gracefully with few terms", () => {
    const exs = generateExercises(fakeDoc(2));
    expect(Array.isArray(exs)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && npx vitest run tests/generate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `pipeline/src/exercises/generate.ts`**

```ts
import { fnv1a32, mulberry32 } from "./rng.js";
import { genCloze, genMcq } from "./cloze.js";
import { genMatching } from "./matching.js";
import { genTrueFalse } from "./truefalse.js";
import { genOrdering } from "./ordering.js";
import { orderedSteps } from "../parse.js";
import type { Exercise, ParsedDoc } from "../types.js";

const CAPS: Record<Exercise["type"], number> = {
  cloze: 4,
  mcq: 3,
  truefalse: 3,
  matching: 1,
  ordering: 1,
};
const TOTAL_CAP = 12;
const MIN_DEF_LEN = 25;

export function generateExercises(doc: ParsedDoc): Exercise[] {
  const seed = fnv1a32(`${doc.id}|${doc.title}|${doc.terms.length}`);
  const rand = mulberry32(seed);
  const defined = doc.terms.filter(
    (t) => t.definition !== null && t.definition.length >= MIN_DEF_LEN,
  );
  const out: Exercise[] = [];

  const push = (type: Exercise["type"], make: () => Exercise | Exercise[] | null): void => {
    if (out.length >= TOTAL_CAP) return;
    const made = make();
    const list = made === null ? [] : Array.isArray(made) ? made : [made];
    for (const ex of list) {
      if (out.length >= TOTAL_CAP) break;
      if (out.filter((e) => e.type === type).length >= CAPS[type]) break;
      const stem = JSON.stringify(ex.payload).slice(0, 160);
      if (out.some((e) => JSON.stringify(e.payload).slice(0, 160) === stem)) continue;
      out.push(ex);
    }
  };

  const shuffledDefined = [...defined].sort(() => rand() - 0.5);

  for (const term of shuffledDefined) {
    push("cloze", () => genCloze(term, doc.terms, doc.id, out.filter((e) => e.type === "cloze").length, rand));
  }
  for (const term of shuffledDefined) {
    push("mcq", () => genMcq(term, doc.terms, doc.id, out.filter((e) => e.type === "mcq").length, rand));
  }
  push("matching", () => genMatching(doc.terms, doc.id, rand));
  push("truefalse", () => genTrueFalse(doc.terms, doc.id, rand));
  const stepsList = orderedSteps(doc.blocks);
  if (stepsList.length > 0) push("ordering", () => genOrdering(stepsList[0]!, doc.id, rand));

  return out.sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 5: Run all tests**

Run: `cd pipeline && npm test`
Expected: all previous suites still PASS plus generate suite `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/exercises/generate.ts pipeline/src/parse.ts pipeline/tests/generate.test.ts
git commit -m "feat(pipeline): exercise orchestrator with gates and caps"
```

---

### Task 8: curriculum — module assignment

**Files:**
- Create: `pipeline/src/curriculum.ts`
- Test: `pipeline/tests/curriculum.test.ts`

- [ ] **Step 1: Write failing test `pipeline/tests/curriculum.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { assignModules } from "../src/curriculum.js";
import type { ParsedDoc, SubjectConfig } from "../src/types.js";

const subject: SubjectConfig = {
  id: "solution-architecture",
  name: "Solution Architecture",
  sources: [],
  curriculum: {
    modules: [
      { id: "foundations", title: "Foundations", rules: ["layered"] },
      { id: "apis", title: "Integration & APIs", rules: ["api"] },
    ],
    extraModuleTitle: "Extra patterns",
  },
};

function doc(slug: string): ParsedDoc {
  return {
    id: `solution-architecture-pattern-${slug}`,
    subjectId: "solution-architecture",
    kind: "pattern",
    category: "vendor-neutral",
    title: slug,
    slug,
    readingMin: 1,
    blocks: [],
    sections: [],
    terms: [],
  };
}

describe("assignModules", () => {
  it("matches slugs against rules in module order", () => {
    const { modules, moduleDocs } = assignModules(
      [doc("graphql-pattern"), doc("layered-architecture-pattern"), doc("mystery-pattern")],
      subject,
    );
    expect(modules.map((m) => m.id)).toEqual(["foundations", "apis", "extra"]);
    const byModule = Object.fromEntries(moduleDocs.map((md) => [md.docId, md.moduleId]));
    expect(byModule["solution-architecture-pattern-layered-architecture-pattern"]).toBe("foundations");
    expect(byModule["solution-architecture-pattern-graphql-pattern"]).toBe("apis");
    expect(byModule["solution-architecture-pattern-mystery-pattern"]).toBe("extra");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && npx vitest run tests/curriculum.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/src/curriculum.ts`**

```ts
import type { ModuleDocRef, ModuleRef, ParsedDoc, SubjectConfig } from "./types.js";

export function assignModules(
  docs: ParsedDoc[],
  subject: SubjectConfig,
): { modules: ModuleRef[]; moduleDocs: ModuleDocRef[] } {
  const modules: ModuleRef[] = subject.curriculum.modules.map((m, i) => ({
    id: m.id,
    subjectId: subject.id,
    title: m.title,
    position: i,
  }));
  const extraId = `${subject.id}-extra`;
  modules.push({
    id: extraId,
    subjectId: subject.id,
    title: subject.curriculum.extraModuleTitle,
    position: modules.length,
  });

  const moduleDocs: ModuleDocRef[] = [];
  const buckets = new Map<string, ParsedDoc[]>(modules.map((m) => [m.id, []]));

  for (const doc of docs) {
    if (doc.kind !== "pattern") continue;
    const hay = `${doc.slug} ${doc.title}`.toLowerCase();
    const mod =
      subject.curriculum.modules.find((m) => m.rules.some((r) => hay.includes(r)))?.id ?? extraId;
    buckets.get(mod)!.push(doc);
  }

  for (const m of modules) {
    buckets
      .get(m.id)!
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .forEach((doc, i) => moduleDocs.push({ moduleId: m.id, docId: doc.id, position: i }));
  }
  // drop modules with no docs (except keep declared ones even if empty? drop empties)
  const usedIds = new Set(moduleDocs.map((md) => md.moduleId));
  return { modules: modules.filter((m) => usedIds.has(m.id)), moduleDocs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && npx vitest run tests/curriculum.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/curriculum.ts pipeline/tests/curriculum.test.ts
git commit -m "feat(pipeline): curriculum module assignment"
```

---

### Task 9: pack — deterministic manifest + emission

**Files:**
- Create: `pipeline/src/pack.ts`
- Test: `pipeline/tests/pack.test.ts`

- [ ] **Step 1: Write failing test `pipeline/tests/pack.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildPack, docToId } from "../src/pack.js";
import type { ParsedDoc, SubjectConfig } from "../src/types.js";

const subject: SubjectConfig = {
  id: "solution-architecture",
  name: "Solution Architecture",
  sources: [],
  curriculum: { modules: [], extraModuleTitle: "Extra patterns" },
};

function doc(kind: "pattern" | "lecture", slug: string): ParsedDoc {
  return {
    id: docToId("solution-architecture", kind, slug),
    subjectId: "solution-architecture",
    kind,
    category: kind === "lecture" ? "lectures" : "vendor-neutral",
    title: slug,
    slug,
    readingMin: 1,
    blocks: [{ type: "heading", level: 1, text: slug }],
    sections: [],
    terms: [{ term: slug, definition: `${slug} is a test construct.` }],
  };
}

describe("buildPack", () => {
  const docs = [doc("pattern", "zeta-pattern"), doc("pattern", "alpha-pattern"), doc("lecture", "lecture-01")];
  const pack = buildPack(docs, [], [], subject, { patterns: "shaP", lectures: "shaL" });

  it("sorts docs by id and computes file paths", () => {
    expect(pack.manifest.docs.map((d) => d.id)).toEqual([
      "solution-architecture-pattern-alpha-pattern",
      "solution-architecture-pattern-zeta-pattern",
      "solution-architecture-lecture-lecture-01",
    ]);
    expect(pack.files["docs/solution-architecture-pattern-alpha-pattern.json"]).toBeTruthy();
    expect(pack.files["exercises/solution-architecture-pattern-alpha-pattern.json"]).toBeTruthy();
  });

  it("records repo shas in version", () => {
    expect(pack.manifest.version).toEqual({ patterns: "shaP", lectures: "shaL" });
  });

  it("is byte-deterministic", () => {
    const again = buildPack([...docs].reverse(), [], [], subject, { patterns: "shaP", lectures: "shaL" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(pack));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && npx vitest run tests/pack.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline/src/pack.ts`**

```ts
import { createHash } from "node:crypto";
import { generateExercises } from "./exercises/generate.js";
import type { Exercise, Manifest, ManifestDocEntry, ModuleDocRef, ModuleRef, ParsedDoc, SubjectConfig } from "./types.js";

export function docToId(subjectId: string, kind: "pattern" | "lecture", slug: string): string {
  return `${subjectId}-${kind}-${slug}`;
}

export interface BuiltPack {
  manifest: Manifest;
  files: Record<string, string>; // relative path -> json content
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function buildPack(
  docs: ParsedDoc[],
  modules: ModuleRef[],
  moduleDocs: ModuleDocRef[],
  subject: SubjectConfig,
  version: Record<string, string>,
): BuiltPack {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const files: Record<string, string> = {};
  const entries: ManifestDocEntry[] = [];

  for (const doc of sorted) {
    const exercises: Exercise[] = generateExercises(doc);
    const docPath = `docs/${doc.id}.json`;
    const exPath = `exercises/${doc.id}.json`;
    const docJson = JSON.stringify(doc, null, 2) + "\n";
    const exJson = JSON.stringify({ docId: doc.id, items: exercises }, null, 2) + "\n";
    files[docPath] = docJson;
    files[exPath] = exJson;
    entries.push({
      id: doc.id,
      subjectId: doc.subjectId,
      kind: doc.kind,
      category: doc.category,
      title: doc.title,
      file: docPath,
      exercisesFile: exPath,
      sha256: sha256(docJson),
    });
  }

  const manifest: Manifest = {
    version,
    subjects: [{ id: subject.id, name: subject.name }],
    docs: entries,
    modules: [...modules].sort((a, b) => a.position - b.position),
    moduleDocs: [...moduleDocs].sort(
      (a, b) => a.moduleId.localeCompare(b.moduleId) || a.position - b.position,
    ),
  };
  files["manifest.json"] = JSON.stringify(manifest, null, 2) + "\n";
  return { manifest, files };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && npx vitest run tests/pack.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/pack.ts pipeline/tests/pack.test.ts
git commit -m "feat(pipeline): deterministic pack builder"
```

---

### Task 10: main — clone sources and run the whole flow

**Files:**
- Create: `pipeline/src/main.ts`

- [ ] **Step 1: Implement `pipeline/src/main.ts`**

```ts
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverSource } from "./discover.js";
import { parseMarkdown, makeSlug } from "./parse.js";
import { assignModules } from "./curriculum.js";
import { buildPack, docToId } from "./pack.js";
import type { ParsedDoc, RepoInput, SubjectsConfig } from "./types.js";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, "..", "content-pack");
const SOURCES_DIR = join(ROOT, ".sources");

function sh(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf8" }).trim();
}

function prepareRepos(config: SubjectsConfig): RepoInput[] {
  rmSync(SOURCES_DIR, { recursive: true, force: true });
  mkdirSync(SOURCES_DIR, { recursive: true });
  const inputs = new Map<string, RepoInput>();
  let i = 0;
  for (const subject of config.subjects) {
    for (const src of subject.sources) {
      if (inputs.has(src.repo)) continue;
      const localDir = join(SOURCES_DIR, `repo-${i++}`);
      sh(`git clone --depth 1 https://github.com/${src.repo}.git "${localDir}"`);
      inputs.set(src.repo, {
        label: src.kind,
        url: src.repo,
        localDir,
        sha: sh("git rev-parse HEAD", localDir),
        sources: [],
      });
    }
    for (const src of subject.sources) inputs.get(src.repo)!.sources.push(src);
  }
  return [...inputs.values()];
}

function main(): void {
  const config: SubjectsConfig = JSON.parse(readFileSync(join(ROOT, "subjects.config.json"), "utf8"));
  const repos = prepareRepos(config);
  const version: Record<string, string> = {};
  const docs: ParsedDoc[] = [];

  for (const repo of repos) {
    version[repo.label] = repo.sha;
    for (const subject of config.subjects) {
      const mine = subject.sources.filter((s) => s.repo === repo.url);
      for (const src of mine) {
        for (const file of discoverSource(repo.localDir, src)) {
          try {
            const raw = readFileSync(file.absPath, "utf8");
            const slug = makeSlug(file.absPath.split("/").pop()!);
            const kind = src.kind === "lectures" ? "lecture" : "pattern";
            docs.push(
              parseMarkdown(raw, {
                id: docToId(subject.id, kind, slug),
                subjectId: subject.id,
                kind,
                category: file.category,
                slug,
              }),
            );
          } catch (err) {
            console.error(`SKIP ${file.relPath}: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  let modules: ReturnType<typeof assignModules>["modules"] = [];
  let moduleDocs: ReturnType<typeof assignModules>["moduleDocs"] = [];
  for (const subject of config.subjects) {
    const r = assignModules(docs.filter((d) => d.subjectId === subject.id), subject);
    modules = [...modules, ...r.modules];
    moduleDocs = [...moduleDocs, ...r.moduleDocs];
  }

  const pack = buildPack(docs, modules, moduleDocs, config.subjects[0]!, version);
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [rel, content] of Object.entries(pack.files)) {
    const dest = join(OUT_DIR, rel);
    mkdirSync(resolve(dest, ".."), { recursive: true });
    writeFileSync(dest, content);
  }
  console.log(
    `PACK OK: ${pack.manifest.docs.length} docs -> ${OUT_DIR} (patterns=${version["patterns"]?.slice(0, 7)} lectures=${version["lectures"]?.slice(0, 7) ?? "-"})`,
  );
}

main();
```

- [ ] **Step 2: Manual smoke run (network required)**

Run: `cd pipeline && npm run pipeline`
Expected: prints `PACK OK: N docs ...` and creates `../content-pack/manifest.json` plus `docs/` and `exercises/` folders. With the lectures folder currently missing upstream it still succeeds (patterns only).

- [ ] **Step 3: Verify pack contents**

Run: `ls content-pack && node -e "const m=require('./content-pack/manifest.json');console.log(m.docs.length,'docs;',m.modules.length,'modules')"`
Expected: `manifest.json  docs  exercises` and a positive doc count (~30+).

- [ ] **Step 4: Commit**

```bash
git add pipeline/src/main.ts
git commit -m "feat(pipeline): cli entry cloning sources and emitting pack"
```

---

### Task 11: GitHub Action workflow

**Files:**
- Create: `.github/workflows/content-pipeline.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: content-pipeline

on:
  schedule:
    - cron: "17 */6 * * *"
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - "pipeline/**"
      - "subjects.config.json"

concurrency:
  group: content-pipeline
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install & test
        working-directory: pipeline
        run: |
          npm ci
          npm test
      - name: Build pack
        working-directory: pipeline
        run: npm run pipeline
      - name: Commit pack
        run: |
          git config user.name "sa-academy-bot"
          git config user.email "bot@users.noreply.github.com"
          git add content-pack
          if git diff --cached --quiet; then
            echo "No pack changes"
          else
            git commit -m "chore(content-pack): rebuild [skip ci]"
            git push
          fi
```

- [ ] **Step 2: Validate YAML locally**

Run: `node -e "console.log('manual review')"`
Expected: review triggers/concurrency manually (no actionlint dependency).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/content-pipeline.yml
git commit -m "ci: scheduled content pipeline building content-pack"
```

---

### Task 12: Determinism golden snapshot

**Files:**
- Test: `pipeline/tests/determinism.test.ts`

- [ ] **Step 1: Write failing test `pipeline/tests/determinism.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown } from "../src/parse.js";
import { generateExercises } from "../src/exercises/generate.js";

const md = readFileSync(join(import.meta.dirname, "fixtures/pattern-sample.md"), "utf8");

function run(): string {
  const doc = parseMarkdown(md, {
    id: "solution-architecture-pattern-api-security-pattern",
    subjectId: "solution-architecture",
    kind: "pattern",
    category: "vendor-neutral",
  });
  return JSON.stringify(generateExercises(doc));
}

describe("golden determinism", () => {
  it("identical output across repeated runs in-process", () => {
    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(50); // actually generated something
  });
});
```

- [ ] **Step 2: Run full suite**

Run: `cd pipeline && npm test`
Expected: all suites PASS.

- [ ] **Step 3: Commit**

```bash
git add pipeline/tests/determinism.test.ts
git commit -m "test(pipeline): golden determinism snapshot"
```

---

## Self-review notes

- Spec coverage: discover/parse/terms (§4.2–3), exercises 5 types + gates (§7), deterministic pack (§4.5, §3), missing lectures folder tolerated (§4.2, Task 3 test), Action triggers + summary policy (§4.6–7, Task 11), failure-per-file isolation (Task 10 try/catch). App-side concerns belong to Plan 2.
- Type consistency: `ParsedDoc`, `Exercise`, `RepoSource` used consistently across Tasks 2–10; `docToId` defined in Task 9 before use in Task 10; `ParseMeta.slug` (Task 4) consumed by `main.ts` (Task 10).
