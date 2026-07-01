import fs from "node:fs";
import path from "node:path";

import type { SkillPackageMetadata } from "./types.js";

interface SkillLockFile {
  skills?: Record<string, SkillLockSkill>;
}

interface SkillLockSkill {
  source?: string;
  sourceType?: string;
  sourceUrl?: string;
  skillPath?: string;
  pluginName?: string;
  installedAt?: string;
  updatedAt?: string;
}

export class SkillPackageStore {
  readonly homeDir: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
  }

  get lockFilePath(): string {
    return path.join(this.homeDir, ".agents", ".skill-lock.json");
  }

  async metadataBySkillName(): Promise<Map<string, SkillPackageMetadata>> {
    let parsed: SkillLockFile;
    try {
      parsed = JSON.parse(await fs.promises.readFile(this.lockFilePath, "utf8")) as SkillLockFile;
    } catch {
      return new Map();
    }

    const result = new Map<string, SkillPackageMetadata>();
    for (const [skillName, item] of Object.entries(parsed.skills ?? {})) {
      const metadata = metadataFor(item);
      if (!metadata) continue;
      result.set(normalizedSkillKey(skillName), metadata);
      const folderName = skillFolderName(item.skillPath);
      if (folderName) result.set(normalizedSkillKey(folderName), metadata);
    }
    return result;
  }
}

export function normalizedPackageId(value: string): string {
  let id = value.trim().toLowerCase();
  if (id.startsWith("git@github.com:")) {
    id = id.replace("git@github.com:", "https://github.com/");
  }
  if (id.endsWith(".git")) id = id.slice(0, -4);
  while (id.endsWith("/")) id = id.slice(0, -1);
  return id;
}

export function normalizedSkillKey(value: string): string {
  return value.trim().toLowerCase();
}

function metadataFor(item: SkillLockSkill): SkillPackageMetadata | null {
  const source = trimmed(item.source);
  const sourceUrl = trimmed(item.sourceUrl);
  const pluginName = trimmed(item.pluginName);
  const identity = sourceUrl ?? source ?? pluginName;
  if (!identity) return null;

  return {
    id: normalizedPackageId(identity),
    source: source ?? sourceUrl ?? pluginName ?? identity,
    sourceType: trimmed(item.sourceType),
    sourceUrl,
    skillPath: trimmed(item.skillPath),
    pluginName,
    installedAt: parseDate(item.installedAt),
    updatedAt: parseDate(item.updatedAt),
    isInferred: false
  };
}

function trimmed(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function skillFolderName(skillPath: string | null | undefined): string | null {
  const value = trimmed(skillPath);
  if (!value) return null;
  const components = value.split("/").filter(Boolean);
  if (components.length === 0) return null;
  const last = components.at(-1);
  if (last === "SKILL.md") return components.at(-2) ?? null;
  return components.at(-2) ?? last ?? null;
}

function parseDate(value: string | null | undefined): string | null {
  const raw = trimmed(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
