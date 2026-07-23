import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ArchiveError,
  ArchiveStore,
  CleanupReportStore,
  InventoryService,
  SkillPackageStore,
  SkillScanner,
  UsageAnalyzer,
  cleanupPlanReport,
  estimateTokens,
  normalizedPackageId,
  parseSkillMarkdown,
  safePathComponent,
  type ArchivedSkill,
  type UsageEvidence,
  type SkillRecord
} from "../src/index.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "skill-manager-core-"));
});

afterEach(async () => {
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
});

describe("Skill parser", () => {
  it("reads frontmatter, heading, description, and token estimate", async () => {
    const skillDir = path.join(tempRoot, ".agents", "skills", "agent-browser");
    await fs.promises.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, "SKILL.md");
    await fs.promises.writeFile(
      skillFile,
      [
        "---",
        "name: agent-browser",
        "description: Browser automation CLI for AI agents.",
        "---",
        "",
        "# Agent Browser",
        "",
        "Use this skill when browser state matters."
      ].join("\n")
    );

    const parsed = await parseSkillMarkdown(skillFile);

    expect(parsed?.name).toBe("agent-browser");
    expect(parsed?.title).toBe("Agent Browser");
    expect(parsed?.summary).toBe("Browser automation CLI for AI agents.");
    expect(parsed?.contextTokens).toBe(estimateTokens("agent-browser\nBrowser automation CLI for AI agents."));
  });

  it("falls back to folder name and body paragraph when frontmatter is missing", async () => {
    const skillDir = path.join(tempRoot, ".agents", "skills", "plain-skill");
    await fs.promises.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, "SKILL.md");
    await fs.promises.writeFile(skillFile, ["# Plain Skill", "", "Use this skill for a plain markdown fixture."].join("\n"));

    const parsed = await parseSkillMarkdown(skillFile);

    expect(parsed?.name).toBe("plain-skill");
    expect(parsed?.title).toBe("Plain Skill");
    expect(parsed?.summary).toBe("Use this skill for a plain markdown fixture.");
  });

  it("supports missing name and folded multiline descriptions", async () => {
    const skillDir = path.join(tempRoot, ".agents", "skills", "multiline-skill");
    await fs.promises.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, "SKILL.md");
    await fs.promises.writeFile(
      skillFile,
      [
        "---",
        "description: >",
        "  Use when the description spans multiple lines",
        "  and should read as one sentence.",
        "---",
        "",
        "# Multiline Skill"
      ].join("\n")
    );

    const parsed = await parseSkillMarkdown(skillFile);

    expect(parsed?.name).toBe("multiline-skill");
    expect(parsed?.summary).toBe("Use when the description spans multiple lines and should read as one sentence.");
  });

  it("recovers from malformed frontmatter lines", async () => {
    const skillDir = path.join(tempRoot, ".agents", "skills", "malformed-skill");
    await fs.promises.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, "SKILL.md");
    await fs.promises.writeFile(skillFile, ["---", "name [broken", "---", "", "A useful fallback paragraph for malformed frontmatter."].join("\n"));

    const parsed = await parseSkillMarkdown(skillFile);

    expect(parsed?.name).toBe("malformed-skill");
    expect(parsed?.summary).toBe("A useful fallback paragraph for malformed frontmatter.");
  });
});

