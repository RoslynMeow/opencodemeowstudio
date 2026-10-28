import { execFile, execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type {
  GitBranches,
  GitBranch,
  GitCommit,
  GitCommitDetail,
  GitCommitFile,
  GitEnvironment,
  GitGraphData,
  GitInstallResult,
  GitRef,
  GitRemote,
} from "@shared/types"

const FIELD = "\x1f"
const RECORD = "\x1e"
const MAX_BUFFER = 16 * 1024 * 1024

let cachedExecutable: string | null | undefined
let cachedVersion: string | undefined
let cachedWinget: boolean | undefined

function gitCandidates(): string[] {
  const candidates: string[] = []
  if (process.env.GIT_EXE) candidates.push(process.env.GIT_EXE)
  candidates.push("git")
  if (process.platform === "win32") {
    candidates.push(join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "cmd", "git.exe"))
    candidates.push(join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Git", "cmd", "git.exe"))
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, "Programs", "Git", "cmd", "git.exe"))
    }
    if (process.env.USERPROFILE) {
      candidates.push(join(process.env.USERPROFILE, "scoop", "apps", "git", "current", "cmd", "git.exe"))
    }
  } else {
    candidates.push("/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git")
  }
  return [...new Set(candidates)]
}

export function resetGitExecutableCache(): void {
  cachedExecutable = undefined
  cachedVersion = undefined
}

export function resolveGitExecutable(force = false): string | null {
  if (!force && cachedExecutable !== undefined) return cachedExecutable
  for (const candidate of gitCandidates()) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 5000, windowsHide: true })
      cachedExecutable = candidate
      return candidate
    } catch {
      // Try the next candidate.
    }
  }
  cachedExecutable = null
  return null
}

function requireGit(): string {
  const executable = resolveGitExecutable()
  if (!executable) throw new Error("Git is not installed or is not available in PATH")
  return executable
}

function hasWinget(): boolean {
  if (cachedWinget !== undefined) return cachedWinget
  if (process.platform !== "win32") {
    cachedWinget = false
    return false
  }
  try {
    execFileSync("winget", ["--version"], { stdio: "ignore", timeout: 8000, windowsHide: true })
    cachedWinget = true
  } catch {
    cachedWinget = false
  }
  return cachedWinget
}

export function detectGit(force = false): GitEnvironment {
  const executable = resolveGitExecutable(force)
  if (!executable) {
    return {
      available: false,
      platform: process.platform,
      canAutoInstall: hasWinget(),
    }
  }
  try {
    if (!cachedVersion) {
      cachedVersion = execFileSync(executable, ["--version"], {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      }).trim()
    }
  } catch {
    cachedVersion = undefined
  }
  return {
    available: true,
    version: cachedVersion,
    path: executable,
    platform: process.platform,
    canAutoInstall: false,
  }
}

function execFileText(executable: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { encoding: "utf8", timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const message = [stderr, stdout].filter(Boolean).join("\n").trim() || error.message
        reject(new Error(message))
        return
      }
      resolve(stdout)
    })
  })
}

async function resolveGitExecutableAsync(force = false): Promise<string | null> {
  if (!force && cachedExecutable !== undefined) return cachedExecutable
  for (const candidate of gitCandidates()) {
    try {
      await execFileText(candidate, ["--version"], 5000)
      cachedExecutable = candidate
      return candidate
    } catch {
      // Try the next candidate.
    }
  }
  cachedExecutable = null
  return null
}

async function hasWingetAsync(): Promise<boolean> {
  if (cachedWinget !== undefined) return cachedWinget
  if (process.platform !== "win32") {
    cachedWinget = false
    return false
  }
  try {
    await execFileText("winget", ["--version"], 8000)
    cachedWinget = true
  } catch {
    cachedWinget = false
  }
  return cachedWinget
}

export async function detectGitAsync(force = false): Promise<GitEnvironment> {
  const executable = await resolveGitExecutableAsync(force)
  if (!executable) {
    return {
      available: false,
      platform: process.platform,
      canAutoInstall: await hasWingetAsync(),
    }
  }
  try {
    if (!cachedVersion) cachedVersion = (await execFileText(executable, ["--version"], 5000)).trim()
  } catch {
    cachedVersion = undefined
  }
  return {
    available: true,
    version: cachedVersion,
    path: executable,
    platform: process.platform,
    canAutoInstall: false,
  }
}

function gitEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_EDITOR: "true",
    GIT_MERGE_AUTOEDIT: "no",
    ...extra,
  }
}

export function runGitSync(projectPath: string, args: string[], timeout = 30_000): string {
  return execFileSync(requireGit(), ["-C", projectPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: MAX_BUFFER,
    timeout,
  })
}

async function requireGitAsync(): Promise<string> {
  const executable = await resolveGitExecutableAsync()
  if (!executable) throw new Error("Git is not installed or is not available in PATH")
  return executable
}

export async function runGitAsync(projectPath: string, args: string[], timeout = 180_000): Promise<string> {
  const executable = await requireGitAsync()
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      ["-C", projectPath, ...args],
      {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
        timeout,
        env: gitEnv(),
      },
      (error, stdout, stderr) => {
        if (error) {
          const output = [stderr, stdout].filter(Boolean).join("\n").trim()
          reject(new Error(output || (error as Error).message))
          return
        }
        resolve([stdout, stderr].filter(Boolean).join("\n").trim())
      },
    )
  })
}

export function gitFailure(error: unknown): string {
  const record = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string }
  const stderr = record?.stderr ? record.stderr.toString() : ""
  const stdout = record?.stdout ? record.stdout.toString() : ""
  return (stderr || stdout || record?.message || "git command failed").trim()
}

