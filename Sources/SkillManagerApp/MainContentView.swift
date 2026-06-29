import SwiftUI
import SkillManagerCore

struct MainContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            CraftWindowBackground()

            VStack(spacing: 0) {
                header

                if model.showingHistory {
                    historyContent
                } else if model.showingDiagnostics {
                    diagnosticsContent
                } else if model.showingCleanupPlan {
                    cleanupPlanContent
                } else if model.showingArchived {
                    archivedContent
                } else {
                    skillsContent
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 16) {
                CraftIconTile(systemImage: headerIcon, tint: .primary, size: 44)

                VStack(alignment: .leading, spacing: 3) {
                    Text(model.displayTitle)
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Text(model.displaySummary)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 24)

                headerActions
            }

            if showsControlBar {
                controlBar
            }
        }
        .padding(.horizontal, 28)
        .padding(.top, 26)
        .padding(.bottom, 18)
    }

    private var headerActions: some View {
        HStack(spacing: 10) {
            Button {
                model.reload()
            } label: {
                Label(model.isScanning ? "扫描中" : "重新扫描", systemImage: model.isScanning ? "arrow.triangle.2.circlepath" : "arrow.clockwise")
                    .labelStyle(.titleAndIcon)
            }
            .buttonStyle(CraftCapsuleButtonStyle())
            .disabled(model.isScanning || model.isArchiving)

            Button {
                model.isInspectorPresented.toggle()
            } label: {
                Label("详情", systemImage: model.isInspectorPresented ? "sidebar.right" : "sidebar.trailing")
                    .labelStyle(.iconOnly)
            }
            .buttonStyle(CraftCapsuleButtonStyle())

            if model.selectedFilter == .section(.suggested), model.archiveCandidatesCount > 0 {
                Button {
                    model.requestArchiveSuggested()
                } label: {
                    Text("全部归档")
                }
                .buttonStyle(CraftCapsuleButtonStyle())
                .disabled(model.isArchiving)
            }
        }
    }

    private var controlBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("搜索 name / description", text: $model.searchText)
                    .textFieldStyle(.plain)
            }
            .font(.system(size: 13))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minWidth: 260, idealWidth: 360, maxWidth: 420)
            .background(.thinMaterial, in: Capsule())
            .overlay {
                Capsule()
                    .stroke(Color.primary.opacity(0.07), lineWidth: 1)
            }

            Picker("排序", selection: $model.sortOption) {
                ForEach(AppModel.SortOption.allCases) { option in
                    Text(option.rawValue).tag(option)
                }
            }
            .labelsHidden()
            .frame(width: 150)

            Spacer(minLength: 16)

            Text(model.updateStatusText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Button(model.updateActionTitle) {
                if case .available = model.updateCheckState {
                    model.openUpdateRelease()
                } else {
                    model.checkForUpdates()
                }
            }
            .buttonStyle(CraftCapsuleButtonStyle())
            .disabled(model.updateCheckState == .checking)
        }
    }

    private var skillsContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                listHeader

                if model.filteredSkills.isEmpty {
                    EmptyStateView(
                        title: model.isScanning ? "正在扫描本机 Skills" : "没有匹配的 Skill",
                        subtitle: model.isScanning ? "读取全局 Skill 目录和会话日志" : "调整搜索、筛选或排序条件"
                    )
                    .frame(maxWidth: .infinity, minHeight: 360)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(model.filteredSkills) { skill in
                            SkillRowView(
                                skill: skill,
                                familyTitle: familyTitle(for: skill),
                                decision: model.decision(for: skill),
                                reasonText: model.recommendationReasonText(for: skill),
                                isSelected: model.selectedSkillID == skill.id,
                                archiveDisabled: model.isArchiving,
                                onSelect: { model.selectedSkillID = skill.id },
                                onArchive: { model.requestArchive(skill) },
                                onReveal: { model.reveal(skill) },
                                onProtect: { model.setProtected(skill) },
                                onReview: { model.setNeedsReview(skill) },
                                onClearDecision: { model.clearDecision(for: skill) }
                            )
                        }
                    }
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 28)
            .frame(maxWidth: CraftStyle.contentMaxWidth, alignment: .top)
            .frame(maxWidth: .infinity)
        }
    }

    private var cleanupPlanContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                CleanupPlanSummaryView(
                    selectedCount: model.cleanupSelectedCount,
                    candidateCount: model.cleanupCandidates.count,
                    contextTokens: model.cleanupSelectedContextTokens,
                    diskBytes: model.cleanupSelectedBytes,
                    latestReportPath: model.latestCleanupReportPath,
                    reportsDirectoryPath: model.cleanupReportsDirectoryPath,
                    archiveDisabled: model.isArchiving || model.cleanupSelectedCount == 0,
                    onSelectAll: { model.selectAllCleanupCandidates() },
                    onClear: { model.clearCleanupSelection() },
                    onExport: { model.exportCleanupPlanReport() },
                    onRevealReport: { model.revealLatestCleanupReport() },
                    onRevealReportsDirectory: { model.revealCleanupReportsDirectory() },
                    onArchive: { model.requestArchiveCleanupPlan() }
                )

                if model.filteredSkills.isEmpty {
                    EmptyStateView(
                        title: model.isScanning ? "正在生成清理计划" : "没有可清理项",
                        subtitle: model.isScanning ? "读取本机 Skill 和会话记录" : "当前没有命中建议归档的 Skill"
                    )
                    .frame(maxWidth: .infinity, minHeight: 300)
                } else {
                    CraftSurface {
                        LazyVStack(spacing: 0) {
                            ForEach(model.filteredSkills) { skill in
                                CleanupPlanRowView(
                                    skill: skill,
                                    familyTitle: familyTitle(for: skill),
                                    reasonText: model.recommendationReasonText(for: skill),
                                    isSelected: model.isCleanupSelected(skill),
                                    onSelectedChange: { model.setCleanupSelected($0, for: skill) },
                                    onReveal: { model.reveal(skill) }
                                )
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 28)
            .frame(maxWidth: CraftStyle.contentMaxWidth, alignment: .top)
            .frame(maxWidth: .infinity)
        }
    }

    private var archivedContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                if model.inventory.archived.isEmpty {
                    EmptyStateView(title: "暂无归档", subtitle: "归档后的 Skill 会显示在这里")
                        .frame(maxWidth: .infinity, minHeight: 360)
                } else {
                    CraftSurface {
                        LazyVStack(spacing: 0) {
                            ForEach(model.inventory.archived) { archived in
                                ArchivedSkillRowView(
                                    archived: archived,
                                    restoreDisabled: model.isArchiving,
                                    onRestore: { model.restore(archived) },
                                    onReveal: { model.reveal(archived) }
                                )
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 28)
            .frame(maxWidth: CraftStyle.contentMaxWidth, alignment: .top)
            .frame(maxWidth: .infinity)
        }
    }

    private var historyContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let summary = model.cleanupResultSummary {
                    CleanupResultBannerView(
                        summary: summary,
                        reportPath: model.latestCleanupReportPath,
                        reportsDirectoryPath: model.cleanupReportsDirectoryPath,
                        onRevealReport: { model.revealLatestCleanupReport() },
                        onRevealReportsDirectory: { model.revealCleanupReportsDirectory() },
                        onDismiss: { model.clearCleanupResultSummary() }
                    )
                }

                if model.operationHistory.isEmpty {
                    EmptyStateView(title: "暂无操作历史", subtitle: "归档和恢复记录会保存在本机")
                        .frame(maxWidth: .infinity, minHeight: 360)
                } else {
                    CraftSurface {
                        LazyVStack(spacing: 0) {
                            ForEach(model.operationHistory) { entry in
                                OperationHistoryRowView(entry: entry)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 28)
            .frame(maxWidth: CraftStyle.contentMaxWidth, alignment: .top)
            .frame(maxWidth: .infinity)
        }
    }

    private var diagnosticsContent: some View {
        ScrollView {
            DiagnosticsContentView(
                auditReport: model.auditReport,
                sessionRootAudits: model.sessionRootAudits,
                evidenceCount: model.usageEvidenceCount
            )
            .padding(.horizontal, 28)
            .padding(.bottom, 28)
            .frame(maxWidth: CraftStyle.contentMaxWidth, alignment: .top)
            .frame(maxWidth: .infinity)
        }
    }

    private var listHeader: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Text("Name")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Evidence")
                    .frame(width: 92, alignment: .trailing)
                Text("Last")
                    .frame(width: 78, alignment: .trailing)
                Text("Uses")
                    .frame(width: 64, alignment: .trailing)
                Text("Context")
                    .frame(width: 86, alignment: .trailing)
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)

            Divider()
        }
    }

    private var showsControlBar: Bool {
        !model.showingHistory && !model.showingArchived && !model.showingDiagnostics
    }

    private var headerIcon: String {
        switch model.selectedFilter {
        case .section(let section):
            return section.systemImage
        case .agent(let agent):
            return icon(for: agent)
        case .collection:
            return "square.stack.3d.up"
        }
    }

    private func familyTitle(for skill: SkillRecord) -> String? {
        let id = model.collectionID(for: skill)
        guard id != "single" else { return nil }
        return model.collectionTitle(for: id)
    }

    private func icon(for agent: SkillAgent) -> String {
        switch agent {
        case .shared: return "shippingbox"
        case .codex: return "curlybraces"
        case .claude: return "sparkle"
        case .gemini: return "diamond"
        case .unknown: return "questionmark.circle"
        }
    }
}

