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
  for (let i = 0; i < blockIndex && i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "heading") current = b.text ?? "";
  }
  return current;
}

/**
 * Split `text` into segments, marking the ranges covered by any note as
 * highlighted. Uses stored offsets when they match `quote`; otherwise falls
 * back to `indexOf(quote)`; merges overlapping ranges. Pure + deterministic.
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

  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }

  const segments: TextSegment[] = [];
  let pos = 0;
  for (const r of merged) {
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
