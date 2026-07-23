#!/usr/bin/env node

// src/cli.ts
import fs8 from "node:fs";
import os2 from "node:os";
import path10 from "node:path";

// ../core/dist/archive-store.js
import { createHash as createHash2 } from "node:crypto";
import fs2 from "node:fs";
import path2 from "node:path";

// ../core/dist/path-utils.js
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function defaultHomeDir() {
  return os.homedir();
}
function expandHome(inputPath, homeDir = defaultHomeDir()) {
  if (inputPath === "~")
    return homeDir;
  if (inputPath.startsWith("~/"))
    return path.join(homeDir, inputPath.slice(2));
  return inputPath;
}
function stableId(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}
function safePathComponent(value) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^\.+/, "").replace(/^-+|-+$/g, "");
  return cleaned || "skill";
}
async function pathExists(inputPath) {
  try {
    await fs.promises.access(inputPath);
    return true;
  } catch {
    return false;
  }
}
async function readJson(filePath, fallback) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJsonAtomic(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, `${JSON.stringify(value, null, 2)}
`);
  await fs.promises.rename(tempPath, filePath);
}
async function directorySize(dirPath, blocked = blockedDirectoryNames) {
  let total = 0;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".") || blocked.has(entry.name))
      continue;
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(childPath, blocked);
    } else if (entry.isFile()) {
      const stat = await fs.promises.stat(childPath).catch(() => null);
      total += stat?.size ?? 0;
    }
  }
  return total;
}
async function hashPath(inputPath) {
  try {
    const hash = createHash("sha256");
    await hashEntry(inputPath, ".", hash);
    return hash.digest("hex");
  } catch {
    return null;
  }
}
async function hashEntry(absolutePath, relativePath, hash) {
  const stat = await fs.promises.lstat(absolutePath);
  const portablePath = relativePath.split(path.sep).join("/");
  if (stat.isSymbolicLink()) {
    hash.update(`link\0${portablePath}\0${await fs.promises.readlink(absolutePath)}\0`);
    return;
  }
  if (stat.isDirectory()) {
    hash.update(`directory\0${portablePath}\0`);
    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      await hashEntry(path.join(absolutePath, entry.name), path.join(relativePath, entry.name), hash);
    }
    return;
  }
  if (stat.isFile()) {
    hash.update(`file\0${portablePath}\0${stat.size}\0`);
    for await (const chunk of fs.createReadStream(absolutePath))
      hash.update(chunk);
    hash.update("\0");
    return;
  }
  hash.update(`other\0${portablePath}\0`);
}
var blockedDirectoryNames = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".build",
  "build",
  "dist",
  "DerivedData",
  ".Trash",
  "Library"
]);
function isSearchableLog(filePath) {
  return [".jsonl", ".json", ".log", ".txt", ".md"].includes(path.extname(filePath).toLowerCase());
}
function isoFromDate(value) {
  if (value == null)
    return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    return null;
  return date.toISOString();
}
function sortByName(items) {
  return [...items].sort((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name, void 0, { sensitivity: "base" }));
}

