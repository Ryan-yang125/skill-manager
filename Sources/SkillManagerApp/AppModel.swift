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
        case archived = "已归档"

        var id: String { rawValue }

        var systemImage: String {
            switch self {
            case .all: return "doc.text"
            case .unused: return "circle.slash"
            case .suggested: return "archivebox"
            case .archived: return "tray.full"
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

    @Published var inventory = SkillInventory(active: [], archived: [], scannedAt: Date())
    @Published var selectedFilter: SidebarSelection = .section(.all)
    @Published var selectedSkillID: String?
    @Published var searchText = ""
    @Published var sortOption: SortOption = .recent
    @Published var isScanning = false
    @Published var statusMessage = "准备扫描"
    @Published var errorMessage: String?
    @Published var pendingArchiveSkill: SkillRecord?
    @Published var confirmingArchiveSuggested = false
    @Published var auditReport: InventoryAuditReport?
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
        inventory.archiveCandidates.count
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
            return "\(archiveCandidatesCount) suggested · \(SkillFormatting.tokens(inventory.reclaimableContextTokens)) context tokens"
        case .section(.archived):
            return "\(inventory.archived.count) archived"
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

    func count(for section: Section) -> Int {
        switch section {
        case .all: return inventory.active.count
        case .unused: return inventory.unused.count
        case .suggested: return inventory.archiveCandidates.count
        case .archived: return inventory.archived.count
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
            selectedSkillID = filteredSkills.first?.id
            statusMessage = statusAfterScan ?? "上次扫描 \(SkillFormatting.relativeDate(result.scannedAt))"
            isScanning = false
        }
    }

    func archive(_ skill: SkillRecord) {
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
        let candidates = inventory.archiveCandidates
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
            reload(statusAfterScan: "已归档 \(result.0) 个建议项")
        }
    }

    func requestArchiveSuggested() {
        confirmingArchiveSuggested = true
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
            return inventory.archiveCandidates
        case .section(.archived):
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
}
