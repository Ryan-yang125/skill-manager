import path from "node:path";

import { readJson, writeJsonAtomic } from "./path-utils.js";
import type { SkillDecision, SkillDecisionRecord } from "./types.js";

interface DecisionFile {
  decisions: SkillDecisionRecord[];
}

export class SkillDecisionStore {
  readonly filePath: string;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, "decisions.json");
  }

  async all(): Promise<Map<string, SkillDecisionRecord>> {
    const file = await readJson<DecisionFile>(this.filePath, { decisions: [] });
    return new Map(file.decisions.map((decision) => [decision.skillId, decision]));
  }

  async set(skillId: string, decision: SkillDecision | null, now = new Date()): Promise<Map<string, SkillDecisionRecord>> {
    const decisions = await this.all();
    if (decision) {
      decisions.set(skillId, { skillId, decision, updatedAt: now.toISOString() });
    } else {
      decisions.delete(skillId);
    }
    await writeJsonAtomic(this.filePath, { decisions: [...decisions.values()] });
    return decisions;
  }
}