// ../core/dist/archive-store.js
var ArchiveError = class extends Error {
  code;
  pathValue;
  constructor(code, pathValue) {
    const messages = {
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
};
var ArchiveStore = class {
  archiveRoot;
  ledgerPath;
  constructor(userDataDir) {
    this.archiveRoot = path2.join(userDataDir, "Archive");
    this.ledgerPath = path2.join(userDataDir, "archive-ledger.json");
  }
  async archivedSkills() {
    const file = await readJson(this.ledgerPath, { entries: [] });
    const visible = await Promise.all(file.entries.map(async (entry) => ({ entry, visible: await isVisibleArchivedEntry(entry) })));
    return visible.filter((item) => item.visible).map((item) => item.entry).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  }
  async allLedgerEntries() {
    const file = await readJson(this.ledgerPath, { entries: [] });
    return file.entries;
  }
  async archive(skill, now = /* @__PURE__ */ new Date()) {
    if (!await pathExists(skill.path)) {
      throw new ArchiveError("originalMissing", skill.path);
    }
    await fs2.promises.mkdir(this.archiveRoot, { recursive: true });
    const agentFolder = path2.join(this.archiveRoot, safePathComponent(skill.agent));
    await fs2.promises.mkdir(agentFolder, { recursive: true });
    const entries = await this.allLedgerEntries();
    const { archiveId, destination } = await availableArchiveDestination(skill, now, agentFolder, entries);
    const contentHashBefore = await hashPath(skill.path);
    const entry = {
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
      await fs2.promises.rename(skill.path, destination);
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
  async restore(archived, now = /* @__PURE__ */ new Date()) {
    if (!await pathExists(archived.archivePath)) {
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
    await fs2.promises.mkdir(path2.dirname(archived.originalPath), { recursive: true });
    const entries = await this.allLedgerEntries();
    const restoring = {
      ...archived,
      operationStatus: "restoring",
      failureReason: null
    };
    await saveLedger(this.ledgerPath, replaceEntry(entries, restoring));
    try {
      await fs2.promises.rename(archived.archivePath, archived.originalPath);
      const restored = {
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
      const recoverable = {
        ...restoring,
        operationStatus: archiveExists && !originalExists ? "archived" : "restoring",
        failureReason: error instanceof Error ? error.message : String(error)
      };
      await saveLedger(this.ledgerPath, replaceEntry(entries, recoverable));
      throw error;
    }
  }
};
async function isVisibleArchivedEntry(entry) {
  if (entry.operationStatus === "archived")
    return true;
  if (entry.operationStatus !== "archiving" && entry.operationStatus !== "restoring")
    return false;
  const [originalExists, archiveExists] = await Promise.all([
    pathExists(entry.originalPath),
    pathExists(entry.archivePath)
  ]);
  if (archiveExists)
    return true;
  return !originalExists;
}
async function saveLedger(filePath, entries) {
  await writeJsonAtomic(filePath, { entries });
}
function replaceEntry(entries, entry) {
  const next = entries.filter((item) => item.id !== entry.id);
  next.push(entry);
  return next;
}
function fileDateString(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${milliseconds}`;
}
function archiveIdBase(skill, now) {
  const agent = safePathComponent(skill.agent);
  const name = safePathComponent(skill.name).slice(0, 80);
  const pathHash = createHash2("sha256").update(skill.path).digest("hex").slice(0, 10);
  return `${fileDateString(now)}-${agent}-${name}-${pathHash}`;
}
async function availableArchiveDestination(skill, now, agentFolder, entries) {
  const base = archiveIdBase(skill, now);
  for (let sequence = 1; sequence <= entries.length + 2; sequence += 1) {
    const archiveId = sequence === 1 ? base : `${base}-${sequence}`;
    const destination = path2.join(agentFolder, archiveId);
    const ledgerCollision = entries.some((entry) => entry.id === archiveId);
    const destinationExists = await pathExists(destination);
    if (destinationExists && !ledgerCollision) {
      throw new ArchiveError("archiveDestinationExists", destination);
    }
    if (!ledgerCollision && !destinationExists)
      return { archiveId, destination };
  }
  throw new ArchiveError("archiveDestinationExists", path2.join(agentFolder, base));
}

// ../core/dist/decision-store.js
import path3 from "node:path";
var SkillDecisionStore = class {
  filePath;
  constructor(userDataDir) {
    this.filePath = path3.join(userDataDir, "decisions.json");
  }
  async all() {
    const file = await readJson(this.filePath, { decisions: [] });
    return new Map(file.decisions.map((decision) => [decision.skillId, decision]));
  }
  async set(skillId, decision, now = /* @__PURE__ */ new Date()) {
    const decisions = await this.all();
    if (decision) {
      decisions.set(skillId, { skillId, decision, updatedAt: now.toISOString() });
    } else {
      decisions.delete(skillId);
    }
    await writeJsonAtomic(this.filePath, { decisions: [...decisions.values()] });
    return decisions;
  }
};

// ../core/dist/formatting.js
function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
function formatTokens(tokens) {
  if (tokens >= 1e3)
    return `${(tokens / 1e3).toFixed(tokens >= 1e4 ? 0 : 1)}k`;
  return `${tokens}`;
}
function relativeDate(value, now = /* @__PURE__ */ new Date()) {
  if (!value)
    return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return "Unknown";
  const days = Math.floor(Math.max(0, now.getTime() - date.getTime()) / 864e5);
  if (days === 0)
    return "Today";
  if (days === 1)
    return "Yesterday";
  if (days < 30)
    return `${days}d`;
  if (days < 365)
    return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
function evidenceKindLabel(kind) {
  switch (kind) {
    case "codexSkillRead":
      return "Codex read SKILL.md";
    case "codexDirectLoad":
      return "Codex loadSkill";
    case "claudeSkillTool":
      return "Claude Skill tool";
    default:
      return "No evidence";
  }
}

// ../core/dist/inventory-service.js
import path9 from "node:path";

// ../core/dist/report-store.js
import fs6 from "node:fs";
import path7 from "node:path";

// ../core/dist/scanner.js
import fs5 from "node:fs";
import path6 from "node:path";

// ../core/dist/package-store.js
import fs3 from "node:fs";
import path4 from "node:path";
var SkillPackageStore = class {
  homeDir;
  constructor(homeDir) {
    this.homeDir = homeDir;
  }
  get lockFilePath() {
    return path4.join(this.homeDir, ".agents", ".skill-lock.json");
  }
  async metadataBySkillName() {
    let parsed;
    try {
      parsed = JSON.parse(await fs3.promises.readFile(this.lockFilePath, "utf8"));
    } catch {
      return /* @__PURE__ */ new Map();
    }
    const result = /* @__PURE__ */ new Map();
    for (const [skillName, item] of Object.entries(parsed.skills ?? {})) {
      const metadata = metadataFor(item);
      if (!metadata)
        continue;
      result.set(normalizedSkillKey(skillName), metadata);
      const folderName = skillFolderName(item.skillPath);
      if (folderName)
        result.set(normalizedSkillKey(folderName), metadata);
    }
    return result;
  }
};
function normalizedPackageId(value) {
  let id = value.trim().toLowerCase();
  if (id.startsWith("git@github.com:")) {
    id = id.replace("git@github.com:", "https://github.com/");
  }
  if (id.endsWith(".git"))
    id = id.slice(0, -4);
  while (id.endsWith("/"))
    id = id.slice(0, -1);
  return id;
}
function normalizedSkillKey(value) {
  return value.trim().toLowerCase();
}
function metadataFor(item) {
  const source = trimmed(item.source);
  const sourceUrl = trimmed(item.sourceUrl);
  const pluginName = trimmed(item.pluginName);
  const identity = sourceUrl ?? source ?? pluginName;
  if (!identity)
    return null;
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
function trimmed(value) {
  const result = value?.trim();
  return result ? result : null;
}
function skillFolderName(skillPath) {
  const value = trimmed(skillPath);
  if (!value)
    return null;
  const components = value.split("/").filter(Boolean);
  if (components.length === 0)
    return null;
  const last = components.at(-1);
  if (last === "SKILL.md")
    return components.at(-2) ?? null;
  return components.at(-2) ?? last ?? null;
}
function parseDate(value) {
  const raw = trimmed(value);
  if (!raw)
    return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()))
    return null;
  return date.toISOString();
}

// ../core/dist/skill-parser.js
import fs4 from "node:fs";
import path5 from "node:path";
async function parseSkillMarkdown(skillMarkdownPath) {
  let raw;
  try {
    raw = await fs4.promises.readFile(skillMarkdownPath, "utf8");
  } catch {
    return null;
  }
  const folderName = path5.basename(path5.dirname(skillMarkdownPath));
  const frontmatter = extractFrontmatter(raw);
  const name = nonEmpty(frontmatter.name) ?? folderName;
  const summary = nonEmpty(frontmatter.description) ?? firstMeaningfulParagraph(raw) ?? "Local skill";
  const heading = raw.split(/\r?\n/).find((line) => line.startsWith("# "))?.slice(2).trim();
  return {
    name,
    title: nonEmpty(heading) ?? name,
    summary,
    contextTokens: estimateTokens(`${name}
${summary}`),
    content: raw
  };
}
function estimateTokens(text) {
  const scalarCount = [...text].length;
  const wordCount = text.split(/[\s\p{Punctuation}]+/u).filter(Boolean).length;
  const cjkCount = [...text].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 19968 && code <= 40959;
  }).length;
  const latinEstimate = Math.max(wordCount, Math.floor(scalarCount / 5));
  return Math.max(1, latinEstimate + Math.floor(cjkCount / 2));
}
function extractFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---")
    return {};
  const result = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "---")
      break;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match)
      continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (value === ">" || value === "|") {
      const blockLines = [];
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
function firstMeaningfulParagraph(raw) {
  for (const paragraph of raw.split(/\n\s*\n/)) {
    const trimmed2 = paragraph.trim();
    if (!trimmed2)
      continue;
    if (trimmed2.startsWith("---"))
      continue;
    if (trimmed2.startsWith("#"))
      continue;
    if (trimmed2.length <= 16)
      continue;
    return trimmed2;
  }
  return null;
}
function nonEmpty(value) {
  const trimmed2 = value?.trim();
  return trimmed2 ? trimmed2 : null;
}

// ../core/dist/scanner.js
var SkillScanner = class {
  homeDir;
  packageStore;
  constructor(options) {
    this.homeDir = options.homeDir;
    this.packageStore = options.packageStore ?? new SkillPackageStore(this.homeDir);
  }
  defaultRoots() {
    const roots = [
      { path: path6.join(this.homeDir, ".agents", "skills"), agent: "agents", scope: "user" },
      { path: path6.join(this.homeDir, ".codex", "skills"), agent: "codex", scope: "user" },
      { path: path6.join(this.homeDir, ".claude", "skills"), agent: "claude", scope: "user" }
    ];
    return roots.sort((a, b) => a.path.localeCompare(b.path));
  }
  async scan(roots, usage, now = /* @__PURE__ */ new Date()) {
    const packages = await this.packageStore.metadataBySkillName();
    const records = (await Promise.all(roots.map((root) => this.scanRoot(root, usage, packages, now)))).flat();
    const byPath = /* @__PURE__ */ new Map();
    for (const record of records) {
      if (!byPath.has(record.path))
        byPath.set(record.path, record);
    }
    return sortByName([...byPath.values()]);
  }
  async auditRoots(roots, skills) {
    return Promise.all(roots.map(async (root) => ({
      path: root.path,
      agent: root.agent,
      exists: await pathExists(root.path),
      skillCount: skills.filter((skill) => skill.rootPath === root.path).length
    })));
  }
  async scanRoot(root, usage, packages, now) {
    const children = await fs5.promises.readdir(root.path, { withFileTypes: true }).catch(() => []);
    const records = await Promise.all(children.map(async (child) => {
      if (!child.isDirectory() || shouldSkipSkillFolder(child.name))
        return null;
      const folderPath = path6.join(root.path, child.name);
      const skillFilePath = await findSkillMarkdown(folderPath);
      if (!skillFilePath)
        return null;
      const parsed = await parseSkillMarkdown(skillFilePath);
      if (!parsed)
        return null;
      const stat = await fs5.promises.stat(skillFilePath).catch(() => null);
      const sizeBytes = await directorySize(folderPath);
      const hit = usage.get(stableId(folderPath)) ?? usage.get(parsed.name) ?? usage.get(child.name) ?? { count: 0, lastUsedAt: null, evidence: [] };
      const relativePath = path6.relative(root.path, folderPath);
      const packageMetadata = packageMetadataFor(parsed.name, folderPath, packages);
      const recommendation = recommendationForSkill(hit, parsed.contextTokens, now);
      const record = {
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
    }));
    return records.filter((record) => record !== null);
  }
};
function recommendationForSkill(hit, tokenEstimate, now) {
  if (hit.count === 0 || !hit.lastUsedAt)
    return "review";
  if (!hasReliableLastUsedEvidence(hit))
    return "review";
  const lastUsedTime = new Date(hit.lastUsedAt).getTime();
  if (Number.isNaN(lastUsedTime))
    return "review";
  const days = (now.getTime() - lastUsedTime) / 864e5;
  if (days >= 90)
    return "archive";
  if (days >= 30 || tokenEstimate >= 2e3)
    return "review";
  return "keep";
}
function hasReliableLastUsedEvidence(hit) {
  if (hit.count <= 0 || !hit.lastUsedAt)
    return false;
  if (hit.evidence.length === 0)
    return false;
  if (hit.evidence.some((evidence) => evidence.timestampSource !== "event" || !evidence.occurredAt))
    return false;
  return hit.evidence.some((evidence) => evidence.timestampSource === "event" && evidence.occurredAt === hit.lastUsedAt);
}
async function findSkillMarkdown(folderPath) {
  const direct = path6.join(folderPath, "SKILL.md");
  if (await pathExists(direct))
    return direct;
  return findSkillMarkdownRecursive(folderPath);
}
async function findSkillMarkdownRecursive(folderPath) {
  const entries = await fs5.promises.readdir(folderPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".") || blockedDirectoryNames.has(entry.name))
      continue;
    const childPath = path6.join(folderPath, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md")
      return childPath;
    if (entry.isDirectory()) {
      const found = await findSkillMarkdownRecursive(childPath);
      if (found)
        return found;
    }
  }
  return null;
}
function shouldSkipSkillFolder(name) {
  return name.startsWith(".") || blockedDirectoryNames.has(name);
}
function inferAgent(folderPath, fallback) {
  if (folderPath.includes(`${path6.sep}.codex${path6.sep}`))
    return "codex";
  if (folderPath.includes(`${path6.sep}.claude${path6.sep}`))
    return "claude";
  return fallback;
}
function packageMetadataFor(skillName, folderPath, packages) {
  const keys = [skillName, path6.basename(folderPath)].map(normalizedSkillKey);
  for (const key of keys) {
    const metadata = packages.get(key);
    if (metadata)
      return metadata;
  }
  return null;
}

// ../core/dist/report-store.js
var CleanupReportStore = class {
  reportsRoot;
  constructor(userDataDir) {
    this.reportsRoot = path7.join(userDataDir, "cleanup-reports");
  }
  async export(inventory, skills, decisions, now = /* @__PURE__ */ new Date()) {
    await fs6.promises.mkdir(this.reportsRoot, { recursive: true });
    const report = cleanupPlanReport(inventory, skills, decisions, now);
    const basename = `cleanup-${fileDateString2(now)}`;
    const jsonPath = path7.join(this.reportsRoot, `${basename}.json`);
    const markdownPath = path7.join(this.reportsRoot, `${basename}.md`);
    await fs6.promises.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}
`);
    await fs6.promises.writeFile(markdownPath, markdownForReport(report));
    return { markdownPath, jsonPath };
  }
};
function cleanupPlanReport(inventory, skills, decisions, now = /* @__PURE__ */ new Date()) {
  const archiveEligibleSkills = skills.filter((skill) => skill.recommendation === "archive" && hasReliableLastUsedEvidence({
    count: skill.usageCount,
    lastUsedAt: skill.lastUsedAt,
    evidence: skill.usageEvidence
  }));
  const protectedExcludedCount = inventory.active.filter((skill) => skill.recommendation === "archive" && decisions.get(skill.id)?.decision === "protected").length;
  const reviewExcludedCount = inventory.active.filter((skill) => skill.recommendation === "archive" && decisions.get(skill.id)?.decision === "review").length;
  return {
    generatedAt: now.toISOString(),
    selectedCount: archiveEligibleSkills.length,
    selectedContextTokens: archiveEligibleSkills.reduce((sum, skill) => sum + skill.contextTokens, 0),
    selectedBytes: archiveEligibleSkills.reduce((sum, skill) => sum + skill.sizeBytes, 0),
    installedCount: inventory.active.length,
    archivedCount: inventory.archived.length,
    protectedExcludedCount,
    reviewExcludedCount,
    skills: archiveEligibleSkills.map((skill) => cleanupSnapshot(skill, decisions.get(skill.id), now))
  };
}
function markdownForReport(report) {
  const lines = [];
  lines.push("# Skill Manager Cleanup Plan");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Selected skills: ${report.selectedCount}`);
  lines.push(`- Context to archive: ${formatTokens(report.selectedContextTokens)} tokens`);
  lines.push(`- Disk size to archive: ${formatBytes(report.selectedBytes)}`);
  lines.push(`- Installed skills before cleanup: ${report.installedCount}`);
  lines.push(`- Archived skills before cleanup: ${report.archivedCount}`);
  lines.push(`- Protected skills excluded: ${report.protectedExcludedCount}`);
  lines.push(`- Review skills excluded: ${report.reviewExcludedCount}`);
  lines.push("");
  lines.push("| Skill | Package | Agent | Reason | Evidence | Last used | Uses | Context | Path |");
  lines.push("| --- | --- | --- | --- | ---: | --- | ---: | ---: | --- |");
  for (const skill of report.skills) {
    const evidenceSummary2 = `${evidenceKindLabel(skill.latestEvidenceKind)} \xB7 ${skill.evidenceCount}`;
    lines.push(`| ${escapeCell(skill.title)} | ${escapeCell(skill.packageSource ?? "Manual")} | ${escapeCell(skill.agent)} | ${escapeCell(skill.recommendationReason)} | ${escapeCell(evidenceSummary2)} | ${escapeCell(relativeDate(skill.lastUsedAt, new Date(report.generatedAt)))} | ${skill.usageCount} | ${skill.contextTokens} | \`${escapeCell(skill.path)}\` |`);
  }
  lines.push("");
  lines.push("Archive is recoverable from the Skill Manager archive ledger.");
  return `${lines.join("\n")}
`;
}
function cleanupSnapshot(skill, decision, now) {
  return {
    id: skill.id,
    name: skill.name,
    title: skill.title,
    agent: skill.agent,
    path: skill.path,
    lastUsedAt: skill.lastUsedAt,
    usageCount: skill.usageCount,
    contextTokens: skill.contextTokens,
    sizeBytes: skill.sizeBytes,
    recommendationReason: reasonText(skill, decision, now),
    evidenceCount: skill.usageEvidence.length,
    latestEvidenceKind: skill.usageEvidence[0]?.kind ?? null,
    latestEvidencePath: skill.usageEvidence[0]?.sessionPath ?? null,
    packageId: skill.package?.id ?? null,
    packageSource: skill.package?.source ?? null,
    packageSourceUrl: skill.package?.sourceUrl ?? null,
    packageIsInferred: skill.package?.isInferred ?? false
  };
}
function reasonText(skill, decision, now) {
  if (decision?.decision === "protected")
    return "Protected locally";
  if (decision?.decision === "review")
    return "Marked for review";
  if (skill.usageCount === 0)
    return "No local usage evidence";
  if (skill.lastUsedAt) {
    const days = Math.floor((now.getTime() - new Date(skill.lastUsedAt).getTime()) / 864e5);
    if (days >= 90)
      return "Unused for 90+ days";
    if (days >= 30)
      return "Unused for 30+ days";
  }
  if (skill.contextTokens >= 2e3)
    return "High context estimate";
  return "Recent local evidence";
}
function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
function fileDateString2(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// ../core/dist/usage-analyzer.js
import fs7 from "node:fs";
import path8 from "node:path";
var UsageAnalyzer = class _UsageAnalyzer {
  static codexActiveWindowDays = 120;
  homeDir;
  maxLogBytes;
  maxLogFiles;
  ambiguousMatchesExcluded = 0;
  timestampFallbackCount = 0;
  analysisWarningsBySkill = /* @__PURE__ */ new Map();
  constructor(options) {
    this.homeDir = options.homeDir;
    this.maxLogBytes = options.maxLogBytes ?? 512 * 1024;
    this.maxLogFiles = options.maxLogFiles ?? 300;
  }
  async analyzeSkillUsage(skills) {
    this.ambiguousMatchesExcluded = 0;
    this.timestampFallbackCount = 0;
    this.analysisWarningsBySkill.clear();
    const terms = normalizedPathTerms(skills);
    if (terms.size === 0)
      return /* @__PURE__ */ new Map();
    const hits = /* @__PURE__ */ new Map();
    for (const logPath of await this.sessionLogPaths()) {
      const stat = await fs7.promises.stat(logPath).catch(() => null);
      const modifiedAt = stat?.mtime.toISOString() ?? (/* @__PURE__ */ new Date(0)).toISOString();
      const matches = await this.matchedSkillEvidence(logPath, terms, modifiedAt);
      for (const [skillId, evidence] of matches) {
        const hit = hits.get(skillId) ?? { count: 0, lastUsedAt: null, evidence: [] };
        hit.count += evidence.length;
        const latestEvidenceAt = evidence.map((item) => item.occurredAt).filter((value) => value !== null).sort((a, b) => b.localeCompare(a))[0] ?? null;
        if (latestEvidenceAt && (!hit.lastUsedAt || latestEvidenceAt > hit.lastUsedAt))
          hit.lastUsedAt = latestEvidenceAt;
        hit.evidence.push(...evidence);
        hit.evidence.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
        if (hit.evidence.length > 20)
          hit.evidence = hit.evidence.slice(0, 20);
        hits.set(skillId, hit);
      }
    }
    return hits;
  }
  analysisAudit() {
    const warnings = [...new Set([...this.analysisWarningsBySkill.values()].flat())];
    return {
      ambiguousMatchesExcluded: this.ambiguousMatchesExcluded,
      timestampFallbackCount: this.timestampFallbackCount,
      warnings
    };
  }
  warningsBySkillId() {
    return new Map([...this.analysisWarningsBySkill].map(([skillId, warnings]) => [skillId, [...warnings]]));
  }
  async sessionLogPaths() {
    return (await this.sessionLogSnapshot()).logs;
  }
  async sessionRootAudits() {
    const snapshot = await this.sessionLogSnapshot();
    return snapshot.roots.map((root) => {
      const logCount = snapshot.logs.filter((logPath) => isPathInside(logPath, root.path)).length;
      return {
        path: root.path,
        agent: root.agent,
        exists: root.exists,
        logCount,
        eligibleLogCount: root.paths.length,
        oversizedLogCount: root.oversizedCount,
        excludedByFileLimitCount: Math.max(0, root.paths.length - logCount),
        timeWindowDays: root.timeWindowDays
      };
    });
  }
  async matchedSkillEvidence(logPath, terms, modifiedAt) {
    let raw;
    try {
      raw = await fs7.promises.readFile(logPath, "utf8");
    } catch {
      return /* @__PURE__ */ new Map();
    }
    if (!raw.trim())
      return /* @__PURE__ */ new Map();
    const result = /* @__PURE__ */ new Map();
    const lines = raw.split(/\r?\n/);
    lines.forEach((line, lineIndex) => {
      if (!isPotentialUsageLine(line))
        return;
      let object;
      try {
        object = JSON.parse(line);
      } catch {
        return;
      }
      const lineMatches = /* @__PURE__ */ new Map();
      const eventOccurredAt = timestampFromEvent(object);
      const occurredAt = eventOccurredAt ?? modifiedAt;
      const timestampSource = eventOccurredAt ? "event" : "file_mtime";
      const skillToolUse = findSkillToolUse(object);
      if (skillToolUse) {
        const candidates = matchingTermsByName(skillToolUse, terms);
        if (candidates.length === 1) {
          const candidate = candidates[0];
          const isClaude = logPath.includes(`${path8.sep}.claude${path8.sep}projects${path8.sep}`);
          const kind = isClaude ? "claudeSkillTool" : "codexDirectLoad";
          lineMatches.set(candidate.skillId, usageEvidence(candidate.skillName, logPath, lineIndex, kind, isClaude ? "claude" : "codex", occurredAt, timestampSource, labelForKind(kind), skillToolUse));
        } else if (candidates.length > 1) {
          this.recordAmbiguousMatch(skillToolUse, candidates);
        }
      }
      for (const event of codexToolSearchTexts(object)) {
        if (!event.text.includes("/") && !event.text.includes("SKILL.md")) {
          const candidates2 = matchingTermsByName(event.text, terms);
          if (candidates2.length === 1) {
            const candidate = candidates2[0];
            lineMatches.set(candidate.skillId, usageEvidence(candidate.skillName, logPath, lineIndex, event.kind, event.agent, occurredAt, timestampSource, event.detail, event.text));
          } else if (candidates2.length > 1) {
            this.recordAmbiguousMatch(event.text, candidates2);
          }
          continue;
        }
        if (!event.text.includes("SKILL.md") && !event.text.includes("/skills/"))
          continue;
        const candidates = matchingTermsByPath(event.text, terms);
        for (const candidate of candidates) {
          lineMatches.set(candidate.skillId, usageEvidence(candidate.skillName, logPath, lineIndex, event.kind, event.agent, occurredAt, timestampSource, event.detail, event.text.slice(0, 220)));
        }
      }
      if (!eventOccurredAt)
        this.timestampFallbackCount += lineMatches.size;
      for (const [skillId, evidence] of lineMatches) {
        const current = result.get(skillId) ?? [];
        current.push(evidence);
        result.set(skillId, current);
      }
    });
    return result;
  }
  recordAmbiguousMatch(observed, candidates) {
    this.ambiguousMatchesExcluded += 1;
    const names = [...new Set(candidates.map((candidate) => candidate.skillName))].join(", ");
    const warning = `Excluded ambiguous usage evidence for "${observed}"; matching installed skills: ${names}. Use path-based evidence to identify a specific copy.`;
    for (const candidate of candidates) {
      const warnings = this.analysisWarningsBySkill.get(candidate.skillId) ?? [];
      if (!warnings.includes(warning))
        warnings.push(warning);
      this.analysisWarningsBySkill.set(candidate.skillId, warnings);
    }
  }
  async sessionLogSnapshot() {
    const codexActiveRoot = path8.join(this.homeDir, ".codex", "sessions");
    const codexArchiveRoot = path8.join(this.homeDir, ".codex", "archived_sessions");
    const claudeRoot = path8.join(this.homeDir, ".claude", "projects");
    const [codexActive, codexArchive, claude] = await Promise.all([
      this.codexRecentSessionLogs(codexActiveRoot, _UsageAnalyzer.codexActiveWindowDays),
      scanShallowLogs(codexArchiveRoot, this.maxLogBytes),
      this.claudeProjectLogs(claudeRoot)
    ]);
    const roots = [
      {
        ...codexActive,
        path: codexActiveRoot,
        agent: "codex",
        exists: await pathExists(codexActiveRoot),
        timeWindowDays: _UsageAnalyzer.codexActiveWindowDays
      },
      {
        ...codexArchive,
        path: codexArchiveRoot,
        agent: "codex",
        exists: await pathExists(codexArchiveRoot),
        timeWindowDays: null
      },
      {
        ...claude,
        path: claudeRoot,
        agent: "claude",
        exists: await pathExists(claudeRoot),
        timeWindowDays: null
      }
    ];
    const unique = [...new Set(roots.flatMap((root) => root.paths))];
    const dated = await Promise.all(unique.map(async (logPath) => ({
      logPath,
      mtime: (await fs7.promises.stat(logPath).catch(() => null))?.mtimeMs ?? 0
    })));
    const logs = dated.sort((a, b) => b.mtime - a.mtime).slice(0, this.maxLogFiles).map((item) => item.logPath);
    return { logs, roots };
  }
  async codexRecentSessionLogs(root, days) {
    const today = /* @__PURE__ */ new Date();
    const scans = [];
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const directory = path8.join(root, String(date.getFullYear()).padStart(4, "0"), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0"));
      scans.push(await scanShallowLogs(directory, this.maxLogBytes));
    }
    return combineScans(scans);
  }
  async claudeProjectLogs(root) {
    const entries = await fs7.promises.readdir(root, { withFileTypes: true }).catch(() => []);
    const projects = entries.filter((entry) => entry.isDirectory());
    const scans = await Promise.all(projects.map((project) => scanShallowLogs(path8.join(root, project.name), this.maxLogBytes)));
    return combineScans(scans);
  }
};
async function scanShallowLogs(directory, maxLogBytes) {
  const entries = await fs7.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const paths = [];
  let oversizedCount = 0;
  for (const entry of entries) {
    if (!entry.isFile())
      continue;
    const logPath = path8.join(directory, entry.name);
    if (!isSearchableLog(logPath))
      continue;
    const stat = await fs7.promises.stat(logPath).catch(() => null);
    if (!stat)
      continue;
    if (stat.size > maxLogBytes) {
      oversizedCount += 1;
      continue;
    }
    paths.push(logPath);
  }
  return { paths, oversizedCount };
}
function combineScans(scans) {
  return {
    paths: scans.flatMap((scan) => scan.paths),
    oversizedCount: scans.reduce((sum, scan) => sum + scan.oversizedCount, 0)
  };
}
function isPathInside(candidate, root) {
  const relative = path8.relative(root, candidate);
  return relative === "" || !relative.startsWith("..") && !path8.isAbsolute(relative);
}
function normalizedPathTerms(skills) {
  const result = /* @__PURE__ */ new Map();
  for (const skill of skills) {
    const skillDirectoryPrefix = `${skill.path}${path8.sep}`;
    const variants = /* @__PURE__ */ new Set([skillDirectoryPrefix, skill.skillFilePath]);
    for (const value of [skillDirectoryPrefix, skill.skillFilePath]) {
      const slashPath = value.replaceAll(path8.sep, "/");
      variants.add(slashPath);
      for (const marker of ["/.agents/", "/.codex/", "/.claude/"]) {
        const markerIndex = slashPath.indexOf(marker);
        if (markerIndex >= 0)
          variants.add(`~${slashPath.slice(markerIndex)}`);
      }
    }
    result.set(skill.id, {
      skillId: skill.id,
      skillName: skill.name,
      pathTerms: [...variants].filter(Boolean).sort((a, b) => b.length - a.length)
    });
  }
  return result;
}
function matchingTermsByName(observedSkillName, terms) {
  const normalized = observedSkillName.trim().toLocaleLowerCase();
  if (!normalized)
    return [];
  return [...terms.values()].filter((term) => term.skillName.toLocaleLowerCase() === normalized);
}
function matchingTermsByPath(observedText, terms) {
  const slashText = normalizedEvidencePathText(observedText);
  return [...terms.values()].filter((term) => term.pathTerms.some((candidate) => {
    const slashCandidate = normalizedEvidencePathText(candidate);
    return slashCandidate.length > 0 && slashText.includes(slashCandidate);
  }));
}
function normalizedEvidencePathText(value) {
  return value.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}
function isPotentialUsageLine(line) {
  return line.includes('"name":"Skill"') || line.includes('"name": "Skill"') || line.includes('"name":"loadSkill"') || line.includes('"name": "loadSkill"') || line.includes('"name":"load_skill"') || line.includes('"name": "load_skill"') || line.includes("SKILL.md") || line.includes("/skills/");
}
function usageEvidence(original, logPath, lineIndex, kind, agent, occurredAt, timestampSource, detail, matchedText) {
  const idSource = `${original}|${logPath}|${lineIndex}|${kind}`;
  return {
    id: stableId(idSource),
    skillName: original,
    agent,
    kind,
    sessionPath: logPath,
    sessionKind: logPath.includes(`${path8.sep}.codex${path8.sep}archived_sessions`) ? "archived" : "active",
    occurredAt,
    timestampSource,
    detail,
    matchedText,
    confidence: "high"
  };
}
function findSkillToolUse(value) {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findSkillToolUse(child);
      if (found)
        return found;
    }
    return null;
  }
  if (!value || typeof value !== "object")
    return null;
  const record = value;
  if (record.type === "tool_use" && record.name === "Skill" && isRecord(record.input)) {
    const skill = record.input.skill;
    if (typeof skill === "string")
      return skill;
  }
  for (const child of Object.values(record)) {
    const found = findSkillToolUse(child);
    if (found)
      return found;
  }
  return null;
}
function codexToolSearchTexts(value) {
  if (!isRecord(value) || value.type !== "response_item" || !isRecord(value.payload))
    return [];
  const payload = value.payload;
  if (payload.type !== "function_call" && payload.type !== "custom_tool_call")
    return [];
  const name = typeof payload.name === "string" ? payload.name : "";
  if (isDirectSkillToolName(name)) {
    const skillName = skillNameFromToolPayload(payload);
    return skillName ? [{ text: skillName, kind: "codexDirectLoad", agent: "codex", detail: `Codex ${name}` }] : [];
  }
  if (!["exec_command", "read_mcp_resource", "open"].includes(name))
    return [];
  return stringValues(payload, ["arguments", "input"]).map((text) => ({
    text,
    kind: "codexSkillRead",
    agent: "codex",
    detail: `Codex ${name} read`
  }));
}
function isDirectSkillToolName(name) {
  return ["Skill", "loadSkill", "load_skill"].includes(name);
}
function skillNameFromToolPayload(payload) {
  for (const value of stringValues(payload, ["arguments", "input"])) {
    try {
      const object = JSON.parse(value);
      const skill = skillNameFromJsonObject(object);
      if (skill)
        return skill;
    } catch {
      const trimmed2 = value.trim();
      if (trimmed2 && !trimmed2.includes("/"))
        return trimmed2;
    }
  }
  return null;
}
function skillNameFromJsonObject(value) {
  if (!isRecord(value))
    return null;
  for (const key of ["skill", "skillName", "name"]) {
    const item = value[key];
    if (typeof item === "string")
      return item;
  }
  return null;
}
function stringValues(record, keys) {
  return keys.flatMap((key) => {
    const value = record[key];
    if (typeof value === "string")
      return [value];
    if (value === void 0)
      return [];
    try {
      return [JSON.stringify(value)];
    } catch {
      return [];
    }
  });
}
function timestampFromEvent(value) {
  if (!isRecord(value))
    return null;
  for (const key of ["timestamp", "time", "createdAt", "created_at"]) {
    const timestamp = normalizedTimestamp(value[key]);
    if (timestamp)
      return timestamp;
  }
  for (const key of ["payload", "message", "event"]) {
    if (isRecord(value[key])) {
      const timestamp = timestampFromEvent(value[key]);
      if (timestamp)
        return timestamp;
    }
  }
  return null;
}
function normalizedTimestamp(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1e9)
      return null;
    return isoFromDate(value < 1e12 ? value * 1e3 : value);
  }
  if (typeof value !== "string" || !value.trim())
    return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim().match(/^\d+(?:\.\d+)?$/)) {
    return normalizedTimestamp(numeric);
  }
  return isoFromDate(value);
}
function labelForKind(kind) {
  switch (kind) {
    case "codexSkillRead":
      return "Codex read SKILL.md";
    case "codexDirectLoad":
      return "Codex loadSkill";
    case "claudeSkillTool":
      return "Claude Skill tool";
  }
}
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

