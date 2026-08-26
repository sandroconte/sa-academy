import { describe, it, expect } from "vitest";
import { displayTitle } from "../src/lib/types";

describe("displayTitle", () => {
  it("prettifies slug-fallback titles", () => {
    expect(displayTitle("corruption-layer-pattern")).toBe("Corruption Layer Pattern");
  });
  it("keeps real titles", () => {
    expect(displayTitle("API Security Pattern")).toBe("API Security Pattern");
  });
});
