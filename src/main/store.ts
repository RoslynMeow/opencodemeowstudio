import { app, safeStorage } from "electron"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { log } from "./logger"
import { displayProjectName } from "./paths"
import { DEFAULT_RUNTIME_VERSION, type Project, type Settings, type MergeInfo, type MarketSource, type WorktreeInfo } from "@shared/types"

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

interface PersistedState {
  settings: Settings
  projects: Project[]
  activeProjectId: string | null
  window?: WindowState
  worktrees: WorktreeInfo[]
  merges: MergeInfo[]
  marketSecrets: Record<string, string>
}

let state: PersistedState | null = null
let stateFile = ""

let encryptionWarned = false

function encodeMarketHeaders(headers: Record<string, string>): string {
  const value = JSON.stringify(headers)
  try {
    if (safeStorage.isEncryptionAvailable()) return `enc:${safeStorage.encryptString(value).toString("base64")}`
  } catch (error) {
    log("store", `market header encryption failed: ${(error as Error).message}`)
  }
  if (!encryptionWarned) {
    encryptionWarned = true
    log("store", "safeStorage is unavailable; market headers are only base64 encoded")
  }
  return `b64:${Buffer.from(value, "utf8").toString("base64")}`
}

function decodeMarketHeaders(value: string): Record<string, string> | undefined {
  try {
    if (value.startsWith("enc:")) {
      const json = safeStorage.decryptString(Buffer.from(value.slice(4), "base64"))
      return JSON.parse(json) as Record<string, string>
    }
    if (value.startsWith("b64:")) {
      return JSON.parse(Buffer.from(value.slice(4), "base64").toString("utf8")) as Record<string, string>
    }
  } catch (error) {
    log("store", `market header decryption failed: ${(error as Error).message}`)
  }
  return undefined
}

function sourceWithoutHeaders(source: MarketSource): MarketSource {
  const { headers: _headers, ...rest } = source
  return rest
}

function hydrateSources(sources: MarketSource[], secrets: Record<string, string>): MarketSource[] {
  return sources.map((source) => {
    const secret = secrets[source.id]
    const headers = secret ? decodeMarketHeaders(secret) : undefined
    return headers ? { ...sourceWithoutHeaders(source), headers } : sourceWithoutHeaders(source)
  })
}

const defaultSettings: Settings = {
  profile: "global",
  runtimeVersion: DEFAULT_RUNTIME_VERSION,
  autoDownload: true,
  theme: "dark",
  language: "system",
  layoutMode: "pages",
  sidebarWidth: 200,
  enabledModules: [],
  sessionWorktrees: true,
  singleWriterLock: true,
  marketSources: {
    mcp: [
      { id: "official", label: "Official MCP Registry", kind: "mcp-registry", url: "https://registry.modelcontextprotocol.io/v0.1/servers", enabled: true, priority: 0 },
    ],
    lsp: [
      { id: "mason", label: "Mason Registry", kind: "mason-github", url: "mason-org/mason-registry", enabled: true, priority: 0 },
    ],
  },
  lastModels: {},
  lastAgents: {},
}

export function initStore(): void {
  stateFile = join(app.getPath("userData"), "studio-state.json")
  let loaded: Partial<PersistedState> = {}
  try {
    if (existsSync(stateFile)) {
      loaded = JSON.parse(readFileSync(stateFile, "utf8")) as Partial<PersistedState>
    }
  } catch (error) {
    log("store", `failed to read state: ${(error as Error).message}`)
  }
  const settings = { ...defaultSettings, ...(loaded.settings ?? {}) }
  settings.marketSources = {
    mcp: loaded.settings?.marketSources?.mcp ?? defaultSettings.marketSources.mcp,
    lsp: loaded.settings?.marketSources?.lsp ?? defaultSettings.marketSources.lsp,
  }
  const marketSecrets = { ...(loaded.marketSecrets ?? {}) }
  let migrated = false
  for (const market of ["mcp", "lsp"] as const) {
    settings.marketSources[market] = settings.marketSources[market].map((source) => {
      if (source.headers && Object.keys(source.headers).length > 0) {
        marketSecrets[source.id] = encodeMarketHeaders(source.headers)
        migrated = true
      }
      return sourceWithoutHeaders(source)
    })
  }
  const next: PersistedState = {
    settings,
    projects: Array.isArray(loaded.projects) ? loaded.projects : [],
    activeProjectId: loaded.activeProjectId ?? null,
    window: loaded.window,
    worktrees: Array.isArray(loaded.worktrees) ? loaded.worktrees : [],
    merges: Array.isArray(loaded.merges) ? loaded.merges : [],
    marketSecrets,
  }
  if (next.activeProjectId && !next.projects.some((project) => project.id === next.activeProjectId)) {
    next.activeProjectId = next.projects[0]?.id ?? null
  }
  state = next
  if (migrated) saveStore()
  log("store", `loaded ${next.projects.length} project(s) from ${stateFile}`)
}

function ensureState(): PersistedState {
  if (!state) initStore()
  return state as PersistedState
}

export function saveStore(): void {
  const current = ensureState()
  try {
    mkdirSync(dirname(stateFile), { recursive: true })
    const temp = `${stateFile}.tmp`
    writeFileSync(temp, JSON.stringify(current, null, 2), "utf8")
    renameSync(temp, stateFile)
  } catch (error) {
    log("store", `failed to save state: ${(error as Error).message}`)
  }
}

