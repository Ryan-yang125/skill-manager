import Foundation

public final class UsageAnalyzer: @unchecked Sendable {
    private let fileManager: FileManager
    private let homeURL: URL
    private let maxLogBytes: UInt64
    private let maxLogFiles: Int

    public init(
        fileManager: FileManager = .default,
        homeURL: URL = FileManager.default.homeDirectoryForCurrentUser,
        maxLogBytes: UInt64 = 512 * 1_024,
        maxLogFiles: Int = 300
    ) {
        self.fileManager = fileManager
        self.homeURL = homeURL
        self.maxLogBytes = maxLogBytes
        self.maxLogFiles = maxLogFiles
    }

    public convenience init(
        fileManager: FileManager = .default,
        homeURL: URL = FileManager.default.homeDirectoryForCurrentUser,
        maxLogBytes: UInt64 = 512 * 1_024
    ) {
        self.init(
            fileManager: fileManager,
            homeURL: homeURL,
            maxLogBytes: maxLogBytes,
            maxLogFiles: 300
        )
    }

    public func analyzeSkillUsage(skillNames: [String]) -> [String: UsageHit] {
        let terms = normalizedTerms(from: skillNames)
        return analyzeUsage(terms: terms)
    }

    public func analyzeSkillUsage(skills: [SkillRecord]) -> [String: UsageHit] {
        let terms = normalizedPathTerms(from: skills)
        return analyzeUsage(terms: terms)
    }

    private func analyzeUsage(terms: [String: [String]]) -> [String: UsageHit] {
        guard !terms.isEmpty else { return [:] }

        let byteTerms = terms.mapValues { variants in
            variants.compactMap { $0.data(using: .utf8) }
        }

        var hits: [String: UsageHit] = [:]
        for logURL in sessionLogURLs() {
            let modifiedAt = (try? logURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date.distantPast
            for (original, count) in matchedSkillNames(in: logURL, terms: terms, byteTerms: byteTerms) {
                var hit = hits[original] ?? UsageHit()
                hit.count += count
                if hit.lastUsedAt == nil || modifiedAt > (hit.lastUsedAt ?? Date.distantPast) {
                    hit.lastUsedAt = modifiedAt
                }
                hits[original] = hit
            }
        }
        return hits
    }

    private func matchedSkillNames(
        in logURL: URL,
        terms: [String: [String]],
        byteTerms: [String: [Data]]
    ) -> [String: Int] {
        guard let data = try? Data(contentsOf: logURL, options: [.mappedIfSafe]), !data.isEmpty else {
            return [:]
        }

        var result: [String: Int] = [:]
        for rawLine in data.split(separator: 10, omittingEmptySubsequences: true) {
            let line = Data(rawLine)
            guard line.containsASCII("\"name\":\"Skill\"") ||
                    line.containsASCII("\"name\": \"Skill\"") ||
                    line.containsASCII("SKILL.md") ||
                    line.containsASCII("/skills/") else {
                continue
            }
            guard let object = try? JSONSerialization.jsonObject(with: line) else {
                continue
            }

            var lineMatches: Set<String> = []

            if let skillName = findSkillToolUse(in: object),
               let original = originalName(for: skillName, terms: terms) {
                lineMatches.insert(original)
            }

            for searchText in codexToolSearchTexts(from: object) {
                if !searchText.contains("/") && !searchText.contains("SKILL.md"),
                   let original = originalName(for: searchText, terms: terms) {
                    lineMatches.insert(original)
                    continue
                }
                guard searchText.contains("SKILL.md") || searchText.contains("/skills/") else {
                    continue
                }
                let searchData = Data(searchText.utf8)
                for (original, variants) in byteTerms {
                    if variants.contains(where: { searchData.range(of: $0) != nil }) {
                        lineMatches.insert(original)
                    }
                }
            }

            guard !lineMatches.isEmpty else {
                continue
            }
            for original in lineMatches {
                result[original, default: 0] += 1
            }
        }

        return result
    }

    private func findSkillToolUse(in value: Any) -> String? {
        if let dictionary = value as? [String: Any] {
            if dictionary["type"] as? String == "tool_use",
               dictionary["name"] as? String == "Skill",
               let input = dictionary["input"] as? [String: Any],
               let skill = input["skill"] as? String {
                return skill
            }

            for child in dictionary.values {
                if let found = findSkillToolUse(in: child) {
                    return found
                }
            }
        }

        if let array = value as? [Any] {
            for child in array {
                if let found = findSkillToolUse(in: child) {
                    return found
                }
            }
        }

        return nil
    }

    private func codexToolSearchTexts(from value: Any) -> [String] {
        guard let dictionary = value as? [String: Any],
              dictionary["type"] as? String == "response_item",
              let payload = dictionary["payload"] as? [String: Any],
              let payloadType = payload["type"] as? String else {
            return []
        }

        switch payloadType {
        case "function_call":
            let name = payload["name"] as? String ?? ""
            if isDirectSkillToolName(name), let skillName = skillNameFromToolPayload(payload) {
                return [skillName]
            }
            guard isSearchableToolCallName(name) else { return [] }
            return stringValues(in: payload, keys: ["arguments", "input"])

        case "custom_tool_call":
            let name = payload["name"] as? String ?? ""
            if isDirectSkillToolName(name), let skillName = skillNameFromToolPayload(payload) {
                return [skillName]
            }
            guard isSearchableToolCallName(name) else { return [] }
            return stringValues(in: payload, keys: ["arguments", "input"])

        default:
            return []
        }
    }

    private func isSearchableToolCallName(_ name: String) -> Bool {
        [
            "exec_command",
            "read_mcp_resource",
            "open"
        ].contains(name)
    }

    private func isDirectSkillToolName(_ name: String) -> Bool {
        ["Skill", "loadSkill", "load_skill"].contains(name)
    }

    private func skillNameFromToolPayload(_ payload: [String: Any]) -> String? {
        for value in stringValues(in: payload, keys: ["arguments", "input"]) {
            if let data = value.data(using: .utf8),
               let object = try? JSONSerialization.jsonObject(with: data),
               let skill = skillNameFromJSONObject(object) {
                return skill
            }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, !trimmed.contains("/") {
                return trimmed
            }
        }
        return nil
    }

    private func skillNameFromJSONObject(_ object: Any) -> String? {
        if let dictionary = object as? [String: Any] {
            for key in ["skill", "skillName", "name"] {
                if let value = dictionary[key] as? String {
                    return value
                }
            }
        }
        return nil
    }

    private func stringValues(in dictionary: [String: Any], keys: [String]) -> [String] {
        keys.compactMap { key in
            if let value = dictionary[key] as? String {
                return value
            }
            if let value = dictionary[key],
               JSONSerialization.isValidJSONObject(value),
               let data = try? JSONSerialization.data(withJSONObject: value),
               let text = String(data: data, encoding: .utf8) {
                return text
            }
            return nil
        }
    }

    private func originalName(for observedSkillName: String, terms: [String: [String]]) -> String? {
        let normalized = observedSkillName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard !normalized.isEmpty else { return nil }

        for (original, variants) in terms {
            if original.lowercased() == normalized {
                return original
            }
            if variants.contains(where: { $0.lowercased() == normalized }) {
                return original
            }
        }

        return nil
    }

    public func sessionLogURLs() -> [URL] {
        var urls: [URL] = []
        urls.append(contentsOf: codexRecentSessionLogs(days: 120))
        urls.append(contentsOf: shallowLogs(in: homeURL.appendingPathComponent(".codex/archived_sessions")))
        urls.append(contentsOf: claudeProjectLogs())

        return Array(urls.sorted { lhs, rhs in
            let lDate = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let rDate = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return lDate > rDate
        }.prefix(maxLogFiles))
    }

    private func codexRecentSessionLogs(days: Int) -> [URL] {
        let root = homeURL.appendingPathComponent(".codex/sessions")
        let calendar = Calendar(identifier: .gregorian)
        let today = Date()
        var urls: [URL] = []

        for offset in 0..<days {
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today) else { continue }
            let components = calendar.dateComponents([.year, .month, .day], from: date)
            guard let year = components.year,
                  let month = components.month,
                  let day = components.day else {
                continue
            }
            let directory = root
                .appendingPathComponent(String(format: "%04d", year))
                .appendingPathComponent(String(format: "%02d", month))
                .appendingPathComponent(String(format: "%02d", day))
            urls.append(contentsOf: shallowLogs(in: directory))
        }

        return urls
    }

