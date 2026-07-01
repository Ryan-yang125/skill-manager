import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await fs.promises.readFile(path.join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;
const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith("--platform="));
const mode = modeArg?.slice("--platform=".length) ?? "all";
const dirArg = args.find((arg) => !arg.startsWith("--"));
const distDir = path.resolve(dirArg ?? path.join(repoRoot, "dist-electron"));

const entries = await fs.promises.readdir(distDir).catch(() => []);
const assets = new Set(entries);
const releaseAssets = discoverReleaseAssets(entries);

const requiredPlatforms = requiredPlatformSet(mode, releaseAssets, entries);
if (requiredPlatforms.has("mac")) {
  requireAssets("macOS zip", releaseAssets.macZips);
  requireAssets("macOS dmg", releaseAssets.macDmgs);
  requireFile("latest-mac.yml");
}
if (requiredPlatforms.has("linux")) {
  requireAssets("Linux AppImage", releaseAssets.appImages);
  requireAssets("Linux deb", releaseAssets.debs);
  requireAnyFile(/^latest-linux.*\.ya?ml$/, "Linux update metadata");
}
if (requiredPlatforms.has("win")) {
  requireAssets("Windows NSIS installer", releaseAssets.exeInstallers);
  requireAssets("Windows installer blockmap", releaseAssets.exeBlockmaps);
  requireFile("latest.yml");
}
requireFile("SHA256SUMS.txt");

for (const file of releaseAssets.files) {
  const stat = await fs.promises.stat(path.join(distDir, file));
  if (stat.size <= 1024) throw new Error(`Release asset is unexpectedly small: ${file}`);
}

await runNodeScript("verify-artifacts.mjs");
verifyFileTypes(releaseAssets);
verifyMacArchives(releaseAssets);
verifyDebPackages(releaseAssets);
await verifyUpdateMetadata();

console.log(`Release assets verified in ${distDir}`);

function requiredPlatformSet(requestedMode, discoveredAssets, discoveredEntries) {
  if (requestedMode === "all") return new Set(["mac", "linux", "win"]);
  if (requestedMode === "current") {
    const detected = new Set();
    if (discoveredAssets.macZips.length > 0 || discoveredAssets.macDmgs.length > 0 || discoveredEntries.includes("latest-mac.yml")) detected.add("mac");
    if (discoveredAssets.appImages.length > 0 || discoveredAssets.debs.length > 0 || discoveredEntries.some((entry) => /^latest-linux.*\.ya?ml$/.test(entry))) {
      detected.add("linux");
    }
    if (discoveredAssets.exeInstallers.length > 0 || discoveredEntries.includes("latest.yml")) detected.add("win");
    if (detected.size === 0) throw new Error("No platform release assets found");
    return detected;
  }
  if (["mac", "linux", "win"].includes(requestedMode)) return new Set([requestedMode]);
  throw new Error(`Unsupported platform verification mode: ${requestedMode}`);
}

function discoverReleaseAssets(items) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const artifactPattern = new RegExp(`^SkillManager-${escapedVersion}-.+`);
  const files = items.filter((item) => artifactPattern.test(item));
  return {
    files,
    macZips: files.filter((file) => new RegExp(`^SkillManager-${escapedVersion}-mac-.+\\.zip$`).test(file)),
    macDmgs: files.filter((file) => new RegExp(`^SkillManager-${escapedVersion}-.+\\.dmg$`).test(file)),
    appImages: files.filter((file) => file.endsWith(".AppImage")),
    debs: files.filter((file) => file.endsWith(".deb")),
    exeInstallers: files.filter((file) => file.endsWith(".exe")),
    exeBlockmaps: files.filter((file) => file.endsWith(".exe.blockmap"))
  };
}

function requireAssets(label, files) {
  if (files.length === 0) throw new Error(`Missing ${label} release asset`);
}

function requireFile(file) {
  if (!assets.has(file)) throw new Error(`Missing release asset: ${file}`);
}

function requireAnyFile(pattern, label) {
  if (!entries.some((entry) => pattern.test(entry))) throw new Error(`Missing ${label}`);
}

async function runNodeScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", scriptName), distDir], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${scriptName} failed:\n${result.stderr || result.stdout}`);
  }
}

