import path from "node:path";

import { ArchiveStore } from "./archive-store.js";
import { SkillDecisionStore } from "./decision-store.js";
import { CleanupReportStore } from "./report-store.js";
import { SkillScanner } from "./scanner.js";
import { UsageAnalyzer } from "./usage-analyzer.js";
import type { ArchivedSkill, CleanupReportExport, InventoryAuditReport, InventoryServiceOptions, SkillDecision, SkillDecisionRecord, SkillInventory, SkillRecord } from "./types.js";

export class InventoryService {
  readonly homeDir: string;
  readonly userDataDir: string;
  readonly scanner: SkillScanner;
  readonly usageAnalyzer: UsageAnalyzer;
  readonly archiveStore: ArchiveStore;
  readonly decisionStore: SkillDecisionStore;
  readonly reportStore: CleanupReportStore;

  constructor(options: Required<Pick<InventoryServiceOptions, "homeDir" | "userDataDir">> & InventoryServiceOptions) {
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

  async loadInventory(now = new Date()): Promise<SkillInventory> {
    const roots = this.scanner.defaultRoots();
    const roughSkills = await this.scanner.scan(roots, new Map(), now);
    const usage = await this.usageAnalyzer.analyzeSkillUsage(roughSkills);
    const usageWarnings = this.usageAnalyzer.warningsBySkillId();
    const active = (await this.scanner.scan(roots, usage, now)).map((skill) => ({
      ...skill,
      scanWarnings: [...skill.scanWarnings, ...(usageWarnings.get(skill.id) ?? [])]
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

  async setDecision(skillId: string, decision: SkillDecision | null): Promise<void> {
    await this.decisionStore.set(skillId, decision);
  }

  async archiveSkill(skill: SkillRecord): Promise<ArchivedSkill> {
    return this.archiveStore.archive(skill);
  }

  async archiveSkillById(skillId: string): Promise<ArchivedSkill> {
    const inventory = await this.loadInventory();
    const skill = inventory.active.find((item) => item.id === skillId);
    if (!skill) throw new Error(`Unknown active skill: ${skillId}`);
    return this.archiveStore.archive(skill);
  }

  async restoreSkill(archived: ArchivedSkill): Promise<ArchivedSkill> {
    return this.archiveStore.restore(archived);
  }

  async restoreArchivedById(archivedId: string): Promise<ArchivedSkill> {
    const inventory = await this.loadInventory();
    const archived = inventory.archived.find((item) => item.id === archivedId);
    if (!archived) throw new Error(`Unknown archived skill: ${archivedId}`);
    return this.archiveStore.restore(archived);
  }

  async exportCleanupReport(inventory: SkillInventory, skills: SkillRecord[]): Promise<CleanupReportExport> {
    return this.reportStore.export(inventory, skills, await this.decisionStore.all());
  }

  async revealPathTarget(targetPath: string): Promise<string> {
    return path.resolve(targetPath);
  }

  private async auditReport(active: SkillRecord[], archived: ArchivedSkill[], now: Date): Promise<InventoryAuditReport> {
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
}

function applyDecision(skill: SkillRecord, decision: SkillDecisionRecord | undefined): SkillRecord {
  if (!decision) return skill;
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