private struct SkillRowView: View {
    let skill: SkillRecord
    let familyTitle: String?
    let decision: SkillUserDecision?
    let reasonText: String
    let isSelected: Bool
    let archiveDisabled: Bool
    let onSelect: () -> Void
    let onArchive: () -> Void
    let onReveal: () -> Void
    let onProtect: () -> Void
    let onReview: () -> Void
    let onClearDecision: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                CraftIconTile(systemImage: icon, tint: iconColor, size: 34)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(skill.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        if let decision {
                            CraftTag(text: decision.title)
                        }
                    }

                    Text(skill.name)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text(skill.summary)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 7) {
                        CraftTag(text: tagText)
                        if let familyTitle {
                            CraftTag(text: familyTitle)
                        }
                        CraftTag(text: reasonText)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Text("\(skill.usageEvidence.count)")
                    .frame(width: 92, alignment: .trailing)
                Text(SkillFormatting.relativeDate(skill.lastUsedAt))
                    .frame(width: 78, alignment: .trailing)
                Text("\(skill.usageCount)")
                    .frame(width: 64, alignment: .trailing)
                Text(SkillFormatting.contextTokens(skill.tokenEstimate))
                    .frame(width: 86, alignment: .trailing)

                Menu {
                    Button("在 Finder 显示", action: onReveal)
                    Divider()
                    Button("保护", action: onProtect)
                        .disabled(decision == .protected)
                    Button("待复查", action: onReview)
                        .disabled(decision == .review)
                    if decision != nil {
                        Button("清除标记", action: onClearDecision)
                    }
                    if skill.recommendation == .archive || skill.recommendation == .review {
                        Divider()
                        Button("归档", action: onArchive)
                            .disabled(archiveDisabled || decision == .protected)
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 15, weight: .medium))
                }
                .menuStyle(.borderlessButton)
                .frame(width: 28)
            }
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(rowBackground)
            .overlay {
                RoundedRectangle(cornerRadius: CraftStyle.rowCornerRadius, style: .continuous)
                    .stroke(isSelected ? Color.accentColor.opacity(0.72) : Color.clear, lineWidth: 2)
            }
            .contentShape(RoundedRectangle(cornerRadius: CraftStyle.rowCornerRadius, style: .continuous))
            .onTapGesture(perform: onSelect)
            .contextMenu {
                Button("在 Finder 显示", action: onReveal)
                Button("保护", action: onProtect)
                    .disabled(decision == .protected)
                Button("待复查", action: onReview)
                    .disabled(decision == .review)
                if decision != nil {
                    Button("清除标记", action: onClearDecision)
                }
                if skill.recommendation == .archive || skill.recommendation == .review {
                    Button("归档", action: onArchive)
                        .disabled(archiveDisabled || decision == .protected)
                }
            }

            Divider()
                .padding(.leading, 66)
        }
    }

    private var rowBackground: some ShapeStyle {
        isSelected ? Color.accentColor.opacity(0.08) : Color.clear
    }

    private var icon: String {
        switch skill.agent {
        case .shared: return "shippingbox"
        case .codex: return "curlybraces"
        case .claude: return "sparkle"
        case .gemini: return "diamond"
        case .unknown: return "questionmark.circle"
        }
    }

    private var iconColor: Color {
        switch skill.agent {
        case .shared: return .teal
        case .codex: return .blue
        case .claude: return .purple
        case .gemini: return .orange
        case .unknown: return .secondary
        }
    }

    private var tagText: String {
        switch skill.agent {
        case .shared: return "Shared"
        case .codex: return "Codex"
        case .claude: return "Claude"
        case .gemini: return "Gemini"
        case .unknown: return "Local"
        }
    }
}

