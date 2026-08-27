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
