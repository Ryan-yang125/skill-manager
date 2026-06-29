import Foundation

public final class SkillPackageStore: @unchecked Sendable {
    private let fileManager: FileManager
    private let homeURL: URL

    public init(
        fileManager: FileManager = .default,
        homeURL: URL = FileManager.default.homeDirectoryForCurrentUser
    ) {
        self.fileManager = fileManager
        self.homeURL = homeURL
    }

    public var lockFileURL: URL {
        homeURL.appendingPathComponent(".agents/.skill-lock.json")
    }

    public func metadataBySkillName() -> [String: SkillPackageMetadata] {
        guard fileManager.fileExists(atPath: lockFileURL.path),
              let data = try? Data(contentsOf: lockFileURL),
              let lockFile = try? JSONDecoder().decode(SkillLockFile.self, from: data) else {
            return [:]
        }

        var result: [String: SkillPackageMetadata] = [:]
        for (skillName, item) in lockFile.skills {
            guard let metadata = metadata(for: item) else { continue }
            result[Self.normalizedSkillKey(skillName)] = metadata

            if let folderName = Self.skillFolderName(from: item.skillPath) {
                result[Self.normalizedSkillKey(folderName)] = metadata
            }
        }
        return result
    }

    private func metadata(for item: SkillLockSkill) -> SkillPackageMetadata? {
        let source = Self.trimmed(item.source)
        let sourceURL = Self.trimmed(item.sourceUrl)
        let pluginName = Self.trimmed(item.pluginName)
        let identity = sourceURL ?? source ?? pluginName
        guard let identity else { return nil }

        return SkillPackageMetadata(
            id: Self.normalizedPackageID(identity),
            source: source ?? sourceURL ?? pluginName ?? identity,
            sourceType: Self.trimmed(item.sourceType),
            sourceURL: sourceURL,
            skillPath: Self.trimmed(item.skillPath),
            pluginName: pluginName,
            installedAt: Self.parseDate(item.installedAt),
            updatedAt: Self.parseDate(item.updatedAt),
            isInferred: false
        )
    }

    public static func normalizedPackageID(_ value: String) -> String {
        var id = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if id.hasPrefix("git@github.com:") {
            id = id.replacingOccurrences(of: "git@github.com:", with: "https://github.com/")
        }
        if id.hasSuffix(".git") {
            id.removeLast(4)
        }
        while id.hasSuffix("/") {
            id.removeLast()
        }
        return id
    }

    public static func normalizedSkillKey(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func trimmed(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func skillFolderName(from skillPath: String?) -> String? {
        guard let skillPath = trimmed(skillPath) else { return nil }
        let components = skillPath
            .split(separator: "/")
            .map(String.init)

        guard let last = components.last else { return nil }
        if last == "SKILL.md" {
            guard components.count >= 2 else { return nil }
            return components[components.count - 2]
        }
        guard components.count >= 2 else { return nil }
        return components[components.count - 2]
    }

    private static func parseDate(_ rawValue: String?) -> Date? {
        guard let rawValue = trimmed(rawValue) else { return nil }

        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: rawValue) {
            return date
        }

        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: rawValue)
    }
}

private struct SkillLockFile: Decodable {
    var skills: [String: SkillLockSkill]
}

private struct SkillLockSkill: Decodable {
    var source: String?
    var sourceType: String?
    var sourceUrl: String?
    var skillPath: String?
    var pluginName: String?
    var installedAt: String?
    var updatedAt: String?
}
