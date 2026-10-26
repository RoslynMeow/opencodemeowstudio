import clsx from "clsx"
import { GitMerge } from "lucide-react"
import type { MergeInfo, Session, WorktreeInfo } from "@shared/types"
import { useT } from "../i18n/useT"
import { sessionTitle } from "../lib/session-title"

const NODE_WIDTH = 196
const NODE_GAP = 18
const MAIN_WIDTH = 260
const TOP = 14
const MAIN_HEIGHT = 52
const ROOT_Y = 148
const ROOT_HEIGHT = 58
const HEIGHT = 236

function shortBranch(branch: string): string {
  return branch.replace("meow/session-", "")
}

export function SessionMergeGraph({
  roots,
  worktrees,
  merges,
  mainBranch,
  activeSessionId,
  onOpen,
  onMerge,
}: {
  roots: Session[]
  worktrees: WorktreeInfo[]
  merges: MergeInfo[]
  mainBranch: string | null
  activeSessionId: string | null
  onOpen: (id: string) => void
  onMerge: (id: string) => void
}) {
  const { t } = useT()
  const bySession = new Map(worktrees.map((item) => [item.sessionId, item]))
  const items = roots.filter((session) => bySession.has(session.id))
  if (items.length === 0) return null

  const width = Math.max(680, items.length * (NODE_WIDTH + NODE_GAP) + NODE_GAP * 2)
  const startX = (width - (items.length * NODE_WIDTH + (items.length - 1) * NODE_GAP)) / 2
  const mainX = (width - MAIN_WIDTH) / 2
  const mainCenter = mainX + MAIN_WIDTH / 2

  return (
    <div className="rounded-xl border border-line bg-surface/35 p-4">
      <div className="flex items-center gap-2">
        <GitMerge size={14} className="text-accent" />
        <div>
          <div className="card-heading">{t("worktree.graphTitle")}</div>
          <div className="text-[10.5px] text-faint">{t("worktree.graphDesc")}</div>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="relative" style={{ minWidth: width, height: HEIGHT }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={HEIGHT}>
            {items.map((session, index) => {
              const worktree = bySession.get(session.id) as WorktreeInfo
              const x = startX + index * (NODE_WIDTH + NODE_GAP) + NODE_WIDTH / 2
              const stroke =
                worktree.status === "merged"
                  ? "var(--color-good)"
                  : worktree.status === "conflict"
                    ? "var(--color-bad)"
                    : worktree.status === "missing"
                      ? "var(--color-warn)"
                      : "var(--color-accent)"
              return (
                <path
                  key={`merge-edge-${session.id}`}
                  d={`M ${x} ${ROOT_Y} C ${x} ${ROOT_Y - 38}, ${mainCenter} ${TOP + MAIN_HEIGHT + 36}, ${mainCenter} ${TOP + MAIN_HEIGHT}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={worktree.status === "merged" ? 2 : 1.5}
                  strokeLinecap="round"
                  strokeDasharray={worktree.status === "merged" ? undefined : "4 4"}
                  opacity={0.9}
                />
              )
            })}
          </svg>

          <div
            className="absolute flex flex-col items-center justify-center rounded-xl border border-accent/30 bg-accent-soft/20 px-3 text-center"
            style={{ left: mainX, top: TOP, width: MAIN_WIDTH, height: MAIN_HEIGHT }}
          >
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">{t("worktree.mainBranch")}</div>
            <div className="mt-0.5 max-w-full truncate font-mono text-[11.5px] text-ink">{mainBranch ?? "main"}</div>
          </div>

          {items.map((session, index) => {
            const worktree = bySession.get(session.id) as WorktreeInfo
            const merge = [...merges].reverse().find((item) => item.sessionId === session.id)
            const active = session.id === activeSessionId
            return (
              <div
                key={session.id}
                className={clsx(
                  "absolute rounded-xl border bg-canvas px-2.5 py-2",
                  active ? "border-accent/60" : "border-line",
                  worktree.status === "conflict" && "border-bad/45",
                )}
                style={{ left: startX + index * (NODE_WIDTH + NODE_GAP), top: ROOT_Y, width: NODE_WIDTH, height: ROOT_HEIGHT }}
              >
                <button className="block w-full text-left" onClick={() => onOpen(session.id)}>
                  <div className="truncate text-[11px] font-medium text-ink">
                    {sessionTitle(session.title, t("chat.newConversation"))}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[9px]">
                    <span className="shrink-0 rounded border border-line px-1 font-mono text-faint">{shortBranch(worktree.branch)}</span>
                    <span
                      className={clsx(
                        "truncate",
                        worktree.status === "merged"
                          ? "text-good"
                          : worktree.status === "conflict"
                            ? "text-bad"
                            : worktree.status === "missing"
                              ? "text-warn"
                              : "text-accent",
                      )}
                    >
                      {worktree.status === "merged"
                        ? t("worktree.merged")
                        : worktree.status === "conflict"
                          ? t("worktree.conflict")
                          : worktree.status === "missing"
                            ? t("worktree.missing")
                            : t("worktree.active")}
                      {worktree.status === "merged" && (worktree.commit ?? merge?.commit) ? ` · ${worktree.commit ?? merge?.commit}` : ""}
                    </span>
                  </div>
                </button>
                {worktree.status === "active" && (
                  <button
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-line-soft hover:text-accent"
                    title={t("worktree.merge")}
                    onClick={() => onMerge(session.id)}
                  >
                    <GitMerge size={11} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
