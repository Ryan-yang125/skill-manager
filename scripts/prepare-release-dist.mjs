import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await fs.promises.readFile(path.join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;
const sourceDir = path.join(repoRoot, "dist-electron");
const outputDir = path.join(repoRoot, "release-dist");

await fs.promises.rm(outputDir, { recursive: true, force: true });
await fs.promises.mkdir(outputDir, { recursive: true });

const copied = [];
for (const entry of await fs.promises.readdir(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!isReleaseFile(entry.name)) continue;
  await copy(path.join(sourceDir, entry.name), path.join(outputDir, entry.name));
}

await copy(path.join(repoRoot, "docs", "screenshots", "electron-main.png"), path.join(outputDir, "screenshot-main.png"));
await copy(path.join(repoRoot, "docs", "screenshots", "electron-dark.png"), path.join(outputDir, "screenshot-dark.png"));
await copy(path.join(repoRoot, "docs", "screenshots", "electron-compact.png"), path.join(outputDir, "screenshot-compact.png"));
await copy(path.join(repoRoot, "docs", "releases", `v${version}-notes.md`), path.join(outputDir, `release-notes-v${version}.md`));

await writeChecksums();
runVerifier();

console.log(`Prepared ${copied.length} files in ${outputDir}`);

function isReleaseFile(fileName) {
  if (fileName === "SHA256SUMS.txt" || fileName === "builder-debug.yml") return false;
  if (fileName.startsWith(`SkillManager-${version}-`)) return true;
  return /^latest.*\.ya?ml$/.test(fileName);
}

async function copy(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`Missing release source: ${source}`);
  await fs.promises.copyFile(source, destination);
  copied.push(path.basename(destination));
}

async function writeChecksums() {
  const files = (await fs.promises.readdir(outputDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS.txt")
    .map((entry) => entry.name)
    .sort();

  const lines = [];
  for (const file of files) {
    lines.push(`${await sha256(path.join(outputDir, file))}  ${file}`);
  }
  await fs.promises.writeFile(path.join(outputDir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function runVerifier() {
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "verify-release-assets.mjs"), outputDir], {
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  process.stdout.write(result.stdout);
}
