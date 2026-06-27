import SwiftUI
import SkillManagerCore

@main
struct SkillManagerApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        WindowGroup(id: "main") {
            RootView()
                .environmentObject(model)
                .frame(minWidth: 1_120, minHeight: 720)
                .task {
                    model.reload()
                }
        }
        .defaultSize(width: 1_180, height: 760)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("重新扫描") {
                    model.reload()
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
        }

        MenuBarExtra {
            MenuBarPanel()
                .environmentObject(model)
        } label: {
            Image(systemName: "shippingbox.circle")
        }
        .menuBarExtraStyle(.window)
    }
}
