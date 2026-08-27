# Notes & Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select text in any reader, save it as a highlighted note (the quote only), see highlights inline, and browse/delete notes from a global Notes tab + a per-doc header button, with tap-to-jump back to the source section.

**Architecture:** A new `notes` SQLite table (doc_id, block_index, quote + offsets + section title) backs the feature. Pure helpers (section derivation, highlight segmentation, grouping) live in `src/lib/highlights.ts` so they are unit-testable in Node. The reader (`app/doc/[id].tsx`) captures selection: native uses per-`Text` `onSelectionChange`; web uses a `selectionchange` listener mapped via `data-blockindex`. `BlockView` renders highlights and forwards selection. A new `app/(tabs)/notes.tsx` lists notes with swipe-to-delete (native) / button (web).

**Tech Stack:** Expo SDK 57, React Native, `expo-sqlite` (async API), `expo-router`, `react-native-gesture-handler` (v3.2.1, already in node_modules) for `Swipeable`, vitest (node env) for unit tests of pure logic.

---

## File Structure

- Create `client/src/lib/highlights.ts` — pure, DB-free logic: `deriveSectionTitle`, `segmentsForHighlights`, `groupNotesByBlock`, and their types. Unit-tested.
- Create `client/src/lib/notes.ts` — `addNote` (dedupe), `listNotes`, `deleteNote`, `getNotesByBlock`. Depends on `db.ts`.
- Modify `client/src/lib/types.ts` — add `Note` interface.
- Modify `client/src/lib/db.ts` — add `notes` table + indexes to `CORE_DDL`.
- Modify `client/src/components/Blocks.tsx` — accept `blockIndex`, `notes`, `onSelect`; render highlights + make text selectable on native, add `data-blockindex` on web.
- Modify `client/app/doc/[id].tsx` — selection state, save pill, header notes button, anchor scroll, web selection listener.
- Create `client/app/(tabs)/notes.tsx` — global/per-doc notes list with swipe/button delete + tap-to-jump.
- Modify `client/app/(tabs)/_layout.tsx` — add Notes tab.
- Modify `client/app/_layout.tsx` — wrap in `GestureHandlerRootView`.
- Create `client/unit/highlights.test.ts` — unit tests for pure helpers.
- Modify `client/package.json` — pin `react-native-gesture-handler` (via `npx expo install`).

---