// ../core/dist/inventory-service.js
var InventoryService = class {
  homeDir;
  userDataDir;
  scanner;
  usageAnalyzer;
  archiveStore;
  decisionStore;
  reportStore;
  constructor(options) {
    this.homeDir = options.homeDir;
    this.userDataDir = options.userDataDir;
    this.scanner = new SkillScanner({ homeDir: this.homeDir });
    this.usageAnalyzer = new UsageAnalyzer({
      homeDir: this.homeDir,
      maxLogBytes: options.maxLogBytes,
      maxLogFiles: options.maxLogFiles
    });
    this.archiveStore = new ArchiveStore(this.userDataDir);
    this.decisionStore = new SkillDecisionStore(this.userDataDir);
    this.reportStore = new CleanupReportStore(this.userDataDir);
  }
  async loadInventory(now = /* @__PURE__ */ new Date()) {
    const roots = this.scanner.defaultRoots();
    const roughSkills = await this.scanner.scan(roots, /* @__PURE__ */ new Map(), now);
    const usage = await this.usageAnalyzer.analyzeSkillUsage(roughSkills);
    const usageWarnings = this.usageAnalyzer.warningsBySkillId();
    const active = (await this.scanner.scan(roots, usage, now)).map((skill) => ({
      ...skill,
      scanWarnings: [...skill.scanWarnings, ...usageWarnings.get(skill.id) ?? []]
    }));
    const decisions = await this.decisionStore.all();
    const activeWithDecisions = active.map((skill) => applyDecision(skill, decisions.get(skill.id)));
    const archived = await this.archiveStore.archivedSkills();
    const audit = await this.auditReport(activeWithDecisions, archived, now);
    const sessionRootAudits = await this.usageAnalyzer.sessionRootAudits();
    return {
      active: activeWithDecisions,
      archived,
      scannedAt: now.toISOString(),
      audit,
      sessionRootAudits,
      usageEvidenceAudit: this.usageAnalyzer.analysisAudit()
    };
  }
  async setDecision(skillId, decision) {
    await this.decisionStore.set(skillId, decision);
  }
  async archiveSkill(skill) {
    return this.archiveStore.archive(skill);
  }
  async archiveSkillById(skillId) {
    const inventory = await this.loadInventory();
    const skill = inventory.active.find((item) => item.id === skillId);
    if (!skill)
      throw new Error(`Unknown active skill: ${skillId}`);
    return this.archiveStore.archive(skill);
  }
  async restoreSkill(archived) {
    return this.archiveStore.restore(archived);
  }
  async restoreArchivedById(archivedId) {
    const inventory = await this.loadInventory();
    const archived = inventory.archived.find((item) => item.id === archivedId);
    if (!archived)
      throw new Error(`Unknown archived skill: ${archivedId}`);
    return this.archiveStore.restore(archived);
  }
  async exportCleanupReport(inventory, skills) {
    return this.reportStore.export(inventory, skills, await this.decisionStore.all());
  }
  async revealPathTarget(targetPath) {
    return path9.resolve(targetPath);
  }
  async auditReport(active, archived, now) {
    const roots = this.scanner.defaultRoots();
    const rootAudits = await this.scanner.auditRoots(roots, active);
    const archiveCandidates = active.filter((skill) => skill.recommendation === "archive" && !skill.status.protected && !skill.status.reviewLater);
    return {
      generatedAt: now.toISOString(),
      installedCount: active.length,
      archivedCount: archived.length,
      unusedCount: active.filter((skill) => skill.usageCount === 0).length,
      suggestedArchiveCount: archiveCandidates.length,
      contextTokens: active.reduce((sum, skill) => sum + skill.contextTokens, 0),
      reclaimableContextTokens: archiveCandidates.reduce((sum, skill) => sum + skill.contextTokens, 0),
      reclaimableBytes: archiveCandidates.reduce((sum, skill) => sum + skill.sizeBytes, 0),
      roots: rootAudits
    };
  }
};
function applyDecision(skill, decision) {
  if (!decision)
    return skill;
  const status = { ...skill.status };
  if (decision.decision === "protected") {
    status.protected = true;
  }
  if (decision.decision === "review") {
    status.reviewLater = true;
  }
  return {
    ...skill,
    status,
    recommendation: decision.decision === "protected" || decision.decision === "review" ? "keep" : skill.recommendation
  };
}

