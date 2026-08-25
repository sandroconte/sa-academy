import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import type { RepoSource } from "./types.js";

export interface DiscoveredFile {
  repoLabel: string;
  absPath: string;
  relPath: string;
  category: string;
  kind: RepoSource["kind"];
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

export function discoverSource(repoRoot: string, source: RepoSource): DiscoveredFile[] {
  const roots = source.paths ?? [source.path ?? "."];
  const out: DiscoveredFile[] = [];
  for (const sub of roots) {
    const abs = join(repoRoot, sub);
    if (!existsSync(abs)) continue;
    const files: string[] = [];
    walk(abs, files);
    for (const f of files) {
      const name = basename(f);
      if (!name.toLowerCase().endsWith(".md")) continue;
      if (/^readme/i.test(name)) continue;
      out.push({
        repoLabel: source.repo,
        absPath: f,
        relPath: relative(repoRoot, f),
        category: source.kind === "lectures" ? "lectures" : sub,
        kind: source.kind,
      });
    }
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
