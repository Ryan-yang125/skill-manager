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

    public init(skill: SkillRecord) {
        self.id = skill.id
        self.name = skill.name
        self.title = skill.title
        self.agent = skill.agent
        self.path = skill.path
        self.lastUsedAt = skill.lastUsedAt
        self.usageCount = skill.usageCount
        self.tokenEstimate = skill.tokenEstimate
        self.sizeBytes = skill.sizeBytes
    }
}

public struct CleanupPlanReport: Codable, Hashable, Sendable {
    public var generatedAt: Date
    public var selectedCount: Int
    public var selectedContextTokens: Int
    public var selectedBytes: Int64
    public var installedCount: Int
    public var archivedCount: Int
    public var skills: [CleanupSkillSnapshot]

    public init(generatedAt: Date, inventory: SkillInventory, skills: [SkillRecord]) {
        self.generatedAt = generatedAt
        self.selectedCount = skills.count
        self.selectedContextTokens = skills.reduce(0) { $0 + $1.tokenEstimate }
        self.selectedBytes = skills.reduce(0) { $0 + $1.sizeBytes }
        self.installedCount = inventory.active.count
        self.archivedCount = inventory.archived.count
        self.skills = skills.map(CleanupSkillSnapshot.init(skill:))
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

    public func export(inventory: SkillInventory, skills: [SkillRecord], now: Date = Date()) throws -> CleanupReportExport {
        try fileManager.createDirectory(at: reportsRootURL, withIntermediateDirectories: true)

        let report = CleanupPlanReport(generatedAt: now, inventory: inventory, skills: skills)
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
        lines.append("")
        lines.append("| Skill | Agent | Last used | Uses | Context | Path |")
        lines.append("| --- | --- | --- | ---: | ---: | --- |")
        for skill in report.skills {
            lines.append("| \(escape(skill.title)) | \(escape(skill.agent.rawValue)) | \(escape(SkillFormatting.relativeDate(skill.lastUsedAt, now: report.generatedAt))) | \(skill.usageCount) | \(escape(SkillFormatting.contextTokens(skill.tokenEstimate))) | `\(escape(skill.path))` |")
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
