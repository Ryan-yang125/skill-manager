import fs from "node:fs";
import path from "node:path";

import { evidenceKindLabel, formatBytes, formatTokens, relativeDate } from "./formatting.js";
import { hasReliableLastUsedEvidence } from "./scanner.js";
import type { CleanupPlanReport, CleanupReportExport, CleanupSkillSnapshot, SkillDecisionRecord, SkillInventory, SkillRecord } from "./types.js";

export class CleanupReportStore {
  readonly reportsRoot: string;

  constructor(userDataDir: string) {
    this.reportsRoot = path.join(userDataDir, "cleanup-reports");
  }

  async export(inventory: SkillInventory, skills: SkillRecord[], decisions: Map<string, SkillDecisionRecord>, now = new Date()): Promise<CleanupReportExport> {
    await fs.promises.mkdir(this.reportsRoot, { recursive: true });
    const report = cleanupPlanReport(inventory, skills, decisions, now);
    const basename = `cleanup-${fileDateString(now)}`;
    const jsonPath = path.join(this.reportsRoot, `${basename}.json`);
    const markdownPath = path.join(this.reportsRoot, `${basename}.md`);
    await fs.promises.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await fs.promises.writeFile(markdownPath, markdownForReport(report));
    return { markdownPath, jsonPath };
  }
}

export function cleanupPlanReport(
  inventory: SkillInventory,
  skills: SkillRecord[],
  decisions: Map<string, SkillDecisionRecord>,
  now = new Date()
): CleanupPlanReport {
  // Cleanup plans only include candidates backed by observed, dated usage.
  // Missing local evidence remains a review state throughout the export path.
  const archiveEligibleSkills = skills.filter(
    (skill) =>
      skill.recommendation === "archive" &&
      hasReliableLastUsedEvidence({
        count: skill.usageCount,
        lastUsedAt: skill.lastUsedAt,
        evidence: skill.usageEvidence
      })
  );
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

export function markdownForReport(report: CleanupPlanReport): string {
  const lines: string[] = [];
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
    const evidenceSummary = `${evidenceKindLabel(skill.latestEvidenceKind)} · ${skill.evidenceCount}`;
    lines.push(`| ${escapeCell(skill.title)} | ${escapeCell(skill.packageSource ?? "Manual")} | ${escapeCell(skill.agent)} | ${escapeCell(skill.recommendationReason)} | ${escapeCell(evidenceSummary)} | ${escapeCell(relativeDate(skill.lastUsedAt, new Date(report.generatedAt)))} | ${skill.usageCount} | ${skill.contextTokens} | \`${escapeCell(skill.path)}\` |`);
  }
  lines.push("");
  lines.push("Archive is recoverable from the Skill Manager archive ledger.");
  return `${lines.join("\n")}\n`;
}

function cleanupSnapshot(skill: SkillRecord, decision: SkillDecisionRecord | undefined, now: Date): CleanupSkillSnapshot {
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

function reasonText(skill: SkillRecord, decision: SkillDecisionRecord | undefined, now: Date): string {
  if (decision?.decision === "protected") return "Protected locally";
  if (decision?.decision === "review") return "Marked for review";
  if (skill.usageCount === 0) return "No local usage evidence";
  if (skill.lastUsedAt) {
    const days = Math.floor((now.getTime() - new Date(skill.lastUsedAt).getTime()) / 86_400_000);
    if (days >= 90) return "Unused for 90+ days";
    if (days >= 30) return "Unused for 30+ days";
  }
  if (skill.contextTokens >= 2000) return "High context estimate";
  return "Recent local evidence";
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function fileDateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
