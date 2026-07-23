import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  InventoryService,
  expandHome,
  type ArchivedSkill,
  type InventoryServiceOptions,
  type SkillInventory,
  type SkillRecord
} from "@skill-manager/core";

import { formatAudit, formatInspect, formatOperation, type OperationReport } from "./format.js";
import {
  buildAuditReport,
  buildInspectReport,
  SCHEMA_VERSION,
  type AuditLimits,
  type OutputFormat
} from "./report.js";
import packageMetadata from "../package.json" with { type: "json" };

export const CLI_VERSION = packageMetadata.version;
export const DEFAULT_MAX_LOG_FILES = 300;
export const DEFAULT_MAX_LOG_BYTES = 512 * 1024;

interface ParsedArguments {
  command: "audit" | "inspect" | "archive" | "restore" | "help" | "version";
  selector: string | null;
  format: OutputFormat;
  homeDirOption: string | null;
  dataDirOption: string | null;
  maxLogFiles: number;
  maxLogBytes: number;
  yes: boolean;
  dryRun: boolean;
}

interface ServiceOptions {
  homeDir: string;
  userDataDir: string;
  maxLogFiles: number;
  maxLogBytes: number;
}

export interface CliRuntime {
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  cwd?: string;
  now?: () => Date;
  createService?: (options: ServiceOptions) => InventoryService;
}

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details: unknown;

  constructor(code: string, message: string, exitCode = 2, details: unknown = null) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export async function runCli(argv: string[], runtime: CliRuntime = {}): Promise<number> {
  const writeOut = runtime.stdout ?? ((value: string) => process.stdout.write(value));
  const writeError = runtime.stderr ?? ((value: string) => process.stderr.write(value));
  const errorFormat = requestedFormat(argv);

  try {
    const parsed = parseArguments(argv);
    if (parsed.command === "help") {
      writeOut(helpText());
      return 0;
    }
    if (parsed.command === "version") {
      writeOut(`${CLI_VERSION}\n`);
      return 0;
    }

    const env = runtime.env ?? process.env;
    const platform = runtime.platform ?? process.platform;
    const cwd = runtime.cwd ?? process.cwd();
    const serviceOptions = resolveServiceOptions(parsed, env, platform, cwd);
    const createService = runtime.createService ?? ((options: ServiceOptions) => new InventoryService(options));
    const service = createService(serviceOptions);
    const inventory = await service.loadInventory(runtime.now?.() ?? new Date());
    const limits: AuditLimits = {
      maxLogFiles: parsed.maxLogFiles,
      maxLogBytes: parsed.maxLogBytes
    };

    if (parsed.command === "audit") {
      writeOut(formatAudit(buildAuditReport(inventory, limits), parsed.format));
      return 0;
    }

    if (parsed.command === "inspect") {
      const target = resolveInspectTarget(inventory, requiredSelector(parsed));
      writeOut(formatInspect(buildInspectReport(inventory, limits, target), parsed.format));
      return 0;
    }

    if (parsed.command === "archive") {
      const skill = resolveActiveSkill(inventory, requiredSelector(parsed));
      const report = parsed.yes
        ? await archiveConfirmed(service, skill, runtime.now?.() ?? new Date())
        : archivePreview(skill, runtime.now?.() ?? new Date());
      writeOut(formatOperation(report, parsed.format));
      return 0;
    }

    const archived = resolveArchivedSkill(inventory, requiredSelector(parsed));
    const report = parsed.yes
      ? await restoreConfirmed(service, archived, runtime.now?.() ?? new Date())
      : restorePreview(archived, runtime.now?.() ?? new Date());
    writeOut(formatOperation(report, parsed.format));
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    if (errorFormat === "json") {
      writeError(
        `${JSON.stringify(
          {
            schemaVersion: SCHEMA_VERSION,
            error: {
              code: normalized.code,
              message: normalized.message,
              details: normalized.details
            }
          },
          null,
          2
        )}\n`
      );
    } else {
      writeError(`Error [${normalized.code}]: ${normalized.message}\n`);
    }
    return normalized.exitCode;
  }
}

export function defaultUserDataDir(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.SKILL_MANAGER_DATA_DIR) return resolveInputPath(env.SKILL_MANAGER_DATA_DIR, homeDir, process.cwd());
  if (platform === "darwin") return path.posix.join(homeDir, "Library", "Application Support", "Skill Manager");
  if (platform === "win32") {
    return path.win32.join(env.APPDATA ?? path.win32.join(homeDir, "AppData", "Roaming"), "Skill Manager");
  }
  return path.posix.join(env.XDG_CONFIG_HOME ?? path.posix.join(homeDir, ".config"), "Skill Manager");
}

