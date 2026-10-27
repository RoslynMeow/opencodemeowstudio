import type { SessionTreeNode } from "./session-tree"

export const SESSION_GRAPH_ROW_HEIGHT = 40
export const SESSION_GRAPH_LANE_WIDTH = 16
export const SESSION_GRAPH_PADDING = 10

export interface SessionGraphRow {
  node: SessionTreeNode
  row: number
  lane: number
  parentRow?: number
  parentLane?: number
}

export interface SessionGraphLayout {
  rows: SessionGraphRow[]
  lanes: number
  width: number
  height: number
}

export function layoutSessionGraph(tree: SessionTreeNode | null, collapsed?: Set<string>): SessionGraphLayout {
  if (!tree) return { rows: [], lanes: 1, width: 0, height: 0 }
  const rows: SessionGraphRow[] = []
  let nextLane = 1
  let lanes = 1
  const visit = (node: SessionTreeNode, lane: number, parent?: SessionGraphRow) => {
    const row = rows.length
    const entry: SessionGraphRow = { node, row, lane, parentRow: parent?.row, parentLane: parent?.lane }
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
    width: SESSION_GRAPH_PADDING * 2 + lanes * SESSION_GRAPH_LANE_WIDTH,
    height: Math.max(rows.length * SESSION_GRAPH_ROW_HEIGHT, SESSION_GRAPH_ROW_HEIGHT),
  }
}

export function sessionNodeX(lane: number): number {
  return SESSION_GRAPH_PADDING + lane * SESSION_GRAPH_LANE_WIDTH
}

export function sessionNodeY(row: number): number {
  return row * SESSION_GRAPH_ROW_HEIGHT + SESSION_GRAPH_ROW_HEIGHT / 2
}

export function sessionEdgePath(row: SessionGraphRow): string {
  const x1 = sessionNodeX(row.parentLane ?? row.lane)
  const y1 = sessionNodeY(row.parentRow ?? row.row)
  const x2 = sessionNodeX(row.lane)
  const y2 = sessionNodeY(row.row)
  if (Math.abs(x1 - x2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const bend = Math.min(20, Math.max(6, (y2 - y1) / 3))
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
}