### Task 1: Data model — `Note` type + `notes` table

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/db.ts`

- [ ] **Step 1: Add the `Note` interface to `types.ts`**

Append after the `PackDoc`/`Block` definitions (end of file is fine, but near `DocStatus`):

```ts
export interface Note {
  id: string;
  docId: string;
  blockIndex: number;
  sectionTitle: string;
  quote: string;
  start: number;
  end: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add the `notes` table to `CORE_DDL` in `db.ts`**

Inside the `CORE_DDL` template string, add after the `progress` table / before its closing backtick:

```sql
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, block_index INTEGER NOT NULL,
  section_title TEXT NOT NULL, quote TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notes_doc ON notes(doc_id);
CREATE INDEX IF NOT EXISTS notes_doc_block ON notes(doc_id, block_index);
```

- [ ] **Step 3: Typecheck and commit**

Run: `cd client && npx tsc --noEmit`
Expected: no new errors.

```bash
git add client/src/lib/types.ts client/src/lib/db.ts
git commit -m "feat(client): add Note type and notes table schema"
```

---

### Task 2: Pure highlight helpers (TDD)

**Files:**
- Create: `client/src/lib/highlights.ts`
- Create: `client/unit/highlights.test.ts`

- [ ] **Step 1: Write the failing test**

`client/unit/highlights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Block } from "../src/lib/types";
import { deriveSectionTitle, segmentsForHighlights, groupNotesByBlock } from "../src/lib/highlights";
import type { Note } from "../src/lib/types";

const blocks: Block[] = [
  { type: "heading", level: 1, text: "Intro" },
  { type: "paragraph", text: "First paragraph of the doc." },
  { type: "heading", level: 2, text: "Details" },
  { type: "paragraph", text: "Second paragraph with target word inside it." },
];

describe("deriveSectionTitle", () => {
  it("returns the most recent heading before the block", () => {
    expect(deriveSectionTitle(blocks, 1)).toBe("Intro");
    expect(deriveSectionTitle(blocks, 3)).toBe("Details");
  });
  it("returns empty string before any heading", () => {
    expect(deriveSectionTitle(blocks, 0)).toBe("");
  });
});

describe("segmentsForHighlights", () => {
  it("splits a single mid-text highlight into 3 segments", () => {
    const text = "abcdefghij";
    const segs = segmentsForHighlights(text, [{ start: 2, end: 5, quote: "cde" }]);
    expect(segs).toEqual([
      { text: "ab", highlighted: false },
      { text: "cde", highlighted: true },
      { text: "fghij", highlighted: false },
    ]);
  });
  it("clips overlapping ranges", () => {
    const text = "abcdefghij";
    const segs = segmentsForHighlights(text, [
      { start: 2, end: 6, quote: "cdef" },
      { start: 4, end: 8, quote: "efgh" },
    ]);
    expect(segs).toEqual([
      { text: "ab", highlighted: false },
      { text: "cdefgh", highlighted: true },
      { text: "ij", highlighted: false },
    ]);
  });
  it("falls back to indexOf when offsets are invalid", () => {
    const text = "the quick brown fox";
    const segs = segmentsForHighlights(text, [{ start: -1, end: -1, quote: "brown" }]);
    expect(segs).toEqual([
      { text: "the quick ", highlighted: false },
      { text: "brown", highlighted: true },
      { text: " fox", highlighted: false },
    ]);
  });
  it("returns one unhighlighted segment when quote is absent", () => {
    const segs = segmentsForHighlights("hello", [{ start: 0, end: 5, quote: "nomatch" }]);
    expect(segs).toEqual([{ text: "hello", highlighted: false }]);
  });
});

describe("groupNotesByBlock", () => {
  it("groups notes by block index", () => {
    const notes: Note[] = [
      { id: "1", docId: "d", blockIndex: 3, sectionTitle: "", quote: "a", start: 0, end: 1, createdAt: 1, updatedAt: 1 },
      { id: "2", docId: "d", blockIndex: 3, sectionTitle: "", quote: "b", start: 0, end: 1, createdAt: 2, updatedAt: 2 },
      { id: "3", docId: "d", blockIndex: 1, sectionTitle: "", quote: "c", start: 0, end: 1, createdAt: 3, updatedAt: 3 },
    ];
    const map = groupNotesByBlock(notes);
    expect(map.get(3)?.map((n) => n.id)).toEqual(["1", "2"]);
    expect(map.get(1)?.map((n) => n.id)).toEqual(["3"]);
    expect(map.has(2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run unit/highlights.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/highlights'`).

- [ ] **Step 3: Write the implementation**

`client/src/lib/highlights.ts`:

```ts
import type { Block, Note } from "./types";

export interface HighlightRange {
  start: number;
  end: number;
  quote: string;
}

export interface TextSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Walk `blocks[0..blockIndex]` and return the text of the last heading seen,
 * or "" if none. Used to label where a note lives ("section").
 */
export function deriveSectionTitle(blocks: Block[], blockIndex: number): string {
  let current = "";
  for (let i = 0; i <= blockIndex && i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "heading") current = b.text ?? "";
  }
  return current;
}

/**
 * Split `text` into segments, marking the ranges covered by any note as
 * highlighted. Uses stored offsets when they match `quote`; otherwise falls
 * back to `indexOf(quote)`; clips overlaps. Pure + deterministic.
 */
export function segmentsForHighlights(text: string, notes: HighlightRange[]): TextSegment[] {
  const ranges = notes
    .map((n) => {
      if (n.start >= 0 && n.end > n.start && n.end <= text.length && text.slice(n.start, n.end) === n.quote) {
        return { start: n.start, end: n.end };
      }
      const idx = text.indexOf(n.quote);
      if (idx >= 0) return { start: idx, end: idx + n.quote.length };
      return null;
    })
    .filter((r): r is { start: number; end: number } => r !== null)
    .sort((a, b) => a.start - b.start);

  const clipped: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const start = Math.max(r.start, clipped.length ? clipped[clipped.length - 1].end : 0);
    if (start < r.end) clipped.push({ start, end: r.end });
  }

  const segments: TextSegment[] = [];
  let pos = 0;
  for (const r of clipped) {
    if (r.start > pos) segments.push({ text: text.slice(pos, r.start), highlighted: false });
    segments.push({ text: text.slice(r.start, r.end), highlighted: true });
    pos = r.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlighted: false });
  return segments;
}

/** Group notes by their block index for O(1) lookup at render time. */
export function groupNotesByBlock(notes: Note[]): Map<number, Note[]> {
  const map = new Map<number, Note[]>();
  for (const n of notes) {
    const arr = map.get(n.blockIndex);
    if (arr) arr.push(n);
    else map.set(n.blockIndex, [n]);
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run unit/highlights.test.ts`
Expected: PASS (all 7 assertions).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/highlights.ts client/unit/highlights.test.ts
git commit -m "feat(client): add pure highlight/section helpers with tests"
```

---

### Task 3: Notes data layer (`notes.ts`)

**Files:**
- Create: `client/src/lib/notes.ts`

- [ ] **Step 1: Write `notes.ts`**

`client/src/lib/notes.ts`:

```ts
import { getDb } from "./db";
import { groupNotesByBlock } from "./highlights";
import type { Note } from "./types";

interface NoteRow {
  id: string;
  doc_id: string;
  block_index: number;
  section_title: string;
  quote: string;
  start: number;
  end: number;
  created_at: number;
  updated_at: number;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    docId: r.doc_id,
    blockIndex: r.block_index,
    sectionTitle: r.section_title,
    quote: r.quote,
    start: r.start,
    end: r.end,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Insert a note, or return the existing one if (doc, block, quote) already exists. */
export async function addNote(input: {
  docId: string;
  blockIndex: number;
  sectionTitle: string;
  quote: string;
  start: number;
  end: number;
}): Promise<Note> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM notes WHERE doc_id=? AND block_index=? AND quote=?",
    [input.docId, input.blockIndex, input.quote],
  );
  if (existing) {
    const row = await db.getFirstAsync<NoteRow>("SELECT * FROM notes WHERE id=?", [existing.id]);
    return rowToNote(row!);
  }
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO notes(id, doc_id, block_index, section_title, quote, start, end, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [id, input.docId, input.blockIndex, input.sectionTitle, input.quote, input.start, input.end, now, now],
  );
  return {
    id,
    docId: input.docId,
    blockIndex: input.blockIndex,
    sectionTitle: input.sectionTitle,
    quote: input.quote,
    start: input.start,
    end: input.end,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listNotes(docId?: string): Promise<(Note & { docTitle: string })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NoteRow & { doc_title: string }>(
    `SELECT n.*, d.title AS doc_title FROM notes n
     JOIN documents d ON d.id = n.doc_id
     ${docId ? "WHERE n.doc_id=?" : ""}
     ORDER BY n.created_at DESC`,
    docId ? [docId] : [],
  );
  return rows.map((r) => ({ ...rowToNote(r), docTitle: r.doc_title }));
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM notes WHERE id=?", [id]);
}

