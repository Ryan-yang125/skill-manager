import { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ArchiveError, InventoryService, type SkillDecision, type SkillInventory } from "@skill-manager/core";
import electronUpdater from "electron-updater";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.SKILL_MANAGER_DEV_SERVER_URL);
const isSmoke = process.env.SKILL_MANAGER_SMOKE === "1";
const { autoUpdater } = electronUpdater;

let mainWindow: BrowserWindow | null = null;
let service: InventoryService | null = null;
let lastInventory: SkillInventory | null = null;

function getService(): InventoryService {
  service ??= new InventoryService({
    homeDir: os.homedir(),
    userDataDir: app.getPath("userData")
  });
  return service;
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1388,
    height: 884,
    minWidth: 1120,
    minHeight: 720,
    title: "Skill Manager",
    backgroundColor: "#f7f4df",
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDev || isSmoke
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devServerUrl = process.env.SKILL_MANAGER_DEV_SERVER_URL ?? "";
    const currentUrl = mainWindow?.webContents.getURL() ?? "";
    const allowed = (isDev && url.startsWith(devServerUrl)) || (!isDev && url === currentUrl);
    if (!allowed) event.preventDefault();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.SKILL_MANAGER_DEV_SERVER_URL!);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(applicationMenu());
  configureAutoUpdater();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  registerIpc();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
});

function registerIpc(): void {
  ipcMain.handle("inventory:load", async () => {
    lastInventory = await getService().loadInventory();
    return lastInventory;
  });

  ipcMain.handle("decision:set", async (_event, payload: { skillId: string; decision: SkillDecision | null }) => {
    assertString(payload?.skillId, "skillId");
    if (payload.decision !== null && payload.decision !== "protected" && payload.decision !== "review") {
      throw new Error("Invalid decision");
    }
    await getService().setDecision(payload.skillId, payload.decision);
    lastInventory = await getService().loadInventory();
    return lastInventory;
  });

  ipcMain.handle("skill:archive", async (_event, payload: { skillId: string }) => {
    assertString(payload?.skillId, "skillId");
    await getService().archiveSkillById(payload.skillId);
    lastInventory = await getService().loadInventory();
    return lastInventory;
  });

  ipcMain.handle("archived:restore", async (_event, payload: { archivedId: string }) => {
    assertString(payload?.archivedId, "archivedId");
    try {
      await getService().restoreArchivedById(payload.archivedId);
    } catch (error) {
      if (error instanceof ArchiveError) {
        return { error: { code: error.code, message: error.message, path: error.pathValue } };
      }
      throw error;
    }
    lastInventory = await getService().loadInventory();
    return { inventory: lastInventory };
  });

  ipcMain.handle("report:export", async (_event, payload: { skillIds: string[] }) => {
    if (!Array.isArray(payload?.skillIds)) throw new Error("skillIds must be an array");
    const inventory = lastInventory ?? (await getService().loadInventory());
    const selected = inventory.active.filter((skill) => payload.skillIds.includes(skill.id));
    const exportResult = await getService().exportCleanupReport(inventory, selected);
    return exportResult;
  });

  ipcMain.handle("path:reveal", async (_event, payload: { targetPath: string }) => {
    assertString(payload?.targetPath, "targetPath");
    await assertKnownRevealPath(payload.targetPath);
    shell.showItemInFolder(payload.targetPath);
    return true;
  });

  ipcMain.handle("path:openExternal", async (_event, payload: { url: string }) => {
    assertString(payload?.url, "url");
    if (!isAllowedExternalUrl(payload.url)) throw new Error("Only HTTPS URLs can be opened");
    await shell.openExternal(payload.url);
    return true;
  });
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} must be a non-empty string`);
}

async function assertKnownRevealPath(targetPath: string): Promise<void> {
  const resolved = path.resolve(targetPath);
  const inventory = lastInventory ?? (await getService().loadInventory());
  const reportRoot = path.resolve(getService().reportStore.reportsRoot);
  const knownPaths = [
    ...inventory.active.flatMap((skill) => [skill.path, skill.skillFilePath, ...skill.locations.map((location) => location.path)]),
    ...inventory.archived.flatMap((archived) => [archived.archivePath, archived.originalPath])
  ].map((item) => path.resolve(item));

  if (knownPaths.includes(resolved)) return;
  if (isPathInside(resolved, reportRoot)) return;
  throw new Error("Path is not part of the current Skill Manager inventory");
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function applicationMenu(): Menu {
  return Menu.buildFromTemplate([
    ...(process.platform === "darwin"
      ? [
          {
            label: "Skill Manager",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const }
            ]
          }
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Check for Updates",
          click: () => {
            void checkForUpdates();
          }
        },
        { type: "separator" },
        { role: "close" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }]
    }
  ]);
}

function configureAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
}

async function checkForUpdates(): Promise<void> {
  if (isDev || isSmoke) {
    await dialog.showMessageBox({
      type: "info",
      message: "Updates are checked in packaged releases.",
      detail: "Development and smoke-test builds skip update checks."
    });
    return;
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo?.version || result.updateInfo.version === app.getVersion()) {
      await dialog.showMessageBox({ type: "info", message: "Skill Manager is up to date." });
      return;
    }
    const response = await dialog.showMessageBox({
      type: "info",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Skill Manager ${result.updateInfo.version} is available.`
    });
    if (response.response === 0) await autoUpdater.downloadUpdate();
  } catch (error) {
    await dialog.showMessageBox({
      type: "warning",
      message: "Update check failed.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
