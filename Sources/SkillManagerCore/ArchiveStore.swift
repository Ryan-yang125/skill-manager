import Foundation

public final class ArchiveStore: @unchecked Sendable {
    private let fileManager: FileManager
    public let applicationSupportURL: URL
    public let archiveRootURL: URL
    public let manifestURL: URL

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
        self.archiveRootURL = support.appendingPathComponent("Archive", isDirectory: true)
        self.manifestURL = support.appendingPathComponent("archive-manifest.json")
    }

    public func archivedSkills() -> [ArchivedSkill] {
        guard let data = try? Data(contentsOf: manifestURL),
              let skills = try? JSONDecoder.skillManager.decode([ArchivedSkill].self, from: data) else {
            return []
        }
        return skills.sorted { $0.archivedAt > $1.archivedAt }
    }

    @discardableResult
    public func archive(_ skill: SkillRecord, now: Date = Date()) throws -> ArchivedSkill {
        try ensureSupportDirectories()

        let originalURL = URL(fileURLWithPath: skill.path)
        guard fileManager.fileExists(atPath: originalURL.path) else {
            throw ArchiveError.originalMissing(skill.path)
        }

        let archiveID = archiveID(for: skill, now: now)
        let agentFolder = archiveRootURL.appendingPathComponent(skill.agent.rawValue.safePathComponent, isDirectory: true)
        try fileManager.createDirectory(at: agentFolder, withIntermediateDirectories: true)
        let destination = agentFolder.appendingPathComponent(archiveID, isDirectory: true)

        if fileManager.fileExists(atPath: destination.path) {
            try fileManager.removeItem(at: destination)
        }
        try fileManager.moveItem(at: originalURL, to: destination)

        let archived = ArchivedSkill(
            id: archiveID,
            name: skill.name,
            title: skill.title,
            originalPath: skill.path,
            archivePath: destination.path,
            archivedAt: now,
            agent: skill.agent,
            sizeBytes: skill.sizeBytes
        )
        var manifest = archivedSkills()
        manifest.removeAll { $0.originalPath == skill.path || $0.id == archived.id }
        manifest.append(archived)
        try saveManifest(manifest)
        return archived
    }

    public func restore(_ archived: ArchivedSkill) throws {
        let archiveURL = URL(fileURLWithPath: archived.archivePath)
        let originalURL = URL(fileURLWithPath: archived.originalPath)

        guard fileManager.fileExists(atPath: archiveURL.path) else {
            throw ArchiveError.archiveMissing(archived.archivePath)
        }
        if fileManager.fileExists(atPath: originalURL.path) {
            throw ArchiveError.restoreDestinationExists(archived.originalPath)
        }

        try fileManager.createDirectory(
            at: originalURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try fileManager.moveItem(at: archiveURL, to: originalURL)

        var manifest = archivedSkills()
        manifest.removeAll { $0.id == archived.id }
        try saveManifest(manifest)
    }

    private func ensureSupportDirectories() throws {
        try fileManager.createDirectory(at: archiveRootURL, withIntermediateDirectories: true)
    }

    private func saveManifest(_ skills: [ArchivedSkill]) throws {
        try ensureSupportDirectories()
        let data = try JSONEncoder.skillManager.encode(skills.sorted { $0.archivedAt > $1.archivedAt })
        try data.write(to: manifestURL, options: [.atomic])
    }

    private func archiveID(for skill: SkillRecord, now: Date) -> String {
        let stamp = ArchiveStore.idDateFormatter.string(from: now)
        return "\(stamp)-\(skill.name.safePathComponent)"
    }

    private static let idDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter
    }()
}

public enum ArchiveError: LocalizedError, Equatable {
    case originalMissing(String)
    case archiveMissing(String)
    case restoreDestinationExists(String)

    public var errorDescription: String? {
        switch self {
        case .originalMissing(let path):
            return "Skill 不存在：\(path)"
        case .archiveMissing(let path):
            return "归档文件不存在：\(path)"
        case .restoreDestinationExists(let path):
            return "恢复位置已存在：\(path)"
        }
    }
}

private extension JSONEncoder {
    static var skillManager: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var skillManager: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private extension String {
    var safePathComponent: String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        return unicodeScalars.map { allowed.contains($0) ? Character($0).description : "-" }.joined()
    }
}
