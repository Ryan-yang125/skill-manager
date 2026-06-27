import Foundation
import XCTest
@testable import SkillManagerCore

final class SkillManagerCoreTests: XCTestCase {
    private var tempRoot: URL!

    override func setUpWithError() throws {
        tempRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("SkillManagerTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let tempRoot {
            try? FileManager.default.removeItem(at: tempRoot)
        }
    }

    func testParserReadsSkillFrontmatter() throws {
        let skill = try makeSkill(
            path: "skills/video-kit",
            markdown: """
            ---
            name: ai-promo-video-kit
            description: Build short video packages.
            ---

            # AI Promo Video Kit

            Details.
            """
        )

        let parsed = try XCTUnwrap(SkillParser.parse(skillMarkdownURL: skill.appendingPathComponent("SKILL.md")))
        XCTAssertEqual(parsed.name, "ai-promo-video-kit")
        XCTAssertEqual(parsed.title, "AI Promo Video Kit")
        XCTAssertEqual(parsed.summary, "Build short video packages.")
        XCTAssertGreaterThan(parsed.contextTokenEstimate, 1)
    }

    func testParserEstimatesContextFromNameAndDescription() throws {
        let longBody = String(repeating: "This body should not be counted as always-on context. ", count: 200)
        let skill = try makeSkill(
            path: "skills/context-size",
            markdown: """
            ---
            name: context-size
            description: Small frontmatter only.
            ---

            # Context Size

            \(longBody)
            """
        )

        let parsed = try XCTUnwrap(SkillParser.parse(skillMarkdownURL: skill.appendingPathComponent("SKILL.md")))
        XCTAssertLessThan(parsed.contextTokenEstimate, 20)
    }

    func testScannerCombinesSkillMetadataWithUsage() throws {
        let root = tempRoot.appendingPathComponent(".codex/skills", isDirectory: true)
        _ = try makeSkill(
            path: ".codex/skills/ai-promo-video-kit",
            markdown: """
            ---
            name: ai-promo-video-kit
            description: Generate local video packages.
            ---

            # ai-promo-video-kit
            """
        )

        let now = Date(timeIntervalSince1970: 2_000_000)
        let scanner = SkillScanner(homeURL: tempRoot)
        let records = scanner.scan(
            roots: [SkillRoot(url: root, agent: .codex, scope: .user)],
            usage: ["ai-promo-video-kit": UsageHit(count: 3, lastUsedAt: now)],
            now: now
        )

        XCTAssertEqual(records.count, 1)
        XCTAssertEqual(records[0].agent, .codex)
        XCTAssertEqual(records[0].usageCount, 3)
        XCTAssertEqual(records[0].recommendation, .keep)
    }

    func testUsageAnalyzerFindsSkillNamesInLocalSessions() throws {
        let skillURL = try makeSkill(
            path: ".codex/skills/agent-skills-sop",
            markdown: """
            ---
            name: agent-skills-sop
            description: Explain agent skills.
            ---
            """
        )

        let components = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: Date())
        let session = tempRoot
            .appendingPathComponent(".codex/sessions")
            .appendingPathComponent(String(format: "%04d", components.year ?? 2026))
            .appendingPathComponent(String(format: "%02d", components.month ?? 1))
            .appendingPathComponent(String(format: "%02d", components.day ?? 1))
            .appendingPathComponent("run.jsonl")
        try FileManager.default.createDirectory(at: session.deletingLastPathComponent(), withIntermediateDirectories: true)
        try """
        {"type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\\"cmd\\":\\"sed -n '1,220p' \(skillURL.appendingPathComponent("SKILL.md").path)\\"}"}}
        """.write(to: session, atomically: true, encoding: .utf8)

        let record = SkillRecord(
            id: "agent-skills-sop",
            name: "agent-skills-sop",
            title: "agent-skills-sop",
            summary: "Explain agent skills.",
            agent: .codex,
            scope: .user,
            path: skillURL.path,
            rootPath: skillURL.deletingLastPathComponent().path,
            relativePath: "agent-skills-sop",
            sizeBytes: 20,
            tokenEstimate: 12,
            lastUsedAt: nil,
            usageCount: 0,
            recommendation: .archive,
            isArchived: false
        )
        let analyzer = UsageAnalyzer(homeURL: tempRoot)
        let usage = analyzer.analyzeSkillUsage(skills: [record])