function parseArguments(argv: string[]): ParsedArguments {
  const positionals: string[] = [];
  let format: OutputFormat = "text";
  let formatWasSet = false;
  let homeDirOption: string | null = null;
  let dataDirOption: string | null = null;
  let maxLogFiles = DEFAULT_MAX_LOG_FILES;
  let maxLogBytes = DEFAULT_MAX_LOG_BYTES;
  let yes = false;
  let dryRun = false;
  let help = false;
  let version = false;
  let positionalOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (positionalOnly) {
      positionals.push(argument);
      continue;
    }
    if (argument === "--") {
      positionalOnly = true;
      continue;
    }
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--version" || argument === "-V") {
      version = true;
      continue;
    }
    if (argument === "--yes" || argument === "-y") {
      yes = true;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--json") {
      format = mergeFormat(format, "json", formatWasSet);
      formatWasSet = true;
      continue;
    }
    if (argument === "--markdown") {
      format = mergeFormat(format, "markdown", formatWasSet);
      formatWasSet = true;
      continue;
    }

    const [option, inlineValue] = splitOption(argument);
    if (option === "--format") {
      const value = inlineValue ?? nextValue(argv, ++index, option);
      if (value !== "text" && value !== "json" && value !== "markdown") {
        throw new CliError("invalid_format", `Expected text, json, or markdown for ${option}`);
      }
      format = mergeFormat(format, value, formatWasSet);
      formatWasSet = true;
      continue;
    }
    if (option === "--home") {
      homeDirOption = inlineValue ?? nextValue(argv, ++index, option);
      continue;
    }
    if (option === "--data-dir") {
      dataDirOption = inlineValue ?? nextValue(argv, ++index, option);
      continue;
    }
    if (option === "--max-log-files") {
      maxLogFiles = positiveInteger(inlineValue ?? nextValue(argv, ++index, option), option);
      continue;
    }
    if (option === "--max-log-bytes") {
      maxLogBytes = positiveInteger(inlineValue ?? nextValue(argv, ++index, option), option);
      continue;
    }
    throw new CliError("unknown_option", `Unknown option: ${argument}`);
  }

  if (help) {
    return { command: "help", selector: null, format, homeDirOption, dataDirOption, maxLogFiles, maxLogBytes, yes, dryRun };
  }
  if (version) {
    return { command: "version", selector: null, format, homeDirOption, dataDirOption, maxLogFiles, maxLogBytes, yes, dryRun };
  }
  if (positionals.length === 0) {
    return { command: "help", selector: null, format, homeDirOption, dataDirOption, maxLogFiles, maxLogBytes, yes, dryRun };
  }

  const command = positionals[0];
  if (command !== "audit" && command !== "inspect" && command !== "archive" && command !== "restore" && command !== "help" && command !== "version") {
    throw new CliError("unknown_command", `Unknown command: ${command}`);
  }
  const selectors = positionals.slice(1);
  if (command === "audit" || command === "help" || command === "version") {
    if (selectors.length > 0) throw new CliError("unexpected_argument", `${command} does not accept a target`);
  } else if (selectors.length !== 1) {
    throw new CliError("target_required", `${command} requires exactly one skill ID, name, or path`);
  }
  if ((yes || dryRun) && command !== "archive" && command !== "restore") {
    throw new CliError("invalid_safety_option", "--yes and --dry-run are available for archive and restore");
  }
  if (yes && dryRun) {
    throw new CliError("conflicting_safety_options", "Choose one of --yes or --dry-run");
  }

  return {
    command,
    selector: selectors[0] ?? null,
    format,
    homeDirOption,
    dataDirOption,
    maxLogFiles,
    maxLogBytes,
    yes,
    dryRun
  };
}

function resolveServiceOptions(
  parsed: ParsedArguments,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  cwd: string
): ServiceOptions {
  const processHome = os.homedir();
  const requestedHome = parsed.homeDirOption ?? env.SKILL_MANAGER_HOME ?? processHome;
  const homeDir = resolveInputPath(requestedHome, processHome, cwd);
  const dataDirSource = parsed.dataDirOption ?? env.SKILL_MANAGER_DATA_DIR;
  const userDataDir = dataDirSource
    ? resolveInputPath(dataDirSource, homeDir, cwd)
    : defaultUserDataDir(homeDir, platform, env);
  const inventoryOptions: InventoryServiceOptions = {
    homeDir,
    userDataDir,
    maxLogFiles: parsed.maxLogFiles,
    maxLogBytes: parsed.maxLogBytes
  };
  return inventoryOptions as ServiceOptions;
}

