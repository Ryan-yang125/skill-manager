# Skill Manager

[English](README.md)

**基于本地证据的 Agent Skills 清单与安全整理工具。**

[官网](https://ryan-yang125.github.io/skill-manager/) · [最新版本](https://github.com/Ryan-yang125/skill-manager/releases/latest) · [使用指南](https://ryan-yang125.github.io/skill-manager/guides/)

Skill Manager 会扫描本机安装的 Agent Skills，整理来源、路径、目录发现元数据估算、本地 Codex 与 Claude 使用证据，并提供可恢复的归档与还原流程。项目永久免费，采用 MIT License。

## 直接运行 CLI

```bash
npx github:Ryan-yang125/skill-manager audit
```

输出适合 Agent 或脚本读取的 JSON：

```bash
npx github:Ryan-yang125/skill-manager audit --json
```

审计流程保持只读，结果包含扫描根目录、证据覆盖范围、活跃与已归档 Skill、来源信息、最近证据和复核候选。

通过 Homebrew 安装常驻 CLI：

```bash
brew install Ryan-yang125/skill-manager/skill-manager
skill-manager audit
```

## 安装 Agent Skill

```bash
npx skills add Ryan-yang125/skill-manager --skill audit-agent-skills -g -y
```

随后可以直接对 Agent 说：

> 审计我本机的 Agent Skills，先解释证据覆盖，再给整理建议。

这个 Skill 会调用 JSON 审计、说明覆盖限制，并在任何归档或还原操作前请求明确确认。

## CLI 命令

```text
skill-manager audit [--json | --markdown]
skill-manager inspect <skill>
skill-manager archive <skill> --dry-run
skill-manager archive <skill> --yes
skill-manager restore <archive-id> --yes
```

归档流程会先写入持久账本，再移动 Skill 文件夹。还原流程会检查原始路径冲突，并验证归档内容。

## 支持的全局目录

- `~/.agents/skills`
- `~/.codex/skills`
- `~/.claude/skills`

## 如何理解使用证据

- `observed`：扫描范围内找到了对应的本地会话证据。
- `no_evidence`：相关日志已扫描，其中没有匹配记录，结果进入复核。
- `unknown`：相关日志不可用或覆盖不足，结果进入复核。

零匹配结果只描述本次扫描范围。低频、关键或手动安装的 Skill 仍需要结合用途与来源判断。

## 桌面版

[GitHub Releases](https://github.com/Ryan-yang125/skill-manager/releases/latest) 提供 macOS Apple Silicon、Windows x64 和 Linux x64 安装包。桌面版包含三栏清单、`SKILL.md` 阅读、来源分组、证据查看、归档历史、中英文界面和明暗主题。

## 隐私与安全

清单扫描、证据分析、报告、归档和还原都在本机运行。CLI 与桌面版不发送遥测数据。写操作需要明确确认，归档账本保留恢复路径与内容校验信息。

详细说明见 [隐私文档](docs/privacy.md) 与 [安全策略](SECURITY.md)。

## 参与贡献

欢迎提交新的 Agent 适配器、匿名证据样例、可访问性改进、翻译和聚焦的修复。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT
