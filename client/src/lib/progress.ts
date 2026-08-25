export type DocStatus = "unread" | "reading" | "read";
export const READ_THRESHOLD = 95;

export function statusForPercent(percent: number): DocStatus {
  if (percent >= READ_THRESHOLD) return "read";
  if (percent > 0) return "reading";
  return "unread";
}

export interface ModuleStats { done: number; total: number; percent: number }

export function moduleStats(statuses: DocStatus[]): ModuleStats {
  const total = statuses.length;
  const done = statuses.filter((s) => s === "read").length;
  return { done, total, percent: total === 0 ? 1 : done / total };
}
