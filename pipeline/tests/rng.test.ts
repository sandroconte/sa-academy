import { describe, it, expect } from "vitest";
import { fnv1a32, mulberry32, shuffle, pickN } from "../src/exercises/rng.js";

describe("rng", () => {
  it("fnv1a32 is stable", () => {
    expect(fnv1a32("abc")).toBe(fnv1a32("abc"));
    expect(fnv1a32("abc")).not.toBe(fnv1a32("abd"));
  });

  it("mulberry32 same seed -> same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("shuffle keeps members and is deterministic", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr, mulberry32(7))).toEqual(shuffle(arr, mulberry32(7)));
    expect([...shuffle(arr, mulberry32(7))].sort()).toEqual(arr);
  });

  it("pickN returns n distinct items", () => {
    const picked = pickN(["a", "b", "c", "d"], 2, mulberry32(1));
    expect(new Set(picked).size).toBe(2);
  });
});
