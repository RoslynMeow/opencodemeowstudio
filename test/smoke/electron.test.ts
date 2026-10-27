import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const executable = resolve("release/win-unpacked/OpenCode MeowStudio.exe")
const canRun = process.platform === "win32" && existsSync(executable) && process.env.STUDIO_SKIP_ELECTRON_SMOKE !== "1"

interface UiSmokeResult {
  error?: string
  elapsedMs?: number
  window?: {
    title?: string
    visible?: boolean
    destroyed?: boolean
    url?: string
  }
  renderer?: {
    hasStudio?: boolean
    platform?: string
    versions?: { electron?: string; chrome?: string; node?: string }
    documentTitle?: string
    readyState?: string
    bodyText?: string
    loadingBar?: boolean
    state?: {
      appVersion?: string
      platform?: string
      userDataDir?: string
      settings?: { autoDownload?: boolean }
    }
    update?: { phase?: string; currentVersion?: string; portable?: boolean }
  }
}

function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || !child.pid) return
  try {
    execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    })
  } catch {
    // The process may have exited between the check and taskkill.
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      killTree(child)
      reject(new Error(`Electron smoke test timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.once("exit", (code) => {
      clearTimeout(timer)
      resolvePromise(code)
    })
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

describe.skipIf(!canRun)("packaged Electron smoke", () => {
  it(
    "launches win-unpacked with an isolated profile and serves preload RPC",
    async () => {
      const userData = mkdtempSync(join(tmpdir(), "meowstudio-electron-smoke-"))
      writeFileSync(
        join(userData, "studio-state.json"),
        JSON.stringify({
          settings: {
            autoDownload: false,
            sessionWorktrees: false,
            singleWriterLock: false,
          },
        }),
        "utf8",
      )

      let stdout = ""
      let stderr = ""
      const child = spawn(executable, ["--disable-gpu"], {
        env: {
          ...process.env,
          STUDIO_USER_DATA: userData,
          STUDIO_SMOKE_UI: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      })
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      try {
        const exitCode = await waitForExit(child, 180_000)
        const resultFile = join(userData, "ui-smoke-result.json")
        if (!existsSync(resultFile)) {
          throw new Error(
            `Electron smoke did not write a result file.\nexit=${exitCode}\nstdout:\n${stdout.slice(-4000)}\nstderr:\n${stderr.slice(-4000)}`,
          )
        }

        const result = JSON.parse(readFileSync(resultFile, "utf8")) as UiSmokeResult
        expect(exitCode, result.error ?? stderr.slice(-2000)).toBe(0)
        expect(result.error).toBeUndefined()
        expect(result.window).toMatchObject({
          title: "OpenCode MeowStudio",
          visible: true,
          destroyed: false,
        })
        expect(result.window?.url).toMatch(/^file:\/\/.*\/renderer\/index\.html$/)
        expect(result.renderer).toMatchObject({
          hasStudio: true,
          platform: "win32",
          documentTitle: "OpenCode MeowStudio",
          readyState: "complete",
        })
        expect(result.renderer?.versions?.electron).toMatch(/^\d+\.\d+\.\d+/)
        expect(result.renderer?.bodyText).toContain("OpenCode MeowStudio")
        expect(result.renderer?.loadingBar).toBe(true)
        expect(result.renderer?.state?.appVersion).toBe("1.0.0")
        expect(result.renderer?.state?.platform).toBe("win32")
        expect(resolve(result.renderer?.state?.userDataDir ?? "").toLowerCase()).toBe(
          resolve(userData).toLowerCase(),
        )
        expect(result.renderer?.state?.settings?.autoDownload).toBe(false)
        expect(typeof result.renderer?.update?.phase).toBe("string")
        expect(result.renderer?.update?.phase?.length).toBeGreaterThan(0)
        expect(result.renderer?.update?.currentVersion).toBe("1.0.0")
        expect(result.renderer?.update?.portable).toBe(false)
        expect(result.elapsedMs).toBeGreaterThan(0)
      } finally {
        killTree(child)
        try {
          rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        } catch {
          // Windows can briefly hold log files after the app exits.
        }
      }
    },
    240_000,
  )
})
