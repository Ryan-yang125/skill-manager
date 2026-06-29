import AppKit
import Foundation
import SwiftUI
import SkillManagerCore

@MainActor
final class AppModel: ObservableObject {
    enum Section: String, CaseIterable, Identifiable, Hashable {
        case all = "全部 Skills"
        case unused = "未使用"
        case suggested = "建议归档"
        case review = "待复查"
        case protected = "已保护"
        case cleanupPlan = "清理计划"
        case diagnostics = "扫描诊断"
        case archived = "已归档"
        case history = "操作历史"

        var id: String { rawValue }

        var systemImage: String {
            switch self {
            case .all: return "doc.text"
            case .unused: return "circle.slash"
            case .suggested: return "archivebox"
            case .review: return "exclamationmark.circle"
            case .protected: return "shield"
            case .cleanupPlan: return "checklist"
            case .diagnostics: return "waveform.path.ecg"
            case .archived: return "tray.full"
            case .history: return "clock.arrow.circlepath"
            }
        }
    }

    enum SortOption: String, CaseIterable, Identifiable {
        case recent = "最近使用"
        case usage = "使用次数"
        case context = "上下文占用"
        case name = "名称"

        var id: String { rawValue }
    }

    enum SidebarSelection: Hashable, Identifiable {
        case section(Section)
        case agent(SkillAgent)
        case collection(String)

        var id: String {
            switch self {
            case .section(let section): return "section:\(section.id)"
            case .agent(let agent): return "agent:\(agent.rawValue)"
            case .collection(let id): return "collection:\(id)"
            }
        }
    }

    enum UpdateCheckState: Equatable {
        case idle
        case checking
        case current(String)
        case available(ReleaseCheckResult)
        case failed(String)
    }

    struct SkillCollection: Identifiable, Hashable {
        var id: String
        var title: String
        var count: Int
        var tokenEstimate: Int
    }

    private struct CleanupArchiveResult: Sendable {
        var export: CleanupReportExport?
        var archivedCount: Int
        var failures: [String]
    }

    @Published var inventory = SkillInventory(active: [], archived: [], scannedAt: Date())
    @Published var selectedFilter: SidebarSelection = .section(.all)
    @Published var selectedSkillID: String?
    @Published var searchText = ""
    @Published var sortOption: SortOption = .recent
    @Published var isInspectorPresented = true
    @Published var isScanning = false
    @Published var statusMessage = "准备扫描"
    @Published var errorMessage: String?
    @Published var pendingArchiveSkill: SkillRecord?
    @Published var confirmingArchiveSuggested = false
    @Published var confirmingArchiveCleanupPlan = false
    @Published var auditReport: InventoryAuditReport?
    @Published var sessionRootAudits: [UsageSessionRootAudit] = []
    @Published var operationHistory: [SkillOperationEntry] = []
    @Published var skillDecisions: [String: SkillDecisionRecord] = [:]
    @Published var selectedCleanupSkillIDs: Set<String> = []
    @Published var latestCleanupReportPath: String?
    @Published var latestCleanupReportJSONPath: String?
    @Published var cleanupResultSummary: String?
    @Published var updateCheckState: UpdateCheckState = .idle
    @Published var isArchiving = false

    private let service = InventoryService()
    private let updateChecker = ReleaseUpdateChecker()

    var filteredSkills: [SkillRecord] {
        sortedSkills(searchFilteredSkills(baseSkillsForSelection()))
    }

    var selectedSkill: SkillRecord? {
        guard let selectedSkillID else { return filteredSkills.first }
        return inventory.active.first { $0.id == selectedSkillID }
    }

    var archiveCandidatesCount: Int {
        suggestedArchiveSkills.count
    }

    var suggestedArchiveSkills: [SkillRecord] {
        sortedSkills(inventory.archiveCandidates.filter { decision(for: $0) == nil })
    }

    var protectedSkills: [SkillRecord] {
        sortedSkills(inventory.active.filter { decision(for: $0) == .protected })
    }

