import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, ListContent, TableContent, PhrasingContent } from "mdast";
import type { Block, ParsedDoc, Term } from "./types.js";

const processor = unified().use(remarkParse).use(remarkGfm);

export function makeSlug(filename: string): string {
  return filename
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface ParseMeta {
  id: string;
  subjectId: string;
  kind: "pattern" | "lecture";
  category: string;
  slug?: string;
}

function phrasingText(nodes: PhrasingContent[]): { text: string; bold: string[] } {
  let text = "";
  const bold: string[] = [];
  const visit = (n: PhrasingContent): void => {
    if (n.type === "text") text += n.value;
    else if (n.type === "strong") {
      const inner = phrasingText(n.children);
      bold.push(inner.text.trim());
      text += inner.text;
    } else if (n.type === "inlineCode") text += n.value;
    else if ("children" in n) n.children.forEach(visit);
  };
  nodes.forEach(visit);
  return { text: text.replace(/\s+/g, " ").trim(), bold };
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"`])/g).filter((s) => s.length > 0);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractTerms(
  blocksText: string[],
  boldTerms: string[],
  headings: string[],
): Term[] {
  const terms = new Map<string, Term>();
  const add = (term: string, definition: string | null): void => {
    const key = term.toLowerCase();
    if (key.length < 3 || key.length > 60) return;
    if (!terms.has(key)) terms.set(key, { term, definition });
    else if (definition && !terms.get(key)!.definition) terms.get(key)!.definition = definition;
  };

  for (const h of headings) add(h, null);
  for (const b of boldTerms) add(b, null);

  const defRe = /^(?:(?:the|The|[aA]n?|[Tt]he)\s+)?([A-Z][A-Za-z0-9 .\-]{2,58}?)\s+\b(is|are)\b\s+(?:a|an|the)?\s*(.{15,})$/;
  const colonRe = /^([A-Z][A-Za-z0-9 .\-]{2,58}?):\s+(.{15,})$/;

  for (const para of blocksText) {
    for (const sentence of splitSentences(para)) {
      const m = defRe.exec(sentence) ?? colonRe.exec(sentence);
      if (m) add(m[1].trim(), sentence.trim());
    }
  }

  // attach first sentence containing a bold/heading term as its definition
  for (const t of terms.values()) {
    if (t.definition) continue;
    const re = new RegExp(`[^.!?]*\\b${escapeRe(t.term)}\\b[^.!?]*[.!?]`, "i");
    for (const para of blocksText) {
      const m = re.exec(para);
      if (m && m[0].length < 300) {
        t.definition = m[0].trim();
        break;
      }
    }
  }
  return [...terms.values()];
}

export function parseMarkdown(raw: string, meta: ParseMeta): ParsedDoc {
  const tree = processor.parse(raw) as Root;
  const blocks: Block[] = [];
  const sections: { title: string }[] = [];
  const paragraphsAsText: string[] = [];
  const boldAll: string[] = [];
  let title = "";
  let words = 0;

  const pushPhrasing = (children: PhrasingContent[], block: Block): void => {
    const { text, bold } = phrasingText(children);
    block.text = text;
    words += text.split(/\s+/).filter(Boolean).length;
    boldAll.push(...bold);
  };

  const visit = (node: RootContent | ListContent | TableContent): void => {
    switch (node.type) {
      case "heading": {
        const b: Block = { type: "heading", level: node.depth };
        pushPhrasing(node.children, b);
        if (node.depth === 1 && !title) title = b.text ?? "";
        if (node.depth === 2 && b.text) sections.push({ title: b.text });
        blocks.push(b);
        break;
      }
      case "paragraph": {
        const images = node.children.filter(
          (c): c is Extract<PhrasingContent, { type: "image" }> => c.type === "image",
        );
        const b: Block = { type: "paragraph" };
        pushPhrasing(node.children.filter((c) => c.type !== "image"), b);
        if (b.text) {
          blocks.push(b);
          paragraphsAsText.push(b.text);
        }
        for (const img of images) blocks.push({ type: "image", url: img.url, alt: img.alt ?? "" });
        break;
      }
      case "list": {
        const items = node.children.map((li) => {
          const texts = li.children
            .filter((c): c is Extract<ListContent, { type: "paragraph" }> => c.type === "paragraph")
            .map((p) => phrasingText(p.children).text);
          const nested = li.children.filter((c) => c.type === "list") as unknown as ListContent[];
          nested.forEach(visit);
          return texts.join(" ");
        });
        blocks.push({ type: node.ordered ? "ordered-list" : "list", items });
        words += items.join(" ").split(/\s+/).filter(Boolean).length;
        break;
      }
      case "code":
        blocks.push({ type: "code", lang: node.lang ?? "", value: node.value });
        break;
      case "blockquote": {
        const inner = node.children.find((c) => c.type === "paragraph");
        const b: Block = { type: "blockquote" };
        if (inner && inner.type === "paragraph") pushPhrasing(inner.children, b);
        blocks.push(b);
        break;
      }
      case "table": {
        const rows = node.children.map((row) =>
          row.children.map((cell) => phrasingText(cell.children).text),
        );
        blocks.push({ type: "table", rows });
        break;
      }
      default:
        break;
    }
  };

  tree.children.forEach((c) => visit(c as RootContent));

  const fallbackTitle = meta.id.split("-").slice(-3).join("-");
  const doc: ParsedDoc = {
    ...meta,
    title: title || fallbackTitle,
    slug: meta.slug ?? makeSlug(`${meta.id}.md`),
    readingMin: Math.max(1, Math.round(words / 200)),
    blocks,
    sections,
    terms: [],
  };
  doc.terms = extractTerms(paragraphsAsText, boldAll, sections.map((s) => s.title));
  return doc;
}

export function orderedSteps(blocks: Block[]): string[][] {
  return blocks
    .filter((b): b is Block & { type: "ordered-list"; items: string[] } => b.type === "ordered-list")
    .map((b) => b.items)
    .filter((items) => items.length >= 3);
}
