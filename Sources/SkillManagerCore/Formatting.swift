import Foundation

public enum SkillFormatting {
    public static func bytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    public static func tokens(_ count: Int) -> String {
        if count >= 1_000 {
            let value = Double(count) / 1_000
            return String(format: "%.1fk", value)
        }
        return "\(count)"
    }

    public static func usageCount(_ count: Int) -> String {
        "\(count) 次"
    }

    public static func contextTokens(_ count: Int) -> String {
        "\(tokens(count)) tokens"
    }

    public static func relativeDate(_ date: Date?, now: Date = Date()) -> String {
        guard let date else { return "从未使用" }
        let seconds = max(0, now.timeIntervalSince(date))
        let days = Int(seconds / 86_400)
        if days == 0 { return "今天" }
        if days == 1 { return "昨天" }
        if days < 30 { return "\(days)天前" }
        if days < 365 { return "\(days / 30)个月前" }
        return "\(days / 365)年前"
    }
}
