import SwiftUI
import SkillManagerCore

struct MainContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            header

            Divider()

            if model.showingHistory {
                historyContent
            } else if model.showingCleanupPlan {
                cleanupPlanContent
            } else if model.showingArchived {
                archivedContent
            } else {
                skillsContent
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.displayTitle)
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Text(model.displaySummary)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 20)

                Button {
                    model.reload()
                } label: {
                    Label(model.isScanning ? "扫描中" : "重新扫描", systemImage: model.isScanning ? "arrow.triangle.2.circlepath" : "arrow.clockwise")
                }
                .disabled(model.isScanning || model.isArchiving)

                Button {
                    model.isInspectorPresented.toggle()
                } label: {
                    Label("详情", systemImage: model.isInspectorPresented ? "sidebar.right" : "sidebar.trailing")
                }

                if model.selectedFilter == .section(.suggested), model.archiveCandidatesCount > 0 {
                    Button("全部归档") {
                        model.requestArchiveSuggested()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isArchiving)
                }
            }

            if !model.showingHistory {
                HStack(spacing: 12) {
                    TextField("搜索 name / description", text: $model.searchText)
                        .textFieldStyle(.roundedBorder)
                        .frame(minWidth: 220, idealWidth: 280, maxWidth: 360)

                    Picker("排序", selection: $model.sortOption) {
                        ForEach(AppModel.SortOption.allCases) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 150)

                    Spacer()

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
                    .disabled(model.updateCheckState == .checking)
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 22)
        .padding(.bottom, 18)
    }

    private var skillsContent: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if model.filteredSkills.isEmpty {
                    EmptyStateView(
                        title: model.isScanning ? "正在扫描本机 Skills" : "没有匹配的 Skill",
                        subtitle: model.isScanning ? "读取全局 Skill 目录和会话日志" : "调整搜索、筛选或排序条件"
                    )
                    .frame(maxWidth: .infinity, minHeight: 360)
                } else {
                    ForEach(model.filteredSkills) { skill in
                        SkillRowView(
                            skill: skill,
                            familyTitle: familyTitle(for: skill),
                            decision: model.decision(for: skill),
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
            .padding(24)
        }
    }

    private var cleanupPlanContent: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
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
                    ForEach(model.filteredSkills) { skill in
                        CleanupPlanRowView(
                            skill: skill,
                            familyTitle: familyTitle(for: skill),
                            isSelected: model.isCleanupSelected(skill),
                            onSelectedChange: { model.setCleanupSelected($0, for: skill) },
                            onReveal: { model.reveal(skill) }
                        )
                    }
                }
            }
            .padding(24)
        }
    }

    private var archivedContent: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if model.inventory.archived.isEmpty {
                    EmptyStateView(title: "暂无归档", subtitle: "归档后的 Skill 会显示在这里")
                        .frame(maxWidth: .infinity, minHeight: 360)
                } else {
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
            .padding(24)
        }
    }

    private var historyContent: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
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
                    ForEach(model.operationHistory) { entry in
                        OperationHistoryRowView(entry: entry)
                    }
                }
            }
            .padding(24)
        }
    }

    private func familyTitle(for skill: SkillRecord) -> String? {
        let id = model.collectionID(for: skill)
        guard id != "single" else { return nil }
        return model.collectionTitle(for: id)
    }
}

