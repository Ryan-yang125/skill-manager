import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultHomeDir(): string {
  return os.homedir();
}

export function expandHome(inputPath: string, homeDir = defaultHomeDir()): string {
  if (inputPath === "~") return homeDir;
  if (inputPath.startsWith("~/")) return path.join(homeDir, inputPath.slice(2));
  return inputPath;
}

export function normalizePath(inputPath: string): string {
  return path.resolve(expandHome(inputPath));
}

export function stableId(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function safePathComponent(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^-+|-+$/g, "");
  return cleaned || "skill";
}

export async function pathExists(inputPath: string): Promise<boolean> {
  try {
    await fs.promises.access(inputPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.promises.rename(tempPath, filePath);
}

export async function directorySize(dirPath: string, blocked = blockedDirectoryNames): Promise<number> {
  let total = 0;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith(".") || blocked.has(entry.name)) continue;
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(childPath, blocked);
    } else if (entry.isFile()) {
      const stat = await fs.promises.stat(childPath).catch(() => null);
      total += stat?.size ?? 0;
    }
  }
  return total;
}

export async function hashPath(inputPath: string): Promise<string | null> {
  try {
    const stat = await fs.promises.stat(inputPath);
    const hash = createHash("sha256");
    hash.update(inputPath);
    hash.update(String(stat.size));
    hash.update(String(stat.mtimeMs));
    return hash.digest("hex");
  } catch {
    return null;
  }
}

export const blockedDirectoryNames = new Set([
  "node_modules",
  ".git",
  ".build",
  "build",
  "dist",
  "DerivedData",
  ".Trash",
  "Library"
]);

export function isSearchableLog(filePath: string): boolean {
  return [".jsonl", ".json", ".log", ".txt", ".md"].includes(path.extname(filePath).toLowerCase());
}

export function isoFromDate(value: Date | number | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function sortByName<T extends { title?: string; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.title ?? a.name).localeCompare(b.title ?? b.name, undefined, { sensitivity: "base" }));
}
