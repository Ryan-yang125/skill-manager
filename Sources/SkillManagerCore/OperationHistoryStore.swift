import Foundation

public enum SkillOperationAction: String, Codable, Sendable {
    case archive
    case restore
}

public struct SkillOperationEntry: Identifiable, Codable, Hashable, Sendable {
    public var id: String
    public var action: SkillOperationAction
    public var skillName: String
    public var title: String
    public var originalPath: String
    public var archivePath: String?
    public var createdAt: Date
    public var succeeded: Bool
    public var message: String

    public init(
        id: String = UUID().uuidString,
        action: SkillOperationAction,
        skillName: String,
        title: String,
        originalPath: String,
        archivePath: String?,
        createdAt: Date = Date(),
        succeeded: Bool,
        message: String
    ) {
        self.id = id
        self.action = action
        self.skillName = skillName
        self.title = title
        self.originalPath = originalPath
        self.archivePath = archivePath
        self.createdAt = createdAt
        self.succeeded = succeeded
        self.message = message
    }
}

public final class OperationHistoryStore: @unchecked Sendable {
    private let fileManager: FileManager
    public let applicationSupportURL: URL
    public let historyURL: URL
    private let maxEntries: Int

    public init(
        fileManager: FileManager = .default,
        applicationSupportURL: URL? = nil,
        maxEntries: Int = 500
    ) {
        self.fileManager = fileManager
        let support = applicationSupportURL ?? fileManager
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!
            .appendingPathComponent("SkillManager", isDirectory: true)
        self.applicationSupportURL = support
        self.historyURL = support.appendingPathComponent("operation-history.json")
        self.maxEntries = maxEntries
    }

    public func entries() -> [SkillOperationEntry] {
        guard let data = try? Data(contentsOf: historyURL),
              let entries = try? JSONDecoder.skillManagerStore.decode([SkillOperationEntry].self, from: data) else {
            return []
        }
        return entries.sorted { $0.createdAt > $1.createdAt }
    }

    public func append(_ entry: SkillOperationEntry) throws {
        try fileManager.createDirectory(at: applicationSupportURL, withIntermediateDirectories: true)
        var history = entries()
        history.insert(entry, at: 0)
        if history.count > maxEntries {
            history = Array(history.prefix(maxEntries))
        }
        let data = try JSONEncoder.skillManagerStore.encode(history.sorted { $0.createdAt > $1.createdAt })
        try data.write(to: historyURL, options: [.atomic])
    }
}

extension JSONEncoder {
    static var skillManagerStore: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

extension JSONDecoder {
    static var skillManagerStore: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