    var reviewSkills: [SkillRecord] {
        sortedSkills(inventory.active.filter { skill in
            if decision(for: skill) == .protected { return false }
            return decision(for: skill) == .review || skill.recommendation == .review
        })
    }

    var cleanupCandidates: [SkillRecord] {
        suggestedArchiveSkills
    }

    var selectedCleanupSkills: [SkillRecord] {
        cleanupCandidates.filter { selectedCleanupSkillIDs.contains($0.id) }
    }

    var cleanupSelectedCount: Int {
        selectedCleanupSkills.count
    }

    var cleanupSelectedContextTokens: Int {
        selectedCleanupSkills.reduce(0) { $0 + $1.tokenEstimate }
    }

    var cleanupSelectedBytes: Int64 {
        selectedCleanupSkills.reduce(0) { $0 + $1.sizeBytes }
    }

    var cleanupReportsDirectoryPath: String {
        service.cleanupReportsDirectoryURL.path
    }

    var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

    var updateStatusText: String {
        switch updateCheckState {
        case .idle:
            return "未检查更新"
        case .checking:
            return "正在检查更新"
        case .current(let version):
            return "已是最新 \(version)"
        case .available(let result):
            return "可更新到 \(result.tagName)"
        case .failed(let message):
            return message
        }
    }

    var updateActionTitle: String {
        switch updateCheckState {
        case .available:
            return "下载更新"
        case .checking:
            return "检查中"
        default:
            return "检查更新"
        }
    }

    var healthScore: Int {
        guard !inventory.active.isEmpty else { return 100 }
        let stalePenalty = min(45, inventory.archiveCandidates.count * 4)
        let contextPenalty = min(25, inventory.totalContextTokens / 80)
        return max(0, 100 - stalePenalty - contextPenalty)
    }

    var visibleAgents: [SkillAgent] {
        [.shared, .codex, .claude].filter { agentCount($0) > 0 }
    }

    var skillCollections: [SkillCollection] {
        let grouped = Dictionary(grouping: inventory.active, by: collectionID(for:))
        return grouped.compactMap { id, skills in
            guard id != "single", skills.count > 1 else { return nil }
            return SkillCollection(
                id: id,
                title: collectionTitle(for: id),
                count: skills.count,
                tokenEstimate: skills.reduce(0) { $0 + $1.tokenEstimate }
            )
        }
        .sorted { lhs, rhs in
            if lhs.count != rhs.count { return lhs.count > rhs.count }
            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }
    }

    var displayTitle: String {
        switch selectedFilter {
        case .section(let section):
            return section.rawValue
        case .agent(let agent):
            return agent.rawValue
        case .collection(let id):
            return collectionTitle(for: id)
        }
    }

    var displaySummary: String {
        switch selectedFilter {
        case .section(.all):
            return "\(inventory.active.count) installed · \(SkillFormatting.tokens(inventory.totalContextTokens)) context tokens"
        case .section(.unused):
            return "\(inventory.unused.count) unused · \(SkillFormatting.tokens(inventory.unused.reduce(0) { $0 + $1.tokenEstimate })) context tokens"
        case .section(.suggested):
            return "\(archiveCandidatesCount) suggested · \(SkillFormatting.tokens(suggestedArchiveSkills.reduce(0) { $0 + $1.tokenEstimate })) context tokens"
        case .section(.review):
            return "\(reviewSkills.count) to review · \(SkillFormatting.tokens(reviewSkills.reduce(0) { $0 + $1.tokenEstimate })) context tokens"
        case .section(.protected):
            return "\(protectedSkills.count) protected · excluded from cleanup"
        case .section(.cleanupPlan):
            return "\(cleanupSelectedCount) selected · \(SkillFormatting.tokens(cleanupSelectedContextTokens)) context tokens"
        case .section(.diagnostics):
            return "\(usageEvidenceCount) evidence hits · \(sessionRootAudits.filter(\.exists).count) session roots"
        case .section(.archived):
            return "\(inventory.archived.count) archived"
        case .section(.history):
            return "\(operationHistory.count) local operations"
        case .agent(let agent):
            let skills = inventory.active.filter { $0.agent == agent }
            return "\(skills.count) skills · \(SkillFormatting.tokens(skills.reduce(0) { $0 + $1.tokenEstimate })) context tokens"
        case .collection(let id):
            let skills = inventory.active.filter { collectionID(for: $0) == id }
            return "\(skills.count) skills · \(SkillFormatting.tokens(skills.reduce(0) { $0 + $1.tokenEstimate })) context tokens"
        }
    }