function parseRefs(decoration: string, remoteNames: string[]): GitRef[] {
  const refs: GitRef[] = []
  const seen = new Set<string>()
  const add = (name: string, kind: GitRef["kind"]) => {
    const key = `${kind}:${name}`
    if (!name || seen.has(key)) return
    seen.add(key)
    refs.push({ name, kind })
  }
  const clean = (name: string) =>
    name
      .replace(/^refs\/heads\//, "")
      .replace(/^refs\/remotes\//, "")
      .replace(/^refs\/tags\//, "")
      .trim()

  for (const raw of decoration.split(",")) {
    const ref = raw.trim()
    if (!ref) continue
    if (ref === "HEAD") {
      add("HEAD", "head")
      continue
    }
    if (ref.startsWith("HEAD -> ")) {
      add(clean(ref.slice("HEAD -> ".length)), "head")
      continue
    }
    if (ref.startsWith("tag: ")) {
      add(clean(ref.slice("tag: ".length)), "tag")
      continue
    }
    const name = clean(ref)
    const isRemote = remoteNames.some((remote) => name === remote || name.startsWith(`${remote}/`))
    add(name, isRemote ? "remote" : "local")
  }
  return refs
}

function parseRecord(record: string, remoteNames: string[]): GitCommit | null {
  const fields = record.replace(/^\r?\n/, "").split(FIELD)
  if (fields.length < 7) return null
  const [hash, parents, author, authorEmail, timestamp, subject, decoration] = fields
  if (!hash || !/^[0-9a-f]{4,40}$/i.test(hash)) return null
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    author: author || "",
    authorEmail: authorEmail || "",
    timestamp: Number(timestamp) || 0,
    subject: subject || "",
    refs: parseRefs(decoration || "", remoteNames),
  }
}

function remoteNames(projectPath: string): string[] {
  try {
    return runGitSync(projectPath, ["remote"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export function gitGraph(projectPath: string, requestedLimit = 300): GitGraphData {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit) || 300, 20), 600)
  const names = remoteNames(projectPath)
  const format = ["%H", "%P", "%an", "%ae", "%at", "%s", "%D"].join("%x1f") + "%x1e"
  let output = ""
  try {
    output = runGitSync(
      projectPath,
      ["log", "--all", "--date-order", `--max-count=${limit + 1}`, `--pretty=format:${format}`],
      45_000,
    )
  } catch (error) {
    const message = gitFailure(error).toLowerCase()
    if (!message.includes("does not have any commits") && !message.includes("unknown revision")) throw error
  }

  const records = output.split(RECORD).map((record) => record.replace(/^\r?\n/, "")).filter(Boolean)
  const truncated = records.length > limit
  const commits = records
    .slice(0, limit)
    .map((record) => parseRecord(record, names))
    .filter((commit): commit is GitCommit => Boolean(commit))

  let head: string | null = null
  let branch: string | null = null
  try {
    head = runGitSync(projectPath, ["rev-parse", "HEAD"]).trim() || null
  } catch {
    head = null
  }
  try {
    branch = runGitSync(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()
    if (branch === "HEAD") branch = null
  } catch {
    branch = null
  }

  return { commits, head, branch, remoteNames: names, truncated }
}

export function gitCommitDetail(projectPath: string, hash: string): GitCommitDetail {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error("Invalid commit hash")
  const format = ["%H", "%P", "%an", "%ae", "%at", "%cn", "%ce", "%ct", "%s", "%D", "%b"].join("%x1f")
  const raw = runGitSync(projectPath, ["log", "-1", `--pretty=format:${format}`, hash])
  const fields = raw.split(FIELD)
  const [commitHash, parents, author, authorEmail, authorTime, committer, committerEmail, commitTime, subject, decoration] =
    fields.slice(0, 10)
  const body = fields.slice(10).join(FIELD).trim()
  const commit: GitCommit = {
    hash: commitHash || hash,
    shortHash: (commitHash || hash).slice(0, 7),
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    author: author || "",
    authorEmail: authorEmail || "",
    timestamp: Number(authorTime) || 0,
    subject: subject || "",
    refs: parseRefs(decoration || "", remoteNames(projectPath)),
  }

  const files: GitCommitFile[] = []
  const statuses = new Map<string, string>()
  try {
    const nameStatus = runGitSync(projectPath, ["show", "--name-status", "--format=", hash])
    for (const line of nameStatus.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [code, ...paths] = line.split("\t")
      const path = paths[paths.length - 1]?.trim()
      if (path) statuses.set(path, (code || "M").slice(0, 1))
    }
  } catch {
    // Merge commits may not expose a name-status list.
  }
  try {
    const numstat = runGitSync(projectPath, ["show", "--numstat", "--format=", hash])
    for (const line of numstat.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [added, deleted, ...pathParts] = line.split("\t")
      const path = pathParts.join("\t").trim()
      if (!path) continue
      files.push({
        path,
        status: statuses.get(path) ?? "M",
        additions: added === "-" ? 0 : Number(added) || 0,
        deletions: deleted === "-" ? 0 : Number(deleted) || 0,
      })
    }
  } catch {
    // Ignore missing stat data.
  }
  const insertions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)

  return {
    commit,
    body,
    committer: committer || "",
    committerEmail: committerEmail || "",
    commitTimestamp: Number(commitTime) || 0,
    files,
    insertions,
    deletions,
  }
}

export function gitBranches(projectPath: string): GitBranches {
  const local: GitBranch[] = []
  const remotes: GitBranch[] = []
  try {
    const output = runGitSync(projectPath, [
      "for-each-ref",
      "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)",
      "refs/heads",
    ])
    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [name, head, upstream] = line.split("\t")
      if (!name) continue
      local.push({ name, current: head === "*", upstream: upstream || undefined })
    }
  } catch {
    // No local branches yet.
  }
  try {
    const output = runGitSync(projectPath, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"])
    for (const line of output.split(/\r?\n/)) {
      const name = line.trim()
      if (!name || name.endsWith("/HEAD")) continue
      remotes.push({ name, current: false, remote: true })
    }
  } catch {
    // No remotes.
  }
  local.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name))
  remotes.sort((a, b) => a.name.localeCompare(b.name))
  let current: string | null = local.find((branch) => branch.current)?.name ?? null
  if (!current) {
    try {
      const branch = runGitSync(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()
      current = branch === "HEAD" ? null : branch
    } catch {
      current = null
    }
  }
  return { local, remotes, current }
}

function githubRemote(url: string): GitRemote["github"] | undefined {
  const https = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i)
  const ssh = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i)
  const match = https ?? ssh
  if (!match) return undefined
  const owner = match[1]
  const repo = match[2]
  if (!owner || !repo) return undefined
  return { owner, repo, url: `https://github.com/${owner}/${repo}` }
}