private struct SkillRowView: View {
    let skill: SkillRecord
    let familyTitle: String?
    let decision: SkillUserDecision?
    let isSelected: Bool
    let archiveDisabled: Bool
    let onSelect: () -> Void
    let onArchive: () -> Void
    let onReveal: () -> Void
    let onProtect: () -> Void
    let onReview: () -> Void
    let onClearDecision: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(iconColor)
                    .frame(width: 28, height: 28)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 7))

                VStack(alignment: .leading, spacing: 4) {
                    Text(skill.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Text(skill.name)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text(skill.summary)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 12)

                VStack(alignment: .trailing, spacing: 8) {
                    HStack(spacing: 6) {
                        Button("Finder", action: onReveal)
                            .buttonStyle(.borderless)

                        Menu("标记") {
                            Button("保护", action: onProtect)
                                .disabled(decision == .protected)
                            Button("待复查", action: onReview)
                                .disabled(decision == .review)
                            if decision != nil {
                                Divider()
                                Button("清除标记", action: onClearDecision)
                            }
                        }

                        if decision != .protected && (skill.recommendation == .archive || skill.recommendation == .review) {
                            Button("归档", action: onArchive)
                                .buttonStyle(.bordered)
                                .disabled(archiveDisabled)
                        }
                    }

                    Text(recommendationText)
                        .font(.caption)
                        .foregroundStyle(recommendationColor)
                }
            }

            HStack(spacing: 8) {
                Tag(text: tagText)

                if let familyTitle {
                    Tag(text: familyTitle)
                }

                if let decision {
                    Tag(text: decision.title)
                }

                Spacer(minLength: 12)

                Metric(label: "上次", value: SkillFormatting.relativeDate(skill.lastUsedAt))
                Metric(label: "使用", value: "\(skill.usageCount)")
                Metric(label: "上下文", value: SkillFormatting.contextTokens(skill.tokenEstimate))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? Color.accentColor.opacity(0.75) : Color.primary.opacity(0.08), lineWidth: isSelected ? 2 : 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 10))
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

    private var recommendationText: String {
        switch skill.recommendation {
        case .keep: return "保留"
        case .review: return "复查"
        case .archive: return "建议归档"
        }
    }

    private var recommendationColor: Color {
        switch skill.recommendation {
        case .keep: return .secondary
        case .review: return .orange
        case .archive: return .red
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
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 16) {
                Image(systemName: "checklist")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 9))

                VStack(alignment: .leading, spacing: 4) {
                    Text("先确认，再归档")
                        .font(.system(size: 17, weight: .semibold))

                    Text("\(selectedCount) / \(candidateCount) selected · \(SkillFormatting.contextTokens(contextTokens)) · \(SkillFormatting.bytes(diskBytes))")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 12)
            }

            HStack(spacing: 8) {
                Button("全选", action: onSelectAll)
                Button("清空", action: onClear)
                Button("导出报告", action: onExport)
                    .disabled(selectedCount == 0)
                Button("报告目录", action: onRevealReportsDirectory)
                Spacer(minLength: 12)
                Button("归档选中", action: onArchive)
                    .buttonStyle(.borderedProminent)
                    .disabled(archiveDisabled)
            }

            if let latestReportPath {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text")
                        .foregroundStyle(.secondary)
                    Text(latestReportPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button("查看报告", action: onRevealReport)
                        .buttonStyle(.borderless)
                }
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "folder")
                        .foregroundStyle(.secondary)
                    Text(reportsDirectoryPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button("打开目录", action: onRevealReportsDirectory)
                        .buttonStyle(.borderless)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20, weight: .semibold))
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
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.green.opacity(0.25), lineWidth: 1)
        }
    }
}

private struct CleanupPlanRowView: View {
    let skill: SkillRecord
    let familyTitle: String?
    let isSelected: Bool
    let onSelectedChange: (Bool) -> Void
    let onReveal: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Toggle("", isOn: Binding(
                get: { isSelected },
                set: { onSelectedChange($0) }
            ))
            .labelsHidden()
            .toggleStyle(.checkbox)
            .padding(.top, 5)

            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(iconColor)
                .frame(width: 28, height: 28)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 7))

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
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Tag(text: tagText)
                    if let familyTitle {
                        Tag(text: familyTitle)
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
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? Color.accentColor.opacity(0.65) : Color.primary.opacity(0.08), lineWidth: isSelected ? 2 : 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 10))
        .onTapGesture {
            onSelectedChange(!isSelected)
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
        HStack(spacing: 14) {
            Image(systemName: "tray.full")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 28, height: 28)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 7))

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
                .buttonStyle(.borderedProminent)
                .disabled(restoreDisabled)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        }
    }
}

private struct OperationHistoryRowView: View {
    let entry: SkillOperationEntry

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(color)
                .frame(width: 28, height: 28)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 7))

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text("\(actionTitle) · \(entry.title)")
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)

                    Tag(text: entry.succeeded ? "成功" : "失败")
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
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
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

private struct Tag: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 6))
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
