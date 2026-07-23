import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import packageMetadata from "../package.json" with { type: "json" };
import { CLI_VERSION, defaultUserDataDir, runCli } from "../src/cli.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-skills-audit-cli-"));
});

afterEach(async () => {
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
});

describe("agent-skills-audit CLI", () => {
  it("keeps the runtime version aligned with package metadata", () => {
    expect(CLI_VERSION).toBe(packageMetadata.version);
  });

  it("uses the Electron Skill Manager user-data path on each platform", () => {
    expect(defaultUserDataDir("/Users/example", "darwin", {})).toBe(
      "/Users/example/Library/Application Support/Skill Manager"
    );
    expect(defaultUserDataDir("C:\\Users\\example", "win32", { APPDATA: "C:\\Users\\example\\AppData\\Roaming" })).toBe(
      "C:\\Users\\example\\AppData\\Roaming\\Skill Manager"
    );
    expect(defaultUserDataDir("/home/example", "linux", { XDG_CONFIG_HOME: "/tmp/config" })).toBe(
      "/tmp/config/Skill Manager"
    );
  });

  it("marks zero evidence unknown when coverage limits excluded local logs", async () => {
    await writeSkill(".agents/skills/review-me", "review-me", "A review-only test Skill.");
    const archiveLogs = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(archiveLogs, { recursive: true });
    await fs.promises.writeFile(path.join(archiveLogs, "small-a.jsonl"), "{}\n");
    await fs.promises.writeFile(path.join(archiveLogs, "small-b.jsonl"), "{}\n");
    await fs.promises.writeFile(path.join(archiveLogs, "oversized.jsonl"), "x".repeat(128));

    const result = await execute(["audit", "--json", "--max-log-files", "1", "--max-log-bytes", "32"]);
    const report = JSON.parse(result.stdout) as {
      schemaVersion: string;
      coverage: {
        maxLogFiles: number;
        maxLogBytesPerFile: number;
        oversizedLogsExcluded: number;
        logsExcludedByFileLimit: number;
        timeWindow: { codexActiveDays: number };
      };
      skills: Array<{ usageStatus: string; recommendation: { action: string } }>;
      summary: { noEvidenceCount: number; unknownCount: number; archiveCandidateCount: number };
    };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.schemaVersion).toBe("1.0.0");
    expect(report.coverage).toMatchObject({
      maxLogFiles: 1,
      maxLogBytesPerFile: 32,
      oversizedLogsExcluded: 1,
      logsExcludedByFileLimit: 1,
      timeWindow: { codexActiveDays: 120 }
    });
    expect(report.skills[0]).toMatchObject({
      usageStatus: "unknown",
      recommendation: { action: "review" }
    });
    expect(report.summary).toMatchObject({ noEvidenceCount: 0, unknownCount: 1, archiveCandidateCount: 0 });
  });

  it("uses no_evidence when covered logs contain no matching record", async () => {
    await writeSkill(".agents/skills/covered", "covered", "Covered no-evidence fixture.");
    const archiveLogs = path.join(tempRoot, ".codex", "archived_sessions");
    await fs.promises.mkdir(archiveLogs, { recursive: true });
    await fs.promises.writeFile(path.join(archiveLogs, "covered.jsonl"), "{}\n");

    const result = await execute(["audit", "--json"]);
    const report = JSON.parse(result.stdout) as {
      skills: Array<{ usageStatus: string; recommendation: { action: string } }>;
      summary: { noEvidenceCount: number; unknownCount: number; archiveCandidateCount: number };
    };

    expect(report.skills[0]).toMatchObject({ usageStatus: "no_evidence", recommendation: { action: "review" } });
    expect(report.summary).toMatchObject({ noEvidenceCount: 1, unknownCount: 0, archiveCandidateCount: 0 });
  });

  it("uses unknown when relevant local usage logs are unavailable", async () => {
    await writeSkill(".codex/skills/no-logs", "no-logs", "A no-logs test Skill.");

    const result = await execute(["audit", "--json"]);
    const report = JSON.parse(result.stdout) as {
      coverage: { status: string };
      skills: Array<{ usageStatus: string; recommendation: { action: string } }>;
      summary: { unknownCount: number; archiveCandidateCount: number };
    };

    expect(report.coverage.status).toBe("unavailable");
    expect(report.skills[0]?.usageStatus).toBe("unknown");
    expect(report.skills[0]?.recommendation.action).toBe("review");
    expect(report.summary).toMatchObject({ unknownCount: 1, archiveCandidateCount: 0 });
  });

  it("renders Markdown coverage and a usable skill table", async () => {
    await writeSkill(".agents/skills/markdown-skill", "markdown-skill", "Markdown fixture.");

    const result = await execute(["audit", "--markdown"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("# Agent Skills Audit");
    expect(result.stdout).toContain("Limits: 300 files");
    expect(result.stdout).toContain("| Markdown Skill | agents | unknown | review |");
    expect(result.stdout).toContain("agent-skills-audit inspect <skill-id> --json");
  });

  it("inspects a Skill by ID and includes its source content", async () => {
    const skillPath = await writeSkill(".agents/skills/inspect-me", "inspect-me", "Inspect fixture.");
    const audit = JSON.parse((await execute(["audit", "--json"])).stdout) as { skills: Array<{ id: string }> };

    const result = await execute(["inspect", audit.skills[0]!.id, "--json"]);
    const report = JSON.parse(result.stdout) as { kind: string; skill: { content: string; path: string } };

    expect(result.code).toBe(0);
    expect(report.kind).toBe("active");
    expect(report.skill.path).toBe(skillPath);
    expect(report.skill.content).toContain("description: Inspect fixture.");
  });

  it("previews archive and restore until explicit confirmation is supplied", async () => {
    const skillPath = await writeSkill(".agents/skills/archive-me", "archive-me", "Archive fixture.");
    const audit = JSON.parse((await execute(["audit", "--json"])).stdout) as { skills: Array<{ id: string }> };
    const skillId = audit.skills[0]!.id;

    const preview = JSON.parse((await execute(["archive", skillId, "--json"])).stdout) as {
      status: string;
      confirmation: { provided: boolean };
    };
    expect(preview).toMatchObject({ status: "dry_run", confirmation: { provided: false } });
    expect(await exists(skillPath)).toBe(true);

    const archivedResult = await execute(["archive", skillId, "--yes", "--json"]);
    const archived = JSON.parse(archivedResult.stdout) as {
      status: string;
      target: { archivePath: string };
      verification: { ledgerId: string; sourcePresent: boolean; destinationPresent: boolean };
    };
    expect(archived).toMatchObject({
      status: "completed",
      verification: { sourcePresent: false, destinationPresent: true }
    });
    expect(await exists(skillPath)).toBe(false);
    expect(await exists(archived.target.archivePath)).toBe(true);

    const restorePreview = JSON.parse(
      (await execute(["restore", archived.verification.ledgerId, "--dry-run", "--json"])).stdout
    ) as { status: string };
    expect(restorePreview.status).toBe("dry_run");
    expect(await exists(skillPath)).toBe(false);

    const restored = JSON.parse(
      (await execute(["restore", archived.verification.ledgerId, "--yes", "--json"])).stdout
    ) as { status: string; verification: { sourcePresent: boolean; destinationPresent: boolean } };
    expect(restored).toMatchObject({
      status: "completed",
      verification: { sourcePresent: true, destinationPresent: false }
    });
    expect(await exists(skillPath)).toBe(true);
  });

  it("returns structured errors for ambiguous names", async () => {
    await writeSkill(".agents/skills/shared", "shared", "Agents copy.");
    await writeSkill(".codex/skills/shared", "shared", "Codex copy.");

    const result = await execute(["inspect", "shared", "--json"]);
    const response = JSON.parse(result.stderr) as { error: { code: string; details: { matches: unknown[] } } };

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(response.error.code).toBe("ambiguous_target");
    expect(response.error.details.matches).toHaveLength(2);
  });
});

async function execute(arguments_: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(
    [...arguments_, "--home", tempRoot, "--data-dir", path.join(tempRoot, "user-data")],
    {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
      env: {},
      platform: "linux",
      cwd: tempRoot,
      now: () => new Date("2026-07-23T12:00:00.000Z")
    }
  );
  return { code, stdout, stderr };
}

async function writeSkill(relativeDirectory: string, name: string, description: string): Promise<string> {
  const directory = path.join(tempRoot, relativeDirectory);
  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(
    path.join(directory, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${title(name)}`].join("\n")
  );
  return directory;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function title(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
