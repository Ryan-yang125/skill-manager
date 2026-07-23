import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { hashPath, pathExists, readJson, safePathComponent, writeJsonAtomic } from "./path-utils.js";
import type { ArchivedSkill, SkillRecord } from "./types.js";

interface ArchiveFile {
  entries: ArchivedSkill[];
}

export class ArchiveError extends Error {
  readonly code: "originalMissing" | "archiveMissing" | "archiveDestinationExists" | "restoreDestinationExists" | "contentHashMismatch";
  readonly pathValue: string;

  constructor(code: ArchiveError["code"], pathValue: string) {
    const messages: Record<ArchiveError["code"], string> = {
      originalMissing: `Skill folder is missing: ${pathValue}`,
      archiveMissing: `Archive folder is missing: ${pathValue}`,
      archiveDestinationExists: `Archive destination already exists: ${pathValue}`,
      restoreDestinationExists: `Restore destination already exists: ${pathValue}`,
      contentHashMismatch: `Archived Skill content hash does not match the ledger: ${pathValue}`
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
    const visible = await Promise.all(
      file.entries.map(async (entry) => ({ entry, visible: await isVisibleArchivedEntry(entry) }))
    );
    return visible
      .filter((item) => item.visible)
      .map((item) => item.entry)
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
    const agentFolder = path.join(this.archiveRoot, safePathComponent(skill.agent));
    await fs.promises.mkdir(agentFolder, { recursive: true });
    const entries = await this.allLedgerEntries();
    const { archiveId, destination } = await availableArchiveDestination(skill, now, agentFolder, entries);

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
      operationStatus: "archiving",
      failureReason: null,
      contentHashBefore,
      contentHashAfter: null
    };

    entries.push(entry);
    await saveLedger(this.ledgerPath, entries);
    try {
      await fs.promises.rename(skill.path, destination);
      entry.contentHashAfter = await hashPath(destination);
      entry.operationStatus = "archived";
      await saveLedger(this.ledgerPath, replaceEntry(entries, entry));
      return entry;
    } catch (error) {
      const archiveExists = await pathExists(destination);
      const originalExists = await pathExists(skill.path);
      entry.operationStatus = archiveExists && !originalExists ? "archiving" : "failed";
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
    const archivedContentHash = await hashPath(archived.archivePath);
    const expectedContentHash = archived.contentHashAfter ?? archived.contentHashBefore;
    if (expectedContentHash && archivedContentHash !== expectedContentHash) {
      throw new ArchiveError("contentHashMismatch", archived.archivePath);
    }

    await fs.promises.mkdir(path.dirname(archived.originalPath), { recursive: true });
    const entries = await this.allLedgerEntries();
    const restoring: ArchivedSkill = {
      ...archived,
      operationStatus: "restoring",
      failureReason: null
    };
    await saveLedger(this.ledgerPath, replaceEntry(entries, restoring));
    try {
      await fs.promises.rename(archived.archivePath, archived.originalPath);
      const restored: ArchivedSkill = {
        ...restoring,
        restoredAt: now.toISOString(),
        operationStatus: "restored",
        failureReason: null,
        contentHashAfter: await hashPath(archived.originalPath)
      };
      await saveLedger(this.ledgerPath, replaceEntry(entries, restored));
      return restored;
    } catch (error) {
      const archiveExists = await pathExists(archived.archivePath);
      const originalExists = await pathExists(archived.originalPath);
      const recoverable: ArchivedSkill = {
        ...restoring,
        operationStatus: archiveExists && !originalExists ? "archived" : "restoring",
        failureReason: error instanceof Error ? error.message : String(error)
      };
      await saveLedger(this.ledgerPath, replaceEntry(entries, recoverable));
      throw error;
    }
  }
}

async function isVisibleArchivedEntry(entry: ArchivedSkill): Promise<boolean> {
  if (entry.operationStatus === "archived") return true;
  if (entry.operationStatus !== "archiving" && entry.operationStatus !== "restoring") return false;
  const [originalExists, archiveExists] = await Promise.all([
    pathExists(entry.originalPath),
    pathExists(entry.archivePath)
  ]);
  // Reading the ledger never repairs it. Filesystem state only decides whether
  // an interrupted operation remains visible and recoverable as an archive.
  if (archiveExists) return true;
  return !originalExists;
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
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${milliseconds}`;
}

function archiveIdBase(skill: SkillRecord, now: Date): string {
  const agent = safePathComponent(skill.agent);
  const name = safePathComponent(skill.name).slice(0, 80);
  const pathHash = createHash("sha256").update(skill.path).digest("hex").slice(0, 10);
  return `${fileDateString(now)}-${agent}-${name}-${pathHash}`;
}

async function availableArchiveDestination(
  skill: SkillRecord,
  now: Date,
  agentFolder: string,
  entries: ArchivedSkill[]
): Promise<{ archiveId: string; destination: string }> {
  const base = archiveIdBase(skill, now);
  for (let sequence = 1; sequence <= entries.length + 2; sequence += 1) {
    const archiveId = sequence === 1 ? base : `${base}-${sequence}`;
    const destination = path.join(agentFolder, archiveId);
    const ledgerCollision = entries.some((entry) => entry.id === archiveId);
    const destinationExists = await pathExists(destination);
    if (destinationExists && !ledgerCollision) {
      throw new ArchiveError("archiveDestinationExists", destination);
    }
    if (!ledgerCollision && !destinationExists) return { archiveId, destination };
  }
  throw new ArchiveError("archiveDestinationExists", path.join(agentFolder, base));
}
