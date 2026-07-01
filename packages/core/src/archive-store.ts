import fs from "node:fs";
import path from "node:path";

import { hashPath, pathExists, readJson, safePathComponent, writeJsonAtomic } from "./path-utils.js";
import type { ArchivedSkill, SkillRecord } from "./types.js";

interface ArchiveFile {
  entries: ArchivedSkill[];
}

export class ArchiveError extends Error {
  readonly code: "originalMissing" | "archiveMissing" | "archiveDestinationExists" | "restoreDestinationExists";
  readonly pathValue: string;

  constructor(code: ArchiveError["code"], pathValue: string) {
    const messages: Record<ArchiveError["code"], string> = {
      originalMissing: `Skill folder is missing: ${pathValue}`,
      archiveMissing: `Archive folder is missing: ${pathValue}`,
      archiveDestinationExists: `Archive destination already exists: ${pathValue}`,
      restoreDestinationExists: `Restore destination already exists: ${pathValue}`
    };
    super(messages[code]);
    this.name = "ArchiveError";
    this.code = code;
    this.pathValue = pathValue;
  }
}

export class ArchiveStore {
  readonly archiveRoot: string;
  readonly ledgerPath: string;

  constructor(userDataDir: string) {
    this.archiveRoot = path.join(userDataDir, "Archive");
    this.ledgerPath = path.join(userDataDir, "archive-ledger.json");
  }

  async archivedSkills(): Promise<ArchivedSkill[]> {
    const file = await readJson<ArchiveFile>(this.ledgerPath, { entries: [] });
    return file.entries
      .filter((entry) => entry.operationStatus === "archived")
      .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  }

  async allLedgerEntries(): Promise<ArchivedSkill[]> {
    const file = await readJson<ArchiveFile>(this.ledgerPath, { entries: [] });
    return file.entries;
  }

  async archive(skill: SkillRecord, now = new Date()): Promise<ArchivedSkill> {
    if (!(await pathExists(skill.path))) {
      throw new ArchiveError("originalMissing", skill.path);
    }

    await fs.promises.mkdir(this.archiveRoot, { recursive: true });
    const archiveId = `${fileDateString(now)}-${safePathComponent(skill.name)}`;
    const agentFolder = path.join(this.archiveRoot, safePathComponent(skill.agent));
    await fs.promises.mkdir(agentFolder, { recursive: true });
    const destination = path.join(agentFolder, archiveId);
    if (await pathExists(destination)) {
      throw new ArchiveError("archiveDestinationExists", destination);
    }

    const contentHashBefore = await hashPath(skill.path);
    const entry: ArchivedSkill = {
      id: archiveId,
      skillId: skill.id,
      name: skill.name,
      title: skill.title,
      originalPath: skill.path,
      archivePath: destination,
      archivedAt: now.toISOString(),
      restoredAt: null,
      agent: skill.agent,
      sizeBytes: skill.sizeBytes,
      operationStatus: "archived",
      failureReason: null,
      contentHashBefore,
      contentHashAfter: null
    };

    const entries = await this.allLedgerEntries();
    entries.push(entry);
    await saveLedger(this.ledgerPath, entries);
    try {
      await fs.promises.rename(skill.path, destination);
      entry.contentHashAfter = await hashPath(destination);
      await saveLedger(this.ledgerPath, replaceEntry(entries, entry));
      return entry;
    } catch (error) {
      entry.operationStatus = "failed";
      entry.failureReason = error instanceof Error ? error.message : String(error);
      await saveLedger(this.ledgerPath, replaceEntry(entries, entry));
      throw error;
    }
  }

  async restore(archived: ArchivedSkill, now = new Date()): Promise<ArchivedSkill> {
    if (!(await pathExists(archived.archivePath))) {
      throw new ArchiveError("archiveMissing", archived.archivePath);
    }
    if (await pathExists(archived.originalPath)) {
      throw new ArchiveError("restoreDestinationExists", archived.originalPath);
    }

    await fs.promises.mkdir(path.dirname(archived.originalPath), { recursive: true });
    await fs.promises.rename(archived.archivePath, archived.originalPath);
    const restored: ArchivedSkill = {
      ...archived,
      restoredAt: now.toISOString(),
      operationStatus: "restored",
      failureReason: null,
      contentHashAfter: await hashPath(archived.originalPath)
    };
    const entries = await this.allLedgerEntries();
    await saveLedger(this.ledgerPath, replaceEntry(entries, restored));
    return restored;
  }
}

async function saveLedger(filePath: string, entries: ArchivedSkill[]): Promise<void> {
  await writeJsonAtomic(filePath, { entries });
}

function replaceEntry(entries: ArchivedSkill[], entry: ArchivedSkill): ArchivedSkill[] {
  const next = entries.filter((item) => item.id !== entry.id);
  next.push(entry);
  return next;
}

function fileDateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
