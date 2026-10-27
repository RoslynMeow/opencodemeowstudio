import { describe, expect, it } from "vitest"
import type { Session } from "@shared/types"
import type { SessionTreeNode } from "../../src/renderer/src/lib/session-tree"
import {
  SESSION_GRAPH_LANE_WIDTH,
  SESSION_GRAPH_PADDING,
  SESSION_GRAPH_ROW_HEIGHT,
  layoutSessionGraph,
  sessionEdgePath,
  sessionNodeX,
  sessionNodeY,
} from "../../src/renderer/src/lib/session-graph-layout"

function session(id: string, parentID?: string): Session {
  return { id, parentID, title: id, time: { created: 0 } } as unknown as Session
}

function node(id: string, children: SessionTreeNode[] = []): SessionTreeNode {
  return { session: session(id), children }
}

describe("layoutSessionGraph", () => {
  it("returns an empty layout for a null tree", () => {
    expect(layoutSessionGraph(null)).toEqual({ rows: [], lanes: 1, width: 0, height: 0 })
  })

  it("lays out a single root", () => {
    const graph = layoutSessionGraph(node("root"))

    expect(graph.rows).toEqual([{ node: expect.objectContaining({ session: expect.objectContaining({ id: "root" }) }), row: 0, lane: 0, parentRow: undefined, parentLane: undefined }])
    expect(graph.lanes).toBe(1)
    expect(graph.width).toBe(SESSION_GRAPH_PADDING * 2 + SESSION_GRAPH_LANE_WIDTH)
    expect(graph.height).toBe(SESSION_GRAPH_ROW_HEIGHT)
  })

  it("keeps the first child on the parent lane and gives siblings new lanes", () => {
    const tree = node("root", [node("first"), node("second"), node("third")])
    const graph = layoutSessionGraph(tree)

    expect(graph.rows.map((row) => [row.node.session.id, row.row, row.lane])).toEqual([
      ["root", 0, 0],
      ["first", 1, 0],
      ["second", 2, 1],
      ["third", 3, 2],
    ])
    expect(graph.rows[1]).toMatchObject({ parentRow: 0, parentLane: 0 })
    expect(graph.rows[2]).toMatchObject({ parentRow: 0, parentLane: 0 })
    expect(graph.lanes).toBe(3)
    expect(graph.width).toBe(SESSION_GRAPH_PADDING * 2 + 3 * SESSION_GRAPH_LANE_WIDTH)
    expect(graph.height).toBe(4 * SESSION_GRAPH_ROW_HEIGHT)
  })

  it("keeps a single-child chain on lane 0", () => {
    const graph = layoutSessionGraph(node("root", [node("a", [node("b")])]))

    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 0])
    expect(graph.rows.map((row) => row.parentRow)).toEqual([undefined, 0, 1])
    expect(graph.lanes).toBe(1)
  })

  it("allocates lanes for nested siblings", () => {
    const tree = node("root", [
      node("a", [node("a1"), node("a2")]),
      node("b"),
    ])
    const graph = layoutSessionGraph(tree)

    expect(graph.rows.map((row) => [row.node.session.id, row.lane])).toEqual([
      ["root", 0],
      ["a", 0],
      ["a1", 0],
      ["a2", 1],
      ["b", 2],
    ])
    expect(graph.lanes).toBe(3)
  })

  it("omits children of collapsed nodes only", () => {
    const tree = node("root", [node("a", [node("a1")]), node("b")])

    expect(layoutSessionGraph(tree, new Set(["root"])).rows.map((row) => row.node.session.id)).toEqual(["root"])

    const collapsedChild = layoutSessionGraph(tree, new Set(["a"]))
    expect(collapsedChild.rows.map((row) => row.node.session.id)).toEqual(["root", "a", "b"])
    expect(collapsedChild.rows.map((row) => row.row)).toEqual([0, 1, 2])
  })
})

describe("session graph geometry helpers", () => {
  it("computes node positions", () => {
    expect(sessionNodeX(0)).toBe(10)
    expect(sessionNodeX(2)).toBe(42)
    expect(sessionNodeY(0)).toBe(20)
    expect(sessionNodeY(1)).toBe(60)
  })

  it("draws a straight path for same-lane edges", () => {
    expect(
      sessionEdgePath({ node: node("child"), row: 1, lane: 0, parentRow: 0, parentLane: 0 }),
    ).toBe("M 10 20 L 10 60")
  })

  it("draws a curved path for cross-lane edges", () => {
    expect(
      sessionEdgePath({ node: node("child"), row: 1, lane: 1, parentRow: 0, parentLane: 0 }),
    ).toMatch(/^M 10 20 C 10 [\d.]+, 26 [\d.]+, 26 60$/)
  })
})
