import SwiftUI
import SkillManagerCore

struct SidebarView: View {
    @EnvironmentObject private var model: AppModel

    private var selection: Binding<AppModel.SidebarSelection?> {
        Binding {
            model.selectedFilter
        } set: { newValue in
            if let newValue {
                model.select(newValue)
            }
        }
    }

    var body: some View {
        List(selection: selection) {
            Section {
                ForEach(AppModel.Section.allCases) { section in
                    SidebarRow(
                        title: section.rawValue,
                        detail: detail(for: section),
                        systemImage: section.systemImage,
                        count: model.count(for: section)
                    )
                    .tag(AppModel.SidebarSelection.section(section))
                }
            }

            if !model.visibleAgents.isEmpty {
                Section("Agents") {
                    ForEach(model.visibleAgents, id: \.self) { agent in
                        SidebarRow(
                            title: agent.rawValue,
                            detail: nil,
                            systemImage: icon(for: agent),
                            count: model.agentCount(agent)
                        )
                        .tag(AppModel.SidebarSelection.agent(agent))
                    }
                }
            }

            if !model.skillCollections.isEmpty {
                Section("Collections") {
                    ForEach(model.skillCollections) { collection in
                        SidebarRow(
                            title: collection.title,
                            detail: "\(SkillFormatting.tokens(collection.tokenEstimate)) context",
                            systemImage: "square.stack.3d.up",
                            count: collection.count
                        )
                        .tag(AppModel.SidebarSelection.collection(collection.id))
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .top) {
            header
        }
        .safeAreaInset(edge: .bottom) {
            footer
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 7)
                .fill(Color.accentColor)
                .frame(width: 28, height: 28)
                .overlay {
                    Text("Sk")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                }

            Text("Skill Space")
                .font(.system(size: 18, weight: .semibold))
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, 10)
        .background(.bar)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()

            HStack(spacing: 8) {
                Button {
                    model.reload()
                } label: {
                    Label(model.isScanning ? "扫描中" : "重新扫描", systemImage: model.isScanning ? "arrow.triangle.2.circlepath" : "arrow.clockwise")
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(.borderless)
                .disabled(model.isScanning || model.isArchiving)

                Spacer()
            }

            Text(model.statusMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(.bar)
    }

    private func detail(for section: AppModel.Section) -> String? {
        switch section {
        case .all:
            return "\(SkillFormatting.tokens(model.inventory.totalContextTokens)) context"
        case .unused:
            return "从未命中"
        case .suggested:
            return "可清理"
        case .archived:
            return "可恢复"
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
}

private struct SidebarRow: View {
    let title: String
    let detail: String?
    let systemImage: String
    let count: Int

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .foregroundStyle(.secondary)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .lineLimit(1)

                if let detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            if count > 0 {
                Text("\(count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