export function getSettings(): Settings {
  const current = ensureState()
  return {
    ...current.settings,
    marketSources: {
      mcp: hydrateSources(current.settings.marketSources.mcp, current.marketSecrets),
      lsp: hydrateSources(current.settings.marketSources.lsp, current.marketSecrets),
    },
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = ensureState()
  const marketSources = patch.marketSources
  let cleanSources = current.settings.marketSources
  if (marketSources) {
    const secrets = { ...current.marketSecrets }
    const clean = { mcp: [] as MarketSource[], lsp: [] as MarketSource[] }
    const activeIds = new Set<string>()
    for (const market of ["mcp", "lsp"] as const) {
      for (const source of marketSources[market]) {
        activeIds.add(source.id)
        if (source.headers && Object.keys(source.headers).length > 0) {
          secrets[source.id] = encodeMarketHeaders(source.headers)
        } else {
          delete secrets[source.id]
        }
        clean[market].push(sourceWithoutHeaders(source))
      }
    }
    for (const key of Object.keys(secrets)) {
      if (!activeIds.has(key)) delete secrets[key]
    }
    current.marketSecrets = secrets
    cleanSources = clean
  }
  current.settings = {
    ...current.settings,
    ...patch,
    marketSources: cleanSources,
    lastModels: { ...current.settings.lastModels, ...(patch.lastModels ?? {}) },
    lastAgents: { ...current.settings.lastAgents, ...(patch.lastAgents ?? {}) },
  }
  saveStore()
  return getSettings()
}

export function getProjects(): Project[] {
  return [...ensureState().projects]
}

export function getActiveProject(): Project | null {
  const current = ensureState()
  return current.projects.find((project) => project.id === current.activeProjectId) ?? null
}

export function getActiveProjectId(): string | null {
  return ensureState().activeProjectId
}

export function setActiveProject(id: string | null): void {
  const current = ensureState()
  if (id && !current.projects.some((project) => project.id === id)) return
  current.activeProjectId = id
  if (id) {
    const project = current.projects.find((candidate) => candidate.id === id)
    if (project) project.lastOpenedAt = Date.now()
    current.settings.lastProjectId = id
  }
  saveStore()
}

export function addProject(inputPath: string): Project {
  const current = ensureState()
  const path = resolve(inputPath)
  const existing = current.projects.find((project) => samePath(project.path, path))
  if (existing) return existing
  const project: Project = {
    id: randomUUID(),
    name: displayProjectName(path),
    path,
    addedAt: Date.now(),
  }
  current.projects.push(project)
  if (!current.activeProjectId) current.activeProjectId = project.id
  current.settings.lastProjectId = current.activeProjectId ?? undefined
  saveStore()
  log("store", `added project ${project.name} (${project.path})`)
  return project
}

export function removeProject(id: string): void {
  const current = ensureState()
  const project = current.projects.find((candidate) => candidate.id === id)
  current.projects = current.projects.filter((candidate) => candidate.id !== id)
  delete current.settings.lastModels[id]
  delete current.settings.lastAgents[id]
  if (current.activeProjectId === id) {
    current.activeProjectId = current.projects[0]?.id ?? null
  }
  saveStore()
  if (project) log("store", `removed project ${project.name}`)
}

export function renameProject(id: string, name: string): void {
  const current = ensureState()
  const project = current.projects.find((candidate) => candidate.id === id)
  if (!project) return
  const trimmed = name.trim()
  if (trimmed) project.name = trimmed
  saveStore()
}

export function rememberModel(projectId: string, providerID: string, modelID: string): void {
  const current = ensureState()
  current.settings.lastModels[projectId] = { providerID, modelID }
  current.settings.lastProjectId = current.activeProjectId ?? undefined
  saveStore()
}

export function rememberAgent(projectId: string, agent: string): void {
  const current = ensureState()
  current.settings.lastAgents[projectId] = agent
  saveStore()
}

export function getWindowState(): WindowState | undefined {
  return ensureState().window
}

export function saveWindowState(window: WindowState): void {
  const current = ensureState()
  current.window = window
  saveStore()
}

export function getWorktrees(projectId?: string): WorktreeInfo[] {
  const items = ensureState().worktrees
  return projectId ? items.filter((item) => item.projectId === projectId) : [...items]
}

export function getWorktree(sessionId: string): WorktreeInfo | null {
  return ensureState().worktrees.find((item) => item.sessionId === sessionId) ?? null
}

export function upsertWorktree(info: WorktreeInfo): WorktreeInfo {
  const current = ensureState()
  const index = current.worktrees.findIndex((item) => item.sessionId === info.sessionId)
  if (index === -1) current.worktrees.push(info)
  else current.worktrees[index] = info
  saveStore()
  return info
}

export function removeWorktreeRecord(sessionId: string): void {
  const current = ensureState()
  current.worktrees = current.worktrees.filter((item) => item.sessionId !== sessionId)
  saveStore()
}

export function getMerges(projectId?: string): MergeInfo[] {
  const items = ensureState().merges
  return projectId ? items.filter((item) => item.projectId === projectId) : [...items]
}

export function upsertMerge(info: MergeInfo): MergeInfo {
  const current = ensureState()
  const index = current.merges.findIndex((item) => item.id === info.id)
  if (index === -1) current.merges.push(info)
  else current.merges[index] = info
  saveStore()
  return info
}

function samePath(a: string, b: string): boolean {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase()
  return a === b
}
