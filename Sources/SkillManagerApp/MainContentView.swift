import SwiftUI
import SkillManagerCore

struct MainContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            header

            Divider()

            if model.showingArchived {
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
                .disabled(model.isScanning)

                if model.selectedFilter == .section(.suggested), model.archiveCandidatesCount > 0 {
                    Button("全部归档") {
                        model.requestArchiveSuggested()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }

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
                            isSelected: model.selectedSkillID == skill.id,
                            onSelect: { model.selectedSkillID = skill.id },
                            onArchive: { model.requestArchive(skill) },
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
                            onRestore: { model.restore(archived) },
                            onReveal: { model.reveal(archived) }
                        )
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
    let isSelected: Bool
    let onSelect: () -> Void
    let onArchive: () -> Void
    let onReveal: () -> Void

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

                        if skill.recommendation == .archive || skill.recommendation == .review {
                            Button("归档", action: onArchive)
                                .buttonStyle(.bordered)
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
            if skill.recommendation == .archive || skill.recommendation == .review {
                Button("归档", action: onArchive)
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

private struct ArchivedSkillRowView: View {
    let archived: ArchivedSkill
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