export async function getNotesByBlock(docId: string): Promise<Map<number, Note[]>> {
  const db = await getDb();
  const rows = await db.getAllAsync<NoteRow>(
    "SELECT * FROM notes WHERE doc_id=? ORDER BY block_index",
    [docId],
  );
  return groupNotesByBlock(rows.map(rowToNote));
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `cd client && npx tsc --noEmit`
Expected: no new errors.

```bash
git add client/src/lib/notes.ts
git commit -m "feat(client): add notes data layer (add/list/delete/by-block)"
```

---

### Task 4: `BlockView` — render highlights + capture selection

**Files:**
- Modify: `client/src/components/Blocks.tsx`

- [ ] **Step 1: Replace `Blocks.tsx` with highlight-aware version**

`client/src/components/Blocks.tsx` (full new content):

```tsx
import React, { type ReactNode } from "react";
import { View, Text, Image, StyleSheet, Platform } from "react-native";
import type { NativeSyntheticEvent } from "react-native";
import type { Block, Note } from "../lib/types";
import { resolveImageUrl } from "../lib/images";
import { segmentsForHighlights, type HighlightRange } from "../lib/highlights";

interface BlockViewProps {
  block: Block;
  doc: { kind: "pattern" | "lecture"; category: string };
  blockIndex?: number;
  notes?: Note[];
  onSelect?: (blockIndex: number, quote: string, start: number, end: number) => void;
}

export function BlockView({ block, doc, blockIndex, notes, onSelect }: BlockViewProps) {
  const isWeb = Platform.OS === "web";
  const selectable = !isWeb && !!onSelect && blockIndex !== undefined;

  // web: tag the DOM node so the reader's selectionchange listener can map back to a block
  const webAttr =
    isWeb && blockIndex !== undefined
      ? // react-native-web forwards data-* to the underlying span
        ({ "data-blockindex": String(blockIndex) } as Record<string, string>)
      : {};

  const makeSelect =
    (text?: string) =>
    (e: NativeSyntheticEvent<{ selection: { start: number; end: number } }>) => {
      if (!onSelect || blockIndex === undefined) return;
      const t = text ?? "";
      const { start, end } = e.nativeEvent.selection;
      if (end > start) onSelect(blockIndex, t.slice(start, end), start, end);
      else onSelect(blockIndex, "", -1, -1); // collapsed → clear
    };

  const segments = (text: string): ReactNode => {
    if (!text) return null;
    if (!notes || notes.length === 0) return text;
    const segs = segmentsForHighlights(
      text,
      notes.map((n): HighlightRange => ({ start: n.start, end: n.end, quote: n.quote })),
    );
    return segs.map((seg, i) =>
      seg.highlighted ? (
        <Text key={i} style={s.hl}>
          {seg.text}
        </Text>
      ) : (
        <Text key={i}>{seg.text}</Text>
      ),
    );
  };

  switch (block.type) {
    case "heading":
      return (
        <Text
          style={block.level === 1 ? s.h1 : block.level === 2 ? s.h2 : s.h3}
          selectable={selectable}
          onSelectionChange={makeSelect(block.text)}
          {...webAttr}
        >
          {segments(block.text ?? "")}
        </Text>
      );
    case "paragraph":
      return (
        <Text style={s.p} selectable={selectable} onSelectionChange={makeSelect(block.text)} {...webAttr}>
          {segments(block.text ?? "")}
        </Text>
      );
    case "blockquote":
      return (
        <View style={s.quote}>
          <Text style={s.p} selectable={selectable} onSelectionChange={makeSelect(block.text)} {...webAttr}>
            {segments(block.text ?? "")}
          </Text>
        </View>
      );
    case "list":
      return (
        <>
          {block.items?.map((it, i) => (
            <Text key={i} style={s.li} selectable={selectable} onSelectionChange={makeSelect(it)} {...webAttr}>
              {segments(it)}
            </Text>
          ))}
        </>
      );
    case "ordered-list":
      return (
        <>
          {block.items?.map((it, i) => (
            <Text key={i} style={s.li} selectable={selectable} onSelectionChange={makeSelect(it)} {...webAttr}>
              {segments(`${i + 1}.  ${it}`)}
            </Text>
          ))}
        </>
      );
    case "code":
      return (
        <View style={s.code}>
          <Text style={s.codeLang}>{block.lang}</Text>
          <Text style={s.codeText} selectable={selectable} onSelectionChange={makeSelect(block.value)} {...webAttr}>
            {segments(block.value ?? "")}
          </Text>
        </View>
      );
    case "image":
      return block.url ? (
        <Image source={{ uri: resolveImageUrl(doc, block.url) }} style={s.img} resizeMode="contain" />
      ) : null;
    case "table":
      return (
        <View style={s.table}>
          {(block.rows ?? []).map((row, ri) => (
            <View key={ri} style={[s.tr, ri === 0 && s.th]}>
              {row.map((cell, ci) => (
                <Text key={ci} style={s.td}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

const s = StyleSheet.create({
  h1: { color: "#f5f5f5", fontSize: 26, fontWeight: "700", marginTop: 8, marginBottom: 12 },
  h2: { color: "#f5f5f5", fontSize: 21, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  h3: { color: "#f5f5f5", fontSize: 17, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  p: { color: "#d6d6d6", fontSize: 16, lineHeight: 24, marginBottom: 12 },
  li: { color: "#d6d6d6", fontSize: 16, lineHeight: 24, marginBottom: 4 },
  quote: { borderLeftWidth: 3, borderLeftColor: "#8884", paddingLeft: 12, marginBottom: 12 },
  code: { backgroundColor: "#11131a", borderRadius: 8, padding: 12, marginBottom: 12 },
  codeLang: { color: "#8ab4f8", fontSize: 12, marginBottom: 6 },
  codeText: { color: "#e6e6e6", fontFamily: "monospace", fontSize: 13 },
  img: { width: "100%", height: 220, marginBottom: 12, borderRadius: 8 },
  table: { borderWidth: 1, borderColor: "#8884", borderRadius: 8, marginBottom: 12 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#8883" },
  th: { backgroundColor: "#8881" },
  td: { color: "#d6d6d6", flex: 1, padding: 8, fontSize: 14 },
  hl: { backgroundColor: "#3b82f655", borderRadius: 3 },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `cd client && npx tsc --noEmit`
Expected: no new errors (the `webAttr` spread is typed `Record<string,string>` which RN accepts on `Text`).

```bash
git add client/src/components/Blocks.tsx
git commit -m "feat(client): render highlights and capture selection in BlockView"
```

---

### Task 5: Reader — selection state, save pill, header button, anchor scroll, web selection

**Files:**
- Modify: `client/app/doc/[id].tsx`

- [ ] **Step 1: Replace `doc/[id].tsx` with the notes-aware reader**

`client/app/doc/[id].tsx` (full new content):

```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, Pressable, Platform } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { getDocsByIds, setStatus, setPercent } from "../../src/lib/queries";
import { BlockView } from "../../src/components/Blocks";
import { displayTitle, type PackDoc } from "../../src/lib/types";
import { useContent } from "../../src/stores/content";
import type { DocStatus } from "../../src/lib/progress";
import { addNote, getNotesByBlock } from "../../src/lib/notes";
import { deriveSectionTitle } from "../../src/lib/highlights";
import type { Note } from "../../src/lib/types";

