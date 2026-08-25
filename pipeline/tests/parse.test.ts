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
