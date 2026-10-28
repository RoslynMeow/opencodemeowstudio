import type { OpencodeClient } from "@opencode-ai/sdk"
import { app, dialog, shell } from "electron"
import { execFile, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import type {
  Agent,
  AgentInfo,
  ChatInput,
  Command,
  CommandInput,
  ConfigScope,
  FileContentInfo,
  FileDiff,
  FileNodeInfo,
  GitDiffContent,
  GitFileStatus,
  GitInfo,
  LspConfig,
  LspEntry,
  LspRegistryMarket,
  LspViewData,
  McpAuthStart,
  McpConfig,
  McpEntry,
  McpRegistryMarket,
  McpStatus,
  McpViewData,
  Message,
  ModelInfo,
  ModelRef,
  OllamaInfo,
  Part,
  PermissionReply,
  PluginViewData,
  Project,
  ProviderAuthMethod,
  ProviderCatalog,
  ProviderOAuthStart,
  RawConfig,
  RpcName,
  Session,
  SessionEntry,
  SessionStatus,
  SessionUsage,
  Settings,
} from "@shared/types"
import {
  addNpmPlugin,
  createLocalPlugin,
  installOllamaProvider,
  lspRawConfig,
  lspRawEntries,
  mcpRawEntries,
  patchConfig,
  pluginView,
  readRawConfig,
  removeConfigPath,
  removeNpmPlugin,
  setLocalPluginEnabled,
  writeRawConfig,
} from "./config-service"
import { broadcastState, buildAppState } from "./app-state"
import { ensureBackend, restartBackend } from "./backend-manager"
import { clearLogs, getLogs, log } from "./logger"
import {
  addProject,
  getActiveProject,
  getSettings,
  getWorktree,
  getWorktrees,
  removeProject,
  renameProject,
  rememberAgent,
  rememberModel,
  setActiveProject,
  updateSettings,
} from "./store"
import { configPaths, globalPluginsDir, projectPluginsDir } from "./paths"
import {
  createSessionWorktree,
  listWorktreeViewAsync,
  mergeSessionWorktree,
  recordCreatedWorktree,
  removeSessionWorktree,
  syncWorktreeConfigs,
} from "./worktree-service"
import {
  detectGitAsync,
  gitAbort,
  gitBranchesAsync,
  gitCheckout,
  gitContinue,
  gitDeleteBranch,
  gitCommitDetailAsync,
  gitCreateBranch,
  gitFailure,
  gitFetch,
  gitGraphAsync,
  gitInit,
  gitMerge,
  gitOperationAsync,
  gitRebase,
  gitPull,
  gitPush,
  gitRemotesAsync,
  gitStash,
  gitStashPop,
  gitTag,
  installGit,
  runGitAsync,
} from "./git-service"
import { ensureRuntime, listRuntimeVersions } from "./runtime"
import { fetchLspRegistry, fetchMcpRegistry } from "./market-service"
import { checkForUpdates, downloadUpdate, getUpdateStatus, installUpdate } from "./updater"
import { crashReportsDir } from "./crash-report"
import { getClient, reloadInstance, setActiveDirectory, stopBackend } from "./sidecar"

type Handler = (...args: never[]) => unknown

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

async function readGitFileDiff(projectPath: string, file: string): Promise<{ before: string; after: string }> {
  const normalized = file.replace(/\\/g, "/")
  let before = ""
  try {
    before = await runGitAsync(projectPath, ["show", `HEAD:${normalized}`], 30_000)
  } catch {
    before = ""
  }
  let after = ""
  try {
    const absolute = resolve(projectPath, file)
    if (existsSync(absolute)) after = (await readFile(absolute)).toString("utf8")
  } catch {
    after = ""
  }
  const max = 600_000
  return { before: before.slice(0, max), after: after.slice(0, max) }
}

async function getGitInfoAsync(): Promise<GitInfo> {
  const project = requireProject()
  const environment = await detectGitAsync()
  if (!environment.available) {
    return {
      isRepo: false,
      clean: true,
      staged: [],
      unstaged: [],
      gitAvailable: false,
    }
  }
  try {
    await runGitAsync(project.path, ["rev-parse", "--is-inside-work-tree"], 15_000)
  } catch {
    return {
      isRepo: false,
      clean: true,
      staged: [],
      unstaged: [],
      gitAvailable: true,
      gitVersion: environment.version,
    }
  }

  let root: string | undefined
  let branch: string | undefined
  let upstream: string | undefined
  let ahead: number | undefined
  let behind: number | undefined
  try {
    root = (await runGitAsync(project.path, ["rev-parse", "--show-toplevel"], 15_000)).trim()
  } catch {
    root = undefined
  }
  try {
    branch = (await runGitAsync(project.path, ["rev-parse", "--abbrev-ref", "HEAD"], 15_000)).trim()
    if (branch === "HEAD") {
      branch = (await runGitAsync(project.path, ["rev-parse", "--short", "HEAD"], 15_000)).trim()
    }
  } catch {
    branch = undefined
  }
  try {
    upstream = (
      await runGitAsync(project.path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], 15_000)
    ).trim()
    const counts = (
      await runGitAsync(project.path, ["rev-list", "--left-right", "--count", "@{u}...HEAD"], 30_000)
    )
      .trim()
      .split(/\s+/)
    behind = Number(counts[0] ?? 0)
    ahead = Number(counts[1] ?? 0)
  } catch {
    upstream = undefined
  }

  const files: GitFileStatus[] = []
  const conflicts: string[] = []
  const output = await runGitAsync(project.path, ["status", "--porcelain=v1", "-uall"], 120_000)
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    const index = line[0] ?? " "
    const worktree = line[1] ?? " "
    let path = line.slice(3).trim()
    const rename = path.split(" -> ")
    if (rename.length > 1) path = rename[rename.length - 1]?.trim() ?? path
    if (!path) continue
    const untracked = index === "?" && worktree === "?"
    const staged = !untracked && index !== " " && index !== "?"
    const unstaged = untracked || (worktree !== " " && worktree !== "?")
    const status = untracked ? "?" : index !== " " && index !== "?" ? index : worktree
    const conflicted = index === "U" || worktree === "U" || (index === "A" && worktree === "A") || (index === "D" && worktree === "D")
    if (conflicted) conflicts.push(path)
    files.push({ path, index, worktree, staged, unstaged, untracked, status })
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  const remotes = await gitRemotesAsync(project.path)
  const remote = remotes.find((entry) => entry.name === "origin") ?? remotes[0]
  let stashCount = 0
  try {
    stashCount = (await runGitAsync(project.path, ["stash", "list"], 15_000)).split(/\r?\n/).filter(Boolean).length
  } catch {
    stashCount = 0
  }
  return {
    isRepo: true,
    root,
    branch,
    upstream,
    ahead,
    behind,
    clean: files.length === 0,
    staged: files.filter((file) => file.staged),
    unstaged: files.filter((file) => file.unstaged),
    gitAvailable: true,
    gitVersion: environment.version,
    remoteUrl: remote?.url,
    githubUrl: remote?.github?.url,
    conflicts,
    operation: await gitOperationAsync(project.path),
    stashCount,
  }
}