    private func claudeProjectLogs() -> [URL] {
        let root = homeURL.appendingPathComponent(".claude/projects")
        guard let projects = try? fileManager.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            return []
        }

        return projects
            .prefix(120)
            .filter { isDirectory($0) }
            .flatMap { shallowLogs(in: $0).prefix(20) }
    }

    private func shallowLogs(in directory: URL) -> [URL] {
        guard fileManager.fileExists(atPath: directory.path),
              let files = try? fileManager.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey],
                options: [.skipsHiddenFiles, .skipsPackageDescendants]
              ) else {
            return []
        }

        return files.filter { url in
            guard isSearchableLog(url),
                  let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
                  values.isRegularFile == true else {
                return false
            }
            return UInt64(values.fileSize ?? 0) <= maxLogBytes
        }
    }

    private func isDirectory(_ url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
    }

    private func normalizedTerms(from skillNames: [String]) -> [String: [String]] {
        var result: [String: Set<String>] = [:]
        for name in skillNames {
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.count >= 3 else { continue }
            var variants: Set<String> = [trimmed.lowercased()]
            variants.insert(trimmed.replacingOccurrences(of: " ", with: "-").lowercased())
            variants.insert(trimmed.replacingOccurrences(of: "_", with: "-").lowercased())
            result[trimmed] = variants
        }
        return result.mapValues { Array($0) }
    }

    private func normalizedPathTerms(from skills: [SkillRecord]) -> [String: [String]] {
        var result: [String: Set<String>] = [:]

        for skill in skills {
            let folder = URL(fileURLWithPath: skill.path).lastPathComponent
            let skillMarkdown = URL(fileURLWithPath: skill.path).appendingPathComponent("SKILL.md").path
            var variants: Set<String> = [
                skill.path,
                skillMarkdown,
                "/.agents/skills/\(folder)/",
                "/.agents/skills/\(folder)/SKILL.md",
                "/.codex/skills/\(folder)/",
                "/.codex/skills/\(folder)/SKILL.md",
                "/.claude/skills/\(folder)/",
                "/.claude/skills/\(folder)/SKILL.md"
            ]

            if !skill.relativePath.isEmpty {
                variants.insert(skill.relativePath)
                variants.insert("/\(skill.relativePath)/SKILL.md")
            }

            result[skill.name] = variants
        }

        return result.mapValues { Array($0) }
    }

    private func isSearchableLog(_ url: URL) -> Bool {
        let ext = url.pathExtension.lowercased()
        return ["jsonl", "json", "log", "txt", "md"].contains(ext)
    }
}

private extension Data {
    func containsASCII(_ text: String) -> Bool {
        guard let needle = text.data(using: .utf8), !needle.isEmpty else {
            return false
        }
        return range(of: needle) != nil
    }
}
