import { describe, expect, it } from "vitest"
import type { Session } from "@shared/types"
import {
  buildSessionTree,
  collectSessionIds,
  countDescendants,
  sessionRootId,
  type SessionTreeNode,
} from "../../src/renderer/src/lib/session-tree"

function session(id: string, parentID: string | undefined, created: number, title = id): Session {
  return {
    id,
    parentID,
    title,
    time: { created },
  } as unknown as Session
}

function ids(node: SessionTreeNode | null): string[] {
  return collectSessionIds(node)
}

describe("sessionRootId", () => {
  const sessions = [session("root", undefined, 1), session("child", "root", 2), session("grandchild", "child", 3)]

  it("returns null when no session is selected", () => {
    expect(sessionRootId(sessions, null)).toBeNull()
  })

  it("returns null for an unknown session", () => {
    expect(sessionRootId(sessions, "missing")).toBeNull()
  })

  it("walks up to the top-level ancestor", () => {
    expect(sessionRootId(sessions, "grandchild")).toBe("root")
    expect(sessionRootId(sessions, "root")).toBe("root")
  })

  it("stops at an orphan whose parent is absent", () => {
    const orphan = [session("orphan", "missing-parent", 1)]
    expect(sessionRootId(orphan, "orphan")).toBe("orphan")
  })

  it("does not loop forever on a parent cycle", () => {
    const cycle = [session("a", "b", 1), session("b", "a", 2)]
    expect(sessionRootId(cycle, "a")).toBe("a")
    expect(sessionRootId(cycle, "b")).toBe("b")
  })
})

describe("buildSessionTree", () => {
  it("returns null for a null or missing root", () => {
    expect(buildSessionTree([], null)).toBeNull()
    expect(buildSessionTree([session("root", undefined, 1)], "missing")).toBeNull()
  })

  it("builds a tree sorted by creation time", () => {
    const sessions = [
      session("root", undefined, 1),
      session("late", "root", 30),
      session("early", "root", 10),
      session("middle", "root", 20),
    ]
    const tree = buildSessionTree(sessions, "root")

    expect(tree?.session.id).toBe("root")
    expect(tree?.children.map((child) => child.session.id)).toEqual(["early", "middle", "late"])
  })

  it("nests descendants and ignores unrelated sessions", () => {
    const sessions = [
      session("root", undefined, 1),
      session("a", "root", 2),
      session("b", "root", 3),
      session("a1", "a", 4),
      session("a2", "a", 5),
      session("other", undefined, 6),
    ]
    const tree = buildSessionTree(sessions, "root")

    expect(ids(tree)).toEqual(["root", "a", "a1", "a2", "b"])
    expect(tree?.children[0]?.children.map((child) => child.session.id)).toEqual(["a1", "a2"])
  })

  it("does not duplicate the root as its own child", () => {
    const sessions = [session("root", undefined, 1), session("child", "root", 2)]
    const tree = buildSessionTree(sessions, "root")

    expect(tree?.children.map((child) => child.session.id)).toEqual(["child"])
    expect(ids(tree)).toEqual(["root", "child"])
  })

  it("stops when a parent cycle is present", () => {
    const sessions = [session("root", "child", 1), session("child", "root", 2)]
    const tree = buildSessionTree(sessions, "root")

    expect(ids(tree)).toEqual(["root", "child"])
  })
})

describe("collectSessionIds and countDescendants", () => {
  const tree = buildSessionTree(
    [
      session("root", undefined, 1),
      session("a", "root", 2),
      session("a1", "a", 3),
      session("b", "root", 4),
    ],
    "root",
  )

  it("returns an empty list for a null tree", () => {
    expect(collectSessionIds(null)).toEqual([])
  })

  it("collects ids in depth-first order", () => {
    expect(collectSessionIds(tree)).toEqual(["root", "a", "a1", "b"])
  })

  it("counts all descendants", () => {
    expect(countDescendants(tree)).toBe(3)
    expect(countDescendants(tree?.children[0] ?? null)).toBe(1)
    expect(countDescendants(tree?.children[1] ?? null)).toBe(0)
    expect(countDescendants(null)).toBe(0)
  })
})
