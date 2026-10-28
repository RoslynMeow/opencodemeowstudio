import { access, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser"
import type { ConfigScope, LocalPlugin, PluginViewData, RawConfig } from "@shared/types"
import { log } from "./logger"
import { getActiveProject, getSettings } from "./store"
import { globalConfigDir, globalConfigFile, projectConfigFile, projectPluginsDir } from "./paths"

const DEFAULT_CONFIG = `{
  "$schema": "https://opencode.ai/config.json"
}
`

const MODIFY_OPTIONS = {
  formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
}

export function configFileFor(scope: ConfigScope): string {
  const settings = getSettings()
  if (scope === "global") return globalConfigFile(settings.profile)
  const project = getActiveProject()
  if (!project) throw new Error("No active project. Add or select a project first.")
  return projectConfigFile(project)
}

export async function readRawConfig(scope: ConfigScope): Promise<RawConfig> {
  const file = configFileFor(scope)
  const exists = await access(file).then(() => true).catch(() => false)
  let content = exists ? await readFile(file, "utf8") : ""
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
  let parsed: Record<string, unknown> = {}
  if (content.trim()) {
    const errors: import("jsonc-parser").ParseError[] = []
    const value = parseJsonc(content, errors, { allowTrailingComma: true })
    if (errors.length > 0) {
      const first = errors[0]
      throw new Error(`Invalid JSONC in ${file} at offset ${first?.offset ?? 0}`)
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>
    }
  }
  return { scope, path: file, exists, content, parsed }
}

function validate(content: string, file: string): void {
  const errors: import("jsonc-parser").ParseError[] = []
  parseJsonc(content, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    const first = errors[0]
    throw new Error(`Invalid JSONC in ${file} at offset ${first?.offset ?? 0}`)
  }
}

export async function writeRawConfig(scope: ConfigScope, content: string): Promise<RawConfig> {
  const file = configFileFor(scope)
  validate(content, file)
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, content, "utf8")
  await rename(temp, file)
  log("config", `wrote ${file}`)
  return readRawConfig(scope)
}

export async function patchConfig(scope: ConfigScope, path: (string | number)[], value: unknown): Promise<RawConfig> {
  const file = configFileFor(scope)
  const raw = await readRawConfig(scope)
  const base = raw.content.trim() ? raw.content : DEFAULT_CONFIG
  if (!raw.content.trim() && scope === "global") {
    await mkdir(dirname(file), { recursive: true })
  }
  const edits = modify(base, path, value, MODIFY_OPTIONS)
  const next = applyEdits(base, edits)
  return writeRawConfig(scope, next)
}

export async function removeConfigPath(scope: ConfigScope, path: (string | number)[]): Promise<RawConfig> {
  return patchConfig(scope, path, undefined)
}

export async function readConfigValue<T = unknown>(scope: ConfigScope, path: (string | number)[]): Promise<T | undefined> {
  const raw = await readRawConfig(scope)
  let current: unknown = raw.parsed
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== "object") return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  return current as T | undefined
}

export function normalizeOllamaBaseUrl(input: string): string {
  let base = input.trim() || "http://127.0.0.1:11434"
  base = base.replace(/\/+$/, "")
  base = base.replace(/\/api$/, "")
  base = base.replace(/\/v1$/, "")
  return `${base}/v1`
}

export interface OllamaProviderConfig {
  name: string
  npm: string
  options: { baseURL: string }
  models: Record<string, { name: string }>
}

export async function installOllamaProvider(scope: ConfigScope, baseUrl: string, models: string[]): Promise<RawConfig> {
  const providerID = "ollama-local"
  const normalized = normalizeOllamaBaseUrl(baseUrl)
  const parsed = (await readRawConfig(scope)).parsed
  const providers = asRecord(parsed.provider)
  const existing = asRecord(providers[providerID])
  const existingModels = asRecord(existing.models)
  const modelMap: Record<string, { name: string }> = { ...(existingModels as Record<string, { name: string }>) }
  for (const name of models) {
    if (!name) continue
    modelMap[name] = { name }
  }
  const provider: OllamaProviderConfig = {
    name: "Ollama (local)",
    npm: "@ai-sdk/openai-compatible",
    options: { baseURL: normalized },
    models: modelMap,
  }
  let result = await patchConfig(scope, ["provider", providerID], provider)

  const disabled = (await readRawConfig(scope)).parsed.disabled_providers
  if (Array.isArray(disabled) && disabled.includes(providerID)) {
    const filtered = disabled.filter((entry) => entry !== providerID)
    result = await patchConfig(scope, ["disabled_providers"], filtered)
  }
  return result
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

export async function mcpRawEntries(scope: ConfigScope): Promise<Array<{ name: string; config: Record<string, unknown> }>> {
  const parsed = (await readRawConfig(scope)).parsed
  const mcp = asRecord(parsed.mcp)
  return Object.entries(mcp).map(([name, config]) => ({ name, config: asRecord(config) }))
}

export async function lspRawConfig(scope: ConfigScope): Promise<unknown> {
  return (await readRawConfig(scope)).parsed.lsp
}

export async function lspRawEntries(scope: ConfigScope): Promise<Array<{ name: string; config: Record<string, unknown> }>> {
  const lsp = (await readRawConfig(scope)).parsed.lsp
  if (!lsp || typeof lsp !== "object" || Array.isArray(lsp)) return []
  return Object.entries(lsp).map(([name, config]) => ({ name, config: asRecord(config) }))
}

export async function pluginNpmEntries(scope: ConfigScope): Promise<string[]> {
  const value = (await readRawConfig(scope)).parsed.plugin
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

export async function addNpmPlugin(scope: ConfigScope, name: string): Promise<RawConfig> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Plugin package name is required")
  const current = await pluginNpmEntries(scope)
  if (current.includes(trimmed)) return readRawConfig(scope)
  return patchConfig(scope, ["plugin"], [...current, trimmed])
}

export async function removeNpmPlugin(scope: ConfigScope, name: string): Promise<RawConfig> {
  const filtered = (await pluginNpmEntries(scope)).filter((entry) => entry !== name)
  if (filtered.length === 0) return removeConfigPath(scope, ["plugin"])
  return patchConfig(scope, ["plugin"], filtered)
}

const PLUGIN_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"])

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false)
}