// src/format.ts
function formatAudit(report, format) {
  if (format === "json") return json(report);
  if (format === "markdown") return auditMarkdown(report);
  return auditText(report);
}
function formatInspect(report, format) {
  if (format === "json") return json(report);
  if (format === "markdown") return inspectMarkdown(report);
  return inspectText(report);
}
function formatOperation(report, format) {
  if (format === "json") return json(report);
  if (format === "markdown") return operationMarkdown(report);
  return operationText(report);
}
function auditText(report) {
  const lines = [
    "Agent Skills Audit",
    `Generated: ${report.generatedAt}`,
    `Coverage: ${report.coverage.status} (${report.coverage.logsScanned} local session logs scanned)`,
    `Limits: ${report.coverage.maxLogFiles} files | ${report.coverage.maxLogBytesPerFile} bytes/file | ${report.coverage.timeWindow.codexActiveDays} active Codex days`,
    `Excluded logs: ${report.coverage.oversizedLogsExcluded} oversized | ${report.coverage.logsExcludedByFileLimit} over file limit`,
    `Evidence fallbacks: ${report.coverage.timestampFallbackCount} file-mtime timestamps | ${report.coverage.ambiguousEvidenceExcluded} ambiguous matches excluded`,
    `Installed: ${report.summary.installedCount} | Archived: ${report.summary.archivedCount}`,
    `Usage: ${report.summary.observedCount} observed | ${report.summary.noEvidenceCount} no_evidence | ${report.summary.unknownCount} unknown`,
    `Recommendations: ${report.summary.keepCount} keep | ${report.summary.reviewCount} review | ${report.summary.archiveCandidateCount} archive`,
    `Context estimate: ${report.summary.contextTokens} tokens`,
    "",
    "Skills"
  ];
  if (report.skills.length === 0) lines.push("(none found in the standard user roots)");
  for (const skill of report.skills) {
    lines.push(
      `${skill.usageStatus.padEnd(11)} ${skill.recommendation.action.padEnd(7)} ${skill.name} (${skill.agent})`,
      `  id=${skill.id}`,
      `  path=${skill.path}`,
      `  reason=${skill.recommendation.reason}`
    );
  }
  lines.push("", `Coverage note: ${report.coverage.interpretation}`);
  lines.push("Inspect: agent-skills-audit inspect <skill-id> --json");
  lines.push("Preview archive: agent-skills-audit archive <skill-id> --dry-run --json");
  return `${lines.join("\n")}
`;
}
function auditMarkdown(report) {
  const lines = [
    "# Agent Skills Audit",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Coverage: ${report.coverage.status} (${report.coverage.logsScanned} local session logs scanned)`,
    `- Limits: ${report.coverage.maxLogFiles} files, ${report.coverage.maxLogBytesPerFile} bytes per file, ${report.coverage.timeWindow.codexActiveDays} days of active Codex sessions`,
    `- Excluded logs: ${report.coverage.oversizedLogsExcluded} oversized, ${report.coverage.logsExcludedByFileLimit} over the global file limit`,
    `- Evidence fallbacks: ${report.coverage.timestampFallbackCount} file-mtime timestamps, ${report.coverage.ambiguousEvidenceExcluded} ambiguous matches excluded`,
    `- Installed: ${report.summary.installedCount}`,
    `- Archived: ${report.summary.archivedCount}`,
    `- Usage: ${report.summary.observedCount} observed, ${report.summary.noEvidenceCount} no_evidence, ${report.summary.unknownCount} unknown`,
    `- Recommendations: ${report.summary.keepCount} keep, ${report.summary.reviewCount} review, ${report.summary.archiveCandidateCount} archive`,
    `- Context estimate: ${report.summary.contextTokens} tokens`,
    "",
    "> " + report.coverage.interpretation,
    "",
    "| Skill | Agent | Usage status | Recommendation | Uses | Last used | Context | ID |",
    "| --- | --- | --- | --- | ---: | --- | ---: | --- |"
  ];
  for (const skill of report.skills) {
    lines.push(
      `| ${cell(skill.title)} | ${cell(skill.agent)} | ${skill.usageStatus} | ${skill.recommendation.action} | ${skill.usage.count} | ${skill.usage.lastUsedAt ?? "\u2014"} | ${skill.contextTokens} | \`${skill.id}\` |`
    );
  }
  lines.push("", "## Agent commands", "", "```bash", "agent-skills-audit inspect <skill-id> --json", "agent-skills-audit archive <skill-id> --dry-run --json", "```");
  return `${lines.join("\n")}
`;
}
function inspectText(report) {
  if (report.kind === "archived") {
    const skill2 = report.skill;
    return [
      `Archived Skill: ${skill2.title}`,
      `ID: ${skill2.id}`,
      `Name: ${skill2.name}`,
      `Agent: ${skill2.agent}`,
      `Status: ${skill2.operationStatus}`,
      `Archived at: ${skill2.archivedAt}`,
      `Original path: ${skill2.originalPath}`,
      `Archive path: ${skill2.archivePath}`,
      "",
      `Restore preview: agent-skills-audit restore ${skill2.id} --dry-run --json`,
      ""
    ].join("\n");
  }
  const skill = report.skill;
  const lines = [
    `Active Skill: ${skill.title}`,
    `ID: ${skill.id}`,
    `Name: ${skill.name}`,
    `Agent: ${skill.agent}`,
    `Path: ${skill.path}`,
    `Usage status: ${skill.usageStatus}`,
    `Usage count: ${skill.usage.count}`,
    `Last used: ${skill.usage.lastUsedAt ?? "unknown"}`,
    `Recommendation: ${skill.recommendation.action}`,
    `Reason: ${skill.recommendation.reason}`,
    `Context estimate: ${skill.contextTokens} tokens`,
    `Size: ${skill.sizeBytes} bytes`,
    "",
    `Coverage note: ${report.coverage.interpretation}`,
    "",
    "SKILL.md",
    skill.content,
    ""
  ];
  return lines.join("\n");
}
function inspectMarkdown(report) {
  if (report.kind === "archived") {
    const skill2 = report.skill;
    return [
      `# ${skill2.title}`,
      "",
      "- State: archived",
      `- Archive ID: \`${skill2.id}\``,
      `- Agent: ${skill2.agent}`,
      `- Archived at: ${skill2.archivedAt}`,
      `- Original path: \`${skill2.originalPath}\``,
      `- Archive path: \`${skill2.archivePath}\``,
      "",
      "```bash",
      `agent-skills-audit restore ${skill2.id} --dry-run --json`,
      "```",
      ""
    ].join("\n");
  }
  const skill = report.skill;
  const fence = codeFence(skill.content);
  return [
    `# ${skill.title}`,
    "",
    `- ID: \`${skill.id}\``,
    `- Agent: ${skill.agent}`,
    `- Path: \`${skill.path}\``,
    `- Usage status: ${skill.usageStatus}`,
    `- Usage count: ${skill.usage.count}`,
    `- Last used: ${skill.usage.lastUsedAt ?? "unknown"}`,
    `- Recommendation: ${skill.recommendation.action}`,
    `- Reason: ${skill.recommendation.reason}`,
    `- Context estimate: ${skill.contextTokens} tokens`,
    "",
    `> ${report.coverage.interpretation}`,
    "",
    "## SKILL.md",
    "",
    `${fence}markdown`,
    skill.content,
    fence,
    ""
  ].join("\n");
}
function operationText(report) {
  const lines = [
    `${title(report.operation)} ${report.status === "completed" ? "completed" : "preview"}: ${report.target.title}`,
    `ID: ${report.target.id}`,
    `Original path: ${report.target.originalPath}`,
    `Archive path: ${report.target.archivePath ?? "assigned when archived"}`
  ];
  if (report.confirmation.nextCommand) {
    lines.push("", "No files changed.", `Run to confirm: ${report.confirmation.nextCommand}`);
  }
  if (report.status === "completed") {
    lines.push(
      `Ledger ID: ${report.verification.ledgerId ?? "unknown"}`,
      `Source present: ${String(report.verification.sourcePresent)}`,
      `Destination present: ${String(report.verification.destinationPresent)}`
    );
  }
  return `${lines.join("\n")}
`;
}
function operationMarkdown(report) {
  const lines = [
    `# ${title(report.operation)} ${report.status === "completed" ? "completed" : "preview"}`,
    "",
    `- Skill: ${report.target.title}`,
    `- ID: \`${report.target.id}\``,
    `- Original path: \`${report.target.originalPath}\``,
    `- Archive path: ${report.target.archivePath ? `\`${report.target.archivePath}\`` : "assigned when archived"}`,
    `- Files changed: ${report.status === "completed" ? "yes" : "no"}`
  ];
  if (report.confirmation.nextCommand) {
    lines.push("", "```bash", report.confirmation.nextCommand, "```");
  }
  return `${lines.join("\n")}
`;
}
function json(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function cell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
function codeFence(content) {
  const matches = content.match(/`+/g) ?? [];
  const longest = matches.reduce((length, match) => Math.max(length, match.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}
function title(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

// src/report.ts
var SCHEMA_VERSION = "1.0.0";
function buildAuditReport(inventory, limits) {
  const coverage = buildCoverage(inventory, limits);
  const skills = inventory.active.map((skill) => auditSkill(skill, coverage));
  const archiveCandidates = skills.filter((skill) => skill.recommendation.action === "archive");
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: inventory.scannedAt,
    coverage,
    skills,
    summary: {
      installedCount: skills.length,
      archivedCount: inventory.archived.length,
      observedCount: count(skills, "observed"),
      noEvidenceCount: count(skills, "no_evidence"),
      unknownCount: count(skills, "unknown"),
      keepCount: skills.filter((skill) => skill.recommendation.action === "keep").length,
      reviewCount: skills.filter((skill) => skill.recommendation.action === "review").length,
      archiveCandidateCount: archiveCandidates.length,
      contextTokens: skills.reduce((sum, skill) => sum + skill.contextTokens, 0),
      archiveCandidateContextTokens: archiveCandidates.reduce((sum, skill) => sum + skill.contextTokens, 0),
      archiveCandidateBytes: archiveCandidates.reduce((sum, skill) => sum + skill.sizeBytes, 0)
    }
  };
}
function buildInspectReport(inventory, limits, target) {
  const coverage = buildCoverage(inventory, limits);
  if (target.kind === "archived") {
    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: inventory.scannedAt,
      coverage,
      kind: "archived",
      skill: target.skill
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: inventory.scannedAt,
    coverage,
    kind: "active",
    skill: {
      ...auditSkill(target.skill, coverage),
      content: target.skill.content,
      locations: target.skill.locations,
      usageEvidence: target.skill.usageEvidence.map(evidenceSummary)
    }
  };
}
function buildCoverage(inventory, limits) {
  const logsScanned = inventory.sessionRootAudits.reduce((sum, root) => sum + root.logCount, 0);
  const eligibleLogsFound = inventory.sessionRootAudits.reduce(
    (sum, root) => sum + (root.eligibleLogCount ?? root.logCount),
    0
  );
  const oversizedLogsExcluded = inventory.sessionRootAudits.reduce(
    (sum, root) => sum + (root.oversizedLogCount ?? 0),
    0
  );
  const logsExcludedByFileLimit = inventory.sessionRootAudits.reduce(
    (sum, root) => sum + (root.excludedByFileLimitCount ?? 0),
    0
  );
  const codexActiveDays = inventory.sessionRootAudits.find((root) => root.timeWindowDays)?.timeWindowDays ?? 120;
  return {
    status: logsScanned > 0 ? "partial" : "unavailable",
    skillRoots: inventory.audit.roots.map((root) => ({
      path: root.path,
      agent: root.agent,
      exists: root.exists,
      skillCount: root.skillCount
    })),
    usageSessionRoots: inventory.sessionRootAudits.map((root) => ({
      path: root.path,
      agent: root.agent,
      exists: root.exists,
      logsScanned: root.logCount,
      eligibleLogsFound: root.eligibleLogCount ?? root.logCount,
      oversizedLogsExcluded: root.oversizedLogCount ?? 0,
      logsExcludedByFileLimit: root.excludedByFileLimitCount ?? 0,
      timeWindowDays: root.timeWindowDays ?? null
    })),
    logsScanned,
    eligibleLogsFound,
    oversizedLogsExcluded,
    logsExcludedByFileLimit,
    ambiguousEvidenceExcluded: inventory.usageEvidenceAudit?.ambiguousMatchesExcluded ?? 0,
    timestampFallbackCount: inventory.usageEvidenceAudit?.timestampFallbackCount ?? 0,
    maxLogFiles: limits.maxLogFiles,
    maxLogBytesPerFile: limits.maxLogBytes,
    timeWindow: {
      codexActiveDays,
      codexArchived: "all_available_local_logs",
      claudeProjects: "all_available_local_logs"
    },
    warnings: inventory.usageEvidenceAudit?.warnings ?? [],
    interpretation: logsScanned > 0 ? `Usage findings cover ${logsScanned} searchable local logs. The global limit is ${limits.maxLogFiles} files, each up to ${limits.maxLogBytes} bytes; ${oversizedLogsExcluded} oversized and ${logsExcludedByFileLimit} over-limit logs were excluded. Active Codex sessions cover ${codexActiveDays} days. no_evidence means no matching record was observed in the covered logs.` : `No searchable local Codex or Claude session logs were available within the ${limits.maxLogFiles}-file and ${limits.maxLogBytes}-byte limits. ${oversizedLogsExcluded} oversized logs were excluded. Usage status is unknown unless direct evidence was observed.`
  };
}
function usageStatusForSkill(skill, sessionRoots) {
  if (skill.usageCount > 0 || skill.usageEvidence.length > 0) return "observed";
  const relevantRoots = sessionRootsForSkill(skill, sessionRoots);
  const logsScanned = relevantRoots.reduce((sum, root) => sum + root.logCount, 0);
  const coverageExclusions = relevantRoots.reduce(
    (sum, root) => sum + (root.oversizedLogCount ?? 0) + (root.excludedByFileLimitCount ?? 0),
    0
  );
  if (logsScanned === 0 || coverageExclusions > 0) return "unknown";
  return "no_evidence";
}
function auditSkill(skill, coverage) {
  const usageStatus = usageStatusForSkill(
    skill,
    coverage.usageSessionRoots.map((root) => ({
      path: root.path,
      agent: root.agent,
      exists: root.exists,
      logCount: root.logsScanned,
      eligibleLogCount: root.eligibleLogsFound,
      oversizedLogCount: root.oversizedLogsExcluded,
      excludedByFileLimitCount: root.logsExcludedByFileLimit,
      timeWindowDays: root.timeWindowDays
    }))
  );
  const recommendation = recommendationFor(skill, usageStatus);
  return {
    id: skill.id,
    name: skill.name,
    title: skill.title,
    summary: skill.summary,
    agent: skill.agent,
    scope: skill.scope,
    path: skill.path,
    skillFilePath: skill.skillFilePath,
    sizeBytes: skill.sizeBytes,
    contextTokens: skill.contextTokens,
    updatedAt: skill.updatedAt,
    usageStatus,
    usage: {
      count: skill.usageCount,
      lastUsedAt: skill.lastUsedAt,
      evidenceCount: skill.usageEvidence.length,
      latestEvidence: skill.usageEvidence[0] ? evidenceSummary(skill.usageEvidence[0]) : null
    },
    recommendation,
    protection: {
      protected: skill.status.protected,
      reviewLater: skill.status.reviewLater
    },
    package: skill.package ? {
      id: skill.package.id,
      source: skill.package.source,
      sourceType: skill.package.sourceType,
      sourceUrl: skill.package.sourceUrl,
      inferred: skill.package.isInferred
    } : null,
    warnings: skill.scanWarnings
  };
}
function recommendationFor(skill, usageStatus) {
  if (skill.status.protected) {
    return { action: "keep", reason: "Protected by a local decision", requiresConfirmation: false };
  }
  if (skill.status.reviewLater) {
    return { action: "review", reason: "Marked for later review", requiresConfirmation: false };
  }
  if (usageStatus === "unknown") {
    return { action: "review", reason: "Relevant local usage logs were unavailable", requiresConfirmation: false };
  }
  if (usageStatus === "no_evidence") {
    return { action: "review", reason: "No matching usage evidence was observed in covered local logs", requiresConfirmation: false };
  }
  if (skill.recommendation === "archive") {
    return { action: "archive", reason: oldEvidenceReason(skill.lastUsedAt), requiresConfirmation: true };
  }
  if (skill.recommendation === "review") {
    return {
      action: "review",
      reason: skill.contextTokens >= 2e3 ? "High context estimate or aging observed usage" : "Observed usage needs review",
      requiresConfirmation: false
    };
  }
  return { action: "keep", reason: "Recent local usage evidence was observed", requiresConfirmation: false };
}
function oldEvidenceReason(lastUsedAt) {
  return lastUsedAt ? `Latest observed local usage is at least 90 days old (${lastUsedAt})` : "Observed usage needs manual review";
}
function sessionRootsForSkill(skill, roots) {
  if (skill.agent === "codex" || skill.agent === "claude") {
    return roots.filter((root) => root.agent === skill.agent);
  }
  return roots;
}
function evidenceSummary(evidence) {
  return {
    id: evidence.id,
    kind: evidence.kind,
    agent: evidence.agent,
    sessionKind: evidence.sessionKind,
    sessionPath: evidence.sessionPath,
    occurredAt: evidence.occurredAt,
    timestampSource: evidence.timestampSource ?? null,
    confidence: evidence.confidence,
    detail: evidence.detail
  };
}
function count(skills, status) {
  return skills.filter((skill) => skill.usageStatus === status).length;
}

// package.json
var package_default = {
  name: "agent-skills-audit",
  version: "0.6.0",
  description: "Local-first audit, inspection, archive, and restore CLI for Agent Skills.",
  homepage: "https://ryan-yang125.github.io/skill-manager/",
  repository: {
    type: "git",
    url: "git+https://github.com/Ryan-yang125/skill-manager.git",
    directory: "packages/cli"
  },
  bugs: {
    url: "https://github.com/Ryan-yang125/skill-manager/issues"
  },
  keywords: [
    "agent-skills",
    "claude-code",
    "codex",
    "local-first",
    "skill-manager"
  ],
  license: "MIT",
  type: "module",
  bin: {
    "agent-skills-audit": "dist/skill-manager.mjs",
    "skill-manager": "dist/skill-manager.mjs"
  },
  files: [
    "dist",
    "README.md",
    "LICENSE"
  ],
  engines: {
    node: ">=20"
  },
  publishConfig: {
    access: "public"
  },
  scripts: {
    start: "pnpm build && node dist/skill-manager.mjs",
    build: "pnpm --filter @skill-manager/core build && node scripts/build.mjs",
    test: "vitest run",
    lint: "pnpm --filter @skill-manager/core build && tsc -p tsconfig.json --noEmit",
    bundle: "pnpm build && node scripts/build.mjs ../../bin/skill-manager.mjs",
    "pack:release": "pnpm build && node scripts/pack-release.mjs"
  },
  devDependencies: {
    "@skill-manager/core": "workspace:*",
    "@types/node": "^22.19.3",
    esbuild: "^0.28.1",
    typescript: "^5.9.3",
    vitest: "^4.0.16"
  }
};

// src/cli.ts
var CLI_VERSION = package_default.version;
var DEFAULT_MAX_LOG_FILES = 300;
var DEFAULT_MAX_LOG_BYTES = 512 * 1024;
var CliError = class extends Error {
  code;
  exitCode;
  details;
  constructor(code, message, exitCode2 = 2, details = null) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode2;
    this.details = details;
  }
};
async function runCli(argv, runtime = {}) {
  const writeOut = runtime.stdout ?? ((value) => process.stdout.write(value));
  const writeError = runtime.stderr ?? ((value) => process.stderr.write(value));
  const errorFormat = requestedFormat(argv);
  try {
    const parsed = parseArguments(argv);
    if (parsed.command === "help") {
      writeOut(helpText());
      return 0;
    }
    if (parsed.command === "version") {
      writeOut(`${CLI_VERSION}
`);
      return 0;
    }
    const env = runtime.env ?? process.env;
    const platform = runtime.platform ?? process.platform;
    const cwd = runtime.cwd ?? process.cwd();
    const serviceOptions = resolveServiceOptions(parsed, env, platform, cwd);
    const createService = runtime.createService ?? ((options) => new InventoryService(options));
    const service = createService(serviceOptions);
    const inventory = await service.loadInventory(runtime.now?.() ?? /* @__PURE__ */ new Date());
    const limits = {
      maxLogFiles: parsed.maxLogFiles,
      maxLogBytes: parsed.maxLogBytes
    };
    if (parsed.command === "audit") {
      writeOut(formatAudit(buildAuditReport(inventory, limits), parsed.format));
      return 0;
    }
    if (parsed.command === "inspect") {
      const target = resolveInspectTarget(inventory, requiredSelector(parsed));
      writeOut(formatInspect(buildInspectReport(inventory, limits, target), parsed.format));
      return 0;
    }
    if (parsed.command === "archive") {
      const skill = resolveActiveSkill(inventory, requiredSelector(parsed));
      const report2 = parsed.yes ? await archiveConfirmed(service, skill, runtime.now?.() ?? /* @__PURE__ */ new Date()) : archivePreview(skill, runtime.now?.() ?? /* @__PURE__ */ new Date());
      writeOut(formatOperation(report2, parsed.format));
      return 0;
    }
    const archived = resolveArchivedSkill(inventory, requiredSelector(parsed));
    const report = parsed.yes ? await restoreConfirmed(service, archived, runtime.now?.() ?? /* @__PURE__ */ new Date()) : restorePreview(archived, runtime.now?.() ?? /* @__PURE__ */ new Date());
    writeOut(formatOperation(report, parsed.format));
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    if (errorFormat === "json") {
      writeError(
        `${JSON.stringify(
          {
            schemaVersion: SCHEMA_VERSION,
            error: {
              code: normalized.code,
              message: normalized.message,
              details: normalized.details
            }
          },
          null,
          2
        )}
`
      );
    } else {
      writeError(`Error [${normalized.code}]: ${normalized.message}
`);
    }
    return normalized.exitCode;
  }
}
function defaultUserDataDir(homeDir, platform = process.platform, env = process.env) {
  if (env.SKILL_MANAGER_DATA_DIR) return resolveInputPath(env.SKILL_MANAGER_DATA_DIR, homeDir, process.cwd());
  if (platform === "darwin") return path10.join(homeDir, "Library", "Application Support", "Skill Manager");
  if (platform === "win32") {
    return path10.win32.join(env.APPDATA ?? path10.win32.join(homeDir, "AppData", "Roaming"), "Skill Manager");
  }
  return path10.join(env.XDG_CONFIG_HOME ?? path10.join(homeDir, ".config"), "Skill Manager");
}
function parseArguments(argv) {
  const positionals = [];
  let format = "text";
  let formatWasSet = false;
  let homeDirOption = null;
  let dataDirOption = null;
  let maxLogFiles = DEFAULT_MAX_LOG_FILES;
  let maxLogBytes = DEFAULT_MAX_LOG_BYTES;
  let yes = false;
  let dryRun = false;
  let help = false;
  let version = false;
  let positionalOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (positionalOnly) {
      positionals.push(argument);
      continue;
    }
    if (argument === "--") {
      positionalOnly = true;
      continue;
    }
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--version" || argument === "-V") {
      version = true;
      continue;
    }
    if (argument === "--yes" || argument === "-y") {
      yes = true;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--json") {
      format = mergeFormat(format, "json", formatWasSet);
      formatWasSet = true;
      continue;
    }
    if (argument === "--markdown") {
      format = mergeFormat(format, "markdown", formatWasSet);
      formatWasSet = true;
      continue;
    }
    const [option, inlineValue] = splitOption(argument);
    if (option === "--format") {
      const value = inlineValue ?? nextValue(argv, ++index, option);
      if (value !== "text" && value !== "json" && value !== "markdown") {
        throw new CliError("invalid_format", `Expected text, json, or markdown for ${option}`);
      }
      format = mergeFormat(format, value, formatWasSet);
      formatWasSet = true;
      continue;
    }
    if (option === "--home") {
      homeDirOption = inlineValue ?? nextValue(argv, ++index, option);
      continue;
    }
    if (option === "--data-dir") {
      dataDirOption = inlineValue ?? nextValue(argv, ++index, option);
      continue;
    }
    if (option === "--max-log-files") {
      maxLogFiles = positiveInteger(inlineValue ?? nextValue(argv, ++index, option), option);
      continue;
    }
    if (option === "--max-log-bytes") {
      maxLogBytes = positiveInteger(inlineValue ?? nextValue(argv, ++index, option), option);
      continue;
    }
    throw new CliError("unknown_option", `Unknown option: ${argument}`);
  }
  if (help) {
    return { command: "help", selector: null, format, homeDirOption, dataDirOption, maxLogFiles, maxLogBytes, yes, dryRun };
  }
  if (version) {
    return { command: "version", selector: null, format, homeDirOption, dataDirOption, maxLogFiles, maxLogBytes, yes, dryRun };
  }
  if (positionals.length === 0) {
    return { command: "help", selector: null, format, homeDirOption, dataDirOption, maxLogFiles, maxLogBytes, yes, dryRun };
  }
  const command = positionals[0];
  if (command !== "audit" && command !== "inspect" && command !== "archive" && command !== "restore" && command !== "help" && command !== "version") {
    throw new CliError("unknown_command", `Unknown command: ${command}`);
  }
  const selectors = positionals.slice(1);
  if (command === "audit" || command === "help" || command === "version") {
    if (selectors.length > 0) throw new CliError("unexpected_argument", `${command} does not accept a target`);
  } else if (selectors.length !== 1) {
    throw new CliError("target_required", `${command} requires exactly one skill ID, name, or path`);
  }
  if ((yes || dryRun) && command !== "archive" && command !== "restore") {
    throw new CliError("invalid_safety_option", "--yes and --dry-run are available for archive and restore");
  }
  if (yes && dryRun) {
    throw new CliError("conflicting_safety_options", "Choose one of --yes or --dry-run");
  }
  return {
    command,
    selector: selectors[0] ?? null,
    format,
    homeDirOption,
    dataDirOption,
    maxLogFiles,
    maxLogBytes,
    yes,
    dryRun
  };
}
function resolveServiceOptions(parsed, env, platform, cwd) {
  const processHome = os2.homedir();
  const requestedHome = parsed.homeDirOption ?? env.SKILL_MANAGER_HOME ?? processHome;
  const homeDir = resolveInputPath(requestedHome, processHome, cwd);
  const dataDirSource = parsed.dataDirOption ?? env.SKILL_MANAGER_DATA_DIR;
  const userDataDir = dataDirSource ? resolveInputPath(dataDirSource, homeDir, cwd) : defaultUserDataDir(homeDir, platform, env);
  const inventoryOptions = {
    homeDir,
    userDataDir,
    maxLogFiles: parsed.maxLogFiles,
    maxLogBytes: parsed.maxLogBytes
  };
  return inventoryOptions;
}
function resolveInspectTarget(inventory, selector) {
  const exactActiveId = inventory.active.find((skill) => skill.id === selector);
  if (exactActiveId) return { kind: "active", skill: exactActiveId };
  const exactArchivedId = inventory.archived.find((skill) => skill.id === selector);
  if (exactArchivedId) return { kind: "archived", skill: exactArchivedId };
  const activeMatches = matchingActiveSkills(inventory.active, selector);
  const archivedMatches = matchingArchivedSkills(inventory.archived, selector);
  const matches = [
    ...activeMatches.map((skill) => ({ kind: "active", skill })),
    ...archivedMatches.map((skill) => ({ kind: "archived", skill }))
  ];
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw ambiguousTarget(selector, matches.map(({ skill }) => targetSummary(skill)));
  throw missingTarget(selector, inventory);
}
function resolveActiveSkill(inventory, selector) {
  const exactId = inventory.active.find((skill) => skill.id === selector);
  if (exactId) return exactId;
  const matches = matchingActiveSkills(inventory.active, selector);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw ambiguousTarget(selector, matches.map(targetSummary));
  throw missingTarget(selector, inventory, "active");
}
function resolveArchivedSkill(inventory, selector) {
  const exactId = inventory.archived.find((skill) => skill.id === selector);
  if (exactId) return exactId;
  const matches = matchingArchivedSkills(inventory.archived, selector);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw ambiguousTarget(selector, matches.map(targetSummary));
  throw missingTarget(selector, inventory, "archived");
}
function matchingActiveSkills(skills, selector) {
  const normalized = selector.toLocaleLowerCase();
  return skills.filter(
    (skill) => skill.path === selector || skill.skillFilePath === selector || skill.name.toLocaleLowerCase() === normalized || skill.title.toLocaleLowerCase() === normalized
  );
}
function matchingArchivedSkills(skills, selector) {
  const normalized = selector.toLocaleLowerCase();
  return skills.filter(
    (skill) => skill.originalPath === selector || skill.archivePath === selector || skill.name.toLocaleLowerCase() === normalized || skill.title.toLocaleLowerCase() === normalized
  );
}
function archivePreview(skill, now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "archive",
    status: "dry_run",
    target: {
      id: skill.id,
      name: skill.name,
      title: skill.title,
      agent: skill.agent,
      originalPath: skill.path,
      archivePath: null
    },
    confirmation: {
      required: true,
      provided: false,
      nextCommand: `agent-skills-audit archive ${skill.id} --yes --json`
    },
    verification: {
      ledgerId: null,
      sourcePresent: null,
      destinationPresent: null
    }
  };
}
async function archiveConfirmed(service, skill, now) {
  const archived = await service.archiveSkill(skill);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "archive",
    status: "completed",
    target: {
      id: skill.id,
      name: skill.name,
      title: skill.title,
      agent: skill.agent,
      originalPath: skill.path,
      archivePath: archived.archivePath
    },
    confirmation: {
      required: true,
      provided: true,
      nextCommand: null
    },
    verification: {
      ledgerId: archived.id,
      sourcePresent: await exists(skill.path),
      destinationPresent: await exists(archived.archivePath)
    }
  };
}
function restorePreview(archived, now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "restore",
    status: "dry_run",
    target: {
      id: archived.id,
      name: archived.name,
      title: archived.title,
      agent: archived.agent,
      originalPath: archived.originalPath,
      archivePath: archived.archivePath
    },
    confirmation: {
      required: true,
      provided: false,
      nextCommand: `agent-skills-audit restore ${archived.id} --yes --json`
    },
    verification: {
      ledgerId: archived.id,
      sourcePresent: null,
      destinationPresent: null
    }
  };
}
async function restoreConfirmed(service, archived, now) {
  const restored = await service.restoreSkill(archived);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "restore",
    status: "completed",
    target: {
      id: restored.id,
      name: restored.name,
      title: restored.title,
      agent: restored.agent,
      originalPath: restored.originalPath,
      archivePath: restored.archivePath
    },
    confirmation: {
      required: true,
      provided: true,
      nextCommand: null
    },
    verification: {
      ledgerId: restored.id,
      sourcePresent: await exists(restored.originalPath),
      destinationPresent: await exists(restored.archivePath)
    }
  };
}
function requiredSelector(parsed) {
  if (!parsed.selector) throw new CliError("target_required", `${parsed.command} requires a target`);
  return parsed.selector;
}
function splitOption(argument) {
  const separator = argument.indexOf("=");
  if (separator < 0) return [argument, void 0];
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}
function nextValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("-")) throw new CliError("option_value_required", `${option} requires a value`);
  return value;
}
function positiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError("invalid_number", `${option} requires a positive integer`);
  }
  return parsed;
}
function mergeFormat(current, next, wasSet) {
  if (wasSet && current !== next) throw new CliError("conflicting_formats", "Choose one output format");
  return next;
}
function requestedFormat(argv) {
  if (argv.includes("--json") || argv.some((argument) => argument === "--format=json")) return "json";
  if (argv.includes("--markdown") || argv.some((argument) => argument === "--format=markdown")) return "markdown";
  const formatIndex = argv.indexOf("--format");
  const value = formatIndex >= 0 ? argv[formatIndex + 1] : null;
  return value === "json" || value === "markdown" ? value : "text";
}
function resolveInputPath(input, homeDir, cwd) {
  const expanded = expandHome(input, homeDir);
  return path10.isAbsolute(expanded) ? path10.normalize(expanded) : path10.resolve(cwd, expanded);
}
function ambiguousTarget(selector, matches) {
  return new CliError("ambiguous_target", `Multiple skills match "${selector}"; use an exact ID or path`, 3, { matches });
}
function missingTarget(selector, inventory, kind) {
  const active = kind === "archived" ? [] : inventory.active.slice(0, 20).map(targetSummary);
  const archived = kind === "active" ? [] : inventory.archived.slice(0, 20).map(targetSummary);
  return new CliError("target_not_found", `No ${kind ? `${kind} ` : ""}skill matches "${selector}"`, 3, {
    available: [...active, ...archived]
  });
}
function targetSummary(skill) {
  return {
    id: skill.id,
    name: skill.name,
    path: "path" in skill ? skill.path : skill.archivePath
  };
}
function normalizeError(error) {
  if (error instanceof CliError) {
    return { code: error.code, message: error.message, exitCode: error.exitCode, details: error.details };
  }
  if (error instanceof Error) {
    return { code: "operation_failed", message: error.message, exitCode: 1, details: null };
  }
  return { code: "operation_failed", message: String(error), exitCode: 1, details: null };
}
async function exists(targetPath) {
  try {
    await fs8.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
function helpText() {
  return `agent-skills-audit ${CLI_VERSION}

Local Agent Skills inventory, evidence audit, and recoverable cleanup.

Usage:
  agent-skills-audit audit [options]
  agent-skills-audit inspect <skill-id|name|path> [options]
  agent-skills-audit archive <skill-id|name|path> [--dry-run|--yes] [options]
  agent-skills-audit restore <archive-id|name|path> [--dry-run|--yes] [options]

Commands:
  audit      Scan standard user Skill roots and local usage evidence
  inspect    Show one active or archived Skill, including SKILL.md content
  archive    Preview an archive; add --yes to move it into the recovery ledger
  restore    Preview a restore; add --yes to move it back to its original path

Output:
  --json                 Stable JSON with schemaVersion, coverage, skills, and summary
  --markdown             Markdown report
  --format <format>      text, json, or markdown

Safety and scan options:
  --dry-run              Explicit read-only preview for archive or restore
  --yes, -y              Confirm the exact archive or restore target
  --home <path>          Alternate home directory to scan
  --data-dir <path>      Alternate archive ledger and decision directory
  --max-log-files <n>    Maximum local session logs to scan (default: ${DEFAULT_MAX_LOG_FILES})
  --max-log-bytes <n>    Maximum bytes per session log (default: ${DEFAULT_MAX_LOG_BYTES})
  --help, -h             Show this help
  --version, -V          Show the CLI version

Safety model:
  audit and inspect are read-only. archive and restore also remain read-only until --yes is supplied.
  no_evidence is a review signal. unknown means relevant searchable local logs were unavailable.
`;
}

// src/index.ts
var exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;
export {
  SCHEMA_VERSION,
  buildAuditReport,
  buildCoverage,
  buildInspectReport,
  formatAudit,
  formatInspect,
  formatOperation,
  runCli,
  usageStatusForSkill
};
