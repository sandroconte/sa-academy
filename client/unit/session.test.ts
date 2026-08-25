import { describe, it, expect } from "vitest";
import { buildSession } from "../src/lib/session";
import type { SessionItem } from "../src/lib/session";

const items: SessionItem[] = [
  { exerciseId: "1", docId: "d", type: "cloze", payload: {}, answerKey: 0 },
  { exerciseId: "2", docId: "d", type: "mcq", payload: {}, answerKey: 1 },
];

describe("buildSession", () => {
  it("keeps all items and caps length", () => {
    expect(buildSession(items, 10)).toHaveLength(2);
    expect(buildSession(items, 1)).toHaveLength(1);
  });
  it("is deterministic with seeded rng", () => {
    expect(buildSession(items, 10, () => 0.5)).toEqual(buildSession(items, 10, () => 0.5));
  });
});
