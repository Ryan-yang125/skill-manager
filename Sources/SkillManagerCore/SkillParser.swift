import Foundation

public struct ParsedSkill: Hashable, Sendable {
    public var name: String
    public var title: String
    public var summary: String
    public var contextTokenEstimate: Int

    public init(name: String, title: String, summary: String, contextTokenEstimate: Int) {
        self.name = name
        self.title = title
        self.summary = summary
        self.contextTokenEstimate = contextTokenEstimate
    }
}

public enum SkillParser {
    public static func parse(skillMarkdownURL: URL) -> ParsedSkill? {
        guard let data = try? Data(contentsOf: skillMarkdownURL),
              let raw = String(data: data, encoding: .utf8) else {
            return nil
        }

        let folderName = skillMarkdownURL.deletingLastPathComponent().lastPathComponent
        let frontmatter = extractFrontmatter(from: raw)
        let name = frontmatter["name"]?.trimmedNonEmpty ?? folderName
        let description = frontmatter["description"]?.trimmedNonEmpty
        let heading = raw
            .components(separatedBy: .newlines)
            .first { $0.hasPrefix("# ") }?
            .dropFirst(2)
            .description
            .trimmedNonEmpty

        let summary = description ?? firstMeaningfulParagraph(in: raw) ?? "本地 Skill"
        return ParsedSkill(
            name: name,
            title: heading ?? name,
            summary: summary,
            contextTokenEstimate: estimateTokens("\(name)\n\(summary)")
        )
    }

    public static func estimateTokens(_ text: String) -> Int {
        let scalarCount = text.unicodeScalars.count
        let wordCount = text.split { $0.isWhitespace || $0.isPunctuation }.count
        let cjkCount = text.unicodeScalars.filter { scalar in
            (0x4E00...0x9FFF).contains(Int(scalar.value))
        }.count

        let latinEstimate = max(wordCount, scalarCount / 5)
        return max(1, latinEstimate + cjkCount / 2)
    }

    private static func extractFrontmatter(from raw: String) -> [String: String] {
        let lines = raw.components(separatedBy: .newlines)
        guard lines.first?.trimmingCharacters(in: .whitespacesAndNewlines) == "---" else {
            return [:]
        }

        var result: [String: String] = [:]
        for line in lines.dropFirst() {
            if line.trimmingCharacters(in: .whitespacesAndNewlines) == "---" {
                break
            }
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = String(line[..<colon]).trimmingCharacters(in: .whitespacesAndNewlines)
            var value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespacesAndNewlines)
            if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
                value.removeFirst()
                value.removeLast()
            }
            result[key] = value
        }
        return result
    }

    private static func firstMeaningfulParagraph(in raw: String) -> String? {
        raw.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { paragraph in
                !paragraph.isEmpty &&
                !paragraph.hasPrefix("---") &&
                !paragraph.hasPrefix("#") &&
                paragraph.count > 16
            }
    }
}

private extension String {
    var trimmedNonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
