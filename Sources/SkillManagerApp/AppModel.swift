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

    private let service = InventoryService()

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
            selectedSkillID = filteredSkills.first?.id
            statusMessage = "上次扫描 \(SkillFormatting.relativeDate(result.scannedAt))"
            isScanning = false
        }
    }

    func archive(_ skill: SkillRecord) {
        Task {
            do {
                let service = self.service
                _ = try await Task.detached(priority: .userInitiated) {
                    try service.archive(skill)
                }.value
                reload()
            } catch {
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
        Task {
            do {
                let service = self.service
                try await Task.detached(priority: .userInitiated) {
                    for skill in candidates {
                        _ = try service.archive(skill)
                    }
                }.value
                reload()
            } catch {
                errorMessage = error.localizedDescription
                reload()
            }
        }
    }

    func requestArchiveSuggested() {
        confirmingArchiveSuggested = true
    }

    func restore(_ archived: ArchivedSkill) {
        Task {
            do {
                let service = self.service
                try await Task.detached(priority: .userInitiated) {
                    try service.restore(archived)
                }.value
                reload()
            } catch {
                errorMessage = error.localizedDescription
            }
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
