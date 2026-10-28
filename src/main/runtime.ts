import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { chmod, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { x as extract } from "tar"
import type { RuntimeStatus } from "@shared/types"
import { log } from "./logger"
import { installedRuntimeVersions, runtimeBinary, runtimeRoot } from "./paths"

type Hook = (status: RuntimeStatus) => void

let status: RuntimeStatus = { state: "idle" }
let hook: Hook | null = null
let inflight: Promise<RuntimeStatus> | null = null
let inflightKey = ""

export function setRuntimeHook(next: Hook | null): void {
  hook = next
}

export function getRuntimeStatus(): RuntimeStatus {
  return { ...status }
}

function update(next: Partial<RuntimeStatus>): RuntimeStatus {
  status = { ...status, ...next }
  const snapshot = { ...status }
  hook?.(snapshot)
  return snapshot
}

function packageForPlatform(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  if (process.platform === "win32") return `opencode-windows-${arch}`
  if (process.platform === "darwin") return `opencode-darwin-${arch}`
  let musl = false
  try {
    musl = existsSync("/etc/alpine-release")
  } catch {
    musl = false
  }
  return `opencode-linux-${arch}${musl ? "-musl" : ""}`
}

function execFileText(executable: string, args: string[], timeout: number, shell = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { encoding: "utf8", windowsHide: true, timeout, shell }, (error, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ?? ""}`.trim()
      if (error) {
        reject(new Error(output || error.message))
        return
      }
      resolve(output)
    })
  })
}

async function verifyBinary(binary: string): Promise<string> {
  const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(binary)
  const output = await execFileText(binary, ["--version"], 30_000, shell)
  const match = output.match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)
  return match?.[0] ?? output.split(/\s+/).pop() ?? "unknown"
}

function verificationMarker(version: string): string {
  return join(runtimeRoot(version), ".meow-verified")
}

function binaryFingerprint(binary: string): string {
  const info = statSync(binary)
  return `${info.size}:${Math.round(info.mtimeMs)}`
}

function isVerifiedCache(version: string, binary: string): boolean {
  try {
    return readFileSync(verificationMarker(version), "utf8").trim() === binaryFingerprint(binary)
  } catch {
    return false
  }
}

function markVerified(version: string, binary: string): void {
  try {
    writeFileSync(verificationMarker(version), binaryFingerprint(binary), "utf8")
  } catch {
    // The marker is an optimization; failure is not fatal.
  }
}

async function findSystemBinary(): Promise<string | null> {
  const finder = process.platform === "win32" ? "where.exe" : "which"
  try {
    const output = await execFileText(finder, ["opencode"], 15_000)
    const first = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (!first) return null
    return existsSync(first) ? first : null
  } catch {
    return null
  }
}

interface NpmMetadata {
  dist?: { tarball?: string; integrity?: string }
}

async function fetchMetadata(pkg: string, version: string): Promise<NpmMetadata | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${pkg}/${encodeURIComponent(version)}`, {
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return null
    return (await response.json()) as NpmMetadata
  } catch {
    return null
  }
}

async function downloadRuntime(version: string): Promise<RuntimeStatus> {
  const pkg = packageForPlatform()
  const metadata = await fetchMetadata(pkg, version)
  const tarball =
    metadata?.dist?.tarball ?? `https://registry.npmjs.org/${pkg}/-/${pkg}-${version}.tgz`
  const root = runtimeRoot(version)
  const binary = runtimeBinary(version)
  const temp = join(tmpdir(), `opencode-${pkg}-${version}-${Date.now()}.tgz`)

  update({
    state: "downloading",
    version,
    received: 0,
    total: undefined,
    error: undefined,
    binaryPath: undefined,
    source: "downloaded",
  })
  log("runtime", `downloading ${pkg}@${version}`)

  const response = await fetch(tarball, { redirect: "follow", signal: AbortSignal.timeout(10 * 60_000) })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}`)
  }
  const totalHeader = response.headers.get("content-length")
  const total = totalHeader ? Number(totalHeader) : undefined
  update({ total: Number.isFinite(total) ? total : undefined })

  const hash = createHash("sha512")
  let received = 0
  let lastEmit = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      hash.update(chunk)
      const now = Date.now()
      if (now - lastEmit > 200) {
        lastEmit = now
        update({ received })
      }
      callback(null, chunk)
    },
  })

  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), counter, createWriteStream(temp))
  update({ received, total: total ?? received })

  if (metadata?.dist?.integrity) {
    const actual = `sha512-${hash.digest("base64")}`
    if (actual !== metadata.dist.integrity) {
      await rm(temp, { force: true })
      throw new Error("Runtime download integrity check failed")
    }
  }

  update({ state: "extracting" })
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
  await extract({ file: temp, cwd: root, strip: 1 })
  await rm(temp, { force: true })

  if (!existsSync(binary)) {
    throw new Error("The downloaded archive did not contain the opencode binary")
  }
  if (process.platform !== "win32") {
    await chmod(binary, 0o755)
  }
  const actualVersion = await verifyBinary(binary)
  markVerified(version, binary)
  log("runtime", `runtime ready at ${binary} (${actualVersion})`)
  return update({ state: "ready", version: actualVersion, binaryPath: binary, source: "downloaded", error: undefined })
}

async function runEnsure(version: string, autoDownload: boolean, force: boolean): Promise<RuntimeStatus> {
  update({ state: "checking", error: undefined, version })

  const override = process.env.STUDIO_RUNTIME_BIN
  if (override && existsSync(override)) {
    try {
      const actual = await verifyBinary(override)
      return update({ state: "ready", version: actual, binaryPath: override, source: "override", error: undefined })
    } catch (error) {
      log("runtime", `override binary invalid: ${(error as Error).message}`)
    }
  }

  const target = runtimeBinary(version)
  if (!force && existsSync(target)) {
    log("runtime", `cache hit ${target}`)
    if (isVerifiedCache(version, target)) {
      return update({ state: "ready", version, binaryPath: target, source: "cache", error: undefined })
    }
    try {
      const actual = await verifyBinary(target)
      markVerified(version, target)
      return update({ state: "ready", version: actual, binaryPath: target, source: "cache", error: undefined })
    } catch (error) {
      log("runtime", `cached runtime invalid, re-downloading: ${(error as Error).message}`)
    }
  } else if (!existsSync(target)) {
    log("runtime", `cache miss for ${version} at ${target}`)
  }

  if (autoDownload) {
    try {
      return await downloadRuntime(version)
    } catch (error) {
      log("runtime", `download failed: ${(error as Error).message}`)
      const system = await findSystemBinary()
      if (system) {
        const actual = await verifyBinary(system)
        return update({ state: "ready", version: actual, binaryPath: system, source: "system", error: undefined })
      }
      return update({ state: "error", error: (error as Error).message, version })
    }
  }

  const system = await findSystemBinary()
  if (system) {
    const actual = await verifyBinary(system)
    return update({ state: "ready", version: actual, binaryPath: system, source: "system", error: undefined })
  }

  return update({
    state: "error",
    version,
    error: "opencode is not installed. Enable auto-download or install the opencode CLI.",
  })
}

export function ensureRuntime(version: string, autoDownload: boolean, force = false): Promise<RuntimeStatus> {
  const key = `${version}:${autoDownload}:${force}`
  if (inflight && inflightKey === key) return inflight
  inflightKey = key
  inflight = runEnsure(version, autoDownload, force).finally(() => {
    inflight = null
    inflightKey = ""
  })
  return inflight
}

export async function listRuntimeVersions(): Promise<{ installed: string[]; latest?: string }> {
  let latest: string | undefined
  try {
    const response = await fetch("https://registry.npmjs.org/opencode-ai", { signal: AbortSignal.timeout(15_000) })
    if (response.ok) {
      const data = (await response.json()) as { "dist-tags"?: { latest?: string } }
      latest = data["dist-tags"]?.latest
    }
  } catch {
    latest = undefined
  }
  return { installed: await installedRuntimeVersions(), latest }
}

export function runtimeSize(version: string): number {
  const binary = runtimeBinary(version)
  try {
    return statSync(binary).size
  } catch {
    return 0
  }
}
