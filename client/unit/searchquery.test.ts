import { describe, it, expect } from "vitest";
import { buildFtsQuery } from "../src/lib/searchquery";

describe("buildFtsQuery", () => {
  it("tokenizes and prefixes", () => {
    expect(buildFtsQuery("api security")).toBe('"api"* AND "security"*');
  });
  it("strips fts operators and quotes", () => {
    expect(buildFtsQuery('"api" OR NEAR( x )')).toBe('"api"* AND "near"* AND "x"*');
  });
  it("returns empty for blank input", () => {
    expect(buildFtsQuery("  ")).toBe("");
  });
});
