# Notes & Highlights — Design

**Date:** 2026-08-27
**Status:** Approved (design)

## Goal

Let readers save a selected text passage from any document as a **note** (the note is
exactly the selected quote — no extra typing), see saved passages **highlighted in place**
when they re-read, and browse all notes in a global list that shows each note's **doc title**
and **section**, with a link that jumps back to the exact location.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Note content | The note **is** the selected quote. No user comment/annotation. |
| Highlight | Saved quotes are highlighted **in place** in the reader **and** listed in a notes screen. |
| Platforms | **All** — iOS, Android, and Web in this build. |
| Notes list location | **Both**: a global **Notes** tab (all notes across docs) **and** a reader-header "📝" icon that opens the list filtered to the current doc. |
| Save affordance | A floating **"📝 Save note" pill** that appears above the selection (anchored on web; fixed position on native). |

## Data model

New table added to `CORE_DDL` in `client/src/lib/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  block_index INTEGER NOT NULL,
  section_title TEXT NOT NULL,
  quote TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_doc ON notes(doc_id);
CREATE INDEX IF NOT EXISTS notes_doc_block ON notes(doc_id, block_index);
```

- `block_index` — position of the block within `doc.blocks` (stable for the current content version).
- `start` / `end` — character offsets of the quote within that block's text. `-1` if unknown.
- `section_title` — the section the block belongs to, captured **at save time** (see Section derivation below).

New `Note` type in `client/src/lib/types.ts`:

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

## Notes data layer — `client/src/lib/notes.ts` (new)

- `addNote(input: { docId; blockIndex; sectionTitle; quote; start; end }): Promise<Note>`
  - Dedupe: if a note with the same `(doc_id, block_index, quote)` already exists, return the
    existing one instead of inserting a duplicate.
  - `id` = `crypto.randomUUID()`; `created_at`/`updated_at` = `Date.now()`.
- `listNotes(docId?: string): Promise<(Note & { docTitle: string })[]>`
  - All notes sorted by `created_at` DESC, or filtered by `docId`.
  - Joins `documents.title` (via `displayTitle`) so the list shows the doc title without a
    second round-trip.
- `deleteNote(id: string): Promise<void>`
- `getNotesByBlock(docId: string): Promise<Map<number, Note[]>>`
  - Used by the reader to know which blocks carry highlights.

## Section derivation

`doc.sections` is a flat list of titles with no structural link to blocks. The section a
block belongs to is derived at render time by walking `doc.blocks` top-to-bottom: each
`heading` block starts a new section (its `text` becomes the current `sectionTitle`).
A pure helper `deriveSectionTitle(blocks, blockIndex): string` is unit-tested and reused by
both the reader (for highlight context) and the save action (to store `section_title`).

## Cross-platform selection capture

A shared shape is produced on both platforms:

```ts
interface ActiveSelection { blockIndex: number; quote: string; start: number; end: number; rect?: { x: number; y: number; width: number; height: number } }
```

- **Native (iOS/Android):** `BlockView` renders selectable text blocks with
  `selectable` + `onSelectionChange`. The event's `selection.{start,end}` are offsets within
  that block's text (which is exactly `block.text`, so `quote = block.text.slice(start, end)`).
  No `rect` is available → pill uses a fixed position.
- **Web:** the doc screen attaches a `selectionchange` listener. `window.getSelection()` yields
  the `Range`; `range.getBoundingClientRect()` gives `rect`; the surrounding text element carries
  a `data-blockindex` attribute so we map the selection back to a block. `quote` =
  `selection.toString()`.

The doc screen holds `selection: ActiveSelection | null` in state. Clearing the text selection
or leaving the screen clears it.

## Save affordance (Option A)

When `selection` is non-null, the doc screen renders a floating **"📝 Save note"** pill:

- **Web:** absolutely positioned above the selection using `rect` (clamped to viewport).
- **Native:** positioned at a fixed spot (top-center of the reader, below the header) since
  native offers no selection coordinates.

Tapping the pill calls `addNote({ docId, blockIndex, sectionTitle, quote, start, end })`, clears
`selection`, and the quote becomes highlighted immediately on the next render (the reader
re-fetches notes for the doc or merges the new note into its `notesByBlock` map).

