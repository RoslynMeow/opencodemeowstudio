# OpenCode MeowStudio

[![CI](https://github.com/RoslynMeow/opencodemeowstudio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/RoslynMeow/opencodemeowstudio/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/RoslynMeow/opencodemeowstudio?label=release&color=e0a458)](https://github.com/RoslynMeow/opencodemeowstudio/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-4f8cff)](https://github.com/RoslynMeow/opencodemeowstudio/releases)
[![Electron](https://img.shields.io/badge/Electron-44-47848f)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-7dd3a7)](https://github.com/RoslynMeow/opencodemeowstudio)

English | [简体中文](README.zh-CN.md)

OpenCode MeowStudio is a desktop client for [OpenCode](https://opencode.ai), built with Electron, React, TypeScript and Tailwind CSS. It wraps the official `opencode serve` runtime and adds a visual workspace for sessions, Git, files, agents and project tools.

## Features

- **Chat & sessions** — streaming responses, model/agent picker, permissions, usage and cost.
- **Session graph** — main conversations and subagent branches, collapsible groups and node metrics.
- **Isolated worktrees** — optional Git worktree + branch per top-level conversation, with merge status and cleanup.
- **Build / Architect** — Build cannot delegate; Architect can clarify requirements and dispatch specialist subagents.
- **Structured questions** — Architect questions render as selectable cards with custom text input.
- **MCP & LSP marketplace** — live catalogs from official MCP Registry and Mason Registry, with configurable sources.
- **Files & Git** — file explorer, CodeMirror editor, unified diffs, commit graph, staging, commits, merge/rebase, stash and remotes.
- **External terminal** — open a native terminal at the project root from the sidebar.
- **Message rollback** — edit or withdraw user messages, restore to a point, and recover with file snapshots.
- **Workspace options** — Pages or Sidebar layout, optional Files/Git modules, themes, English and Chinese UI.

## Install

Download the latest Windows build from [Releases](https://github.com/RoslynMeow/opencodemeowstudio/releases).

- **Portable**: `opencode-meowstudio-<version>-x64-portable.exe` — double-click to run. App data is stored in `OpenCode MeowStudio Data` next to the executable.
- **Installer**: `opencode-meowstudio-<version>-x64-setup.exe` — installs the app and supports auto-updates.

Windows builds are currently unsigned, so SmartScreen may show an unknown publisher warning.

OpenCode runtime and model providers are configured inside the app. Git is optional but required for Git features and session worktrees.

## Branching

- `main` is the release branch. Changes should reach it only through a Pull Request from `dev`, using **Create a merge commit**.
- `dev` is the integration branch for day-to-day feature and fix commits.
- Direct pushes to `main` are discouraged; enable GitHub branch protection and require the CI status check.

## Development

Requirements: Node.js 24+ and npm. Packaging is currently supported on Windows x64.

```bash
npm install
npm run dev          # development
npm run typecheck    # typecheck main, preload and renderer
npm test             # unit, worktree integration and packaged smoke tests
npm run build        # production build
npm start            # preview the production build
npm run package:win  # portable + installer
```

Useful packaging and test commands:

```bash
npm run package:win:portable
npm run package:win:installer
npm run package:win:dir   # unpacked build for the Electron smoke test
npm run test:smoke        # smoke test an existing win-unpacked build
```

## Project layout

```text
src/main/       Electron main process, OpenCode sidecar, Git, markets, worktrees
src/preload/    contextBridge API
src/renderer/   React UI, views, components, store and i18n
src/shared/     shared types and RPC contract
build/          application icon
```

## Links

- [Releases](https://github.com/RoslynMeow/opencodemeowstudio/releases)
- [Issues](https://github.com/RoslynMeow/opencodemeowstudio/issues)
- [OpenCode documentation](https://opencode.ai/docs)
- [OpenCode SDK](https://opencode.ai/docs/sdk)

## License

MIT
