import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const desktopDir = path.join(repoRoot, "apps", "desktop");
const hasDeveloperSigningIdentity = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const args = ["exec", "electron-builder", "--mac", "dmg", "zip", "dir", "--publish", "never", ...archArgs()];

if (!hasDeveloperSigningIdentity) {
  args.push("--config.mac.identity=-", "--config.mac.hardenedRuntime=false", "--config.mac.gatekeeperAssess=false");
}

console.log(
  hasDeveloperSigningIdentity
    ? "Packaging macOS release with configured signing identity."
    : "Packaging macOS release with ad-hoc signing."
);

await run("pnpm", args, desktopDir);

function archArgs() {
  const value = process.env.SKILL_MANAGER_BUILD_ARCHS?.trim();
  if (!value) return [];
  return value
    .split(",")
    .map((arch) => arch.trim())
    .filter(Boolean)
    .map((arch) => `--${arch}`);
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}
