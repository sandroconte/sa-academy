import { describe, it, expect } from "vitest";
import { assignModules } from "../src/curriculum.js";
import type { ParsedDoc, SubjectConfig } from "../src/types.js";

const subject: SubjectConfig = {
  id: "solution-architecture",
  name: "Solution Architecture",
  sources: [],
  curriculum: {
    modules: [
      { id: "foundations", title: "Foundations", rules: ["layered"] },
      { id: "apis", title: "Integration & APIs", rules: ["api"] },
    ],
    extraModuleTitle: "Extra patterns",
  },
};

function doc(slug: string): ParsedDoc {
  return {
    id: `solution-architecture-pattern-${slug}`,
    subjectId: "solution-architecture",
    kind: "pattern",
    category: "vendor-neutral",
    title: slug,
    slug,
    readingMin: 1,
    blocks: [],
    sections: [],
    terms: [],
  };
}

describe("assignModules", () => {
  it("matches slugs against rules in module order", () => {
    const { modules, moduleDocs } = assignModules(
      [doc("graphql-pattern"), doc("layered-architecture-pattern"), doc("mystery-pattern")],
      subject,
    );
    expect(modules.map((m) => m.id)).toEqual(["foundations", "apis", "solution-architecture-extra"]);
    const byDoc = Object.fromEntries(moduleDocs.map((md) => [md.docId, md.moduleId]));
    expect(byDoc["solution-architecture-pattern-layered-architecture-pattern"]).toBe("foundations");
    expect(byDoc["solution-architecture-pattern-graphql-pattern"]).toBe("apis");
    expect(byDoc["solution-architecture-pattern-mystery-pattern"]).toBe("solution-architecture-extra");
  });
});
