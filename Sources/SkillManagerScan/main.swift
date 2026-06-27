import Foundation
import SkillManagerCore

let startedAt = Date()
let scanner = SkillScanner()
let analyzer = UsageAnalyzer()
let roots = scanner.defaultRoots()
let roughSkills = scanner.scan(roots: roots, usage: [:])
let afterScan = Date()
let usage = analyzer.analyzeSkillUsage(skills: roughSkills)
let afterUsage = Date()
let skills = scanner.scan(roots: roots, usage: usage)
let inventory = SkillInventory(active: skills, archived: ArchiveStore().archivedSkills(), scannedAt: Date())
let finishedAt = Date()

print("Skill Manager Local Scan")
print("scannedAt=\(ISO8601DateFormatter().string(from: inventory.scannedAt))")
print("roots=\(roots.map { $0.url.path }.joined(separator: ","))")
print(String(format: "scanSeconds=%.3f", afterScan.timeIntervalSince(startedAt)))
print(String(format: "usageSeconds=%.3f", afterUsage.timeIntervalSince(afterScan)))
print(String(format: "totalSeconds=%.3f", finishedAt.timeIntervalSince(startedAt)))
print("installed=\(inventory.active.count)")
print("unused=\(inventory.unused.count)")
print("suggested=\(inventory.archiveCandidates.count)")
print("archived=\(inventory.archived.count)")
print("contextTokens=\(inventory.totalContextTokens)")
print("reclaimableContextTokens=\(inventory.reclaimableContextTokens)")

for skill in inventory.active.prefix(8) {
    print("- \(skill.title) | \(skill.agent.rawValue) | \(SkillFormatting.contextTokens(skill.tokenEstimate)) | \(SkillFormatting.relativeDate(skill.lastUsedAt)) | \(skill.recommendation.rawValue)")
}
