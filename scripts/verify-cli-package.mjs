import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const metadata = JSON.parse(await fs.promises.readFile(path.join(repoRoot, "packages", "cli", "package.json"), "utf8"));
const archivePath = path.join(repoRoot, "cli-dist", `${metadata.name}-${metadata.version}.tgz`);
const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "skill-manager-cli-package-"));

try {
  execFileSync("tar", ["-xzf", archivePath, "-C", tempRoot], { stdio: "inherit" });
  const executable = path.join(tempRoot, "package", "dist", "skill-manager.mjs");
  const version = execFileSync(process.execPath, [executable, "--version"], { encoding: "utf8" }).trim();
  if (version !== metadata.version) {
    throw new Error(`CLI package version mismatch: expected ${metadata.version}, got ${version}`);
  }

  const fixtureHome = path.join(tempRoot, "home");
  const fixtureData = path.join(tempRoot, "data");
  await fs.promises.mkdir(fixtureHome, { recursive: true });
  const raw = execFileSync(
    process.execPath,
    [executable, "audit", "--json", "--home", fixtureHome, "--data-dir", fixtureData],
    { encoding: "utf8" }
  );
  const report = JSON.parse(raw);
  if (report.schemaVersion !== "1.0.0" || report.summary?.installedCount !== 0) {
    throw new Error("CLI package audit smoke returned an unexpected report");
  }
  console.log(`Verified ${path.relative(repoRoot, archivePath)} with an isolated JSON audit`);
} finally {
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
}
