import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "dist-electron"));
const checksumPath = path.join(distDir, "SHA256SUMS.txt");

const artifacts = await releaseArtifacts(distDir);

if (artifacts.length === 0) {
  throw new Error(`No release artifacts found in ${distDir}`);
}

if (!fs.existsSync(checksumPath)) {
  throw new Error(`Missing checksum file: ${checksumPath}`);
}

const checksumText = await fs.promises.readFile(checksumPath, "utf8");
const checksums = parseChecksums(checksumText);
const missingFromChecksums = artifacts.filter((artifact) => !checksums.has(path.relative(distDir, artifact)));
if (missingFromChecksums.length > 0) {
  throw new Error(`Artifacts missing from SHA256SUMS.txt: ${missingFromChecksums.map((item) => path.relative(distDir, item)).join(", ")}`);
}

for (const artifact of artifacts) {
  const relativePath = path.relative(distDir, artifact);
  const expected = checksums.get(relativePath);
  const actual = await sha256(artifact);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${relativePath}: expected ${expected}, got ${actual}`);
  }
}

console.log(`Verified ${artifacts.length} release artifacts`);

async function releaseArtifacts(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const result = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isFile() && isReleaseArtifact(filePath)) result.push(filePath);
  }
  return result;
}

function isReleaseArtifact(filePath) {
  const basename = path.basename(filePath);
  if (basename === "SHA256SUMS.txt" || basename === "builder-debug.yml") return false;
  if (/^latest.*\.ya?ml$/.test(basename)) return true;
  return [".dmg", ".zip", ".exe", ".msi", ".AppImage", ".deb", ".blockmap"].includes(path.extname(filePath));
}

function parseChecksums(text) {
  const result = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line.trim());
    if (match) result.set(match[2], match[1]);
  }
  return result;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}