function defaultRemoteBranch(projectPath: string, remote: string): string | undefined {
  try {
    const symbolic = runGitSync(projectPath, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]).trim()
    if (symbolic.startsWith(`${remote}/`)) return symbolic.slice(remote.length + 1)
  } catch {
    // Fall back to common branch names.
  }
  for (const branch of ["main", "master"]) {
    try {
      runGitSync(projectPath, ["rev-parse", "--verify", `refs/remotes/${remote}/${branch}`])
      return branch
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

export function gitRemotes(projectPath: string): GitRemote[] {
  let output = ""
  try {
    output = runGitSync(projectPath, ["remote", "-v"])
  } catch {
    return []
  }
  const byName = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (!match) continue
    const name = match[1]
    const url = match[2]
    if (match[3] === "fetch" && name && url && !byName.has(name)) byName.set(name, url)
  }
  return [...byName.entries()].map(([name, url]) => ({
    name,
    url,
    defaultBranch: defaultRemoteBranch(projectPath, name),
    github: githubRemote(url),
  }))
}

async function remoteNamesAsync(projectPath: string): Promise<string[]> {
  try {
    return (await runGitAsync(projectPath, ["remote"], 10_000))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function gitGraphAsync(projectPath: string, requestedLimit = 300): Promise<GitGraphData> {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit) || 300, 20), 600)
  const names = await remoteNamesAsync(projectPath)
  const format = ["%H", "%P", "%an", "%ae", "%at", "%s", "%D"].join("%x1f") + "%x1e"
  let output = ""
  try {
    output = await runGitAsync(
      projectPath,
      ["log", "--all", "--date-order", `--max-count=${limit + 1}`, `--pretty=format:${format}`],
      45_000,
    )
  } catch (error) {
    const message = gitFailure(error).toLowerCase()
    if (!message.includes("does not have any commits") && !message.includes("unknown revision")) throw error
  }

  const records = output.split(RECORD).map((record) => record.replace(/^\r?\n/, "")).filter(Boolean)
  const truncated = records.length > limit
  const commits = records
    .slice(0, limit)
    .map((record) => parseRecord(record, names))
    .filter((commit): commit is GitCommit => Boolean(commit))

  let head: string | null = null
  let branch: string | null = null
  try {
    head = (await runGitAsync(projectPath, ["rev-parse", "HEAD"], 10_000)).trim() || null
  } catch {
    head = null
  }
  try {
    branch = (await runGitAsync(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"], 10_000)).trim()
    if (branch === "HEAD") branch = null
  } catch {
    branch = null
  }

  return { commits, head, branch, remoteNames: names, truncated }
}

export async function gitCommitDetailAsync(projectPath: string, hash: string): Promise<GitCommitDetail> {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error("Invalid commit hash")
  const format = ["%H", "%P", "%an", "%ae", "%at", "%cn", "%ce", "%ct", "%s", "%D", "%b"].join("%x1f")
  const raw = await runGitAsync(projectPath, ["log", "-1", `--pretty=format:${format}`, hash], 30_000)
  const fields = raw.split(FIELD)
  const [commitHash, parents, author, authorEmail, authorTime, committer, committerEmail, commitTime, subject, decoration] =
    fields.slice(0, 10)
  const body = fields.slice(10).join(FIELD).trim()
  const commit: GitCommit = {
    hash: commitHash || hash,
    shortHash: (commitHash || hash).slice(0, 7),
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    author: author || "",
    authorEmail: authorEmail || "",
    timestamp: Number(authorTime) || 0,
    subject: subject || "",
    refs: parseRefs(decoration || "", await remoteNamesAsync(projectPath)),
  }

  const files: GitCommitFile[] = []
  const statuses = new Map<string, string>()
  try {
    const nameStatus = await runGitAsync(projectPath, ["show", "--name-status", "--format=", hash], 30_000)
    for (const line of nameStatus.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [code, ...paths] = line.split("\t")
      const path = paths[paths.length - 1]?.trim()
      if (path) statuses.set(path, (code || "M").slice(0, 1))
    }
  } catch {
    // Merge commits may not expose a name-status list.
  }
  try {
    const numstat = await runGitAsync(projectPath, ["show", "--numstat", "--format=", hash], 30_000)
    for (const line of numstat.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [added, deleted, ...pathParts] = line.split("\t")
      const path = pathParts.join("\t").trim()
      if (!path) continue
      files.push({
        path,
        status: statuses.get(path) ?? "M",
        additions: added === "-" ? 0 : Number(added) || 0,
        deletions: deleted === "-" ? 0 : Number(deleted) || 0,
      })
    }
  } catch {
    // Ignore missing stat data.
  }
  const insertions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)

  return {
    commit,
    body,
    committer: committer || "",
    committerEmail: committerEmail || "",
    commitTimestamp: Number(commitTime) || 0,
    files,
    insertions,
    deletions,
  }
}

export async function gitBranchesAsync(projectPath: string): Promise<GitBranches> {
  const local: GitBranch[] = []
  const remotes: GitBranch[] = []
  try {
    const output = await runGitAsync(
      projectPath,
      ["for-each-ref", "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)", "refs/heads"],
      15_000,
    )
    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) continue
      const [name, head, upstream] = line.split("\t")
      if (!name) continue
      local.push({ name, current: head === "*", upstream: upstream || undefined })
    }
  } catch {
    // No local branches yet.
  }
  try {
    const output = await runGitAsync(
      projectPath,
      ["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
      15_000,
    )
    for (const line of output.split(/\r?\n/)) {
      const name = line.trim()
      if (!name || name.endsWith("/HEAD")) continue
      remotes.push({ name, current: false, remote: true })
    }
  } catch {
    // No remotes.
  }
  local.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name))
  remotes.sort((a, b) => a.name.localeCompare(b.name))
  let current: string | null = local.find((branch) => branch.current)?.name ?? null
  if (!current) {
    try {
      const branch = (await runGitAsync(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"], 10_000)).trim()
      current = branch === "HEAD" ? null : branch
    } catch {
      current = null
    }
  }
  return { local, remotes, current }
}

async function defaultRemoteBranchAsync(projectPath: string, remote: string): Promise<string | undefined> {
  try {
    const symbolic = (
      await runGitAsync(projectPath, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`], 10_000)
    ).trim()
    if (symbolic.startsWith(`${remote}/`)) return symbolic.slice(remote.length + 1)
  } catch {
    // Fall back to common branch names.
  }
  for (const branch of ["main", "master"]) {
    try {
      await runGitAsync(projectPath, ["rev-parse", "--verify", `refs/remotes/${remote}/${branch}`], 10_000)
      return branch
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

export async function gitRemotesAsync(projectPath: string): Promise<GitRemote[]> {
  let output = ""
  try {
    output = await runGitAsync(projectPath, ["remote", "-v"], 10_000)
  } catch {
    return []
  }
  const byName = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (!match) continue
    const name = match[1]
    const url = match[2]
    if (match[3] === "fetch" && name && url && !byName.has(name)) byName.set(name, url)
  }
  return Promise.all(
    [...byName.entries()].map(async ([name, url]) => ({
      name,
      url,
      defaultBranch: await defaultRemoteBranchAsync(projectPath, name),
      github: githubRemote(url),
    })),
  )
}

async function gitPathAsync(projectPath: string, name: string): Promise<string | null> {
  try {
    return (await runGitAsync(projectPath, ["rev-parse", "--git-path", name], 10_000)).trim()
  } catch {
    return null
  }
}

export async function gitOperationAsync(projectPath: string): Promise<"merge" | "rebase" | null> {
  const merge = await gitPathAsync(projectPath, "MERGE_HEAD")
  if (merge && existsSync(resolve(projectPath, merge))) return "merge"
  for (const name of ["rebase-merge", "rebase-apply"]) {
    const path = await gitPathAsync(projectPath, name)
    if (path && existsSync(resolve(projectPath, path))) return "rebase"
  }
  return null
}

async function checkoutBranch(projectPath: string, branch: string): Promise<string> {
  if (!branch || branch.startsWith("-")) throw new Error("Invalid branch name")
  try {
    return await runGitAsync(projectPath, ["switch", branch])
  } catch {
    return await runGitAsync(projectPath, ["checkout", branch])
  }
}

export function gitCheckout(projectPath: string, branch: string): Promise<string> {
  return checkoutBranch(projectPath, branch)
}

export async function gitCreateBranch(projectPath: string, name: string): Promise<string> {
  const branch = name.trim()
  if (!branch || branch.startsWith("-")) throw new Error("Invalid branch name")
  await runGitAsync(projectPath, ["check-ref-format", "--branch", branch], 15_000)
  return runGitAsync(projectPath, ["switch", "-c", branch])
}

function gitPath(projectPath: string, name: string): string {
  try {
    return runGitSync(projectPath, ["rev-parse", "--git-path", name]).trim()
  } catch {
    return ""
  }
}

export function gitOperation(projectPath: string): "merge" | "rebase" | null {
  const merge = gitPath(projectPath, "MERGE_HEAD")
  if (merge && existsSync(resolve(projectPath, merge))) return "merge"
  for (const name of ["rebase-merge", "rebase-apply"]) {
    const path = gitPath(projectPath, name)
    if (path && existsSync(resolve(projectPath, path))) return "rebase"
  }
  return null
}

export async function gitMerge(projectPath: string, branch: string): Promise<string> {
  if (!branch || branch.startsWith("-")) throw new Error("Invalid branch name")
  return runGitAsync(projectPath, ["merge", "--no-edit", branch])
}

export async function gitRebase(projectPath: string, branch: string): Promise<string> {
  if (!branch || branch.startsWith("-")) throw new Error("Invalid branch name")
  return runGitAsync(projectPath, ["rebase", branch])
}

export async function gitAbort(projectPath: string): Promise<string> {
  const operation = await gitOperationAsync(projectPath)
  if (operation === "merge") return runGitAsync(projectPath, ["merge", "--abort"])
  if (operation === "rebase") return runGitAsync(projectPath, ["rebase", "--abort"])
  throw new Error("No merge or rebase is in progress")
}

export async function gitContinue(projectPath: string): Promise<string> {
  const operation = await gitOperationAsync(projectPath)
  if (operation === "rebase") return runGitAsync(projectPath, ["rebase", "--continue"])
  if (operation === "merge") return runGitAsync(projectPath, ["commit", "--no-edit"])
  throw new Error("No merge or rebase is in progress")
}

export async function gitStash(projectPath: string, message?: string): Promise<string> {
  return runGitAsync(projectPath, ["stash", "push", "--include-untracked", "-m", message?.trim() || "MeowStudio stash"])
}

export async function gitStashPop(projectPath: string): Promise<string> {
  return runGitAsync(projectPath, ["stash", "pop"])
}

export async function gitTag(projectPath: string, name: string): Promise<string> {
  const tag = name.trim()
  if (!tag || tag.startsWith("-")) throw new Error("Invalid tag name")
  return runGitAsync(projectPath, ["tag", tag])
}

export async function gitDeleteBranch(projectPath: string, name: string): Promise<string> {
  const branch = name.trim()
  if (!branch || branch.startsWith("-")) throw new Error("Invalid branch name")
  return runGitAsync(projectPath, ["branch", "-d", branch])
}

export function gitInit(projectPath: string): Promise<string> {
  return runGitAsync(projectPath, ["init"])
}

export function gitFetch(projectPath: string): Promise<string> {
  return runGitAsync(projectPath, ["fetch", "--all", "--prune"])
}

export function gitPull(projectPath: string): Promise<string> {
  return runGitAsync(projectPath, ["pull", "--no-rebase"])
}

export async function gitPush(projectPath: string): Promise<string> {
  let upstream = ""
  try {
    upstream = (
      await runGitAsync(projectPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], 15_000)
    ).trim()
  } catch {
    upstream = ""
  }
  if (upstream) return runGitAsync(projectPath, ["push"])
  const remote = (await gitRemotesAsync(projectPath)).find((entry) => entry.name === "origin")
  if (!remote) throw new Error("No git remote is configured. Add a remote before pushing.")
  const branch = (await runGitAsync(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"], 15_000)).trim()
  if (!branch || branch === "HEAD") throw new Error("Cannot push a detached HEAD")
  return runGitAsync(projectPath, ["push", "-u", remote.name, branch])
}

export async function installGit(): Promise<GitInstallResult> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      output: "Automatic installation is only available on Windows.",
      environment: await detectGitAsync(),
      manualUrl: "https://git-scm.com/downloads",
    }
  }
  if (!(await hasWingetAsync())) {
    return {
      ok: false,
      output: "winget is not available on this system.",
      environment: await detectGitAsync(),
      manualUrl: "https://git-scm.com/download/win",
    }
  }
  const args = [
    "install",
    "--id",
    "Git.Git",
    "-e",
    "--source",
    "winget",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--silent",
  ]
  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      "winget",
      args,
      { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60_000 },
      (error, stdout, stderr) => {
        const text = [stdout, stderr].filter(Boolean).join("\n").trim()
        if (error) {
          reject(new Error(text || (error as Error).message))
          return
        }
        resolve(text)
      },
    )
  }).catch((error: Error) => error.message)

  resetGitExecutableCache()
  const gitDir = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "cmd")
  if (existsSync(gitDir) && !(process.env.PATH ?? "").toLowerCase().includes(gitDir.toLowerCase())) {
    process.env.PATH = `${gitDir};${process.env.PATH ?? ""}`
  }
  const environment = await detectGitAsync()
  return {
    ok: environment.available,
    output,
    environment,
    manualUrl: environment.available ? undefined : "https://git-scm.com/download/win",
  }
}
