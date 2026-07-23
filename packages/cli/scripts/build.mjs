import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedOutput = process.argv[2];
const outputPath = requestedOutput
  ? path.resolve(packageRoot, requestedOutput)
  : path.join(packageRoot, "dist", "skill-manager.mjs");

await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
await build({
  entryPoints: [path.join(packageRoot, "src", "index.ts")],
  outfile: outputPath,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" }
});
await fs.promises.chmod(outputPath, 0o755);

console.log(path.relative(path.resolve(packageRoot, "../.."), outputPath));
