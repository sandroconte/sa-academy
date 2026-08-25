import { describe, it, expect } from "vitest";
import { statusForPercent, moduleStats } from "../src/lib/progress";
import type { DocStatus } from "../src/lib/progress";

describe("statusForPercent", () => {
  it("unread at 0, reading below 95, read at >=95", () => {
    expect(statusForPercent(0)).toBe("unread");
    expect(statusForPercent(50)).toBe("reading");
    expect(statusForPercent(95)).toBe("read");
    expect(statusForPercent(100)).toBe("read");
  });
});

describe("moduleStats", () => {
  it("computes done ratio and overall percent", () => {
    const stats = moduleStats(["read", "reading", "unread"]);
    expect(stats.done).toBe(1);
    expect(stats.total).toBe(3);
    expect(stats.percent).toBeCloseTo(1 / 3);
  });
  it("empty module is 100% but zero total", () => {
    expect(moduleStats([])).toEqual({ done: 0, total: 0, percent: 1 });
  });
});
