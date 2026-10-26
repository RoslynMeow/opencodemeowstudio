import { app } from "electron"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import type { ConfigPaths, Profile, Project } from "@shared/types"

export function appDataDir(): string {
  return app.getPath("userData")
}

export function profilesRoot(): string {
  return join(appDataDir(), "profiles")
}

export function globalConfigDir(profile: Profile): string {
  if (profile === "isolated") {
    return join(profilesRoot(), "isolated", "config", "opencode")
  }
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(configHome, "opencode")
}

function pickConfigFile(dir: string, preferred: "json" | "jsonc" = "json"): string {
  const jsonc = join(dir, "opencode.jsonc")
  const json = join(dir, "opencode.json")
  if (preferred === "jsonc") return existsSync(jsonc) ? jsonc : json
  if (existsSync(jsonc)) return jsonc
  return json
}

export function globalConfigFile(profile: Profile): string {
  if (profile === "global" && process.env.OPENCODE_CONFIG) {
    return resolve(process.env.OPENCODE_CONFIG)
  }
  return pickConfigFile(globalConfigDir(profile))
}

export function projectConfigFile(project: Project): string {
  return pickConfigFile(project.path)
}

export function projectPluginsDir(project: Project): string {
  return join(project.path, ".opencode", "plugins")
}

export function globalPluginsDir(profile: Profile): string {
  return join(globalConfigDir(profile), "plugins")
}

export function projectDataDir(project: Project): string {
  return join(project.path, ".opencode")
}

export function configPaths(project: Project | null, profile: Profile): ConfigPaths {
  const globalDir = globalConfigDir(profile)
  return {
    globalDir,
    globalFile: globalConfigFile(profile),
    projectFile: project ? projectConfigFile(project) : null,
    globalPlugins: join(globalDir, "plugins"),
    projectPlugins: project ? projectPluginsDir(project) : null,
    projectPath: project?.path ?? null,
  }
}

export function profileEnv(profile: Profile): Record<string, string> {
  if (profile === "global") return {}
  const root = join(profilesRoot(), "isolated")
  return {
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
  }
}

export function runtimeRoot(version: string): string {
  return join(appDataDir(), "runtime", "opencode", version)
}

export function runtimeBinary(version: string): string {
  return join(runtimeRoot(version), "bin", process.platform === "win32" ? "opencode.exe" : "opencode")
}

export function installedRuntimeVersions(): string[] {
  const root = join(appDataDir(), "runtime", "opencode")
  if (!existsSync(root)) return []
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((version) => existsSync(runtimeBinary(version)))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

export function displayProjectName(path: string): string {
  const normalized = resolve(path)
  return basename(normalized) || normalized
}