    var showingArchived: Bool {
        selectedFilter == .section(.archived)
    }

    var showingCleanupPlan: Bool {
        selectedFilter == .section(.cleanupPlan)
    }

    var showingHistory: Bool {
        selectedFilter == .section(.history)
    }

    var showingDiagnostics: Bool {
        selectedFilter == .section(.diagnostics)
    }

    var usageEvidenceCount: Int {
        inventory.active.reduce(0) { $0 + $1.usageEvidence.count }
    }

    func count(for section: Section) -> Int {
        switch section {
        case .all: return inventory.active.count
        case .unused: return inventory.unused.count
        case .suggested: return suggestedArchiveSkills.count
        case .review: return reviewSkills.count
        case .protected: return protectedSkills.count
        case .cleanupPlan: return cleanupCandidates.count
        case .diagnostics: return auditReport?.roots.count ?? 0
        case .archived: return inventory.archived.count
        case .history: return operationHistory.count
        }
    }

    func agentCount(_ agent: SkillAgent) -> Int {
        inventory.active.filter { $0.agent == agent }.count
    }

    func collectionID(for skill: SkillRecord) -> String {
        let name = skill.name.lowercased()
        let folder = URL(fileURLWithPath: skill.path).lastPathComponent.lowercased()
        let source = name.isEmpty ? folder : name

        if let colon = source.firstIndex(of: ":") {
            return String(source[..<colon])
        }
        if source == "dbs" || source.hasPrefix("dbs-") { return "dbs" }
        if source.hasPrefix("baoyu-") { return "baoyu" }
        if source == "hyperframes" || source.hasPrefix("hyperframes-") { return "hyperframes" }
        if source.hasPrefix("cloudflare-") { return "cloudflare" }
        if source.hasPrefix("github-") { return "github" }
        if source.hasPrefix("gmail-") { return "gmail" }
        if source.hasPrefix("agent-browser") { return "agent-browser" }
        return "single"
    }

    func collectionTitle(for id: String) -> String {
        switch id {
        case "dbs": return "DBS"
        case "baoyu": return "Baoyu"
        case "hyperframes": return "HyperFrames"
        case "cloudflare": return "Cloudflare"
        case "github": return "GitHub"
        case "gmail": return "Gmail"
        case "agent-browser": return "Agent Browser"
        default:
            return id
                .split(separator: "-")
                .map { $0.prefix(1).uppercased() + $0.dropFirst() }
                .joined(separator: " ")
        }
    }

    func reload() {
        reload(statusAfterScan: nil)
    }

    private func reload(statusAfterScan: String?) {
        guard !isScanning else { return }
        isScanning = true
        statusMessage = "扫描中"
        errorMessage = nil

        Task {
            let service = self.service
            let result = await Task.detached(priority: .userInitiated) {
                service.loadInventory()
            }.value

            inventory = result
            auditReport = service.auditReport(for: result)
            sessionRootAudits = service.sessionRootAudits()
            operationHistory = service.operationHistory()
            skillDecisions = service.skillDecisions()
            selectedCleanupSkillIDs = Set(cleanupCandidates.map { $0.id })
            selectedSkillID = filteredSkills.first?.id
            statusMessage = statusAfterScan ?? "上次扫描 \(SkillFormatting.relativeDate(result.scannedAt))"
            isScanning = false
        }
    }

