import { ensureRuntime } from "./runtime"
import { getActiveProject, getSettings } from "./store"
import { getBackendStatus, setActiveDirectory, startBackend, stopBackend } from "./sidecar"
import { broadcastState } from "./app-state"
import { log } from "./logger"
import type { AppState } from "@shared/types"

export async function ensureBackend(forceRuntime = false): Promise<AppState> {
  const settings = getSettings()
  const project = getActiveProject()
  const runtime = await ensureRuntime(settings.runtimeVersion, settings.autoDownload, forceRuntime)
  if (runtime.state !== "ready" || !runtime.binaryPath) {
    throw new Error(runtime.error ?? "opencode runtime is not available")
  }
  const current = getBackendStatus()
  if (current.state !== "running") {
    await startBackend({ binaryPath: runtime.binaryPath, profile: settings.profile })
  }
  setActiveDirectory(project?.path ?? null)
  log("backend", `active project: ${project?.path ?? "(none)"}`)
  return broadcastState()
}

export async function restartBackend(forceRuntime = false): Promise<AppState> {
  await stopBackend()
  return ensureBackend(forceRuntime)
}
