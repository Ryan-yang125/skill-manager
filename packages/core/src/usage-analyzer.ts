import fs from "node:fs";
import path from "node:path";

import { isSearchableLog, pathExists, stableId } from "./path-utils.js";
import type { SkillAgent, SkillRecord, UsageEvidence, UsageEvidenceKind, UsageHit, UsageSessionRootAudit } from "./types.js";

interface UsageSearchText {
  text: string;
  kind: UsageEvidenceKind;
  agent: SkillAgent;
  detail: string;
}

export interface UsageAnalyzerOptions {
  homeDir: string;
  maxLogBytes?: number;
  maxLogFiles?: number;
}

export class UsageAnalyzer {
  readonly homeDir: string;
  readonly maxLogBytes: number;
  readonly maxLogFiles: number;

  constructor(options: UsageAnalyzerOptions) {
    this.homeDir = options.homeDir;
    this.maxLogBytes = options.maxLogBytes ?? 512 * 1024;
    this.maxLogFiles = options.maxLogFiles ?? 300;
  }

  async analyzeSkillUsage(skills: SkillRecord[]): Promise<Map<string, UsageHit>> {
    const terms = normalizedPathTerms(skills);
    if (terms.size === 0) return new Map();

    const hits = new Map<string, UsageHit>();
    for (const logPath of await this.sessionLogPaths()) {
      const stat = await fs.promises.stat(logPath).catch(() => null);
      const modifiedAt = stat?.mtime.toISOString() ?? new Date(0).toISOString();
      const matches = await this.matchedSkillEvidence(logPath, terms, modifiedAt);
      for (const [original, evidence] of matches) {
        const hit = hits.get(original) ?? { count: 0, lastUsedAt: null, evidence: [] };
        hit.count += evidence.length;
        if (!hit.lastUsedAt || modifiedAt > hit.lastUsedAt) hit.lastUsedAt = modifiedAt;
        hit.evidence.push(...evidence);
        hit.evidence.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
        if (hit.evidence.length > 20) hit.evidence = hit.evidence.slice(0, 20);
        hits.set(original, hit);
      }
    }
    return hits;
  }

  async sessionLogPaths(): Promise<string[]> {
    const logs = [
      ...(await this.codexRecentSessionLogs(120)),
      ...(await shallowLogs(path.join(this.homeDir, ".codex", "archived_sessions"), this.maxLogBytes)),
      ...(await this.claudeProjectLogs())
    ];

    const unique = [...new Set(logs)];
    const dated = await Promise.all(
      unique.map(async (logPath) => ({
        logPath,
        mtime: (await fs.promises.stat(logPath).catch(() => null))?.mtimeMs ?? 0
      }))
    );

    return dated
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, this.maxLogFiles)
      .map((item) => item.logPath);
  }

  async sessionRootAudits(): Promise<UsageSessionRootAudit[]> {
    const logs = await this.sessionLogPaths();
    const roots: Array<[string, SkillAgent]> = [
      [path.join(this.homeDir, ".codex", "sessions"), "codex"],
      [path.join(this.homeDir, ".codex", "archived_sessions"), "codex"],
      [path.join(this.homeDir, ".claude", "projects"), "claude"]
    ];

    return Promise.all(
      roots.map(async ([root, agent]) => ({
        path: root,
        agent,
        exists: await pathExists(root),
        logCount: logs.filter((logPath) => logPath.startsWith(root)).length
      }))
    );
  }

  private async matchedSkillEvidence(
    logPath: string,
    terms: Map<string, string[]>,
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
      const skillToolUse = findSkillToolUse(object);
      if (skillToolUse) {
        const original = originalName(skillToolUse, terms);
        if (original) {
          const isClaude = logPath.includes(`${path.sep}.claude${path.sep}projects${path.sep}`);
          const kind: UsageEvidenceKind = isClaude ? "claudeSkillTool" : "codexDirectLoad";
          lineMatches.set(original, usageEvidence(original, logPath, lineIndex, kind, isClaude ? "claude" : "codex", modifiedAt, labelForKind(kind), skillToolUse));
        }
      }

      for (const event of codexToolSearchTexts(object)) {
        if (!event.text.includes("/") && !event.text.includes("SKILL.md")) {
          const original = originalName(event.text, terms);
          if (original) {
            lineMatches.set(original, usageEvidence(original, logPath, lineIndex, event.kind, event.agent, modifiedAt, event.detail, event.text));
          }
          continue;
        }

        if (!event.text.includes("SKILL.md") && !event.text.includes("/skills/")) continue;
        for (const [original, variants] of terms) {
          if (variants.some((variant) => event.text.includes(variant))) {
            lineMatches.set(original, usageEvidence(original, logPath, lineIndex, event.kind, event.agent, modifiedAt, event.detail, event.text.slice(0, 220)));
          }
        }
      }

      for (const [original, evidence] of lineMatches) {
        const current = result.get(original) ?? [];
        current.push(evidence);
        result.set(original, current);
      }
    });

    return result;
  }

  private async codexRecentSessionLogs(days: number): Promise<string[]> {
    const root = path.join(this.homeDir, ".codex", "sessions");
    const today = new Date();
    const logs: string[] = [];
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const directory = path.join(
        root,
        String(date.getFullYear()).padStart(4, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      );
      logs.push(...(await shallowLogs(directory, this.maxLogBytes)));
    }
    return logs;
  }

  private async claudeProjectLogs(): Promise<string[]> {
    const root = path.join(this.homeDir, ".claude", "projects");
    const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
    const projects = entries.filter((entry) => entry.isDirectory()).slice(0, 120);
    const logs = await Promise.all(projects.map((project) => shallowLogs(path.join(root, project.name), this.maxLogBytes)));
    return logs.flatMap((items) => items.slice(0, 20));
  }
}

async function shallowLogs(directory: string, maxLogBytes: number): Promise<string[]> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const logs: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const logPath = path.join(directory, entry.name);
    if (!isSearchableLog(logPath)) continue;
    const stat = await fs.promises.stat(logPath).catch(() => null);
    if (!stat || stat.size > maxLogBytes) continue;
    logs.push(logPath);
  }
  return logs;
}

function normalizedPathTerms(skills: SkillRecord[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const skill of skills) {
    const folder = path.basename(skill.path);
    const variants = new Set([
      skill.name,
      skill.path,
      skill.skillFilePath,
      `/.agents/skills/${folder}/`,
      `/.agents/skills/${folder}/SKILL.md`,
      `/.codex/skills/${folder}/`,
      `/.codex/skills/${folder}/SKILL.md`,
      `/.claude/skills/${folder}/`,
      `/.claude/skills/${folder}/SKILL.md`
    ]);
    if (skill.relativePath) {
      variants.add(skill.relativePath);
      variants.add(`/${skill.relativePath}/SKILL.md`);
    }
    result.set(skill.name, [...variants]);
  }
  return result;
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
  modifiedAt: string,
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
    occurredAt: modifiedAt,
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

function originalName(observedSkillName: string, terms: Map<string, string[]>): string | null {
  const normalized = observedSkillName.trim().toLowerCase();
  if (!normalized) return null;

  for (const [original, variants] of terms) {
    if (original.toLowerCase() === normalized) return original;
    if (variants.some((variant) => variant.toLowerCase() === normalized)) return original;
  }
  return null;
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
