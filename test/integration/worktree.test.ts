import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MergeInfo, Project, WorktreeInfo } from "@shared/types"

const state = vi.hoisted(() => ({
  worktrees: new Map<string, WorktreeInfo>(),
  merges: [] as MergeInfo[],
  logs: [] as string[],
}))

vi.mock("../../src/main/store", () => ({
  getWorktrees: (projectId: string) =>
    [...state.worktrees.values()].filter((info) => info.projectId === projectId),
  getWorktree: (sessionId: string) => state.worktrees.get(sessionId),
  upsertWorktree: (info: WorktreeInfo) => {
    state.worktrees.set(info.sessionId, info)
  },
  removeWorktreeRecord: (sessionId: string) => {
    state.worktrees.delete(sessionId)
  },
  getMerges: (projectId: string) => state.merges.filter((merge) => merge.projectId === projectId),
  upsertMerge: (merge: MergeInfo) => {
    const index = state.merges.findIndex((item) => item.id === merge.id)
    if (index === -1) state.merges.push(merge)
    else state.merges[index] = merge
  },
}))

vi.mock("../../src/main/logger", () => ({
  log: (scope: string, message: string) => {
    state.logs.push(`[${scope}] ${message}`)
  },
}))

import { gitOperation, runGitSync } from "../../src/main/git-service"
import {
  createSessionWorktree,
  currentBranch,
  isGitRepo,
  listWorktreeView,
  mergeSessionWorktree,
  recordCreatedWorktree,
  removeSessionWorktree,
  worktreeRoot,
} from "../../src/main/worktree-service"

let root: string
let repo: string
let project: Project
let sessionId: string

function git(path: string, args: string[]): string {
  return runGitSync(path, args)
}

function write(path: string, content: string): void {
  writeFileSync(join(path, "app.txt"), content, "utf8")
}

function commit(path: string, content: string, message: string): string {
  write(path, content)
  git(path, ["add", "app.txt"])
  git(path, ["commit", "-m", message])
  return git(path, ["rev-parse", "HEAD"]).trim()
}

function branchExists(branch: string): boolean {
  try {
    git(repo, ["rev-parse", "--verify", branch])
    return true
  } catch {
    return false
  }
}

function isAncestor(branch: string, target: string): boolean {
  try {
    git(repo, ["merge-base", "--is-ancestor", branch, target])
    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "meowstudio-worktree-"))
  repo = join(root, "repo")
  mkdirSync(repo, { recursive: true })
  git(repo, ["init", "-b", "main"])
  git(repo, ["config", "user.name", "MeowStudio Test"])
  git(repo, ["config", "user.email", "test@example.com"])
  git(repo, ["config", "core.autocrlf", "false"])
  git(repo, ["config", "core.eol", "lf"])
  write(repo, "base\n")
  writeFileSync(join(repo, "opencode.json"), '{"test":true}\n', "utf8")
  mkdirSync(join(repo, ".opencode"))
  writeFileSync(join(repo, ".opencode", "copied.md"), "copied\n", "utf8")
  git(repo, ["add", "."])
  git(repo, ["commit", "-m", "initial"])
  project = { id: randomUUID(), name: "repo", path: repo, addedAt: Date.now() }
  sessionId = randomUUID()
  state.worktrees.clear()
  state.merges = []
  state.logs = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("repository helpers", () => {
  it("detects the repository and current branch", () => {
    expect(isGitRepo(repo)).toBe(true)
    expect(currentBranch(repo)).toBe("main")

    const plain = join(root, "plain")
    mkdirSync(plain)
    expect(isGitRepo(plain)).toBe(false)
    expect(currentBranch(plain)).toBeNull()
  })

  it("places worktrees next to the project in a stable directory", () => {
    expect(worktreeRoot(project)).toBe(
      join(dirname(repo), ".meowstudio-worktrees", `repo-${project.id.slice(0, 8)}`),
    )
  })
})

