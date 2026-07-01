import type { ArchivedSkill, SkillInventory, SkillRecord } from "@skill-manager/core/browser";
import type { SkillManagerApi } from "../electron/preload";

const now = new Date();
const iso = (daysAgo: number): string => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

const baseStatus = {
  protected: false,
  reviewLater: false,
  archived: false,
  archiveReason: null,
  archivedAt: null,
  archivePath: null
};

const skills: SkillRecord[] = [
  mockSkill({
    name: "agent-browser",
    title: "Agent Browser",
    summary: "Browser automation CLI for AI agents. Use when the user needs to interact with websites, fill forms, click buttons, take screenshots, or test web apps.",
    agent: "agents",
    packageSource: "vercel-labs/agent-browser",
    sourceUrl: "https://github.com/vercel-labs/agent-browser",
    usageCount: 18,
    lastUsedAt: iso(1),
    contextTokens: 842
  }),
  mockSkill({
    name: "frontend-design",
    title: "Frontend Design",
    summary: "Guidance for distinctive, intentional visual design when building new UI or reshaping an existing application.",
    agent: "agents",
    packageSource: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills",
    usageCount: 7,
    lastUsedAt: iso(8),
    contextTokens: 1280,
    recommendation: "keep"
  }),
  mockSkill({
    name: "skill-creator",
    title: "Skill Creator",
    summary: "Create new skills, modify existing skills, and measure skill performance with practical evaluation loops.",
    agent: "codex",
    packageSource: "anthropics/skills",
    sourceUrl: "https://github.com/anthropics/skills",
    usageCount: 2,
    lastUsedAt: iso(18),
    contextTokens: 1015,
    recommendation: "review"
  }),
  mockSkill({
    name: "impeccable",
    title: "Impeccable",
    summary: "Use when designing, redesigning, shaping, or reviewing product interfaces with high polish expectations.",
    agent: "agents",
    packageSource: "manual",
    sourceUrl: null,
    usageCount: 5,
    lastUsedAt: iso(0),
    contextTokens: 2040,
    recommendation: "review",
    reviewLater: true
  }),
  mockSkill({
    name: "pdf",
    title: "PDF",
    summary: "Read, create, inspect, render, and verify PDF files when the task depends on exact document output.",
    agent: "codex",
    packageSource: "openai-bundled",
    sourceUrl: null,
    usageCount: 0,
    lastUsedAt: null,
    contextTokens: 420,
    recommendation: "archive"
  }),
  mockSkill({
    name: "github",
    title: "GitHub",
    summary: "Triage repositories, pull requests, and issues; publish changes and inspect CI results.",
    agent: "codex",
    packageSource: "openai-curated/github",
    sourceUrl: "https://github.com/openai/codex",
    usageCount: 9,
    lastUsedAt: iso(3),
    contextTokens: 760,
    recommendation: "keep",
    protectedSkill: true
  }),
  mockSkill({
    name: "baoyu-cover-image",
    title: "Baoyu Cover Image",
    summary: "Generate article cover images with structured visual dimensions and reusable output formats.",
    agent: "claude",
    packageSource: "baoyu-toolkit",
    sourceUrl: null,
    usageCount: 0,
    lastUsedAt: null,
    contextTokens: 1560,
    recommendation: "archive"
  })
];

const archived: ArchivedSkill[] = [
  {
    id: "archived:old-slides",
    skillId: "skill:old-slides",
    name: "old-slides",
    title: "Old Slides",
    originalPath: "/Users/yangrui/.agents/skills/old-slides",
    archivePath: "/Users/yangrui/Library/Application Support/Skill Manager/archive/old-slides",
    archivedAt: iso(12),
    restoredAt: null,
    agent: "agents",
    sizeBytes: 19_200,
    operationStatus: "archived",
    failureReason: null,
    contentHashBefore: null,
    contentHashAfter: null
  }
];

let inventory: SkillInventory = {
  active: skills,
  archived,
  scannedAt: now.toISOString(),
  audit: {
    generatedAt: now.toISOString(),
    installedCount: skills.length,
    archivedCount: archived.length,
    unusedCount: skills.filter((skill) => skill.usageCount === 0).length,
    suggestedArchiveCount: skills.filter((skill) => skill.recommendation === "archive").length,
    contextTokens: skills.reduce((sum, skill) => sum + skill.contextTokens, 0),
    reclaimableContextTokens: skills.filter((skill) => skill.recommendation === "archive").reduce((sum, skill) => sum + skill.contextTokens, 0),
    reclaimableBytes: skills.filter((skill) => skill.recommendation === "archive").reduce((sum, skill) => sum + skill.sizeBytes, 0),
    roots: [
      { path: "/Users/yangrui/.agents/skills", agent: "agents", exists: true, skillCount: 4 },
      { path: "/Users/yangrui/.codex/skills", agent: "codex", exists: true, skillCount: 3 },
      { path: "/Users/yangrui/.claude/skills", agent: "claude", exists: true, skillCount: 1 }
    ]
  },
  sessionRootAudits: [
    { path: "/Users/yangrui/.codex/sessions", agent: "codex", exists: true, logCount: 182 },
    { path: "/Users/yangrui/.codex/archived_sessions", agent: "codex", exists: true, logCount: 42 },
    { path: "/Users/yangrui/.claude/projects", agent: "claude", exists: true, logCount: 76 }
  ]
};

