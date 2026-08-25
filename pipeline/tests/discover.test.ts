import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { discoverSource } from "../src/discover.js";
import type { RepoSource } from "../src/types.js";

const root = join(import.meta.dirname, "fixtures-repo");

describe("discoverSource", () => {
  const patterns: RepoSource = {
    repo: "x/y",
    kind: "patterns",
    paths: ["cat-a"],
  };

  it("finds md files under configured paths, skipping READMEs", () => {
    const files = discoverSource(root, patterns);
    expect(files.map((f) => f.relPath)).toEqual(["cat-a/doc-one.md"]);
    expect(files[0]!.category).toBe("cat-a");
    expect(files[0]!.kind).toBe("patterns");
  });

  const lectures: RepoSource = { repo: "a/b", kind: "lectures", path: "solution-architecture" };
  it("returns empty array when configured folder is missing", () => {
    const files = discoverSource(root, lectures);
    expect(files).toEqual([]);
  });
});
