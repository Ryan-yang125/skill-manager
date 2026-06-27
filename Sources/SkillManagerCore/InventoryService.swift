import Foundation

public final class InventoryService: @unchecked Sendable {
    private let scanner: SkillScanner
    private let usageAnalyzer: UsageAnalyzer
    private let archiveStore: ArchiveStore

    public init(
        scanner: SkillScanner = SkillScanner(),
        usageAnalyzer: UsageAnalyzer = UsageAnalyzer(),
        archiveStore: ArchiveStore = ArchiveStore()
    ) {
        self.scanner = scanner
        self.usageAnalyzer = usageAnalyzer
        self.archiveStore = archiveStore
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

    @discardableResult
    public func archive(_ skill: SkillRecord) throws -> ArchivedSkill {
        try archiveStore.archive(skill)
    }

    public func restore(_ archived: ArchivedSkill) throws {
        try archiveStore.restore(archived)
    }
}
