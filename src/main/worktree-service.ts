import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, cp, mkdir, rm, symlink } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { MergeInfo, Project, WorktreeInfo, WorktreeMergeResult, WorktreeView } from "@shared/types"
import { gitFailure, gitOperationAsync, runGitAsync } from "./git-service"
import { log } from "./logger"
import { getMerges, getWorktree, getWorktrees, removeWorktreeRecord, upsertMerge, upsertWorktree } from "./store"

const BRANCH_PREFIX = "meow/session"
const CONFIG_FILES = ["opencode.json", "opencode.jsonc", "AGENTS.md", ".env", ".env.local"]
const CONFIG_DIRS = [".opencode"]
const LINKED_DIRS = ["node_modules", ".venv"]

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project"
}

export function worktreeRoot(project: Project): string {
  return join(dirname(project.path), ".meowstudio-worktrees", `${safeName(basename(project.path))}-${project.id.slice(0, 8)}`)
}

export async function currentBranch(projectPath: string): Promise<string | null> {
  try {
    const branch = (await runGitAsync(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"], 15_000)).trim()
    return branch && branch !== "HEAD" ? branch : null
  } catch {
    return null
  }
}

export async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    return (await runGitAsync(projectPath, ["rev-parse", "--is-inside-work-tree"], 15_000)).trim() === "true"
  } catch {
    return false
  }
}

async function hasCommit(projectPath: string): Promise<boolean> {
  try {
    await runGitAsync(projectPath, ["rev-parse", "--verify", "HEAD"], 15_000)
    return true
  } catch {
    return false
  }
}

async function copyProjectConfig(project: Project, worktreePath: string): Promise<void> {
  for (const file of CONFIG_FILES) {
    const source = join(project.path, file)
    const target = join(worktreePath, file)
    try {
      if (existsSync(source)) await copyFile(source, target)
    } catch (error) {
      log("worktree", `copy ${file} failed: ${(error as Error).message}`)
    }
  }
  for (const dir of CONFIG_DIRS) {
    const source = join(project.path, dir)
    const target = join(worktreePath, dir)
    try {
      if (existsSync(source)) await cp(source, target, { recursive: true, force: true })
    } catch (error) {
      log("worktree", `copy ${dir} failed: ${(error as Error).message}`)
    }
  }
  for (const dir of LINKED_DIRS) {
    const source = join(project.path, dir)
    const target = join(worktreePath, dir)
    try {
      if (!existsSync(source) || existsSync(target)) continue
      await symlink(source, target, process.platform === "win32" ? "junction" : "dir")
    } catch (error) {
      log("worktree", `link ${dir} failed: ${(error as Error).message}`)
    }
  }
}

export interface CreatedWorktree {
  path: string
  branch: string
  baseBranch: string
  createdAt: number
}

export async function createSessionWorktree(project: Project): Promise<CreatedWorktree | null> {
  if (!(await isGitRepo(project.path)) || !(await hasCommit(project.path))) return null
  const baseBranch = await currentBranch(project.path)
  if (!baseBranch) return null
  const root = worktreeRoot(project)
  await mkdir(root, { recursive: true })
  const token = randomUUID().slice(0, 8)
  const path = join(root, token)
  const branch = `${BRANCH_PREFIX}-${token}`
  try {
    await runGitAsync(project.path, ["worktree", "add", "-b", branch, path, baseBranch], 120_000)
  } catch (error) {
    try {
      await runGitAsync(project.path, ["worktree", "prune"], 30_000)
    } catch {
      // ignore
    }
    await rm(path, { recursive: true, force: true })
    log("worktree", `create failed: ${(error as Error).message}`)
    return null
  }
  await copyProjectConfig(project, path)
  return { path, branch, baseBranch, createdAt: Date.now() }
}

export async function syncWorktreeConfigs(project: Project): Promise<void> {
  for (const info of getWorktrees(project.id)) {
    if (existsSync(info.path)) await copyProjectConfig(project, info.path)
  }
}

export function recordCreatedWorktree(project: Project, sessionId: string, created: CreatedWorktree): WorktreeInfo {
  const info: WorktreeInfo = {
    sessionId,
    projectId: project.id,
    path: created.path,
    branch: created.branch,
    baseBranch: created.baseBranch,
    status: "active",
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
  }
  upsertWorktree(info)
  log("worktree", `session ${sessionId} -> ${created.path} (${created.branch})`)
  return info
}

async function isAncestorAsync(projectPath: string, branch: string, target: string): Promise<boolean> {
  try {
    await runGitAsync(projectPath, ["merge-base", "--is-ancestor", branch, target], 30_000)
    return true
  } catch {
    return false
  }
}

