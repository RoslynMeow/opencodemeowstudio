import { app } from "electron"
import { autoUpdater, type UpdateInfo } from "electron-updater"
import type { UpdateStatus } from "@shared/types"
import { log } from "./logger"

let status: UpdateStatus = {
  phase: "idle",
  currentVersion: app.getVersion(),
  portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
}

let onStatus: ((next: UpdateStatus) => void) | null = null

function update(next: Partial<UpdateStatus>): UpdateStatus {
  status = { ...status, ...next, currentVersion: app.getVersion() }
  onStatus?.(status)
  return status
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initUpdater(listener: (next: UpdateStatus) => void): void {
  onStatus = listener
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = {
    info: (message?: unknown) => log("updater", String(message ?? "")),
    warn: (message?: unknown) => log("updater", `warn: ${String(message ?? "")}`),
    error: (message?: unknown) => log("updater", `error: ${String(message ?? "")}`),
    debug: (message?: unknown) => log("updater", `debug: ${String(message ?? "")}`),
  }

  autoUpdater.on("checking-for-update", () => update({ phase: "checking", message: undefined }))
  autoUpdater.on("update-available", (info: UpdateInfo) =>
    update({
      phase: "available",
      availableVersion: info.version,
      releaseDate: info.releaseDate,
      message: undefined,
    }),
  )
  autoUpdater.on("update-not-available", () => update({ phase: "not-available", message: undefined }))
  autoUpdater.on("download-progress", (progress) =>
    update({ phase: "downloading", percent: Math.round(progress.percent) }),
  )
  autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
    update({ phase: "downloaded", availableVersion: info.version, percent: 100, message: undefined }),
  )
  autoUpdater.on("error", (error: Error) => update({ phase: "error", message: error.message }))

  if (!app.isPackaged) {
    update({ phase: "disabled", message: "Updates are only available in packaged builds" })
  } else if (process.env.PORTABLE_EXECUTABLE_DIR) {
    update({ phase: "disabled", message: "Portable builds do not auto-update; download a new portable exe" })
  } else {
    update({ phase: "idle" })
    setTimeout(() => void checkForUpdates(), 8000)
  }
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return update({ phase: "disabled", message: "Updates are only available in packaged builds" })
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return update({ phase: "disabled", message: "Portable builds do not auto-update; download a new portable exe" })
  }
  try {
    update({ phase: "checking", message: undefined })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    update({ phase: "error", message: (error as Error).message })
  }
  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (status.phase !== "available") return status
  try {
    update({ phase: "downloading", percent: 0 })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    update({ phase: "error", message: (error as Error).message })
  }
  return status
}

export function installUpdate(): boolean {
  if (status.phase !== "downloaded") return false
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return true
}
