import { describe, it, expect } from "vitest";
import { diffManifest, filesToRemove, mergeFailedIntoPrev } from "../src/lib/syncDiff";
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

  it("empty next removes all docs", () => {
    const prev = manifestWith([["a", "1"]]);
    expect(filesToRemove(prev, manifestWith([]))).toEqual(["a"]);
    expect(diffManifest(prev, manifestWith([]))).toEqual([]);
  });

  it("filesToRemove with null prev returns empty", () => {
    expect(filesToRemove(null, manifestWith([["a", "1"]]))).toEqual([]);
  });
});

describe("mergeFailedIntoPrev", () => {
  it("keeps previous entry for failed existing docs (retried next sync)", () => {
    const prev = manifestWith([["a", "1"]]);
    const next = manifestWith([["a", "9"]]);
    const saved = mergeFailedIntoPrev(prev, next, new Set(["a"]));
    expect(saved.docs[0]!.sha256).toBe("1");
    expect(diffManifest(saved, next)).toEqual(["docs/a.json", "exercises/a.json"]);
  });

  it("omits failed brand-new docs so they stay new", () => {
    const prev = null;
    const next = manifestWith([["a", "1"], ["b", "2"]]);
    const saved = mergeFailedIntoPrev(prev, next, new Set(["b"]));
    expect(saved.docs.map((d) => d.id)).toEqual(["a"]);
  });

  it("passes through when no failures", () => {
    const next = manifestWith([["a", "1"]]);
    expect(mergeFailedIntoPrev(null, next, new Set())).toEqual(next);
  });
});
