import { describe, it, expect } from "vitest";
import { grade } from "../src/lib/grading";
import type { Exercise } from "../src/lib/types";

const mcq: Exercise = { id: "e1", type: "mcq", payload: {}, answerKey: 2 };
const tf: Exercise = { id: "e2", type: "truefalse", payload: {}, answerKey: false };
const match: Exercise = { id: "e3", type: "matching", payload: {}, answerKey: [2, 0, 3, 1] };
const ord: Exercise = { id: "e4", type: "ordering", payload: {}, answerKey: [1, 0, 2] };

describe("grade", () => {
  it("grades choice answers by index", () => {
    expect(grade(mcq, 2)).toBe(true);
    expect(grade(mcq, 0)).toBe(false);
  });
  it("grades booleans", () => {
    expect(grade(tf, false)).toBe(true);
    expect(grade(tf, true)).toBe(false);
  });
  it("requires exact arrays for matching/ordering", () => {
    expect(grade(match, [2, 0, 3, 1])).toBe(true);
    expect(grade(match, [0, 2, 3, 1])).toBe(false);
    expect(grade(ord, [1, 0, 2])).toBe(true);
  });
});
