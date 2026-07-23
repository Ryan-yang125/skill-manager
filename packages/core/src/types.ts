export type SkillAgent = "agents" | "codex" | "claude" | "unknown";

export type SkillScope = "user" | "project" | "system" | "archived";

export type SkillRecommendation = "keep" | "review" | "archive";

export type UsageEvidenceKind = "codexSkillRead" | "codexDirectLoad" | "claudeSkillTool";

export type SessionKind = "active" | "archived" | "unknown";

export interface UsageEvidence {
  id: string;
  skillName: string;
  agent: SkillAgent;
  kind: UsageEvidenceKind;
  sessionPath: string;
  sessionKind: SessionKind;
  occurredAt: string | null;
  timestampSource?: "event" | "file_mtime";
  detail: string;
  matchedText: string;
  confidence: "high" | "medium" | "low";
}

export interface UsageEvidenceAudit {
  ambiguousMatchesExcluded: number;
  timestampFallbackCount: number;
  warnings: string[];
}

export interface UsageHit {
  count: number;
  lastUsedAt: string | null;
  evidence: UsageEvidence[];
}

export interface UsageSessionRootAudit {
  path: string;
  agent: SkillAgent;
  exists: boolean;
  logCount: number;
  eligibleLogCount?: number;
  oversizedLogCount?: number;
  excludedByFileLimitCount?: number;
  timeWindowDays?: number | null;
}

export interface SkillPackageMetadata {
  id: string;
  source: string;
  sourceType: string | null;
  sourceUrl: string | null;
  skillPath: string | null;
  pluginName: string | null;
  installedAt: string | null;
  updatedAt: string | null;
  isInferred: boolean;
}

export interface SkillLocation {
  rootKind: SkillAgent;
  path: string;
  rootPath: string;
  relativePath: string;
}

export interface SkillStatus {
  protected: boolean;
  reviewLater: boolean;
  archived: boolean;
  archiveReason: string | null;
  archivedAt: string | null;
  archivePath: string | null;
}

export interface SkillRecord {
  id: string;
  name: string;
  title: string;
  summary: string;
  agent: SkillAgent;
  scope: SkillScope;
  path: string;
  rootPath: string;
  relativePath: string;
  skillFilePath: string;
  content: string;
  sizeBytes: number;
  contextTokens: number;
  lastUsedAt: string | null;
  usageCount: number;
  usageEvidence: UsageEvidence[];
  package: SkillPackageMetadata | null;
  recommendation: SkillRecommendation;
  isArchived: boolean;
  locations: SkillLocation[];
  status: SkillStatus;
  updatedAt: string | null;
  scanWarnings: string[];
}

export interface ArchivedSkill {
  id: string;
  skillId: string;
  name: string;
  title: string;
  originalPath: string;
  archivePath: string;
  archivedAt: string;
  restoredAt: string | null;
  agent: SkillAgent;
  sizeBytes: number;
  operationStatus: "archiving" | "archived" | "restoring" | "restored" | "failed";
  failureReason: string | null;
  contentHashBefore: string | null;
  contentHashAfter: string | null;
}

export interface SkillRoot {
  path: string;
  agent: SkillAgent;
  scope: SkillScope;
}

export interface SkillInventory {
  active: SkillRecord[];
  archived: ArchivedSkill[];
  scannedAt: string;
  audit: InventoryAuditReport;
  sessionRootAudits: UsageSessionRootAudit[];
  usageEvidenceAudit?: UsageEvidenceAudit;
}

export interface InventoryAuditReport {
  generatedAt: string;
  installedCount: number;
  archivedCount: number;
  unusedCount: number;
  suggestedArchiveCount: number;
  contextTokens: number;
  reclaimableContextTokens: number;
  reclaimableBytes: number;
  roots: RootAudit[];
}

export interface RootAudit {
  path: string;
  agent: SkillAgent;
  exists: boolean;
  skillCount: number;
}

export type SkillDecision = "protected" | "review";

export interface SkillDecisionRecord {
  skillId: string;
  decision: SkillDecision;
  updatedAt: string;
}

export interface CleanupSkillSnapshot {
  id: string;
  name: string;
  title: string;
  agent: SkillAgent;
  path: string;
  lastUsedAt: string | null;
  usageCount: number;
  contextTokens: number;
  sizeBytes: number;
  recommendationReason: string;
  evidenceCount: number;
  latestEvidenceKind: UsageEvidenceKind | null;
  latestEvidencePath: string | null;
  packageId: string | null;
  packageSource: string | null;
  packageSourceUrl: string | null;
  packageIsInferred: boolean;
}

export interface CleanupPlanReport {
  generatedAt: string;
  selectedCount: number;
  selectedContextTokens: number;
  selectedBytes: number;
  installedCount: number;
  archivedCount: number;
  protectedExcludedCount: number;
  reviewExcludedCount: number;
  skills: CleanupSkillSnapshot[];
}

export interface CleanupReportExport {
  markdownPath: string;
  jsonPath: string;
}

export interface ScanProgress {
  phase: "roots" | "skills" | "usage" | "inventory" | "done";
  currentRoot: string | null;
  skillsFound: number;
  logsScanned: number;
}

export interface AppSettings {
  theme: "light" | "dark";
  roots: SkillRoot[];
}

export interface InventoryServiceOptions {
  homeDir?: string;
  userDataDir?: string;
  maxLogBytes?: number;
  maxLogFiles?: number;
}
