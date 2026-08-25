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
