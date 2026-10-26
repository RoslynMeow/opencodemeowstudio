import clsx from "clsx"
import { ChevronDown, ChevronRight, FolderMinus, GitMerge, Trash2 } from "lucide-react"
import type { SessionStatus, SessionUsage, WorktreeInfo } from "@shared/types"
import { useMemo } from "react"
import type { SessionTreeNode } from "../lib/session-tree"
import { sessionTitle } from "../lib/session-title"
import { useT } from "../i18n/useT"

const ROW_HEIGHT = 40
const LANE_WIDTH = 16
const PADDING = 10
const COLORS = ["#f0b35c", "#6aa8ff", "#7dd3a7", "#e879a6", "#b99cff", "#f28f6b", "#7ee0e6", "#d4d45a"]

interface GraphRow {
  node: SessionTreeNode
  row: number
  lane: number
  parentRow?: number
  parentLane?: number
}

function layout(tree: SessionTreeNode | null, collapsed?: Set<string>): { rows: GraphRow[]; lanes: number; width: number; height: number } {
  if (!tree) return { rows: [], lanes: 1, width: 0, height: 0 }
  const rows: GraphRow[] = []
  let nextLane = 1
  let lanes = 1
  const visit = (node: SessionTreeNode, lane: number, parent?: GraphRow) => {
    const row = rows.length
    const entry: GraphRow = { node, row, lane, parentRow: parent?.row, parentLane: parent?.lane }
    rows.push(entry)
    lanes = Math.max(lanes, lane + 1)
    if (!collapsed?.has(node.session.id)) {
      node.children.forEach((child, index) => {
        const childLane = index === 0 ? lane : nextLane++
        visit(child, childLane, entry)
      })
    }
  }
  visit(tree, 0)
  return {
    rows,
    lanes,
    width: PADDING * 2 + lanes * LANE_WIDTH,
    height: Math.max(rows.length * ROW_HEIGHT, ROW_HEIGHT),
  }
}