    func archive(_ skill: SkillRecord) {
        guard decision(for: skill) != .protected else {
            statusMessage = "\(skill.title) 已保护，取消保护后才能归档"
            return
        }
        guard !isArchiving else { return }
        isArchiving = true
        statusMessage = "正在归档 \(skill.title)"
        Task {
            do {
                let service = self.service
                _ = try await Task.detached(priority: .userInitiated) {
                    try service.archive(skill)
                }.value
                isArchiving = false
                operationHistory = service.operationHistory()
                reload(statusAfterScan: "已归档 \(skill.title)，可在“已归档”恢复")
            } catch {
                isArchiving = false
                errorMessage = error.localizedDescription
            }
        }
    }

    func requestArchive(_ skill: SkillRecord) {
        pendingArchiveSkill = skill
    }

    func archiveSuggested() {
        let candidates = suggestedArchiveSkills
        guard !candidates.isEmpty else { return }
        guard !isArchiving else { return }
        isArchiving = true
        statusMessage = "正在归档建议项"
        Task {
            let service = self.service
            let result = await Task.detached(priority: .userInitiated) {
                var archivedCount = 0
                var failures: [String] = []
                for skill in candidates {
                    do {
                        _ = try service.archive(skill)
                        archivedCount += 1
                    } catch {
                        failures.append("\(skill.title)：\(error.localizedDescription)")
                    }
                }
                return (archivedCount, failures)
            }.value

            isArchiving = false
            if !result.1.isEmpty {
                errorMessage = result.1.prefix(3).joined(separator: "\n")
            }
            operationHistory = service.operationHistory()
            reload(statusAfterScan: "已归档 \(result.0) 个建议项")
        }
    }

    func requestArchiveSuggested() {
        confirmingArchiveSuggested = true
    }

    func decision(for skill: SkillRecord) -> SkillUserDecision? {
        skillDecisions[skill.id]?.decision
    }

    func setProtected(_ skill: SkillRecord) {
        setDecision(.protected, for: skill)
    }

    func setNeedsReview(_ skill: SkillRecord) {
        setDecision(.review, for: skill)
    }

    func clearDecision(for skill: SkillRecord) {
        setDecision(nil, for: skill)
    }

    func isCleanupSelected(_ skill: SkillRecord) -> Bool {
        selectedCleanupSkillIDs.contains(skill.id)
    }

    func setCleanupSelected(_ selected: Bool, for skill: SkillRecord) {
        if selected {
            selectedCleanupSkillIDs.insert(skill.id)
        } else {
            selectedCleanupSkillIDs.remove(skill.id)
        }
    }

    func selectAllCleanupCandidates() {
        selectedCleanupSkillIDs = Set(cleanupCandidates.map { $0.id })
    }

    func clearCleanupSelection() {
        selectedCleanupSkillIDs.removeAll()
    }

    func requestArchiveCleanupPlan() {
        confirmingArchiveCleanupPlan = true
    }

