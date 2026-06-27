import AppKit
import SwiftUI
import SkillManagerCore

struct MenuBarPanel: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Skill 管家")
                    .font(.system(size: 16, weight: .semibold))
                Spacer()
                Text("\(model.healthScore)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("可归档 \(model.archiveCandidatesCount) 个")
                    .font(.system(size: 24, weight: .bold))
                Text("常驻 \(SkillFormatting.tokens(model.inventory.totalContextTokens)) tokens")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                Button("打开") {
                    openWindow(id: "main")
                    NSApp.activate(ignoringOtherApps: true)
                }
                .buttonStyle(.borderedProminent)

                Button("重新扫描") {
                    model.reload()
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(18)
        .frame(width: 260)
        .task {
            if model.inventory.active.isEmpty {
                model.reload()
            }
        }
    }
}
