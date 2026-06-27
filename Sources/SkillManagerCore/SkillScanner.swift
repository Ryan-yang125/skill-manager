import Foundation

public final class SkillScanner: @unchecked Sendable {
    private let fileManager: FileManager
    private let homeURL: URL

    public init(fileManager: FileManager = .default, homeURL: URL = FileManager.default.homeDirectoryForCurrentUser) {
        self.fileManager = fileManager
        self.homeURL = homeURL
    }

    public func defaultRoots() -> [SkillRoot] {
        let roots: [SkillRoot] = [
            SkillRoot(url: homeURL.appendingPathComponent(".agents/skills"), agent: .shared, scope: .user),
            SkillRoot(url: homeURL.appendingPathComponent(".codex/skills"), agent: .codex, scope: .user),
            SkillRoot(url: homeURL.appendingPathComponent(".claude/skills"), agent: .claude, scope: .user)
        ]

        return Array(Set(roots)).sorted { $0.url.path < $1.url.path }
    }

    public func scan(roots: [SkillRoot], usage: [String: UsageHit], now: Date = Date()) -> [SkillRecord] {
        roots.flatMap { root in
            scan(root: root, usage: usage, now: now)
        }
        .uniquedByPath()
        .sorted { lhs, rhs in
            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }
    }

    private func scan(root: SkillRoot, usage: [String: UsageHit], now: Date) -> [SkillRecord] {
        guard fileManager.fileExists(atPath: root.url.path),
              let children = try? fileManager.contentsOfDirectory(
                at: root.url,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles]
              ) else {
            return []
        }

        return children.compactMap { child in
            guard isDirectory(child),
                  !shouldSkipSkillFolder(child),
                  let skillMarkdown = findSkillMarkdown(in: child),
                  let parsed = SkillParser.parse(skillMarkdownURL: skillMarkdown) else {
                return nil
            }

            let size = directorySize(child)
            let tokenEstimate = parsed.contextTokenEstimate
            let hit = usage[parsed.name] ?? usage[child.lastPathComponent] ?? UsageHit()
            let recommendation = recommendationForSkill(
                usageCount: hit.count,
                lastUsedAt: hit.lastUsedAt,
                tokenEstimate: tokenEstimate,
                now: now
            )
            let relative = child.path.replacingOccurrences(of: root.url.path, with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return SkillRecord(
                id: stableID(for: child),
                name: parsed.name,
                title: parsed.title,
                summary: parsed.summary,
                agent: root.agent == .shared ? inferAgent(from: child.path, fallback: root.agent) : root.agent,
                scope: root.scope,
                path: child.path,
                rootPath: root.url.path,
                relativePath: relative,
                sizeBytes: size,
                tokenEstimate: tokenEstimate,
                lastUsedAt: hit.lastUsedAt,
                usageCount: hit.count,
                recommendation: recommendation,
                isArchived: false
            )
        }
    }

    private func recommendationForSkill(
        usageCount: Int,
        lastUsedAt: Date?,
        tokenEstimate: Int,
        now: Date
    ) -> SkillRecommendation {
        if usageCount == 0 {
            return .archive
        }
        guard let lastUsedAt else {
            return .archive
        }

        let days = now.timeIntervalSince(lastUsedAt) / 86_400
        if days >= 90 { return .archive }
        if days >= 30 || tokenEstimate >= 2_000 { return .review }
        return .keep
    }

    private func findSkillMarkdown(in folder: URL) -> URL? {
        let direct = folder.appendingPathComponent("SKILL.md")
        if fileManager.fileExists(atPath: direct.path) { return direct }

        guard let enumerator = fileManager.enumerator(
            at: folder,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            return nil
        }

        for case let url as URL in enumerator {
            if shouldSkipProjectTraversal(url) {
                enumerator.skipDescendants()
                continue
            }
            if url.lastPathComponent == "SKILL.md" {
                return url
            }
        }
        return nil
    }

    private func directorySize(_ url: URL) -> Int64 {
        guard let enumerator = fileManager.enumerator(
            at: url,
            includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else {
            return 0
        }

        var total: Int64 = 0
        for case let fileURL as URL in enumerator {
            if shouldSkipProjectTraversal(fileURL) {
                enumerator.skipDescendants()
                continue
            }
            let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            if values?.isRegularFile == true {
                total += Int64(values?.fileSize ?? 0)
            }
        }
        return total
    }

    private func isDirectory(_ url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
    }

    private func shouldSkipSkillFolder(_ url: URL) -> Bool {
        let name = url.lastPathComponent
        return name.hasPrefix(".") || ["node_modules", ".git", "build", "dist", "DerivedData"].contains(name)
    }

    private func shouldSkipProjectTraversal(_ url: URL) -> Bool {
        let blocked: Set<String> = [
            "node_modules",
            ".git",
            ".build",
            "build",
            "dist",
            "DerivedData",
            ".Trash",
            "Library"
        ]
        return blocked.contains(url.lastPathComponent)
    }

    private func inferAgent(from path: String, fallback: SkillAgent) -> SkillAgent {
        if path.contains("/.codex/") { return .codex }
        if path.contains("/.claude/") { return .claude }
        return fallback
    }

    private func stableID(for url: URL) -> String {
        url.path.data(using: .utf8)?.base64EncodedString() ?? url.path
    }
}

private extension Array where Element == SkillRecord {
    func uniquedByPath() -> [SkillRecord] {
        var seen: Set<String> = []
        var result: [SkillRecord] = []
        for item in self where !seen.contains(item.path) {
            seen.insert(item.path)
            result.append(item)
        }
        return result
    }
}
