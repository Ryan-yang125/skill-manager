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

public enum UsageEvidenceKind: String, Codable, Hashable, Sendable {
    case codexSkillRead
    case codexDirectLoad
    case claudeSkillTool

    public var label: String {
        switch self {
        case .codexSkillRead: return "Codex read SKILL.md"
        case .codexDirectLoad: return "Codex loadSkill"
        case .claudeSkillTool: return "Claude Skill tool"
        }
    }
}

public struct UsageEvidence: Identifiable, Codable, Hashable, Sendable {
    public var id: String
    public var skillName: String
    public var agent: SkillAgent
    public var kind: UsageEvidenceKind
    public var sessionPath: String
    public var occurredAt: Date?
    public var detail: String

    public init(
        id: String,
        skillName: String,
        agent: SkillAgent,
        kind: UsageEvidenceKind,
        sessionPath: String,
        occurredAt: Date?,
        detail: String
    ) {
        self.id = id
        self.skillName = skillName
        self.agent = agent
        self.kind = kind
        self.sessionPath = sessionPath
        self.occurredAt = occurredAt
        self.detail = detail
    }
}

public enum SkillRecommendationReason: String, Codable, Hashable, Sendable {
    case protected
    case markedForReview
    case neverUsed
    case staleNinetyDays
    case staleThirtyDays
    case highContext
    case recentEvidence
}

public struct SkillPackageMetadata: Codable, Hashable, Sendable {
    public var id: String
    public var source: String
    public var sourceType: String?
    public var sourceURL: String?
    public var skillPath: String?
    public var pluginName: String?
    public var installedAt: Date?
    public var updatedAt: Date?
    public var isInferred: Bool

    public init(
        id: String,
        source: String,
        sourceType: String? = nil,
        sourceURL: String? = nil,
        skillPath: String? = nil,
        pluginName: String? = nil,
        installedAt: Date? = nil,
        updatedAt: Date? = nil,
        isInferred: Bool = false
    ) {
        self.id = id
        self.source = source
        self.sourceType = sourceType
        self.sourceURL = sourceURL
        self.skillPath = skillPath
        self.pluginName = pluginName
        self.installedAt = installedAt
        self.updatedAt = updatedAt
        self.isInferred = isInferred
    }
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
    public var usageEvidence: [UsageEvidence]
    public var package: SkillPackageMetadata?
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
        usageEvidence: [UsageEvidence] = [],
        package: SkillPackageMetadata? = nil,
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
        self.usageEvidence = usageEvidence
        self.package = package
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
    public var evidence: [UsageEvidence]

    public init(count: Int = 0, lastUsedAt: Date? = nil, evidence: [UsageEvidence] = []) {
        self.count = count
        self.lastUsedAt = lastUsedAt
        self.evidence = evidence
    }
}

public struct UsageSessionRootAudit: Codable, Hashable, Sendable {
    public var path: String
    public var agent: SkillAgent
    public var exists: Bool
    public var logCount: Int

    public init(path: String, agent: SkillAgent, exists: Bool, logCount: Int) {
        self.path = path
        self.agent = agent
        self.exists = exists
        self.logCount = logCount
    }
}