export function installMockSkillManager(): void {
  if (window.skillManager) return;
  window.skillManager = {
    loadInventory: async () => inventory,
    setDecision: async (skillId, decision) => {
      inventory = {
        ...inventory,
        active: inventory.active.map((skill) =>
          skill.id === skillId
            ? {
                ...skill,
                status: {
                  ...baseStatus,
                  protected: decision === "protected",
                  reviewLater: decision === "review"
                },
                recommendation: decision ? "keep" : skill.recommendation
              }
            : skill
        )
      };
      return inventory;
    },
    archiveSkill: async (skillId) => {
      const skill = inventory.active.find((item) => item.id === skillId);
      if (!skill) throw new Error(`Unknown active skill: ${skillId}`);
      const archivedSkill: ArchivedSkill = {
        id: `archived:${skill.name}`,
        skillId: skill.id,
        name: skill.name,
        title: skill.title,
        originalPath: skill.path,
        archivePath: `/Users/yangrui/Library/Application Support/Skill Manager/archive/${skill.name}`,
        archivedAt: new Date().toISOString(),
        restoredAt: null,
        agent: skill.agent,
        sizeBytes: skill.sizeBytes,
        operationStatus: "archived",
        failureReason: null,
        contentHashBefore: null,
        contentHashAfter: null
      };
      inventory = {
        ...inventory,
        active: inventory.active.filter((item) => item.id !== skill.id),
        archived: [archivedSkill, ...inventory.archived]
      };
      return inventory;
    },
    restoreSkill: async (archivedId) => {
      inventory = {
        ...inventory,
        archived: inventory.archived.filter((item) => item.id !== archivedId)
      };
      return { inventory };
    },
    exportCleanupReport: async () => ({
      markdownPath: "/tmp/skill-manager-cleanup.md",
      jsonPath: "/tmp/skill-manager-cleanup.json"
    }),
    revealPath: async () => true,
    openExternal: async () => true
  } satisfies SkillManagerApi;
}

function mockSkill({
  name,
  title,
  summary,
  agent,
  packageSource,
  sourceUrl,
  usageCount,
  lastUsedAt,
  contextTokens,
  recommendation = "archive",
  protectedSkill = false,
  reviewLater = false
}: {
  name: string;
  title: string;
  summary: string;
  agent: SkillRecord["agent"];
  packageSource: string;
  sourceUrl: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  contextTokens: number;
  recommendation?: SkillRecord["recommendation"];
  protectedSkill?: boolean;
  reviewLater?: boolean;
}): SkillRecord {
  const path = `/Users/yangrui/.${agent === "agents" ? "agents" : agent}/skills/${name}`;
  return {
    id: `skill:${name}`,
    name,
    title,
    summary,
    agent,
    scope: "user",
    path,
    rootPath: path.split("/").slice(0, -1).join("/"),
    relativePath: name,
    skillFilePath: `${path}/SKILL.md`,
    content: `---\nname: ${name}\ndescription: ${summary}\n---\n\n# ${title}\n\n${summary}\n\n## Quick Reference\n\nUse this skill when the task needs ${title.toLowerCase()} behavior.\n`,
    sizeBytes: 12_000 + contextTokens * 42,
    contextTokens,
    lastUsedAt,
    usageCount,
    usageEvidence:
      usageCount > 0
        ? [
            {
              id: `evidence:${name}`,
              skillName: name,
              agent,
              kind: agent === "claude" ? "claudeSkillTool" : "codexSkillRead",
              sessionPath: `/Users/yangrui/.codex/sessions/2026/07/02/${name}.jsonl`,
              sessionKind: "active",
              occurredAt: lastUsedAt,
              detail: `Matched ${name}`,
              matchedText: name,
              confidence: "high"
            }
          ]
        : [],
    package: {
      id: sourceUrl ?? packageSource,
      source: packageSource,
      sourceType: sourceUrl ? "git" : "manual",
      sourceUrl,
      skillPath: name,
      pluginName: name,
      installedAt: iso(45),
      updatedAt: iso(4),
      isInferred: !sourceUrl
    },
    recommendation,
    isArchived: false,
    locations: [{ rootKind: agent, path, rootPath: path.split("/").slice(0, -1).join("/"), relativePath: name }],
    status: { ...baseStatus, protected: protectedSkill, reviewLater },
    updatedAt: iso(4),
    scanWarnings: []
  };
}