describe("Skill package lockfile", () => {
  it("reads package metadata and normalizes source identity", async () => {
    const lockDir = path.join(tempRoot, ".agents");
    await fs.promises.mkdir(lockDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(lockDir, ".skill-lock.json"),
      JSON.stringify({
        skills: {
          "agent-browser": {
            source: "vercel-labs/agent-browser",
            sourceType: "github",
            sourceUrl: "git@github.com:vercel-labs/agent-browser.git",
            skillPath: "skills/agent-browser/SKILL.md",
            pluginName: "agent-browser",
            installedAt: "2026-06-26T12:00:00.123Z",
            updatedAt: "2026-06-27T12:00:00Z"
          }
        }
      })
    );

    const packages = await new SkillPackageStore(tempRoot).metadataBySkillName();

    expect(normalizedPackageId("git@github.com:vercel-labs/agent-browser.git")).toBe("https://github.com/vercel-labs/agent-browser");
    expect(packages.get("agent-browser")?.id).toBe("https://github.com/vercel-labs/agent-browser");
    expect(packages.get("agent-browser")?.source).toBe("vercel-labs/agent-browser");
    expect(packages.get("agent-browser")?.installedAt).toBe("2026-06-26T12:00:00.123Z");
  });

  it("uses source and plugin name fallbacks for package identity", async () => {
    const lockDir = path.join(tempRoot, ".agents");
    await fs.promises.mkdir(lockDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(lockDir, ".skill-lock.json"),
      JSON.stringify({
        skills: {
          "source-only": {
            source: "owner/source-only",
            sourceType: "github",
            skillPath: "skills/source-only/SKILL.md"
          },
          "plugin-only": {
            pluginName: "vendor-plugin",
            skillPath: "skills/plugin-only/SKILL.md"
          },
          ignored: {}
        }
      })
    );

    const packages = await new SkillPackageStore(tempRoot).metadataBySkillName();

    expect(packages.get("source-only")?.id).toBe("owner/source-only");
    expect(packages.get("plugin-only")?.id).toBe("vendor-plugin");
    expect(packages.has("ignored")).toBe(false);
  });

  it("returns an empty map for malformed lockfiles", async () => {
    const lockDir = path.join(tempRoot, ".agents");
    await fs.promises.mkdir(lockDir, { recursive: true });
    await fs.promises.writeFile(path.join(lockDir, ".skill-lock.json"), "{ broken");

    await expect(new SkillPackageStore(tempRoot).metadataBySkillName()).resolves.toEqual(new Map());
  });
});

describe("Skill scanner", () => {
  it("scans global roots and binds package plus usage metadata", async () => {
    await writeSkill(".agents/skills/agent-browser", "agent-browser", "Browser automation CLI for AI agents.");
    await writeLockfile();

    const scanner = new SkillScanner({ homeDir: tempRoot });
    const usage = new Map([
      [
        "agent-browser",
        {
          count: 2,
          lastUsedAt: "2026-06-29T00:00:00.000Z",
          evidence: [usageEvidenceFixture("agent-browser", "2026-06-29T00:00:00.000Z", "event")]
        }
      ]
    ]);
    const records = await scanner.scan(scanner.defaultRoots(), usage, new Date("2026-07-01T00:00:00.000Z"));

    expect(records).toHaveLength(1);
    expect(records[0]?.name).toBe("agent-browser");
    expect(records[0]?.package?.sourceUrl).toBe("https://github.com/vercel-labs/agent-browser");
    expect(records[0]?.usageCount).toBe(2);
    expect(records[0]?.recommendation).toBe("keep");
  });

  it("scans all three user roots and keeps duplicate names by path", async () => {
    await writeSkill(".agents/skills/shared", "shared", "Agents copy.");
    await writeSkill(".codex/skills/shared", "shared", "Codex copy.");
    await writeSkill(".claude/skills/shared", "shared", "Claude copy.");

    const scanner = new SkillScanner({ homeDir: tempRoot });
    const records = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));

    expect(records).toHaveLength(3);
    expect(new Set(records.map((record) => record.path)).size).toBe(3);
    expect(records.map((record) => record.agent).sort()).toEqual(["agents", "claude", "codex"]);
    expect(records.every((record) => record.recommendation === "review")).toBe(true);
  });

  it("keeps zero evidence in review and only suggests archive for old observed usage", async () => {
    await writeSkill(".agents/skills/no-evidence", "no-evidence", "No local evidence fixture.");
    await writeSkill(".agents/skills/old-evidence", "old-evidence", "Old local evidence fixture.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const usage = new Map([
      [
        "old-evidence",
        {
          count: 1,
          lastUsedAt: "2026-01-01T00:00:00.000Z",
          evidence: [usageEvidenceFixture("old-evidence", "2026-01-01T00:00:00.000Z", "event")]
        }
      ]
    ]);

    const records = await scanner.scan(scanner.defaultRoots(), usage, new Date("2026-07-01T00:00:00.000Z"));

    expect(records.find((record) => record.name === "no-evidence")?.recommendation).toBe("review");
    expect(records.find((record) => record.name === "old-evidence")?.recommendation).toBe("archive");
  });

  it("keeps old file-mtime and provenance-free evidence in review", async () => {
    await writeSkill(".agents/skills/mtime-evidence", "mtime-evidence", "File mtime evidence fixture.");
    await writeSkill(".agents/skills/missing-provenance", "missing-provenance", "Missing provenance fixture.");
    await writeSkill(".agents/skills/mixed-provenance", "mixed-provenance", "Mixed provenance fixture.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const usage = new Map([
      [
        "mtime-evidence",
        {
          count: 1,
          lastUsedAt: "2026-01-01T00:00:00.000Z",
          evidence: [usageEvidenceFixture("mtime-evidence", "2026-01-01T00:00:00.000Z", "file_mtime")]
        }
      ],
      [
        "missing-provenance",
        {
          count: 1,
          lastUsedAt: "2026-01-01T00:00:00.000Z",
          evidence: [{ ...usageEvidenceFixture("missing-provenance", "2026-01-01T00:00:00.000Z", "event"), timestampSource: undefined }]
        }
      ],
      [
        "mixed-provenance",
        {
          count: 2,
          lastUsedAt: "2026-01-02T00:00:00.000Z",
          evidence: [
            usageEvidenceFixture("mixed-provenance", "2026-01-02T00:00:00.000Z", "event"),
            usageEvidenceFixture("mixed-provenance", "2026-01-01T00:00:00.000Z", "file_mtime")
          ]
        }
      ]
    ]);

    const records = await scanner.scan(scanner.defaultRoots(), usage, new Date("2026-07-01T00:00:00.000Z"));

    expect(records.map((record) => record.recommendation)).toEqual(["review", "review", "review"]);
  });
});

