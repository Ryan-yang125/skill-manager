import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const screenshotDir = path.join(repoRoot, "docs", "screenshots");
const port = 5175;
const url = `http://127.0.0.1:${port}/`;

await fs.promises.mkdir(screenshotDir, { recursive: true });

const server = spawn("pnpm", ["--dir", "apps/desktop", "exec", "vite", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32"
});

try {
  await waitForServer(url);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url);
    await page.waitForSelector('[data-scan-state="ready"]', { timeout: 30_000 });
    await page.screenshot({ path: path.join(screenshotDir, "electron-main.png") });
    await page.evaluate(() => {
      document.body.dataset.theme = "dark";
      document.body.classList.add("dark");
    });
    await page.screenshot({ path: path.join(screenshotDir, "electron-dark.png") });
    await page.setViewportSize({ width: 1120, height: 720 });
    await page.screenshot({ path: path.join(screenshotDir, "electron-compact.png") });
  } finally {
    await browser.close();
  }
  console.log(`Screenshots written to ${screenshotDir}`);
} finally {
  server.kill("SIGTERM");
}

async function waitForServer(targetUrl) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(targetUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}
