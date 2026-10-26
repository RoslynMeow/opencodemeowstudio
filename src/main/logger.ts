import { app } from "electron"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const MAX_LINES = 800
const lines: string[] = []
let logFile: string | null = null
let hook: ((line: string) => void) | null = null

export function initLogger(): void {
  try {
    logFile = join(app.getPath("userData"), "logs", "studio.log")
    mkdirSync(dirname(logFile), { recursive: true })
    if (existsSync(logFile)) {
      const previous = readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean)
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
    try {
      appendFileSync(logFile, line + "\n", "utf8")
    } catch {
      // ignore log write failures
    }
  }
  hook?.(line)
}

export function getLogs(): string[] {
  return [...lines]
}

export function clearLogs(): void {
  lines.length = 0
  if (logFile) {
    try {
      writeFileSync(logFile, "", "utf8")
    } catch {
      // ignore
    }
  }
}
