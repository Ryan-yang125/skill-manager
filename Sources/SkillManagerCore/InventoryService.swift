import Foundation

public final class InventoryService: @unchecked Sendable {
    private let scanner: SkillScanner
    private let usageAnalyzer: UsageAnalyzer
    private let archiveStore: ArchiveStore
    private let historyStore: OperationHistoryStore
    private let reportStore: CleanupReportStore
    private let decisionStore: SkillDecisionStore

    public init(
        scanner: SkillScanner = SkillScanner(),
        usageAnalyzer: UsageAnalyzer = UsageAnalyzer(),
        archiveStore: ArchiveStore = ArchiveStore(),
        historyStore: OperationHistoryStore = OperationHistoryStore(),
        reportStore: CleanupReportStore = CleanupReportStore(),
        decisionStore: SkillDecisionStore = SkillDecisionStore()
    ) {
        self.scanner = scanner
        self.usageAnalyzer = usageAnalyzer
        self.archiveStore = archiveStore
        self.historyStore = historyStore
        self.reportStore = reportStore
        self.decisionStore = decisionStore
    }

    public func loadInventory(now: Date = Date()) -> SkillInventory {
        let roots = scanner.defaultRoots()
        let roughSkills = scanner.scan(roots: roots, usage: [:], now: now)
        let usage = usageAnalyzer.analyzeSkillUsage(skills: roughSkills)
        let skills = scanner.scan(roots: roots, usage: usage, now: now)
        return SkillInventory(
            active: skills,
            archived: archiveStore.archivedSkills(),
            scannedAt: now
        )
    }

    public func defaultRoots() -> [SkillRoot] {
        scanner.defaultRoots()
    }

    public func auditReport(for inventory: SkillInventory, generatedAt: Date = Date()) -> InventoryAuditReport {
        inventory.auditReport(roots: scanner.defaultRoots(), generatedAt: generatedAt)
    }

    public func sessionRootAudits() -> [UsageSessionRootAudit] {
        usageAnalyzer.sessionRootAudits()
    }

    public func operationHistory() -> [SkillOperationEntry] {
        historyStore.entries()
    }

    public func skillDecisions() -> [String: SkillDecisionRecord] {
        decisionStore.decisions()
    }

    public func setDecision(_ decision: SkillUserDecision?, for skill: SkillRecord, now: Date = Date()) throws {
        try decisionStore.setDecision(decision, for: skill.id, now: now)
    }

    public func decision(for skill: SkillRecord) -> SkillUserDecision? {
        decisionStore.decision(for: skill.id)
    }

    public var cleanupReportsDirectoryURL: URL {
        reportStore.reportsRootURL
    }

    public func cleanupCandidates(in inventory: SkillInventory) -> [SkillRecord] {
        let decisions = decisionStore.decisions()
        return inventory.archiveCandidates.filter { skill in
            guard let decision = decisions[skill.id]?.decision else { return true }
            return decision != .protected && decision != .review
        }
    }

    public func protectedSkills(in inventory: SkillInventory) -> [SkillRecord] {
        let decisions = decisionStore.decisions()
        return inventory.active.filter { decisions[$0.id]?.decision == .protected }
    }

    public func reviewSkills(in inventory: SkillInventory) -> [SkillRecord] {
        let decisions = decisionStore.decisions()
        return inventory.active.filter { skill in
            if decisions[skill.id]?.decision == .protected { return false }
            return decisions[skill.id]?.decision == .review || skill.recommendation == .review
        }
    }

    public func exportCleanupReport(inventory: SkillInventory, skills: [SkillRecord], now: Date = Date()) throws -> CleanupReportExport {
        try reportStore.export(inventory: inventory, skills: skills, decisions: decisionStore.decisions(), now: now)
    }

    @discardableResult
    public func archive(_ skill: SkillRecord) throws -> ArchivedSkill {
        do {
            let archived = try archiveStore.archive(skill)
            try? historyStore.append(SkillOperationEntry(
                action: .archive,
                skillName: skill.name,
                title: skill.title,
                originalPath: skill.path,
                archivePath: archived.archivePath,
                succeeded: true,
                message: "Archived"
            ))
            return archived
        } catch {
            try? historyStore.append(SkillOperationEntry(
                action: .archive,
                skillName: skill.name,
                title: skill.title,
                originalPath: skill.path,
                archivePath: nil,
                succeeded: false,
                message: error.localizedDescription
            ))
            throw error
        }
    }

    public func restore(_ archived: ArchivedSkill) throws {
        do {
            try archiveStore.restore(archived)
            try? historyStore.append(SkillOperationEntry(
                action: .restore,
                skillName: archived.name,
                title: archived.title,
                originalPath: archived.originalPath,
                archivePath: archived.archivePath,
                succeeded: true,
                message: "Restored"
            ))
        } catch {
            try? historyStore.append(SkillOperationEntry(
                action: .restore,
                skillName: archived.name,
                title: archived.title,
                originalPath: archived.originalPath,
                archivePath: archived.archivePath,
                succeeded: false,
                message: error.localizedDescription
            ))
            throw error
        }
    }
}
