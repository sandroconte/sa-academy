export function buildFtsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^(and|or|not)$/.test(t));
  return tokens.map((t) => `"${t}"*`).join(" AND ");
}
