import fs from "node:fs";
import path from "node:path";

import { directorySize, isoFromDate, pathExists, stableId, sortByName, blockedDirectoryNames } from "./path-utils.js";
import { SkillPackageStore, normalizedSkillKey } from "./package-store.js";
import { parseSkillMarkdown } from "./skill-parser.js";
import type { RootAudit, SkillAgent, SkillPackageMetadata, SkillRecord, SkillRecommendation, SkillRoot, UsageHit } from "./types.js";

export interface SkillScannerOptions {
  homeDir: string;
  packageStore?: SkillPackageStore;
}

export class SkillScanner {
  readonly homeDir: string;
  readonly packageStore: SkillPackageStore;

  constructor(options: SkillScannerOptions) {
    this.homeDir = options.homeDir;
    this.packageStore = options.packageStore ?? new SkillPackageStore(this.homeDir);
  }

  defaultRoots(): SkillRoot[] {
    const roots: SkillRoot[] = [
      { path: path.join(this.homeDir, ".agents", "skills"), agent: "agents", scope: "user" },
      { path: path.join(this.homeDir, ".codex", "skills"), agent: "codex", scope: "user" },
      { path: path.join(this.homeDir, ".claude", "skills"), agent: "claude", scope: "user" }
    ];
    return roots.sort((a, b) => a.path.localeCompare(b.path));
  }

  async scan(roots: SkillRoot[], usage: Map<string, UsageHit>, now = new Date()): Promise<SkillRecord[]> {
    const packages = await this.packageStore.metadataBySkillName();
    const records = (await Promise.all(roots.map((root) => this.scanRoot(root, usage, packages, now)))).flat();
    const byPath = new Map<string, SkillRecord>();
    for (const record of records) {
      if (!byPath.has(record.path)) byPath.set(record.path, record);
    }
    return sortByName([...byPath.values()]);
  }

  async auditRoots(roots: SkillRoot[], skills: SkillRecord[]): Promise<RootAudit[]> {
    return Promise.all(
      roots.map(async (root) => ({
        path: root.path,
        agent: root.agent,
        exists: await pathExists(root.path),
        skillCount: skills.filter((skill) => skill.rootPath === root.path).length
      }))
    );
  }

  private async scanRoot(
    root: SkillRoot,
    usage: Map<string, UsageHit>,
    packages: Map<string, SkillPackageMetadata>,
    now: Date
  ): Promise<SkillRecord[]> {
    const children = await fs.promises.readdir(root.path, { withFileTypes: true }).catch(() => []);
    const records = await Promise.all(
      children.map(async (child) => {
        if (!child.isDirectory() || shouldSkipSkillFolder(child.name)) return null;
        const folderPath = path.join(root.path, child.name);
        const skillFilePath = await findSkillMarkdown(folderPath);
        if (!skillFilePath) return null;
        const parsed = await parseSkillMarkdown(skillFilePath);
        if (!parsed) return null;

        const stat = await fs.promises.stat(skillFilePath).catch(() => null);
        const sizeBytes = await directorySize(folderPath);
        const hit = usage.get(stableId(folderPath)) ?? usage.get(parsed.name) ?? usage.get(child.name) ?? { count: 0, lastUsedAt: null, evidence: [] };
        const relativePath = path.relative(root.path, folderPath);
        const packageMetadata = packageMetadataFor(parsed.name, folderPath, packages);
        const recommendation = recommendationForSkill(hit, parsed.contextTokens, now);
        const record: SkillRecord = {
          id: stableId(folderPath),
          name: parsed.name,
          title: parsed.title,
          summary: parsed.summary,
          agent: root.agent === "agents" ? inferAgent(folderPath, root.agent) : root.agent,
          scope: root.scope,
          path: folderPath,
          rootPath: root.path,
          relativePath,
          skillFilePath,
          content: parsed.content,
          sizeBytes,
          contextTokens: parsed.contextTokens,
          lastUsedAt: hit.lastUsedAt,
          usageCount: hit.count,
          usageEvidence: hit.evidence,
          package: packageMetadata,
          recommendation,
          isArchived: false,
          locations: [{ rootKind: root.agent, path: folderPath, rootPath: root.path, relativePath }],
          status: {
            protected: false,
            reviewLater: false,
            archived: false,
            archiveReason: null,
            archivedAt: null,
            archivePath: null
          },
          updatedAt: isoFromDate(stat?.mtime),
          scanWarnings: []
        };
        return record;
      })
    );
    return records.filter((record): record is SkillRecord => record !== null);
  }
}

function recommendationForSkill(hit: UsageHit, tokenEstimate: number, now: Date): SkillRecommendation {
  // An empty local evidence set cannot establish that a skill is unused. The
  // session history may be missing, truncated, stored by another agent, or
  // outside the analyzer's scan window, so zero evidence always needs review.
  if (hit.count === 0 || !hit.lastUsedAt) return "review";
  if (!hasReliableLastUsedEvidence(hit)) return "review";
  const lastUsedTime = new Date(hit.lastUsedAt).getTime();
  if (Number.isNaN(lastUsedTime)) return "review";
  const days = (now.getTime() - lastUsedTime) / 86_400_000;
  if (days >= 90) return "archive";
  if (days >= 30 || tokenEstimate >= 2000) return "review";
  return "keep";
}

export function hasReliableLastUsedEvidence(hit: Pick<UsageHit, "count" | "lastUsedAt" | "evidence">): boolean {
  if (hit.count <= 0 || !hit.lastUsedAt) return false;
  if (hit.evidence.length === 0) return false;
  if (hit.evidence.some((evidence) => evidence.timestampSource !== "event" || !evidence.occurredAt)) return false;
  return hit.evidence.some(
    (evidence) => evidence.timestampSource === "event" && evidence.occurredAt === hit.lastUsedAt
  );
}

async function findSkillMarkdown(folderPath: string): Promise<string | null> {
  const direct = path.join(folderPath, "SKILL.md");
  if (await pathExists(direct)) return direct;
  return findSkillMarkdownRecursive(folderPath);
}

async function findSkillMarkdownRecursive(folderPath: string): Promise<string | null> {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".") || blockedDirectoryNames.has(entry.name)) continue;
    const childPath = path.join(folderPath, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") return childPath;
    if (entry.isDirectory()) {
      const found = await findSkillMarkdownRecursive(childPath);
      if (found) return found;
    }
  }
  return null;
}

function shouldSkipSkillFolder(name: string): boolean {
  return name.startsWith(".") || blockedDirectoryNames.has(name);
}

function inferAgent(folderPath: string, fallback: SkillAgent): SkillAgent {
  if (folderPath.includes(`${path.sep}.codex${path.sep}`)) return "codex";
  if (folderPath.includes(`${path.sep}.claude${path.sep}`)) return "claude";
  return fallback;
}

function packageMetadataFor(skillName: string, folderPath: string, packages: Map<string, SkillPackageMetadata>): SkillPackageMetadata | null {
  const keys = [skillName, path.basename(folderPath)].map(normalizedSkillKey);
  for (const key of keys) {
    const metadata = packages.get(key);
    if (metadata) return metadata;
  }
  return null;
}
