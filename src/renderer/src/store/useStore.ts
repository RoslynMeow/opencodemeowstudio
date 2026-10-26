import { create } from "zustand"
import type {
  AgentInfo,
  AppState,
  Command,
  ConfigScope,
  FileDiff,
  McpViewData,
  MergeInfo,
  ModelRef,
  Part,
  Permission,
  ProviderCatalog,
  Session,
  SessionEntry,
  SessionStatus,
  SessionUsage,
  Settings,
  StudioEvent,
  UpdateStatus,
  WorktreeInfo,
  WorktreeMergeResult,
} from "@shared/types"
import { formatError, rpc } from "../lib/rpc"
import { tr } from "../i18n"

export type ViewName = "chat" | "sessions" | "files" | "git" | "projects" | "models" | "mcp" | "lsp" | "plugins" | "settings"

const VIEW_STORAGE_KEY = "meowstudio:view"
const VIEW_NAMES: ViewName[] = ["chat", "sessions", "files", "git", "projects", "models", "mcp", "lsp", "plugins", "settings"]

function sessionStorageKey(projectId: string): string {
  return `meowstudio:lastSession:${projectId}`
}

function isViewName(value: string | null): value is ViewName {
  return value !== null && (VIEW_NAMES as string[]).includes(value)
}

export interface ToastItem {
  id: string
  level: "info" | "success" | "error"
  message: string
}

interface StudioStore {
  state: AppState | null
  view: ViewName
  sessions: Session[]
  activeSessionId: string | null
  sessionStatuses: Record<string, SessionStatus>
  sessionErrors: Record<string, string>
  usage: Record<string, SessionUsage>
  treeVersion: number
  worktrees: WorktreeInfo[]
  merges: MergeInfo[]
  mainBranch: string | null
  messages: SessionEntry[]
  loadingMessages: boolean
  busy: boolean
  retryMessage: string | null
  permissions: Permission[]
  providers: ProviderCatalog | null
  agents: AgentInfo[]
  commands: Command[]
  selectedModels: Record<string, ModelRef>
  selectedAgents: Record<string, string>
  sessionAgents: Record<string, string>
  optimisticUser: string | null
  toasts: ToastItem[]
  logs: string[]
  diff: FileDiff[]
  diffOpen: boolean
  diffLoading: boolean
  mcp: McpViewData | null
  update: UpdateStatus | null
  ready: boolean

  init: () => Promise<void>
  handleEvent: (event: StudioEvent) => void
  applyState: (next: AppState) => void
  setView: (view: ViewName) => void
  addToast: (level: ToastItem["level"], message: string) => void
  dismissToast: (id: string) => void
  refreshAll: () => Promise<void>
  refreshSessions: () => Promise<void>
  refreshProviders: () => Promise<void>
  refreshCommands: () => Promise<void>
  openSession: (id: string) => Promise<void>
  newSession: () => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  revertSession: (messageID: string) => Promise<boolean>
  unrevertSession: () => Promise<boolean>
  refreshUsage: (ids: string[]) => Promise<void>
  refreshWorktrees: () => Promise<void>
  mergeSessionWorktree: (sessionId: string) => Promise<WorktreeMergeResult | null>
  removeSessionWorktree: (sessionId: string) => Promise<void>
  syncMessages: () => Promise<void>
  reconcileActive: () => Promise<void>
  send: (text: string) => Promise<boolean>
  abort: () => Promise<void>
  respondPermission: (permission: Permission, response: "once" | "always" | "reject") => Promise<void>
  setModel: (ref: ModelRef) => void
  setAgent: (agent: string) => void
  setSessionAgent: (sessionId: string, agent: string | null) => void
  activateProject: (id: string) => Promise<void>
  pickAndAddProject: () => Promise<void>
  addProjectPath: (path: string) => Promise<void>
  removeProject: (id: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  restartBackend: () => Promise<void>
  ensureRuntime: (force?: boolean) => Promise<void>
  showDiff: () => Promise<void>
  closeDiff: () => void
  loadMcp: () => Promise<void>
  refreshLogs: () => Promise<void>
  refreshUpdate: () => Promise<void>
  checkUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
}

function sameDirectory(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
  return normalize(a) === normalize(b)
}

function applyTheme(theme: Settings["theme"]): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const dark = theme === "dark" || (theme === "system" && prefersDark)
  document.documentElement.dataset.theme = dark ? "dark" : "light"
}

