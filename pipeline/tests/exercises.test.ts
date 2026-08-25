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
    expect(ex!.payload.options as string[]).toHaveLength(4);
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