function resolveInspectTarget(
  inventory: SkillInventory,
  selector: string
): { kind: "active"; skill: SkillRecord } | { kind: "archived"; skill: ArchivedSkill } {
  const exactActiveId = inventory.active.find((skill) => skill.id === selector);
  if (exactActiveId) return { kind: "active", skill: exactActiveId };
  const exactArchivedId = inventory.archived.find((skill) => skill.id === selector);
  if (exactArchivedId) return { kind: "archived", skill: exactArchivedId };

  const activeMatches = matchingActiveSkills(inventory.active, selector);
  const archivedMatches = matchingArchivedSkills(inventory.archived, selector);
  const matches = [
    ...activeMatches.map((skill) => ({ kind: "active" as const, skill })),
    ...archivedMatches.map((skill) => ({ kind: "archived" as const, skill }))
  ];
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw ambiguousTarget(selector, matches.map(({ skill }) => targetSummary(skill)));
  throw missingTarget(selector, inventory);
}

function resolveActiveSkill(inventory: SkillInventory, selector: string): SkillRecord {
  const exactId = inventory.active.find((skill) => skill.id === selector);
  if (exactId) return exactId;
  const matches = matchingActiveSkills(inventory.active, selector);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw ambiguousTarget(selector, matches.map(targetSummary));
  throw missingTarget(selector, inventory, "active");
}

function resolveArchivedSkill(inventory: SkillInventory, selector: string): ArchivedSkill {
  const exactId = inventory.archived.find((skill) => skill.id === selector);
  if (exactId) return exactId;
  const matches = matchingArchivedSkills(inventory.archived, selector);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw ambiguousTarget(selector, matches.map(targetSummary));
  throw missingTarget(selector, inventory, "archived");
}

function matchingActiveSkills(skills: SkillRecord[], selector: string): SkillRecord[] {
  const normalized = selector.toLocaleLowerCase();
  return skills.filter(
    (skill) =>
      skill.path === selector ||
      skill.skillFilePath === selector ||
      skill.name.toLocaleLowerCase() === normalized ||
      skill.title.toLocaleLowerCase() === normalized
  );
}

function matchingArchivedSkills(skills: ArchivedSkill[], selector: string): ArchivedSkill[] {
  const normalized = selector.toLocaleLowerCase();
  return skills.filter(
    (skill) =>
      skill.originalPath === selector ||
      skill.archivePath === selector ||
      skill.name.toLocaleLowerCase() === normalized ||
      skill.title.toLocaleLowerCase() === normalized
  );
}

function archivePreview(skill: SkillRecord, now: Date): OperationReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "archive",
    status: "dry_run",
    target: {
      id: skill.id,
      name: skill.name,
      title: skill.title,
      agent: skill.agent,
      originalPath: skill.path,
      archivePath: null
    },
    confirmation: {
      required: true,
      provided: false,
      nextCommand: `agent-skills-audit archive ${skill.id} --yes --json`
    },
    verification: {
      ledgerId: null,
      sourcePresent: null,
      destinationPresent: null
    }
  };
}

async function archiveConfirmed(service: InventoryService, skill: SkillRecord, now: Date): Promise<OperationReport> {
  const archived = await service.archiveSkill(skill);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "archive",
    status: "completed",
    target: {
      id: skill.id,
      name: skill.name,
      title: skill.title,
      agent: skill.agent,
      originalPath: skill.path,
      archivePath: archived.archivePath
    },
    confirmation: {
      required: true,
      provided: true,
      nextCommand: null
    },
    verification: {
      ledgerId: archived.id,
      sourcePresent: await exists(skill.path),
      destinationPresent: await exists(archived.archivePath)
    }
  };
}

function restorePreview(archived: ArchivedSkill, now: Date): OperationReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "restore",
    status: "dry_run",
    target: {
      id: archived.id,
      name: archived.name,
      title: archived.title,
      agent: archived.agent,
      originalPath: archived.originalPath,
      archivePath: archived.archivePath
    },
    confirmation: {
      required: true,
      provided: false,
      nextCommand: `agent-skills-audit restore ${archived.id} --yes --json`
    },
    verification: {
      ledgerId: archived.id,
      sourcePresent: null,
      destinationPresent: null
    }
  };
}