async function gitDiffContentAsync(path: string, staged: boolean): Promise<GitDiffContent> {
  const project = requireProject()
  const normalized = path.replace(/\\/g, "/")
  const show = async (ref: string): Promise<string> => {
    try {
      return await runGitAsync(project.path, ["show", `${ref}:${normalized}`], 30_000)
    } catch {
      return ""
    }
  }
  let before = ""
  let after = ""
  if (staged) {
    before = await show("HEAD")
    after = await show("")
  } else {
    before = await show("")
    if (!before) before = await show("HEAD")
    try {
      const absolute = resolve(project.path, path)
      if (existsSync(absolute)) {
        const buffer = await readFile(absolute)
        if (!buffer.includes(0)) after = buffer.toString("utf8")
      }
    } catch {
      after = ""
    }
  }
  const max = 600_000
  return { before: before.slice(0, max), after: after.slice(0, max) }
}

function requireProject(): Project {
  const project = getActiveProject()
  if (!project) throw new Error("No active project. Open a project first.")
  return project
}

function requireDirectory(): string {
  return requireProject().path
}

function clientFor(): OpencodeClient {
  return getClient(getActiveProject()?.path ?? app.getPath("home"))
}

const sessionDirectories = new Map<string, string>()

function rememberSessionDirectory(session: Session): void {
  if (session.directory) sessionDirectories.set(session.id, session.directory)
}

async function sessionDirectory(id: string): Promise<string> {
  const cached = sessionDirectories.get(id)
  if (cached) return cached
  try {
    const session = await call<Session>(clientFor().session.get({ path: { id } }))
    if (session.directory) {
      sessionDirectories.set(id, session.directory)
      return session.directory
    }
  } catch {
    // fall back to the active project
  }
  return requireDirectory()
}

async function clientForSession(id: string): Promise<OpencodeClient> {
  return getClient(await sessionDirectory(id))
}

function commandOnPath(command: string): Promise<boolean> {
  const finder = process.platform === "win32" ? "where.exe" : "which"
  return new Promise((resolve) => {
    execFile(finder, [command], { windowsHide: true }, (error) => resolve(!error))
  })
}

function launchDetached(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false })
  child.on("error", (error) => log("terminal", `${command} failed: ${error.message}`))
  child.unref()
}