private struct CleanupPlanSummaryView: View {
    let selectedCount: Int
    let candidateCount: Int
    let contextTokens: Int
    let diskBytes: Int64
    let latestReportPath: String?
    let reportsDirectoryPath: String
    let archiveDisabled: Bool
    let onSelectAll: () -> Void
    let onClear: () -> Void
    let onExport: () -> Void
    let onRevealReport: () -> Void
    let onRevealReportsDirectory: () -> Void
    let onArchive: () -> Void

    var body: some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .center, spacing: 14) {
                    CraftIconTile(systemImage: "checklist", tint: .accentColor, size: 42)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("确认后归档")
                            .font(.system(size: 18, weight: .semibold))

                        Text("\(selectedCount) / \(candidateCount) selected · \(SkillFormatting.contextTokens(contextTokens)) · \(SkillFormatting.bytes(diskBytes))")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 12)
                }

                HStack(spacing: 9) {
                    Button("全选", action: onSelectAll)
                    Button("清空", action: onClear)
                    Button("导出报告", action: onExport)
                        .disabled(selectedCount == 0)
                    Button("报告目录", action: onRevealReportsDirectory)
                    Spacer(minLength: 12)
                    Button("归档选中", action: onArchive)
                        .disabled(archiveDisabled)
                }
                .buttonStyle(CraftCapsuleButtonStyle())

                HStack(spacing: 8) {
                    Image(systemName: latestReportPath == nil ? "folder" : "doc.text")
                        .foregroundStyle(.secondary)
                    Text(latestReportPath ?? reportsDirectoryPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    if latestReportPath != nil {
                        Button("查看报告", action: onRevealReport)
                            .buttonStyle(.borderless)
                    }
                }
            }
            .padding(18)
        }
    }
}

