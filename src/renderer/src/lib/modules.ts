import type { StudioModuleId } from "@shared/types"
import type { ViewName } from "../store/useStore"

export const STUDIO_MODULES: Array<{ id: StudioModuleId; view: ViewName; labelKey: string; descriptionKey: string }> = [
  { id: "files", view: "files", labelKey: "files.title", descriptionKey: "settings.moduleFilesDesc" },
  { id: "git", view: "git", labelKey: "git.title", descriptionKey: "settings.moduleGitDesc" },
]

export function isModuleEnabled(enabled: StudioModuleId[] | undefined, id: StudioModuleId): boolean {
  return (enabled ?? []).includes(id)
}

export function viewModule(view: ViewName): StudioModuleId | undefined {
  return STUDIO_MODULES.find((module) => module.view === view)?.id
}