async function openProjectTerminal(directory: string): Promise<void> {
  const target = resolve(directory)
  if (!existsSync(target)) throw new Error("Project directory does not exist")
  if (process.platform === "win32") {
    if ((await commandOnPath("wt.exe")) || (await commandOnPath("wt"))) {
      launchDetached("wt.exe", ["-d", target])
      return
    }
    const shellCommand = (await commandOnPath("pwsh.exe"))
      ? "pwsh.exe"
      : (await commandOnPath("powershell.exe"))
        ? "powershell.exe"
        : ""
    if (shellCommand) {
      const escaped = target.replace(/'/g, "''")
      launchDetached(shellCommand, ["-NoLogo", "-NoExit", "-Command", `Set-Location -LiteralPath '${escaped}'`])
      return
    }
    launchDetached(process.env.ComSpec ?? "cmd.exe", ["/K", `cd /d "${target}"`])
    return
  }
  if (process.platform === "darwin") {
    launchDetached("open", ["-a", "Terminal", target])
    return
  }
  const candidates: Array<[string, string[]]> = [
    ["x-terminal-emulator", ["--working-directory", target]],
    ["gnome-terminal", ["--working-directory", target]],
    ["konsole", ["--workdir", target]],
    ["xfce4-terminal", ["--working-directory", target]],
  ]
  for (const [command, args] of candidates) {
    if (!(await commandOnPath(command))) continue
    launchDetached(command, args)
    return
  }
  launchDetached("xterm", ["-e", "sh", "-c", `cd "$1" && exec "\${SHELL:-sh}"`, "sh", target])
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const data = record.data
    if (data && typeof data === "object") {
      const message = (data as Record<string, unknown>).message
      if (typeof message === "string" && message) return message
    }
    if (typeof record.message === "string" && record.message) return record.message
    if (typeof record.name === "string" && record.name) return record.name
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

async function call<T>(result: Promise<unknown>): Promise<T> {
  const value = (await result) as { data?: T; error?: unknown }
  if (value && typeof value === "object" && value.error !== undefined && value.error !== null) {
    throw new Error(errorMessage(value.error))
  }
  return value?.data as T
}

function modelFromString(value: unknown): ModelRef | undefined {
  if (typeof value !== "string") return undefined
  const index = value.indexOf("/")
  if (index <= 0 || index >= value.length - 1) return undefined
  return { providerID: value.slice(0, index), modelID: value.slice(index + 1) }
}

interface RawModel {
  id?: string
  name?: string
  reasoning?: boolean
  attachment?: boolean
  tool_call?: boolean
  limit?: { context?: number; output?: number }
  cost?: { input?: number; output?: number }
}

interface RawProvider {
  id: string
  name: string
  source?: string
  env?: string[]
  models?: Record<string, RawModel>
}

interface RawProviderList {
  all: RawProvider[]
  default?: Record<string, string>
  connected: string[]
}

async function providerCatalog(): Promise<ProviderCatalog> {
  const client = clientFor()
  const list = await call<RawProviderList>(client.provider.list())
  const config = await call<Record<string, unknown>>(client.config.get())
  const connected = new Set(list.connected ?? [])
  const configured = new Set(Object.keys(asRecord(config.provider)))
  const disabled = new Set(Array.isArray(config.disabled_providers) ? (config.disabled_providers as string[]) : [])
  const all = list.all ?? []

  const providers = all
    .filter((provider) => (connected.has(provider.id) || configured.has(provider.id)) && !disabled.has(provider.id))
    .map((provider) => {
      const models: ModelInfo[] = Object.entries(provider.models ?? {}).map(([key, model]) => ({
        id: model.id ?? key,
        name: model.name ?? key,
        providerID: provider.id,
        reasoning: model.reasoning,
        attachment: model.attachment,
        toolCall: model.tool_call,
        contextLimit: model.limit?.context,
        outputLimit: model.limit?.output,
        cost:
          typeof model.cost?.input === "number" && typeof model.cost?.output === "number"
            ? { input: model.cost.input, output: model.cost.output }
            : undefined,
      }))
      models.sort((a, b) => a.name.localeCompare(b.name))
      return {
        id: provider.id,
        name: provider.name,
        source: provider.source,
        env: provider.env ?? [],
        connected: connected.has(provider.id),
        models,
      }
    })
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name))

  const project = getActiveProject()
  const remembered = project ? getSettings().lastModels[project.id] : undefined
  let defaultModel = modelFromString(config.model) ?? (remembered ? { ...remembered } : undefined)
  if (defaultModel && !providers.some((provider) => provider.id === defaultModel?.providerID)) {
    defaultModel = undefined
  }
  if (!defaultModel) {
    const first = providers.find((provider) => provider.models.length > 0)
    const model = first?.models[0]
    if (first && model) defaultModel = { providerID: first.id, modelID: model.id }
  }

  const available = all
    .map((provider) => ({ id: provider.id, name: provider.name, env: provider.env ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { providers, available, defaultModel, totalProviders: all.length }
}

async function mcpView(): Promise<McpViewData> {
  const client = clientFor()
  const project = getActiveProject()
  let statuses: Record<string, McpStatus> = {}
  try {
    statuses = await call<Record<string, McpStatus>>(client.mcp.status())
  } catch (error) {
    log("mcp", `status unavailable: ${(error as Error).message}`)
  }
  const effective = await call<Record<string, unknown>>(client.config.get()).catch(
    (): Record<string, unknown> => ({}),
  )
  const effectiveMcp = asRecord(effective.mcp)
  const byName = new Map<string, McpEntry>()
  for (const entry of await mcpRawEntries("global")) {
    byName.set(entry.name, {
      name: entry.name,
      scope: "global",
      config: entry.config as unknown as McpConfig,
      status: statuses[entry.name],
    })
  }
  if (project) {
    for (const entry of await mcpRawEntries("project")) {
      byName.set(entry.name, {
        name: entry.name,
        scope: "project",
        config: entry.config as unknown as McpConfig,
        status: statuses[entry.name],
      })
    }
  }
  for (const [name, raw] of Object.entries(effectiveMcp)) {
    if (byName.has(name)) continue
    byName.set(name, {
      name,
      scope: "inherited",
      config: asRecord(raw) as unknown as McpConfig,
      status: statuses[name],
    })
  }
  const paths = configPaths(project, getSettings().profile)
  return {
    entries: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    statuses,
    projectFile: paths.projectFile,
    globalFile: paths.globalFile,
  }
}

async function lspView(): Promise<LspViewData> {
  const client = clientFor()
  const project = getActiveProject()
  let statuses: LspViewData["statuses"] = []
  try {
    statuses = await call<LspViewData["statuses"]>(client.lsp.status())
  } catch (error) {
    log("lsp", `status unavailable: ${(error as Error).message}`)
  }
  const effective = await call<Record<string, unknown>>(client.config.get()).catch(
    (): Record<string, unknown> => ({}),
  )
  const globalRaw = await lspRawConfig("global")
  const projectRaw = project ? await lspRawConfig("project") : undefined
  const raw = projectRaw !== undefined ? projectRaw : globalRaw
  const enabled = raw === true || (!!raw && typeof raw === "object" && !Array.isArray(raw))
  const byName = new Map<string, LspEntry>()
  for (const entry of await lspRawEntries("global")) {
    byName.set(entry.name, { name: entry.name, scope: "global", config: entry.config as LspConfig })
  }
  if (project) {
    for (const entry of await lspRawEntries("project")) {
      byName.set(entry.name, { name: entry.name, scope: "project", config: entry.config as LspConfig })
    }
  }
  const effectiveLsp = effective.lsp
  if (effectiveLsp && typeof effectiveLsp === "object" && !Array.isArray(effectiveLsp)) {
    for (const [name, config] of Object.entries(effectiveLsp as Record<string, unknown>)) {
      if (byName.has(name)) continue
      byName.set(name, { name, scope: "inherited", config: asRecord(config) as LspConfig })
    }
  }
  const paths = configPaths(project, getSettings().profile)
  return {
    enabled,
    entries: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    statuses,
    projectFile: paths.projectFile,
    globalFile: paths.globalFile,
  }
}

async function applyConfigChange(): Promise<void> {
  try {
    await reloadInstance(getActiveProject()?.path ?? app.getPath("home"))
  } catch (error) {
    log("config", `reload failed: ${(error as Error).message}`)
  }
  broadcastState()
}

async function applyPluginChange(): Promise<void> {
  try {
    await restartBackend(false)
  } catch (error) {
    log("plugins", `backend restart failed: ${(error as Error).message}`)
  }
  broadcastState()
}

async function ollamaDetect(input?: string): Promise<OllamaInfo> {
  let baseUrl = input?.trim() || "http://127.0.0.1:11434"
  baseUrl = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "").replace(/\/api$/, "")
  try {
    const [tagsResponse, versionResponse] = await Promise.all([
      fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ])
    if (!tagsResponse.ok) {
      return { reachable: false, baseUrl, models: [], error: `HTTP ${tagsResponse.status}` }
    }
    const tags = (await tagsResponse.json()) as {
      models?: Array<{ name?: string; size?: number; details?: { parameter_size?: string; quantization_level?: string } }>
    }
    let version: string | undefined
    if (versionResponse?.ok) {
      const body = (await versionResponse.json()) as { version?: string }
      version = body.version
    }
    const models = (tags.models ?? [])
      .filter((model) => typeof model.name === "string")
      .map((model) => ({
        name: model.name as string,
        size: model.size,
        parameterSize: model.details?.parameter_size,
        quantization: model.details?.quantization_level,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { reachable: true, baseUrl, version, models }
  } catch (error) {
    return { reachable: false, baseUrl, models: [], error: (error as Error).message }
  }
}

async function runGitOperation(operation: (path: string) => string | Promise<string>) {
  const project = requireProject()
  try {
    const output = await operation(project.path)
    return { ok: true, output, info: await getGitInfoAsync() }
  } catch (error) {
    throw new Error(gitFailure(error))
  }
}

async function runConflictableGitOperation(operation: (path: string) => Promise<string>) {
  const project = requireProject()
  let output = ""
  let failure = ""
  try {
    output = await operation(project.path)
  } catch (error) {
    failure = gitFailure(error)
  }
  const info = await getGitInfoAsync()
  if ((info.conflicts?.length ?? 0) > 0 || info.operation) {
    return { ok: false, output: output || failure, info }
  }
  if (failure) throw new Error(failure)
  return { ok: true, output, info }
}

export const handlers: Record<RpcName, Handler> = {
  "app.state": () => buildAppState(),

  "app.updateSettings": async (patch: Partial<Settings>) => {
    const before = getSettings()
    const after = updateSettings(patch)
    if (before.profile !== after.profile) {
      log("app", `profile switched: ${before.profile} -> ${after.profile}`)
      await stopBackend()
      await ensureBackend(false)
    } else if (before.runtimeVersion !== after.runtimeVersion || before.autoDownload !== after.autoDownload) {
      await restartBackend(false)
    } else {
      broadcastState()
    }
    return buildAppState()
  },

  "app.restartBackend": async () => {
    await restartBackend(false)
    return buildAppState()
  },

  "app.reloadConfig": async () => reloadInstance(requireDirectory()),

  "app.pickProject": async () => {
    const result = await dialog.showOpenDialog({
      title: "Open project folder",
      properties: ["openDirectory", "createDirectory"],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  },

  "app.openPath": async (target: string) => {
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  },

  "app.showItem": (target: string) => {
    shell.showItemInFolder(target)
  },

  "app.openExternal": async (url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs can be opened")
    await shell.openExternal(url)
  },

  "app.openTerminal": (path?: string) => openProjectTerminal(path ?? requireDirectory()),

  "app.openCrashReports": async () => {
    const dir = crashReportsDir()
    await mkdir(dir, { recursive: true })
    const error = await shell.openPath(dir)
    if (error) throw new Error(error)
  },

  "app.logs": () => getLogs(),

  "app.updateStatus": () => getUpdateStatus(),

  "app.checkUpdates": () => checkForUpdates(),

  "app.downloadUpdate": () => downloadUpdate(),

  "app.installUpdate": () => installUpdate(),

  "app.clearLogs": () => {
    clearLogs()
    broadcastState()
  },

  "runtime.ensure": async (force?: boolean) => {
    const settings = getSettings()
    const status = await ensureRuntime(settings.runtimeVersion, settings.autoDownload, Boolean(force))
    if (status.state === "ready") {
      await restartBackend(false)
    } else {
      broadcastState()
    }
    return buildAppState()
  },

  "runtime.versions": () => listRuntimeVersions(),

  "project.add": async (inputPath: string) => {
    const path = resolve(inputPath)
    if (!existsSync(path)) throw new Error(`Folder does not exist: ${path}`)
    if (!(await stat(path)).isDirectory()) throw new Error(`Not a folder: ${path}`)
    const project = addProject(path)
    setActiveProject(project.id)
    setActiveDirectory(project.path)
    await ensureBackend(false).catch((error) => log("app", `backend after add project: ${(error as Error).message}`))
    setActiveDirectory(project.path)
    return broadcastState()
  },

  "project.remove": async (id: string) => {
    removeProject(id)
    const active = getActiveProject()
    setActiveDirectory(active?.path ?? null)
    return broadcastState()
  },

  "project.activate": async (id: string) => {
    setActiveProject(id)
    const project = getActiveProject()
    setActiveDirectory(project?.path ?? null)
    await ensureBackend(false).catch((error) => log("app", `backend after activate: ${(error as Error).message}`))
    setActiveDirectory(project?.path ?? null)
    return broadcastState()
  },

  "project.rename": (id: string, name: string) => {
    renameProject(id, name)
    return broadcastState()
  },

  "provider.catalog": () => providerCatalog(),

  "provider.agents": async () => {
    const agents = await call<Agent[]>(clientFor().app.agents())
    return (agents ?? []).map<AgentInfo>((agent) => ({
      name: agent.name,
      description: agent.description,
      mode: agent.mode,
      builtin: agent.builtIn,
      model: agent.model,
    }))
  },

  "provider.authMethods": () => call<Record<string, ProviderAuthMethod[]>>(clientFor().provider.auth()),

  "provider.setApiKey": async (id: string, key: string) => {
    const result = await call<boolean>(clientFor().auth.set({ path: { id }, body: { type: "api", key } }))
    await applyConfigChange()
    return result === true
  },

  "provider.oauthAuthorize": async (id: string, method: number) => {
    const result = await call<ProviderOAuthStart>(
      clientFor().provider.oauth.authorize({ path: { id }, body: { method } }),
    )
    if (result?.url) await shell.openExternal(result.url)
    return result
  },

  "provider.oauthCallback": async (id: string, method: number, code?: string) => {
    const result = await call<boolean>(
      clientFor().provider.oauth.callback({ path: { id }, body: { method, code } }),
    )
    await applyConfigChange()
    return result === true
  },

  "provider.ollamaDetect": (baseUrl?: string) => ollamaDetect(baseUrl),

  "provider.ollamaInstall": async (scope: ConfigScope, baseUrl: string, models: string[]) => {
    const result = await installOllamaProvider(scope, baseUrl, models)
    await applyConfigChange()
    return result
  },

  "session.list": async () => {
    const project = requireProject()
    const directories = new Set<string>([project.path])
    for (const info of getWorktrees(project.id)) {
      if (info.path) directories.add(info.path)
    }
    const results = await Promise.allSettled(
      [...directories].map((directory) => call<Session[]>(getClient(directory).session.list())),
    )
    const byId = new Map<string, Session>()
    for (const result of results) {
      if (result.status !== "fulfilled") continue
      for (const session of result.value ?? []) byId.set(session.id, session)
    }
    const list = [...byId.values()].sort((a, b) => b.time.updated - a.time.updated)
    for (const session of list) rememberSessionDirectory(session)
    return list
  },

  "session.create": async (title?: string) => {
    const project = requireProject()
    const useWorktree = getSettings().sessionWorktrees !== false
    const created = useWorktree ? await createSessionWorktree(project) : null
    const client = created ? getClient(created.path) : clientFor()
    try {
      const session = await call<Session>(client.session.create({ body: { title: title || "New chat" } }))
      rememberSessionDirectory(session)
      if (created) recordCreatedWorktree(project, session.id, created)
      return session
    } catch (error) {
      if (created) {
        try {
          await runGitAsync(project.path, ["worktree", "remove", "--force", created.path], 60_000)
          await runGitAsync(project.path, ["worktree", "prune"], 30_000)
          await runGitAsync(project.path, ["branch", "-D", created.branch], 30_000)
        } catch {
          // ignore cleanup failure
        }
      }
      throw error
    }
  },

  "session.focus": async (id: string) => {
    const directory = await sessionDirectory(id)
    setActiveDirectory(directory)
    return directory
  },

  "session.delete": async (id: string) => {
    const client = await clientForSession(id)
    return call<boolean>(client.session.delete({ path: { id } }))
  },

  "session.deleteTree": async (id: string) => {
    const project = requireProject()
    const client = await clientForSession(id)
    const sessions = (await call<Session[]>(client.session.list())) ?? []
    const children = new Map<string, string[]>()
    for (const session of sessions) {
      if (!session.parentID) continue
      const list = children.get(session.parentID) ?? []
      list.push(session.id)
      children.set(session.parentID, list)
    }
    const ids: string[] = []
    const visit = (sessionId: string) => {
      ids.push(sessionId)
      for (const child of children.get(sessionId) ?? []) visit(child)
    }
    visit(id)
    for (const sessionId of ids.reverse()) {
      await call<boolean>(client.session.delete({ path: { id: sessionId } }))
      sessionDirectories.delete(sessionId)
    }
    if (getWorktree(id)) await removeSessionWorktree(project, id)
    return true
  },

  "session.update": async (id: string, title: string) => {
    const client = await clientForSession(id)
    const updated = await call<Session>(client.session.update({ path: { id }, body: { title } }))
    rememberSessionDirectory(updated)
    return updated
  },

  "session.revert": async (id: string, messageID: string) =>
    call<Session>((await clientForSession(id)).session.revert({ path: { id }, body: { messageID } })),

  "session.unrevert": async (id: string) => call<Session>((await clientForSession(id)).session.unrevert({ path: { id } })),

  "session.messages": async (id: string) => {
    const client = await clientForSession(id)
    const messages = await call<Array<{ info: Message; parts: Part[] }>>(
      client.session.messages({ path: { id }, query: { limit: 300 } }),
    )
    return (messages ?? []).map<SessionEntry>((entry) => ({ info: entry.info, parts: entry.parts ?? [] }))
  },

  "session.diff": async (id: string) => {
    const client = await clientForSession(id)
    let messages: Array<{ info: Message; parts: Part[] }> = []
    try {
      messages = await call<Array<{ info: Message; parts: Part[] }>>(
        client.session.messages({ path: { id }, query: { limit: 200 } }),
      )
    } catch {
      messages = []
    }
    const userMessages = (messages ?? []).filter((entry) => entry.info.role === "user").slice(-8)
    if (userMessages.length === 0) {
      return call<FileDiff[]>(client.session.diff({ path: { id } }))
    }
    const diffs = await Promise.all(
      userMessages.map((entry) =>
        call<FileDiff[]>(client.session.diff({ path: { id }, query: { messageID: entry.info.id } })).catch(
          () => [] as FileDiff[],
        ),
      ),
    )
    const merged = new Map<string, FileDiff>()
    const order: string[] = []
    for (const diff of diffs) {
      for (const file of diff ?? []) {
        if (!merged.has(file.file)) order.push(file.file)
        merged.set(file.file, file)
      }
    }
    const project = requireProject()
    const rows = await Promise.all(
      order.map(async (file) => {
        const value = merged.get(file)
        if (!value) return null
        if (value.before || value.after) return value
        return { ...value, ...(await readGitFileDiff(project.path, file)) }
      }),
    )
    return rows.filter((row): row is FileDiff => row !== null)
  },

  "session.usage": async (ids: string[]) => {
    const result: Record<string, SessionUsage> = {}
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        const empty: SessionUsage = {
          sessionID: id,
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
          messages: 0,
          completed: false,
        }
        try {
          const client = await clientForSession(id)
          const messages = await call<Array<{ info: Message; parts: Part[] }>>(
            client.session.messages({ path: { id } }),
          )
          const usage: SessionUsage = { ...empty, tokens: { ...empty.tokens } }
          for (const entry of messages ?? []) {
            const info = entry.info
            if (info.role !== "assistant") continue
            usage.cost += info.cost ?? 0
            usage.tokens.input += info.tokens?.input ?? 0
            usage.tokens.output += info.tokens?.output ?? 0
            usage.tokens.reasoning += info.tokens?.reasoning ?? 0
            usage.tokens.cacheRead += info.tokens?.cache?.read ?? 0
            usage.tokens.cacheWrite += info.tokens?.cache?.write ?? 0
            if (info.mode) usage.agent = info.mode
            if (info.providerID && info.modelID) {
              usage.model = { providerID: info.providerID, modelID: info.modelID }
            }
            usage.completed = Boolean(info.time.completed)
          }
          usage.messages = messages?.length ?? 0
          result[id] = usage
        } catch (error) {
          log("session", `usage for ${id} failed: ${(error as Error).message}`)
          result[id] = empty
        }
      }),
    )
    return result
  },

  "session.abort": async (id: string) => call<boolean>((await clientForSession(id)).session.abort({ path: { id } })),

  "session.status": async () => {
    const project = requireProject()
    const directories = new Set<string>([project.path])
    for (const info of getWorktrees(project.id)) {
      if (info.path) directories.add(info.path)
    }
    const results = await Promise.allSettled(
      [...directories].map((directory) => call<Record<string, SessionStatus>>(getClient(directory).session.status())),
    )
    const statuses: Record<string, SessionStatus> = {}
    for (const result of results) {
      if (result.status === "fulfilled") Object.assign(statuses, result.value)
    }
    return statuses
  },

  "worktree.list": () => listWorktreeViewAsync(requireProject()),

  "worktree.merge": async (sessionId: string) => {
    const project = requireProject()
    return mergeSessionWorktree(project, sessionId)
  },

  "worktree.remove": async (sessionId: string) => {
    const project = requireProject()
    await removeSessionWorktree(project, sessionId)
    return listWorktreeViewAsync(project)
  },

  "chat.send": async (input: ChatInput) => {
    if (!input.text?.trim()) throw new Error("Message is empty")
    const project = requireProject()
    const body: Record<string, unknown> = {
      parts: [{ type: "text", text: input.text }],
    }
    if (input.providerID && input.modelID) {
      body.model = { providerID: input.providerID, modelID: input.modelID }
      rememberModel(project.id, input.providerID, input.modelID)
    }
    if (input.agent) {
      body.agent = input.agent
      rememberAgent(project.id, input.agent)
    }
    const client = await clientForSession(input.sessionId)
    await call<unknown>(
      client.session.promptAsync({ path: { id: input.sessionId }, body: body as never }),
    )
  },

  "chat.command": async (input: CommandInput) => {
    const project = requireProject()
    const body: Record<string, unknown> = {
      command: input.command,
      arguments: input.arguments,
    }
    if (input.providerID && input.modelID) {
      body.model = { providerID: input.providerID, modelID: input.modelID }
      rememberModel(project.id, input.providerID, input.modelID)
    }
    if (input.agent) body.agent = input.agent
    const client = await clientForSession(input.sessionId)
    await call<unknown>(
      client.session.command({ path: { id: input.sessionId }, body: body as never }),
    )
  },

  "command.list": () => call<Command[]>(clientFor().command.list()),

  "permission.reply": async (input: PermissionReply) => {
    const client = await clientForSession(input.sessionId)
    const result = await call<boolean>(
      client.postSessionIdPermissionsPermissionId({
        path: { id: input.sessionId, permissionID: input.permissionId },
        body: { response: input.response },
      }),
    )
    return result === true
  },

  "file.list": async (path: string) => {
    const nodes = await call<Array<{ name: string; path: string; absolute: string; type: "file" | "directory"; ignored: boolean }>>(
      clientFor().file.list({ query: { path } }),
    )
    return (nodes ?? []).map<FileNodeInfo>((node) => ({
      name: node.name,
      path: node.path,
      absolute: node.absolute,
      type: node.type,
      ignored: node.ignored,
    }))
  },

  "file.read": async (path: string) => {
    const data = await call<{ type: "text" | "binary"; content: string; mimeType?: string }>(
      clientFor().file.read({ query: { path } }),
    )
    const max = 600_000
    const truncated = data.content.length > max
    const result: FileContentInfo = {
      path,
      absolute: resolve(requireDirectory(), path),
      type: data.type,
      content: data.type === "text" ? data.content.slice(0, max) : "",
      truncated,
      mimeType: data.mimeType,
    }
    return result
  },

  "file.write": async (path: string, content: string) => {
    const project = requireProject()
    const root = resolve(project.path)
    const absolute = resolve(root, path)
    const rel = relative(root, absolute)
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Cannot write outside the project directory")
    await writeFile(absolute, content, "utf8")
  },

  "file.find": async (query: string) => {
    return call<string[]>(clientFor().find.files({ query: { query } }))
  },

  "git.info": () => getGitInfoAsync(),

  "git.environment": () => detectGitAsync(false),

  "git.install": () => installGit(),

  "git.init": async () => runGitOperation((path) => gitInit(path)),

  "git.graph": async (limit?: number) => {
    const project = requireProject()
    return gitGraphAsync(project.path, limit)
  },

  "git.commitDetail": async (hash: string) => {
    const project = requireProject()
    return gitCommitDetailAsync(project.path, hash)
  },

  "git.branches": async () => {
    const project = requireProject()
    return gitBranchesAsync(project.path)
  },

  "git.remotes": async () => {
    const project = requireProject()
    return gitRemotesAsync(project.path)
  },

  "git.fetch": () => runGitOperation((path) => gitFetch(path)),

  "git.pull": () => runGitOperation((path) => gitPull(path)),

  "git.push": () => runGitOperation((path) => gitPush(path)),

  "git.checkout": (branch: string) => runGitOperation((path) => gitCheckout(path, branch)),

  "git.createBranch": (name: string) => runGitOperation((path) => gitCreateBranch(path, name)),

  "git.merge": (branch: string) => runConflictableGitOperation((path) => gitMerge(path, branch)),

  "git.rebase": (branch: string) => runConflictableGitOperation((path) => gitRebase(path, branch)),

  "git.abort": () => runGitOperation((path) => gitAbort(path)),

  "git.continue": () => runConflictableGitOperation((path) => gitContinue(path)),

  "git.stash": (message?: string) => runGitOperation((path) => gitStash(path, message)),

  "git.stashPop": () => runGitOperation((path) => gitStashPop(path)),

  "git.tag": (name: string) => runGitOperation((path) => gitTag(path, name)),

  "git.deleteBranch": (name: string) => runGitOperation((path) => gitDeleteBranch(path, name)),

  "git.stage": async (paths: string[]) => {
    const project = requireProject()
    const normalized = paths.filter(Boolean).map((path) => path.replace(/\\/g, "/"))
    if (normalized.length > 0) {
      try {
        await runGitAsync(project.path, ["add", "--", ...normalized], 60_000)
      } catch (error) {
        throw new Error(gitFailure(error))
      }
    }
    return getGitInfoAsync()
  },

  "git.unstage": async (paths: string[]) => {
    const project = requireProject()
    const normalized = paths.filter(Boolean).map((path) => path.replace(/\\/g, "/"))
    if (normalized.length > 0) {
      try {
        await runGitAsync(project.path, ["restore", "--staged", "--", ...normalized], 60_000)
      } catch {
        try {
          await runGitAsync(project.path, ["reset", "-q", "HEAD", "--", ...normalized], 60_000)
        } catch {
          try {
            await runGitAsync(project.path, ["rm", "--cached", "-r", "--", ...normalized], 60_000)
          } catch (error) {
            throw new Error(gitFailure(error))
          }
        }
      }
    }
    return getGitInfoAsync()
  },

  "git.commit": async (message: string) => {
    const project = requireProject()
    const trimmed = message.trim()
    if (!trimmed) throw new Error("Commit message is required")
    try {
      const output = await runGitAsync(project.path, ["commit", "-m", trimmed], 120_000)
      return { ok: true, info: await getGitInfoAsync(), output }
    } catch (error) {
      throw new Error(gitFailure(error))
    }
  },

  "git.diff": (path: string, staged: boolean) => gitDiffContentAsync(path, staged),

  "config.read": (scope: ConfigScope) => readRawConfig(scope),

  "config.write": async (scope: ConfigScope, content: string) => {
    const result = await writeRawConfig(scope, content)
    await applyConfigChange()
    if (scope === "project") {
      const project = getActiveProject()
      if (project) await syncWorktreeConfigs(project)
    }
    return result
  },

  "config.patch": async (scope: ConfigScope, path: (string | number)[], value: unknown) => {
    const result = await patchConfig(scope, path, value)
    await applyConfigChange()
    if (scope === "project") {
      const project = getActiveProject()
      if (project) await syncWorktreeConfigs(project)
    }
    return result
  },

  "config.remove": async (scope: ConfigScope, path: (string | number)[]) => {
    const result = await removeConfigPath(scope, path)
    await applyConfigChange()
    if (scope === "project") {
      const project = getActiveProject()
      if (project) await syncWorktreeConfigs(project)
    }
    return result
  },

  "config.effective": () => call<Record<string, unknown>>(clientFor().config.get()),

  "config.paths": () => configPaths(getActiveProject(), getSettings().profile),

  "market.mcp": async (force?: boolean): Promise<McpRegistryMarket> => {
    try {
      return await fetchMcpRegistry(force)
    } catch (error) {
      return { entries: [], fetchedAt: Date.now(), source: "", errors: [(error as Error).message] }
    }
  },

  "market.lsp": async (force?: boolean): Promise<LspRegistryMarket> => {
    try {
      return await fetchLspRegistry(force)
    } catch (error) {
      return { entries: [], fetchedAt: Date.now(), source: "", errors: [(error as Error).message] }
    }
  },

  "mcp.view": () => mcpView(),

  "mcp.save": async (scope: ConfigScope, name: string, config: McpConfig) => {
    const serverName = name.trim()
    if (!serverName) throw new Error("MCP server name is required")
    await patchConfig(scope, ["mcp", serverName], config)
    await applyConfigChange()
    return mcpView()
  },

  "mcp.remove": async (scope: ConfigScope, name: string) => {
    await removeConfigPath(scope, ["mcp", name])
    await applyConfigChange()
    return mcpView()
  },

  "mcp.toggle": async (scope: ConfigScope, name: string, enabled: boolean) => {
    await patchConfig(scope, ["mcp", name, "enabled"], enabled)
    await applyConfigChange()
    return mcpView()
  },

  "mcp.connect": (name: string) => call<boolean>(clientFor().mcp.connect({ path: { name } })),

  "mcp.disconnect": (name: string) => call<boolean>(clientFor().mcp.disconnect({ path: { name } })),

  "mcp.authStart": async (name: string) => {
    const result = await call<{ authorizationUrl: string }>(
      clientFor().mcp.auth.start({ path: { name } }),
    )
    if (result?.authorizationUrl) await shell.openExternal(result.authorizationUrl)
    const start: McpAuthStart = {
      url: result?.authorizationUrl ?? "",
      instructions: "Complete authorization in your browser, then return here.",
    }
    return start
  },

  "mcp.authCallback": async (name: string, code?: string) => {
    const result = await call<boolean>(
      clientFor().mcp.auth.callback({ path: { name }, body: { code: code ?? "" } }),
    )
    return result === true
  },

  "mcp.authRemove": (name: string) => call<boolean>(clientFor().mcp.auth.remove({ path: { name } })),

  "lsp.view": () => lspView(),

  "lsp.setEnabled": async (scope: ConfigScope, enabled: boolean) => {
    await patchConfig(scope, ["lsp"], Boolean(enabled))
    await applyConfigChange()
    return lspView()
  },

  "lsp.save": async (scope: ConfigScope, name: string, config: LspConfig) => {
    const serverName = name.trim()
    if (!serverName) throw new Error("LSP server name is required")
    if ((await readRawConfig(scope)).parsed.lsp === true) {
      await patchConfig(scope, ["lsp"], {})
    }
    await patchConfig(scope, ["lsp", serverName], config)
    await applyConfigChange()
    return lspView()
  },

  "lsp.remove": async (scope: ConfigScope, name: string) => {
    const raw = (await readRawConfig(scope)).parsed.lsp
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      await removeConfigPath(scope, ["lsp", name])
      await applyConfigChange()
    }
    return lspView()
  },

  "lsp.toggle": async (scope: ConfigScope, name: string, disabled: boolean) => {
    const raw = (await readRawConfig(scope)).parsed.lsp
    if (raw === true) {
      await patchConfig(scope, ["lsp"], {})
    }
    const normalized = (await readRawConfig(scope)).parsed.lsp
    const entries =
      normalized && typeof normalized === "object" && !Array.isArray(normalized)
        ? (normalized as Record<string, unknown>)
        : {}
    if (!disabled && !(name in entries)) {
      return lspView()
    }
    await patchConfig(scope, ["lsp", name, "disabled"], Boolean(disabled))
    await applyConfigChange()
    return lspView()
  },

  "plugin.view": () => pluginView(),

  "plugin.add": async (scope: ConfigScope, name: string) => {
    await addNpmPlugin(scope, name)
    await applyPluginChange()
    return pluginView()
  },

  "plugin.remove": async (scope: ConfigScope, name: string) => {
    await removeNpmPlugin(scope, name)
    await applyPluginChange()
    return pluginView()
  },

  "plugin.setLocalEnabled": async (scope: ConfigScope, fileName: string, enabled: boolean) => {
    await setLocalPluginEnabled(scope, fileName, Boolean(enabled))
    await applyPluginChange()
    return pluginView()
  },

  "plugin.openFolder": async (scope: ConfigScope) => {
    const dir = scope === "project" ? projectPluginsDir(requireProject()) : globalPluginsDir(getSettings().profile)
    await mkdir(dir, { recursive: true })
    const error = await shell.openPath(dir)
    if (error) throw new Error(error)
  },

  "plugin.createLocal": async (scope: ConfigScope, fileName: string, content: string) => {
    await createLocalPlugin(scope, fileName, content)
    await applyPluginChange()
    return pluginView()
  },
}

export async function dispatch(method: string, args: unknown[]): Promise<unknown> {
  const handler = (handlers as Record<string, Handler | undefined>)[method]
  if (!handler) throw new Error(`Unknown RPC method: ${method}`)
  return await handler(...(args as never[]))
}
