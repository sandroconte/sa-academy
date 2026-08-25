import { IMAGE_BASES } from "./config";
import type { PackDoc } from "./types";

export function resolveImageUrl(doc: Pick<PackDoc, "kind" | "category">, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = doc.kind === "lecture" ? IMAGE_BASES.lecture() : IMAGE_BASES.pattern(doc.category);
  return base + url.split("/").map(encodeURIComponent).join("/");
}
