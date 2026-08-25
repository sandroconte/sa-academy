import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown } from "../src/parse.js";
import { generateExercises } from "../src/exercises/generate.js";

const md = readFileSync(join(import.meta.dirname, "fixtures/pattern-sample.md"), "utf8");

function run(): string {
  const doc = parseMarkdown(md, {
    id: "solution-architecture-pattern-api-security-pattern",
    subjectId: "solution-architecture",
    kind: "pattern",
    category: "vendor-neutral",
  });
  return JSON.stringify(generateExercises(doc));
}

describe("golden determinism", () => {
  it("identical output across repeated runs in-process", () => {
    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(50); // actually generated something
  });
});
