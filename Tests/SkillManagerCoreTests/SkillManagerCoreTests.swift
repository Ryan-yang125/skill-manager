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
        try writeSkillLock(
            """
            {
              "version": 1,
              "skills": {
                "ai-promo-video-kit": {
                  "source": "heygen-com/hyperframes",
                  "sourceType": "github",
                  "sourceUrl": "https://github.com/heygen-com/hyperframes.git",
                  "skillPath": "skills/ai-promo-video-kit/SKILL.md",
                  "installedAt": "2026-03-07T06:44:41.706Z",
                  "updatedAt": "2026-06-17T14:10:36.101Z"
                }
              }
            }
            """
        )

        let now = Date(timeIntervalSince1970: 2_000_000)
        let evidence = UsageEvidence(
            id: "evidence-1",
            skillName: "ai-promo-video-kit",
            agent: .codex,
            kind: .codexSkillRead,
            sessionPath: tempRoot.appendingPathComponent(".codex/sessions/run.jsonl").path,
            occurredAt: now,
            detail: "Codex read"
        )
        let scanner = SkillScanner(homeURL: tempRoot)
        let records = scanner.scan(
            roots: [SkillRoot(url: root, agent: .codex, scope: .user)],
            usage: ["ai-promo-video-kit": UsageHit(count: 3, lastUsedAt: now, evidence: [evidence])],
            now: now
        )

        XCTAssertEqual(records.count, 1)
        XCTAssertEqual(records[0].agent, .codex)
        XCTAssertEqual(records[0].usageCount, 3)
        XCTAssertEqual(records[0].usageEvidence.first?.kind, .codexSkillRead)
        XCTAssertEqual(records[0].recommendation, .keep)
        XCTAssertEqual(records[0].package?.source, "heygen-com/hyperframes")
        XCTAssertEqual(records[0].package?.id, "https://github.com/heygen-com/hyperframes")
        XCTAssertEqual(records[0].package?.skillPath, "skills/ai-promo-video-kit/SKILL.md")
        XCTAssertNotNil(records[0].package?.installedAt)
    }

    func testSkillPackageStoreReadsNpxSkillLock() throws {
        try writeSkillLock(
            """
            {
              "version": 1,
              "skills": {
                "dbs-action": {
                  "source": "dontbesilent2025/dbskill",
                  "sourceType": "github",
                  "sourceUrl": "https://github.com/dontbesilent2025/dbskill.git",
                  "skillPath": "skills/dbs-action/SKILL.md",
                  "pluginName": "dbs-action",
                  "installedAt": "2026-03-07T06:44:41.706Z",
                  "updatedAt": "2026-03-08T06:44:41Z"
                }
              }
            }
            """
        )

        let packages = SkillPackageStore(homeURL: tempRoot).metadataBySkillName()
        let package = try XCTUnwrap(packages["dbs-action"])

        XCTAssertEqual(package.id, "https://github.com/dontbesilent2025/dbskill")
        XCTAssertEqual(package.source, "dontbesilent2025/dbskill")
        XCTAssertEqual(package.sourceType, "github")
        XCTAssertEqual(package.sourceURL, "https://github.com/dontbesilent2025/dbskill.git")
        XCTAssertEqual(package.skillPath, "skills/dbs-action/SKILL.md")
        XCTAssertEqual(packages["dbs-action"]?.id, package.id)
        XCTAssertNotNil(package.installedAt)
        XCTAssertNotNil(package.updatedAt)
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
        XCTAssertEqual(usage["agent-skills-sop"]?.evidence.first?.kind, .codexSkillRead)
        XCTAssertEqual(usage["agent-skills-sop"]?.evidence.first?.agent, .codex)
        XCTAssertEqual(usage["agent-skills-sop"]?.evidence.first?.sessionPath, session.path)
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
        XCTAssertEqual(usage["ai-promo-video-kit"]?.evidence.first?.kind, .claudeSkillTool)
        XCTAssertEqual(usage["ai-promo-video-kit"]?.evidence.first?.agent, .claude)
        XCTAssertEqual(usage["ai-promo-video-kit"]?.evidence.first?.sessionPath, session.path)
    }

    func testUsageAnalyzerReportsSessionRootDiagnostics() throws {
        let codexRoot = tempRoot.appendingPathComponent(".codex/sessions/2026/06/29", isDirectory: true)
        let claudeRoot = tempRoot.appendingPathComponent(".claude/projects/local-project", isDirectory: true)
        try FileManager.default.createDirectory(at: codexRoot, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: claudeRoot, withIntermediateDirectories: true)
        try "{}".write(to: codexRoot.appendingPathComponent("codex.jsonl"), atomically: true, encoding: .utf8)
        try "{}".write(to: claudeRoot.appendingPathComponent("claude.jsonl"), atomically: true, encoding: .utf8)

        let audits = UsageAnalyzer(homeURL: tempRoot).sessionRootAudits()
        let codex = try XCTUnwrap(audits.first { $0.path.hasSuffix(".codex/sessions") })
        let claude = try XCTUnwrap(audits.first { $0.path.hasSuffix(".claude/projects") })

        XCTAssertTrue(codex.exists)
        XCTAssertEqual(codex.logCount, 1)
        XCTAssertTrue(claude.exists)
        XCTAssertEqual(claude.logCount, 1)
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

    func testSkillDecisionStorePersistsAndClearsDecisions() throws {
        let support = tempRoot.appendingPathComponent("Support", isDirectory: true)
        let store = SkillDecisionStore(applicationSupportURL: support)

        try store.setDecision(.protected, for: "skill-one", now: Date(timeIntervalSince1970: 100))
        XCTAssertEqual(store.decision(for: "skill-one"), .protected)

        let reloaded = SkillDecisionStore(applicationSupportURL: support)
        XCTAssertEqual(reloaded.decisions()["skill-one"]?.decision, .protected)

        try reloaded.setDecision(.review, for: "skill-one", now: Date(timeIntervalSince1970: 200))
        XCTAssertEqual(reloaded.decision(for: "skill-one"), .review)

        try reloaded.setDecision(nil, for: "skill-one")
        XCTAssertTrue(reloaded.decisions().isEmpty)
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
            reportStore: CleanupReportStore(applicationSupportURL: support),
            decisionStore: SkillDecisionStore(applicationSupportURL: support)
        )

        let archived = try service.archive(record)
        try service.restore(archived)

        let entries = historyStore.entries()
        XCTAssertEqual(entries.count, 2)
        XCTAssertTrue(entries.allSatisfy(\.succeeded))
        XCTAssertTrue(entries.contains { $0.action == .archive && $0.skillName == "history-helper" })
        XCTAssertTrue(entries.contains { $0.action == .restore && $0.skillName == "history-helper" })
    }

    func testInventoryServiceExcludesProtectedAndReviewSkillsFromCleanup() throws {
        let root = tempRoot.appendingPathComponent(".codex/skills", isDirectory: true)
        let protectedURL = try makeSkill(path: ".codex/skills/protected-helper", markdown: """
        ---
        name: protected-helper
        description: Protected helper.
        ---
        """)
        let reviewURL = try makeSkill(path: ".codex/skills/review-helper", markdown: """
        ---
        name: review-helper
        description: Review helper.
        ---
        """)
        let cleanupURL = try makeSkill(path: ".codex/skills/cleanup-helper", markdown: """
        ---
        name: cleanup-helper
        description: Cleanup helper.
        ---
        """)

        let protected = makeRecord(id: "protected-helper", name: "protected-helper", title: "Protected Helper", summary: "Protected helper.", agent: .codex, path: protectedURL, rootPath: root)
        let review = makeRecord(id: "review-helper", name: "review-helper", title: "Review Helper", summary: "Review helper.", agent: .codex, path: reviewURL, rootPath: root)
        let cleanup = makeRecord(id: "cleanup-helper", name: "cleanup-helper", title: "Cleanup Helper", summary: "Cleanup helper.", agent: .codex, path: cleanupURL, rootPath: root)
        let inventory = SkillInventory(active: [protected, review, cleanup], archived: [], scannedAt: Date(timeIntervalSince1970: 2_200_000))
        let support = tempRoot.appendingPathComponent("Support", isDirectory: true)
        let service = InventoryService(
            scanner: SkillScanner(homeURL: tempRoot),
            usageAnalyzer: UsageAnalyzer(homeURL: tempRoot),
            archiveStore: ArchiveStore(applicationSupportURL: support),
            historyStore: OperationHistoryStore(applicationSupportURL: support),
            reportStore: CleanupReportStore(applicationSupportURL: support),
            decisionStore: SkillDecisionStore(applicationSupportURL: support)
        )

        try service.setDecision(.protected, for: protected, now: Date(timeIntervalSince1970: 2_200_001))
        try service.setDecision(.review, for: review, now: Date(timeIntervalSince1970: 2_200_002))

        XCTAssertEqual(service.cleanupCandidates(in: inventory).map(\.name), ["cleanup-helper"])
        XCTAssertEqual(service.protectedSkills(in: inventory).map(\.name), ["protected-helper"])
        XCTAssertEqual(service.reviewSkills(in: inventory).map(\.name), ["review-helper"])

        let export = try service.exportCleanupReport(
            inventory: inventory,
            skills: [cleanup],
            now: Date(timeIntervalSince1970: 2_200_003)
        )
        let data = try Data(contentsOf: export.jsonURL)
        let report = try JSONDecoder.skillManagerStore.decode(CleanupPlanReport.self, from: data)
        XCTAssertEqual(report.protectedExcludedCount, 1)
        XCTAssertEqual(report.reviewExcludedCount, 1)
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
            sizeBytes: 120,
            package: SkillPackageMetadata(
                id: "https://github.com/example/package",
                source: "example/package",
                sourceType: "github",
                sourceURL: "https://github.com/example/package.git",
                skillPath: "skills/report-helper/SKILL.md",
                installedAt: Date(timeIntervalSince1970: 1_900_000),
                updatedAt: Date(timeIntervalSince1970: 1_900_100)
            )
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
        XCTAssertTrue(markdown.contains("No local usage evidence"))
        XCTAssertTrue(markdown.contains("No evidence"))
        XCTAssertTrue(markdown.contains("example/package"))

        let data = try Data(contentsOf: export.jsonURL)
        let report = try JSONDecoder.skillManagerStore.decode(CleanupPlanReport.self, from: data)
        XCTAssertEqual(report.selectedCount, 1)
        XCTAssertEqual(report.selectedContextTokens, 14)
        XCTAssertEqual(report.skills.first?.name, "report-helper")
        XCTAssertEqual(report.skills.first?.recommendationReason, "No local usage evidence")
        XCTAssertEqual(report.skills.first?.evidenceCount, 0)
        XCTAssertEqual(report.skills.first?.packageSource, "example/package")
        XCTAssertEqual(report.skills.first?.packageSourceURL, "https://github.com/example/package.git")

        let secondExport = try store.export(
            inventory: inventory,
            skills: [record],
            now: Date(timeIntervalSince1970: 2_000_101)
        )
        XCTAssertNotEqual(export.markdownURL, secondExport.markdownURL)
    }

    func testFakeSkillCleanupFlowScansReportsArchivesAndRestores() throws {
        let skillURL = try makeSkill(
            path: ".codex/skills/fake-cleanup-skill",
            markdown: """
            ---
            name: fake-cleanup-skill
            description: Temporary cleanup validation skill.
            ---

            # Fake Cleanup Skill
            """
        )
        let support = tempRoot.appendingPathComponent("Support", isDirectory: true)
        let service = InventoryService(
            scanner: SkillScanner(homeURL: tempRoot),
            usageAnalyzer: UsageAnalyzer(homeURL: tempRoot),
            archiveStore: ArchiveStore(applicationSupportURL: support),
            historyStore: OperationHistoryStore(applicationSupportURL: support),
            reportStore: CleanupReportStore(applicationSupportURL: support),
            decisionStore: SkillDecisionStore(applicationSupportURL: support)
        )

        let inventory = service.loadInventory(now: Date(timeIntervalSince1970: 2_100_000))
        XCTAssertEqual(inventory.active.count, 1)
        XCTAssertEqual(inventory.archived.count, 0)
        let candidate = try XCTUnwrap(inventory.archiveCandidates.first)
        XCTAssertEqual(candidate.name, "fake-cleanup-skill")
        XCTAssertEqual(URL(fileURLWithPath: candidate.path).standardizedFileURL.path, skillURL.standardizedFileURL.path)

        try service.setDecision(.protected, for: candidate, now: Date(timeIntervalSince1970: 2_100_000.5))
        XCTAssertTrue(service.cleanupCandidates(in: inventory).isEmpty)
        try service.setDecision(nil, for: candidate, now: Date(timeIntervalSince1970: 2_100_000.75))
        XCTAssertEqual(service.cleanupCandidates(in: inventory).map(\.name), ["fake-cleanup-skill"])

        let export = try service.exportCleanupReport(
            inventory: inventory,
            skills: [candidate],
            now: Date(timeIntervalSince1970: 2_100_001)
        )
        XCTAssertTrue(FileManager.default.fileExists(atPath: export.markdownURL.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: export.jsonURL.path))
        XCTAssertEqual(export.markdownURL.deletingLastPathComponent(), service.cleanupReportsDirectoryURL)

        let archived = try service.archive(candidate)
        XCTAssertFalse(FileManager.default.fileExists(atPath: skillURL.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: archived.archivePath))

        let afterArchive = service.loadInventory(now: Date(timeIntervalSince1970: 2_100_002))
        XCTAssertTrue(afterArchive.active.isEmpty)
        XCTAssertEqual(afterArchive.archived.count, 1)

        try service.restore(archived)
        XCTAssertTrue(FileManager.default.fileExists(atPath: skillURL.path))

        let afterRestore = service.loadInventory(now: Date(timeIntervalSince1970: 2_100_003))
        XCTAssertEqual(afterRestore.active.count, 1)
        XCTAssertTrue(afterRestore.archived.isEmpty)

        let history = service.operationHistory()
        XCTAssertEqual(history.count, 2)
        XCTAssertEqual(history.first?.action, .restore)
        XCTAssertEqual(history.last?.action, .archive)
        XCTAssertTrue(history.allSatisfy(\.succeeded))
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

    private func writeSkillLock(_ json: String) throws {
        let lockURL = tempRoot.appendingPathComponent(".agents/.skill-lock.json")
        try FileManager.default.createDirectory(at: lockURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try json.write(to: lockURL, atomically: true, encoding: .utf8)
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
        sizeBytes: Int64 = 20,
        package: SkillPackageMetadata? = nil
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
            package: package,
            recommendation: .archive,
            isArchived: false
        )
    }
}
