import SwiftUI
import SkillManagerCore

struct SkillInspectorView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if let skill = model.selectedSkill {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header(for: skill)
                        actions(for: skill)
                        metrics(for: skill)
                        pathSection(for: skill)
                        summarySection(for: skill)
                    }
                    .padding(18)
                }
            } else {
                InspectorEmptyStateView(title: "未选择 Skill", subtitle: "在列表里选择一个 Skill 查看详情")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding()
            }
        }
        .inspectorColumnWidth(min: 260, ideal: 320, max: 380)
    }

    private func header(for skill: SkillRecord) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon(for: skill.agent))
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(color(for: skill.agent))
                    .frame(width: 30, height: 30)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 7))

                VStack(alignment: .leading, spacing: 3) {
                    Text(skill.title)
                        .font(.system(size: 17, weight: .semibold))
                        .lineLimit(2)

                    Text(skill.name)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            HStack(spacing: 8) {
                InspectorTag(text: skill.agent.rawValue)
                InspectorTag(text: decisionText(for: skill))
                InspectorTag(text: recommendationText(for: skill))
            }
        }
    }

    private func actions(for skill: SkillRecord) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                model.reveal(skill)
            } label: {
                Label("Finder", systemImage: "folder")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                model.setProtected(skill)
            } label: {
                Label("保护", systemImage: "shield")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .disabled(model.decision(for: skill) == .protected)

            Button {
                model.setNeedsReview(skill)
            } label: {
                Label("待复查", systemImage: "exclamationmark.circle")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .disabled(model.decision(for: skill) == .review)

            if model.decision(for: skill) != nil {
                Button {
                    model.clearDecision(for: skill)
                } label: {
                    Label("清除标记", systemImage: "xmark.circle")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Button(role: .destructive) {
                model.requestArchive(skill)
            } label: {
                Label("归档", systemImage: "archivebox")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .disabled(model.isArchiving || model.decision(for: skill) == .protected)
        }
        .buttonStyle(.bordered)
    }

    private func metrics(for skill: SkillRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Metrics")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)

            InspectorMetricRow(label: "上次使用", value: SkillFormatting.relativeDate(skill.lastUsedAt))
            InspectorMetricRow(label: "使用次数", value: "\(skill.usageCount)")
            InspectorMetricRow(label: "上下文", value: SkillFormatting.contextTokens(skill.tokenEstimate))
            InspectorMetricRow(label: "磁盘大小", value: SkillFormatting.bytes(skill.sizeBytes))
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
    }

    private func pathSection(for skill: SkillRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Path")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)

            Text(skill.path)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
    }

    private func summarySection(for skill: SkillRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Description")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)

            Text(skill.summary)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
    }

    private func decisionText(for skill: SkillRecord) -> String {
        model.decision(for: skill)?.title ?? "未标记"
    }

    private func recommendationText(for skill: SkillRecord) -> String {
        switch skill.recommendation {
        case .keep: return "建议保留"
        case .review: return "建议复查"
        case .archive: return "建议归档"
        }
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

    private func color(for agent: SkillAgent) -> Color {
        switch agent {
        case .shared: return .teal
        case .codex: return .blue
        case .claude: return .purple
        case .gemini: return .orange
        case .unknown: return .secondary
        }
    }
}

private struct InspectorMetricRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .lineLimit(1)
        }
        .font(.system(size: 13))
    }
}

private struct InspectorTag: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 6))
    }
}

private struct InspectorEmptyStateView: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}