private struct CleanupPlanRowView: View {
    let skill: SkillRecord
    let familyTitle: String?
    let reasonText: String
    let isSelected: Bool
    let onSelectedChange: (Bool) -> Void
    let onReveal: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                Toggle("", isOn: Binding(
                    get: { isSelected },
                    set: { onSelectedChange($0) }
                ))
                .labelsHidden()
                .toggleStyle(.checkbox)
                .padding(.top, 7)

                CraftIconTile(systemImage: icon, tint: iconColor, size: 34)

                VStack(alignment: .leading, spacing: 5) {
                    Text(skill.title)
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)

                    Text(skill.name)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text(skill.summary)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)

                    HStack(spacing: 7) {
                        CraftTag(text: tagText)
                        CraftTag(text: reasonText)
                        if let familyTitle {
                            CraftTag(text: familyTitle)
                        }
                    }
                }

                Spacer(minLength: 12)

                VStack(alignment: .trailing, spacing: 8) {
                    Button("Finder", action: onReveal)
                        .buttonStyle(.borderless)

                    HStack(spacing: 14) {
                        Metric(label: "上次", value: SkillFormatting.relativeDate(skill.lastUsedAt))
                        Metric(label: "使用", value: "\(skill.usageCount)")
                        Metric(label: "上下文", value: SkillFormatting.contextTokens(skill.tokenEstimate))
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(isSelected ? Color.accentColor.opacity(0.07) : Color.clear)
            .contentShape(Rectangle())
            .onTapGesture {
                onSelectedChange(!isSelected)
            }

            Divider()
                .padding(.leading, 70)
        }
    }

    private var icon: String {
        switch skill.agent {
        case .shared: return "shippingbox"
        case .codex: return "curlybraces"
        case .claude: return "sparkle"
        case .gemini: return "diamond"
        case .unknown: return "questionmark.circle"
        }
    }

    private var iconColor: Color {
        switch skill.agent {
        case .shared: return .teal
        case .codex: return .blue
        case .claude: return .purple
        case .gemini: return .orange
        case .unknown: return .secondary
        }
    }

    private var tagText: String {
        switch skill.agent {
        case .shared: return "Shared"
        case .codex: return "Codex"
        case .claude: return "Claude"
        case .gemini: return "Gemini"
        case .unknown: return "Local"
        }
    }
}

private struct ArchivedSkillRowView: View {
    let archived: ArchivedSkill
    let restoreDisabled: Bool
    let onRestore: () -> Void
    let onReveal: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                CraftIconTile(systemImage: "tray.full", tint: .secondary, size: 34)

                VStack(alignment: .leading, spacing: 4) {
                    Text(archived.title)
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)

                    Text(archived.name)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text("归档于 \(SkillFormatting.relativeDate(archived.archivedAt))")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button("Finder", action: onReveal)
                    .buttonStyle(.borderless)

                Button("恢复", action: onRestore)
                    .buttonStyle(CraftCapsuleButtonStyle())
                    .disabled(restoreDisabled)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            Divider()
                .padding(.leading, 66)
        }
    }
}

private struct OperationHistoryRowView: View {
    let entry: SkillOperationEntry

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                CraftIconTile(systemImage: icon, tint: color, size: 34)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text("\(actionTitle) · \(entry.title)")
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(1)

