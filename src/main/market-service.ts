import { strFromU8, unzipSync } from "fflate"
import type {
  LspRegistryMarket,
  MarketSource,
  MasonRegistryPackage,
  McpRegistryMarket,
  McpRegistryServer,
} from "@shared/types"
import { log } from "./logger"
import { getSettings } from "./store"

const MCP_TTL = 6 * 60 * 60 * 1000
const LSP_TTL = 24 * 60 * 60 * 1000
const MCP_PAGES = 5
const MCP_PAGE_SIZE = 100

interface Cached<T> {
  signature: string
  fetchedAt: number
  data: T
}

let mcpCache: Cached<McpRegistryMarket> | null = null
let lspCache: Cached<LspRegistryMarket> | null = null

function sourceHeaders(source: MarketSource, accept = "application/json"): Record<string, string> {
  return {
    Accept: accept,
    "User-Agent": "OpenCode-MeowStudio",
    ...(source.headers ?? {}),
  }
}

async function fetchJson<T>(url: string, source: MarketSource): Promise<T> {
  const response = await fetch(url, {
    headers: sourceHeaders(source),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

function normalizeMcpPayload(payload: unknown): McpRegistryServer[] {
  if (Array.isArray(payload)) return payload.filter((item): item is McpRegistryServer => Boolean((item as McpRegistryServer)?.name))
  if (payload && typeof payload === "object") {
    const record = payload as { servers?: Array<{ server?: McpRegistryServer }>; entries?: McpRegistryServer[] }
    if (Array.isArray(record.servers)) {
      return record.servers
        .map((item) => item.server ?? (item as unknown as McpRegistryServer))
        .filter((item): item is McpRegistryServer => Boolean(item?.name))
    }
    if (Array.isArray(record.entries)) return record.entries.filter((item) => Boolean(item?.name))
  }
  return []
}

async function fetchMcpSource(source: MarketSource): Promise<McpRegistryServer[]> {
  if (source.kind === "mcp-json") {
    const payload = await fetchJson<unknown>(source.url, source)
    return normalizeMcpPayload(payload)
  }
  const entries = new Map<string, McpRegistryServer>()
  let cursor: string | undefined
  for (let page = 0; page < MCP_PAGES; page++) {
    const url = new URL(source.url)
    if (source.kind === "mcp-registry") {
      url.searchParams.set("version", "latest")
      url.searchParams.set("limit", String(MCP_PAGE_SIZE))
      if (cursor) url.searchParams.set("cursor", cursor)
    }
    const body = await fetchJson<{
      servers?: Array<{ server?: McpRegistryServer }>
      metadata?: { nextCursor?: string }
    }>(url.toString(), source)
    for (const item of normalizeMcpPayload(body)) entries.set(item.name, item)
    cursor = body.metadata?.nextCursor
    if (!cursor) break
  }
  return [...entries.values()]
}

export async function fetchMcpRegistry(force = false): Promise<McpRegistryMarket> {
  const sources = (getSettings().marketSources?.mcp ?? []).filter((source) => source.enabled && source.url.trim())
  const signature = JSON.stringify(sources)
  if (!force && mcpCache && mcpCache.signature === signature && Date.now() - mcpCache.fetchedAt < MCP_TTL) {
    return mcpCache.data
  }
  if (sources.length === 0) throw new Error("No enabled MCP market sources")

  const merged = new Map<string, McpRegistryServer>()
  const errors: string[] = []
  const labels: string[] = []
  for (const source of [...sources].sort((a, b) => a.priority - b.priority)) {
    labels.push(source.label)
    try {
      const entries = await fetchMcpSource(source)
      for (const entry of entries) {
        if (!merged.has(entry.name)) merged.set(entry.name, { ...entry, sourceLabel: source.label })
      }
    } catch (error) {
      const message = `${source.label}: ${(error as Error).message}`
      errors.push(message)
      log("market", message)
    }
  }
  if (merged.size === 0) throw new Error(errors.join("; ") || "No MCP servers returned")
  const data: McpRegistryMarket = {
    entries: [...merged.values()],
    fetchedAt: Date.now(),
    source: labels.join(", "),
    errors,
  }
  mcpCache = { signature, fetchedAt: data.fetchedAt, data }
  log("market", `fetched ${data.entries.length} MCP servers from ${labels.join(", ")}`)
  return data
}

function githubRepo(url: string): string | null {
  const full = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i)
  if (full) return `${full[1]}/${full[2]!.replace(/\.git$/, "")}`
  const short = url.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (short) return `${short[1]}/${short[2]!.replace(/\.git$/, "")}`
  return null
}

async function fetchMasonSource(source: MarketSource): Promise<MasonRegistryPackage[]> {
  if (source.kind === "mason-json") {
    const payload = await fetchJson<MasonRegistryPackage[] | { packages?: MasonRegistryPackage[]; entries?: MasonRegistryPackage[] }>(
      source.url,
      source,
    )
    if (Array.isArray(payload)) return payload
    return payload.packages ?? payload.entries ?? []
  }

  let archiveUrl = source.url
  if (source.kind === "mason-github") {
    const repo = githubRepo(source.url)
    if (!repo) throw new Error("Expected a GitHub repository (owner/repo)")
    const release = await fetchJson<{
      assets?: Array<{ name?: string; browser_download_url?: string }>
    }>(`https://api.github.com/repos/${repo}/releases/latest`, source)
    const asset = (release.assets ?? []).find((item) => item.name === "registry.json.zip")
    if (!asset?.browser_download_url) throw new Error("Release has no registry.json.zip asset")
    archiveUrl = asset.browser_download_url
  }

  const response = await fetch(archiveUrl, {
    headers: sourceHeaders(source),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (!archiveUrl.toLowerCase().endsWith(".zip")) {
    return JSON.parse(new TextDecoder().decode(buffer)) as MasonRegistryPackage[]
  }
  const files = unzipSync(buffer)
  const key = Object.keys(files).find((name) => name.endsWith("registry.json"))
  if (!key) throw new Error("Archive has no registry.json")
  return JSON.parse(strFromU8(files[key] as Uint8Array)) as MasonRegistryPackage[]
}

export async function fetchLspRegistry(force = false): Promise<LspRegistryMarket> {
  const sources = (getSettings().marketSources?.lsp ?? []).filter((source) => source.enabled && source.url.trim())
  const signature = JSON.stringify(sources)
  if (!force && lspCache && lspCache.signature === signature && Date.now() - lspCache.fetchedAt < LSP_TTL) {
    return lspCache.data
  }
  if (sources.length === 0) throw new Error("No enabled LSP market sources")

  const merged = new Map<string, MasonRegistryPackage>()
  const errors: string[] = []
  const labels: string[] = []
  for (const source of [...sources].sort((a, b) => a.priority - b.priority)) {
    labels.push(source.label)
    try {
      const packages = await fetchMasonSource(source)
      for (const entry of packages) {
        if (!entry.categories?.some((category) => category.toLowerCase() === "lsp")) continue
        if (!merged.has(entry.name)) merged.set(entry.name, { ...entry, sourceLabel: source.label })
      }
    } catch (error) {
      const message = `${source.label}: ${(error as Error).message}`
      errors.push(message)
      log("market", message)
    }
  }
  if (merged.size === 0) throw new Error(errors.join("; ") || "No LSP packages returned")
  const data: LspRegistryMarket = {
    entries: [...merged.values()],
    fetchedAt: Date.now(),
    source: labels.join(", "),
    errors,
  }
  lspCache = { signature, fetchedAt: data.fetchedAt, data }
  log("market", `fetched ${data.entries.length} LSP packages from ${labels.join(", ")}`)
  return data
}
