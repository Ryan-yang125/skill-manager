import type {
  ArchivedSkill,
  SkillInventory,
  SkillRecord,
  UsageEvidence,
  UsageSessionRootAudit
} from "@skill-manager/core";

export const SCHEMA_VERSION = "1.0.0";

export type OutputFormat = "text" | "json" | "markdown";
export type UsageEvidenceStatus = "observed" | "no_evidence" | "unknown";

export interface AuditLimits {
  maxLogFiles: number;
  maxLogBytes: number;
}

export interface AuditCoverage {
  status: "partial" | "unavailable";
  skillRoots: Array<{
    path: string;
    agent: string;
    exists: boolean;
    skillCount: number;
  }>;
  usageSessionRoots: Array<{
    path: string;
    agent: string;
    exists: boolean;
    logsScanned: number;
    eligibleLogsFound: number;
    oversizedLogsExcluded: number;
    logsExcludedByFileLimit: number;
    timeWindowDays: number | null;
  }>;
  logsScanned: number;
  eligibleLogsFound: number;
  oversizedLogsExcluded: number;
  logsExcludedByFileLimit: number;
  ambiguousEvidenceExcluded: number;
  timestampFallbackCount: number;
  maxLogFiles: number;
  maxLogBytesPerFile: number;
  timeWindow: {
    codexActiveDays: number;
    codexArchived: "all_available_local_logs";
    claudeProjects: "all_available_local_logs";
  };
  warnings: string[];
  interpretation: string;
}

export interface AuditSkill {
  id: string;
  name: string;
  title: string;
  summary: string;
  agent: string;
  scope: string;
  path: string;
  skillFilePath: string;
  sizeBytes: number;
  contextTokens: number;
  updatedAt: string | null;
  usageStatus: UsageEvidenceStatus;
  usage: {
    count: number;
    lastUsedAt: string | null;
    evidenceCount: number;
    latestEvidence: UsageEvidenceSummary | null;
  };
  recommendation: {
    action: "keep" | "review" | "archive";
    reason: string;
    requiresConfirmation: boolean;
  };
  protection: {
    protected: boolean;
    reviewLater: boolean;
  };
  package: {
    id: string;
    source: string;
    sourceType: string | null;
    sourceUrl: string | null;
    inferred: boolean;
  } | null;
  warnings: string[];
}

export interface UsageEvidenceSummary {
  id: string;
  kind: string;
  agent: string;
  sessionKind: string;
  sessionPath: string;
  occurredAt: string | null;
  timestampSource: "event" | "file_mtime" | null;
  confidence: string;
  detail: string;
}

export interface AuditReport {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  coverage: AuditCoverage;
  skills: AuditSkill[];
  summary: {
    installedCount: number;
    archivedCount: number;
    observedCount: number;
    noEvidenceCount: number;
    unknownCount: number;
    keepCount: number;
    reviewCount: number;
    archiveCandidateCount: number;
    contextTokens: number;
    archiveCandidateContextTokens: number;
    archiveCandidateBytes: number;
  };
}

export interface InspectReport {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  coverage: AuditCoverage;
  kind: "active" | "archived";
  skill: AuditSkill & {
    content: string;
    locations: SkillRecord["locations"];
    usageEvidence: UsageEvidenceSummary[];
  } | ArchivedSkill;
}

export function buildAuditReport(inventory: SkillInventory, limits: AuditLimits): AuditReport {
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

export function buildInspectReport(
  inventory: SkillInventory,
  limits: AuditLimits,
  target: { kind: "active"; skill: SkillRecord } | { kind: "archived"; skill: ArchivedSkill }
): InspectReport {
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

export function buildCoverage(inventory: SkillInventory, limits: AuditLimits): AuditCoverage {
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
    interpretation:
      logsScanned > 0
        ? `Usage findings cover ${logsScanned} searchable local logs. The global limit is ${limits.maxLogFiles} files, each up to ${limits.maxLogBytes} bytes; ${oversizedLogsExcluded} oversized and ${logsExcludedByFileLimit} over-limit logs were excluded. Active Codex sessions cover ${codexActiveDays} days. no_evidence means no matching record was observed in the covered logs.`
        : `No searchable local Codex or Claude session logs were available within the ${limits.maxLogFiles}-file and ${limits.maxLogBytes}-byte limits. ${oversizedLogsExcluded} oversized logs were excluded. Usage status is unknown unless direct evidence was observed.`
  };
}

export function usageStatusForSkill(skill: SkillRecord, sessionRoots: UsageSessionRootAudit[]): UsageEvidenceStatus {
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

function auditSkill(skill: SkillRecord, coverage: AuditCoverage): AuditSkill {
  const usageStatus = usageStatusForSkill(
    skill,
    coverage.usageSessionRoots.map((root) => ({
      path: root.path,
      agent: root.agent as UsageSessionRootAudit["agent"],
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
    package: skill.package
      ? {
          id: skill.package.id,
          source: skill.package.source,
          sourceType: skill.package.sourceType,
          sourceUrl: skill.package.sourceUrl,
          inferred: skill.package.isInferred
        }
      : null,
    warnings: skill.scanWarnings
  };
}

function recommendationFor(
  skill: SkillRecord,
  usageStatus: UsageEvidenceStatus
): AuditSkill["recommendation"] {
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
      reason: skill.contextTokens >= 2000 ? "High context estimate or aging observed usage" : "Observed usage needs review",
      requiresConfirmation: false
    };
  }
  return { action: "keep", reason: "Recent local usage evidence was observed", requiresConfirmation: false };
}

function oldEvidenceReason(lastUsedAt: string | null): string {
  return lastUsedAt
    ? `Latest observed local usage is at least 90 days old (${lastUsedAt})`
    : "Observed usage needs manual review";
}

function sessionRootsForSkill(skill: SkillRecord, roots: UsageSessionRootAudit[]): UsageSessionRootAudit[] {
  if (skill.agent === "codex" || skill.agent === "claude") {
    return roots.filter((root) => root.agent === skill.agent);
  }
  return roots;
}

function evidenceSummary(evidence: UsageEvidence): UsageEvidenceSummary {
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

function count(skills: AuditSkill[], status: UsageEvidenceStatus): number {
  return skills.filter((skill) => skill.usageStatus === status).length;
}
