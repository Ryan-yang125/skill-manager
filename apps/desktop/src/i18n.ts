import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export type AppLanguage = "en" | "zh";

function systemLanguage(): AppLanguage {
  const stored = localStorage.getItem("language");
  if (stored === "zh" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export const resources = {
  en: {
    translation: {
      status: {
        ready: "Ready",
        scanning: "Scanning roots and local sessions",
        scanned: "Scanned {{count}} skills",
        scanFailed: "Scan failed",
        decisionSaved: "Decision saved",
        decisionCleared: "Decision cleared",
        archived: "Archived {{title}}",
        restored: "Restored {{title}}",
        restoreConflict: "Restore conflict",
        reportExported: "Cleanup report exported"
      },
      nav: {
        library: "Library",
        installed: "Installed skills",
        add: "Add skills",
        packages: "Packages",
        sources: "Sources",
        agents: "Agents",
        codex: "Codex",
        claude: "Claude",
        review: "Review",
        recent: "Recently used",
        noEvidence: "No evidence",
        highContext: "High context",
        archived: "Archived"
      },
      actions: {
        switchTheme: "Switch theme",
        switchLanguage: "Switch language",
        rescan: "Rescan skills",
        addSkill: "Add skill",
        exportReport: "Export cleanup report",
        protect: "Protect skill",
        clearProtected: "Clear protected",
        reveal: "Reveal",
        reviewLater: "Review Later",
        clearReview: "Clear Review",
        source: "Source",
        open: "Open",
        archive: "Archive",
        restore: "Restore",
        copy: "Copy",
        cancel: "Cancel"
      },
      list: {
        titleSkills: "Skills",
        titleArchived: "Archived",
        searchPlaceholder: "Search name, package, description",
        loadingTitle: "Scanning local skills",
        loadingBody: "Reading roots, lockfiles, and session evidence.",
        errorTitle: "Something needs attention",
        noRootsTitle: "No skill roots found",
        noRootsBody: "Create one of the global roots or import a folder to start managing skills.",
        noSkillsTitle: "No skills found",
        noSkillsBody: "Add a skill folder or rescan after installing agent skills.",
        addTitle: "Add skills",
        addBody: "Import from a folder or place skills inside one of the global roots.",
        sortAdded: "Latest added",
        sortUsage: "Usage count",
        skill: "skill",
        skills: "skills"
      },
      footer: {
        scanned: "SCANNED",
        pending: "PENDING",
        logsChecked: "{{count}} LOGS CHECKED"
      },
      detail: {
        manual: "Manual",
        inferredSource: "inferred source",
        lockfileSource: "lockfile source",
        localFolder: "local folder",
        usage: "Usage",
        lastUsed: "Last used",
        context: "Context",
        size: "Size",
        runs: "{{count}} runs",
        tokens: "{{count}} tokens",
        tabs: {
          content: "Content",
          usage: "Usage",
          files: "Files",
          history: "History"
        },
        installedLocations: "Installed locations",
        source: "Source",
        updated: "Updated {{date}}",
        noPackageMetadata: "No package metadata",
        localEvidence: "Local evidence",
        noLocalEvidence: "No local session evidence found.",
        reviewLedger: "Review ledger",
        protected: "Protected",
        reviewLater: "Review later",
        archiveSignal: "Archive signal",
        yes: "Yes",
        no: "No",
        folder: "Folder",
        status: "Status",
        session: "{{kind}} session",
        emptyUsageTitle: "No evidence found",
        emptyUsageBody: "This skill did not appear in the scanned local session logs.",
        noSelectionTitle: "No skill selected",
        noSelectionBody: "Select a skill from the library or rescan your local roots.",
        archivedBody: "This skill is in the local Skill Manager archive and can be restored to its original path.",
        original: "Original",
        archivePath: "Archive",
        archivedAt: "Archived"
      },
      dialog: {
        archiveTitle: "Archive {{title}}",
        archiveDescription: "This moves the skill folder into the local Skill Manager archive. The archive ledger keeps the original path for restore."
      },
      date: {
        never: "Never",
        unknown: "Unknown",
        today: "Today",
        yesterday: "Yesterday",
        days: "{{count}}d",
        months: "{{count}}mo",
        years: "{{count}}y"
      },
      evidence: {
        codexSkillRead: "Codex read SKILL.md",
        codexDirectLoad: "Codex loadSkill",
        claudeSkillTool: "Claude Skill tool",
        none: "No evidence"
      },
      aria: {
        skillFilters: "Skill filters",
        skillSort: "Skill sort",
        skillDetailViews: "Skill detail views",
        skillEnabled: "Skill enabled",
        fileTree: "Skill files",
        agentSkill: "{{agent}} skill"
      },
      recommendation: {
        keep: "keep",
        review: "review",
        archive: "archive"
      }
    }
  },
  zh: {
    translation: {
      status: {
        ready: "就绪",
        scanning: "正在扫描根目录与本机会话",
        scanned: "已扫描 {{count}} 个 skill",
        scanFailed: "扫描失败",
        decisionSaved: "决策已保存",
        decisionCleared: "决策已清除",
        archived: "已归档 {{title}}",
        restored: "已恢复 {{title}}",
        restoreConflict: "恢复路径冲突",
        reportExported: "清理报告已导出"
      },
      nav: {
        library: "资源库",
        installed: "已安装 skills",
        add: "添加 skills",
        packages: "Packages",
        sources: "来源",
        agents: "Agents",
        codex: "Codex",
        claude: "Claude",
        review: "复查",
        recent: "最近使用",
        noEvidence: "无证据",
        highContext: "高上下文",
        archived: "已归档"
      },
      actions: {
        switchTheme: "切换主题",
        switchLanguage: "切换语言",
        rescan: "重新扫描",
        addSkill: "添加 skill",
        exportReport: "导出清理报告",
        protect: "保护 skill",
        clearProtected: "取消保护",
        reveal: "显示位置",
        reviewLater: "稍后复查",
        clearReview: "清除复查",
        source: "来源",
        open: "打开",
        archive: "归档",
        restore: "恢复",
        copy: "复制",
        cancel: "取消"
      },
      list: {
        titleSkills: "Skills",
        titleArchived: "已归档",
        searchPlaceholder: "搜索名称、package、描述",
        loadingTitle: "正在扫描本机 skills",
        loadingBody: "读取根目录、lockfile 和会话证据。",
        errorTitle: "需要处理",
        noRootsTitle: "未找到 skill 根目录",
        noRootsBody: "创建全局根目录或导入文件夹后即可开始管理。",
        noSkillsTitle: "未找到 skills",
        noSkillsBody: "添加 skill 文件夹或安装 agent skills 后重新扫描。",
        addTitle: "添加 skills",
        addBody: "从文件夹导入，或把 skills 放进任一全局根目录。",
        sortAdded: "最新添加",
        sortUsage: "使用次数",
        skill: "skill",
        skills: "skills"
      },
      footer: {
        scanned: "已扫描",
        pending: "等待中",
        logsChecked: "已检查 {{count}} 条日志"
      },
      detail: {
        manual: "手动",
        inferredSource: "推断来源",
        lockfileSource: "lockfile 来源",
        localFolder: "本地文件夹",
        usage: "使用",
        lastUsed: "上次使用",
        context: "上下文",
        size: "大小",
        runs: "{{count}} 次",
        tokens: "{{count}} tokens",
        tabs: {
          content: "内容",
          usage: "使用",
          files: "文件",
          history: "历史"
        },
        installedLocations: "安装位置",
        source: "来源",
        updated: "{{date}} 更新",
        noPackageMetadata: "没有 package metadata",
        localEvidence: "本地证据",
        noLocalEvidence: "没有找到本机会话证据。",
        reviewLedger: "复查账本",
        protected: "已保护",
        reviewLater: "稍后复查",
        archiveSignal: "归档信号",
        yes: "是",
        no: "否",
        folder: "文件夹",
        status: "状态",
        session: "{{kind}} 会话",
        emptyUsageTitle: "未找到证据",
        emptyUsageBody: "已扫描的本机会话日志里没有出现这个 skill。",
        noSelectionTitle: "未选择 skill",
        noSelectionBody: "从资源库选择一个 skill，或重新扫描本机根目录。",
        archivedBody: "这个 skill 已进入本地 Skill Manager 归档，可恢复到原始路径。",
        original: "原路径",
        archivePath: "归档路径",
        archivedAt: "归档时间"
      },
      dialog: {
        archiveTitle: "归档 {{title}}",
        archiveDescription: "这会把 skill 文件夹移动到本地 Skill Manager 归档目录。归档账本会保留原路径，便于恢复。"
      },
      date: {
        never: "从未",
        unknown: "未知",
        today: "今天",
        yesterday: "昨天",
        days: "{{count}} 天前",
        months: "{{count}} 个月前",
        years: "{{count}} 年前"
      },
      evidence: {
        codexSkillRead: "Codex 读取 SKILL.md",
        codexDirectLoad: "Codex loadSkill",
        claudeSkillTool: "Claude Skill tool",
        none: "无证据"
      },
      aria: {
        skillFilters: "Skill 筛选",
        skillSort: "Skill 排序",
        skillDetailViews: "Skill 详情视图",
        skillEnabled: "Skill 已启用",
        fileTree: "Skill 文件",
        agentSkill: "{{agent}} skill"
      },
      recommendation: {
        keep: "保留",
        review: "复查",
        archive: "归档"
      }
    }
  }
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: systemLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

document.documentElement.lang = i18n.language;

export { i18n };
