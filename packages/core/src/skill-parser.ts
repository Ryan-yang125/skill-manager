import fs from "node:fs";
import path from "node:path";

export interface ParsedSkill {
  name: string;
  title: string;
  summary: string;
  contextTokens: number;
  content: string;
}

export async function parseSkillMarkdown(skillMarkdownPath: string): Promise<ParsedSkill | null> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(skillMarkdownPath, "utf8");
  } catch {
    return null;
  }

  const folderName = path.basename(path.dirname(skillMarkdownPath));
  const frontmatter = extractFrontmatter(raw);
  const name = nonEmpty(frontmatter.name) ?? folderName;
  const summary = nonEmpty(frontmatter.description) ?? firstMeaningfulParagraph(raw) ?? "Local skill";
  const heading = raw
    .split(/\r?\n/)
    .find((line) => line.startsWith("# "))
    ?.slice(2)
    .trim();

  return {
    name,
    title: nonEmpty(heading) ?? name,
    summary,
    contextTokens: estimateTokens(`${name}\n${summary}`),
    content: raw
  };
}

export function estimateTokens(text: string): number {
  const scalarCount = [...text].length;
  const wordCount = text.split(/[\s\p{Punctuation}]+/u).filter(Boolean).length;
  const cjkCount = [...text].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 0x4e00 && code <= 0x9fff;
  }).length;

  const latinEstimate = Math.max(wordCount, Math.floor(scalarCount / 5));
  return Math.max(1, latinEstimate + Math.floor(cjkCount / 2));
}

function extractFrontmatter(raw: string): Record<string, string> {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};

  const result: Record<string, string> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "---") break;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.trim();
    let value = match[2]!.trim();
    if (value === ">" || value === "|") {
      const blockLines: string[] = [];
      for (index += 1; index < lines.length; index += 1) {
        const blockLine = lines[index] ?? "";
        if (blockLine.trim() === "---") {
          index -= 1;
          break;
        }
        if (/^[A-Za-z0-9_-]+:\s*/.test(blockLine)) {
          index -= 1;
          break;
        }
        blockLines.push(blockLine.replace(/^\s{2,}/, "").trimEnd());
      }
      value = value === ">" ? blockLines.map((item) => item.trim()).filter(Boolean).join(" ") : blockLines.join("\n").trim();
    }
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function firstMeaningfulParagraph(raw: string): string | null {
  for (const paragraph of raw.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("---")) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.length <= 16) continue;
    return trimmed;
  }
  return null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