function verifyFileTypes({ appImages, debs, exeInstallers }) {
  for (const file of appImages) {
    const output = fileOutput(file);
    if (!output.includes("ELF")) throw new Error(`AppImage file check failed for ${file}: ${output}`);
  }
  for (const file of debs) {
    const output = fileOutput(file);
    if (!output.includes("Debian binary package")) throw new Error(`deb file check failed for ${file}: ${output}`);
  }
  for (const file of exeInstallers) {
    const output = fileOutput(file);
    if (!output.includes("PE32") || !output.includes("MS Windows")) throw new Error(`Windows installer file check failed for ${file}: ${output}`);
  }
}

function fileOutput(file) {
  const result = spawnSync("file", [path.join(distDir, file)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`file check failed for ${file}: ${result.stderr}`);
  return result.stdout;
}

function verifyMacArchives({ macZips, macDmgs }) {
  for (const file of macZips) {
    const result = spawnSync("unzip", ["-t", path.join(distDir, file)], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`zip verification failed for ${file}:\n${result.stderr || result.stdout}`);
  }

  if (process.platform !== "darwin") return;
  for (const file of macDmgs) {
    const result = spawnSync("hdiutil", ["verify", path.join(distDir, file)], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`dmg verification failed for ${file}:\n${result.stderr || result.stdout}`);
  }
}

function verifyDebPackages({ debs }) {
  for (const file of debs) {
    const result = spawnSync("ar", ["-t", path.join(distDir, file)], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`deb structure check failed for ${file}:\n${result.stderr || result.stdout}`);
    const debEntries = new Set(result.stdout.split(/\r?\n/).filter(Boolean).map((entry) => entry.replace(/\/$/, "")));
    for (const entry of ["debian-binary", "control.tar.xz", "data.tar.xz"]) {
      if (!debEntries.has(entry)) throw new Error(`deb package ${file} is missing ${entry}`);
    }
  }
}

async function verifyUpdateMetadata() {
  const metadataFiles = entries.filter((entry) => /^latest.*\.ya?ml$/.test(entry));
  for (const metadataFile of metadataFiles) {
    const parsed = parseLatestYml(await fs.promises.readFile(path.join(distDir, metadataFile), "utf8"));
    if (parsed.version !== version) throw new Error(`${metadataFile} version ${parsed.version} does not match ${version}`);
    if (!parsed.path) throw new Error(`${metadataFile} is missing path`);
    if (!parsed.sha512) throw new Error(`${metadataFile} is missing sha512`);
    await assertSha512(metadataFile, parsed.path, parsed.sha512);
    for (const file of parsed.files) {
      if (!file.url || !file.sha512 || file.size == null) throw new Error(`${metadataFile} has an incomplete files entry`);
      await assertSha512(metadataFile, file.url, file.sha512);
      const stat = await fs.promises.stat(path.join(distDir, file.url));
      if (stat.size !== file.size) throw new Error(`${metadataFile} size mismatch for ${file.url}: expected ${file.size}, got ${stat.size}`);
    }
  }
}

async function assertSha512(metadataFile, file, expected) {
  if (!assets.has(file)) throw new Error(`${metadataFile} references missing file ${file}`);
  const actual = await digest(path.join(distDir, file), "sha512", "base64");
  if (actual !== expected) throw new Error(`${metadataFile} sha512 mismatch for ${file}`);
}

function parseLatestYml(raw) {
  const result = { version: null, path: null, sha512: null, files: [] };
  let currentFile = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isTopLevel = !/^\s/.test(line);
    if (!isTopLevel && trimmed.startsWith("- url:")) {
      currentFile = { url: valueAfterColon(trimmed), sha512: null, size: null };
      result.files.push(currentFile);
      continue;
    }
    if (!isTopLevel && currentFile && trimmed.startsWith("sha512:")) {
      currentFile.sha512 = valueAfterColon(trimmed);
      continue;
    }
    if (!isTopLevel && currentFile && trimmed.startsWith("size:")) {
      currentFile.size = Number(valueAfterColon(trimmed));
      continue;
    }
    if (trimmed.startsWith("version:")) result.version = valueAfterColon(trimmed);
    if (trimmed.startsWith("path:")) result.path = valueAfterColon(trimmed);
    if (trimmed.startsWith("sha512:")) result.sha512 = valueAfterColon(trimmed);
  }
  return result;
}

function valueAfterColon(line) {
  return line.slice(line.indexOf(":") + 1).trim().replace(/^['"]|['"]$/g, "");
}

async function digest(filePath, algorithm, encoding) {
  const hash = createHash(algorithm);
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest(encoding);
}
