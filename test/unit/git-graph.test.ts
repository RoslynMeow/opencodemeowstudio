import { describe, expect, it } from "vitest"
import type { GitCommit } from "@shared/types"
import {
  GRAPH_LANE_WIDTH,
  GRAPH_PADDING,
  GRAPH_ROW_HEIGHT,
  GRAPH_PALETTE,
  graphNodeX,
  graphNodeY,
  laneColor,
  layoutGitGraph,
} from "../../src/renderer/src/lib/git-graph"

function commit(hash: string, parents: string[] = [], subject = hash): GitCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    author: "Test",
    authorEmail: "test@example.com",
    timestamp: 0,
    subject,
    refs: [],
  }
}

describe("layoutGitGraph", () => {
  it("returns a stable empty layout", () => {
    const graph = layoutGitGraph([])

    expect(graph.rows).toEqual([])
    expect(graph.edges).toEqual([])
    expect(graph.laneCount).toBe(1)
    expect(graph.width).toBe(GRAPH_PADDING * 2 + GRAPH_LANE_WIDTH)
    expect(graph.height).toBe(GRAPH_ROW_HEIGHT)
  })

  it("lays out a linear history on one lane", () => {
    const graph = layoutGitGraph([
      commit("c3", ["c2"]),
      commit("c2", ["c1"]),
      commit("c1"),
    ])

    expect(graph.rows.map((row) => [row.commit.hash, row.row, row.lane])).toEqual([
      ["c3", 0, 0],
      ["c2", 1, 0],
      ["c1", 2, 0],
    ])
    expect(graph.edges).toHaveLength(2)
    expect(graph.edges[0]).toMatchObject({ fromRow: 0, fromLane: 0, toRow: 1, toLane: 0, parent: "c2", stub: false })
    expect(graph.edges[1]).toMatchObject({ fromRow: 1, fromLane: 0, toRow: 2, toLane: 0, parent: "c1", stub: false })
    expect(graph.laneCount).toBe(1)
    expect(graph.height).toBe(3 * GRAPH_ROW_HEIGHT)
  })

  it("lays out a merge with a side branch", () => {
    const graph = layoutGitGraph([
      commit("merge", ["a", "b"]),
      commit("a", ["base"]),
      commit("b", ["base"]),
      commit("base"),
    ])

    expect(graph.rows.map((row) => [row.commit.hash, row.lane])).toEqual([
      ["merge", 0],
      ["a", 0],
      ["b", 1],
      ["base", 0],
    ])
    expect(graph.laneCount).toBe(2)
    expect(graph.width).toBe(GRAPH_PADDING * 2 + 2 * GRAPH_LANE_WIDTH)

    expect(graph.edges).toEqual([
      expect.objectContaining({ fromRow: 0, fromLane: 0, toRow: 1, toLane: 0, parent: "a", stub: false }),
      expect.objectContaining({ fromRow: 0, fromLane: 0, toRow: 2, toLane: 1, parent: "b", stub: false }),
      expect.objectContaining({ fromRow: 1, fromLane: 0, toRow: 3, toLane: 0, parent: "base", stub: false }),
      expect.objectContaining({ fromRow: 2, fromLane: 1, toRow: 3, toLane: 0, parent: "base", stub: false }),
    ])
    expect(graph.laneOf.get("merge")).toBe(0)
    expect(graph.laneOf.get("b")).toBe(1)
    expect(graph.laneOf.get("base")).toBe(0)
  })

  it("marks parents missing from the visible history as stubs", () => {
    const graph = layoutGitGraph([commit("head", ["missing"])])

    expect(graph.edges).toEqual([
      {
        fromRow: 0,
        fromLane: 0,
        toRow: 1,
        toLane: 0,
        color: laneColor(0),
        parent: "missing",
        stub: true,
      },
    ])
  })

  it("reuses lane zero for independent roots", () => {
    const graph = layoutGitGraph([commit("a"), commit("b")])

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0])
    expect(graph.edges).toEqual([])
    expect(graph.laneCount).toBe(1)
  })

  it("assigns the first-parent edge the commit lane colour", () => {
    const graph = layoutGitGraph([
      commit("merge", ["a", "b"]),
      commit("a", ["base"]),
      commit("b", ["base"]),
      commit("base"),
    ])

    const [firstParent, secondParent] = graph.edges
    expect(firstParent?.color).toBe(laneColor(0))
    expect(secondParent?.color).toBe(laneColor(1))
  })
})

describe("laneColor", () => {
  it("cycles through the palette", () => {
    expect(laneColor(0)).toBe(GRAPH_PALETTE[0])
    expect(laneColor(GRAPH_PALETTE.length)).toBe(GRAPH_PALETTE[0])
    expect(laneColor(GRAPH_PALETTE.length + 1)).toBe(GRAPH_PALETTE[1])
  })

  it("handles negative lanes", () => {
    expect(laneColor(-1)).toBe(GRAPH_PALETTE[GRAPH_PALETTE.length - 1])
  })
})

describe("graph geometry helpers", () => {
  it("computes node positions", () => {
    expect(graphNodeX(0)).toBe(GRAPH_PADDING)
    expect(graphNodeX(2)).toBe(GRAPH_PADDING + 2 * GRAPH_LANE_WIDTH)
    expect(graphNodeY(0)).toBe(GRAPH_ROW_HEIGHT / 2)
    expect(graphNodeY(1)).toBe(GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2)
  })
})
