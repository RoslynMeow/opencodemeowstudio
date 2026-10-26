import clsx from "clsx"
import {
  Cloud,
  Database,
  ExternalLink,
  FolderOpen,
  Globe,
  Package,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { ConfigScope, McpConfig, McpEntry, McpStatus, McpViewData } from "@shared/types"
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, ScopePicker, Spinner, StatusDot, Toggle } from "../components/ui"
import { parseKeyValue, splitCommand, stringifyKeyValue } from "../lib/config-utils"
import { rpc, truncate } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"
import {
  buildMarketConfig,
  MCP_MARKET_CATEGORIES,
  MCP_MARKETPLACE,
  entriesFromMcpRegistry,
  marketFieldsFor,
  type McpMarketCategory,
  type McpMarketEntry,
} from "../lib/mcp-marketplace"

interface EditorState {
  mode: "add" | "edit"
  scope: ConfigScope
  name: string
  type: "local" | "remote"
  enabled: boolean
  command: string
  cwd: string
  env: string
  url: string
  headers: string
  oauthMode: "auto" | "off" | "credentials"
  clientId: string
  clientSecret: string
  oauthScope: string
  timeout: string
}

const EMPTY_EDITOR: EditorState = {
  mode: "add",
  scope: "project",
  name: "",
  type: "local",
  enabled: true,
  command: "",
  cwd: "",
  env: "",
  url: "",
  headers: "",
  oauthMode: "auto",
  clientId: "",
  clientSecret: "",
  oauthScope: "",
  timeout: "",
}

const CATEGORY_ICONS = {
  files: FolderOpen,
  search: Search,
  dev: Wrench,
  data: Database,
  productivity: Sparkles,
  cloud: Cloud,
}

function statusTone(status?: McpStatus): "good" | "warn" | "bad" | "default" {
  if (!status) return "default"
  if (status.status === "connected") return "good"
  if (status.status === "failed" || status.status === "needs_client_registration") return "bad"
  if (status.status === "needs_auth") return "warn"
  return "default"
}

function statusKey(status?: McpStatus): string {
  if (!status) return "mcp.status.unknown"
  if (status.status === "connected") return "mcp.status.connected"
  if (status.status === "disabled") return "mcp.status.disabled"
  if (status.status === "needs_auth") return "mcp.status.needsAuth"
  if (status.status === "needs_client_registration") return "mcp.status.needsClientRegistration"
  return "mcp.status.failed"
}

function editorFromEntry(entry: McpEntry, scope: ConfigScope): EditorState {
  const config = entry.config
  if (config.type === "remote") {
    const oauth = config.oauth
    const credentials = oauth === false || !oauth ? null : oauth
    return {
      ...EMPTY_EDITOR,
      mode: "edit",
      scope,
      name: entry.name,
      type: "remote",
      enabled: config.enabled !== false,
      url: config.url,
      headers: stringifyKeyValue(config.headers),
      oauthMode: oauth === false ? "off" : oauth ? "credentials" : "auto",
      clientId: credentials?.clientId ?? "",
      clientSecret: credentials?.clientSecret ?? "",
      oauthScope: credentials?.scope ?? "",
      timeout: config.timeout ? String(config.timeout) : "",
    }
  }
  return {
    ...EMPTY_EDITOR,
    mode: "edit",
    scope,
    name: entry.name,
    type: "local",
    enabled: config.enabled !== false,
    command: config.command.join(" "),
    cwd: config.cwd ?? "",
    env: stringifyKeyValue(config.environment),
    timeout: config.timeout ? String(config.timeout) : "",
  }
}

function buildConfig(editor: EditorState): McpConfig {
  const timeout = editor.timeout.trim() ? Number(editor.timeout) : undefined
  if (editor.type === "local") {
    return {
      type: "local",
      command: splitCommand(editor.command),
      ...(editor.cwd.trim() ? { cwd: editor.cwd.trim() } : {}),
      ...(editor.env.trim() ? { environment: parseKeyValue(editor.env) } : {}),
      ...(timeout && Number.isFinite(timeout) ? { timeout } : {}),
      enabled: editor.enabled,
    }
  }
  const headers = parseKeyValue(editor.headers)
  const oauth =
    editor.oauthMode === "off"
      ? false
      : editor.oauthMode === "credentials"
        ? {
            ...(editor.clientId.trim() ? { clientId: editor.clientId.trim() } : {}),
            ...(editor.clientSecret.trim() ? { clientSecret: editor.clientSecret.trim() } : {}),
            ...(editor.oauthScope.trim() ? { scope: editor.oauthScope.trim() } : {}),
          }
        : undefined
  return {
    type: "remote",
    url: editor.url.trim(),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(oauth === undefined ? {} : { oauth }),
    ...(timeout && Number.isFinite(timeout) ? { timeout } : {}),
    enabled: editor.enabled,
  }
}