                        CraftTag(text: entry.succeeded ? "成功" : "失败")
                    }

                    Text(entry.skillName)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text(entry.message)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text(pathText)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer(minLength: 12)

                Text(SkillFormatting.relativeDate(entry.createdAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 58, alignment: .trailing)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            Divider()
                .padding(.leading, 66)
        }
    }

    private var actionTitle: String {
        switch entry.action {
        case .archive: return "归档"
        case .restore: return "恢复"
        }
    }

    private var icon: String {
        switch entry.action {
        case .archive: return "archivebox"
        case .restore: return "arrow.uturn.backward"
        }
    }

    private var color: Color {
        guard entry.succeeded else { return .red }
        switch entry.action {
        case .archive: return .orange
        case .restore: return .green
        }
    }

    private var pathText: String {
        switch entry.action {
        case .archive:
            return entry.archivePath ?? entry.originalPath
        case .restore:
            return entry.originalPath
        }
    }
}

private struct CleanupResultBannerView: View {
    let summary: String
    let reportPath: String?
    let reportsDirectoryPath: String
    let onRevealReport: () -> Void
    let onRevealReportsDirectory: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.green)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("清理计划已完成")
                            .font(.system(size: 15, weight: .semibold))
                        Text(summary)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: 12)

                    Button("清除", action: onDismiss)
                        .buttonStyle(.borderless)
                }

                HStack(spacing: 8) {
                    Image(systemName: reportPath == nil ? "folder" : "doc.text")
                        .foregroundStyle(.secondary)

                    Text(reportPath ?? reportsDirectoryPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)

                    Spacer(minLength: 12)

                    if reportPath != nil {
                        Button("查看报告", action: onRevealReport)
                            .buttonStyle(.borderless)
                    }

                    Button("报告目录", action: onRevealReportsDirectory)
                        .buttonStyle(.borderless)
                }
            }
            .padding(16)
        }
    }
}

private struct DiagnosticsContentView: View {
    let auditReport: InventoryAuditReport?
    let sessionRootAudits: [UsageSessionRootAudit]
    let evidenceCount: Int

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 14) {
                DiagnosticsMetricCard(
                    title: "Installed",
                    value: "\(auditReport?.installedCount ?? 0)",
                    caption: "全局 Skill"
                )
                DiagnosticsMetricCard(
                    title: "Evidence",
                    value: "\(evidenceCount)",
                    caption: "本地命中"
                )
                DiagnosticsMetricCard(
                    title: "Context",
                    value: SkillFormatting.contextTokens(auditReport?.contextTokens ?? 0),
                    caption: "name + description"
                )
            }

            CraftSurface {
                VStack(alignment: .leading, spacing: 0) {
                    DiagnosticsSectionHeader(title: "Skill Roots")
                    if let roots = auditReport?.roots, !roots.isEmpty {
                        ForEach(roots, id: \.path) { root in
                            RootDiagnosticRow(
                                title: root.agent.rawValue,
                                path: root.path,
                                exists: root.exists,
                                countText: "\(root.skillCount) skills"
                            )
                        }
                    } else {
                        DiagnosticsEmptyLine(text: "等待扫描结果")
                    }
                }
            }

            CraftSurface {
                VStack(alignment: .leading, spacing: 0) {
                    DiagnosticsSectionHeader(title: "Session Roots")
                    if sessionRootAudits.isEmpty {
                        DiagnosticsEmptyLine(text: "等待 session 诊断")
                    } else {
                        ForEach(sessionRootAudits, id: \.path) { root in
                            RootDiagnosticRow(
                                title: root.agent.rawValue,
                                path: root.path,
                                exists: root.exists,
                                countText: "\(root.logCount) logs"
                            )
                        }
                    }
                }
            }
        }
    }
}

private struct DiagnosticsMetricCard: View {
    let title: String
    let value: String
    let caption: String

    var body: some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.system(size: 24, weight: .semibold))
                    .lineLimit(1)
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct DiagnosticsSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
    }
}

private struct RootDiagnosticRow: View {
    let title: String
    let path: String
    let exists: Bool
    let countText: String

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: exists ? "checkmark.circle.fill" : "xmark.circle")
                    .foregroundStyle(exists ? .green : .secondary)
                    .frame(width: 20)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                    Text(path)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer(minLength: 12)

                Text(countText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)

            Divider()
                .padding(.leading, 50)
        }
    }
}

private struct DiagnosticsEmptyLine: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(.secondary)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct Metric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(minWidth: 56, alignment: .trailing)
    }
}

private struct EmptyStateView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
    }
}
