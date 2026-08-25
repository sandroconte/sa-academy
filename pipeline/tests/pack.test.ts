import { describe, it, expect } from "vitest";
import { buildPack, docToId } from "../src/pack.js";
import type { ParsedDoc } from "../src/types.js";

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
    terms: [{ term: slug, definition: `${slug} is a test construct for exercising the builder.` }],
  };
}

describe("buildPack", () => {
  const docs = [
    doc("pattern", "zeta-pattern"),
    doc("pattern", "alpha-pattern"),
    doc("lecture", "lecture-01"),
  ];
  const pack = buildPack(docs, [], [], {
    id: "solution-architecture",
    name: "Solution Architecture",
    sources: [],
    curriculum: { modules: [], extraModuleTitle: "Extra patterns" },
  }, { patterns: "shaP", lectures: "shaL" });

  it("sorts docs by id and computes file paths", () => {
    expect(pack.manifest.docs.map((d) => d.id)).toEqual([
      "solution-architecture-lecture-lecture-01",
      "solution-architecture-pattern-alpha-pattern",
      "solution-architecture-pattern-zeta-pattern",
    ]);
    expect(pack.files["docs/solution-architecture-pattern-alpha-pattern.json"]).toBeTruthy();
    expect(pack.files["exercises/solution-architecture-pattern-alpha-pattern.json"]).toBeTruthy();
    expect(pack.files["manifest.json"]).toBeTruthy();
  });

  it("records repo shas in version", () => {
    expect(pack.manifest.version).toEqual({ patterns: "shaP", lectures: "shaL" });
  });

  it("is byte-deterministic regardless of input order", () => {
    const again = buildPack([...docs].reverse(), [], [], {
      id: "solution-architecture",
      name: "Solution Architecture",
      sources: [],
      curriculum: { modules: [], extraModuleTitle: "Extra patterns" },
    }, { patterns: "shaP", lectures: "shaL" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(pack));
  });

  it("generates exercises per doc with ids tied to doc", () => {
    const ex = JSON.parse(
      pack.files["exercises/solution-architecture-pattern-alpha-pattern.json"]!,
    );
    expect(ex.docId).toBe("solution-architecture-pattern-alpha-pattern");
    expect(Array.isArray(ex.items)).toBe(true);
  });
});
