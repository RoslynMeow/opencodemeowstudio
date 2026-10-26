import { app } from "electron"
import type { AppState } from "@shared/types"
import { configPaths } from "./paths"
import { getBackendStatus } from "./sidecar"
import { getRuntimeStatus } from "./runtime"
import { getActiveProject, getProjects, getSettings } from "./store"
import { emitEvent } from "./events"

export function buildAppState(): AppState {
  const project = getActiveProject()
  const settings = getSettings()
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    locale: app.getLocale(),
    userDataDir: app.getPath("userData"),
    projects: getProjects(),
    activeProjectId: project?.id ?? null,
    activeProject: project,
    settings,
    runtime: getRuntimeStatus(),
    backend: getBackendStatus(),
    configPaths: configPaths(project, settings.profile),
  }
}

export function broadcastState(): AppState {
  const state = buildAppState()
  emitEvent({ type: "state", state })
  return state
}