export function McpView() {
  const { t } = useT()
  const state = useStudio((store) => store.state)
  const addToast = useStudio((store) => store.addToast)
  const [scope, setScope] = useState<ConfigScope>(state?.activeProject ? "project" : "global")
  const [tab, setTab] = useState<"installed" | "market">("installed")
  const [data, setData] = useState<McpViewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<McpMarketCategory | "all">("all")
  const [marketTarget, setMarketTarget] = useState<McpMarketEntry | null>(null)
  const [marketValues, setMarketValues] = useState<Record<string, string>>({})
  const [installing, setInstalling] = useState(false)
  const [marketEntries, setMarketEntries] = useState<McpMarketEntry[]>(MCP_MARKETPLACE)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketSource, setMarketSource] = useState<string | null>(null)
  const [marketError, setMarketError] = useState<string | null>(null)

  const load = async () => {
    if (state?.backend.state !== "running") return
    setLoading(true)
    try {
      setData(await rpc("mcp.view"))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.backend.state, state?.activeProjectId])

  const loadMarket = async (force = false) => {
    setMarketLoading(true)
    setMarketError(null)
    try {
      const result = await rpc("market.mcp", force)
      const entries = entriesFromMcpRegistry(result.entries)
      if (entries.length > 0) setMarketEntries(entries)
      setMarketSource(result.source)
    } catch (error) {
      setMarketError((error as Error).message)
    } finally {
      setMarketLoading(false)
    }
  }

  useEffect(() => {
    if (tab === "market") void loadMarket(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const entries = data?.entries ?? []
  const installedNames = useMemo(() => new Set(entries.map((entry) => entry.name)), [entries])
  const connectedCount = entries.filter((entry) => entry.status?.status === "connected").length
  const failedCount = entries.filter(
    (entry) => entry.status?.status === "failed" || entry.status?.status === "needs_client_registration",
  ).length

  const openAdd = (preset?: McpConfig, presetName?: string) => {
    setEditor({
      ...EMPTY_EDITOR,
      scope,
      ...(preset
        ? preset.type === "local"
          ? {
              type: "local" as const,
              command: preset.command.join(" "),
              cwd: preset.cwd ?? "",
              env: stringifyKeyValue(preset.environment),
              name: presetName ?? "",
            }
          : {
              type: "remote" as const,
              url: preset.url,
              headers: stringifyKeyValue(preset.headers),
              oauthMode:
                preset.oauth === false ? ("off" as const) : preset.oauth ? ("credentials" as const) : ("auto" as const),
              name: presetName ?? "",
            }
        : {}),
    })
  }

  const save = async () => {
    if (!editor) return
    if (!editor.name.trim()) {
      addToast("error", t("mcp.name"))
      return
    }
    const config = buildConfig(editor)
    if (config.type === "local" && config.command.length === 0) {
      addToast("error", t("mcp.command"))
      return
    }
    if (config.type === "remote" && !config.url) {
      addToast("error", t("mcp.url"))
      return
    }
    setSaving(true)
    try {
      const next = await rpc("mcp.save", editor.scope, editor.name.trim(), config)
      setData(next)
      setEditor(null)
      addToast("success", t("toast.saved"))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (entry: McpEntry) => {
    if (entry.scope === "inherited") return
    if (!window.confirm(t("mcp.removeConfirm", { name: entry.name }))) return
    try {
      setData(await rpc("mcp.remove", entry.scope, entry.name))
      addToast("success", t("common.remove"))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const toggle = async (entry: McpEntry, enabled: boolean) => {
    if (entry.scope === "inherited") return
    try {
      setData(await rpc("mcp.toggle", entry.scope, entry.name, enabled))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const authenticate = async (entry: McpEntry) => {
    try {
      const start = await rpc("mcp.authStart", entry.name)
      addToast("info", start.instructions || t("mcp.authStarted"))
      setTimeout(() => void load(), 2500)
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const detach = async (entry: McpEntry) => {
    try {
      await rpc("mcp.authRemove", entry.name)
      await load()
      addToast("success", t("common.done"))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const startMarketInstall = (entry: McpMarketEntry) => {
    const installed = entries.find((item) => item.name === entry.id)
    if (installed) {
      if (installed.scope !== "inherited") setEditor(editorFromEntry(installed, installed.scope as ConfigScope))
      else setEditor(editorFromEntry(installed, scope))
      setTab("installed")
      return
    }
    const fields = marketFieldsFor(entry)
    if (fields.length === 0) {
      void installDirect(entry)
      return
    }
    setMarketValues({})
    setMarketTarget(entry)
  }

  const installDirect = async (entry: McpMarketEntry) => {
    setInstalling(true)
    try {
      const next = await rpc("mcp.save", scope, entry.id, buildMarketConfig(entry, {}))
      setData(next)
      addToast("success", t("mcp.market.installSuccess", { name: entry.name }))
      setTab("installed")
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  const installWithFields = async () => {
    if (!marketTarget) return
    const fields = marketFieldsFor(marketTarget)
    for (const field of fields) {
      if (field.required && !marketValues[field.id]?.trim()) {
        addToast("error", field.labelKey ? t(field.labelKey) : field.label ?? field.id)
        return
      }
    }
    setInstalling(true)
    try {
      const next = await rpc("mcp.save", scope, marketTarget.id, buildMarketConfig(marketTarget, marketValues))
      setData(next)
      addToast("success", t("mcp.market.installSuccess", { name: marketTarget.name }))
      setMarketTarget(null)
      setTab("installed")
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  const filteredMarket = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return marketEntries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false
      if (!needle) return true
      return (
        entry.name.toLowerCase().includes(needle) ||
        (entry.descriptionKey ? t(entry.descriptionKey) : entry.description ?? "").toLowerCase().includes(needle) ||
        (entry.tags ?? []).some((tag) => tag.includes(needle))
      )
    })
  }, [category, search, t, marketEntries])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={t("mcp.eyebrow")}
        title={t("mcp.title")}
        description={t("mcp.description")}
        actions={
          <>
            <ScopePicker value={scope} onChange={setScope} projectDisabled={!state?.activeProject} />
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? <Spinner size={12} /> : <RefreshCw size={12} />} {t("common.refresh")}
            </Button>
            <Button variant="primary" onClick={() => openAdd()} disabled={!state?.activeProject && scope === "project"}>
              <Plus size={13} /> {t("mcp.addServer")}
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-1 border-b border-line px-8">
        <button
          className={clsx(
            "border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
            tab === "installed" ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
          )}
          data-tab="installed"
          onClick={() => setTab("installed")}
        >
          {t("mcp.installedTab")}
          {entries.length > 0 && <span className="ml-1.5 text-[10px] text-faint">{entries.length}</span>}
        </button>
        <button
          className={clsx(
            "border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors",
            tab === "market" ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
          )}
          data-tab="market"
          onClick={() => setTab("market")}
        >
          {t("mcp.marketplaceTab")}
          <span className="ml-1.5 rounded-full bg-accent-soft/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
            {marketEntries.length}
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {tab === "installed" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
              <Badge>{t("mcp.configured", { count: entries.length })}</Badge>
              <Badge tone="good">{t("mcp.connected", { count: connectedCount })}</Badge>
              {failedCount > 0 && <Badge tone="bad">{t("mcp.failing", { count: failedCount })}</Badge>}
              <span className="ml-auto font-mono text-[10.5px] text-faint">
                {data?.projectFile ?? state?.configPaths.projectFile}
              </span>
            </div>

            {entries.length === 0 ? (
              <EmptyState
                icon={<Plug size={26} />}
                title={t("mcp.noServersTitle")}
                description={t("mcp.noServersDesc")}
                action={
                  <div className="flex gap-2">
                    <Button variant="primary" data-tab="market"
          onClick={() => setTab("market")}>
                      <Sparkles size={13} /> {t("mcp.marketplaceTab")}
                    </Button>
                    <Button onClick={() => openAdd()}>
                      <Plus size={12} /> {t("mcp.addServer")}
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={`${entry.scope}-${entry.name}`} className="rounded-xl border border-line bg-surface/60 p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-canvas text-accent">
                        {entry.config.type === "local" ? <Terminal size={14} /> : <Globe size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-semibold">{entry.name}</span>
                          <Badge>{t(`common.${entry.scope}`)}</Badge>
                          <Badge>
                            {t(entry.config.type === "local" ? "mcp.localShort" : "mcp.remoteShort")}
                          </Badge>
                          <span className="flex items-center gap-1.5">
                            <StatusDot tone={statusTone(entry.status)} />
                            <span
                              className={clsx(
                                "text-[10.5px] uppercase tracking-wider",
                                statusTone(entry.status) === "good"
                                  ? "text-good"
                                  : statusTone(entry.status) === "bad"
                                    ? "text-bad"
                                    : statusTone(entry.status) === "warn"
                                      ? "text-warn"
                                      : "text-faint",
                              )}
                            >
                              {t(statusKey(entry.status))}
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-faint">
                          {entry.config.type === "local" ? entry.config.command.join(" ") : entry.config.url}
                        </div>
                        {entry.status?.status === "failed" && (
                          <div className="mt-1 text-[11px] text-bad">{truncate(entry.status.error, 200)}</div>
                        )}
                        {entry.status?.status === "needs_client_registration" && (
                          <div className="mt-1 text-[11px] text-bad">{truncate(entry.status.error, 200)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {entry.scope !== "inherited" && (
                          <Toggle
                            checked={entry.config.enabled !== false}
                            onChange={(next) => void toggle(entry, next)}
                            label={entry.name}
                          />
                        )}
                        {(entry.status?.status === "needs_auth" ||
                          (entry.config.type === "remote" && entry.config.oauth !== false)) && (
                          <IconButton title={t("mcp.auth")} onClick={() => void authenticate(entry)}>
                            <ShieldCheck size={13} />
                          </IconButton>
                        )}
                        {entry.scope !== "inherited" ? (
                          <>
                            <IconButton title={t("mcp.edit")} onClick={() => setEditor(editorFromEntry(entry, entry.scope as ConfigScope))}>
                              <Pencil size={13} />
                            </IconButton>
                            <IconButton
                              title={t("mcp.delete")}
                              className="hover:bg-bad/10 hover:text-bad"
                              onClick={() => void remove(entry)}
                            >
                              <Trash2 size={13} />
                            </IconButton>
                          </>
                        ) : (
                          <Button className="h-7 px-2 text-[10.5px]" onClick={() => setEditor(editorFromEntry(entry, scope))}>
                            {t("mcp.override")}
                          </Button>
                        )}
                      </div>
                    </div>
                    {entry.config.type === "remote" && entry.status?.status === "connected" && (
                      <button className="mt-2 text-[10.5px] text-faint hover:text-muted" onClick={() => void detach(entry)}>
                        {t("mcp.removeCredentials")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6">
              <div className="mb-2 section-title">{t("mcp.quickAdd")}</div>
              <div className="flex flex-wrap gap-1.5">
                {marketEntries.slice(0, 8).map((entry) => (
                  <Button key={entry.id} onClick={() => startMarketInstall(entry)}>
                    <Plus size={12} /> {entry.name}
                  </Button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="card-heading">{t("mcp.market.title")}</h2>
                <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-muted">{t("mcp.market.description")}</p>
                <div className="mt-1 text-[10px] text-faint">
                  {marketLoading
                    ? t("mcp.market.loading")
                    : marketError
                      ? marketError
                      : marketSource
                        ? t("mcp.market.source", { source: marketSource, count: marketEntries.length })
                        : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                  <Search size={13} className="text-faint" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("mcp.market.search")}
                    className="w-52 bg-transparent text-[12px] outline-none placeholder:text-faint"
                  />
                </div>
                <Button className="h-8 px-2.5 text-[11px]" onClick={() => void loadMarket(true)} disabled={marketLoading || state?.backend.state !== "running"}>
                  {marketLoading ? <Spinner size={11} /> : <RefreshCw size={11} />}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <button
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  category === "all"
                    ? "border-accent/50 bg-accent-soft/40 text-accent"
                    : "border-line bg-canvas text-muted hover:border-faint hover:text-ink",
                )}
                onClick={() => setCategory("all")}
              >
                {t("mcp.market.category.all")}
              </button>
              {MCP_MARKET_CATEGORIES.map((item) => {
                const Icon = CATEGORY_ICONS[item]
                return (
                  <button
                    key={item}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      category === item
                        ? "border-accent/50 bg-accent-soft/40 text-accent"
                        : "border-line bg-canvas text-muted hover:border-faint hover:text-ink",
                    )}
                    onClick={() => setCategory(item)}
                  >
                    <Icon size={11} /> {t(`mcp.market.category.${item}`)}
                  </button>
                )
              })}
            </div>

            {filteredMarket.length === 0 ? (
              <div className="mt-8">
                <EmptyState title={t("mcp.market.noResults")} description={t("mcp.market.noResultsHint")} />
              </div>
            ) : (
              <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {filteredMarket.map((entry) => {
                  const Icon = CATEGORY_ICONS[entry.category]
                  const installed = installedNames.has(entry.id)
                  const needsConfig = marketFieldsFor(entry).length > 0
                  return (
                    <div
                      key={entry.id}
                      className="group flex flex-col rounded-xl border border-line bg-surface/60 p-3.5 transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-raised hover:shadow-lg"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-accent">
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-semibold">{entry.name}</span>
                            {installed && <Badge tone="good">{t("mcp.market.installed")}</Badge>}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">\n                            {entry.descriptionKey ? t(entry.descriptionKey) : entry.description}\n                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9.5px]">
                        <span className="badge text-[9.5px]">{t(entry.type === "local" ? "mcp.market.localBadge" : "mcp.market.remoteBadge")}</span>
                        {entry.source && <span className="badge max-w-[120px] truncate text-[9.5px]">{entry.source}</span>}
                        {entry.oauth && <span className="badge border-accent/25 text-[9.5px] text-accent">OAuth</span>}
                        {needsConfig && (
                          <span className="badge text-[9.5px] text-warn">{t("mcp.market.requiresConfig")}</span>
                        )}
                        {entry.homepage && (
                          <button
                            className="ml-auto flex items-center gap-1 text-faint hover:text-muted"
                            onClick={() => void rpc("app.openExternal", entry.homepage as string)}
                          >
                            <ExternalLink size={9} /> {t("common.docsShort")}
                          </button>
                        )}
                      </div>
                      <div className="mt-3">
                        <Button
                          variant={installed ? "default" : "primary"}
                          className="h-7 w-full px-2 text-[11px]"
                          onClick={() => startMarketInstall(entry)}
                          disabled={installing}
                        >
                          {installed ? (
                            <>
                              <Pencil size={11} /> {t("mcp.market.configure")}
                            </>
                          ) : (
                            <>
                              <Package size={11} /> {t("mcp.market.install")}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-5 rounded-lg border border-line bg-surface/40 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              {t("mcp.market.communityNote")}
            </div>
          </>
        )}
      </div>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === "edit" ? t("mcp.editorEdit", { name: editor.name }) : t("mcp.editorAdd")}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? <Spinner size={12} /> : <Plug size={12} />} {t("mcp.saveServer")}
            </Button>
          </>
        }
      >
        {editor && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("mcp.name")}>
                <input
                  className="input"
                  value={editor.name}
                  disabled={editor.mode === "edit"}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                  placeholder="my-server"
                />
              </Field>
              <Field label={t("common.scope")}>
                <select
                  className="input"
                  value={editor.scope}
                  onChange={(event) => setEditor({ ...editor, scope: event.target.value as ConfigScope })}
                >
                  <option value="project">{t("common.project")}</option>
                  <option value="global">{t("common.global")}</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("mcp.transport")}>
                <select
                  className="input"
                  value={editor.type}
                  onChange={(event) => setEditor({ ...editor, type: event.target.value as "local" | "remote" })}
                >
                  <option value="local">{t("mcp.local")}</option>
                  <option value="remote">{t("mcp.remote")}</option>
                </select>
              </Field>
              <div className="flex items-end gap-3 pb-1">
                <div>
                  <div className="label">{t("mcp.enabled")}</div>
                  <Toggle checked={editor.enabled} onChange={(next) => setEditor({ ...editor, enabled: next })} />
                </div>
                <div className="flex-1">
                  <Field label={t("mcp.timeout")}>
                    <input
                      className="input"
                      value={editor.timeout}
                      onChange={(event) => setEditor({ ...editor, timeout: event.target.value })}
                      placeholder="5000"
                    />
                  </Field>
                </div>
              </div>
            </div>

            {editor.type === "local" ? (
              <>
                <Field label={t("mcp.command")} hint={t("mcp.commandHint")}>
                  <input
                    className="input font-mono"
                    value={editor.command}
                    onChange={(event) => setEditor({ ...editor, command: event.target.value })}
                    placeholder="npx -y @modelcontextprotocol/server-everything"
                  />
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("mcp.cwd")}>
                    <input
                      className="input font-mono"
                      value={editor.cwd}
                      onChange={(event) => setEditor({ ...editor, cwd: event.target.value })}
                      placeholder="."
                    />
                  </Field>
                  <Field label={t("mcp.env")} hint={t("mcp.envHint")}>
                    <textarea
                      className="input min-h-[76px] font-mono"
                      value={editor.env}
                      onChange={(event) => setEditor({ ...editor, env: event.target.value })}
                      placeholder="API_KEY=..."
                    />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field label={t("mcp.url")}>
                  <input
                    className="input font-mono"
                    value={editor.url}
                    onChange={(event) => setEditor({ ...editor, url: event.target.value })}
                    placeholder="https://mcp.example.com/mcp"
                  />
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("mcp.headers")} hint={t("mcp.headersHint")}>
                    <textarea
                      className="input min-h-[76px] font-mono"
                      value={editor.headers}
                      onChange={(event) => setEditor({ ...editor, headers: event.target.value })}
                      placeholder="Authorization=Bearer ..."
                    />
                  </Field>
                  <div className="space-y-3">
                    <Field label={t("mcp.oauth")}>
                      <select
                        className="input"
                        value={editor.oauthMode}
                        onChange={(event) =>
                          setEditor({ ...editor, oauthMode: event.target.value as EditorState["oauthMode"] })
                        }
                      >
                        <option value="auto">{t("mcp.oauthAuto")}</option>
                        <option value="off">{t("mcp.oauthOff")}</option>
                        <option value="credentials">{t("mcp.oauthCredentials")}</option>
                      </select>
                    </Field>
                    {editor.oauthMode === "credentials" && (
                      <div className="grid gap-2">
                        <input
                          className="input"
                          placeholder={t("mcp.clientId")}
                          value={editor.clientId}
                          onChange={(event) => setEditor({ ...editor, clientId: event.target.value })}
                        />
                        <input
                          className="input"
                          placeholder={t("mcp.clientSecret")}
                          value={editor.clientSecret}
                          onChange={(event) => setEditor({ ...editor, clientSecret: event.target.value })}
                        />
                        <input
                          className="input"
                          placeholder={t("mcp.oauthScope")}
                          value={editor.oauthScope}
                          onChange={(event) => setEditor({ ...editor, oauthScope: event.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] leading-relaxed text-faint">
              {t("mcp.contextWarning")}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(marketTarget)}
        onClose={() => setMarketTarget(null)}
        title={
          marketTarget ? (
            <span className="flex items-center gap-2">
              <Package size={15} className="text-accent" />
              {t("mcp.market.installTitle", { name: marketTarget.name })}
            </span>
          ) : null
        }
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMarketTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void installWithFields()} disabled={installing}>
              {installing ? <Spinner size={12} /> : <Package size={12} />} {t("common.install")}
            </Button>
          </>
        }
      >
        {marketTarget && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-muted">
              {t("mcp.market.installDesc", {
                scope: scope === "project" ? t("common.project") : t("common.global"),
              })}
            </p>
            {marketFieldsFor(marketTarget).map((field) => (
              <Field key={field.id} label={field.labelKey ? t(field.labelKey) : field.label ?? field.id} hint={field.required ? t("common.required") : t("common.optional")}>
                <input
                  className="input font-mono"
                  type={field.secret ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={marketValues[field.id] ?? ""}
                  onChange={(event) => setMarketValues((current) => ({ ...current, [field.id]: event.target.value }))}
                />
              </Field>
            ))}
            <div className="rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[10.5px] leading-relaxed text-faint">
              {marketTarget.type === "local" ? (marketTarget.command ?? []).join(" ") : marketTarget.url}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}


