import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { discoverSource } from "./discover.js";
import { parseMarkdown, makeSlug } from "./parse.js";
import { assignModules } from "./curriculum.js";
import { buildPack, docToId } from "./pack.js";
import type { ParsedDoc, RepoInput, SubjectsConfig } from "./types.js";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, "..", "content-pack");
const SOURCES_DIR = join(ROOT, ".sources");

function sh(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf8" }).trim();
}

function prepareRepos(config: SubjectsConfig): RepoInput[] {
  rmSync(SOURCES_DIR, { recursive: true, force: true });
  mkdirSync(SOURCES_DIR, { recursive: true });
  const inputs = new Map<string, RepoInput>();
  let i = 0;
  for (const subject of config.subjects) {
    for (const src of subject.sources) {
      if (inputs.has(src.repo)) continue;
      const localDir = join(SOURCES_DIR, `repo-${i++}`);
      sh(`git clone --depth 1 https://github.com/${src.repo}.git "${localDir}"`);
      inputs.set(src.repo, {
        label: src.kind,
        url: src.repo,
        localDir,
        sha: sh("git rev-parse HEAD", localDir),
        sources: [],
      });
    }
    for (const src of subject.sources) inputs.get(src.repo)!.sources.push(src);
  }
  return [...inputs.values()];
}

function main(): void {
  const config: SubjectsConfig = JSON.parse(
    readFileSync(join(ROOT, "subjects.config.json"), "utf8"),
  );
  const repos = prepareRepos(config);
  const version: Record<string, string> = {};
  const docs: ParsedDoc[] = [];

  for (const repo of repos) {
    version[repo.label] = repo.sha;
    for (const subject of config.subjects) {
      const mine = subject.sources.filter((s) => s.repo === repo.url);
      for (const src of mine) {
        for (const file of discoverSource(repo.localDir, src)) {
          try {
            const raw = readFileSync(file.absPath, "utf8");
            const slug = makeSlug(file.absPath.split("/").pop()!);
            const kind = src.kind === "lectures" ? "lecture" : "pattern";
            docs.push(
              parseMarkdown(raw, {
                id: docToId(subject.id, kind, slug),
                subjectId: subject.id,
                kind,
                category: file.category,
                slug,
              }),
            );
          } catch (err) {
            console.error(`SKIP ${file.relPath}: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  let modules: ReturnType<typeof assignModules>["modules"] = [];
  let moduleDocs: ReturnType<typeof assignModules>["moduleDocs"] = [];
  for (const subject of config.subjects) {
    const r = assignModules(
      docs.filter((d) => d.subjectId === subject.id && d.kind === "pattern"),
      subject,
    );
    modules = [...modules, ...r.modules];
    moduleDocs = [...moduleDocs, ...r.moduleDocs];
  }

  const pack = buildPack(docs, modules, moduleDocs, config.subjects[0]!, version);
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [rel, content] of Object.entries(pack.files)) {
    const dest = join(OUT_DIR, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  console.log(
    `PACK OK: ${pack.manifest.docs.length} docs, ${modules.length} modules -> ${OUT_DIR} (patterns=${version["patterns"]?.slice(0, 7) ?? "-"} lectures=${version["lectures"]?.slice(0, 7) ?? "-"})`,
  );
}

main();
