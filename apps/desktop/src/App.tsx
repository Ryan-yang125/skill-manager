import {
  Archive,
  ArrowDownWideNarrow,
  BookOpen,
  Box,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  GitBranch,
  Grid2X2,
  Languages,
  Loader2,
  Moon,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatBytes, type ArchivedSkill, type SkillInventory, type SkillRecord } from "@skill-manager/core/browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconButton, TooltipButton, TooltipProvider } from "@/components/ui/tooltip-button";
import { cn } from "@/lib/utils";

type SidebarSelection =
  | { type: "library" }
  | { type: "add" }
  | { type: "packages" }
  | { type: "source"; source: "agents" | "codex" | "claude" }
  | { type: "review"; review: "recent" | "no-evidence" | "high-context" | "archived" };

type DetailTab = "content" | "usage" | "files" | "history";
type Theme = "light" | "dark";
type SortMode = "added" | "usage";
type StatusState = { key: string; values?: Record<string, string | number> };

const detailTabs: DetailTab[] = ["content", "usage", "files", "history"];

const ui = {
  shell:
    "grid h-screen w-screen min-w-[1120px] grid-cols-[232px_356px_minmax(0,1fr)] overflow-hidden bg-[var(--bg)] text-[var(--ink)] antialiased max-[1200px]:min-w-0 max-[1200px]:grid-cols-[210px_320px_minmax(0,1fr)]",
  sidebar: "grid min-h-0 min-w-0 grid-rows-[auto_1fr_auto] border-r border-[var(--ink-faint)] bg-[var(--bg)]",
  titlebarSpace: "h-[46px] [-webkit-app-region:drag]",
  brand: "px-5 pb-[22px]",
  brandMain: "flex items-center gap-2.5 text-sm font-[650]",
  brandMark: "grid size-7 place-items-center rounded-[7px] bg-[var(--accent)] text-[var(--ink)]",
  systemStatus: "mt-[13px] inline-flex items-center gap-[7px] text-xs text-[var(--ink-dim)]",
  pulse: "size-1.5 animate-pulse rounded-full bg-[var(--green)] shadow-[0_0_0_3px_var(--green-ring)]",
  nav: "overflow-hidden px-3.5 pb-4 pt-0.5",
  navBlock: "mb-[22px]",
  navTitle: "px-[9px] pb-2 text-xs text-[var(--ink-dim)]",
  navItem:
    "grid h-[34px] w-full grid-cols-[19px_1fr_auto] items-center gap-[9px] rounded-md border-0 bg-transparent px-[9px] text-left text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]",
  navItemActive: "bg-[var(--selected-bg)] font-[650] text-[var(--ink)]",
  count: "text-xs tabular-nums text-[var(--ink-dim)]",
  sideFooter: "flex items-center justify-between gap-3 border-t border-[var(--ink-faint)] px-5 py-4",
  scanLabel: "text-xs leading-[1.45] text-[var(--ink-dim)]",
  footerButtons: "flex items-center gap-1",
  iconButton: "size-[30px] rounded-[5px] bg-transparent text-[var(--ink-dim)] transition-colors hover:bg-[var(--hover-strong)] hover:text-[var(--ink)]",
  listPane: "grid min-h-0 min-w-0 grid-rows-[auto_1fr] border-r border-[var(--ink-faint)] bg-[var(--pane)]",
  listHead: "border-b border-[var(--ink-faint)] bg-[var(--pane-strong)] px-4 pb-[13px] pt-[18px]",
  listTitleRow: "mb-[13px] flex items-center justify-between",
  paneTitle: "text-[19px] font-bold",
  toolbar: "flex items-center gap-[5px]",
  sortControl: "mb-3 flex items-center gap-1.5",
  sortIcon: "text-[var(--ink-dim)]",
  sortButton:
    "h-7 rounded-[6px] border border-transparent bg-transparent px-2.5 text-xs font-medium text-[var(--ink-dim)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
  sortButtonActive: "border-[var(--selected-border)] bg-[var(--selected-bg)] text-[var(--ink)]",
  searchWrap: "relative",
  searchIcon: "pointer-events-none absolute left-3 top-[9px] text-[var(--ink-dim)]",
  searchInput:
    "h-[34px] rounded-[7px] border border-[var(--ink-faint)] bg-[var(--input-bg)] pl-[35px] pr-[11px] text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus-visible:border-[var(--focus)] focus-visible:ring-0",
  rows: "min-h-0 overflow-auto px-2.5 pb-5 pt-3",
  rowGroup: "mb-[7px]",
  group: "flex h-7 items-center justify-between px-2 text-xs uppercase tracking-[0.02em] text-[var(--ink-dim)]",
  skillRow:
    "grid min-h-[58px] w-full grid-cols-[24px_minmax(0,1fr)_54px] items-center gap-2.5 rounded-lg border border-transparent bg-transparent px-[9px] py-2 text-left text-inherit transition-colors hover:bg-[var(--hover)]",
  skillRowActive: "border-[var(--selected-border)] bg-[var(--selected-bg)]",
  skillIcon: "grid size-[22px] place-items-center text-[var(--ink-soft)]",
  skillMain: "min-w-0",
  skillName: "truncate text-[13px] font-[650] text-[var(--ink)]",
  skillDesc: "mt-[3px] truncate text-xs leading-[1.35] text-[var(--ink-dim)]",
  agentDots: "mt-1.5 flex gap-[5px]",
  agentDot: "size-1 rounded-full bg-[var(--accent)]",
  metric: "grid justify-self-end gap-[3px] text-right text-xs tabular-nums text-[var(--ink-dim)]",
  metricStrong: "text-xs font-[650] text-[var(--ink)]",
  detail: "grid min-h-0 min-w-0 grid-rows-[auto_auto_1fr] bg-[var(--detail-bg)]",
  detailHead: "border-b border-[var(--ink-faint)] px-6 pb-4 pt-[22px]",
  detailTop: "flex items-start justify-between gap-5",
  detailTitle: "text-[29px] font-[750] leading-[1.05] text-[var(--ink)]",
  detailCopy: "mt-[9px] max-w-[760px] text-[13px] leading-[1.6] text-[var(--ink-body)]",
  chips: "mt-[13px] flex flex-wrap gap-[7px]",
  chip:
    "h-[22px] rounded-[4px] border border-[var(--ink-faint)] bg-[var(--chip-bg)] px-2 text-xs font-normal text-[var(--ink-dim)]",
  chipPrimary: "border-[var(--chip-primary-border)] bg-[var(--chip-primary-bg)] text-[var(--chip-primary-ink)]",
  switch:
    "h-5 w-9 rounded-full border border-[var(--switch-border)] data-checked:bg-[var(--green)] data-unchecked:bg-[var(--ink-faint)] [&_[data-slot=switch-thumb]]:bg-[var(--bg)]",
  stats: "grid grid-cols-4 border-b border-[var(--ink-faint)]",
  stat: "min-h-[54px] border-r border-[var(--ink-faint)] bg-[var(--stat-bg)] px-6 py-[11px] last:border-r-0",
  statLabel: "text-xs text-[var(--ink-dim)]",
  statValue: "mt-[5px] text-[13px] font-[650] tabular-nums text-[var(--ink)]",
  workspace: "grid min-h-0 grid-cols-[minmax(0,1fr)_282px] max-[1400px]:grid-cols-[minmax(0,1fr)]",
  doc: "grid min-w-0 grid-rows-[46px_1fr] gap-0 border-r border-[var(--ink-faint)] max-[1400px]:border-r-0",
  tabs: "flex h-[46px] w-full items-end justify-start gap-3 rounded-none border-b border-[var(--ink-faint)] bg-transparent px-6 py-0",
  tab:
    "relative h-[46px] flex-none rounded-none border-0 bg-transparent px-0 py-0 text-[13px] font-normal text-[var(--ink-dim)] shadow-none transition-colors hover:text-[var(--ink)] data-[state=active]:bg-transparent data-[state=active]:font-[650] data-[state=active]:text-[var(--ink)] data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:bottom-[-1px] data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[var(--accent)]",
  tabPanel: "min-h-0 overflow-auto px-6 pb-6 pt-[18px]",
  codeCard: "grid min-h-full grid-rows-[40px_1fr] overflow-hidden rounded-lg border border-[var(--code-border)] bg-[var(--code-bg)]",
  codeHead: "flex items-center justify-between gap-3 border-b border-[var(--code-border)] bg-[var(--code-head-bg)] px-[13px] text-xs text-[var(--code-muted)]",
  codeAction: "inline-flex h-[26px] items-center gap-1.5 rounded-[5px] border-0 bg-transparent px-1.5 text-inherit hover:bg-[var(--hover)] hover:text-[var(--ink)]",
  markdown:
    "max-w-[74ch] px-5 pb-7 pt-5 text-[13px] leading-[1.75] text-[var(--code-ink)] [&_h1]:mb-4 [&_h1]:mt-1 [&_h1]:text-[22px] [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-[16px] [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-[14px] [&_h3]:font-bold [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-[var(--hover)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:[font-family:var(--code-font)] [&_pre]:mb-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-[var(--code-head-bg)] [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  rail: "overflow-auto px-[18px] pb-6 pt-[18px] max-[1400px]:hidden",
  railSection: "mb-[18px] border-b border-[var(--ink-faint)] pb-[18px]",
  railTitle: "mb-[11px] text-xs text-[var(--ink-dim)]",
  path: "truncate text-xs text-[var(--ink)]",
  caption: "mt-1 text-xs leading-[1.45] text-[var(--ink-dim)]",
  location: "py-2",
  ledger: "grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs text-[var(--ink-soft)]",
  ledgerValue: "text-right font-[650] text-[var(--ink)]",
  actionRow: "flex flex-wrap gap-2",
  actionButton:
    "min-h-[31px] rounded-[5px] border-0 bg-[var(--button-bg)] px-[11px] text-xs font-[650] text-[var(--button-ink)] hover:opacity-85",
  secondaryButton: "bg-[var(--hover-strong)] text-[var(--ink)]",
  dangerButton: "bg-[oklch(0.55_0.16_30)] text-[oklch(0.98_0.01_90)]",
  inlineState: "m-2 grid gap-2 rounded-lg border border-[var(--ink-faint)] bg-[var(--chip-bg)] p-3.5 text-[var(--ink-soft)]",
  panelList: "grid gap-2.5",
  panelRow: "grid gap-[5px] rounded-lg border border-[var(--ink-faint)] bg-[var(--chip-bg)] p-3 text-[var(--ink-soft)]",
  panelCode: "truncate text-[var(--ink)]",
  filesLayout: "grid min-h-full grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-lg border border-[var(--code-border)] bg-[var(--code-bg)]",
  fileTree: "border-r border-[var(--code-border)] bg-[var(--code-head-bg)] p-3",
  fileTreeTitle: "mb-2 text-xs font-semibold text-[var(--ink-dim)]",
  fileTreeItem: "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--ink-soft)]",
  fileTreeItemActive: "bg-[var(--selected-bg)] text-[var(--ink)]",
  filePreview: "min-w-0 overflow-auto",
  centerDetail: "flex min-h-full flex-col items-start justify-center gap-3.5 p-11 text-[var(--ink-soft)]",
  centerTitle: "m-0 text-3xl text-[var(--ink)]",
  centerBody: "m-0 max-w-[620px] leading-[1.55]",
  archiveGrid: "grid w-[min(720px,100%)] grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-y border-[var(--ink-faint)] py-4",
  filled: "fill-[var(--accent)] text-[var(--accent)]"
};