async function scanPluginDir(dir: string, scope: ConfigScope): Promise<LocalPlugin[]> {
  if (!(await pathExists(dir))) return []
  const entries: LocalPlugin[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const full = join(dir, entry.name)
    const enabled = !entry.name.endsWith(".disabled")
    const rawName = enabled ? entry.name : entry.name.slice(0, -".disabled".length)
    const extension = extname(rawName).toLowerCase()
    if (!PLUGIN_EXTENSIONS.has(extension)) continue
    let size = 0
    let modified = 0
    try {
      const info = await stat(full)
      size = info.size
      modified = info.mtimeMs
    } catch {
      // ignore
    }
    entries.push({
      name: basename(rawName, extension),
      fileName: entry.name,
      path: full,
      scope,
      enabled,
      size,
      modified,
    })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function pluginView(): Promise<PluginViewData> {
  const project = getActiveProject()
  const settings = getSettings()
  const globalDir = join(globalConfigDir(settings.profile), "plugins")
  const projectDir = project ? projectPluginsDir(project) : null
  const npm = [
    ...(project ? (await pluginNpmEntries("project")).map((name) => ({ name, scope: "project" as const })) : []),
    ...(await pluginNpmEntries("global")).map((name) => ({ name, scope: "global" as const })),
  ]
  const local = [
    ...(await scanPluginDir(globalDir, "global")),
    ...(projectDir ? await scanPluginDir(projectDir, "project") : []),
  ]
  return {
    npm,
    local,
    globalPluginsDir: globalDir,
    projectPluginsDir: projectDir,
  }
}

function pluginsDirFor(scope: ConfigScope): string {
  const settings = getSettings()
  if (scope === "global") return join(globalConfigDir(settings.profile), "plugins")
  const project = getActiveProject()
  if (!project) throw new Error("No active project")
  return projectPluginsDir(project)
}

export async function setLocalPluginEnabled(scope: ConfigScope, fileName: string, enabled: boolean): Promise<PluginViewData> {
  const dir = pluginsDirFor(scope)
  const source = join(dir, fileName)
  const target = enabled ? source.replace(/\.disabled$/, "") : `${source}.disabled`
  if (!(await pathExists(source))) throw new Error(`Plugin file not found: ${source}`)
  if (source === target) return pluginView()
  if (await pathExists(target)) throw new Error(`Target file already exists: ${target}`)
  await rename(source, target)
  log("plugins", `${enabled ? "enabled" : "disabled"} local plugin ${fileName}`)
  return pluginView()
}

export async function createLocalPlugin(scope: ConfigScope, fileName: string, content: string): Promise<PluginViewData> {
  const dir = pluginsDirFor(scope)
  await mkdir(dir, { recursive: true })
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-")
  if (!PLUGIN_EXTENSIONS.has(extname(safeName).toLowerCase())) {
    throw new Error("Plugin file must use .js, .ts, .mjs or .cjs")
  }
  const target = join(dir, safeName)
  if (await pathExists(target)) throw new Error(`Plugin file already exists: ${target}`)
  await writeFile(target, content, "utf8")
  log("plugins", `created local plugin ${target}`)
  return pluginView()
}

export function globalPluginsFolder(): string {
  return join(globalConfigDir(getSettings().profile), "plugins")
}

export function projectPluginsFolder(): string | null {
  const project = getActiveProject()
  return project ? projectPluginsDir(project) : null
}

export async function ensureProjectConfig(): Promise<RawConfig> {
  const raw = await readRawConfig("project")
  if (!raw.exists) return writeRawConfig("project", DEFAULT_CONFIG)
  return raw
}
