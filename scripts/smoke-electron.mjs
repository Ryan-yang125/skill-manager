import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const mainPath = path.join(repoRoot, "apps", "desktop", "dist-electron", "main.js");
const screenshotPath = path.join(repoRoot, "docs", "screenshots", "electron-main.png");
const fixtureHome = await fs.promises.mkdtemp(path.join(os.tmpdir(), "skill-manager-smoke-home-"));

if (!fs.existsSync(mainPath)) {
  throw new Error(`Build output not found: ${mainPath}`);
}

await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });

const app = await electron.launch({
  args: [mainPath],
  env: {
    ...process.env,
    HOME: fixtureHome,
    SKILL_MANAGER_SMOKE: "1"
  }
});

try {
  app.on("console", (message) => {
    console.log(`[electron:${message.type()}] ${message.text()}`);
  });
  const window = await withTimeout(app.firstWindow(), 15_000, "Timed out waiting for the first window");
  window.on("pageerror", (error) => {
    console.error(`[renderer:error] ${error.message}`);
  });
  window.on("console", (message) => {
    console.log(`[renderer:${message.type()}] ${message.text()}`);
  });
  await window.waitForLoadState("domcontentloaded");
  await window.waitForSelector("text=Skill Manager", { timeout: 15_000 });
  await window.waitForSelector('[data-scan-state="ready"]', { timeout: 30_000 });
  const nodeAccess = await window.evaluate(() => ({
    requireType: typeof globalThis.require,
    nodeVersionVisible: Boolean(globalThis.process?.versions?.node)
  }));
  if (nodeAccess.requireType !== "undefined" || nodeAccess.nodeVersionVisible) {
    throw new Error(`Renderer has unexpected Node access: ${JSON.stringify(nodeAccess)}`);
  }
  const ipcSafety = await window.evaluate(async () => {
    const result = {
      emptyArchiveRejected: false,
      fileUrlRejected: false
    };
    try {
      await globalThis.skillManager.archiveSkill("");
    } catch {
      result.emptyArchiveRejected = true;
    }
    try {
      await globalThis.skillManager.openExternal("file:///tmp/skill-manager");
    } catch {
      result.fileUrlRejected = true;
    }
    return result;
  });
  if (!ipcSafety.emptyArchiveRejected || !ipcSafety.fileUrlRejected) {
    throw new Error(`IPC safety checks failed: ${JSON.stringify(ipcSafety)}`);
  }
  const text = await window.locator("body").innerText();
  if (!text.includes("Skill Manager")) {
    throw new Error("Skill Manager shell did not render");
  }
  await window.screenshot({ path: screenshotPath });
  console.log(`Smoke screenshot: ${screenshotPath}`);
} finally {
  await app.close();
  await fs.promises.rm(fixtureHome, { recursive: true, force: true });
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