## In-place highlights — `client/src/components/Blocks.tsx`

The reader passes `notesByBlock: Map<number, Note[]>` into `BlockView`.

- Only **text blocks** are highlightable: `paragraph`, `heading`, `blockquote`, `list` (per item),
  `ordered-list` (per item), and `code`. `table` and `image` are not highlighted in v1.
- For a block with notes, the block text is split into segments by each note's range. Ranges use
  stored `start`/`end` when valid (within text length and `text.slice(start,end) === quote`);
  otherwise fall back to `text.indexOf(quote)`. Overlapping ranges are merged/clipped so segments
  stay non-overlapping.
- Quoted segments render as a nested `<Text style={highlight}>` (`backgroundColor: "#3b82f655"`).
  Blockquotes keep their left-border treatment and just tint the background.
- Tapping a highlighted segment is **optional** in v1 (could open a delete action); the primary
  delete path is the Notes list. If included, tapping shows a confirm-to-delete.

## Notes list — new `client/app/(tabs)/notes.tsx`

- Added as the **5th tab** in `client/app/(tabs)/_layout.tsx`.
- Lists notes (from `listNotes`), newest first. Each row:
  - doc title (bold, small label),
  - section title (small, muted label),
  - the quote (1–2 lines, truncated with ellipsis).
- Tap a row → `router.push({ pathname: "/doc/[id]", params: { anchor: String(blockIndex) } })`.
- Delete: **swipe-to-delete** using `Swipeable` from `react-native-gesture-handler` (already
  available via Expo; will be added explicitly to `package.json`). Swiping a row reveals a red
  **Delete** action. On **web**, `Swipeable` is unsupported, so each row also shows a trailing
  **🗑** button (with confirm). Both paths call `deleteNote`.
- When opened from the reader header (`/notes?docId=ID`), the list is pre-filtered to that doc
  with a "Show all" toggle to return to the global view.

## Reader header icon

`app/doc/[id].tsx` sets a `headerRight` "📝" button (via `Stack.Screen options`) that navigates
to `/notes?docId=<currentDocId>`.

## Jump-to-section

- The doc screen reads `anchor` (a `block_index`) from params.
- It keeps `blockRefs: Map<number, React.RefObject<View>>` populated as blocks render.
- After the doc loads and blocks mount, if `anchor` is present it measures the target block
  (`ref.measure`) and calls `scrollViewRef.scrollTo({ y })` on native / `scrollIntoView` on web,
  with a brief highlight flash so the user sees where they landed.

## v1 limitations (explicitly out of scope)

- Selection is **single-block** (React Native cannot select across multiple `Text` components).
- The native save pill is **fixed-position** (RN exposes no selection coordinates).
- `table` and `image` blocks are **not selectable/highlightable**.
- If content is re-synced and a block's text changes, stored offsets may drift; the highlight
  may then not render (the note still appears in the list and still jumps to the block).

## Testing

- **Unit (vitest, node env — `client/unit/`):** `deriveSectionTitle`, highlight segmentation
  (split-by-ranges, overlapping + non-overlapping, fallback `indexOf`), `addNote` dedupe,
  `listNotes` sorting/filtering.
- **Manual (device + web):** on Android and web — select text, save via pill, confirm highlight
  appears; open Notes tab, confirm title + section + quote; tap to jump; delete from list.

## Files touched

| File | Change |
|---|---|
| `client/src/lib/db.ts` | Add `notes` table + indexes to `CORE_DDL`. |
| `client/src/lib/types.ts` | Add `Note` interface. |
| `client/src/lib/notes.ts` | **New** — `addNote`, `listNotes`, `deleteNote`, `getNotesByBlock`. |
| `client/src/components/Blocks.tsx` | Accept `notesByBlock`; render highlights; emit selection on native. |
| `client/app/doc/[id].tsx` | Selection state, save pill, header icon, anchor scroll, web `selectionchange`. |
| `client/app/(tabs)/notes.tsx` | **New** — global notes list. |
| `client/app/(tabs)/_layout.tsx` | Add Notes tab. |
