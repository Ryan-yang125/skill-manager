import AppKit
import SwiftUI
import SkillManagerCore

struct MenuBarPanel: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Skill 管家")
                    .font(.system(size: 16, weight: .semibold))
                Spacer()
                Text(model.isScanning ? "扫描中" : "\(model.healthScore)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
            }

            MenuMetric(title: "Skills", value: "\(model.inventory.active.count)")
            MenuMetric(title: "建议归档", value: "\(model.archiveCandidatesCount)")
            MenuMetric(title: "上次扫描", value: model.statusMessage.replacingOccurrences(of: "上次扫描 ", with: ""))

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
                .disabled(model.isScanning || model.isArchiving)
            }

            Button(model.updateActionTitle) {
                if case .available = model.updateCheckState {
                    model.openUpdateRelease()
                } else {
                    model.checkForUpdates()
                }
            }
            .buttonStyle(.bordered)
            .disabled(model.updateCheckState == .checking)

            Text(model.updateStatusText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
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

private struct MenuMetric: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
        }
        .font(.system(size: 13))
    }
}
