import { app, dialog, shell } from "electron"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { log } from "./logger"

export function crashReportsDir(): string {
  return join(app.getPath("userData"), "crash-reports")
}

export function reportCrash(kind: string, error: unknown, extra?: Record<string, unknown>): string | null {
  const report = {
    kind,
    time: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) },
    extra,
  }
  try {
    const dir = crashReportsDir()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${Date.now()}-${kind}.json`)
    writeFileSync(file, JSON.stringify(report, null, 2), "utf8")
    log("crash", `${kind}: ${report.error.message} (${file})`)
    return file
  } catch (writeError) {
    log("crash", `${kind}: ${report.error.message}; failed to save report: ${(writeError as Error).message}`)
    return null
  }
}

export function installCrashHandlers(): void {
  process.on("uncaughtException", (error) => {
    const file = reportCrash("uncaught-exception", error)
    if (app.isReady()) {
      const result = dialog.showMessageBoxSync({
        type: "error",
        title: "OpenCode MeowStudio crashed",
        message: error.message,
        detail: file ? `A crash report was saved to:\n${file}` : "The crash report could not be saved.",
        buttons: ["Open report folder", "Close"],
        defaultId: 0,
        cancelId: 1,
      })
      if (result === 0) void shell.openPath(file ? crashReportsDir() : app.getPath("userData"))
    }
    app.exit(1)
  })

  process.on("unhandledRejection", (reason) => {
    reportCrash("unhandled-rejection", reason)
  })
}