export async function listWorktreeViewAsync(project: Project): Promise<WorktreeView> {
  if (!(await isGitRepo(project.path))) return { isRepo: false, worktrees: [], merges: [] }
  const mainBranch = (await currentBranch(project.path)) ?? undefined
  const operation = await gitOperationAsync(project.path)
  const worktrees: WorktreeInfo[] = []
  for (const info of getWorktrees(project.id)) {
    if (!existsSync(info.path)) {
      if (info.status !== "missing") {
        const next = { ...info, status: "missing" as const, updatedAt: Date.now() }
        upsertWorktree(next)
        worktrees.push(next)
      } else {
        worktrees.push(info)
      }
      continue
    }
    if (info.status === "merged" && !(await isAncestorAsync(project.path, info.branch, info.baseBranch))) {
      const next: WorktreeInfo = { ...info, status: "active", updatedAt: Date.now(), mergedAt: undefined, commit: undefined }
      upsertWorktree(next)
      worktrees.push(next)
      continue
    }
    if (info.status === "conflict" && !operation) {
      if (await isAncestorAsync(project.path, info.branch, info.baseBranch)) {
        const commit = (await runGitAsync(project.path, ["rev-parse", "--short", info.baseBranch], 15_000)).trim()
        const next: WorktreeInfo = {
          ...info,
          status: "merged",
          mergedAt: Date.now(),
          updatedAt: Date.now(),
          commit,
          error: undefined,
        }
        upsertWorktree(next)
        const latest = getMerges(project.id)
          .filter((merge) => merge.sessionId === info.sessionId)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
        if (latest?.status === "conflict") {
          upsertMerge({ ...latest, status: "merged", commit, message: undefined, updatedAt: Date.now() })
        }
        worktrees.push(next)
        continue
      }
      const next: WorktreeInfo = { ...info, status: "active", updatedAt: Date.now(), error: undefined }
      upsertWorktree(next)
      worktrees.push(next)
      continue
    }
    worktrees.push(info)
  }
  return { isRepo: true, mainBranch, worktrees, merges: getMerges(project.id) }
}

export async function mergeSessionWorktree(project: Project, sessionId: string): Promise<WorktreeMergeResult> {
  const info = getWorktree(sessionId)
  if (!info) throw new Error("This session does not have a worktree")
  if (!existsSync(info.path)) throw new Error("The session worktree is missing")
  const current = await currentBranch(project.path)
  if (!current || current !== info.baseBranch) {
    throw new Error(`Switch the main project to ${info.baseBranch} before merging`)
  }
  const createdAt = Date.now()
  let status: WorktreeInfo["status"] = "merged"
  let output = ""
  let message: string | undefined
  let commit: string | undefined
  try {
    output = await runGitAsync(project.path, ["merge", "--no-edit", info.branch], 180_000)
    commit = (await runGitAsync(project.path, ["rev-parse", "--short", "HEAD"], 15_000)).trim()
  } catch (error) {
    output = gitFailure(error)
    status = (await gitOperationAsync(project.path)) === "merge" ? "conflict" : "active"
    message = status === "conflict" ? "Merge conflicts need resolution" : output
  }

  const next: WorktreeInfo = {
    ...info,
    status,
    updatedAt: Date.now(),
    mergedAt: status === "merged" ? Date.now() : info.mergedAt,
    commit: commit ?? info.commit,
    error: status === "merged" ? undefined : message,
  }
  upsertWorktree(next)
  const merge: MergeInfo = {
    id: randomUUID(),
    projectId: project.id,
    sessionId,
    sourceBranch: info.branch,
    targetBranch: info.baseBranch,
    status: status === "merged" ? "merged" : status === "conflict" ? "conflict" : "failed",
    commit,
    message,
    createdAt,
    updatedAt: Date.now(),
  }
  upsertMerge(merge)
  return { ok: status === "merged", status, output, worktree: next, merge }
}

export async function removeSessionWorktree(project: Project, sessionId: string): Promise<void> {
  const info = getWorktree(sessionId)
  if (!info) return
  try {
    await runGitAsync(project.path, ["worktree", "remove", "--force", info.path], 60_000)
  } catch (error) {
    log("worktree", `remove ${info.path} failed: ${(error as Error).message}`)
    await rm(info.path, { recursive: true, force: true })
  }
  try {
    await runGitAsync(project.path, ["worktree", "prune"], 30_000)
  } catch {
    // ignore
  }
  removeWorktreeRecord(sessionId)
  log("worktree", `removed ${info.branch} worktree for ${sessionId}`)
}
