import { contextBridge, ipcRenderer } from "electron";

import type { CleanupReportExport, SkillDecision, SkillInventory } from "@skill-manager/core";

const api = {
  loadInventory: (): Promise<SkillInventory> => ipcRenderer.invoke("inventory:load"),
  setDecision: (skillId: string, decision: SkillDecision | null): Promise<SkillInventory> => ipcRenderer.invoke("decision:set", { skillId, decision }),
  archiveSkill: (skillId: string): Promise<SkillInventory> => ipcRenderer.invoke("skill:archive", { skillId }),
  restoreSkill: (archivedId: string): Promise<{ inventory?: SkillInventory; error?: { code: string; message: string; path: string } }> =>
    ipcRenderer.invoke("archived:restore", { archivedId }),
  exportCleanupReport: (skillIds: string[]): Promise<CleanupReportExport> => ipcRenderer.invoke("report:export", { skillIds }),
  revealPath: (targetPath: string): Promise<boolean> => ipcRenderer.invoke("path:reveal", { targetPath }),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke("path:openExternal", { url })
};

contextBridge.exposeInMainWorld("skillManager", api);

export type SkillManagerApi = typeof api;
