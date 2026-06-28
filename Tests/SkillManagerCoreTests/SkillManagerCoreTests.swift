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

    func testOperationHistoryStorePersistsNewestFirst() throws {
        let support = tempRoot.appendingPathComponent("Support", isDirectory: true)
        let store = OperationHistoryStore(applicationSupportURL: support)

        try store.append(SkillOperationEntry(
            action: .archive,
            skillName: "old-helper",
            title: "Old Helper",
            originalPath: "/tmp/old-helper",
            archivePath: "/tmp/archive/old-helper",
            createdAt: Date(timeIntervalSince1970: 100),
            succeeded: true,
            message: "Archived"
        ))
        try store.append(SkillOperationEntry(
            action: .restore,
            skillName: "old-helper",
            title: "Old Helper",
            originalPath: "/tmp/old-helper",
            archivePath: "/tmp/archive/old-helper",
            createdAt: Date(timeIntervalSince1970: 200),
            succeeded: true,
            message: "Restored"
        ))

        let entries = store.entries()
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(entries.first?.action, .restore)
        XCTAssertEqual(entries.last?.action, .archive)
    }

    func testInventoryServiceRecordsArchiveAndRestoreHistory() throws {
        let skillURL = try makeSkill(
            path: ".codex/skills/history-helper",
            markdown: """
            ---
            name: history-helper
            description: Helper with history.
            ---
            """
        )
        let record = makeRecord(
            id: "history-helper",
            name: "history-helper",
            title: "History Helper",
            summary: "Helper with history.",
            agent: .codex,
            path: skillURL,
            rootPath: skillURL.deletingLastPathComponent()
        )
        let support = tempRoot.appendingPathComponent("Support", isDirectory: true)
        let historyStore = OperationHistoryStore(applicationSupportURL: support)
        let service = InventoryService(
            scanner: SkillScanner(homeURL: tempRoot),
            usageAnalyzer: UsageAnalyzer(homeURL: tempRoot),
            archiveStore: ArchiveStore(applicationSupportURL: support),
            historyStore: historyStore,
            reportStore: CleanupReportStore(applicationSupportURL: support)
        )

        let archived = try service.archive(record)
        try service.restore(archived)

        let entries = historyStore.entries()
        XCTAssertEqual(entries.count, 2)
        XCTAssertTrue(entries.allSatisfy(\.succeeded))
        XCTAssertTrue(entries.contains { $0.action == .archive && $0.skillName == "history-helper" })
        XCTAssertTrue(entries.contains { $0.action == .restore && $0.skillName == "history-helper" })
    }

    func testCleanupReportStoreExportsMarkdownAndJSON() throws {
        let skillURL = try makeSkill(
            path: ".agents/skills/report-helper",
            markdown: """
            ---
            name: report-helper
            description: Helper for reports.
            ---
            """
        )
        let record = makeRecord(
            id: "report-helper",
            name: "report-helper",
            title: "Report Helper",
            summary: "Helper for reports.",
            agent: .shared,
            path: skillURL,
            rootPath: skillURL.deletingLastPathComponent(),
            tokenEstimate: 14,
            sizeBytes: 120
        )
        let inventory = SkillInventory(
            active: [record],
            archived: [],
            scannedAt: Date(timeIntervalSince1970: 2_000_000)
        )
        let store = CleanupReportStore(applicationSupportURL: tempRoot.appendingPathComponent("Support", isDirectory: true))

        let export = try store.export(
            inventory: inventory,
            skills: [record],
            now: Date(timeIntervalSince1970: 2_000_100)
        )

        XCTAssertTrue(FileManager.default.fileExists(atPath: export.markdownURL.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: export.jsonURL.path))
        let markdown = try String(contentsOf: export.markdownURL, encoding: .utf8)
        XCTAssertTrue(markdown.contains("# Skill Manager Cleanup Plan"))
        XCTAssertTrue(markdown.contains("Report Helper"))
        XCTAssertTrue(markdown.contains("14 tokens"))

        let data = try Data(contentsOf: export.jsonURL)
        let report = try JSONDecoder.skillManagerStore.decode(CleanupPlanReport.self, from: data)
        XCTAssertEqual(report.selectedCount, 1)
        XCTAssertEqual(report.selectedContextTokens, 14)
        XCTAssertEqual(report.skills.first?.name, "report-helper")
    }

    func testReleaseUpdateCheckerDetectsNewerRelease() throws {
        let payload = """
        {
          "tag_name": "v0.1.2",
          "name": "Skill Manager v0.1.2",
          "html_url": "https://github.com/Ryan-yang125/skill-manager/releases/tag/v0.1.2"
        }
        """.data(using: .utf8)!

        let result = try ReleaseUpdateChecker().decode(data: payload, currentVersion: "0.1.1")

        XCTAssertEqual(result.latestVersion, "0.1.2")
        XCTAssertTrue(result.isUpdateAvailable)
        XCTAssertEqual(result.releaseURL.absoluteString, "https://github.com/Ryan-yang125/skill-manager/releases/tag/v0.1.2")
    }

    func testReleaseVersionComparisonHandlesVPREFIXAndPatchDigits() {
        XCTAssertGreaterThan(ReleaseVersion("v0.1.10"), ReleaseVersion("0.1.2"))
        XCTAssertEqual(ReleaseVersion("v0.1.2"), ReleaseVersion("0.1.2"))
        XCTAssertLessThan(ReleaseVersion("0.1.1"), ReleaseVersion("v0.1.2"))
    }

    func testInventoryAuditReportCountsRootsAndReclaimableValues() throws {
        let root = tempRoot.appendingPathComponent(".agents/skills", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        let active = SkillRecord(
            id: "unused",
            name: "unused",
            title: "Unused",
            summary: "Unused helper.",
            agent: .shared,
            scope: .user,
            path: root.appendingPathComponent("unused").path,
            rootPath: root.path,
            relativePath: "unused",
            sizeBytes: 100,
            tokenEstimate: 12,
            lastUsedAt: nil,
            usageCount: 0,
            recommendation: .archive,
            isArchived: false
        )
        let inventory = SkillInventory(active: [active], archived: [], scannedAt: Date(timeIntervalSince1970: 2_000_000))
        let report = inventory.auditReport(
            roots: [SkillRoot(url: root, agent: .shared, scope: .user)],
            generatedAt: Date(timeIntervalSince1970: 2_000_001)
        )

        XCTAssertEqual(report.installedCount, 1)
        XCTAssertEqual(report.unusedCount, 1)
        XCTAssertEqual(report.suggestedArchiveCount, 1)
        XCTAssertEqual(report.contextTokens, 12)
        XCTAssertEqual(report.reclaimableBytes, 100)
        XCTAssertEqual(report.roots.first?.skillCount, 1)
        XCTAssertEqual(report.roots.first?.exists, true)
    }

    private func makeSkill(path: String, markdown: String) throws -> URL {
        let folder = tempRoot.appendingPathComponent(path, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try markdown.write(to: folder.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
        return folder
    }

    private func makeRecord(
        id: String,
        name: String,
        title: String,
        summary: String,
        agent: SkillAgent,
        path: URL,
        rootPath: URL,
        tokenEstimate: Int = 12,
        sizeBytes: Int64 = 20
    ) -> SkillRecord {
        SkillRecord(
            id: id,
            name: name,
            title: title,
            summary: summary,
            agent: agent,
            scope: .user,
            path: path.path,
            rootPath: rootPath.path,
            relativePath: path.lastPathComponent,
            sizeBytes: sizeBytes,
            tokenEstimate: tokenEstimate,
            lastUsedAt: nil,
            usageCount: 0,
            recommendation: .archive,
            isArchived: false
        )
    }
}
