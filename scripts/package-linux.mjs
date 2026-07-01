import path from "node:path";
import { archArgs, packageEnv, run } from "./package-utils.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const desktopDir = path.join(repoRoot, "apps", "desktop");
const args = ["exec", "electron-builder", "--linux", "AppImage", "deb", "--publish", "never", ...archArgs()];

await run("pnpm", args, desktopDir, packageEnv());
