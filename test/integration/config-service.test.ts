import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Project } from "@shared/types"

const state = vi.hoisted(() => ({
  root: "",
  project: null as Project | null,
  profile: "global" as "global" | "isolated",
}))

vi.mock("../../src/main/store", () => ({
  getActiveProject: () => state.project,
  getSettings: () => ({ profile: state.profile }),
}))

vi.mock("../../src/main/paths", () => ({
  globalConfigDir: (profile: string) => join(state.root, "global", profile),
  globalConfigFile: (profile: string) => join(state.root, "global", profile, "opencode.json"),
  projectConfigFile: (project: Project) => join(project.path, "opencode.json"),
  projectPluginsDir: (project: Project) => join(project.path, ".opencode", "plugins"),
}))

vi.mock("../../src/main/logger", () => ({
  log: () => undefined,
}))

import {
  addNpmPlugin,
  createLocalPlugin,
  ensureProjectConfig,
  installOllamaProvider,
  lspRawEntries,
  mcpRawEntries,
  patchConfig,
  pluginNpmEntries,
  pluginView,
  readConfigValue,
  readRawConfig,
  removeConfigPath,
  removeNpmPlugin,
  setLocalPluginEnabled,
  writeRawConfig,
} from "../../src/main/config-service"

let project: Project
let projectRoot: string

beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), "meowstudio-config-"))
  projectRoot = join(state.root, "project")
  mkdirSync(projectRoot, { recursive: true })
  project = { id: "project-1", name: "project", path: projectRoot, addedAt: Date.now() }
  state.project = project
  state.profile = "global"
})

afterEach(() => {
  state.project = null
  rmSync(state.root, { recursive: true, force: true })
})

describe("config files", () => {
  it("reads a missing config", async () => {
    const raw = await readRawConfig("project")
    expect(raw.exists).toBe(false)
    expect(raw.content).toBe("")
    expect(raw.parsed).toEqual({})
  })

  it("writes and reads a config", async () => {
    const written = await writeRawConfig("project", '{"model":"test/model"}')
    expect(written.exists).toBe(true)
    expect(written.parsed).toEqual({ model: "test/model" })
    expect(readFileSync(join(projectRoot, "opencode.json"), "utf8")).toBe('{"model":"test/model"}')
  })

  it("patches and removes nested values", async () => {
    await patchConfig("project", ["mcp", "demo"], { type: "remote", url: "https://example.com" })
    await patchConfig("project", ["mcp", "demo", "enabled"], false)
    expect(await readConfigValue("project", ["mcp", "demo", "enabled"])).toBe(false)

    const removed = await removeConfigPath("project", ["mcp", "demo", "enabled"])
    expect(removed.parsed).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: { demo: { type: "remote", url: "https://example.com" } },
    })
  })

  it("creates a default project config", async () => {
    const raw = await ensureProjectConfig()
    expect(raw.exists).toBe(true)
    expect(existsSync(join(projectRoot, "opencode.json"))).toBe(true)
    expect(raw.parsed).toEqual({ $schema: "https://opencode.ai/config.json" })
  })

  it("installs an Ollama provider and clears disabled state", async () => {
    await patchConfig("project", ["disabled_providers"], ["ollama-local", "other"])
    const result = await installOllamaProvider("project", "http://localhost:11434/api", ["llama3"])
    expect(result.parsed.provider).toMatchObject({
      "ollama-local": {
        options: { baseURL: "http://localhost:11434/v1" },
        models: { llama3: { name: "llama3" } },
      },
    })
    expect(result.parsed.disabled_providers).toEqual(["other"])
  })

  it("reads MCP and LSP entries", async () => {
    await patchConfig("project", ["mcp", "server"], { type: "local", command: ["npx", "server"] })
    await patchConfig("project", ["lsp", "rust"], { command: ["rust-analyzer"] })
    expect(await mcpRawEntries("project")).toEqual([
      { name: "server", config: { type: "local", command: ["npx", "server"] } },
    ])
    expect(await lspRawEntries("project")).toEqual([{ name: "rust", config: { command: ["rust-analyzer"] } }])
  })
})

describe("plugins", () => {
  it("creates, disables and lists local plugins", async () => {
    const created = await createLocalPlugin("project", "demo.ts", "export const Demo = 1\n")
    expect(created.local).toHaveLength(1)
    expect(created.local[0]).toMatchObject({ name: "demo", enabled: true, scope: "project" })

    const disabled = await setLocalPluginEnabled("project", "demo.ts", false)
    expect(disabled.local[0]).toMatchObject({ name: "demo", enabled: false, fileName: "demo.ts.disabled" })
    expect(existsSync(join(projectRoot, ".opencode", "plugins", "demo.ts.disabled"))).toBe(true)

    const enabled = await setLocalPluginEnabled("project", "demo.ts.disabled", true)
    expect(enabled.local[0]).toMatchObject({ name: "demo", enabled: true })
  })

  it("adds and removes npm plugins", async () => {
    await addNpmPlugin("project", "opencode-plugin-demo")
    await addNpmPlugin("project", "opencode-plugin-demo")
    expect(await pluginNpmEntries("project")).toEqual(["opencode-plugin-demo"])

    await removeNpmPlugin("project", "opencode-plugin-demo")
    expect(await pluginNpmEntries("project")).toEqual([])
  })

  it("lists plugin locations without leaking sync reads", async () => {
    writeFileSync(join(projectRoot, "placeholder.txt"), "x")
    const view = await pluginView()
    expect(view.globalPluginsDir).toBe(join(state.root, "global", "global", "plugins"))
    expect(view.projectPluginsDir).toBe(join(projectRoot, ".opencode", "plugins"))
  })
})