    func exportCleanupPlanReport() {
        let selected = selectedCleanupSkills
        guard !selected.isEmpty else {
            statusMessage = "没有选中的清理项"
            return
        }

        do {
            let export = try service.exportCleanupReport(inventory: inventory, skills: selected)
            latestCleanupReportPath = export.markdownURL.path
            latestCleanupReportJSONPath = export.jsonURL.path
            cleanupResultSummary = "已导出 \(selected.count) 个清理项的报告"
            statusMessage = "已导出清理报告"
            NSWorkspace.shared.activateFileViewerSelecting([export.markdownURL])
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func revealLatestCleanupReport() {
        guard let latestCleanupReportPath else { return }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: latestCleanupReportPath)])
    }

    func revealCleanupReportsDirectory() {
        let url = service.cleanupReportsDirectoryURL
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        NSWorkspace.shared.open(url)
    }

    func clearCleanupResultSummary() {
        cleanupResultSummary = nil
    }

    func archiveSelectedCleanupPlan() {
        let selected = selectedCleanupSkills
        guard !selected.isEmpty else {
            statusMessage = "没有选中的清理项"
            return
        }
        guard !isArchiving else { return }
        isArchiving = true
        statusMessage = "正在执行清理计划"

        Task {
            let service = self.service
            let inventory = self.inventory
            let result = await Task.detached(priority: .userInitiated) {
                var report: CleanupReportExport?
                var archivedCount = 0
                var failures: [String] = []

                do {
                    report = try service.exportCleanupReport(inventory: inventory, skills: selected)
                } catch {
                    failures.append("导出报告：\(error.localizedDescription)")
                    return CleanupArchiveResult(export: report, archivedCount: archivedCount, failures: failures)
                }

                for skill in selected {
                    do {
                        _ = try service.archive(skill)
                        archivedCount += 1
                    } catch {
                        failures.append("\(skill.title)：\(error.localizedDescription)")
                    }
                }
                return CleanupArchiveResult(export: report, archivedCount: archivedCount, failures: failures)
            }.value

            isArchiving = false
            if let report = result.export {
                latestCleanupReportPath = report.markdownURL.path
                latestCleanupReportJSONPath = report.jsonURL.path
            }

            if result.export == nil {
                let message = result.failures.first ?? "导出报告失败"
                cleanupResultSummary = "清理计划未执行：\(message)"
                statusMessage = cleanupResultSummary ?? "清理计划未执行"
                errorMessage = message
                return
            }

            let failureCount = result.failures.count
            cleanupResultSummary = cleanupSummary(
                archivedCount: result.archivedCount,
                failureCount: failureCount,
                reportPath: result.export?.markdownURL.path
            )
            if failureCount > 0 {
                errorMessage = result.failures.prefix(3).joined(separator: "\n")
            }
            selectedFilter = .section(.history)
            operationHistory = service.operationHistory()
            reload(statusAfterScan: cleanupResultSummary)
        }
    }

    func restore(_ archived: ArchivedSkill) {
        guard !isArchiving else { return }
        isArchiving = true
        statusMessage = "正在恢复 \(archived.title)"
        Task {
            do {
                let service = self.service
                try await Task.detached(priority: .userInitiated) {
                    try service.restore(archived)
                }.value
                isArchiving = false
                operationHistory = service.operationHistory()
                reload(statusAfterScan: "已恢复 \(archived.title)")
            } catch {
                isArchiving = false
                errorMessage = error.localizedDescription
            }
        }
    }

    func checkForUpdates() {
        guard updateCheckState != .checking else { return }
        updateCheckState = .checking

        Task {
            do {
                let checker = self.updateChecker
                let currentVersion = self.currentVersion
                let result = try await checker.check(currentVersion: currentVersion)
                updateCheckState = result.isUpdateAvailable ? .available(result) : .current(currentVersion)
            } catch {
                updateCheckState = .failed("更新检查失败")
                errorMessage = error.localizedDescription
            }
        }
    }

    func openUpdateRelease() {
        if case .available(let result) = updateCheckState {
            NSWorkspace.shared.open(result.releaseURL)
            return
        }
        if let url = URL(string: "https://github.com/Ryan-yang125/skill-manager/releases/latest") {
            NSWorkspace.shared.open(url)
        }
    }

    func reveal(_ skill: SkillRecord) {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: skill.path)])
    }

    func reveal(_ archived: ArchivedSkill) {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: archived.archivePath)])
    }

    func revealEvidence(_ evidence: UsageEvidence) {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: evidence.sessionPath)])
    }

    func select(_ selection: SidebarSelection) {
        selectedFilter = selection
        selectedSkillID = filteredSkills.first?.id
    }

    private func baseSkillsForSelection() -> [SkillRecord] {
        switch selectedFilter {
        case .section(.all):
            return inventory.active
        case .section(.unused):
            return inventory.active.filter { $0.usageCount == 0 }
        case .section(.suggested):
            return suggestedArchiveSkills
        case .section(.review):
            return reviewSkills
        case .section(.protected):
            return protectedSkills
        case .section(.cleanupPlan):
            return cleanupCandidates
        case .section(.diagnostics):
            return []
        case .section(.archived):
            return []
        case .section(.history):
            return []
        case .agent(let agent):
            return inventory.active.filter { $0.agent == agent }
        case .collection(let id):
            return inventory.active.filter { collectionID(for: $0) == id }
        }
    }

    private func searchFilteredSkills(_ skills: [SkillRecord]) -> [SkillRecord] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return skills }

        return skills.filter { skill in
            skill.title.lowercased().contains(query) ||
            skill.name.lowercased().contains(query) ||
            skill.summary.lowercased().contains(query) ||
            skill.agent.rawValue.lowercased().contains(query) ||
            collectionTitle(for: collectionID(for: skill)).lowercased().contains(query)
        }
    }

    private func sortedSkills(_ skills: [SkillRecord]) -> [SkillRecord] {
        skills.sorted { lhs, rhs in
            switch sortOption {
            case .recent:
                let lhsDate = lhs.lastUsedAt ?? .distantPast
                let rhsDate = rhs.lastUsedAt ?? .distantPast
                if lhsDate != rhsDate { return lhsDate > rhsDate }
                if lhs.usageCount != rhs.usageCount { return lhs.usageCount > rhs.usageCount }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            case .usage:
                if lhs.usageCount != rhs.usageCount { return lhs.usageCount > rhs.usageCount }
                return (lhs.lastUsedAt ?? .distantPast) > (rhs.lastUsedAt ?? .distantPast)
            case .context:
                if lhs.tokenEstimate != rhs.tokenEstimate { return lhs.tokenEstimate > rhs.tokenEstimate }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            case .name:
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
        }
    }

    func recommendationReasons(for skill: SkillRecord) -> [SkillRecommendationReason] {
        if decision(for: skill) == .protected { return [.protected] }
        if decision(for: skill) == .review { return [.markedForReview] }
        if skill.usageCount == 0 { return [.neverUsed] }

        var reasons: [SkillRecommendationReason] = []
        if let lastUsedAt = skill.lastUsedAt {
            let days = Int(max(0, Date().timeIntervalSince(lastUsedAt)) / 86_400)
            if days >= 90 {
                reasons.append(.staleNinetyDays)
            } else if days >= 30 {
                reasons.append(.staleThirtyDays)
            }
        }

        if skill.tokenEstimate >= 2_000 {
            reasons.append(.highContext)
        }

        if reasons.isEmpty {
            reasons.append(.recentEvidence)
        }
        return reasons
    }

    func recommendationReasonText(for skill: SkillRecord) -> String {
        recommendationReasons(for: skill)
            .map(reasonTitle)
            .joined(separator: " · ")
    }

    func reasonTitle(_ reason: SkillRecommendationReason) -> String {
        switch reason {
        case .protected: return "已保护"
        case .markedForReview: return "待复查"
        case .neverUsed: return "未找到本地使用证据"
        case .staleNinetyDays: return "90天以上未命中"
        case .staleThirtyDays: return "30天以上未命中"
        case .highContext: return "上下文占用高"
        case .recentEvidence: return "近期有本地证据"
        }
    }

    private func setDecision(_ decision: SkillUserDecision?, for skill: SkillRecord) {
        do {
            try service.setDecision(decision, for: skill)
            skillDecisions = service.skillDecisions()
            let cleanupIDs = Set(cleanupCandidates.map { $0.id })
            selectedCleanupSkillIDs.formIntersection(cleanupIDs)
            if let selectedSkillID, !filteredSkills.contains(where: { $0.id == selectedSkillID }) {
                self.selectedSkillID = filteredSkills.first?.id
            }
            switch decision {
            case .protected:
                statusMessage = "已保护 \(skill.title)"
            case .review:
                statusMessage = "已标记待复查 \(skill.title)"
            case nil:
                statusMessage = "已清除标记 \(skill.title)"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func cleanupSummary(archivedCount: Int, failureCount: Int, reportPath: String?) -> String {
        var parts = ["已归档 \(archivedCount) 个"]
        if failureCount > 0 {
            parts.append("失败 \(failureCount) 个")
        }
        if let reportPath {
            parts.append("报告已保存：\(URL(fileURLWithPath: reportPath).lastPathComponent)")
        }
        return parts.joined(separator: "，")
    }
}
