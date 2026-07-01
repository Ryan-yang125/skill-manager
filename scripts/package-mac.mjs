import path from "node:path";
import { archArgs, hasSigningIdentity, packageEnv, run } from "./package-utils.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const desktopDir = path.join(repoRoot, "apps", "desktop");
const env = packageEnv();
const hasDeveloperSigningIdentity = hasSigningIdentity(env);
const args = ["exec", "electron-builder", "--mac", "dmg", "zip", "dir", "--publish", "never", ...archArgs()];

if (!hasDeveloperSigningIdentity) {
  args.push("--config.mac.identity=-", "--config.mac.hardenedRuntime=false", "--config.mac.gatekeeperAssess=false");
}

console.log(
  hasDeveloperSigningIdentity
    ? "Packaging macOS release with configured signing identity."
    : "Packaging macOS release with ad-hoc signing."
);

await run("pnpm", args, desktopDir, env);
