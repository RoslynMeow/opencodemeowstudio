import type { Session } from "@shared/types"

export interface SessionTreeNode {
  session: Session
  children: SessionTreeNode[]
}

export function sessionRootId(sessions: Session[], sessionId: string | null): string | null {
  if (!sessionId) return null
  const byId = new Map(sessions.map((session) => [session.id, session]))
  let current = byId.get(sessionId)
  const seen = new Set<string>()
  while (current?.parentID && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = byId.get(current.parentID)
    if (!parent) break
    current = parent
  }
  return current?.id ?? null
}

export function buildSessionTree(sessions: Session[], rootId: string | null): SessionTreeNode | null {
  if (!rootId) return null
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const root = byId.get(rootId)
  if (!root) return null
  const childrenByParent = new Map<string, Session[]>()
  for (const session of sessions) {
    if (!session.parentID || session.id === rootId) continue
    const list = childrenByParent.get(session.parentID) ?? []
    list.push(session)
    childrenByParent.set(session.parentID, list)
  }
  const visited = new Set<string>()
  const build = (session: Session): SessionTreeNode => {
    visited.add(session.id)
    const children = (childrenByParent.get(session.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .sort((a, b) => a.time.created - b.time.created)
      .map(build)
    return { session, children }
  }
  return build(root)
}

export function collectSessionIds(node: SessionTreeNode | null): string[] {
  if (!node) return []
  return [node.session.id, ...node.children.flatMap(collectSessionIds)]
}

export function countDescendants(node: SessionTreeNode | null): number {
  if (!node) return 0
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0)
}
