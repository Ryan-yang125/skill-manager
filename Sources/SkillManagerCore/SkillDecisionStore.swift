import Foundation

public enum SkillUserDecision: String, Codable, CaseIterable, Sendable {
    case protected
    case review

    public var title: String {
        switch self {
        case .protected: return "已保护"
        case .review: return "待复查"
        }
    }
}

public struct SkillDecisionRecord: Codable, Hashable, Sendable {
    public var skillID: String
    public var decision: SkillUserDecision
    public var updatedAt: Date

    public init(skillID: String, decision: SkillUserDecision, updatedAt: Date = Date()) {
        self.skillID = skillID
        self.decision = decision
        self.updatedAt = updatedAt
    }
}

public final class SkillDecisionStore: @unchecked Sendable {
    private let fileManager: FileManager
    public let applicationSupportURL: URL
    public let decisionsURL: URL

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
        self.decisionsURL = support.appendingPathComponent("skill-decisions.json")
    }

    public func decisions() -> [String: SkillDecisionRecord] {
        guard let data = try? Data(contentsOf: decisionsURL),
              let records = try? JSONDecoder.skillManagerStore.decode([SkillDecisionRecord].self, from: data) else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: records.map { ($0.skillID, $0) })
    }

    public func decision(for skillID: String) -> SkillUserDecision? {
        decisions()[skillID]?.decision
    }

    public func setDecision(_ decision: SkillUserDecision?, for skillID: String, now: Date = Date()) throws {
        try fileManager.createDirectory(at: applicationSupportURL, withIntermediateDirectories: true)
        var records = decisions()
        if let decision {
            records[skillID] = SkillDecisionRecord(skillID: skillID, decision: decision, updatedAt: now)
        } else {
            records.removeValue(forKey: skillID)
        }
        let ordered = records.values.sorted { lhs, rhs in
            if lhs.updatedAt != rhs.updatedAt { return lhs.updatedAt > rhs.updatedAt }
            return lhs.skillID < rhs.skillID
        }
        let data = try JSONEncoder.skillManagerStore.encode(ordered)
        try data.write(to: decisionsURL, options: [.atomic])
    }
}