async function restoreConfirmed(service: InventoryService, archived: ArchivedSkill, now: Date): Promise<OperationReport> {
  const restored = await service.restoreSkill(archived);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    operation: "restore",
    status: "completed",
    target: {
      id: restored.id,
      name: restored.name,
      title: restored.title,
      agent: restored.agent,
      originalPath: restored.originalPath,
      archivePath: restored.archivePath
    },
    confirmation: {
      required: true,
      provided: true,
      nextCommand: null
    },
    verification: {
      ledgerId: restored.id,
      sourcePresent: await exists(restored.originalPath),
      destinationPresent: await exists(restored.archivePath)
    }
  };
}

function requiredSelector(parsed: ParsedArguments): string {
  if (!parsed.selector) throw new CliError("target_required", `${parsed.command} requires a target`);
  return parsed.selector;
}

function splitOption(argument: string): [string, string | undefined] {
  const separator = argument.indexOf("=");
  if (separator < 0) return [argument, undefined];
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}

function nextValue(argv: string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) throw new CliError("option_value_required", `${option} requires a value`);
  return value;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliError("invalid_number", `${option} requires a positive integer`);
  }
  return parsed;
}

function mergeFormat(current: OutputFormat, next: OutputFormat, wasSet: boolean): OutputFormat {
  if (wasSet && current !== next) throw new CliError("conflicting_formats", "Choose one output format");
  return next;
}

function requestedFormat(argv: string[]): OutputFormat {
  if (argv.includes("--json") || argv.some((argument) => argument === "--format=json")) return "json";
  if (argv.includes("--markdown") || argv.some((argument) => argument === "--format=markdown")) return "markdown";
  const formatIndex = argv.indexOf("--format");
  const value = formatIndex >= 0 ? argv[formatIndex + 1] : null;
  return value === "json" || value === "markdown" ? value : "text";
}

function resolveInputPath(input: string, homeDir: string, cwd: string): string {
  const expanded = expandHome(input, homeDir);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(cwd, expanded);
}

function ambiguousTarget(selector: string, matches: unknown[]): CliError {
  return new CliError("ambiguous_target", `Multiple skills match "${selector}"; use an exact ID or path`, 3, { matches });
}

function missingTarget(selector: string, inventory: SkillInventory, kind?: "active" | "archived"): CliError {
  const active = kind === "archived" ? [] : inventory.active.slice(0, 20).map(targetSummary);
  const archived = kind === "active" ? [] : inventory.archived.slice(0, 20).map(targetSummary);
  return new CliError("target_not_found", `No ${kind ? `${kind} ` : ""}skill matches "${selector}"`, 3, {
    available: [...active, ...archived]
  });
}

function targetSummary(skill: SkillRecord | ArchivedSkill): { id: string; name: string; path: string } {
  return {
    id: skill.id,
    name: skill.name,
    path: "path" in skill ? skill.path : skill.archivePath
  };
}

function normalizeError(error: unknown): { code: string; message: string; exitCode: number; details: unknown } {
  if (error instanceof CliError) {
    return { code: error.code, message: error.message, exitCode: error.exitCode, details: error.details };
  }
  if (error instanceof Error) {
    return { code: "operation_failed", message: error.message, exitCode: 1, details: null };
  }
  return { code: "operation_failed", message: String(error), exitCode: 1, details: null };
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function helpText(): string {
  return `agent-skills-audit ${CLI_VERSION}

Local Agent Skills inventory, evidence audit, and recoverable cleanup.

Usage:
  agent-skills-audit audit [options]
  agent-skills-audit inspect <skill-id|name|path> [options]
  agent-skills-audit archive <skill-id|name|path> [--dry-run|--yes] [options]
  agent-skills-audit restore <archive-id|name|path> [--dry-run|--yes] [options]

Commands:
  audit      Scan standard user Skill roots and local usage evidence
  inspect    Show one active or archived Skill, including SKILL.md content
  archive    Preview an archive; add --yes to move it into the recovery ledger
  restore    Preview a restore; add --yes to move it back to its original path

Output:
  --json                 Stable JSON with schemaVersion, coverage, skills, and summary
  --markdown             Markdown report
  --format <format>      text, json, or markdown

Safety and scan options:
  --dry-run              Explicit read-only preview for archive or restore
  --yes, -y              Confirm the exact archive or restore target
  --home <path>          Alternate home directory to scan
  --data-dir <path>      Alternate archive ledger and decision directory
  --max-log-files <n>    Maximum local session logs to scan (default: ${DEFAULT_MAX_LOG_FILES})
  --max-log-bytes <n>    Maximum bytes per session log (default: ${DEFAULT_MAX_LOG_BYTES})
  --help, -h             Show this help
  --version, -V          Show the CLI version

Safety model:
  audit and inspect are read-only. archive and restore also remain read-only until --yes is supplied.
  no_evidence is a review signal. unknown means relevant searchable local logs were unavailable.
`;
}
