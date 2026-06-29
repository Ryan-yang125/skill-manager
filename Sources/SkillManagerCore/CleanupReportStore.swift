import Foundation

public struct CleanupSkillSnapshot: Codable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var title: String
    public var agent: SkillAgent
    public var path: String
    public var lastUsedAt: Date?
    public var usageCount: Int
    public var tokenEstimate: Int
    public var sizeBytes: Int64
    public var recommendationReason: String
    public var evidenceCount: Int
    public var latestEvidenceKind: UsageEvidenceKind?
    public var latestEvidencePath: String?

    public init(skill: SkillRecord, decision: SkillUserDecision?, now: Date = Date()) {
        self.id = skill.id
        self.name = skill.name
        self.title = skill.title
        self.agent = skill.agent
        self.path = skill.path
        self.lastUsedAt = skill.lastUsedAt
        self.usageCount = skill.usageCount
        self.tokenEstimate = skill.tokenEstimate
        self.sizeBytes = skill.sizeBytes
        self.recommendationReason = Self.reasonText(for: skill, decision: decision, now: now)
        self.evidenceCount = skill.usageEvidence.count
        self.latestEvidenceKind = skill.usageEvidence.first?.kind
        self.latestEvidencePath = skill.usageEvidence.first?.sessionPath
    }

    private static func reasonText(for skill: SkillRecord, decision: SkillUserDecision?, now: Date) -> String {
        if decision == .protected { return "Protected locally" }
        if decision == .review { return "Marked for review" }
        if skill.usageCount == 0 { return "No local usage evidence" }

        if let lastUsedAt = skill.lastUsedAt {
            let days = Int(max(0, now.timeIntervalSince(lastUsedAt)) / 86_400)
            if days >= 90 { return "Unused for 90+ days" }
            if days >= 30 { return "Unused for 30+ days" }
        }

        if skill.tokenEstimate >= 2_000 { return "High context estimate" }
        return "Recent local evidence"
    }
}

public struct CleanupPlanReport: Codable, Hashable, Sendable {
    public var generatedAt: Date
    public var selectedCount: Int
    public var selectedContextTokens: Int
    public var selectedBytes: Int64
    public var installedCount: Int
    public var archivedCount: Int
    public var protectedExcludedCount: Int
    public var reviewExcludedCount: Int
    public var skills: [CleanupSkillSnapshot]

    public init(
        generatedAt: Date,
        inventory: SkillInventory,
        skills: [SkillRecord],
        decisions: [String: SkillDecisionRecord] = [:]
    ) {
        self.generatedAt = generatedAt
        self.selectedCount = skills.count
        self.selectedContextTokens = skills.reduce(0) { $0 + $1.tokenEstimate }
        self.selectedBytes = skills.reduce(0) { $0 + $1.sizeBytes }
        self.installedCount = inventory.active.count
        self.archivedCount = inventory.archived.count
        self.protectedExcludedCount = inventory.archiveCandidates.filter { decisions[$0.id]?.decision == .protected }.count
        self.reviewExcludedCount = inventory.archiveCandidates.filter { decisions[$0.id]?.decision == .review }.count
        self.skills = skills.map {
            CleanupSkillSnapshot(
                skill: $0,
                decision: decisions[$0.id]?.decision,
                now: generatedAt
            )
        }
    }
}

public struct CleanupReportExport: Hashable, Sendable {
    public var markdownURL: URL
    public var jsonURL: URL

    public init(markdownURL: URL, jsonURL: URL) {
        self.markdownURL = markdownURL
        self.jsonURL = jsonURL
    }
}

public final class CleanupReportStore: @unchecked Sendable {
    private let fileManager: FileManager
    public let applicationSupportURL: URL
    public let reportsRootURL: URL

    public init(
        fileManager: FileManager = .default,
        applicationSupportURL: URL? = nil
    ) {
        self.fileManager = fileManager
        let support = applicationSupportURL ?? fileManager
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!
            .appendingPathComponent("SkillManager", isDirectory: true)
        self.applicationSupportURL = support
        self.reportsRootURL = support.appendingPathComponent("Reports", isDirectory: true)
    }

    public func export(
        inventory: SkillInventory,
        skills: [SkillRecord],
        decisions: [String: SkillDecisionRecord] = [:],
        now: Date = Date()
    ) throws -> CleanupReportExport {
        try fileManager.createDirectory(at: reportsRootURL, withIntermediateDirectories: true)

        let report = CleanupPlanReport(generatedAt: now, inventory: inventory, skills: skills, decisions: decisions)
        let basename = "cleanup-\(Self.fileDateString(from: now))"
        let jsonURL = reportsRootURL.appendingPathComponent("\(basename).json")
        let markdownURL = reportsRootURL.appendingPathComponent("\(basename).md")

        let data = try JSONEncoder.skillManagerStore.encode(report)
        try data.write(to: jsonURL, options: [.atomic])
        try markdown(for: report).write(to: markdownURL, atomically: true, encoding: .utf8)

        return CleanupReportExport(markdownURL: markdownURL, jsonURL: jsonURL)
    }

    public func markdown(for report: CleanupPlanReport) -> String {
        var lines: [String] = []
        lines.append("# Skill Manager Cleanup Plan")
        lines.append("")
        lines.append("- Generated: \(Self.isoString(from: report.generatedAt))")
        lines.append("- Selected skills: \(report.selectedCount)")
        lines.append("- Context to archive: \(SkillFormatting.contextTokens(report.selectedContextTokens))")
        lines.append("- Disk size to archive: \(SkillFormatting.bytes(report.selectedBytes))")
        lines.append("- Installed skills before cleanup: \(report.installedCount)")
        lines.append("- Archived skills before cleanup: \(report.archivedCount)")
        lines.append("- Protected skills excluded: \(report.protectedExcludedCount)")
        lines.append("- Review skills excluded: \(report.reviewExcludedCount)")
        lines.append("")
        lines.append("| Skill | Agent | Reason | Evidence | Last used | Uses | Context | Path |")
        lines.append("| --- | --- | --- | ---: | --- | ---: | ---: | --- |")
        for skill in report.skills {
            let evidenceSummary = skill.latestEvidenceKind.map { "\($0.label) · \(skill.evidenceCount)" } ?? "No evidence · \(skill.evidenceCount)"
            lines.append("| \(escape(skill.title)) | \(escape(skill.agent.rawValue)) | \(escape(skill.recommendationReason)) | \(escape(evidenceSummary)) | \(escape(SkillFormatting.relativeDate(skill.lastUsedAt, now: report.generatedAt))) | \(skill.usageCount) | \(escape(SkillFormatting.contextTokens(skill.tokenEstimate))) | `\(escape(skill.path))` |")
        }
        lines.append("")
        lines.append("Archive is recoverable from the Skill Manager archive manifest.")
        return lines.joined(separator: "\n")
    }

    private func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "|", with: "\\|")
            .replacingOccurrences(of: "\n", with: " ")
    }

    private static func fileDateString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter.string(from: date)
    }

    private static func isoString(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}
