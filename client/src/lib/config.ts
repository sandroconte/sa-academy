/**
 * Where the content pack lives (this same repo, once pushed to GitHub).
 * Override during local dev with EXPO_PUBLIC_PACK_BASE.
 */
export const PACK_BASE =
  process.env.EXPO_PUBLIC_PACK_BASE ?? "https://raw.githubusercontent.com/sandroconte/sa-academy/master/content-pack";

/** Bases for resolving RELATIVE image urls found inside doc blocks. */
export const IMAGE_BASES = {
  pattern: (category: string) =>
    `https://raw.githubusercontent.com/chanakaudaya/solution-architecture-patterns/master/${encodeURIComponent(category)}/`,
  lecture: () =>
    `https://raw.githubusercontent.com/sandroconte/lectures/main/solution-architecture/`,
} as const;
