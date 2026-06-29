import SwiftUI
import SkillManagerCore

struct SkillInspectorView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if let skill = model.selectedSkill {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        header(for: skill)
                        reasonSection(for: skill)
                        packageSection(for: skill)
                        actions(for: skill)
                        metrics(for: skill)
                        evidenceSection(for: skill)
                        pathSection(for: skill)
                        summarySection(for: skill)
                    }
                    .padding(18)
                }
                .background(CraftWindowBackground())
            } else {
                InspectorEmptyStateView(title: "未选择 Skill", subtitle: "在列表里选择一个 Skill 查看详情")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding()
                    .background(CraftWindowBackground())
            }
        }
        .inspectorColumnWidth(min: 300, ideal: 360, max: 430)
    }

    private func header(for skill: SkillRecord) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            CraftIconTile(systemImage: icon(for: skill.agent), tint: color(for: skill.agent), size: 44)

            VStack(alignment: .leading, spacing: 5) {
                Text(skill.title)
                    .font(.system(size: 21, weight: .semibold))
                    .lineLimit(2)

                Text(skill.name)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(spacing: 7) {
                CraftTag(text: skill.agent.rawValue)
                CraftTag(text: decisionText(for: skill))
                CraftTag(text: recommendationText(for: skill))
            }
        }
    }

    private func reasonSection(for skill: SkillRecord) -> some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 8) {
                Text("Reason")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)

                Text(model.recommendationReasonText(for: skill))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func packageSection(for skill: SkillRecord) -> some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 10) {
                Text("Package")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)

                if let package = skill.package {
                    InspectorMetricRow(label: "来源", value: model.packageTitle(for: package.id))
                    if let sourceURL = package.sourceURL {
                        InspectorMetricRow(label: "URL", value: sourceURL)
                    }
                    if let installedAt = package.installedAt {
                        InspectorMetricRow(label: "安装", value: SkillFormatting.relativeDate(installedAt))
                    }
                    if let updatedAt = package.updatedAt {
                        InspectorMetricRow(label: "更新", value: SkillFormatting.relativeDate(updatedAt))
                    }
                    if let skillPath = package.skillPath {
                        InspectorMetricRow(label: "skillPath", value: skillPath)
                    }
                } else {
                    Text("未找到安装包元数据")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
        }
    }

    private func actions(for skill: SkillRecord) -> some View {
        CraftSurface {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Button {
                        model.reveal(skill)
                    } label: {
                        Label("Finder", systemImage: "folder")
                    }

                    Button {
                        model.setProtected(skill)
                    } label: {
                        Label("保护", systemImage: "shield")
                    }
                    .disabled(model.decision(for: skill) == .protected)
                }

                HStack(spacing: 8) {
                    Button {
                        model.setNeedsReview(skill)
                    } label: {
                        Label("待复查", systemImage: "exclamationmark.circle")
                    }
                    .disabled(model.decision(for: skill) == .review)

                    if model.decision(for: skill) != nil {
                        Button {
                            model.clearDecision(for: skill)
                        } label: {
                            Label("清除", systemImage: "xmark.circle")
                        }
                    }

                    Button(role: .destructive) {
                        model.requestArchive(skill)
                    } label: {
                        Label("归档", systemImage: "archivebox")
                    }
                    .disabled(model.isArchiving || model.decision(for: skill) == .protected)
                }
            }
            .buttonStyle(CraftCapsuleButtonStyle())
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func metrics(for skill: SkillRecord) -> some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 10) {
                Text("Metrics")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)

                InspectorMetricRow(label: "上次使用", value: SkillFormatting.relativeDate(skill.lastUsedAt))
                InspectorMetricRow(label: "使用次数", value: "\(skill.usageCount)")
                InspectorMetricRow(label: "证据数", value: "\(skill.usageEvidence.count)")
                InspectorMetricRow(label: "上下文", value: SkillFormatting.contextTokens(skill.tokenEstimate))
                InspectorMetricRow(label: "磁盘大小", value: SkillFormatting.bytes(skill.sizeBytes))
            }
            .padding(14)
        }
    }

    private func evidenceSection(for skill: SkillRecord) -> some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 0) {
                Text("Evidence")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
                    .padding(.bottom, 8)

                if skill.usageEvidence.isEmpty {
                    Text("未找到本地使用证据")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 14)
                } else {
                    ForEach(skill.usageEvidence.prefix(8)) { evidence in
                        EvidenceRow(evidence: evidence) {
                            model.revealEvidence(evidence)
                        }
                    }
                }
            }
        }
    }

    private func pathSection(for skill: SkillRecord) -> some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 6) {
                Text("Path")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)

                Text(skill.path)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
        }
    }

    private func summarySection(for skill: SkillRecord) -> some View {
        CraftSurface {
            VStack(alignment: .leading, spacing: 6) {
                Text("Description")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)

                Text(skill.summary)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
        }
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

private struct EvidenceRow: View {
    let evidence: UsageEvidence
    let onReveal: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(color)
                    .frame(width: 18)

                VStack(alignment: .leading, spacing: 4) {
                    Text(evidence.kind.label)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.primary)

                    Text("\(SkillFormatting.relativeDate(evidence.occurredAt)) · \(evidence.detail)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Text(evidence.sessionPath)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer(minLength: 8)

                Button("Session", action: onReveal)
                    .buttonStyle(.borderless)
                    .font(.caption)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()
                .padding(.leading, 42)
        }
    }

    private var icon: String {
        switch evidence.kind {
        case .codexSkillRead: return "doc.text.magnifyingglass"
        case .codexDirectLoad: return "bolt"
        case .claudeSkillTool: return "sparkle"
        }
    }

    private var color: Color {
        switch evidence.agent {
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
