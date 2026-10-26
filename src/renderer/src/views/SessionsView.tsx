import { Activity, Coins, MessageSquare, Plus, Users } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useStudio } from "../store/useStore"
import { Button, EmptyState, PageHeader } from "../components/ui"
import { SessionGraph } from "../components/SessionGraph"
import { SessionMergeGraph } from "../components/SessionMergeGraph"
import { useT } from "../i18n/useT"
import { buildSessionTree, collectSessionIds } from "../lib/session-tree"
import { sessionTitle } from "../lib/session-title"

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`
}

function compactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function SessionsView() {
  const { t } = useT()
  const state = useStudio((store) => store.state)
  const sessions = useStudio((store) => store.sessions)
  const activeSessionId = useStudio((store) => store.activeSessionId)
  const sessionStatuses = useStudio((store) => store.sessionStatuses)
  const usage = useStudio((store) => store.usage)
  const worktrees = useStudio((store) => store.worktrees)
  const merges = useStudio((store) => store.merges)
  const mainBranch = useStudio((store) => store.mainBranch)
  const mergeSessionWorktree = useStudio((store) => store.mergeSessionWorktree)
  const refreshWorktrees = useStudio((store) => store.refreshWorktrees)
  const treeVersion = useStudio((store) => store.treeVersion)
  const refreshUsage = useStudio((store) => store.refreshUsage)
  const setView = useStudio((store) => store.setView)
  const newSession = useStudio((store) => store.newSession)
  const openSession = useStudio((store) => store.openSession)
  const deleteSession = useStudio((store) => store.deleteSession)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    void refreshWorktrees()
  }, [refreshWorktrees])

  const roots = useMemo(
    () => sessions.filter((session) => !session.parentID).sort((a, b) => b.time.updated - a.time.updated),
    [sessions],
  )
  const trees = useMemo(
    () => roots.map((root) => buildSessionTree(sessions, root.id)).filter((tree) => tree !== null),
    [roots, sessions, treeVersion],
  )
  const allIds = useMemo(() => [...new Set(trees.flatMap((tree) => collectSessionIds(tree)))], [trees])
  const worktreeBySession = useMemo(() => new Map(worktrees.map((item) => [item.sessionId, item])), [worktrees])

  useEffect(() => {
    if (allIds.length === 0) return
    void refreshUsage(allIds)
    const timer = setInterval(() => void refreshUsage(allIds), 4000)
    return () => clearInterval(timer)
  }, [allIds.join("|"), refreshUsage])

  if (!state) return null

  const totalCost = allIds.reduce((sum, id) => sum + (usage[id]?.cost ?? 0), 0)
  const totalTokens = allIds.reduce((sum, id) => {
    const item = usage[id]
    return sum + (item ? item.tokens.input + item.tokens.output : 0)
  }, 0)
  const running = allIds.filter((id) => sessionStatuses[id]?.type === "busy" || sessionStatuses[id]?.type === "retry").length

  const open = (id: string) => {
    setView("chat")
    void openSession(id)
  }

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const remove = (id: string) => {
    const session = sessions.find((item) => item.id === id)
    if (!window.confirm(t("sessions.deleteTreeConfirm", { title: sessionTitle(session?.title, t("chat.newConversation")) }))) return
    void deleteSession(id)
  }

  const merge = (id: string) => {
    const session = sessions.find((item) => item.id === id)
    const worktree = worktreeBySession.get(id)
    if (!worktree) return
    const title = sessionTitle(session?.title, t("chat.newConversation"))
    if (!window.confirm(t("worktree.mergeConfirm", { title, branch: worktree.branch, target: worktree.baseBranch }))) return
    void mergeSessionWorktree(id)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={t("sessions.eyebrow")}
        title={t("sessions.title")}
        description={t("sessions.graphDescription")}
        actions={
          <Button variant="primary" onClick={() => void newSession()} disabled={!state.activeProject || state.backend.state !== "running"}>
            <Plus size={14} /> {t("sidebar.newChat")}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {roots.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={26} />}
            title={t("sessions.emptyTitle")}
            description={t("sessions.emptyDesc")}
            action={
              <Button variant="primary" onClick={() => void newSession()} disabled={!state.activeProject || state.backend.state !== "running"}>
                <Plus size={14} /> {t("sidebar.newChat")}
              </Button>
            }
          />
        ) : (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2 text-[11px] text-muted">
                <MessageSquare size={13} className="text-accent" /> {t("sessions.roots", { count: roots.length })}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2 text-[11px] text-muted">
                <Users size={13} className="text-accent" /> {t("sessions.subagents", { count: Math.max(0, allIds.length - roots.length) })}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2 text-[11px] text-muted">
                <Coins size={13} className="text-accent" /> {formatCost(totalCost)}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2 text-[11px] text-muted">
                <Activity size={13} className="text-accent" /> {compactTokens(totalTokens)} tok · {t("sessions.running", { count: running })}
              </div>
            </div>

            <SessionMergeGraph
              roots={roots}
              worktrees={worktrees}
              merges={merges}
              mainBranch={mainBranch}
              activeSessionId={activeSessionId}
              onOpen={open}
              onMerge={merge}
            />

            {trees.map((tree) => (
              <div key={tree.session.id} className="overflow-hidden rounded-xl border border-line bg-surface/35">
                <SessionGraph
                  tree={tree}
                  usage={usage}
                  statuses={sessionStatuses}
                  activeSessionId={activeSessionId}
                  collapsed={collapsed}
                  onToggleCollapse={toggle}
                  onOpen={open}
                  onDelete={remove}
                  onMerge={merge}
                  worktree={worktreeBySession.get(tree.session.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}