import { describe, expect, it } from "vitest"
import type { McpRegistryServer } from "@shared/types"
import {
  buildMarketConfig,
  entriesFromMcpRegistry,
  marketFieldsFor,
  MCP_MARKETPLACE,
  type McpMarketEntry,
} from "../../src/renderer/src/lib/mcp-marketplace"

function remote(name: string, overrides: Partial<McpRegistryServer> = {}): McpRegistryServer {
  return {
    name,
    remotes: [{ type: "streamable-http", url: `https://${name}.example/mcp` }],
    ...overrides,
  }
}

describe("buildMarketConfig", () => {
  it("builds a remote config with headers and oauth", () => {
    const entry: McpMarketEntry = {
      id: "remote",
      name: "Remote",
      category: "dev",
      type: "remote",
      url: "https://example.com/mcp",
      oauth: true,
      fields: [
        { id: "token", headerKey: "Authorization" },
        { id: "ignored" },
      ],
    }

    expect(buildMarketConfig(entry, { token: "secret-token", ignored: "value" })).toEqual({
      type: "remote",
      url: "https://example.com/mcp",
      headers: { Authorization: "secret-token" },
      oauth: {},
      enabled: true,
    })
  })

  it("omits headers when no configured values are present", () => {
    const entry: McpMarketEntry = {
      id: "remote",
      name: "Remote",
      category: "dev",
      type: "remote",
      url: "https://example.com/mcp",
      fields: [{ id: "token", headerKey: "Authorization" }],
    }

    const config = buildMarketConfig(entry, {})
    expect(config).toEqual({ type: "remote", url: "https://example.com/mcp", enabled: true })
  })

  it("substitutes command placeholders and environment defaults", () => {
    const entry: McpMarketEntry = {
      id: "local",
      name: "Local",
      category: "files",
      type: "local",
      command: ["npx", "-y", "server", "{{directory}}", "{{missing}}"],
      fields: [
        { id: "apiKey", envKey: "API_KEY", default: "fallback" },
        { id: "otherKey", envKey: "OTHER_KEY" },
      ],
    }

    expect(buildMarketConfig(entry, { directory: "/tmp/project" })).toEqual({
      type: "local",
      command: ["npx", "-y", "server", "/tmp/project", ""],
      environment: { API_KEY: "fallback" },
      enabled: true,
    })
  })

  it("omits environment when no local fields are configured", () => {
    const entry: McpMarketEntry = {
      id: "local",
      name: "Local",
      category: "dev",
      type: "local",
      command: ["npx", "-y", "server"],
    }

    const config = buildMarketConfig(entry, {})
    expect(config.type).toBe("local")
    expect(config).not.toHaveProperty("environment")
  })

  it("exposes entry fields with a safe default", () => {
    expect(marketFieldsFor(MCP_MARKETPLACE[0] as McpMarketEntry)).toEqual([])
  })
})

describe("entriesFromMcpRegistry", () => {
  it("maps a remote server with headers and metadata", () => {
    const [entry] = entriesFromMcpRegistry([
      {
        name: "io.example/files",
        title: "Example Files",
        description: "File storage\\nserver",
        websiteUrl: "https://example.com",
        repository: { url: "https://github.com/example/files" },
        remotes: [
          {
            type: "streamable-http",
            url: "https://example.com/mcp",
            headers: [
              {
                name: "Authorization",
                description: "Bearer token",
                isRequired: true,
                isSecret: true,
                default: "token",
              },
            ],
          },
        ],
        packages: [{ registryType: "npm", identifier: "ignored-package" }],
      },
    ])

    expect(entry).toMatchObject({
      id: "io.example-files",
      name: "Example Files",
      description: "File storage\nserver",
      category: "files",
      type: "remote",
      url: "https://example.com/mcp",
      homepage: "https://example.com",
      tags: ["io.example/files", "streamable-http"],
      source: "MCP Registry",
    })
    expect(entry?.fields).toEqual([
      {
        id: "header:Authorization",
        label: "Authorization",
        placeholder: "Bearer token",
        required: true,
        secret: true,
        headerKey: "Authorization",
        default: "token",
      },
    ])
  })

  it("maps an npm package when no remote is present", () => {
    const [entry] = entriesFromMcpRegistry([
      {
        name: "example-package",
        description: "Database helper",
        packages: [
          {
            registryType: "npm",
            identifier: "@scope/server",
            version: "1.2.3",
            runtimeHint: "npx",
            runtimeArguments: [{ value: "--yes" }],
            environmentVariables: [
              {
                name: "API_KEY",
                description: "API key",
                isRequired: true,
                isSecret: true,
                default: "secret",
              },
            ],
          },
        ],
      },
    ])

    expect(entry).toMatchObject({
      id: "example-package",
      category: "data",
      type: "local",
      command: ["npx", "-y", "--yes", "@scope/server@1.2.3"],
      tags: ["example-package", "npm"],
    })
    expect(entry?.fields).toEqual([
      {
        id: "env:API_KEY",
        label: "API_KEY",
        placeholder: "API key",
        required: true,
        secret: true,
        envKey: "API_KEY",
        default: "secret",
      },
    ])
  })

  it("prefers remotes over packages and skips unusable servers", () => {
    const entries = entriesFromMcpRegistry([
      remote("remote-first"),
      { name: "no-transport" },
      { name: "no-url", remotes: [{ type: "sse" }] },
      { name: "empty" },
    ])

    expect(entries.map((entry) => [entry.name, entry.type])).toEqual([["remote-first", "remote"]])
  })

  it("de-duplicates generated ids", () => {
    const entries = entriesFromMcpRegistry([remote("same"), remote("same"), remote("same-2")])

    expect(entries.map((entry) => entry.id)).toEqual(["same", "same-2", "same-2-2"])
  })

  it("keeps explicit source labels", () => {
    const [entry] = entriesFromMcpRegistry([remote("sourced", { sourceLabel: "Custom Registry" })])

    expect(entry?.source).toBe("Custom Registry")
  })

  it("derives categories from server names and descriptions", () => {
    const servers: McpRegistryServer[] = [
      remote("files", { description: "file storage" }),
      remote("search", { description: "search the docs" }),
      remote("data", { description: "postgres database" }),
      remote("productivity", { description: "slack notifications" }),
      remote("cloud", { description: "aws cloud" }),
      remote("other", { description: "misc" }),
    ]

    expect(entriesFromMcpRegistry(servers).map((entry) => entry.category)).toEqual([
      "files",
      "search",
      "data",
      "productivity",
      "cloud",
      "dev",
    ])
  })
})
