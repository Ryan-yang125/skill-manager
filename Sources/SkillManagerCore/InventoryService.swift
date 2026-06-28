import Foundation

public final class InventoryService: @unchecked Sendable {
    private let scanner: SkillScanner
    private let usageAnalyzer: UsageAnalyzer
    private let archiveStore: ArchiveStore
    private let historyStore: OperationHistoryStore
    private let reportStore: CleanupReportStore

    public init(
        scanner: SkillScanner = SkillScanner(),
        usageAnalyzer: UsageAnalyzer = UsageAnalyzer(),
        archiveStore: ArchiveStore = ArchiveStore(),
        historyStore: OperationHistoryStore = OperationHistoryStore(),
        reportStore: CleanupReportStore = CleanupReportStore()
    ) {
        self.scanner = scanner
        self.usageAnalyzer = usageAnalyzer
        self.archiveStore = archiveStore
        self.historyStore = historyStore
        self.reportStore = reportStore
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

    public func operationHistory() -> [SkillOperationEntry] {
        historyStore.entries()
    }

    public func exportCleanupReport(inventory: SkillInventory, skills: [SkillRecord], now: Date = Date()) throws -> CleanupReportExport {
        try reportStore.export(inventory: inventory, skills: skills, now: now)
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
