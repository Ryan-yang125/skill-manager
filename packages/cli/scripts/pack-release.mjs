import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const outputDirectory = path.join(repositoryRoot, "cli-dist");
const packageMetadata = JSON.parse(await fs.promises.readFile(path.join(packageRoot, "package.json"), "utf8"));

await fs.promises.mkdir(outputDirectory, { recursive: true });
execFileSync("npm", ["pack", "--pack-destination", outputDirectory], {
  cwd: packageRoot,
  stdio: "inherit"
});

const outputPath = path.join(outputDirectory, `${packageMetadata.name}-${packageMetadata.version}.tgz`);
await fs.promises.access(outputPath);
console.log(path.relative(repositoryRoot, outputPath));