function upsertMessage(messages: SessionEntry[], info: SessionEntry["info"]): SessionEntry[] {
  const index = messages.findIndex((entry) => entry.info.id === info.id)
  if (index === -1) return [...messages, { info, parts: [] }]
  const next = messages.slice()
  next[index] = { ...(next[index] as SessionEntry), info }
  return next
}

function extractErrorText(error: unknown): string {
  if (!error) return "Session error"
  if (typeof error === "string") return error
  const record = error as Record<string, unknown>
  const data = record.data
  if (data && typeof data === "object") {
    const message = (data as Record<string, unknown>).message
    if (typeof message === "string") return message
  }
  if (typeof record.message === "string") return record.message
  return "Session error"
}

export const useStudio = create<StudioStore>()((set, get) => ({
  state: null,
  view: "chat",
  sessions: [],
  activeSessionId: null,
  sessionStatuses: {},
  sessionErrors: {},
  usage: {},
  treeVersion: 0,
  worktrees: [],
  merges: [],
  mainBranch: null,
  messages: [],
  loadingMessages: false,
  busy: false,
  retryMessage: null,
  permissions: [],
  providers: null,
  agents: [],
  commands: [],
  selectedModels: {},
  selectedAgents: {},
  sessionAgents: {},
  optimisticUser: null,
  toasts: [],
  logs: [],
  diff: [],
  diffOpen: false,
  diffLoading: false,
  mcp: null,
  update: null,
  ready: false,

  init: async () => {
    try {
      const state = await rpc("app.state")
      set({ state, ready: true })
      applyTheme(state.settings.theme)
      if (state.settings.lastModels) set({ selectedModels: { ...state.settings.lastModels } })
      if (state.settings.lastAgents) set({ selectedAgents: { ...state.settings.lastAgents } })
      const storedView = localStorage.getItem(VIEW_STORAGE_KEY)
      if (isViewName(storedView)) set({ view: storedView })
      if (state.backend.state === "running" && state.activeProject) {
        await get().refreshAll()
      }
      void get().refreshUpdate()
    } catch (error) {
      set({ ready: true })
      get().addToast("error", formatError(error))
    }
  },

  handleEvent: (event: StudioEvent) => {
    if (event.type === "state") {
      get().applyState(event.state)
      return
    }
    if (event.type === "backend") {
      const state = get().state
      if (!state) return
      const wasRunning = state.backend.state === "running"
      set({ state: { ...state, backend: event.status } })
      if (event.status.state === "running" && !wasRunning && state.activeProject) {
        void get().refreshAll()
      }
      if (event.status.state === "error") {
        get().addToast("error", event.status.error ?? "Backend failed")
      }
      return
    }
    if (event.type === "runtime") {
      const state = get().state
      if (!state) return
      set({ state: { ...state, runtime: event.status } })
      return
    }
    if (event.type === "log") {
      set((current) => ({ logs: [...current.logs.slice(-500), event.line] }))
      return
    }
    if (event.type === "update") {
      set({ update: event.status })
      return
    }
    if (event.type === "toast") {
      get().addToast(event.level, event.message)
      return
    }

    const state = get().state
    const active = state?.activeProject
    if (!active || !sameDirectory(active.path, event.payload.directory)) return
    const incoming = event.payload.event
    const normalizedType = String((incoming as { type?: unknown }).type ?? "").replace(/\\.\\d+$/, "")
    const payload = { ...incoming, type: normalizedType } as typeof incoming
    const rawType = normalizedType

    if (rawType === "message.part.delta") {
      const properties = (payload as unknown as {
        properties: { sessionID: string; messageID: string; partID: string; field: string; delta: string }
      }).properties
      if (properties.sessionID !== get().activeSessionId) return
      set((current) => {
        const messageIndex = current.messages.findIndex((entry) => entry.info.id === properties.messageID)
        if (messageIndex === -1) return {}
        const messages = current.messages.slice()
        const entry = messages[messageIndex] as SessionEntry
        const partIndex = entry.parts.findIndex((part) => part.id === properties.partID)
        if (partIndex === -1) return {}
        const parts = entry.parts.slice()
        const part = parts[partIndex] as Part & Record<string, unknown>
        const previous = typeof part[properties.field] === "string" ? (part[properties.field] as string) : ""
        parts[partIndex] = { ...part, [properties.field]: previous + properties.delta } as Part
        messages[messageIndex] = { ...entry, parts }
        return { messages }
      })
      return
    }

    if (rawType === "permission.asked") {
      const permission = (payload as unknown as { properties: Permission }).properties
      if (permission.sessionID !== get().activeSessionId) return
      set((current) => ({
        permissions: current.permissions.some((item) => item.id === permission.id)
          ? current.permissions
          : [...current.permissions, permission],
      }))
      return
    }

    switch (payload.type) {
      case "message.updated": {
        if (payload.properties.info.sessionID !== get().activeSessionId) return
        set((current) => ({
          messages: upsertMessage(current.messages, payload.properties.info),
          optimisticUser: payload.properties.info.role === "user" ? null : current.optimisticUser,
        }))
        break
      }
      case "message.removed": {
        if (payload.properties.sessionID !== get().activeSessionId) return
        set((current) => ({
          messages: current.messages.filter((entry) => entry.info.id !== payload.properties.messageID),
        }))
        break
      }
      case "message.part.updated": {
        const part = payload.properties.part
        if (part.sessionID !== get().activeSessionId) return
        set((current) => {
          const index = current.messages.findIndex((entry) => entry.info.id === part.messageID)
          if (index === -1) return {}
          const messages = current.messages.slice()
          const entry = messages[index] as SessionEntry
          const parts = entry.parts.slice()
          const partIndex = parts.findIndex((candidate) => candidate.id === part.id)
          if (partIndex === -1) parts.push(part)
          else parts[partIndex] = part
          messages[index] = { ...entry, parts }
          return { messages }
        })
        break
      }
      case "message.part.removed": {
        if (payload.properties.sessionID !== get().activeSessionId) return
        set((current) => ({
          messages: current.messages.map((entry) => {
            if (entry.info.id !== payload.properties.messageID) return entry
            return { ...entry, parts: entry.parts.filter((part) => part.id !== payload.properties.partID) }
          }),
        }))
        break
      }
      case "session.status": {
        const status = payload.properties.status
        const sessionID = payload.properties.sessionID
        set((current) => ({
          sessionStatuses: { ...current.sessionStatuses, [sessionID]: status },
          treeVersion: current.treeVersion + 1,
        }))
        if (sessionID === get().activeSessionId) {
          if (status.type === "retry") {
            set({
              busy: true,
              retryMessage: `${status.message} - attempt ${status.attempt}`,
            })
          } else {
            set({ busy: status.type === "busy", retryMessage: null })
          }
        }
        break
      }
      case "session.idle": {
        const sessionID = payload.properties.sessionID
        set((current) => ({
          sessionStatuses: { ...current.sessionStatuses, [sessionID]: { type: "idle" } },
          treeVersion: current.treeVersion + 1,
          ...(sessionID === current.activeSessionId ? { busy: false, retryMessage: null } : {}),
        }))
        if (sessionID === get().activeSessionId) void get().syncMessages()
        void get().refreshSessions()
        break
      }
      case "session.error": {
        const sessionID = payload.properties.sessionID
        const message = extractErrorText(payload.properties.error)
        if (sessionID) {
          set((current) => ({
            sessionErrors: { ...current.sessionErrors, [sessionID]: message },
            treeVersion: current.treeVersion + 1,
          }))
        }
        if (!sessionID || sessionID === get().activeSessionId) {
          set({ busy: false, retryMessage: null })
          get().addToast("error", message)
        }
        break
      }
      case "session.created": {
        const info = payload.properties.info
        set((current) => ({
          sessions: [info, ...current.sessions.filter((session) => session.id !== info.id)],
          treeVersion: current.treeVersion + 1,
        }))
        if (!info.parentID) void get().refreshWorktrees()
        break
      }
      case "session.updated": {
        const info = payload.properties.info
        set((current) => ({
          sessions: current.sessions.some((session) => session.id === info.id)
            ? current.sessions.map((session) => (session.id === info.id ? info : session))
            : [info, ...current.sessions],
          sessionErrors: Object.fromEntries(
            Object.entries(current.sessionErrors).filter(([id]) => id !== info.id),
          ),
          treeVersion: current.treeVersion + 1,
        }))
        break
      }
      case "session.deleted": {
        const info = payload.properties.info
        set((current) => {
          const sessionStatuses = { ...current.sessionStatuses }
          const sessionErrors = { ...current.sessionErrors }
          const usage = { ...current.usage }
          delete sessionStatuses[info.id]
          delete sessionErrors[info.id]
          delete usage[info.id]
          return {
            sessions: current.sessions.filter((session) => session.id !== info.id),
            activeSessionId: current.activeSessionId === info.id ? null : current.activeSessionId,
            sessionStatuses,
            sessionErrors,
            usage,
            treeVersion: current.treeVersion + 1,
          }
        })
        void get().refreshWorktrees()
        break
      }
      case "permission.updated": {
        const permission = payload.properties
        if (permission.sessionID !== get().activeSessionId) return
        set((current) => ({
          permissions: current.permissions.some((item) => item.id === permission.id)
            ? current.permissions
            : [...current.permissions, permission],
        }))
        break
      }
      case "permission.replied": {
        const permissionID = payload.properties.permissionID
        set((current) => ({ permissions: current.permissions.filter((item) => item.id !== permissionID) }))
        break
      }
      default:
        break
    }
  },

  applyState: (next) => {
    const current = get().state
    const projectChanged = current?.activeProjectId !== next.activeProjectId
    const backendChanged = current?.backend.state !== next.backend.state
    set({ state: next })
    applyTheme(next.settings.theme)
    if (projectChanged) {
      set({
        sessions: [],
        activeSessionId: null,
        sessionStatuses: {},
        sessionErrors: {},
        usage: {},
        treeVersion: 0,
        worktrees: [],
        merges: [],
        mainBranch: null,
        messages: [],
        optimisticUser: null,
        busy: false,
        retryMessage: null,
        permissions: [],
        diff: [],
        diffOpen: false,
      })
    }
    if (next.backend.state === "running" && next.activeProject && (projectChanged || backendChanged)) {
      void get().refreshAll()
    }
  },

  setView: (view) => {
    localStorage.setItem(VIEW_STORAGE_KEY, view)
    set({ view })
  },

  addToast: (level, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set((current) => ({ toasts: [...current.toasts, { id, level, message }] }))
    setTimeout(() => get().dismissToast(id), level === "error" ? 7000 : 4200)
  },

  dismissToast: (id) => set((current) => ({ toasts: current.toasts.filter((toast) => toast.id !== id) })),

  refreshAll: async () => {
    const state = get().state
    if (!state?.activeProject || state.backend.state !== "running") return
    const [sessions, providers, agents, commands, statuses, worktreeView] = await Promise.allSettled([
      rpc("session.list"),
      rpc("provider.catalog"),
      rpc("provider.agents"),
      rpc("command.list"),
      rpc("session.status"),
      rpc("worktree.list"),
    ])
    if (sessions.status === "fulfilled") {
      const list = sessions.value
      set({ sessions: list })
      const rootSessions = list.filter((session) => !session.parentID)
      const currentId = get().activeSessionId
      if (!currentId || !list.some((session) => session.id === currentId)) {
        const rememberedId = localStorage.getItem(sessionStorageKey(state.activeProject.id))
        const preferred = rootSessions.find((session) => session.id === rememberedId) ?? rootSessions[0]
        if (preferred) await get().openSession(preferred.id)
        else set({ activeSessionId: null, messages: [] })
      }
    }
    if (statuses.status === "fulfilled") set({ sessionStatuses: statuses.value })
    if (worktreeView.status === "fulfilled") {
      set({
        worktrees: worktreeView.value.worktrees,
        merges: worktreeView.value.merges,
        mainBranch: worktreeView.value.mainBranch ?? null,
      })
    }
    if (providers.status === "fulfilled") {
      set({ providers: providers.value })
      if (providers.value.defaultModel) {
        const projectId = state.activeProject.id
        if (!get().selectedModels[projectId]) {
          set((current) => ({
            selectedModels: { ...current.selectedModels, [projectId]: providers.value.defaultModel as ModelRef },
          }))
        }
      }
    }
    if (agents.status === "fulfilled") set({ agents: agents.value })
    if (commands.status === "fulfilled") set({ commands: commands.value })
  },

  refreshSessions: async () => {
    try {
      const [sessions, statuses] = await Promise.all([rpc("session.list"), rpc("session.status").catch(() => ({}))])
      set({ sessions, sessionStatuses: statuses })
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  refreshProviders: async () => {
    try {
      const providers = await rpc("provider.catalog")
      set({ providers })
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  refreshCommands: async () => {
    try {
      set({ commands: await rpc("command.list") })
    } catch {
      set({ commands: [] })
    }
  },

  openSession: async (id) => {
    set({ activeSessionId: id, loadingMessages: true, messages: [], optimisticUser: null, permissions: [], retryMessage: null })
    void rpc("session.focus", id).catch(() => undefined)
    const projectId = get().state?.activeProjectId
    if (projectId) localStorage.setItem(sessionStorageKey(projectId), id)
    try {
      const [messages, statuses] = await Promise.all([
        rpc("session.messages", id),
        rpc("session.status").catch(() => ({} as Record<string, SessionStatus>)),
      ])
      const status = statuses[id]
      set({
        messages,
        loadingMessages: false,
        busy: status?.type === "busy" || status?.type === "retry",
        sessionStatuses: { ...get().sessionStatuses, ...statuses },
      })
    } catch (error) {
      set({ loadingMessages: false })
      get().addToast("error", formatError(error))
    }
  },

  newSession: async () => {
    try {
      const session = await rpc("session.create", tr("chat.newChat"))
      set((current) => ({ sessions: [session, ...current.sessions], view: "chat" }))
      await get().openSession(session.id)
      await get().refreshWorktrees()
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  deleteSession: async (id) => {
    try {
      const currentSessions = get().sessions
      const removed = new Set<string>()
      const byParent = new Map<string, string[]>()
      for (const session of currentSessions) {
        if (!session.parentID) continue
        const list = byParent.get(session.parentID) ?? []
        list.push(session.id)
        byParent.set(session.parentID, list)
      }
      const visit = (sessionId: string) => {
        removed.add(sessionId)
        for (const child of byParent.get(sessionId) ?? []) visit(child)
      }
      visit(id)
      await rpc("session.deleteTree", id)
      const projectId = get().state?.activeProjectId
      if (projectId) {
        const remembered = localStorage.getItem(sessionStorageKey(projectId))
        if (remembered && removed.has(remembered)) localStorage.removeItem(sessionStorageKey(projectId))
      }
      const remaining = get().sessions.filter((session) => !removed.has(session.id))
      set({ sessions: remaining })
      await get().refreshWorktrees()
      if (get().activeSessionId && removed.has(get().activeSessionId as string)) {
        const next = remaining.find((session) => !session.parentID) ?? remaining[0]
        if (next) await get().openSession(next.id)
        else set({ activeSessionId: null, messages: [] })
      }
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  renameSession: async (id, title) => {
    try {
      const updated = await rpc("session.update", id, title)
      set((current) => ({ sessions: current.sessions.map((session) => (session.id === id ? updated : session)) }))
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  revertSession: async (messageID) => {
    const id = get().activeSessionId
    if (!id) return false
    try {
      const updated = await rpc("session.revert", id, messageID)
      set((current) => ({ sessions: current.sessions.map((session) => (session.id === id ? updated : session)) }))
      await get().syncMessages()
      return true
    } catch (error) {
      get().addToast("error", formatError(error))
      return false
    }
  },

  unrevertSession: async () => {
    const id = get().activeSessionId
    if (!id) return false
    try {
      const updated = await rpc("session.unrevert", id)
      set((current) => ({ sessions: current.sessions.map((session) => (session.id === id ? updated : session)) }))
      await get().syncMessages()
      return true
    } catch (error) {
      get().addToast("error", formatError(error))
      return false
    }
  },

  refreshUsage: async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))]
    if (unique.length === 0) return
    try {
      const usage = await rpc("session.usage", unique)
      set((current) => ({ usage: { ...current.usage, ...usage } }))
    } catch {
      // usage is best-effort
    }
  },

  refreshWorktrees: async () => {
    try {
      const view = await rpc("worktree.list")
      set({ worktrees: view.worktrees, merges: view.merges, mainBranch: view.mainBranch ?? null })
    } catch {
      // worktrees are optional for non-git projects
    }
  },

  mergeSessionWorktree: async (sessionId) => {
    try {
      const result = await rpc("worktree.merge", sessionId)
      await get().refreshWorktrees()
      await get().refreshSessions()
      if (result.status === "merged") get().addToast("success", tr("toast.mergeSuccess", { branch: result.worktree.branch }))
      else get().addToast("error", result.merge.message ?? tr("toast.mergeConflict"))
      return result
    } catch (error) {
      get().addToast("error", formatError(error))
      return null
    }
  },

  removeSessionWorktree: async (sessionId) => {
    try {
      const view = await rpc("worktree.remove", sessionId)
      set({ worktrees: view.worktrees, merges: view.merges, mainBranch: view.mainBranch ?? null })
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },


  syncMessages: async () => {
    const id = get().activeSessionId
    if (!id) return
    try {
      const messages = await rpc("session.messages", id)
      const optimistic = get().optimisticUser
      const containsOptimistic =
        !optimistic ||
        messages.some(
          (entry) =>
            entry.info.role === "user" &&
            entry.parts.some((part) => part.type === "text" && part.text.trim() === optimistic.trim()),
        )
      set({ messages, optimisticUser: containsOptimistic ? null : optimistic })
    } catch {
      // ignore transient sync failures
    }
  },

  reconcileActive: async () => {
    const id = get().activeSessionId
    if (!id) return
    try {
      const [messages, statuses] = await Promise.all([
        rpc("session.messages", id),
        rpc("session.status").catch(() => ({} as Record<string, SessionStatus>)),
      ])
      if (get().activeSessionId !== id) return
      const observed = statuses[id]
      const latestAssistant = [...messages].reverse().find((entry) => entry.info.role === "assistant")
      const completed = Boolean(latestAssistant && "completed" in latestAssistant.info.time && latestAssistant.info.time.completed)
      const hasUser = messages.some((entry) => entry.info.role === "user")
      const busy = observed
        ? observed.type === "busy" || observed.type === "retry"
        : hasUser && !completed
      const status: SessionStatus = observed ?? { type: busy ? "busy" : "idle" }
      const optimistic = get().optimisticUser
      const containsOptimistic =
        !optimistic ||
        messages.some(
          (entry) =>
            entry.info.role === "user" &&
            entry.parts.some((part) => part.type === "text" && part.text.trim() === optimistic.trim()),
        )
      set({
        messages,
        optimisticUser: containsOptimistic ? null : optimistic,
        sessionStatuses: { ...get().sessionStatuses, ...statuses, [id]: status },
        busy,
        retryMessage:
          status.type === "retry" ? `${status.message} - attempt ${status.attempt}` : null,
      })
    } catch {
      // best-effort reconciliation while a turn is running
    }
  },

  send: async (text) => {
    const state = get().state
    const project = state?.activeProject
    if (!state || !project) {
      get().addToast("error", tr("toast.projectFirst"))
      return false
    }
    if (state.backend.state !== "running") {
      get().addToast("error", tr("toast.backendNotReady"))
      return false
    }
    const trimmed = text.trim()
    if (!trimmed) return false

    const currentSessionId = get().activeSessionId
    if (get().state?.settings.singleWriterLock !== false) {
      const currentSession = get().sessions.find((session) => session.id === currentSessionId)
      const ownDirectory = currentSession?.directory ?? project.path
      const busyElsewhere = Object.entries(get().sessionStatuses).find(([id, status]) => {
        if (id === currentSessionId) return false
        if (status.type !== "busy" && status.type !== "retry") return false
        if (!currentSessionId) return get().state?.settings.sessionWorktrees === false
        const other = get().sessions.find((session) => session.id === id)
        return sameDirectory(other?.directory ?? project.path, ownDirectory)
      })
      if (busyElsewhere) {
        get().addToast("error", tr("toast.singleWriter"))
        return false
      }
    }

    let sessionId = get().activeSessionId
    try {
      if (!sessionId) {
        const session = await rpc("session.create", tr("chat.newChat"))
        sessionId = session.id
        set((current) => ({ sessions: [session, ...current.sessions], activeSessionId: session.id, view: "chat" }))
        localStorage.setItem(sessionStorageKey(project.id), session.id)
        localStorage.setItem(VIEW_STORAGE_KEY, "chat")
        void rpc("session.focus", session.id).catch(() => undefined)
        void get().refreshWorktrees()
      }
      const model = get().selectedModels[project.id] ?? get().providers?.defaultModel
      if (!model) {
        get().addToast("error", tr("toast.modelFirst"))
        return false
      }
      const requestedAgent = get().sessionAgents[sessionId] ?? get().selectedAgents[project.id]
      const agent = requestedAgent === "architect" ? "architect" : "build"
      set({ busy: true, optimisticUser: trimmed, retryMessage: null })

      if (trimmed.startsWith("/")) {
        const withoutSlash = trimmed.slice(1)
        const space = withoutSlash.indexOf(" ")
        const name = space === -1 ? withoutSlash : withoutSlash.slice(0, space)
        const args = space === -1 ? "" : withoutSlash.slice(space + 1)
        const command = get().commands.find((candidate) => candidate.name === name)
        if (command) {
          await rpc("chat.command", {
            sessionId,
            text: trimmed,
            command: command.name,
            arguments: args,
            providerID: model.providerID,
            modelID: model.modelID,
            agent,
          })
        } else {
          await rpc("chat.send", {
            sessionId,
            text: trimmed,
            providerID: model.providerID,
            modelID: model.modelID,
            agent,
          })
        }
      } else {
        await rpc("chat.send", {
          sessionId,
          text: trimmed,
          providerID: model.providerID,
          modelID: model.modelID,
          agent,
        })
      }

      setTimeout(() => {
        void get().syncMessages()
        void get().refreshSessions()
      }, 500)
      return true
    } catch (error) {
      set({ busy: false, optimisticUser: null, retryMessage: null })
      get().addToast("error", formatError(error))
      return false
    }
  },

  abort: async () => {
    const id = get().activeSessionId
    if (!id) return
    try {
      await rpc("session.abort", id)
      set({ busy: false, retryMessage: null })
      setTimeout(() => void get().syncMessages(), 400)
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  respondPermission: async (permission, response) => {
    try {
      await rpc("permission.reply", {
        sessionId: permission.sessionID,
        permissionId: permission.id,
        response,
      })
      set((current) => ({ permissions: current.permissions.filter((item) => item.id !== permission.id) }))
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  setModel: (ref) => {
    const project = get().state?.activeProject
    if (!project) return
    set((current) => ({ selectedModels: { ...current.selectedModels, [project.id]: ref } }))
    void rpc("app.updateSettings", { lastModels: { [project.id]: ref } }).catch(() => undefined)
  },

  setAgent: (agent) => {
    const project = get().state?.activeProject
    if (!project) return
    set((current) => ({ selectedAgents: { ...current.selectedAgents, [project.id]: agent } }))
    void rpc("app.updateSettings", { lastAgents: { [project.id]: agent } }).catch(() => undefined)
  },

  setSessionAgent: (sessionId, agent) => {
    set((current) => {
      const sessionAgents = { ...current.sessionAgents }
      if (agent) sessionAgents[sessionId] = agent
      else delete sessionAgents[sessionId]
      return { sessionAgents }
    })
    if (agent) localStorage.setItem(`meowstudio:sessionAgent:${sessionId}`, agent)
    else localStorage.removeItem(`meowstudio:sessionAgent:${sessionId}`)
  },

  activateProject: async (id) => {
    try {
      const next = await rpc("project.activate", id)
      get().applyState(next)
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  pickAndAddProject: async () => {
    try {
      const path = await rpc("app.pickProject")
      if (!path) return
      await get().addProjectPath(path)
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  addProjectPath: async (path) => {
    try {
      const next = await rpc("project.add", path)
      get().applyState(next)
      get().setView("chat")
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  removeProject: async (id) => {
    try {
      const next = await rpc("project.remove", id)
      get().applyState(next)
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  updateSettings: async (patch) => {
    try {
      const next = await rpc("app.updateSettings", patch)
      get().applyState(next)
      applyTheme(next.settings.theme)
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  restartBackend: async () => {
    try {
      const next = await rpc("app.restartBackend")
      get().applyState(next)
      get().addToast("success", tr("toast.backendRestarted"))
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  ensureRuntime: async (force = false) => {
    try {
      const next = await rpc("runtime.ensure", force)
      get().applyState(next)
      if (next.runtime.state === "ready") get().addToast("success", tr("toast.runtimeReady"))
      else if (next.runtime.state === "error") get().addToast("error", next.runtime.error ?? tr("toast.runtimeFailed"))
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  showDiff: async () => {
    const id = get().activeSessionId
    if (!id) return
    set({ diffOpen: true, diffLoading: true })
    try {
      const diff = await rpc("session.diff", id)
      set({ diff, diffLoading: false })
    } catch (error) {
      set({ diffLoading: false })
      get().addToast("error", formatError(error))
    }
  },

  closeDiff: () => set({ diffOpen: false, diff: [] }),

  loadMcp: async () => {
    try {
      set({ mcp: await rpc("mcp.view") })
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  refreshLogs: async () => {
    try {
      set({ logs: await rpc("app.logs") })
    } catch {
      // ignore
    }
  },

  refreshUpdate: async () => {
    try {
      set({ update: await rpc("app.updateStatus") })
    } catch {
      // ignore
    }
  },

  checkUpdates: async () => {
    try {
      set({ update: await rpc("app.checkUpdates") })
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  downloadUpdate: async () => {
    try {
      set({ update: await rpc("app.downloadUpdate") })
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },

  installUpdate: async () => {
    try {
      await rpc("app.installUpdate")
    } catch (error) {
      get().addToast("error", formatError(error))
    }
  },
}))

export type { ConfigScope }


