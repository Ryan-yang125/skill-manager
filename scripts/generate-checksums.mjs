import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(repoRoot, "dist-electron");
const checksumPath = path.join(distDir, "SHA256SUMS.txt");

const files = await listReleaseFiles(distDir);

if (files.length === 0) {
  throw new Error(`No release artifacts found in ${distDir}`);
}

const lines = [];
for (const filePath of files) {
  const digest = await sha256(filePath);
  lines.push(`${digest}  ${path.relative(distDir, filePath)}`);
}

await fs.promises.writeFile(checksumPath, `${lines.sort().join("\n")}\n`);
console.log(`Wrote ${checksumPath}`);

async function listReleaseFiles(directory) {
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

async function sha256(filePath) {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}
