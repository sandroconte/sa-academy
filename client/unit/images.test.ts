import { describe, it, expect } from "vitest";
import { resolveImageUrl } from "../src/lib/images";

describe("resolveImageUrl", () => {
  it("resolves relative pattern images against category base", () => {
    expect(resolveImageUrl({ kind: "pattern", category: "vendor-neutral" }, "images/x.png"))
      .toBe("https://raw.githubusercontent.com/chanakaudaya/solution-architecture-patterns/master/vendor-neutral/images/x.png");
  });
  it("resolves lecture images", () => {
    expect(resolveImageUrl({ kind: "lecture", category: "lectures" }, "img/a.png"))
      .toBe("https://raw.githubusercontent.com/sandroconte/lectures/main/solution-architecture/img/a.png");
  });
  it("keeps absolute urls", () => {
    expect(resolveImageUrl({ kind: "pattern", category: "c" }, "https://x/y.png")).toBe("https://x/y.png");
  });
});
