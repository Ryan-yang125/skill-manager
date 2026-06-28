import SwiftUI
import SkillManagerCore

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
        } detail: {
            MainContentView()
        }
        .navigationSplitViewStyle(.balanced)
        .alert("操作失败", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("好", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .alert("归档这个 Skill？", isPresented: Binding(
            get: { model.pendingArchiveSkill != nil },
            set: { if !$0 { model.pendingArchiveSkill = nil } }
        )) {
            Button("取消", role: .cancel) {}
            Button("归档", role: .destructive) {
                if let skill = model.pendingArchiveSkill {
                    model.archive(skill)
                    model.pendingArchiveSkill = nil
                }
            }
        } message: {
            Text("会移动到 SkillManager 归档目录，可在“已归档”里恢复：\(model.pendingArchiveSkill?.title ?? "")")
        }
        .alert("归档建议项？", isPresented: $model.confirmingArchiveSuggested) {
            Button("取消", role: .cancel) {}
            Button("归档 \(model.archiveCandidatesCount) 个", role: .destructive) {
                model.archiveSuggested()
            }
        } message: {
            Text("会把当前建议归档的 Skill 移到可恢复归档目录。")
        }
        .alert("执行清理计划？", isPresented: $model.confirmingArchiveCleanupPlan) {
            Button("取消", role: .cancel) {}
            Button("导出报告并归档 \(model.cleanupSelectedCount) 个", role: .destructive) {
                model.archiveSelectedCleanupPlan()
            }
            .disabled(model.cleanupSelectedCount == 0)
        } message: {
            Text("会先导出 Markdown 和 JSON 报告，再把选中的 Skill 移到可恢复归档目录。")
        }
    }
}
