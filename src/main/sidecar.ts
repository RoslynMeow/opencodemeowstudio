import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createServer } from "node:net"
import { homedir } from "node:os"
import type { BackendStatus, Profile, StudioEventEnvelope } from "@shared/types"
import { log } from "./logger"
import { profileEnv } from "./paths"

interface StartOptions {
  binaryPath: string
  profile: Profile
}

interface Hooks {
  onStatus?: (status: BackendStatus) => void
  onEvent?: (payload: StudioEventEnvelope) => void
}

let hooks: Hooks = {}
let child: ChildProcess | null = null
let status: BackendStatus = { state: "stopped" }
let password = randomUUID()
let stopping = false
let startPromise: Promise<BackendStatus> | null = null
let clients = new Map<string, OpencodeClient>()
let activeDirectory: string | null = null
let subscriptionController: AbortController | null = null
let subscriptionEpoch = 0
let outputBuffer = ""

export function configureSidecar(next: Hooks): void {
  hooks = next
}

export function getBackendStatus(): BackendStatus {
  return { ...status }
}

export function getAuthHeader(): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`
}

export function getBaseUrl(): string | null {
  return status.state === "running" ? status.url ?? null : null
}

function setStatus(next: Partial<BackendStatus>): void {
  status = { ...status, ...next }
  hooks.onStatus?.({ ...status })
}

function emitLog(line: string): void {
  log("opencode", line)
}

function handleOutput(chunk: Buffer, source: "stdout" | "stderr"): void {
  outputBuffer += chunk.toString()
  const lines = outputBuffer.split(/\r?\n/)
  outputBuffer = lines.pop() ?? ""
  for (const line of lines) {
    if (line.trim()) emitLog(source === "stderr" ? `! ${line}` : line)
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address && typeof address === "object") {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error("Unable to allocate a local port")))
      }
    })
  })
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = "backend did not respond"
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/global/health`, {
        headers: { Authorization: getAuthHeader() },
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const body = (await response.json()) as { healthy?: boolean; version?: string }
        if (body.healthy) {
          setStatus({ version: body.version })
          return
        }
      }
      lastError = `health check returned ${response.status}`
    } catch (error) {
      lastError = (error as Error).message
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for opencode server: ${lastError}`)
}

export async function startBackend(options: StartOptions): Promise<BackendStatus> {
  if (startPromise) return startPromise
  startPromise = (async () => {
    if (status.state === "running") await stopBackend()
    stopping = false
    clients.clear()
    outputBuffer = ""
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    setStatus({ state: "starting", port, url: undefined, error: undefined, pid: undefined })

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...profileEnv(options.profile),
      OPENCODE_SERVER_USERNAME: "opencode",
      OPENCODE_SERVER_PASSWORD: password,
      OPENCODE_CLIENT: "desktop",
    }
    delete env.OPENCODE_CONFIG_CONTENT

    log("backend", `spawning ${options.binaryPath} serve --port=${port} (${options.profile} profile)`)
    const proc = spawn(options.binaryPath, ["serve", "--hostname=127.0.0.1", `--port=${port}`], {
      cwd: homedir(),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    child = proc
    proc.stdout?.on("data", (chunk: Buffer) => handleOutput(chunk, "stdout"))
    proc.stderr?.on("data", (chunk: Buffer) => handleOutput(chunk, "stderr"))
    proc.on("error", (error) => {
      log("backend", `process error: ${error.message}`)
      setStatus({ state: "error", error: error.message })
    })
    proc.on("exit", (code, signal) => {
      const wasStopping = stopping
      child = null
      clients.clear()
      subscriptionController?.abort()
      subscriptionController = null
      activeDirectory = null
      if (wasStopping) {
        setStatus({ state: "stopped", url: undefined, pid: undefined })
      } else {
        log("backend", `exited unexpectedly code=${code} signal=${signal}`)
        setStatus({ state: "error", error: `opencode server exited (code ${code ?? "?"})` })
      }
    })

    setStatus({ pid: proc.pid })
    await waitForHealth(url, 90_000)
    setStatus({ state: "running", url, pid: proc.pid, error: undefined })
    log("backend", `ready at ${url}`)
    return getBackendStatus()
  })().catch((error) => {
    setStatus({ state: "error", error: (error as Error).message })
    stopBackendImmediate()
    throw error
  })

  try {
    return await startPromise
  } finally {
    startPromise = null
  }
}

export async function stopBackend(): Promise<void> {
  stopping = true
  subscriptionController?.abort()
  subscriptionController = null
  activeDirectory = null
  clients.clear()
  const proc = child
  child = null
  if (!proc || proc.killed) {
    setStatus({ state: "stopped", url: undefined, pid: undefined })
    return
  }
  const pid = proc.pid
  if (pid && process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, timeout: 10_000 })
  } else {
    proc.kill("SIGTERM")
  }
  await new Promise<void>((resolve) => {
    if (proc.exitCode !== null) return resolve()
    const timer = setTimeout(() => {
      if (process.platform !== "win32") proc.kill("SIGKILL")
      resolve()
    }, 4000)
    proc.once("exit", () => {
      clearTimeout(timer)
      resolve()
    })
  })
  setStatus({ state: "stopped", url: undefined, pid: undefined })
}

export function stopBackendImmediate(): void {
  stopping = true
  subscriptionController?.abort()
  const pid = child?.pid
  if (pid && process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, timeout: 5000 })
  } else {
    child?.kill("SIGKILL")
  }
  child = null
}

export async function restartBackend(options: StartOptions): Promise<BackendStatus> {
  await stopBackend()
  return startBackend(options)
}

export function getClient(directory: string): OpencodeClient {
  if (status.state !== "running" || !status.url) {
    throw new Error("opencode backend is not running")
  }
  const key = `${status.url}::${directory}`
  const cached = clients.get(key)
  if (cached) return cached
  const client = createOpencodeClient({
    baseUrl: status.url,
    directory,
    headers: { Authorization: getAuthHeader() },
  })
  clients.set(key, client)
  return client
}

export function clearClients(): void {
  clients = new Map()
}

async function runSubscription(directory: string, epoch: number): Promise<void> {
  const client = getClient(directory)
  const controller = new AbortController()
  subscriptionController = controller
  try {
    const result = await client.event.subscribe({ signal: controller.signal } as never)
    for await (const event of result.stream) {
      if (epoch !== subscriptionEpoch) return
      hooks.onEvent?.({ directory, event })
    }
  } catch (error) {
    if (epoch === subscriptionEpoch && !controller.signal.aborted) {
      log("events", `stream ended: ${(error as Error).message}`)
    }
  }
  if (epoch === subscriptionEpoch && status.state === "running" && !controller.signal.aborted) {
    setTimeout(() => {
      if (epoch === subscriptionEpoch && status.state === "running" && activeDirectory === directory) {
        void runSubscription(directory, epoch)
      }
    }, 1500)
  }
}

export function setActiveDirectory(directory: string | null): void {
  if (directory === activeDirectory) return
  activeDirectory = directory
  subscriptionEpoch += 1
  subscriptionController?.abort()
  subscriptionController = null
  if (!directory || status.state !== "running") return
  void runSubscription(directory, subscriptionEpoch)
}

export async function resubscribe(): Promise<void> {
  const directory = activeDirectory
  if (!directory) return
  subscriptionEpoch += 1
  subscriptionController?.abort()
  subscriptionController = null
  await runSubscription(directory, subscriptionEpoch)
}

export async function reloadInstance(directory: string): Promise<boolean> {
  const client = getClient(directory)
  try {
    await client.instance.dispose()
  } catch (error) {
    log("backend", `instance dispose failed: ${(error as Error).message}`)
  }
  clearClients()
  if (activeDirectory === directory) {
    subscriptionEpoch += 1
    subscriptionController?.abort()
    subscriptionController = null
    void runSubscription(directory, subscriptionEpoch)
  }
  return true
}