        XCTAssertEqual(usage["agent-skills-sop"]?.count, 1)
        XCTAssertNotNil(usage["agent-skills-sop"]?.lastUsedAt)
    }

    func testUsageAnalyzerIgnoresAvailableSkillListInCodexContext() throws {
        let skillURL = try makeSkill(
            path: ".agents/skills/listed-only",
            markdown: """
            ---
            name: listed-only
            description: Listed in context.
            ---
            """
        )

        let components = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: Date())
        let session = tempRoot
            .appendingPathComponent(".codex/sessions")
            .appendingPathComponent(String(format: "%04d", components.year ?? 2026))
            .appendingPathComponent(String(format: "%02d", components.month ?? 1))
            .appendingPathComponent(String(format: "%02d", components.day ?? 1))
            .appendingPathComponent("context.jsonl")
        try FileManager.default.createDirectory(at: session.deletingLastPathComponent(), withIntermediateDirectories: true)
        try """
        {"type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"- listed-only: helper (file: r1/listed-only/SKILL.md)"}]}}
        """.write(to: session, atomically: true, encoding: .utf8)

        let record = SkillRecord(
            id: "listed-only",
            name: "listed-only",
            title: "listed-only",
            summary: "Listed in context.",
            agent: .shared,
            scope: .user,
            path: skillURL.path,
            rootPath: skillURL.deletingLastPathComponent().path,
            relativePath: "listed-only",
            sizeBytes: 20,
            tokenEstimate: 12,
            lastUsedAt: nil,
            usageCount: 0,
            recommendation: .archive,
            isArchived: false
        )
        let analyzer = UsageAnalyzer(homeURL: tempRoot)
        let usage = analyzer.analyzeSkillUsage(skills: [record])

        XCTAssertNil(usage["listed-only"])
    }

    func testUsageAnalyzerReadsClaudeSkillToolCalls() throws {
        let skillURL = try makeSkill(
            path: ".claude/skills/ai-promo-video-kit",
            markdown: """
            ---
            name: ai-promo-video-kit
            description: Create local video packages.
            ---
            """
        )

        let session = tempRoot
            .appendingPathComponent(".claude/projects/local-project", isDirectory: true)
            .appendingPathComponent("session.jsonl")
        try FileManager.default.createDirectory(at: session.deletingLastPathComponent(), withIntermediateDirectories: true)
        try """
        {"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_123","name":"Skill","input":{"skill":"ai-promo-video-kit"}}]}}
        """.write(to: session, atomically: true, encoding: .utf8)

        let record = SkillRecord(
            id: "ai-promo-video-kit",
            name: "ai-promo-video-kit",
            title: "AI Promo Video Kit",
            summary: "Create local video packages.",
            agent: .claude,
            scope: .user,
            path: skillURL.path,
            rootPath: skillURL.deletingLastPathComponent().path,
            relativePath: "ai-promo-video-kit",
            sizeBytes: 20,
            tokenEstimate: 12,
            lastUsedAt: nil,
            usageCount: 0,
            recommendation: .archive,
            isArchived: false
        )
        let analyzer = UsageAnalyzer(homeURL: tempRoot)
        let usage = analyzer.analyzeSkillUsage(skills: [record])

        XCTAssertEqual(usage["ai-promo-video-kit"]?.count, 1)
        XCTAssertNotNil(usage["ai-promo-video-kit"]?.lastUsedAt)
    }

    func testArchiveAndRestoreSkillFolder() throws {
        let skillURL = try makeSkill(
            path: ".codex/skills/old-helper",
            markdown: """
            ---
            name: old-helper
            description: Old helper.
            ---
            """
        )

        let record = SkillRecord(
            id: "old-helper",
            name: "old-helper",
            title: "old-helper",
            summary: "Old helper.",
            agent: .codex,
            scope: .user,
            path: skillURL.path,
            rootPath: skillURL.deletingLastPathComponent().path,
            relativePath: "old-helper",
            sizeBytes: 20,
            tokenEstimate: 12,
            lastUsedAt: nil,
            usageCount: 0,
            recommendation: .archive,
            isArchived: false
        )

        let store = ArchiveStore(applicationSupportURL: tempRoot.appendingPathComponent("Support", isDirectory: true))
        let archived = try store.archive(record, now: Date(timeIntervalSince1970: 2_000_000))

        XCTAssertFalse(FileManager.default.fileExists(atPath: skillURL.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: archived.archivePath))
        XCTAssertEqual(store.archivedSkills().count, 1)

        try store.restore(archived)
        XCTAssertTrue(FileManager.default.fileExists(atPath: skillURL.path))
        XCTAssertTrue(store.archivedSkills().isEmpty)
    }

    private func makeSkill(path: String, markdown: String) throws -> URL {
        let folder = tempRoot.appendingPathComponent(path, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try markdown.write(to: folder.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
        return folder
    }
}