export function App(): ReactElement {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") === "dark" ? "dark" : "light"));
  const [inventory, setInventory] = useState<SkillInventory | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedArchivedId, setSelectedArchivedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SidebarSelection>({ type: "library" });
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("added");
  const [detailTab, setDetailTab] = useState<DetailTab>("content");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>({ key: "ready" });
  const searchRef = useRef<HTMLInputElement>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus({ key: "scanning" });
    try {
      const nextInventory = await window.skillManager.loadInventory();
      setInventory(nextInventory);
      setSelectedSkillId((current) => current ?? nextInventory.active[0]?.id ?? null);
      setStatus({ key: "scanned", values: { count: nextInventory.active.length } });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setStatus({ key: "scanFailed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    localStorage.setItem("language", languageCode(i18n.language));
  }, [i18n.language]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (command && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void loadInventory();
      }
      if (command && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        setDetailTab(detailTabs[Number(event.key) - 1]!);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadInventory]);

  const activeSkills = inventory?.active ?? [];
  const archivedSkills = inventory?.archived ?? [];
  const filteredSkills = useMemo(() => sortSkills(filterSkills(activeSkills, selection, query), sortMode), [activeSkills, selection, query, sortMode]);
  const selectedSkill = activeSkills.find((skill) => skill.id === selectedSkillId) ?? filteredSkills[0] ?? activeSkills[0] ?? null;
  const selectedArchived = archivedSkills.find((archived) => archived.id === selectedArchivedId) ?? archivedSkills[0] ?? null;
  const isArchivedView = selection.type === "review" && selection.review === "archived";
  const visibleArchived = isArchivedView ? archivedSkills.filter((archived) => matchesText([archived.name, archived.title, archived.originalPath], query)) : [];
  const packageGroups = useMemo(() => groupByPackage(activeSkills, t), [activeSkills, t]);
  const statusText = t(`status.${status.key}`, status.values);
  const dateLabel = useCallback((value: string | null) => relativeDateLabel(value, t), [t]);
  const language = languageCode(i18n.language);

  useEffect(() => {
    if (!isArchivedView && filteredSkills.length > 0 && !filteredSkills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(filteredSkills[0]!.id);
    }
    if (isArchivedView && visibleArchived.length > 0 && !visibleArchived.some((archived) => archived.id === selectedArchivedId)) {
      setSelectedArchivedId(visibleArchived[0]!.id);
    }
  }, [filteredSkills, isArchivedView, selectedArchivedId, selectedSkillId, visibleArchived]);

  async function archiveSkill(skill: SkillRecord): Promise<void> {
    const next = await window.skillManager.archiveSkill(skill.id);
    setInventory(next);
    setSelectedSkillId(next.active[0]?.id ?? null);
    setStatus({ key: "archived", values: { title: skill.title } });
  }

  async function restoreSkill(archived: ArchivedSkill): Promise<void> {
    const result = await window.skillManager.restoreSkill(archived.id);
    if (result.error) {
      setError(result.error.message);
      setStatus({ key: "restoreConflict" });
      return;
    }
    setInventory(result.inventory ?? null);
    setSelection({ type: "library" });
    setStatus({ key: "restored", values: { title: archived.title } });
  }

  async function exportReport(): Promise<void> {
    const ids = filteredSkills.length > 0 ? filteredSkills.map((skill) => skill.id) : activeSkills.map((skill) => skill.id);
    const result = await window.skillManager.exportCleanupReport(ids);
    setStatus({ key: "reportExported" });
    await window.skillManager.revealPath(result.markdownPath);
  }

  async function toggleLanguage(): Promise<void> {
    const next = language === "zh" ? "en" : "zh";
    localStorage.setItem("language", next);
    await i18n.changeLanguage(next);
  }

  const selectedPackage = selectedSkill?.package ? packageGroups.find((group) => group.id === selectedSkill.package?.id) : null;
  const noRoots = inventory && inventory.audit.roots.every((root) => !root.exists);
  const noSkills = inventory && inventory.active.length === 0 && inventory.archived.length === 0;

  return (
    <TooltipProvider delayDuration={250}>
      <main className={ui.shell} data-scan-state={loading ? "loading" : "ready"}>
        <aside className={ui.sidebar}>
          <div>
            <div className={ui.titlebarSpace} aria-hidden="true" />
            <div className={ui.brand}>
              <div className={ui.brandMain}>
                <span className={ui.brandMark}>
                  <BookOpen size={16} />
                </span>
                <span>Skill Manager</span>
              </div>
              <div className={ui.systemStatus}>
                <span className={ui.pulse} />
                <span>{statusText}</span>
              </div>
            </div>
          </div>

          <nav className={ui.nav} aria-label={t("aria.skillFilters")}>
            <NavBlock title={t("nav.library")}>
              <NavItem icon={<Grid2X2 />} label={t("nav.installed")} count={activeSkills.length} active={selection.type === "library"} onClick={() => setSelection({ type: "library" })} />
              <NavItem icon={<Plus />} label={t("nav.add")} active={selection.type === "add"} onClick={() => setSelection({ type: "add" })} />
              <NavItem icon={<Package />} label={t("nav.packages")} count={packageGroups.length} active={selection.type === "packages"} onClick={() => setSelection({ type: "packages" })} />
            </NavBlock>
            <NavBlock title={t("nav.sources")}>
              <NavItem icon={<Folder />} label={t("nav.agents")} count={activeSkills.filter((skill) => skill.agent === "agents").length} active={selection.type === "source" && selection.source === "agents"} onClick={() => setSelection({ type: "source", source: "agents" })} />
              <NavItem icon={<Code2 />} label={t("nav.codex")} count={activeSkills.filter((skill) => skill.agent === "codex").length} active={selection.type === "source" && selection.source === "codex"} onClick={() => setSelection({ type: "source", source: "codex" })} />
              <NavItem icon={<BookOpen />} label={t("nav.claude")} count={activeSkills.filter((skill) => skill.agent === "claude").length} active={selection.type === "source" && selection.source === "claude"} onClick={() => setSelection({ type: "source", source: "claude" })} />
            </NavBlock>
            <NavBlock title={t("nav.review")}>
              <NavItem icon={<Clock3 />} label={t("nav.recent")} count={activeSkills.filter((skill) => skill.usageCount > 0).length} active={selection.type === "review" && selection.review === "recent"} onClick={() => setSelection({ type: "review", review: "recent" })} />
              <NavItem icon={<Search />} label={t("nav.noEvidence")} count={activeSkills.filter((skill) => skill.usageCount === 0).length} active={selection.type === "review" && selection.review === "no-evidence"} onClick={() => setSelection({ type: "review", review: "no-evidence" })} />
              <NavItem icon={<FileText />} label={t("nav.highContext")} count={activeSkills.filter((skill) => skill.contextTokens >= 2000).length} active={selection.type === "review" && selection.review === "high-context"} onClick={() => setSelection({ type: "review", review: "high-context" })} />
              <NavItem icon={<Archive />} label={t("nav.archived")} count={archivedSkills.length} active={isArchivedView} onClick={() => setSelection({ type: "review", review: "archived" })} />
            </NavBlock>
          </nav>

          <div className={ui.sideFooter}>
            <div className={ui.scanLabel}>
              {t("footer.scanned")} {inventory ? dateLabel(inventory.scannedAt) : t("footer.pending")}
              <br />
              {t("footer.logsChecked", { count: inventory?.sessionRootAudits.reduce((sum, audit) => sum + audit.logCount, 0) ?? 0 })}
            </div>
            <div className={ui.footerButtons}>
              <TooltipButton className={ui.iconButton} label={t("actions.switchLanguage")} onClick={() => void toggleLanguage()}>
                <Languages size={16} />
              </TooltipButton>
              <TooltipButton className={ui.iconButton} label={t("actions.switchTheme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </TooltipButton>
            </div>
          </div>
        </aside>

        <section className={ui.listPane}>
          <header className={ui.listHead}>
            <div className={ui.listTitleRow}>
              <div className={ui.paneTitle}>{isArchivedView ? t("list.titleArchived") : t("list.titleSkills")}</div>
              <div className={ui.toolbar}>
                <IconButton label={t("actions.rescan")} onClick={() => void loadInventory()} icon={loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} />
                <IconButton label={t("actions.addSkill")} onClick={() => setSelection({ type: "add" })} icon={<Plus />} />
              </div>
            </div>
            <div className={ui.sortControl} aria-label={t("aria.skillSort")}>
              <ArrowDownWideNarrow className={ui.sortIcon} size={14} aria-hidden="true" />
              <button className={cn(ui.sortButton, sortMode === "added" && ui.sortButtonActive)} type="button" onClick={() => setSortMode("added")}>
                {t("list.sortAdded")}
              </button>
              <button className={cn(ui.sortButton, sortMode === "usage" && ui.sortButtonActive)} type="button" onClick={() => setSortMode("usage")}>
                {t("list.sortUsage")}
              </button>
            </div>
            <div className={ui.searchWrap}>
              <Search className={ui.searchIcon} size={15} />
              <Input ref={searchRef} className={ui.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("list.searchPlaceholder")} placeholder={t("list.searchPlaceholder")} />
            </div>
          </header>

          <div className={ui.rows}>
            {loading ? <InlineState icon={<Loader2 className="animate-spin" />} title={t("list.loadingTitle")} body={t("list.loadingBody")} /> : null}
            {error ? <InlineState icon={<FileText />} title={t("list.errorTitle")} body={error} /> : null}
            {noRoots ? <InlineState icon={<Folder />} title={t("list.noRootsTitle")} body={t("list.noRootsBody")} /> : null}
            {noSkills && !noRoots ? <InlineState icon={<Package />} title={t("list.noSkillsTitle")} body={t("list.noSkillsBody")} /> : null}
            {selection.type === "add" && inventory ? <AddSkillsPanel roots={inventory.audit.roots.map((root) => root.path)} t={t} /> : null}
            {selection.type === "packages" && packageGroups.map((group) => <PackageRow key={group.id} group={group} onClick={() => setSelectedSkillId(group.skills[0]?.id ?? null)} t={t} />)}
            {isArchivedView
              ? visibleArchived.map((archived) => (
                  <ArchivedRow key={archived.id} archived={archived} active={selectedArchived?.id === archived.id} onClick={() => setSelectedArchivedId(archived.id)} t={t} dateLabel={dateLabel} />
                ))
              : groupedRows(filteredSkills, t).map((group) => (
                  <div key={group.title} className={ui.rowGroup}>
                    <div className={ui.group}>
                      <span>{group.title}</span>
                      <span>{group.skills.length}</span>
                    </div>
                    {group.skills.map((skill) => (
                      <SkillRow key={skill.id} skill={skill} active={selectedSkill?.id === skill.id} onClick={() => setSelectedSkillId(skill.id)} t={t} dateLabel={dateLabel} />
                    ))}
                  </div>
                ))}
          </div>
        </section>

        <section className={ui.detail}>
          {isArchivedView && selectedArchived ? (
            <ArchivedDetail archived={selectedArchived} onRestore={() => void restoreSkill(selectedArchived)} onReveal={() => void window.skillManager.revealPath(selectedArchived.archivePath)} t={t} dateLabel={dateLabel} />
          ) : selectedSkill ? (
            <SkillDetail
              skill={selectedSkill}
              tab={detailTab}
              selectedPackage={selectedPackage}
              onTab={setDetailTab}
              onArchive={() => void archiveSkill(selectedSkill)}
              onReveal={() => void window.skillManager.revealPath(selectedSkill.path)}
              onExport={() => void exportReport()}
              t={t}
              dateLabel={dateLabel}
            />
          ) : (
            <EmptyDetail t={t} />
          )}
        </section>
      </main>
    </TooltipProvider>
  );
}

function NavBlock({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className={ui.navBlock}>
      <div className={ui.navTitle}>{title}</div>
      {children}
    </section>
  );
}

function NavItem({ icon, label, count, active, onClick }: { icon: ReactNode; label: string; count?: number; active?: boolean; onClick: () => void }): ReactElement {
  return (
    <button className={cn(ui.navItem, active && ui.navItemActive)} type="button" aria-current={active ? "page" : undefined} onClick={onClick}>
      {icon}
      <span>{label}</span>
      <span className={ui.count}>{count ?? ""}</span>
    </button>
  );
}

function ArchivedRow({ archived, active, onClick, t, dateLabel }: { archived: ArchivedSkill; active: boolean; onClick: () => void; t: TFunction; dateLabel: (value: string | null) => string }): ReactElement {
  return (
    <button className={cn(ui.skillRow, active && ui.skillRowActive)} type="button" onClick={onClick}>
      <div className={ui.skillIcon}>
        <Archive size={16} />
      </div>
      <div className={ui.skillMain}>
        <div className={ui.skillName}>{archived.title}</div>
        <div className={ui.skillDesc}>{archived.originalPath}</div>
      </div>
      <div className={ui.metric}>
        <strong className={ui.metricStrong}>{dateLabel(archived.archivedAt)}</strong>
        <span>{formatBytes(archived.sizeBytes)}</span>
      </div>
      <span className="sr-only">{t("detail.archivedAt")}</span>
    </button>
  );
}

function SkillRow({ skill, active, onClick, t, dateLabel }: { skill: SkillRecord; active: boolean; onClick: () => void; t: TFunction; dateLabel: (value: string | null) => string }): ReactElement {
  return (
    <button className={cn(ui.skillRow, active && ui.skillRowActive)} type="button" aria-current={active ? "true" : undefined} onClick={onClick}>
      <div className={ui.skillIcon}>{skillIcon(skill)}</div>
      <div className={ui.skillMain}>
        <div className={ui.skillName}>{skill.title}</div>
        <div className={ui.skillDesc}>{skill.summary}</div>
        <div className={ui.agentDots} aria-label={t("aria.agentSkill", { agent: skill.agent })}>
          <span className={ui.agentDot} />
          {skill.usageCount > 0 ? <span className={ui.agentDot} /> : null}
          {skill.package ? <span className={ui.agentDot} /> : null}
        </div>
      </div>
      <div className={ui.metric}>
        <strong className={ui.metricStrong}>{skill.usageCount}</strong>
        <span>{dateLabel(skill.lastUsedAt)}</span>
      </div>
    </button>
  );
}

function PackageRow({ group, onClick, t }: { group: PackageGroup; onClick: () => void; t: TFunction }): ReactElement {
  return (
    <button className={ui.skillRow} type="button" onClick={onClick}>
      <div className={ui.skillIcon}>
        <Package size={16} />
      </div>
      <div className={ui.skillMain}>
        <div className={ui.skillName}>{group.title}</div>
        <div className={ui.skillDesc}>{group.source}</div>
      </div>
      <div className={ui.metric}>
        <strong className={ui.metricStrong}>{group.skills.length}</strong>
        <span>{group.skills.length === 1 ? t("list.skill") : t("list.skills")}</span>
      </div>
    </button>
  );
}

function SkillDetail({
  skill,
  tab,
  selectedPackage,
  onTab,
  onArchive,
  onReveal,
  onExport,
  t,
  dateLabel
}: {
  skill: SkillRecord;
  tab: DetailTab;
  selectedPackage: PackageGroup | null | undefined;
  onTab: (tab: DetailTab) => void;
  onArchive: () => void;
  onReveal: () => void;
  onExport: () => void;
  t: TFunction;
  dateLabel: (value: string | null) => string;
}): ReactElement {
  const packageSkillCount = selectedPackage?.skills.length ?? 1;
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(true);
  }, [skill.id]);

  return (
    <>
      <header className={ui.detailHead}>
        <div className={ui.detailTop}>
          <div>
            <div className={ui.detailTitle}>{skill.title}</div>
            <div className={ui.detailCopy}>{skill.summary}</div>
            <div className={ui.chips}>
              <Badge variant="outline" className={cn(ui.chip, ui.chipPrimary)}>
                <GitBranch size={14} />
                {skill.package?.source ?? t("detail.manual")}
              </Badge>
              <Badge variant="outline" className={ui.chip}>
                <ShieldCheck size={14} />
                {skill.package?.isInferred ? t("detail.inferredSource") : skill.package ? t("detail.lockfileSource") : t("detail.localFolder")}
              </Badge>
              <Badge variant="outline" className={ui.chip}>
                <Package size={14} />
                {packageSkillCount} {packageSkillCount === 1 ? t("list.skill") : t("list.skills")}
              </Badge>
            </div>
          </div>
          <div className={ui.toolbar}>
            <IconButton label={t("actions.exportReport")} icon={<FileText />} onClick={onExport} />
            <Switch className={ui.switch} aria-label={t("aria.skillEnabled")} checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </header>

      <div className={ui.stats}>
        <Stat label={t("detail.usage")} value={t("detail.runs", { count: skill.usageCount })} />
        <Stat label={t("detail.lastUsed")} value={dateLabel(skill.lastUsedAt)} />
        <Stat label={t("detail.context")} value={t("detail.tokens", { count: skill.contextTokens })} />
        <Stat label={t("detail.size")} value={formatBytes(skill.sizeBytes)} />
      </div>

      <div className={ui.workspace}>
        <Tabs className={ui.doc} value={tab} onValueChange={(value) => onTab(value as DetailTab)}>
          <TabsList className={ui.tabs} aria-label={t("aria.skillDetailViews")} variant="line">
            {detailTabs.map((item) => (
              <TabsTrigger key={item} className={ui.tab} value={item}>
                {t(`detail.tabs.${item}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {detailTabs.map((item) => (
            <TabsContent key={item} className={ui.tabPanel} value={item}>
              {detailTabContent(skill, item, t, dateLabel)}
            </TabsContent>
          ))}
        </Tabs>

        <aside className={ui.rail}>
          <RailSection title={t("detail.installedLocations")}>
            {skill.locations.map((location) => (
              <div key={location.path} className={ui.location}>
                <div className={ui.path}>{location.path}</div>
                <div className={ui.caption}>{location.rootKind}</div>
              </div>
            ))}
          </RailSection>
          <RailSection title={t("detail.source")}>
            <div className={ui.location}>
              <div className={ui.path}>{skill.package?.source ?? t("detail.manual")}</div>
              <div className={ui.caption}>{skill.package?.updatedAt ? t("detail.updated", { date: dateLabel(skill.package.updatedAt) }) : t("detail.noPackageMetadata")}</div>
            </div>
          </RailSection>
          <RailSection title={t("detail.localEvidence")}>
            {skill.usageEvidence.length === 0 ? (
              <div className={ui.caption}>{t("detail.noLocalEvidence")}</div>
            ) : (
              skill.usageEvidence.slice(0, 3).map((evidence) => (
                <div key={evidence.id} className={ui.location}>
                  <div className={ui.path}>{pathName(evidence.sessionPath)}</div>
                  <div className={ui.caption}>
                    {evidenceKindLabel(evidence.kind, t)}, {dateLabel(evidence.occurredAt)}
                  </div>
                </div>
              ))
            )}
          </RailSection>
          <div className={ui.actionRow}>
            <Button className={ui.actionButton} type="button" onClick={onReveal}>
              {t("actions.open")} <ExternalLink size={14} />
            </Button>
            <ArchiveAction skillTitle={skill.title} onArchive={onArchive} t={t} />
          </div>
        </aside>
      </div>
    </>
  );
}

function ArchiveAction({ skillTitle, onArchive, t }: { skillTitle: string; onArchive: () => void; t: TFunction }): ReactElement {
  return (
    <ConfirmDialog
      title={t("dialog.archiveTitle", { title: skillTitle })}
      description={t("dialog.archiveDescription")}
      confirmLabel={t("actions.archive")}
      cancelLabel={t("actions.cancel")}
      confirmClassName={cn(ui.actionButton, ui.dangerButton)}
      onConfirm={onArchive}
      trigger={
        <Button className={cn(ui.actionButton, ui.dangerButton)} type="button">
          {t("actions.archive")}
        </Button>
      }
    />
  );
}

function ArchivedDetail({ archived, onRestore, onReveal, t, dateLabel }: { archived: ArchivedSkill; onRestore: () => void; onReveal: () => void; t: TFunction; dateLabel: (value: string | null) => string }): ReactElement {
  return (
    <div className={ui.centerDetail}>
      <Archive size={34} />
      <h1 className={ui.centerTitle}>{archived.title}</h1>
      <p className={ui.centerBody}>{t("detail.archivedBody")}</p>
      <div className={ui.archiveGrid}>
        <span className="text-[var(--ink-dim)]">{t("detail.original")}</span>
        <strong className="truncate text-[var(--ink)]">{archived.originalPath}</strong>
        <span className="text-[var(--ink-dim)]">{t("detail.archivePath")}</span>
        <strong className="truncate text-[var(--ink)]">{archived.archivePath}</strong>
        <span className="text-[var(--ink-dim)]">{t("detail.archivedAt")}</span>
        <strong className="truncate text-[var(--ink)]">{dateLabel(archived.archivedAt)}</strong>
      </div>
      <div className={ui.actionRow}>
        <Button className={ui.actionButton} type="button" onClick={onRestore}>
          <RotateCcw size={14} /> {t("actions.restore")}
        </Button>
        <Button className={cn(ui.actionButton, ui.secondaryButton)} type="button" onClick={onReveal}>
          {t("actions.reveal")}
        </Button>
      </div>
    </div>
  );
}

function detailTabContent(skill: SkillRecord, tab: DetailTab, t: TFunction, dateLabel: (value: string | null) => string): ReactElement {
  if (tab === "usage") {
    return (
      <div className={ui.panelList}>
        {skill.usageEvidence.length === 0 ? (
          <InlineState icon={<Search />} title={t("detail.emptyUsageTitle")} body={t("detail.emptyUsageBody")} />
        ) : (
          skill.usageEvidence.map((evidence) => (
            <div key={evidence.id} className={ui.panelRow}>
              <strong className="text-[var(--ink)]">{evidenceKindLabel(evidence.kind, t)}</strong>
              <span>{t("detail.session", { kind: evidence.sessionKind })}</span>
              <code className={ui.panelCode}>{evidence.sessionPath}</code>
            </div>
          ))
        )}
      </div>
    );
  }
  if (tab === "files") {
    return (
      <div className={ui.filesLayout}>
        <div className={ui.fileTree} aria-label={t("aria.fileTree")}>
          <div className={ui.fileTreeTitle}>{pathName(skill.path)}</div>
          <div className={ui.fileTreeItem}>
            <Folder size={15} />
            <span className="truncate">{pathName(skill.path)}</span>
          </div>
          <button className={cn(ui.fileTreeItem, ui.fileTreeItemActive)} type="button">
            <FileText size={15} />
            <span className="truncate">SKILL.md</span>
          </button>
          <div className={ui.caption}>{formatBytes(new Blob([skill.content]).size)}</div>
        </div>
        <div className={ui.filePreview}>
          <div className={ui.codeHead}>
            <span>SKILL.md</span>
            <span className="truncate">{skill.skillFilePath}</span>
          </div>
          <MarkdownView content={skill.content} />
        </div>
      </div>
    );
  }
  if (tab === "history") {
    return (
      <div className={ui.panelList}>
        <div className={ui.panelRow}>
          <strong className="text-[var(--ink)]">{t("detail.updated", { date: "" }).trim()}</strong>
          <span>{dateLabel(skill.updatedAt)}</span>
          <code className={ui.panelCode}>{skill.updatedAt ?? t("date.unknown")}</code>
        </div>
        <div className={ui.panelRow}>
          <strong className="text-[var(--ink)]">{t("detail.status")}</strong>
          <span>{t(`recommendation.${skill.recommendation}`)}</span>
          <code className={ui.panelCode}>{skill.id}</code>
        </div>
      </div>
    );
  }
  return (
    <div className={ui.codeCard}>
      <div className={ui.codeHead}>
        <span>SKILL.md</span>
        <Button className={ui.codeAction} type="button" onClick={() => void navigator.clipboard.writeText(skill.content)}>
          <Copy size={14} /> {t("actions.copy")}
        </Button>
      </div>
      <MarkdownView content={skill.content} />
    </div>
  );
}

function MarkdownView({ content }: { content: string }): ReactElement {
  return (
    <div className={ui.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(content)}</ReactMarkdown>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className={ui.stat}>
      <div className={ui.statLabel}>{label}</div>
      <div className={ui.statValue}>{value}</div>
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className={ui.railSection}>
      <div className={ui.railTitle}>{title}</div>
      {children}
    </section>
  );
}

function InlineState({ icon, title, body }: { icon: ReactNode; title: string; body: string }): ReactElement {
  return (
    <div className={ui.inlineState}>
      {icon}
      <strong className="text-[var(--ink)]">{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function AddSkillsPanel({ roots, t }: { roots: string[]; t: TFunction }): ReactElement {
  return (
    <div className={ui.inlineState}>
      <Sparkles size={22} />
      <strong className="text-[var(--ink)]">{t("list.addTitle")}</strong>
      <span>{t("list.addBody")}</span>
      {roots.map((root) => (
        <code className={ui.panelCode} key={root}>
          {root}
        </code>
      ))}
    </div>
  );
}

function EmptyDetail({ t }: { t: TFunction }): ReactElement {
  return (
    <div className={ui.centerDetail}>
      <Box size={34} />
      <h1 className={ui.centerTitle}>{t("detail.noSelectionTitle")}</h1>
      <p className={ui.centerBody}>{t("detail.noSelectionBody")}</p>
    </div>
  );
}

function filterSkills(skills: SkillRecord[], selection: SidebarSelection, query: string): SkillRecord[] {
  let result = skills;
  if (selection.type === "source") result = result.filter((skill) => skill.agent === selection.source);
  if (selection.type === "review" && selection.review === "recent") result = result.filter((skill) => skill.usageCount > 0);
  if (selection.type === "review" && selection.review === "no-evidence") result = result.filter((skill) => skill.usageCount === 0);
  if (selection.type === "review" && selection.review === "high-context") result = result.filter((skill) => skill.contextTokens >= 2000);
  if (selection.type === "packages") result = result.filter((skill) => skill.package);
  return result.filter((skill) => matchesText([skill.name, skill.title, skill.summary, skill.package?.source, skill.package?.sourceUrl, skill.path], query));
}

function sortSkills(skills: SkillRecord[], mode: SortMode): SkillRecord[] {
  return [...skills].sort((a, b) => {
    if (mode === "usage") {
      return b.usageCount - a.usageCount || sortDateValue(b) - sortDateValue(a) || a.title.localeCompare(b.title);
    }
    return sortDateValue(b) - sortDateValue(a) || b.usageCount - a.usageCount || a.title.localeCompare(b.title);
  });
}

function sortDateValue(skill: SkillRecord): number {
  const candidates = [skill.package?.installedAt, skill.package?.updatedAt, skill.updatedAt, skill.lastUsedAt];
  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

function matchesText(values: Array<string | null | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

interface PackageGroup {
  id: string;
  title: string;
  source: string;
  skills: SkillRecord[];
}

function groupByPackage(skills: SkillRecord[], t: TFunction): PackageGroup[] {
  const groups = new Map<string, PackageGroup>();
  for (const skill of skills) {
    const id = skill.package?.id ?? `manual:${familyTitle(skill, t)}`;
    const title = skill.package?.source ?? familyTitle(skill, t);
    const group = groups.get(id) ?? { id, title, source: skill.package?.sourceUrl ?? skill.package?.source ?? t("detail.manual"), skills: [] };
    group.skills.push(skill);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function groupedRows(skills: SkillRecord[], t: TFunction): PackageGroup[] {
  return groupByPackage(skills, t)
    .map((group) => ({ ...group, skills: [...group.skills] }))
    .sort((a, b) => sortDateValue(b.skills[0]!) - sortDateValue(a.skills[0]!) || b.skills[0]!.usageCount - a.skills[0]!.usageCount || a.title.localeCompare(b.title));
}

function familyTitle(skill: SkillRecord, t: TFunction): string {
  const parts = skill.name.split("-");
  return parts.length > 1 ? parts.slice(0, 2).join("-") : t("detail.manual");
}

function skillIcon(skill: SkillRecord): ReactElement {
  if (skill.agent === "codex") return <Code2 size={16} />;
  if (skill.agent === "claude") return <BookOpen size={16} />;
  if (skill.package) return <Package size={16} />;
  return <FileText size={16} />;
}

function pathName(value: string): string {
  return value.split(/[\\/]/).at(-1) ?? value;
}

function languageCode(value: string): "en" | "zh" {
  return value.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  return content.slice(end + 4).trimStart();
}

function relativeDateLabel(value: string | null, t: TFunction, now = new Date()): string {
  if (!value) return t("date.never");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("date.unknown");
  const days = Math.floor(Math.max(0, now.getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return t("date.today");
  if (days === 1) return t("date.yesterday");
  if (days < 30) return t("date.days", { count: days });
  if (days < 365) return t("date.months", { count: Math.floor(days / 30) });
  return t("date.years", { count: Math.floor(days / 365) });
}

function evidenceKindLabel(kind: string | null, t: TFunction): string {
  switch (kind) {
    case "codexSkillRead":
      return t("evidence.codexSkillRead");
    case "codexDirectLoad":
      return t("evidence.codexDirectLoad");
    case "claudeSkillTool":
      return t("evidence.claudeSkillTool");
    default:
      return t("evidence.none");
  }
}
