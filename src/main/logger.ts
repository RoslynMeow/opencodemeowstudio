import { app } from "electron"
import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const MAX_LINES = 800
const lines: string[] = []
let logFile: string | null = null
let hook: ((line: string) => void) | null = null
let queue: string[] = []
let flushTimer: NodeJS.Timeout | null = null
let writeChain: Promise<void> = Promise.resolve()

async function flushQueue(): Promise<void> {
  if (!logFile || queue.length === 0) return
  const data = `${queue.splice(0, queue.length).join("\n")}\n`
  const file = logFile
  writeChain = writeChain.then(() => appendFile(file, data, "utf8")).catch(() => undefined)
  await writeChain
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushQueue()
  }, 40)
}

export async function initLogger(): Promise<void> {
  try {
    logFile = join(app.getPath("userData"), "logs", "studio.log")
    await mkdir(dirname(logFile), { recursive: true })
    if (existsSync(logFile)) {
      const previous = (await readFile(logFile, "utf8")).split(/\r?\n/).filter(Boolean)
      lines.push(...previous.slice(-Math.floor(MAX_LINES / 2)))
    }
    log("app", `starting ${app.getName()} ${app.getVersion()}`)
  } catch (error) {
    console.error("logger init failed", error)
  }
}

export function setLogHook(next: ((line: string) => void) | null): void {
  hook = next
}

export function log(scope: string, message: string): void {
  const stamp = new Date().toISOString()
  const text = message.replace(/\u001b\[[0-9;]*m/g, "").trimEnd()
  const line = `[${stamp}] [${scope}] ${text}`
  lines.push(line)
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
  if (logFile) {
    queue.push(line)
    scheduleFlush()
  }
  hook?.(line)
}

export function getLogs(): string[] {
  return [...lines]
}

export function clearLogs(): void {
  lines.length = 0
  queue = []
  if (logFile) {
    const file = logFile
    writeChain = writeChain.then(() => writeFile(file, "", "utf8")).catch(() => undefined)
  }
}
