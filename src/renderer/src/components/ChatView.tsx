import clsx from "clsx"
import {
  ArrowUp,
  Check,
  CornerUpLeft,
  Cpu,
  FolderSearch,
  GitBranch,
  Hammer,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Terminal,
  Wand2,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useStudio } from "../store/useStore"
import { rpc } from "../lib/rpc"
import { ModelPicker } from "./ModelPicker"
import { MessageItem, OptimisticUserMessage } from "./Message"
import { Button, IconButton, Spinner, StatusDot } from "./ui"
import { useT } from "../i18n/useT"
import { sessionTitle } from "../lib/session-title"
import { FilePanel, type FilePanelTab } from "./FilePanel"
import { ARCHITECT_AGENT, ARCHITECT_TEAM } from "../lib/agent-team"

export function ChatView() {
  const state = useStudio((store) => store.state)
  const sessions = useStudio((store) => store.sessions)
  const activeSessionId = useStudio((store) => store.activeSessionId)
  const messages = useStudio((store) => store.messages)
  const loadingMessages = useStudio((store) => store.loadingMessages)
  const busy = useStudio((store) => store.busy)
  const retryMessage = useStudio((store) => store.retryMessage)
  const optimisticUser = useStudio((store) => store.optimisticUser)
  const providers = useStudio((store) => store.providers)
  const commands = useStudio((store) => store.commands)
  const selectedModels = useStudio((store) => store.selectedModels)
  const setView = useStudio((store) => store.setView)
  const agents = useStudio((store) => store.agents)
  const sessionAgents = useStudio((store) => store.sessionAgents)
  const selectedAgents = useStudio((store) => store.selectedAgents)
  const setAgent = useStudio((store) => store.setAgent)
  const setSessionAgent = useStudio((store) => store.setSessionAgent)
  const refreshAll = useStudio((store) => store.refreshAll)
  const addToast = useStudio((store) => store.addToast)
  const send = useStudio((store) => store.send)
  const abort = useStudio((store) => store.abort)
  const reconcileActive = useStudio((store) => store.reconcileActive)
  const renameSession = useStudio((store) => store.renameSession)
  const revertSession = useStudio((store) => store.revertSession)
  const unrevertSession = useStudio((store) => store.unrevertSession)
  const newSession = useStudio((store) => store.newSession)
  const openSession = useStudio((store) => store.openSession)
  const pickAndAddProject = useStudio((store) => store.pickAndAddProject)
  const { t } = useT()

  const [text, setText] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [stickToBottom, setStickToBottom] = useState(true)
  const [installingTeam, setInstallingTeam] = useState(false)
  const [panel, setPanel] = useState<"none" | "files">(() => (localStorage.getItem("meowstudio:panel") === "files" ? "files" : "none"))
  const [fileTab, setFileTab] = useState<FilePanelTab>(() =>
    localStorage.getItem("meowstudio:fileTab") === "changes" ? "changes" : "explorer",
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const session = sessions.find((item) => item.id === activeSessionId)
  const pages = (state?.settings.layoutMode ?? "pages") === "pages"
  const filesEnabled = state?.settings.enabledModules?.includes("files") ?? false
  const gitEnabled = state?.settings.enabledModules?.includes("git") ?? false
  const projectId = state?.activeProjectId ?? null
  const hasModel = Boolean(projectId && (selectedModels[projectId] || providers?.defaultModel))
  const requestedAgent =
    (activeSessionId ? sessionAgents[activeSessionId] : undefined) ??
    (projectId ? selectedAgents[projectId] : undefined) ??
    "build"
  const effectiveAgent = requestedAgent === ARCHITECT_AGENT ? ARCHITECT_AGENT : "build"
  const architectActive = effectiveAgent === ARCHITECT_AGENT
  const architectInstalled = agents.some((agent) => agent.name === ARCHITECT_AGENT)
  const running = state?.backend.state === "running"

  useEffect(() => {
    if (!projectId || !running) return
    const buildKey = `meowstudio:build-no-task:${projectId}`
    const promptKey = `meowstudio:architect-prompt:2:${projectId}`
    const architect = ARCHITECT_TEAM.find((agent) => agent.name === ARCHITECT_AGENT)
    const syncBuild = localStorage.getItem(buildKey) !== "1"
    const syncPrompt = architectInstalled && Boolean(architect) && localStorage.getItem(promptKey) !== "1"
    if (!syncBuild && !syncPrompt) return
    let cancelled = false
    const sync = async () => {
      try {
        if (syncBuild) {
          await rpc("config.patch", "project", ["agent", "build"], { tools: { task: false } })
          if (!cancelled) localStorage.setItem(buildKey, "1")
        }
        if (syncPrompt && architect) {
          await rpc("config.patch", "project", ["agent", architect.name], {
            description: architect.description,
            mode: architect.mode,
            prompt: architect.prompt,
          })
          if (!cancelled) localStorage.setItem(promptKey, "1")
        }
        if (!cancelled) await refreshAll()
      } catch {
        // Policies are retried on the next launch.
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [projectId, running, architectInstalled, refreshAll])

  const setPanelPersisted = (next: "none" | "files") => {
    localStorage.setItem("meowstudio:panel", next)
    setPanel(next)
  }
  const openFiles = (tab: FilePanelTab) => {
    if (pages) {
      setPanelPersisted("none")
      setView(tab === "changes" ? "git" : "files")
      return
    }
    setFileTab(tab)
    localStorage.setItem("meowstudio:fileTab", tab)
    setPanelPersisted("files")
  }
  const changeFileTab = (tab: FilePanelTab) => {
    setFileTab(tab)
    localStorage.setItem("meowstudio:fileTab", tab)
  }

  const suggestions = [
    { title: t("chat.suggestion.explain.title"), prompt: t("chat.suggestion.explain.prompt") },
    { title: t("chat.suggestion.fix.title"), prompt: t("chat.suggestion.fix.prompt") },
    { title: t("chat.suggestion.tests.title"), prompt: t("chat.suggestion.tests.prompt") },
    { title: t("chat.suggestion.feature.title"), prompt: t("chat.suggestion.feature.prompt") },
  ]

  useEffect(() => {
    if (!stickToBottom) return
    endRef.current?.scrollIntoView({ behavior: messages.length > 0 ? "smooth" : "auto", block: "end" })
  }, [messages, optimisticUser, busy, stickToBottom])

  useEffect(() => {
    setStickToBottom(true)
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [activeSessionId])

  useEffect(() => {
    if (!busy || !activeSessionId) return
    void reconcileActive()
    const timer = window.setInterval(() => void reconcileActive(), 2000)
    return () => window.clearInterval(timer)
  }, [busy, activeSessionId, reconcileActive])

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(200, node.scrollHeight)}px`
  }, [text])

  const slashMatches = useMemo(() => {
    if (!text.startsWith("/") || text.includes(" ")) return []
    const needle = text.slice(1).toLowerCase()
    return commands.filter((command) => command.name.toLowerCase().includes(needle)).slice(0, 8)
  }, [text, commands])

  const revertedMessageId = session?.revert?.messageID
  const visibleMessages = useMemo(() => {
    if (!revertedMessageId) return messages
    const index = messages.findIndex((entry) => entry.info.id === revertedMessageId)
    return index === -1 ? messages : messages.slice(0, index)
  }, [messages, revertedMessageId])

  if (!state) return null
  if (!state.activeProject) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/15 to-transparent text-accent">
            <Terminal size={23} />
          </div>
          <h2 className="text-[22px] font-semibold tracking-tight">{t("chat.openProjectTitle")}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{t("chat.openProjectDesc")}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" onClick={() => void pickAndAddProject()}>
              <Plus size={14} /> {t("chat.openFolder")}
            </Button>
            <Button onClick={() => setView("projects")}>{t("chat.manageProjects")}</Button>
          </div>
        </div>
      </div>
    )
  }

  const submit = () => {
    const value = text.trim()
    if (!value) return
    setText("")
    setStickToBottom(true)
    void send(value)
  }

  const revertTo = async (messageID: string) => {
    if (busy) return false
    if (!window.confirm(t("message.revertConfirm"))) return false
    return revertSession(messageID)
  }

  const editMessage = async (messageID: string, value: string) => {
    if (!(await revertTo(messageID))) return
    setText(value)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const toggleArchitect = async () => {
    if (architectActive) {
      if (activeSessionId) setSessionAgent(activeSessionId, "build")
      else setAgent("build")
      return
    }
    const installed = architectInstalled
    if (!installed && !window.confirm(t("workflow.installConfirm"))) return
    setInstallingTeam(true)
    try {
      const agentsToWrite = installed ? ARCHITECT_TEAM.filter((agent) => agent.name === ARCHITECT_AGENT) : ARCHITECT_TEAM
      await Promise.all(
        agentsToWrite.map((agent) =>
          rpc("config.patch", "project", ["agent", agent.name], {
            description: agent.description,
            mode: agent.mode,
            prompt: agent.prompt,
          }),
        ),
      )
      await refreshAll()
      if (!installed) addToast("success", t("workflow.installed"))
    } catch (error) {
      addToast("error", (error as Error).message)
      setInstallingTeam(false)
      return
    } finally {
      setInstallingTeam(false)
    }
    if (activeSessionId) setSessionAgent(activeSessionId, ARCHITECT_AGENT)
    else setAgent(ARCHITECT_AGENT)
  }

  const startEditingTitle = () => {
    if (!session) return
    setTitleDraft(session.title)
    setEditingTitle(true)
  }

  const saveTitle = () => {
    if (session && titleDraft.trim()) void renameSession(session.id, titleDraft.trim())
    setEditingTitle(false)
  }

  return (
    <div className="relative flex h-full min-w-0">
      <div className={clsx("min-w-0 flex-1 flex-col", panel === "none" ? "flex" : "hidden xl:flex")}>
      <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-line/80 px-5">
        {session ? (
          <div className="flex min-w-0 items-center gap-2">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveTitle()
                  if (event.key === "Escape") setEditingTitle(false)
                }}
                className="h-7 w-64 rounded-md border border-accent/50 bg-canvas px-2 text-[13px] outline-none"
              />
            ) : (
              <button
                className="group flex min-w-0 items-center gap-1.5 text-[13px] font-medium"
                onClick={startEditingTitle}
                title={t("chat.renameSession")}
              >
                <span className="max-w-[340px] truncate">{sessionTitle(session.title, t("chat.newConversation"))}</span>
                <Pencil size={11} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <div className="hidden min-w-0 items-center gap-1.5 text-[10.5px] text-faint 2xl:flex">
              <span>·</span>
              <span className="max-w-[320px] truncate" title={state.activeProject.path}>
                {state.activeProject.path}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <MessageSquare size={14} className="text-faint" /> {t("chat.newConversation")}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {session?.parentID && (
            <Button
              variant="ghost"
              className="h-8 px-2 text-[11.5px]"
              onClick={() => void openSession(session.parentID as string)}
              title={t("tree.backToParent")}
            >
              <CornerUpLeft size={13} />
              <span className="hidden xl:inline">{t("tree.backToParent")}</span>
            </Button>
          )}
          {filesEnabled && (
            <Button
              variant="ghost"
              data-action="files"
              className={clsx("h-8 px-2 text-[11.5px]", panel === "files" && "bg-raised text-accent")}
              onClick={() => openFiles("explorer")}
              title={t("files.title")}
            >
              <FolderSearch size={13} />
              <span className="hidden xl:inline">{t("files.title")}</span>
            </Button>
          )}
          {gitEnabled && (
            <Button
              variant="ghost"
              className="h-8 px-2 text-[11.5px]"
              onClick={() => openFiles("changes")}
              disabled={!session}
              title={t("chat.sessionChanges")}
            >
              <GitBranch size={13} /> <span className="hidden xl:inline">{t("chat.sessionChanges")}</span>
            </Button>
          )}
          <IconButton onClick={() => void newSession()} title={t("chat.newChat")} disabled={!running}>
            <Plus size={15} />
          </IconButton>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto pb-8"
          onScroll={(event) => {
            const node = event.currentTarget
            setStickToBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 90)
          }}
        >
          {!running && (
            <div className="mx-auto mt-4 flex max-w-3xl items-center gap-2 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-[12px] text-bad">
              <StatusDot tone="bad" />
              {t("chat.backendDown")}
            </div>
          )}
          {!hasModel && running && (
            <div className="mx-auto mt-4 flex max-w-3xl items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-warn">
              <Cpu size={13} />
              {t("chat.noModel")}
              <button className="ml-auto underline" onClick={() => setView("models")}>
                {t("chat.openModels")}
              </button>
            </div>
          )}
          {retryMessage && (
            <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-warn">
              <Spinner size={12} />
              {t("chat.retryProvider", { message: retryMessage })}
            </div>
          )}

          {session?.revert && (
            <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-warn">
              <RotateCcw size={13} />
              <span className="flex-1">{t("message.reverted")}</span>
              <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => void unrevertSession()}>
                {t("message.restore")}
              </Button>
            </div>
          )}

          {visibleMessages.length === 0 && !loadingMessages ? (
            <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/20 to-accent/5 text-accent shadow-sm">
                <MessageSquare size={20} />
              </div>
              <h2 className="text-[24px] font-semibold tracking-tight">{t("chat.heroTitle")}</h2>
              <p className="mt-1.5 text-[13px] text-muted">
                {t("chat.heroWorkingIn", { project: state.activeProject.name })}
              </p>
              <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.title}
                    className="rounded-xl border border-line bg-surface/70 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised hover:shadow-lg"
                    onClick={() => void send(suggestion.prompt)}
                  >
                    <div className="text-[12.5px] font-medium">{suggestion.title}</div>
                    <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{suggestion.prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : loadingMessages ? (
            <div className="flex h-full items-center justify-center text-muted">
              <Spinner />
            </div>
          ) : (
            <div className="mx-auto max-w-[1000px] py-4">
              {visibleMessages.map((entry, index) => {
                const nextUser = visibleMessages.slice(index + 1).find((item) => item.info.role === "user")
                return (
                  <MessageItem
                    key={entry.info.id}
                    entry={entry}
                    busy={busy}
                    isLast={index === visibleMessages.length - 1}
                    onEdit={entry.info.role === "user" ? (value) => void editMessage(entry.info.id, value) : undefined}
                    onWithdraw={entry.info.role === "user" ? () => void revertTo(entry.info.id) : undefined}
                    onRestore={entry.info.role === "assistant" && nextUser ? () => void revertTo(nextUser.info.id) : undefined}
                  />
                )
              })}
              {optimisticUser && <OptimisticUserMessage text={optimisticUser} />}
              <div ref={endRef} className="h-1" />
            </div>
          )}
        </div>
      </div>

      <div className="relative shrink-0 px-5 pb-4">
        {slashMatches.length > 0 && (
          <div className="mx-auto mb-2 max-w-3xl overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
            {slashMatches.map((command) => (
              <button
                key={command.name}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-line-soft"
                onClick={() => {
                  setText(`/${command.name} `)
                  textareaRef.current?.focus()
                }}
              >
                <Terminal size={12} className="text-accent" />
                <span className="font-mono">/{command.name}</span>
                <span className="min-w-0 flex-1 truncate text-faint">{command.description ?? ""}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-line bg-surface p-2 shadow-xl shadow-black/10 transition-colors focus-within:border-accent/40">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  submit()
                }
              }}
              rows={1}
              disabled={!running}
              placeholder={
                running
                  ? t("chat.placeholder")
                  : state.backend.state === "starting"
                    ? t("chat.placeholderStarting")
                    : t("chat.placeholderUnavailable")
              }
              className="max-h-[200px] w-full resize-none bg-transparent px-2.5 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-faint disabled:opacity-50"
            />
            <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
              <ModelPicker compact direction="up" onManage={() => setView("models")} />
              <button
                data-workflow-toggle
                className={clsx(
                  "flex h-[26px] items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors",
                  architectActive
                    ? "border-accent/50 bg-accent-soft/35 text-accent"
                    : "border-line bg-surface text-muted hover:border-faint hover:text-ink",
                )}
                disabled={installingTeam}
                onClick={() => void toggleArchitect()}
                title={t("workflow.toggleHint")}
              >
                {installingTeam ? <Spinner size={11} /> : architectActive ? <Wand2 size={11} /> : <Hammer size={11} />}
                {architectActive ? t("workflow.architect") : t("workflow.build")}
              </button>
              <span className="ml-auto hidden text-[10px] text-faint sm:inline">{t("chat.composerHint")}</span>
              <div className="flex items-center gap-1">
                {busy ? (
                  <Button variant="ghost" className="h-8 px-2 text-[11.5px]" onClick={() => void abort()}>
                    <Square size={11} className="fill-current" /> {t("chat.stop")}
                  </Button>
                ) : (
                  <button
                    className={clsx(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                      text.trim() && running
                        ? "bg-accent text-accent-contrast hover:bg-accent-strong"
                        : "bg-line-soft text-faint",
                    )}
                    onClick={submit}
                    disabled={!text.trim() || !running}
                    title={t("chat.send")}
                  >
                    <ArrowUp size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-2 px-1 text-[10px] text-faint">
            <Check size={10} />
            {t("chat.footerHint")}
            {session && <span className="ml-auto shrink-0">{t("chat.messagesCount", { count: messages.length })}</span>}
          </div>
        </div>
      </div>

      </div>

      {!pages && panel === "files" && <FilePanel tab={fileTab} onTabChange={changeFileTab} onClose={() => setPanelPersisted("none")} />}
    </div>
  )
}
