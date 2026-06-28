import Foundation

public struct InventoryAuditReport: Codable, Equatable, Sendable {
    public var generatedAt: Date
    public var roots: [SkillRootAudit]
    public var installedCount: Int
    public var unusedCount: Int
    public var suggestedArchiveCount: Int
    public var archivedCount: Int
    public var contextTokens: Int
    public var reclaimableContextTokens: Int
    public var installedBytes: Int64
    public var reclaimableBytes: Int64

    public init(
        generatedAt: Date,
        roots: [SkillRootAudit],
        installedCount: Int,
        unusedCount: Int,
        suggestedArchiveCount: Int,
        archivedCount: Int,
        contextTokens: Int,
        reclaimableContextTokens: Int,
        installedBytes: Int64,
        reclaimableBytes: Int64
    ) {
        self.generatedAt = generatedAt
        self.roots = roots
        self.installedCount = installedCount
        self.unusedCount = unusedCount
        self.suggestedArchiveCount = suggestedArchiveCount
        self.archivedCount = archivedCount
        self.contextTokens = contextTokens
        self.reclaimableContextTokens = reclaimableContextTokens
        self.installedBytes = installedBytes
        self.reclaimableBytes = reclaimableBytes
    }
}

public struct SkillRootAudit: Codable, Equatable, Sendable {
    public var path: String
    public var agent: SkillAgent
    public var exists: Bool
    public var skillCount: Int

    public init(path: String, agent: SkillAgent, exists: Bool, skillCount: Int) {
        self.path = path
        self.agent = agent
        self.exists = exists
        self.skillCount = skillCount
    }
}

public extension SkillInventory {
    func auditReport(roots: [SkillRoot], fileManager: FileManager = .default, generatedAt: Date = Date()) -> InventoryAuditReport {
        let rootAudits = roots.map { root in
            let count = active.filter { $0.rootPath == root.url.path }.count
            return SkillRootAudit(
                path: root.url.path,
                agent: root.agent,
                exists: fileManager.fileExists(atPath: root.url.path),
                skillCount: count
            )
        }

        return InventoryAuditReport(
            generatedAt: generatedAt,
            roots: rootAudits,
            installedCount: active.count,
            unusedCount: unused.count,
            suggestedArchiveCount: archiveCandidates.count,
            archivedCount: archived.count,
            contextTokens: totalContextTokens,
            reclaimableContextTokens: reclaimableContextTokens,
            installedBytes: active.reduce(0) { $0 + $1.sizeBytes },
            reclaimableBytes: reclaimableBytes
        )
    }
}
