import { describe, it, expect } from "vitest";
import { diffManifest, filesToRemove } from "../src/lib/syncDiff";
import type { Manifest } from "../src/lib/types";

function manifestWith(ids: [string, string][]): Manifest {
  return {
    version: {},
    subjects: [],
    docs: ids.map(([id, sha]) => ({ id, sha256: sha, file: `docs/${id}.json`, exercisesFile: `exercises/${id}.json`, kind: "pattern", category: "c", title: id, subjectId: "s" })),
    modules: [], moduleDocs: [],
  };
}

describe("diffManifest", () => {
  it("downloads everything on first sync (no previous)", () => {
    const next = manifestWith([["a", "1"]]);
    const files = diffManifest(null, next);
    expect(files.sort()).toEqual(["docs/a.json", "exercises/a.json"]);
  });

  it("downloads only new or changed docs", () => {
    const prev = manifestWith([["a", "1"], ["b", "2"]]);
    const next = manifestWith([["a", "1"], ["b", "9"], ["c", "3"]]);
    const files = diffManifest(prev, next);
    expect(files.sort()).toEqual(["docs/b.json", "docs/c.json", "exercises/b.json", "exercises/c.json"]);
  });

  it("returns empty when identical", () => {
    const m = manifestWith([["a", "1"]]);
    expect(diffManifest(m, m)).toEqual([]);
  });

  it("lists removed doc ids", () => {
    const prev = manifestWith([["a", "1"], ["b", "2"]]);
    const next = manifestWith([["a", "1"]]);
    expect(filesToRemove(prev, next)).toEqual(["b"]);
  });
});