describe("Usage analyzer", () => {
  it("finds active Codex skill reads and archived Codex session evidence", async () => {
    await writeSkill(".agents/skills/agent-browser", "agent-browser", "Browser automation CLI for AI agents.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const skills = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const skill = skills[0]!;

    const today = new Date();
    const activeDir = path.join(
      tempRoot,
      ".codex",
      "sessions",
      String(today.getFullYear()).padStart(4, "0"),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    );
    const archiveDir = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(activeDir, { recursive: true });
    await fs.promises.mkdir(archiveDir, { recursive: true });
    await writeJsonl(path.join(activeDir, "active.jsonl"), codexExecLine(`cat ${skill.skillFilePath}`));
    await writeJsonl(path.join(archiveDir, "archived.jsonl"), codexExecLine(`sed -n '1,40p' ${skill.skillFilePath}`));

    const analyzer = new UsageAnalyzer({ homeDir: tempRoot });
    const usage = await analyzer.analyzeSkillUsage(skills);

    expect(usage.get(skill.id)?.count).toBe(2);
    expect(usage.get(skill.id)?.evidence.map((item) => item.sessionKind).sort()).toEqual(["active", "archived"]);
    const audits = await analyzer.sessionRootAudits();
    expect(audits.find((audit) => audit.path === archiveDir)?.logCount).toBe(1);
  });

  it("finds Claude Skill tool calls", async () => {
    await writeSkill(".agents/skills/ai-promo-video-kit", "ai-promo-video-kit", "Build short-form video packages.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const skills = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const claudeDir = path.join(tempRoot, ".claude", "projects", "project-a");
    await fs.promises.mkdir(claudeDir, { recursive: true });
    await writeJsonl(path.join(claudeDir, "session.jsonl"), {
      type: "message",
      content: [{ type: "tool_use", name: "Skill", input: { skill: "ai-promo-video-kit" } }]
    });

    const usage = await new UsageAnalyzer({ homeDir: tempRoot }).analyzeSkillUsage(skills);

    expect(usage.get(skills[0]!.id)?.count).toBe(1);
    expect(usage.get(skills[0]!.id)?.evidence[0]?.kind).toBe("claudeSkillTool");
  });

  it("counts repeated matches on one log line once", async () => {
    await writeSkill(".agents/skills/agent-browser", "agent-browser", "Browser automation CLI for AI agents.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const skills = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const skill = skills[0]!;
    const today = new Date();
    const activeDir = path.join(
      tempRoot,
      ".codex",
      "sessions",
      String(today.getFullYear()).padStart(4, "0"),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    );
    await fs.promises.mkdir(activeDir, { recursive: true });
    await writeJsonl(path.join(activeDir, "active.jsonl"), codexExecLine(`cat ${skill.skillFilePath} && cat ${skill.skillFilePath}`));

    const usage = await new UsageAnalyzer({ homeDir: tempRoot }).analyzeSkillUsage(skills);

    expect(usage.get(skill.id)?.count).toBe(1);
    expect(usage.get(skill.id)?.evidence).toHaveLength(1);
  });

  it("normalizes escaped Windows separators in nested command JSON", async () => {
    await writeSkill(".agents/skills/windows-path", "windows-path", "Windows path fixture.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const skills = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const skill = skills[0]!;
    const archiveDir = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(archiveDir, { recursive: true });
    const escapedPath = skill.skillFilePath.replaceAll("/", "\\");
    await writeJsonl(path.join(archiveDir, "windows-path.jsonl"), codexExecLine(`type ${escapedPath}`));

    const usage = await new UsageAnalyzer({ homeDir: tempRoot }).analyzeSkillUsage(skills);

    expect(usage.get(skill.id)?.count).toBe(1);
  });

  it("uses the JSONL event timestamp ahead of the log file modification time", async () => {
    await writeSkill(".agents/skills/timestamped", "timestamped", "Timestamp fixture.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const skills = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const skill = skills[0]!;
    const archiveDir = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(archiveDir, { recursive: true });
    const event = { ...codexExecLine(`cat ${skill.skillFilePath}`), timestamp: "2026-02-03T04:05:06.000Z" };
    const logPath = path.join(archiveDir, "timestamped.jsonl");
    await writeJsonl(logPath, event);
    const recentMtime = new Date("2026-07-01T00:00:00.000Z");
    await fs.promises.utimes(logPath, recentMtime, recentMtime);

    const analyzer = new UsageAnalyzer({ homeDir: tempRoot });
    const usage = await analyzer.analyzeSkillUsage(skills);

    expect(usage.get(skill.id)?.lastUsedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(usage.get(skill.id)?.evidence[0]?.timestampSource).toBe("event");
    expect(analyzer.analysisAudit().timestampFallbackCount).toBe(0);
  });

  it("attributes path evidence to one duplicate copy and excludes ambiguous name-only evidence", async () => {
    await writeSkill(".agents/skills/shared", "shared", "Shared Agents copy.");
    await writeSkill(".codex/skills/shared", "shared", "Shared Codex copy.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const skills = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const codexSkill = skills.find((skill) => skill.agent === "codex")!;
    const agentsSkill = skills.find((skill) => skill.agent === "agents")!;
    const archiveDir = path.join(tempRoot, ".codex", "archived_sessions");
    const claudeDir = path.join(tempRoot, ".claude", "projects", "project-a");
    await fs.promises.mkdir(archiveDir, { recursive: true });
    await fs.promises.mkdir(claudeDir, { recursive: true });
    await writeJsonl(path.join(archiveDir, "path.jsonl"), codexExecLine(`cat ${codexSkill.skillFilePath}`));

    const analyzer = new UsageAnalyzer({ homeDir: tempRoot });
    const pathUsage = await analyzer.analyzeSkillUsage(skills);
    expect(pathUsage.get(codexSkill.id)?.count).toBe(1);
    expect(pathUsage.has(agentsSkill.id)).toBe(false);

    await fs.promises.rm(path.join(archiveDir, "path.jsonl"));
    await writeJsonl(path.join(claudeDir, "name.jsonl"), {
      type: "message",
      content: [{ type: "tool_use", name: "Skill", input: { skill: "shared" } }]
    });
    const ambiguousUsage = await analyzer.analyzeSkillUsage(skills);
    expect(ambiguousUsage.size).toBe(0);
    expect(analyzer.analysisAudit().ambiguousMatchesExcluded).toBe(1);
    expect(analyzer.warningsBySkillId().get(codexSkill.id)?.[0]).toContain("ambiguous usage evidence");
    expect(analyzer.warningsBySkillId().get(agentsSkill.id)?.[0]).toContain("ambiguous usage evidence");
  });

  it("reports time, size, and global file coverage limits", async () => {
    const archiveDir = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(archiveDir, { recursive: true });
    await fs.promises.writeFile(path.join(archiveDir, "small-a.jsonl"), "{}\n");
    await fs.promises.writeFile(path.join(archiveDir, "small-b.jsonl"), "{}\n");
    await fs.promises.writeFile(path.join(archiveDir, "oversized.jsonl"), "x".repeat(64));

    const audits = await new UsageAnalyzer({ homeDir: tempRoot, maxLogBytes: 16, maxLogFiles: 1 }).sessionRootAudits();
    const archivedAudit = audits.find((audit) => audit.path === archiveDir)!;
    const activeAudit = audits.find((audit) => audit.path.endsWith(path.join(".codex", "sessions")))!;

    expect(archivedAudit.eligibleLogCount).toBe(2);
    expect(archivedAudit.logCount).toBe(1);
    expect(archivedAudit.oversizedLogCount).toBe(1);
    expect(archivedAudit.excludedByFileLimitCount).toBe(1);
    expect(activeAudit.timeWindowDays).toBe(120);
  });
});

describe("Archive store", () => {
  it("archives and restores a skill folder through a durable ledger", async () => {
    const skill = await fixtureSkillRecord();
    const store = new ArchiveStore(path.join(tempRoot, "userData"));

    const archived = await store.archive(skill, new Date("2026-07-01T12:00:00.000Z"));

    expect(await exists(skill.path)).toBe(false);
    expect(await exists(archived.archivePath)).toBe(true);
    expect(archived.operationStatus).toBe("archived");
    expect((await store.archivedSkills())[0]?.originalPath).toBe(skill.path);
    expect(archived.contentHashBefore).toBeTruthy();
    expect(archived.contentHashAfter).toBe(archived.contentHashBefore);

    const restored = await store.restore(archived, new Date("2026-07-01T12:01:00.000Z"));

    expect(restored.operationStatus).toBe("restored");
    expect(restored.contentHashAfter).toBe(archived.contentHashBefore);
    expect(await exists(skill.path)).toBe(true);
    expect(await store.archivedSkills()).toHaveLength(0);
  });

  it.each<ArchivedSkill["operationStatus"]>(["archiving", "restoring"])(
    "keeps a recoverable %s entry visible without mutating its ledger",
    async (operationStatus) => {
      const skill = await fixtureSkillRecord();
      const store = new ArchiveStore(path.join(tempRoot, "userData"));
      const archived = await store.archive(skill, new Date("2026-07-01T12:00:00.000Z"));
      const interrupted: ArchivedSkill = { ...archived, operationStatus };
      await writeArchiveLedger(store, [interrupted]);
      const ledgerBeforeRead = await fs.promises.readFile(store.ledgerPath, "utf8");

      const visible = await store.archivedSkills();

      expect(visible).toHaveLength(1);
      expect(visible[0]?.operationStatus).toBe(operationStatus);
      expect(await fs.promises.readFile(store.ledgerPath, "utf8")).toBe(ledgerBeforeRead);
      const restored = await store.restore(visible[0]!, new Date("2026-07-01T12:01:00.000Z"));
      expect(restored.operationStatus).toBe("restored");
      expect(await exists(skill.path)).toBe(true);
    }
  );

  it("treats a restoring entry with a completed move as effectively restored during read-only audit", async () => {
    const skill = await fixtureSkillRecord();
    const store = new ArchiveStore(path.join(tempRoot, "userData"));
    const archived = await store.archive(skill, new Date("2026-07-01T12:00:00.000Z"));
    const interrupted: ArchivedSkill = { ...archived, operationStatus: "restoring" };
    await writeArchiveLedger(store, [interrupted]);
    await fs.promises.mkdir(path.dirname(skill.path), { recursive: true });
    await fs.promises.rename(archived.archivePath, skill.path);
    const ledgerBeforeRead = await fs.promises.readFile(store.ledgerPath, "utf8");

    expect(await store.archivedSkills()).toEqual([]);
    expect(await fs.promises.readFile(store.ledgerPath, "utf8")).toBe(ledgerBeforeRead);
    expect((await store.allLedgerEntries())[0]?.operationStatus).toBe("restoring");
    expect(await exists(skill.path)).toBe(true);
  });

  it("fails restore clearly when the original path already exists", async () => {
    const skill = await fixtureSkillRecord();
    const store = new ArchiveStore(path.join(tempRoot, "userData"));
    const archived = await store.archive(skill, new Date("2026-07-01T12:00:00.000Z"));
    await fs.promises.mkdir(skill.path, { recursive: true });

    await expect(store.restore(archived)).rejects.toMatchObject<Partial<ArchiveError>>({
      code: "restoreDestinationExists",
      pathValue: skill.path
    });
  });

  it("detects archived content changes before restore", async () => {
    const skill = await fixtureSkillRecord();
    const store = new ArchiveStore(path.join(tempRoot, "userData"));
    const archived = await store.archive(skill, new Date("2026-07-01T12:00:00.000Z"));
    await fs.promises.appendFile(path.join(archived.archivePath, "SKILL.md"), "\nchanged after archive\n");

    await expect(store.restore(archived)).rejects.toMatchObject<Partial<ArchiveError>>({
      code: "contentHashMismatch",
      pathValue: archived.archivePath
    });
    expect(await exists(archived.archivePath)).toBe(true);
    expect(await exists(skill.path)).toBe(false);
  });

  it("keeps cross-agent same-name archives unique within the same millisecond", async () => {
    await writeSkill(".agents/skills/shared", "shared", "Shared Agents copy.");
    await writeSkill(".codex/skills/shared", "shared", "Shared Codex copy.");
    const scanner = new SkillScanner({ homeDir: tempRoot });
    const skills = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const agentsSkill = skills.find((skill) => skill.agent === "agents")!;
    const codexSkill = skills.find((skill) => skill.agent === "codex")!;
    const store = new ArchiveStore(path.join(tempRoot, "userData"));
    const now = new Date(2026, 6, 1, 12, 0, 0, 123);

    const agentsArchive = await store.archive(agentsSkill, now);
    const codexArchive = await store.archive(codexSkill, now);
    const ledger = await store.allLedgerEntries();

    expect(agentsArchive.id).toMatch(/^20260701-120000-123-agents-shared-[a-f0-9]{10}$/);
    expect(codexArchive.id).toMatch(/^20260701-120000-123-codex-shared-[a-f0-9]{10}$/);
    expect(codexArchive.id).not.toBe(agentsArchive.id);
    expect(codexArchive.archivePath).not.toBe(agentsArchive.archivePath);
    expect(new Set(ledger.map((entry) => entry.id)).size).toBe(2);
    expect(ledger).toHaveLength(2);
    expect(await exists(agentsArchive.archivePath)).toBe(true);
    expect(await exists(codexArchive.archivePath)).toBe(true);
  });

  it("adds a sequence when the same Skill is archived again at the same millisecond", async () => {
    const skill = await fixtureSkillRecord();
    const store = new ArchiveStore(path.join(tempRoot, "userData"));
    const now = new Date(2026, 6, 1, 12, 0, 0, 123);
    const first = await store.archive(skill, now);
    await store.restore(first, new Date("2026-07-01T12:01:00.000Z"));

    const second = await store.archive(skill, now);

    expect(second.id).toBe(`${first.id}-2`);
    expect((await store.allLedgerEntries()).map((entry) => entry.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("refuses to overwrite an existing archive destination", async () => {
    const skill = await fixtureSkillRecord();
    const store = new ArchiveStore(path.join(tempRoot, "userData"));
    const now = new Date(2026, 6, 1, 12, 0, 0, 123);
    const archived = await store.archive(skill, now);
    await store.restore(archived, new Date("2026-07-01T12:01:00.000Z"));
    const destination = `${archived.archivePath}-2`;
    await fs.promises.mkdir(destination, { recursive: true });
    await fs.promises.writeFile(path.join(destination, "sentinel.txt"), "keep");

    await expect(store.archive(skill, now)).rejects.toMatchObject<Partial<ArchiveError>>({
      code: "archiveDestinationExists",
      pathValue: destination
    });
    expect(await fs.promises.readFile(path.join(destination, "sentinel.txt"), "utf8")).toBe("keep");
    expect(await exists(skill.path)).toBe(true);
  });
});

describe("Cleanup reports and inventory service", () => {
  it("exports Markdown and JSON reports with package source", async () => {
    await writeSkill(".agents/skills/agent-browser", "agent-browser", "Browser automation CLI for AI agents.");
    await writeLockfile();
    const service = new InventoryService({ homeDir: tempRoot, userDataDir: path.join(tempRoot, "userData") });
    const roughInventory = await service.loadInventory(new Date("2026-07-01T00:00:00.000Z"));
    const archiveDir = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(archiveDir, { recursive: true });
    const evidencePath = path.join(archiveDir, "old-agent-browser.jsonl");
    await writeJsonl(evidencePath, {
      ...codexExecLine(`cat ${roughInventory.active[0]!.skillFilePath}`),
      timestamp: "2026-01-01T00:00:00.000Z"
    });
    const oldEvidenceDate = new Date("2026-01-01T00:00:00.000Z");
    await fs.promises.utimes(evidencePath, oldEvidenceDate, oldEvidenceDate);
    const inventory = await service.loadInventory(new Date("2026-07-01T00:00:00.000Z"));
    const store = new CleanupReportStore(path.join(tempRoot, "userData"));

    const exportResult = await store.export(inventory, inventory.active, new Map(), new Date("2026-07-01T00:00:00.000Z"));
    const markdown = await fs.promises.readFile(exportResult.markdownPath, "utf8");
    const json = JSON.parse(await fs.promises.readFile(exportResult.jsonPath, "utf8")) as { skills: Array<{ packageSource: string }> };

    expect(markdown).toContain("vercel-labs/agent-browser");
    expect(json.skills[0]?.packageSource).toBe("vercel-labs/agent-browser");
  });

  it("keeps zero-evidence skills out of cleanup archive plans", async () => {
    await writeSkill(".agents/skills/no-evidence", "no-evidence", "Review-only fixture.");
    const service = new InventoryService({ homeDir: tempRoot, userDataDir: path.join(tempRoot, "userData") });
    const inventory = await service.loadInventory(new Date("2026-07-01T00:00:00.000Z"));
    const report = cleanupPlanReport(inventory, inventory.active, new Map(), new Date("2026-07-01T00:00:00.000Z"));

    expect(inventory.active[0]?.recommendation).toBe("review");
    expect(inventory.audit.suggestedArchiveCount).toBe(0);
    expect(report.selectedCount).toBe(0);
    expect(report.skills).toEqual([]);
  });

  it("excludes protected and review-later skills from archive candidates", async () => {
    await writeSkill(".agents/skills/protected-skill", "protected-skill", "Protected helper.");
    await writeSkill(".agents/skills/review-skill", "review-skill", "Review helper.");
    await writeSkill(".agents/skills/archive-skill", "archive-skill", "Archive helper.");
    const service = new InventoryService({ homeDir: tempRoot, userDataDir: path.join(tempRoot, "userData") });
    let inventory = await service.loadInventory(new Date("2026-07-01T00:00:00.000Z"));
    const archiveDir = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(archiveDir, { recursive: true });
    const evidencePath = path.join(archiveDir, "old-evidence.jsonl");
    await writeJsonl(
      evidencePath,
      {
        ...codexExecLine(inventory.active.map((skill) => `cat ${skill.skillFilePath}`).join(" && ")),
        timestamp: "2026-01-01T00:00:00.000Z"
      }
    );
    const oldEvidenceDate = new Date("2026-01-01T00:00:00.000Z");
    await fs.promises.utimes(evidencePath, oldEvidenceDate, oldEvidenceDate);
    inventory = await service.loadInventory(new Date("2026-07-01T00:00:00.000Z"));
    await service.setDecision(inventory.active.find((skill) => skill.name === "protected-skill")!.id, "protected");
    await service.setDecision(inventory.active.find((skill) => skill.name === "review-skill")!.id, "review");

    inventory = await service.loadInventory(new Date("2026-07-01T00:00:00.000Z"));

    expect(inventory.audit.suggestedArchiveCount).toBe(1);
    expect(inventory.active.find((skill) => skill.name === "protected-skill")?.status.protected).toBe(true);
    expect(inventory.active.find((skill) => skill.name === "review-skill")?.status.reviewLater).toBe(true);
  });

  it("archives and restores only records selected from the current inventory", async () => {
    await writeSkill(".agents/skills/archive-by-id", "archive-by-id", "Archive by id.");
    const service = new InventoryService({ homeDir: tempRoot, userDataDir: path.join(tempRoot, "userData") });
    let inventory = await service.loadInventory(new Date("2026-07-01T00:00:00.000Z"));
    const skill = inventory.active.find((item) => item.name === "archive-by-id")!;

    const archived = await service.archiveSkillById(skill.id);
    inventory = await service.loadInventory(new Date("2026-07-01T00:01:00.000Z"));

    expect(await exists(skill.path)).toBe(false);
    expect(inventory.archived.some((item) => item.id === archived.id)).toBe(true);

    await service.restoreArchivedById(archived.id);
    inventory = await service.loadInventory(new Date("2026-07-01T00:02:00.000Z"));

    expect(await exists(skill.path)).toBe(true);
    expect(inventory.archived.some((item) => item.id === archived.id)).toBe(false);
  });

  it("rejects unknown archive and restore identifiers", async () => {
    const service = new InventoryService({ homeDir: tempRoot, userDataDir: path.join(tempRoot, "userData") });

    await expect(service.archiveSkillById("missing")).rejects.toThrow("Unknown active skill");
    await expect(service.restoreArchivedById("missing")).rejects.toThrow("Unknown archived skill");
  });
});

describe("Path safety", () => {
  it("removes traversal separators and leading dots from archive path components", () => {
    expect(safePathComponent("../bad skill/名字")).toBe("bad-skill");
    expect(safePathComponent("////")).toBe("skill");
  });
});

async function writeSkill(relativeDir: string, name: string, description: string): Promise<string> {
  const dir = path.join(tempRoot, relativeDir);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, "SKILL.md"), ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`].join("\n"));
  return dir;
}

async function writeLockfile(): Promise<void> {
  const lockDir = path.join(tempRoot, ".agents");
  await fs.promises.mkdir(lockDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(lockDir, ".skill-lock.json"),
    JSON.stringify({
      skills: {
        "agent-browser": {
          source: "vercel-labs/agent-browser",
          sourceType: "github",
          sourceUrl: "https://github.com/vercel-labs/agent-browser",
          skillPath: "skills/agent-browser/SKILL.md",
          pluginName: "agent-browser",
          installedAt: "2026-06-26T12:00:00.123Z",
          updatedAt: "2026-06-27T12:00:00Z"
        }
      }
    })
  );
}

function codexExecLine(command: string): object {
  return {
    type: "response_item",
    payload: {
      type: "function_call",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: command })
    }
  };
}

function usageEvidenceFixture(
  skillName: string,
  occurredAt: string,
  timestampSource: "event" | "file_mtime"
): UsageEvidence {
  return {
    id: `${skillName}-${timestampSource}`,
    skillName,
    agent: "codex",
    kind: "codexSkillRead",
    sessionPath: "/tmp/session.jsonl",
    sessionKind: "archived",
    occurredAt,
    timestampSource,
    detail: "Test evidence",
    matchedText: skillName,
    confidence: "high"
  };
}

async function writeJsonl(filePath: string, object: object): Promise<void> {
  await fs.promises.writeFile(filePath, `${JSON.stringify(object)}\n`);
}

async function writeArchiveLedger(store: ArchiveStore, entries: ArchivedSkill[]): Promise<void> {
  await fs.promises.mkdir(path.dirname(store.ledgerPath), { recursive: true });
  await fs.promises.writeFile(store.ledgerPath, `${JSON.stringify({ entries }, null, 2)}\n`);
}

async function fixtureSkillRecord(): Promise<SkillRecord> {
  await writeSkill(".agents/skills/archive-me", "archive-me", "Disposable archive fixture.");
  const scanner = new SkillScanner({ homeDir: tempRoot });
  const records = await scanner.scan(scanner.defaultRoots(), new Map(), new Date("2026-07-01T00:00:00.000Z"));
  return records[0]!;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
