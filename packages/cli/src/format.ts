import type { ArchivedSkill } from "@skill-manager/core";

import type { AuditReport, AuditSkill, InspectReport, OutputFormat } from "./report.js";
import { SCHEMA_VERSION } from "./report.js";

export interface OperationTarget {
  id: string;
  name: string;
  title: string;
  agent: string;
  originalPath: string;
  archivePath: string | null;
}

export interface OperationReport {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  operation: "archive" | "restore";
  status: "dry_run" | "completed";
  target: OperationTarget;
  confirmation: {
    required: true;
    provided: boolean;
    nextCommand: string | null;
  };
  verification: {
    ledgerId: string | null;
    sourcePresent: boolean | null;
    destinationPresent: boolean | null;
  };
}

export function formatAudit(report: AuditReport, format: OutputFormat): string {
  if (format === "json") return json(report);
  if (format === "markdown") return auditMarkdown(report);
  return auditText(report);
}

export function formatInspect(report: InspectReport, format: OutputFormat): string {
  if (format === "json") return json(report);
  if (format === "markdown") return inspectMarkdown(report);
  return inspectText(report);
}

export function formatOperation(report: OperationReport, format: OutputFormat): string {
  if (format === "json") return json(report);
  if (format === "markdown") return operationMarkdown(report);
  return operationText(report);
}

function auditText(report: AuditReport): string {
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
  return `${lines.join("\n")}\n`;
}

function auditMarkdown(report: AuditReport): string {
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
      `| ${cell(skill.title)} | ${cell(skill.agent)} | ${skill.usageStatus} | ${skill.recommendation.action} | ${skill.usage.count} | ${skill.usage.lastUsedAt ?? "—"} | ${skill.contextTokens} | \`${skill.id}\` |`
    );
  }
  lines.push("", "## Agent commands", "", "```bash", "agent-skills-audit inspect <skill-id> --json", "agent-skills-audit archive <skill-id> --dry-run --json", "```");
  return `${lines.join("\n")}\n`;
}

function inspectText(report: InspectReport): string {
  if (report.kind === "archived") {
    const skill = report.skill as ArchivedSkill;
    return [
      `Archived Skill: ${skill.title}`,
      `ID: ${skill.id}`,
      `Name: ${skill.name}`,
      `Agent: ${skill.agent}`,
      `Status: ${skill.operationStatus}`,
      `Archived at: ${skill.archivedAt}`,
      `Original path: ${skill.originalPath}`,
      `Archive path: ${skill.archivePath}`,
      "",
      `Restore preview: agent-skills-audit restore ${skill.id} --dry-run --json`,
      ""
    ].join("\n");
  }

  const skill = report.skill as AuditSkill & {
    content: string;
    locations: Array<{ path: string }>;
    usageEvidence: Array<{ kind: string; occurredAt: string | null; sessionPath: string }>;
  };
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

function inspectMarkdown(report: InspectReport): string {
  if (report.kind === "archived") {
    const skill = report.skill as ArchivedSkill;
    return [
      `# ${skill.title}`,
      "",
      "- State: archived",
      `- Archive ID: \`${skill.id}\``,
      `- Agent: ${skill.agent}`,
      `- Archived at: ${skill.archivedAt}`,
      `- Original path: \`${skill.originalPath}\``,
      `- Archive path: \`${skill.archivePath}\``,
      "",
      "```bash",
      `agent-skills-audit restore ${skill.id} --dry-run --json`,
      "```",
      ""
    ].join("\n");
  }

  const skill = report.skill as AuditSkill & { content: string };
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

function operationText(report: OperationReport): string {
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
  return `${lines.join("\n")}\n`;
}

function operationMarkdown(report: OperationReport): string {
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
  return `${lines.join("\n")}\n`;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function codeFence(content: string): string {
  const matches = content.match(/`+/g) ?? [];
  const longest = matches.reduce((length, match) => Math.max(length, match.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function title(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
