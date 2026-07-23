import fs from "node:fs";
import path from "node:path";

import { isSearchableLog, isoFromDate, pathExists, stableId } from "./path-utils.js";
import type { SkillAgent, SkillRecord, UsageEvidence, UsageEvidenceAudit, UsageEvidenceKind, UsageHit, UsageSessionRootAudit } from "./types.js";

interface UsageSearchText {
  text: string;
  kind: UsageEvidenceKind;
  agent: SkillAgent;
  detail: string;
}

interface ShallowLogScan {
  paths: string[];
  oversizedCount: number;
}

interface SessionRootScan extends ShallowLogScan {
  path: string;
  agent: SkillAgent;
  exists: boolean;
  timeWindowDays: number | null;
}

interface SessionLogSnapshot {
  logs: string[];
  roots: SessionRootScan[];
}

interface SkillUsageTerms {
  skillId: string;
  skillName: string;
  pathTerms: string[];
}

export interface UsageAnalyzerOptions {
  homeDir: string;
  maxLogBytes?: number;
  maxLogFiles?: number;
}

export class UsageAnalyzer {
  static readonly codexActiveWindowDays = 120;

  readonly homeDir: string;
  readonly maxLogBytes: number;
  readonly maxLogFiles: number;
  private ambiguousMatchesExcluded = 0;
  private timestampFallbackCount = 0;
  private readonly analysisWarningsBySkill = new Map<string, string[]>();

  constructor(options: UsageAnalyzerOptions) {
    this.homeDir = options.homeDir;
    this.maxLogBytes = options.maxLogBytes ?? 512 * 1024;
    this.maxLogFiles = options.maxLogFiles ?? 300;
  }

  async analyzeSkillUsage(skills: SkillRecord[]): Promise<Map<string, UsageHit>> {
    this.ambiguousMatchesExcluded = 0;
    this.timestampFallbackCount = 0;
    this.analysisWarningsBySkill.clear();
    const terms = normalizedPathTerms(skills);
    if (terms.size === 0) return new Map();

    const hits = new Map<string, UsageHit>();
    for (const logPath of await this.sessionLogPaths()) {
      const stat = await fs.promises.stat(logPath).catch(() => null);
      const modifiedAt = stat?.mtime.toISOString() ?? new Date(0).toISOString();
      const matches = await this.matchedSkillEvidence(logPath, terms, modifiedAt);
      for (const [skillId, evidence] of matches) {
        const hit = hits.get(skillId) ?? { count: 0, lastUsedAt: null, evidence: [] };
        hit.count += evidence.length;
        const latestEvidenceAt = evidence
          .map((item) => item.occurredAt)
          .filter((value): value is string => value !== null)
          .sort((a, b) => b.localeCompare(a))[0] ?? null;
        if (latestEvidenceAt && (!hit.lastUsedAt || latestEvidenceAt > hit.lastUsedAt)) hit.lastUsedAt = latestEvidenceAt;
        hit.evidence.push(...evidence);
        hit.evidence.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
        if (hit.evidence.length > 20) hit.evidence = hit.evidence.slice(0, 20);
        hits.set(skillId, hit);
      }
    }
    return hits;
  }

  analysisAudit(): UsageEvidenceAudit {
    const warnings = [...new Set([...this.analysisWarningsBySkill.values()].flat())];
    return {
      ambiguousMatchesExcluded: this.ambiguousMatchesExcluded,
      timestampFallbackCount: this.timestampFallbackCount,
      warnings
    };
  }

  warningsBySkillId(): Map<string, string[]> {
    return new Map(
      [...this.analysisWarningsBySkill].map(([skillId, warnings]) => [skillId, [...warnings]])
    );
  }

  async sessionLogPaths(): Promise<string[]> {
    return (await this.sessionLogSnapshot()).logs;
  }

  async sessionRootAudits(): Promise<UsageSessionRootAudit[]> {
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

  private async matchedSkillEvidence(
    logPath: string,
    terms: Map<string, SkillUsageTerms>,
    modifiedAt: string
  ): Promise<Map<string, UsageEvidence[]>> {
    let raw: string;
    try {
      raw = await fs.promises.readFile(logPath, "utf8");
    } catch {
      return new Map();
    }
    if (!raw.trim()) return new Map();

    const result = new Map<string, UsageEvidence[]>();
    const lines = raw.split(/\r?\n/);
    lines.forEach((line, lineIndex) => {
      if (!isPotentialUsageLine(line)) return;
      let object: unknown;
      try {
        object = JSON.parse(line);
      } catch {
        return;
      }

      const lineMatches = new Map<string, UsageEvidence>();
      const eventOccurredAt = timestampFromEvent(object);
      const occurredAt = eventOccurredAt ?? modifiedAt;
      const timestampSource: UsageEvidence["timestampSource"] = eventOccurredAt ? "event" : "file_mtime";
      const skillToolUse = findSkillToolUse(object);
      if (skillToolUse) {
        const candidates = matchingTermsByName(skillToolUse, terms);
        if (candidates.length === 1) {
          const candidate = candidates[0]!;
          const isClaude = logPath.includes(`${path.sep}.claude${path.sep}projects${path.sep}`);
          const kind: UsageEvidenceKind = isClaude ? "claudeSkillTool" : "codexDirectLoad";
          lineMatches.set(
            candidate.skillId,
            usageEvidence(candidate.skillName, logPath, lineIndex, kind, isClaude ? "claude" : "codex", occurredAt, timestampSource, labelForKind(kind), skillToolUse)
          );
        } else if (candidates.length > 1) {
          this.recordAmbiguousMatch(skillToolUse, candidates);
        }
      }

      for (const event of codexToolSearchTexts(object)) {
        if (!event.text.includes("/") && !event.text.includes("SKILL.md")) {
          const candidates = matchingTermsByName(event.text, terms);
          if (candidates.length === 1) {
            const candidate = candidates[0]!;
            lineMatches.set(
              candidate.skillId,
              usageEvidence(candidate.skillName, logPath, lineIndex, event.kind, event.agent, occurredAt, timestampSource, event.detail, event.text)
            );
          } else if (candidates.length > 1) {
            this.recordAmbiguousMatch(event.text, candidates);
          }
          continue;
        }

        if (!event.text.includes("SKILL.md") && !event.text.includes("/skills/")) continue;
        const candidates = matchingTermsByPath(event.text, terms);
        for (const candidate of candidates) {
          lineMatches.set(
            candidate.skillId,
            usageEvidence(candidate.skillName, logPath, lineIndex, event.kind, event.agent, occurredAt, timestampSource, event.detail, event.text.slice(0, 220))
          );
        }
      }

      if (!eventOccurredAt) this.timestampFallbackCount += lineMatches.size;

      for (const [skillId, evidence] of lineMatches) {
        const current = result.get(skillId) ?? [];
        current.push(evidence);
        result.set(skillId, current);
      }
    });

    return result;
  }

  private recordAmbiguousMatch(observed: string, candidates: SkillUsageTerms[]): void {
    this.ambiguousMatchesExcluded += 1;
    const names = [...new Set(candidates.map((candidate) => candidate.skillName))].join(", ");
    const warning = `Excluded ambiguous usage evidence for "${observed}"; matching installed skills: ${names}. Use path-based evidence to identify a specific copy.`;
    for (const candidate of candidates) {
      const warnings = this.analysisWarningsBySkill.get(candidate.skillId) ?? [];
      if (!warnings.includes(warning)) warnings.push(warning);
      this.analysisWarningsBySkill.set(candidate.skillId, warnings);
    }
  }

  private async sessionLogSnapshot(): Promise<SessionLogSnapshot> {
    const codexActiveRoot = path.join(this.homeDir, ".codex", "sessions");
    const codexArchiveRoot = path.join(this.homeDir, ".codex", "archived_sessions");
    const claudeRoot = path.join(this.homeDir, ".claude", "projects");
    const [codexActive, codexArchive, claude] = await Promise.all([
      this.codexRecentSessionLogs(codexActiveRoot, UsageAnalyzer.codexActiveWindowDays),
      scanShallowLogs(codexArchiveRoot, this.maxLogBytes),
      this.claudeProjectLogs(claudeRoot)
    ]);
    const roots: SessionRootScan[] = [
      {
        ...codexActive,
        path: codexActiveRoot,
        agent: "codex",
        exists: await pathExists(codexActiveRoot),
        timeWindowDays: UsageAnalyzer.codexActiveWindowDays
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
    const dated = await Promise.all(
      unique.map(async (logPath) => ({
        logPath,
        mtime: (await fs.promises.stat(logPath).catch(() => null))?.mtimeMs ?? 0
      }))
    );
    const logs = dated
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, this.maxLogFiles)
      .map((item) => item.logPath);
    return { logs, roots };
  }

  private async codexRecentSessionLogs(root: string, days: number): Promise<ShallowLogScan> {
    const today = new Date();
    const scans: ShallowLogScan[] = [];
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const directory = path.join(
        root,
        String(date.getFullYear()).padStart(4, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      );
      scans.push(await scanShallowLogs(directory, this.maxLogBytes));
    }
    return combineScans(scans);
  }

  private async claudeProjectLogs(root: string): Promise<ShallowLogScan> {
    const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
    const projects = entries.filter((entry) => entry.isDirectory());
    const scans = await Promise.all(projects.map((project) => scanShallowLogs(path.join(root, project.name), this.maxLogBytes)));
    return combineScans(scans);
  }
}

async function scanShallowLogs(directory: string, maxLogBytes: number): Promise<ShallowLogScan> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  let oversizedCount = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const logPath = path.join(directory, entry.name);
    if (!isSearchableLog(logPath)) continue;
    const stat = await fs.promises.stat(logPath).catch(() => null);
    if (!stat) continue;
    if (stat.size > maxLogBytes) {
      oversizedCount += 1;
      continue;
    }
    paths.push(logPath);
  }
  return { paths, oversizedCount };
}

function combineScans(scans: ShallowLogScan[]): ShallowLogScan {
  return {
    paths: scans.flatMap((scan) => scan.paths),
    oversizedCount: scans.reduce((sum, scan) => sum + scan.oversizedCount, 0)
  };
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizedPathTerms(skills: SkillRecord[]): Map<string, SkillUsageTerms> {
  const result = new Map<string, SkillUsageTerms>();
  for (const skill of skills) {
    const skillDirectoryPrefix = `${skill.path}${path.sep}`;
    const variants = new Set([skillDirectoryPrefix, skill.skillFilePath]);
    for (const value of [skillDirectoryPrefix, skill.skillFilePath]) {
      const slashPath = value.replaceAll(path.sep, "/");
      variants.add(slashPath);
      for (const marker of ["/.agents/", "/.codex/", "/.claude/"]) {
        const markerIndex = slashPath.indexOf(marker);
        if (markerIndex >= 0) variants.add(`~${slashPath.slice(markerIndex)}`);
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

function matchingTermsByName(observedSkillName: string, terms: Map<string, SkillUsageTerms>): SkillUsageTerms[] {
  const normalized = observedSkillName.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return [...terms.values()].filter((term) => term.skillName.toLocaleLowerCase() === normalized);
}

function matchingTermsByPath(observedText: string, terms: Map<string, SkillUsageTerms>): SkillUsageTerms[] {
  const slashText = normalizedEvidencePathText(observedText);
  return [...terms.values()].filter((term) =>
    term.pathTerms.some((candidate) => {
      const slashCandidate = normalizedEvidencePathText(candidate);
      return slashCandidate.length > 0 && slashText.includes(slashCandidate);
    })
  );
}

function normalizedEvidencePathText(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}

function isPotentialUsageLine(line: string): boolean {
  return (
    line.includes('"name":"Skill"') ||
    line.includes('"name": "Skill"') ||
    line.includes('"name":"loadSkill"') ||
    line.includes('"name": "loadSkill"') ||
    line.includes('"name":"load_skill"') ||
    line.includes('"name": "load_skill"') ||
    line.includes("SKILL.md") ||
    line.includes("/skills/")
  );
}

function usageEvidence(
  original: string,
  logPath: string,
  lineIndex: number,
  kind: UsageEvidenceKind,
  agent: SkillAgent,
  occurredAt: string,
  timestampSource: UsageEvidence["timestampSource"],
  detail: string,
  matchedText: string
): UsageEvidence {
  const idSource = `${original}|${logPath}|${lineIndex}|${kind}`;
  return {
    id: stableId(idSource),
    skillName: original,
    agent,
    kind,
    sessionPath: logPath,
    sessionKind: logPath.includes(`${path.sep}.codex${path.sep}archived_sessions`) ? "archived" : "active",
    occurredAt,
    timestampSource,
    detail,
    matchedText,
    confidence: "high"
  };
}

function findSkillToolUse(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findSkillToolUse(child);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "tool_use" && record.name === "Skill" && isRecord(record.input)) {
    const skill = record.input.skill;
    if (typeof skill === "string") return skill;
  }

  for (const child of Object.values(record)) {
    const found = findSkillToolUse(child);
    if (found) return found;
  }
  return null;
}

function codexToolSearchTexts(value: unknown): UsageSearchText[] {
  if (!isRecord(value) || value.type !== "response_item" || !isRecord(value.payload)) return [];
  const payload = value.payload;
  if (payload.type !== "function_call" && payload.type !== "custom_tool_call") return [];
  const name = typeof payload.name === "string" ? payload.name : "";

  if (isDirectSkillToolName(name)) {
    const skillName = skillNameFromToolPayload(payload);
    return skillName ? [{ text: skillName, kind: "codexDirectLoad", agent: "codex", detail: `Codex ${name}` }] : [];
  }

  if (!["exec_command", "read_mcp_resource", "open"].includes(name)) return [];
  return stringValues(payload, ["arguments", "input"]).map((text) => ({
    text,
    kind: "codexSkillRead",
    agent: "codex",
    detail: `Codex ${name} read`
  }));
}

function isDirectSkillToolName(name: string): boolean {
  return ["Skill", "loadSkill", "load_skill"].includes(name);
}

function skillNameFromToolPayload(payload: Record<string, unknown>): string | null {
  for (const value of stringValues(payload, ["arguments", "input"])) {
    try {
      const object = JSON.parse(value) as unknown;
      const skill = skillNameFromJsonObject(object);
      if (skill) return skill;
    } catch {
      const trimmed = value.trim();
      if (trimmed && !trimmed.includes("/")) return trimmed;
    }
  }
  return null;
}

function skillNameFromJsonObject(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["skill", "skillName", "name"]) {
    const item = value[key];
    if (typeof item === "string") return item;
  }
  return null;
}

function stringValues(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => {
    const value = record[key];
    if (typeof value === "string") return [value];
    if (value === undefined) return [];
    try {
      return [JSON.stringify(value)];
    } catch {
      return [];
    }
  });
}

function timestampFromEvent(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["timestamp", "time", "createdAt", "created_at"]) {
    const timestamp = normalizedTimestamp(value[key]);
    if (timestamp) return timestamp;
  }
  for (const key of ["payload", "message", "event"]) {
    if (isRecord(value[key])) {
      const timestamp = timestampFromEvent(value[key]);
      if (timestamp) return timestamp;
    }
  }
  return null;
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1_000_000_000) return null;
    return isoFromDate(value < 1_000_000_000_000 ? value * 1000 : value);
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim().match(/^\d+(?:\.\d+)?$/)) {
    return normalizedTimestamp(numeric);
  }
  return isoFromDate(value);
}

function labelForKind(kind: UsageEvidenceKind): string {
  switch (kind) {
    case "codexSkillRead":
      return "Codex read SKILL.md";
    case "codexDirectLoad":
      return "Codex loadSkill";
    case "claudeSkillTool":
      return "Claude Skill tool";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
