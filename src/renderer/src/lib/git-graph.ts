import type { GitCommit } from "@shared/types"

export const GRAPH_ROW_HEIGHT = 34
export const GRAPH_LANE_WIDTH = 14
export const GRAPH_PADDING = 10
export const GRAPH_PALETTE = [
  "#f0b35c",
  "#6aa8ff",
  "#7dd3a7",
  "#e879a6",
  "#b99cff",
  "#f28f6b",
  "#7ee0e6",
  "#d4d45a",
  "#9db4ff",
  "#f7a8c4",
]

export interface GitGraphRow {
  commit: GitCommit
  lane: number
  row: number
}

export interface GitGraphEdge {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  color: string
  parent: string
  stub: boolean
}

export interface GitGraphLayout {
  rows: GitGraphRow[]
  edges: GitGraphEdge[]
  laneCount: number
  width: number
  height: number
  laneOf: Map<string, number>
}

export function laneColor(lane: number): string {
  return GRAPH_PALETTE[((lane % GRAPH_PALETTE.length) + GRAPH_PALETTE.length) % GRAPH_PALETTE.length] ?? "#f0b35c"
}

export function layoutGitGraph(commits: GitCommit[]): GitGraphLayout {
  const rows: GitGraphRow[] = []
  const laneOf = new Map<string, number>()
  const active: Array<string | null> = []

  commits.forEach((commit, row) => {
    let lane = active.indexOf(commit.hash)
    if (lane === -1) {
      lane = active.indexOf(null)
      if (lane === -1) {
        lane = active.length
        active.push(null)
      }
    }
    rows.push({ commit, lane, row })
    laneOf.set(commit.hash, lane)

    for (let index = 0; index < active.length; index += 1) {
      if (active[index] === commit.hash) active[index] = null
    }

    const [firstParent, ...otherParents] = commit.parents
    if (firstParent) {
      const existing = active.indexOf(firstParent)
      if (existing === -1) active[lane] = firstParent
    }
    for (const parent of otherParents) {
      if (active.includes(parent)) continue
      let free = active.findIndex((value, index) => value === null && index !== lane)
      if (free === -1) {
        free = active.length
        active.push(parent)
      } else {
        active[free] = parent
      }
    }
    while (active.length > 0 && active[active.length - 1] === null) active.pop()
  })

  const rowOf = new Map<string, number>()
  rows.forEach((row) => rowOf.set(row.commit.hash, row.row))
  const laneCount = Math.max(1, ...rows.map((row) => row.lane + 1))
  const width = GRAPH_PADDING * 2 + laneCount * GRAPH_LANE_WIDTH
  const height = Math.max(rows.length * GRAPH_ROW_HEIGHT, GRAPH_ROW_HEIGHT)
  const edges: GitGraphEdge[] = []

  rows.forEach((row) => {
    row.commit.parents.forEach((parent, parentIndex) => {
      const targetLane = laneOf.get(parent)
      const targetRow = rowOf.get(parent)
      const stub = targetLane === undefined || targetRow === undefined
      const toLane = targetLane ?? row.lane
      const toRow = stub ? rows.length : targetRow
      edges.push({
        fromRow: row.row,
        fromLane: row.lane,
        toRow,
        toLane,
        color: laneColor(parentIndex === 0 ? row.lane : toLane),
        parent,
        stub,
      })
    })
  })

  return { rows, edges, laneCount, width, height, laneOf }
}

export function graphNodeX(lane: number): number {
  return GRAPH_PADDING + lane * GRAPH_LANE_WIDTH
}

export function graphNodeY(row: number): number {
  return row * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2
}