describe("createSessionWorktree", () => {
  it("creates an isolated branch and copies project config", () => {
    const created = createSessionWorktree(project)

    expect(created).not.toBeNull()
    if (!created) return
    expect(created.baseBranch).toBe("main")
    expect(created.branch).toMatch(/^meow\/session-[0-9a-f]{8}$/)
    expect(created.path.startsWith(worktreeRoot(project))).toBe(true)
    expect(existsSync(created.path)).toBe(true)
    expect(branchExists(created.branch)).toBe(true)
    expect(readFileSync(join(created.path, "app.txt"), "utf8")).toBe("base\n")
    expect(readFileSync(join(created.path, "opencode.json"), "utf8")).toBe('{"test":true}\n')
    expect(readFileSync(join(created.path, ".opencode", "copied.md"), "utf8")).toBe("copied\n")
    expect(currentBranch(created.path)).toBe(created.branch)
  })

  it("returns null outside a git repository", () => {
    const plain = join(root, "plain")
    mkdirSync(plain)
    expect(createSessionWorktree({ ...project, path: plain })).toBeNull()
  })

  it("returns null when the repository has no commits", () => {
    const empty = join(root, "empty")
    mkdirSync(empty)
    git(empty, ["init", "-b", "main"])
    expect(createSessionWorktree({ ...project, path: empty })).toBeNull()
  })

  it("records and lists an active worktree", () => {
    const created = createSessionWorktree(project)
    expect(created).not.toBeNull()
    if (!created) return

    const info = recordCreatedWorktree(project, sessionId, created)
    expect(info).toMatchObject({
      sessionId,
      projectId: project.id,
      path: created.path,
      branch: created.branch,
      baseBranch: "main",
      status: "active",
    })

    const view = listWorktreeView(project)
    expect(view).toMatchObject({ isRepo: true, mainBranch: "main" })
    expect(view.worktrees).toHaveLength(1)
    expect(view.worktrees[0]?.sessionId).toBe(sessionId)
    expect(view.merges).toEqual([])
  })

  it("marks a deleted worktree directory as missing", () => {
    const created = createSessionWorktree(project)
    expect(created).not.toBeNull()
    if (!created) return
    recordCreatedWorktree(project, sessionId, created)

    rmSync(created.path, { recursive: true, force: true })

    const view = listWorktreeView(project)
    expect(view.worktrees[0]?.status).toBe("missing")
    expect(state.worktrees.get(sessionId)?.status).toBe("missing")
  })

  it("reports a non-repository view", () => {
    const plain = join(root, "plain")
    mkdirSync(plain)
    expect(listWorktreeView({ ...project, path: plain })).toEqual({
      isRepo: false,
      worktrees: [],
      merges: [],
    })
  })
})