export function SessionGraph({
  tree,
  usage,
  statuses,
  activeSessionId,
  onOpen,
  onDelete,
  onMerge,
  worktree,
  collapsed,
  onToggleCollapse,
}: {
  tree: SessionTreeNode | null
  usage: Record<string, SessionUsage>
  statuses: Record<string, SessionStatus>
  activeSessionId: string | null
  onOpen: (id: string) => void
  onDelete?: (id: string) => void
  onMerge?: (id: string) => void
  worktree?: WorktreeInfo
  collapsed?: Set<string>
  onToggleCollapse?: (id: string) => void
}) {
  const { t } = useT()
  const graph = useMemo(() => layout(tree, collapsed), [tree, collapsed])

  if (!tree || graph.rows.length === 0) {
    return <div className="px-3 py-8 text-center text-[11px] text-faint">{t("sidebar.noSessions")}</div>
  }

  const laneColor = (lane: number) => COLORS[lane % COLORS.length] ?? COLORS[0]

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="relative" style={{ height: graph.height, minWidth: graph.width + 220 }}>
        <svg className="pointer-events-none absolute left-0 top-0 z-10" width={graph.width} height={graph.height}>
          {graph.rows.map((row) =>
            row.parentRow === undefined ? null : (
              <path
                key={`edge-${row.node.session.id}`}
                d={edgePath(row)}
                fill="none"
                stroke={laneColor(row.lane)}
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.8}
              />
            ),
          )}
          {graph.rows.map((row) => {
            const status = statuses[row.node.session.id]?.type
            const done = usage[row.node.session.id]?.completed
            const color = laneColor(row.lane)
            return (
              <g key={`node-${row.node.session.id}`}>
                {activeSessionId === row.node.session.id && (
                  <circle cx={nodeX(row.lane)} cy={nodeY(row.row)} r={6.5} fill="none" stroke="var(--color-accent)" strokeWidth={1.4} />
                )}
                <circle
                  cx={nodeX(row.lane)}
                  cy={nodeY(row.row)}
                  r={4}
                  fill={status === "busy" || status === "retry" ? "var(--color-accent)" : done ? "var(--color-good)" : color}
                  stroke={color}
                  strokeWidth={1}
                />
              </g>
            )
          })}
        </svg>
        {graph.rows.map((row) => {
          const session = row.node.session
          const item = usage[session.id]
          const status = statuses[session.id]?.type
          const active = session.id === activeSessionId
          const hasChildren = row.node.children.length > 0
          const isCollapsed = collapsed?.has(session.id) ?? false
          const root = !session.parentID
          return (
            <div
              key={session.id}
              className={clsx("group absolute inset-x-0 flex h-[38px] items-center gap-1 rounded-md pr-1", active ? "bg-raised/50" : "hover:bg-line-soft/40")}
              style={{ top: row.row * ROW_HEIGHT + 1, paddingLeft: graph.width + 8 }}
            >
              {hasChildren ? (
                <button
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-line-soft hover:text-ink"
                  onClick={() => onToggleCollapse?.(session.id)}
                  title={isCollapsed ? t("sessions.expand") : t("sessions.collapse")}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
              <button
                data-session-graph-node={session.id}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => onOpen(session.id)}
                title={`${sessionTitle(session.title, t("chat.newConversation"))} · ${item?.agent ?? t("tree.subagent")}`}
              >
                <span className={clsx("min-w-0 flex-1 truncate text-[11.5px]", root ? "font-semibold text-ink" : "text-muted")}>
                  {sessionTitle(session.title, t("chat.newConversation"))}
                </span>
                {hasChildren && (
                  <span className="shrink-0 text-[8.5px] text-faint">{t("sessions.subagents", { count: row.node.children.length })}</span>
                )}
                {root && worktree && (
                  <span
                    className={clsx(
                      "shrink-0 rounded border px-1 py-0.5 font-mono text-[8.5px]",
                      worktree.status === "merged"
                        ? "border-good/35 bg-good/10 text-good"
                        : worktree.status === "conflict"
                          ? "border-bad/35 bg-bad/10 text-bad"
                          : worktree.status === "missing"
                            ? "border-warn/35 bg-warn/10 text-warn"
                            : "border-line bg-surface text-faint",
                    )}
                    title={`${worktree.branch} → ${worktree.baseBranch}`}
                  >
                    {worktree.status === "merged" ? t("worktree.merged") : worktree.status === "conflict" ? t("worktree.conflict") : worktree.status === "missing" ? t("worktree.missing") : shortBranch(worktree.branch)}
                  </span>
                )}
                <span className="shrink-0 rounded border border-line bg-surface px-1 py-0.5 text-[8.5px] text-faint">
                  {item?.agent ?? t("tree.subagent")}
                </span>
                {status === "busy" || status === "retry" ? (
                  <span className="shrink-0 text-[8.5px] text-accent">{status === "retry" ? t("status.retry") : t("status.busy")}</span>
                ) : (
                  <span className="shrink-0 text-[8.5px] text-faint">
                    {item ? `$${item.cost.toFixed(4)} · ${(item.tokens.input + item.tokens.output).toLocaleString()} tok` : ""}
                  </span>
                )}
              </button>
              {root && worktree && worktree.status === "active" && onMerge && status !== "busy" && status !== "retry" && (
                <button
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors hover:bg-line-soft hover:text-accent group-hover:opacity-100"
                  onClick={() => onMerge(session.id)}
                  title={t("worktree.merge")}
                >
                  <GitMerge size={10} />
                </button>
              )}
              {onDelete && (
                <button
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors hover:bg-line-soft hover:text-bad group-hover:opacity-100"
                  onClick={() => onDelete(session.id)}
                  title={t("sessions.deleteTree")}
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function shortBranch(branch: string): string {
  return branch.replace("meow/session-", "")
}

function nodeX(lane: number): number {
  return PADDING + lane * LANE_WIDTH
}

function nodeY(row: number): number {
  return row * ROW_HEIGHT + ROW_HEIGHT / 2
}

function edgePath(row: GraphRow): string {
  const x1 = nodeX(row.parentLane ?? row.lane)
  const y1 = nodeY(row.parentRow ?? row.row)
  const x2 = nodeX(row.lane)
  const y2 = nodeY(row.row)
  if (Math.abs(x1 - x2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const bend = Math.min(20, Math.max(6, (y2 - y1) / 3))
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
}