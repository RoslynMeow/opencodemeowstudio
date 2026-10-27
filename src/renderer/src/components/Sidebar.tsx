import clsx from "clsx"
import {
  Braces,
  Check,
  ChevronsUpDown,
  Cpu,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GitBranch,
  MessageSquare,
  MessagesSquare,
  Moon,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Terminal,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { formatBytes, formatError, relativeTime, rpc } from "../lib/rpc"
import { useStudio, type ViewName } from "../store/useStore"
import { IconButton, Spinner, StatusDot } from "./ui"
import { useT } from "../i18n/useT"
import { sessionRootId } from "../lib/session-tree"
import { sessionTitle } from "../lib/session-title"

const TOOLS: Array<{ view: ViewName; labelKey: string; icon: typeof Cpu }> = [
  { view: "models", labelKey: "models.title", icon: Cpu },
  { view: "mcp", labelKey: "mcp.title", icon: Plug },
  { view: "lsp", labelKey: "lsp.title", icon: Braces },
  { view: "plugins", labelKey: "plugins.title", icon: Puzzle },
]

export function Sidebar() {
  const state = useStudio((store) => store.state)
  const view = useStudio((store) => store.view)
  const sessions = useStudio((store) => store.sessions)
  const loadingSessions = useStudio((store) => store.loadingSessions)
  const activeSessionId = useStudio((store) => store.activeSessionId)
  const busy = useStudio((store) => store.busy)
  const setView = useStudio((store) => store.setView)
  const activateProject = useStudio((store) => store.activateProject)
  const pickAndAddProject = useStudio((store) => store.pickAndAddProject)
  const newSession = useStudio((store) => store.newSession)
  const openSession = useStudio((store) => store.openSession)
  const deleteSession = useStudio((store) => store.deleteSession)
  const restartBackend = useStudio((store) => store.restartBackend)
  const ensureRuntime = useStudio((store) => store.ensureRuntime)
  const updateSettings = useStudio((store) => store.updateSettings)
  const addToast = useStudio((store) => store.addToast)
  const { t } = useT()

  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  if (!state) return null
  const runtime = state.runtime
  const backend = state.backend
  const downloading = runtime.state === "downloading" || runtime.state === "extracting"
  const percent =
    runtime.received && runtime.total ? Math.min(100, Math.round((runtime.received / runtime.total) * 100)) : undefined
  const isDark = document.documentElement.dataset.theme !== "light"
  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return state.projects
    return state.projects.filter(
      (project) => project.name.toLowerCase().includes(needle) || project.path.toLowerCase().includes(needle),
    )
  }, [state.projects, query])
  const rootSessions = sessions.filter((session) => !session.parentID)
  const activeRootId = sessionRootId(sessions, activeSessionId)
  const pages = (state.settings.layoutMode ?? "pages") === "pages"
  const width = dragWidth ?? state.settings.sidebarWidth ?? 200
  const workspaceItems: Array<{ view: ViewName; labelKey: string; icon: typeof Cpu }> = [
    { view: "sessions", labelKey: "sidebar.sessions", icon: MessagesSquare },
    ...(state.settings.enabledModules?.includes("files")
      ? [{ view: "files" as ViewName, labelKey: "files.title", icon: FolderTree }]
      : []),
    ...(state.settings.enabledModules?.includes("git")
      ? [{ view: "git" as ViewName, labelKey: "git.title", icon: GitBranch }]
      : []),
  ]

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const onMove = (moveEvent: PointerEvent) => {
      setDragWidth(Math.min(460, Math.max(200, startWidth + moveEvent.clientX - startX)))
    }
    const onUp = () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      setDragWidth((value) => {
        if (value) void updateSettings({ sidebarWidth: Math.round(value) }).finally(() => setDragWidth(null))
        return value
      })
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-r border-line bg-surface" style={{ width }}>
      <div className="flex items-center gap-2 px-3 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold tracking-tight" title="OpenCode MeowStudio">OpenCode MeowStudio</div>
          <button
            className="mt-0.5 rounded text-[9.5px] font-medium uppercase tracking-[0.16em] text-faint transition-colors hover:text-muted"
            onClick={() => setView("settings")}
            title={t("settings.profile")}
          >
            {state.settings.profile === "global" ? t("sidebar.profileGlobal") : t("sidebar.profileIsolated")}
          </button>
        </div>
        <IconButton
          className="ml-auto h-7 w-7"
          title={t("sidebar.switchTheme")}
          onClick={() => void updateSettings({ theme: isDark ? "light" : "dark" })}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </IconButton>
      </div>

      <div className="px-3 pb-2.5" ref={menuRef}>
        <div className="relative">
          {state.activeProject ? (
            <button
              className={clsx(
                "group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                menuOpen ? "border-accent/50 bg-raised" : "border-line bg-canvas hover:border-faint/70 hover:bg-raised/60",
              )}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent">
                <FolderOpen size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{state.activeProject.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-faint" title={state.activeProject.path}>
                  {state.activeProject.path}
                </span>
              </span>
              <ChevronsUpDown size={13} className="shrink-0 text-faint" />
            </button>
          ) : (
            <button
              className={clsx(
                "flex w-full items-center gap-2.5 rounded-xl border border-dashed px-2.5 py-2.5 text-left transition-colors",
                menuOpen ? "border-accent/50 bg-raised" : "border-line bg-canvas/60 hover:border-accent/40 hover:bg-raised/60",
              )}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent">
                <FolderPlus size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{t("sidebar.openFolder")}</span>
                <span className="mt-0.5 block text-[10px] text-faint">{t("sidebar.noProject")}</span>
              </span>
              <Plus size={14} className="shrink-0 text-faint" />
            </button>
          )}

          {menuOpen && (
            <div className="animate-fade-up absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
              {state.projects.length > 3 && (
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <Search size={13} className="text-faint" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("sidebar.searchProjects")}
                    className="w-full bg-transparent text-[12px] outline-none placeholder:text-faint"
                  />
                </div>
              )}
              <div className="max-h-[230px] overflow-y-auto p-1.5">
                {filteredProjects.length === 0 && (
                  <div className="px-2 py-3 text-center text-[11.5px] text-faint">{t("sidebar.noProject")}</div>
                )}
                {filteredProjects.map((project) => {
                  const active = project.id === state.activeProjectId
                  return (
                    <div
                      key={project.id}
                      className={clsx(
                        "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                        active ? "bg-accent-soft/40" : "hover:bg-line-soft",
                      )}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => {
                          setMenuOpen(false)
                          setQuery("")
                          if (!active) void activateProject(project.id)
                          setView("chat")
                        }}
                      >
                        <span className="w-3.5 shrink-0">{active && <Check size={12} className="text-accent" />}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px]">{project.name}</span>
                          <span className="block truncate text-[9.5px] text-faint">{project.path}</span>
                        </span>
                      </button>
                      <IconButton
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        title={t("sidebar.reveal")}
                        onClick={() => void window.studio.rpc("app.showItem", project.path)}
                      >
                        <FolderOpen size={11} />
                      </IconButton>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-1 border-t border-line p-1.5">
                <button
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] text-muted transition-colors hover:bg-line-soft hover:text-ink"
                  onClick={() => {
                    setMenuOpen(false)
                    void pickAndAddProject()
                  }}
                >
                  <FolderPlus size={12} /> {t("sidebar.openFolder")}
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] text-muted transition-colors hover:bg-line-soft hover:text-ink"
                  onClick={() => {
                    setMenuOpen(false)
                    setView("projects")
                  }}
                >
                  <Settings size={12} /> {t("sidebar.manageProjects")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          data-view="chat"
          className="group flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-accent px-3 py-2 text-[12.5px] font-semibold text-accent-contrast shadow-sm transition-all hover:bg-accent-strong disabled:opacity-40"
          onClick={() => void newSession()}
          disabled={!state.activeProject || backend.state !== "running"}
        >
          <Plus size={14} className="transition-transform group-hover:rotate-90" />
          {t("sidebar.newChat")}
        </button>
      </div>

      {!pages && (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 pb-1 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{t("sidebar.sessions")}</span>
          {rootSessions.length > 0 && (
            <span className="rounded-full bg-line-soft px-1.5 text-[9.5px] font-medium text-faint">{rootSessions.length}</span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <IconButton
              data-view="projects"
              className={clsx("h-6 w-6", view === "projects" && "bg-raised text-accent")}
              title={t("sidebar.manageProjects")}
              onClick={() => setView("projects")}
            >
              <FolderOpen size={12} />
            </IconButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {loadingSessions && rootSessions.length === 0 ? (
            <div className="space-y-1 px-1.5 py-1" aria-busy="true" aria-label={t("common.loading")}>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="rounded-lg px-2 py-1.5">
                  <div
                    className="loading-skeleton h-2.5 rounded bg-line-soft"
                    style={{ width: `${72 - index * 9}%` }}
                  />
                  <div className="loading-skeleton mt-1.5 h-2 w-16 rounded bg-line-soft/70" />
                </div>
              ))}
            </div>
          ) : rootSessions.length === 0 ? (
            <div className="mx-1 mt-1 rounded-xl border border-dashed border-line-soft px-3 py-5 text-center">
              <MessageSquare size={18} className="mx-auto mb-2 text-faint/70" />
              <div className="text-[11.5px] font-medium text-muted">{t("sidebar.noSessions")}</div>
              <div className="mt-1 text-[10.5px] leading-relaxed text-faint">{t("sidebar.noSessionsHint")}</div>
            </div>
          ) : (
            rootSessions.map((session) => {
              const active = activeRootId === session.id
              return (
                <div
                  key={session.id}
                  className={clsx(
                    "group relative flex items-center gap-1 rounded-lg py-1.5 pl-3 pr-1.5 transition-colors",
                    active ? "bg-raised text-ink" : "text-muted hover:bg-line-soft/70 hover:text-ink",
                  )}
                >
                  {active && <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-accent" />}
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setView("chat")
                      void openSession(session.id)
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      {active && busy ? (
                        <Spinner size={10} className="shrink-0 text-accent" />
                      ) : (
                        <span
                          className={clsx(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            active ? "bg-accent" : "bg-transparent group-hover:bg-faint",
                          )}
                        />
                      )}
                      <span className="truncate text-[12px]">{sessionTitle(session.title, t("chat.newConversation"))}</span>
                    </div>
                    <div className="mt-0.5 pl-3 text-[9.5px] text-faint">{relativeTime(session.time.updated)}</div>
                  </button>
                  <IconButton
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    title={t("common.delete")}
                    onClick={() => void deleteSession(session.id)}
                  >
                    <Trash2 size={11} />
                  </IconButton>
                </div>
              )
            })
          )}
        </div>
      </div>
      )}

      {pages && (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-2">
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            {t("sidebar.workspace")}
          </div>
          <div className="space-y-1">
            {workspaceItems.map((item) => {
              const Icon = item.icon
              const active = view === item.view
              return (
                <button
                  key={item.view}
                  data-view={item.view}
                  onClick={() => setView(item.view)}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] transition-all",
                    active
                      ? "border-accent/35 bg-accent-soft/40 text-ink"
                      : "border-line bg-canvas/50 text-muted hover:border-faint/60 hover:bg-raised hover:text-ink",
                  )}
                >
                  <Icon size={13} className={active ? "text-accent" : "text-faint"} />
                  <span className="truncate">{t(item.labelKey)}</span>
                  {item.view === "sessions" && rootSessions.length > 0 && (
                    <span className="ml-auto text-[9.5px] text-faint">{rootSessions.length}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}


      <div className="px-3 pb-2">
        <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          {t("sidebar.tools")}
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            data-action="terminal"
            disabled={!state.activeProject}
            onClick={() => void rpc("app.openTerminal").catch((error) => addToast("error", formatError(error)))}
            title={t("sidebar.terminalHint")}
            className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11.5px] text-muted transition-all border-line bg-canvas/50 hover:border-faint/60 hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <Terminal size={13} className="text-faint" />
            <span className="truncate">{t("sidebar.terminal")}</span>
          </button>
          {TOOLS.map((item) => {
            const Icon = item.icon
            const active = view === item.view
            return (
              <button
                key={item.view}
                data-view={item.view}
                onClick={() => setView(item.view)}
                className={clsx(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11.5px] transition-all",
                  active
                    ? "border-accent/35 bg-accent-soft/40 text-ink"
                    : "border-line bg-canvas/50 text-muted hover:border-faint/60 hover:bg-raised hover:text-ink",
                )}
              >
                <Icon size={13} className={active ? "text-accent" : "text-faint"} />
                <span className="truncate">{t(item.labelKey)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-line px-2.5 py-2">
        <button
          data-view="settings"
          onClick={() => setView("settings")}
          className={clsx(
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors",
            view === "settings" ? "bg-raised text-ink" : "text-muted hover:bg-line-soft hover:text-ink",
          )}
        >
          <Settings size={13} className={view === "settings" ? "text-accent" : "text-faint"} />
          {t("sidebar.settings")}
          <span className="ml-auto text-[9.5px] text-faint">{state.appVersion}</span>
        </button>

        <div className="mt-1 rounded-lg px-2 py-1.5">
          {downloading ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted">
                <span className="flex items-center gap-1.5">
                  <Spinner size={10} />
                  {runtime.state === "extracting" ? t("sidebar.extracting") : t("sidebar.downloading")}
                </span>
                <span>{percent !== undefined ? `${percent}%` : formatBytes(runtime.received)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-line-soft">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent ?? 8}%` }} />
              </div>
            </div>
          ) : backend.state === "running" ? (
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <StatusDot tone="good" />
              <span className="truncate">{t("sidebar.backendRunning", { version: backend.version ?? runtime.version ?? "" })}</span>
              <button
                className="ml-auto flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-line-soft hover:text-ink"
                title={t("sidebar.restart")}
                onClick={() => void restartBackend()}
              >
                <RefreshCw size={11} />
              </button>
            </div>
          ) : backend.state === "starting" ? (
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <Spinner size={10} /> {t("sidebar.backendStarting")}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 text-[10.5px] text-bad">
                <StatusDot tone="bad" />
                <span className="truncate" title={backend.error ?? runtime.error}>
                  {t("sidebar.backendError")}
                </span>
              </div>
              <div className="mt-1.5 flex gap-1">
                <button className="btn h-6 flex-1 px-1.5 text-[10px]" onClick={() => void ensureRuntime(false)}>
                  {t("sidebar.retryRuntime")}
                </button>
                <button className="btn h-6 flex-1 px-1.5 text-[10px]" onClick={() => void restartBackend()}>
                  {t("sidebar.restart")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        className="absolute -right-[3px] top-0 z-10 h-full w-1.5 cursor-col-resize rounded-full transition-colors hover:bg-accent/40"
        onPointerDown={startResize}
      />
    </aside>
  )
}