interface Selection {
  blockIndex: number;
  quote: string;
  start: number;
  end: number;
  rect?: { x: number; y: number; width: number; height: number };
}

export default function DocScreen() {
  const { id, anchor } = useLocalSearchParams<{ id: string; anchor?: string }>();
  const router = useRouter();
  const version = useContent((st) => st.version);
  const [doc, setDoc] = useState<(PackDoc & { status: DocStatus; percent: number }) | null>(null);
  const [livePct, setLivePct] = useState<number | null>(null);
  const lastWrittenRef = useRef<number>(-1);
  const [notesByBlock, setNotesByBlock] = useState<Map<number, Note[]>>(new Map());
  const [selection, setSelection] = useState<Selection | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const blockRefs = useRef<Map<number, View>>(new Map());

  useEffect(() => {
    if (!id) return;
    setLivePct(null);
    getDocsByIds([id]).then((r) => setDoc(r[0] ?? null));
    getNotesByBlock(id).then(setNotesByBlock);
  }, [id, version]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!id) return;
      const { height } = e.nativeEvent.contentSize;
      const visible = e.nativeEvent.layoutMeasurement.height;
      const pct = Math.min(100, Math.round(((e.nativeEvent.contentOffset.y + visible) / Math.max(height, 1)) * 100));
      setLivePct(pct);
      if (pct !== lastWrittenRef.current) {
        lastWrittenRef.current = pct;
        void setPercent(id, pct);
      }
    },
    [id],
  );

  // native selection (per-Text onSelectionChange)
  const handleSelect = useCallback((blockIndex: number, quote: string, _start: number, _end: number) => {
    if (!quote) {
      setSelection(null);
      return;
    }
    setSelection({ blockIndex, quote, start: _start, end: _end });
  }, []);

  // web selection (document selectionchange → map via data-blockindex)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const docEl = (globalThis as unknown as { document?: Document }).document;
    const win = (globalThis as unknown as { window?: Window }).window;
    if (!docEl || !win) return;
    const onSel = () => {
      const sel = win.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const el = range.startContainer.parentElement?.closest("[data-blockindex]") as HTMLElement | null;
      if (!el) {
        setSelection(null);
        return;
      }
      const blockIndex = Number(el.getAttribute("data-blockindex"));
      const quote = sel.toString();
      if (!quote || Number.isNaN(blockIndex)) {
        setSelection(null);
        return;
      }
      const r = range.getBoundingClientRect();
      setSelection({ blockIndex, quote, start: -1, end: -1, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
    };
    docEl.addEventListener("selectionchange", onSel);
    return () => docEl.removeEventListener("selectionchange", onSel);
  }, []);

  // jump-to-section when opened with ?anchor=blockIndex
  useEffect(() => {
    if (!anchor || !doc) return;
    const idx = Number(anchor);
    const t = setTimeout(() => {
      const ref = blockRefs.current.get(idx);
      if (!ref) return;
      if (Platform.OS === "web") {
        (ref as unknown as HTMLElement).scrollIntoView?.({ behavior: "smooth", block: "start" });
      } else {
        ref.measure((_x, _y, _w, _h, _px, py) =>
          scrollRef.current?.scrollTo({ y: Math.max(0, py - 80), animated: true }),
        );
      }
    }, 120);
    return () => clearTimeout(t);
  }, [anchor, doc]);

  const handleSave = async () => {
    if (!selection || !doc) return;
    const sectionTitle = deriveSectionTitle(doc.blocks, selection.blockIndex);
    const note = await addNote({
      docId: doc.id,
      blockIndex: selection.blockIndex,
      sectionTitle,
      quote: selection.quote,
      start: selection.start,
      end: selection.end,
    });
    setNotesByBlock((prev) => {
      const next = new Map(prev);
      const arr = next.get(selection.blockIndex) ?? [];
      next.set(selection.blockIndex, [...arr, note]);
      return next;
    });
    setSelection(null);
  };

  if (!doc) return <ActivityIndicator style={{ flex: 1 }} />;
  const read = doc.status === "read";

  const pillStyle =
    Platform.OS === "web" && selection?.rect
      ? { position: "absolute" as const, top: selection.rect.y - 44, left: selection.rect.x + selection.rect.width / 2 - 70, right: undefined }
      : { position: "absolute" as const, top: 80, left: 0, right: 0, alignItems: "center" as const };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: displayTitle(doc.title),
          headerRight: () => (
            <Pressable
              style={{ paddingHorizontal: 12 }}
              onPress={() => router.push({ pathname: "/notes", params: { docId: doc.id } })}
            >
              <Text style={{ fontSize: 20 }}>📝</Text>
            </Pressable>
          ),
        }}
      />
      <View style={s.barWrap}>
        <View style={[s.bar, { width: `${Math.max(livePct ?? doc.percent, 2)}%` as `${number}%` }]} />
      </View>
      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={200} contentContainerStyle={s.content}>
        <Text style={s.meta}>{doc.category} · {doc.readingMin} min · {doc.status}</Text>
        <Pressable style={s.practiceBtn} onPress={() => router.push({ pathname: "/practice", params: { doc: id! } })}>
          <Text style={s.practiceTxt}>▶ Practice this lesson</Text>
        </Pressable>
        {doc.blocks.map((b, i) => (
          <View key={i} ref={(ref) => { if (ref) blockRefs.current.set(i, ref); }}>
            <BlockView
              block={b}
              doc={doc}
              blockIndex={i}
              notes={notesByBlock.get(i)}
              onSelect={handleSelect}
            />
          </View>
        ))}
      </ScrollView>

      {selection && (
        <View style={[s.pillWrap, pillStyle]} pointerEvents="box-none">
          <Pressable style={s.pill} onPress={handleSave}>
            <Text style={s.pillTxt}>📝 Save note</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={[s.markBtn, read && s.marked]}
        onPress={async () => {
          await setStatus(doc.id, read ? "reading" : "read");
          setDoc({ ...doc, status: read ? "reading" : "read" });
        }}
      >
        <Text style={s.markTxt}>{read ? "✓ Read — undo" : "Mark as read"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  barWrap: { height: 3, backgroundColor: "#0001" },
  bar: { height: 3, backgroundColor: "#3b82f6" },
  content: { padding: 16, paddingBottom: 96 },
  meta: { color: "#888", fontSize: 12, marginBottom: 12, textTransform: "uppercase" },
  practiceBtn: { alignSelf: "flex-start", backgroundColor: "#3b82f61a", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
  practiceTxt: { color: "#1d4ed8", fontWeight: "600", fontSize: 14 },
  markBtn: { position: "absolute", bottom: 24, right: 24, backgroundColor: "#3b82f6", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999 },
  marked: { backgroundColor: "#16a34a" },
  markTxt: { color: "white", fontWeight: "600" },
  pillWrap: { zIndex: 50 },
  pill: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#3b82f6", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6 },
  pillTxt: { color: "#fff", fontWeight: "600" },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `cd client && npx tsc --noEmit`
Expected: no new errors.

```bash
git add client/app/doc/[id].tsx
git commit -m "feat(client): reader captures selection, save pill, notes header, jump-to-section"
```

---

### Task 6: Notes list screen (swipe + button delete, tap-to-jump)

**Files:**
- Create: `client/app/(tabs)/notes.tsx`

- [ ] **Step 1: Add `react-native-gesture-handler` to `package.json`**

Run: `cd client && npx expo install react-native-gesture-handler`
Expected: updates `package.json` dependencies (v3.2.1 already in node_modules).

- [ ] **Step 2: Write the Notes screen**

`client/app/(tabs)/notes.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { FlatList, View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Swipeable } from "react-native-gesture-handler";
import { listNotes, deleteNote } from "../../src/lib/notes";
import type { Note } from "../../src/lib/types";

type NoteRow = Note & { docTitle: string };

export default function NotesScreen() {
  const params = useLocalSearchParams<{ docId?: string }>();
  const docId = params.docId;
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [showAll, setShowAll] = useState(!docId);

  const load = async () => {
    const rows = await listNotes(showAll ? undefined : docId);
    setNotes(rows);
  };
  useEffect(() => {
    load();
  }, [docId, showAll]);

  const open = (n: NoteRow) => {
    router.push({ pathname: `/doc/${n.docId}`, params: { anchor: String(n.blockIndex) } });
  };

  const renderItem = ({ item }: { item: NoteRow }) => {
    const inner = (
      <Pressable style={s.row} onPress={() => open(item)}>
        <Text style={s.docTitle}>{item.docTitle}</Text>
        {item.sectionTitle ? <Text style={s.section}>{item.sectionTitle}</Text> : null}
        <Text style={s.quote} numberOfLines={2}>
          {item.quote}
        </Text>
        {Platform.OS === "web" ? (
          <Pressable style={s.delBtn} onPress={() => deleteNote(item.id).then(load)}>
            <Text style={s.delTxt}>🗑</Text>
          </Pressable>
        ) : null}
      </Pressable>
    );

    if (Platform.OS === "web") return inner;
    return (
      <Swipeable
        renderRightActions={() => (
          <Pressable style={s.swipeDel} onPress={() => deleteNote(item.id).then(load)}>
            <Text style={s.delTxt}>Delete</Text>
          </Pressable>
        )}
      >
        {inner}
      </Swipeable>
    );
  };

  return (
    <FlatList
      data={notes}
      keyExtractor={(n) => n.id}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      ListHeaderComponent={
        docId && !showAll ? (
          <Pressable style={{ marginBottom: 8 }} onPress={() => setShowAll(true)}>
            <Text style={s.showAll}>Show all notes</Text>
          </Pressable>
        ) : undefined
      }
      ListEmptyComponent={<Text style={s.empty}>No notes yet — select text in a lesson to save one.</Text>}
    />
  );
}

const s = StyleSheet.create({
  row: { backgroundColor: "#11131a", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#8883" },
  docTitle: { color: "#8ab4f8", fontSize: 13, marginBottom: 2 },
  section: { color: "#888", fontSize: 12, marginBottom: 4 },
  quote: { color: "#e6e6e6", fontSize: 15, lineHeight: 22 },
  delBtn: { position: "absolute", top: 10, right: 10 },
  delTxt: { color: "#f87171", fontSize: 18 },
  swipeDel: { backgroundColor: "#ef4444", justifyContent: "center", paddingHorizontal: 24, borderRadius: 10 },
  showAll: { color: "#3b82f6", fontWeight: "600" },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
```

- [ ] **Step 3: Add Notes tab**

In `client/app/(tabs)/_layout.tsx`, add after the `practice` tab:

```tsx
<Tabs.Screen
  name="notes"
  options={{ title: "Notes", headerRight: HeaderSearch, tabBarIcon: (p) => <TabIcon name="bookmark" color={p.color} /> }}
/>
```

- [ ] **Step 4: Wrap app in `GestureHandlerRootView`**

In `client/app/_layout.tsx`, wrap the existing root (the `ThemeProvider`/root `View`) with `GestureHandlerRootView`:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";
// ...inside the default export's return:
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    {/* existing ThemeProvider / View tree */}
  </GestureHandlerRootView>
);
```

- [ ] **Step 5: Typecheck and commit**

Run: `cd client && npx tsc --noEmit`
Expected: no new errors.

```bash
git add client/app/\(tabs\)/notes.tsx client/app/\(tabs\)/_layout.tsx client/app/_layout.tsx package.json
git commit -m "feat(client): add global Notes tab with swipe/button delete and jump-to-section"
```

---

### Task 7: Manual verification (device + web)

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + unit tests**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Expected: no type errors; highlight tests pass.

- [ ] **Step 2: Web smoke test**

```bash
cd /Users/sandro/Proj/sa-academy
make serve-pack            # http.server on :8173 (background)
cd client && EXPO_PUBLIC_PACK_BASE=http://localhost:8173 npx expo start --web
```
In browser: open a doc → select text → "📝 Save note" pill appears → tap → highlight persists + row appears in Notes tab → tap row jumps to section → 🗑 deletes.

- [ ] **Step 3: Android device smoke test**

```bash
# in a terminal, ensure device reachable:
adb devices                # expect fc5d4dea
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8173 tcp:8173
cd /Users/sandro/Proj/sa-academy
make run-android          # or: make serve-pack (separate term) + cd client && EXPO_PUBLIC_PACK_BASE=http://localhost:8173 npx expo start
```
In Expo Go / dev build: open a doc → long-press to select text → "📝 Save note" appears → save → highlight shows → Notes tab lists it → swipe row left → Delete → row removed.

- [ ] **Step 4: Commit verification notes (if any fixes were needed)**

If you had to fix anything during verification, commit it with a `fix(client):` message and re-run Step 1.

---

## Self-Review Notes

- **Spec coverage:** data model ✅ (Task 1,3), highlight rendering ✅ (Task 4), native selection ✅ (Task 5 `handleSelect`), web selection ✅ (Task 5 `selectionchange`), save pill ✅ (Task 5), header notes button ✅ (Task 5 `headerRight`), Notes tab + list ✅ (Task 6), per-doc filter via `?docId=` ✅ (Task 6 `ListHeaderComponent` "Show all"), jump-to-section ✅ (Task 5 anchor effect), swipe-delete native + button web ✅ (Task 6 `Swipeable`/`delBtn`).
- **No placeholders:** every task contains concrete code; pure logic is TDD-tested in Task 2.
- **Type consistency:** `Note` (types.ts) matches `NoteRow` fields used in `notes.ts`/`notes.tsx`; `Selection` in Task 5 uses `blockIndex/quote/start/end` exactly as `addNote` expects; `highlights.ts` exports `deriveSectionTitle`, `segmentsForHighlights`, `groupNotesByBlock` and they are imported consistently.
- **Caveats captured:** list/ordered-list highlights rely on the `indexOf` fallback (a list item's `data-blockindex` is the block index; the quote is found within the matching item). This matches the spec's "best-effort, deterministic" limitation.
