import Foundation

public enum SkillAgent: String, Codable, CaseIterable, Sendable {
    case codex = "Codex"
    case claude = "Claude Code"
    case gemini = "Gemini CLI"
    case shared = "Shared"
    case unknown = "Unknown"
}

public enum SkillScope: String, Codable, CaseIterable, Sendable {
    case user = "User"
    case project = "Project"
    case system = "System"
    case archived = "Archived"
}

public enum SkillRecommendation: String, Codable, Sendable {
    case keep
    case review
    case archive
}

public struct SkillRecord: Identifiable, Codable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var title: String
    public var summary: String
    public var agent: SkillAgent
    public var scope: SkillScope
    public var path: String
    public var rootPath: String
    public var relativePath: String
    public var sizeBytes: Int64
    public var tokenEstimate: Int
    public var lastUsedAt: Date?
    public var usageCount: Int
    public var recommendation: SkillRecommendation
    public var isArchived: Bool

    public init(
        id: String,
        name: String,
        title: String,
        summary: String,
        agent: SkillAgent,
        scope: SkillScope,
        path: String,
        rootPath: String,
        relativePath: String,
        sizeBytes: Int64,
        tokenEstimate: Int,
        lastUsedAt: Date?,
        usageCount: Int,
        recommendation: SkillRecommendation,
        isArchived: Bool
    ) {
        self.id = id
        self.name = name
        self.title = title
        self.summary = summary
        self.agent = agent
        self.scope = scope
        self.path = path
        self.rootPath = rootPath
        self.relativePath = relativePath
        self.sizeBytes = sizeBytes
        self.tokenEstimate = tokenEstimate
        self.lastUsedAt = lastUsedAt
        self.usageCount = usageCount
        self.recommendation = recommendation
        self.isArchived = isArchived
    }
}

public struct SkillInventory: Codable, Hashable, Sendable {
    public var active: [SkillRecord]
    public var archived: [ArchivedSkill]
    public var scannedAt: Date

    public init(active: [SkillRecord], archived: [ArchivedSkill], scannedAt: Date) {
        self.active = active
        self.archived = archived
        self.scannedAt = scannedAt
    }

    public var archiveCandidates: [SkillRecord] {
        active.filter { $0.recommendation == .archive }
    }

    public var unused: [SkillRecord] {
        active.filter { $0.usageCount == 0 }
    }

    public var totalContextTokens: Int {
        active.reduce(0) { $0 + $1.tokenEstimate }
    }

    public var reclaimableBytes: Int64 {
        archiveCandidates.reduce(0) { $0 + $1.sizeBytes }
    }

    public var reclaimableContextTokens: Int {
        archiveCandidates.reduce(0) { $0 + $1.tokenEstimate }
    }
}

public struct ArchivedSkill: Identifiable, Codable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var title: String
    public var originalPath: String
    public var archivePath: String
    public var archivedAt: Date
    public var agent: SkillAgent
    public var sizeBytes: Int64

    public init(
        id: String,
        name: String,
        title: String,
        originalPath: String,
        archivePath: String,
        archivedAt: Date,
        agent: SkillAgent,
        sizeBytes: Int64
    ) {
        self.id = id
        self.name = name
        self.title = title
        self.originalPath = originalPath
        self.archivePath = archivePath
        self.archivedAt = archivedAt
        self.agent = agent
        self.sizeBytes = sizeBytes
    }
}

public struct SkillRoot: Hashable, Sendable {
    public var url: URL
    public var agent: SkillAgent
    public var scope: SkillScope

    public init(url: URL, agent: SkillAgent, scope: SkillScope) {
        self.url = url
        self.agent = agent
        self.scope = scope
    }
}

public struct UsageHit: Hashable, Sendable {
    public var count: Int
    public var lastUsedAt: Date?

    public init(count: Int = 0, lastUsedAt: Date? = nil) {
        self.count = count
        self.lastUsedAt = lastUsedAt
    }
}