describe("mergeSessionWorktree", () => {
  it("merges committed worktree changes into the base branch", async () => {
    const created = createSessionWorktree(project)
    expect(created).not.toBeNull()
    if (!created) return
    const info = recordCreatedWorktree(project, sessionId, created)
    const featureCommit = commit(created.path, "feature\n", "feature work")

    const result = await mergeSessionWorktree(project, sessionId)

    expect(result.ok).toBe(true)
    expect(result.status).toBe("merged")
    expect(result.worktree.status).toBe("merged")
    expect(result.worktree.commit).toBeTruthy()
    expect(readFileSync(join(repo, "app.txt"), "utf8")).toBe("feature\n")
    expect(isAncestor(info.branch, "main")).toBe(true)
    expect(isAncestor(featureCommit, "main")).toBe(true)

    const merge = state.merges.find((item) => item.sessionId === sessionId)
    expect(merge).toMatchObject({
      status: "merged",
      sourceBranch: info.branch,
      targetBranch: "main",
    })
    expect(merge?.commit).toBeTruthy()

    const view = listWorktreeView(project)
    expect(view.worktrees[0]?.status).toBe("merged")
    expect(view.merges[0]?.status).toBe("merged")
  })

  it("refuses to merge when the project is not on the base branch", async () => {
    const created = createSessionWorktree(project)
    expect(created).not.toBeNull()
    if (!created) return
    recordCreatedWorktree(project, sessionId, created)
    git(repo, ["checkout", "-b", "other"])

    await expect(mergeSessionWorktree(project, sessionId)).rejects.toThrow(
      "Switch the main project to main before merging",
    )
  })

  it("records a conflict and recovers the merged state after resolution", async () => {
    const created = createSessionWorktree(project)
    expect(created).not.toBeNull()
    if (!created) return
    const info = recordCreatedWorktree(project, sessionId, created)

    commit(created.path, "worktree version\n", "worktree change")
    commit(repo, "main version\n", "main change")

    const result = await mergeSessionWorktree(project, sessionId)

    expect(result.ok).toBe(false)
    expect(result.status).toBe("conflict")
    expect(result.output).toBeTruthy()
    expect(result.worktree.status).toBe("conflict")
    expect(result.worktree.error).toBe("Merge conflicts need resolution")
    expect(gitOperation(repo)).toBe("merge")
    expect(readFileSync(join(repo, "app.txt"), "utf8")).toContain("<<<<<<<")
    expect(state.merges.find((item) => item.sessionId === sessionId)?.status).toBe("conflict")

    write(repo, "resolved\n")
    git(repo, ["add", "app.txt"])
    git(repo, ["commit", "-m", "resolve conflict"])
    expect(gitOperation(repo)).toBeNull()

    const view = listWorktreeView(project)
    expect(view.worktrees[0]).toMatchObject({ status: "merged", sessionId })
    expect(view.worktrees[0]?.error).toBeUndefined()
    expect(view.worktrees[0]?.commit).toBeTruthy()
    expect(isAncestor(info.branch, info.baseBranch)).toBe(true)
    expect(state.merges.filter((item) => item.sessionId === sessionId).at(-1)?.status).toBe("merged")
  })

  it("returns a merged worktree to active after a new commit", async () => {
    const created = createSessionWorktree(project)
    expect(created).not.toBeNull()
    if (!created) return
    recordCreatedWorktree(project, sessionId, created)
    commit(created.path, "first feature\n", "first feature")

    await mergeSessionWorktree(project, sessionId)
    expect(listWorktreeView(project).worktrees[0]?.status).toBe("merged")

    commit(created.path, "second feature\n", "second feature")
    expect(isAncestor(created.branch, "main")).toBe(false)

    const view = listWorktreeView(project)
    expect(view.worktrees[0]).toMatchObject({ status: "active", sessionId })
    expect(view.worktrees[0]?.mergedAt).toBeUndefined()
    expect(view.worktrees[0]?.commit).toBeUndefined()
    expect(state.worktrees.get(sessionId)?.status).toBe("active")
    expect(state.merges[0]?.status).toBe("merged")
  })
})

describe("removeSessionWorktree", () => {
  it("cleans up the worktree directory and record but keeps the branch", async () => {
    const created = createSessionWorktree(project)
    expect(created).not.toBeNull()
    if (!created) return
    recordCreatedWorktree(project, sessionId, created)
    commit(created.path, "merged\n", "merged change")
    await mergeSessionWorktree(project, sessionId)

    removeSessionWorktree(project, sessionId)

    expect(existsSync(created.path)).toBe(false)
    expect(state.worktrees.has(sessionId)).toBe(false)
    expect(branchExists(created.branch)).toBe(true)
    const token = created.path.split(/[\\/]/).at(-1)
    expect(git(repo, ["worktree", "list", "--porcelain"])).not.toContain(token)
  })

  it("is a no-op for sessions without a worktree", () => {
    expect(() => removeSessionWorktree(project, "missing-session")).not.toThrow()
  })
})
