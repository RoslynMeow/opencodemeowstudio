# OpenCode MeowStudio

[![CI](https://github.com/RoslynMeow/opencodemeowstudio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RoslynMeow/opencodemeowstudio/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/RoslynMeow/opencodemeowstudio?label=release&color=e0a458)](https://github.com/RoslynMeow/opencodemeowstudio/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-4f8cff)](https://github.com/RoslynMeow/opencodemeowstudio/releases)
[![Electron](https://img.shields.io/badge/Electron-44-47848f)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-7dd3a7)](https://github.com/RoslynMeow/opencodemeowstudio)

[English](README.md) | 简体中文

OpenCode MeowStudio 是一个基于 Electron、React、TypeScript 和 Tailwind CSS 的 [OpenCode](https://opencode.ai) 桌面客户端。它以官方 `opencode serve` 运行时为核心，提供会话、Git、文件、Agent 和项目工具的可视化工作区。

## 功能

- **聊天与会话**：流式回复、模型/Agent 选择、权限确认、用量与费用。
- **会话图**：主会话与子代理分支、可折叠分组、节点状态和指标。
- **独立 Worktree**：可为每个顶层会话创建 Git worktree + 分支，并显示合并状态、支持清理。
- **Build / Architect**：Build 不能派生子代理；Architect 可以澄清需求并调度专业子代理。
- **结构化提问**：Architect 的问题会显示为可选项卡片，支持自定义输入。
- **MCP / LSP 市场**：从官方 MCP Registry 和 Mason Registry 在线获取，来源可配置。
- **文件与 Git**：文件浏览、CodeMirror 编辑、统一 diff、提交图、暂存、提交、merge/rebase、stash 和远程操作。
- **外部终端**：从左侧栏在项目根目录打开系统终端。
- **消息回滚**：编辑/撤回用户消息、恢复到某个节点，并同步还原文件快照。
- **工作区选项**：Pages / Sidebar 布局、可选 Files/Git 模块、主题、中英文界面。

## 安装

从 [Releases](https://github.com/RoslynMeow/opencodemeowstudio/releases) 下载最新 Windows 版本。

- **Portable**：`opencode-meowstudio-<version>-x64-portable.exe`，双击启动；数据保存在 exe 同目录的 `OpenCode Meow Studio Data`。
- **安装版**：`opencode-meowstudio-<version>-x64-setup.exe`，安装后支持自动更新。

Windows 构建当前未签名，SmartScreen 可能提示未知发布者。

OpenCode 运行时和模型 Provider 在应用内配置。Git 是可选的，但 Git 功能和会话 worktree 需要 Git。

## 分支流程

- `main` 是发布分支，只通过来自 `dev` 的 Pull Request 更新，并使用 **Create a merge commit**。
- `dev` 是日常功能与修复的集成分支。
- 不建议直接 push `main`；请在 GitHub 开启分支保护并强制 CI 通过。

## 开发

需要 Node.js 24+ 和 npm。当前打包支持 Windows x64。

```bash
npm install
npm run dev          # 开发模式
npm run typecheck    # 检查 main / preload / renderer
npm run build        # 生产构建
npm start            # 预览生产构建
npm run package:win  # portable + 安装包
```

单独打包：

```bash
npm run package:win:portable
npm run package:win:installer
```

## 项目结构

```text
src/main/       Electron 主进程、OpenCode sidecar、Git、市场、worktree
src/preload/    contextBridge API
src/renderer/   React UI、页面、组件、状态和 i18n
src/shared/     共享类型与 RPC 契约
build/          应用图标
```

## 链接

- [Releases](https://github.com/RoslynMeow/opencodemeowstudio/releases)
- [Issues](https://github.com/RoslynMeow/opencodemeowstudio/issues)
- [OpenCode 文档](https://opencode.ai/docs)
- [OpenCode SDK](https://opencode.ai/docs/sdk)

## License

MIT
