import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MarketSource } from "@shared/types"

const state = vi.hoisted(() => ({
  settings: {
    marketSources: {
      mcp: [] as MarketSource[],
      lsp: [] as MarketSource[],
    },
  },
  logs: [] as string[],
}))

vi.mock("../../src/main/store", () => ({
  getSettings: () => state.settings,
}))

vi.mock("../../src/main/logger", () => ({
  log: (scope: string, message: string) => {
    state.logs.push(`[${scope}] ${message}`)
  },
}))

import { fetchLspRegistry, fetchMcpRegistry } from "../../src/main/market-service"

function source(overrides: Partial<MarketSource> & Pick<MarketSource, "id" | "label" | "kind" | "url">): MarketSource {
  return { enabled: true, priority: 0, ...overrides }
}

function jsonResponse(payload: unknown): { ok: true; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: async () => payload }
}

function errorResponse(status: number): { ok: false; status: number; json: () => Promise<unknown> } {
  return { ok: false, status, json: async () => ({}) }
}

const fetchMock = vi.fn()

beforeEach(() => {
  state.settings.marketSources.mcp = []
  state.settings.marketSources.lsp = []
  state.logs = []
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchMcpRegistry", () => {
  it("merges sources in priority order and lets the highest priority win", async () => {
    const high = source({
      id: "high",
      label: "High",
      kind: "mcp-json",
      url: "https://high.test/servers",
      priority: 0,
    })
    const low = source({
      id: "low",
      label: "Low",
      kind: "mcp-json",
      url: "https://low.test/servers",
      priority: 10,
    })
    const disabled = source({
      id: "disabled",
      label: "Disabled",
      kind: "mcp-json",
      url: "https://disabled.test/servers",
      priority: -1,
      enabled: false,
    })
    state.settings.marketSources.mcp = [low, disabled, high]

    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith("https://high.test")) {
        return jsonResponse({
          servers: [
            { server: { name: "shared", title: "Shared from high" } },
            { server: { name: "only-high" } },
          ],
        })
      }
      if (url.startsWith("https://low.test")) {
        return jsonResponse({
          servers: [
            { server: { name: "shared", title: "Shared from low" } },
            { server: { name: "only-low" } },
          ],
        })
      }
      throw new Error("disabled source must not be fetched")
    })

    const market = await fetchMcpRegistry(true)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(market.entries.map((entry) => [entry.name, entry.title, entry.sourceLabel])).toEqual([
      ["shared", "Shared from high", "High"],
      ["only-high", undefined, "High"],
      ["only-low", undefined, "Low"],
    ])
    expect(market.source).toBe("High, Low")
    expect(market.errors).toEqual([])
  })

  it("keeps successful sources when another source fails", async () => {
    state.settings.marketSources.mcp = [
      source({ id: "broken", label: "Broken", kind: "mcp-json", url: "https://broken.test", priority: 0 }),
      source({ id: "ok", label: "OK", kind: "mcp-json", url: "https://ok.test", priority: 1 }),
    ]

    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).startsWith("https://broken.test")) return errorResponse(500)
      return jsonResponse([{ name: "working" }])
    })

    const market = await fetchMcpRegistry(true)

    expect(market.entries.map((entry) => entry.name)).toEqual(["working"])
    expect(market.errors).toEqual(["Broken: HTTP 500"])
    expect(market.source).toBe("Broken, OK")
  })

  it("throws when every source fails", async () => {
    state.settings.marketSources.mcp = [
      source({ id: "a", label: "A", kind: "mcp-json", url: "https://a.test", priority: 0 }),
      source({ id: "b", label: "B", kind: "mcp-json", url: "https://b.test", priority: 1 }),
    ]

    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).startsWith("https://a.test")) return errorResponse(500)
      throw new Error("network down")
    })

    await expect(fetchMcpRegistry(true)).rejects.toThrow("A: HTTP 500; B: network down")
  })

  it("throws when no sources are enabled", async () => {
    await expect(fetchMcpRegistry(true)).rejects.toThrow("No enabled MCP market sources")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("normalizes entries payloads and ignores unnamed servers", async () => {
    state.settings.marketSources.mcp = [
      source({ id: "entries", label: "Entries", kind: "mcp-json", url: "https://entries.test" }),
    ]

    fetchMock.mockImplementation(async () =>
      jsonResponse({ entries: [{ name: "named" }, { title: "missing name" }, null] }),
    )

    const market = await fetchMcpRegistry(true)
    expect(market.entries.map((entry) => entry.name)).toEqual(["named"])
  })

  it("caches successful results until the source signature changes", async () => {
    state.settings.marketSources.mcp = [
      source({ id: "cache", label: "Cache", kind: "mcp-json", url: "https://cache.test" }),
    ]

    fetchMock.mockImplementation(async () => jsonResponse([{ name: "cached" }]))

    const first = await fetchMcpRegistry()
    const second = await fetchMcpRegistry()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)

    state.settings.marketSources.mcp = [
      source({ id: "cache", label: "Cache", kind: "mcp-json", url: "https://cache.test", priority: 5 }),
    ]

    await fetchMcpRegistry()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("fetchLspRegistry", () => {
  it("merges LSP packages in priority order and filters non-LSP categories", async () => {
    const high = source({
      id: "high",
      label: "High",
      kind: "mason-json",
      url: "https://high.test/packages",
      priority: 0,
    })
    const low = source({
      id: "low",
      label: "Low",
      kind: "mason-json",
      url: "https://low.test/packages",
      priority: 10,
    })
    state.settings.marketSources.lsp = [low, high]

    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).startsWith("https://high.test")) {
        return jsonResponse([
          { name: "dup", description: "from high", categories: ["LSP"] },
          { name: "not-lsp", categories: ["Formatter"] },
        ])
      }
      return jsonResponse([
        { name: "dup", description: "from low", categories: ["LSP"] },
        { name: "only-low", description: "only", categories: ["lsp"] },
      ])
    })

    const market = await fetchLspRegistry(true)

    expect(market.entries.map((entry) => [entry.name, entry.description, entry.sourceLabel])).toEqual([
      ["dup", "from high", "High"],
      ["only-low", "only", "Low"],
    ])
    expect(market.source).toBe("High, Low")
  })

  it("keeps successes when a Mason source fails", async () => {
    state.settings.marketSources.lsp = [
      source({ id: "bad", label: "Bad", kind: "mason-json", url: "https://bad.test", priority: 0 }),
      source({ id: "good", label: "Good", kind: "mason-json", url: "https://good.test", priority: 1 }),
    ]

    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input).startsWith("https://bad.test")) return errorResponse(404)
      return jsonResponse([{ name: "server", categories: ["LSP"] }])
    })

    const market = await fetchLspRegistry(true)
    expect(market.entries.map((entry) => entry.name)).toEqual(["server"])
    expect(market.errors).toEqual(["Bad: HTTP 404"])
  })

  it("throws when no LSP sources are enabled", async () => {
    await expect(fetchLspRegistry(true)).rejects.toThrow("No enabled LSP market sources")
  })
})
