import clsx from "clsx"
import { AlertTriangle, Braces, Check, Copy, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { ConfigScope, LspConfig, LspEntry, LspViewData } from "@shared/types"
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, ScopePicker, Spinner, StatusDot, Toggle } from "../components/ui"
import { parseKeyValue, splitCommand, stringifyKeyValue } from "../lib/config-utils"
import { rpc } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"
import { entriesFromLspRegistry, LSP_MARKETPLACE, LSP_MARKET_CATEGORIES, type LspMarketCategory, type LspMarketEntry } from "../lib/lsp-marketplace"

interface LspEditor {
  mode: "add" | "edit"
  scope: ConfigScope
  name: string
  command: string
  extensions: string
  env: string
  initialization: string
  disabled: boolean
}

const EMPTY_EDITOR: LspEditor = {
  mode: "add",
  scope: "project",
  name: "",
  command: "",
  extensions: "",
  env: "",
  initialization: "",
  disabled: false,
}

function editorFromEntry(entry: LspEntry, scope: ConfigScope): LspEditor {
  return {
    mode: "edit",
    scope,
    name: entry.name,
    command: (entry.config.command ?? []).join(" "),
    extensions: (entry.config.extensions ?? []).join(", "),
    env: stringifyKeyValue(entry.config.env),
    initialization: entry.config.initialization ? JSON.stringify(entry.config.initialization, null, 2) : "",
    disabled: Boolean(entry.config.disabled),
  }
}

export function LspView() {
  const { t } = useT()
  const state = useStudio((store) => store.state)
  const addToast = useStudio((store) => store.addToast)
  const [scope, setScope] = useState<ConfigScope>(state?.activeProject ? "project" : "global")
  const [tab, setTab] = useState<"installed" | "market">("installed")
  const [data, setData] = useState<LspViewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<LspEditor | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<LspMarketCategory | "all">("all")
  const [marketEntries, setMarketEntries] = useState<LspMarketEntry[]>(LSP_MARKETPLACE)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketSource, setMarketSource] = useState<string | null>(null)
  const [marketError, setMarketError] = useState<string | null>(null)

  const load = async () => {
    if (state?.backend.state !== "running") return
    setLoading(true)
    try {
      setData(await rpc("lsp.view"))
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
      const result = await rpc("market.lsp", force)
      const entries = entriesFromLspRegistry(result.entries)
      if (entries.length > 0) {
        setMarketEntries(entries)
        setMarketSource(result.source)
        setMarketError(null)
      } else {
        setMarketSource(null)
        setMarketError(result.errors?.length ? t("market.fallback") : null)
      }
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
  const byName = useMemo(() => new Map(entries.map((entry) => [entry.name, entry])), [entries])
  const runningNames = useMemo(
    () =>
      new Set(
        (data?.statuses ?? []).flatMap((status) => [status.id.toLowerCase(), status.name.toLowerCase()]),
      ),
    [data],
  )

  const toggleEnabled = async (enabled: boolean) => {
    try {
      setData(await rpc("lsp.setEnabled", scope, enabled))
      addToast("success", enabled ? t("lsp.market.enabled") : t("lsp.disabled"))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const toggleServer = async (targetScope: ConfigScope, name: string, disabled: boolean) => {
    try {
      setData(await rpc("lsp.toggle", targetScope, name, disabled))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const save = async () => {
    if (!editor) return
    if (!editor.name.trim()) {
      addToast("error", t("lsp.title"))
      return
    }
    const command = splitCommand(editor.command)
    if (command.length === 0) {
      addToast("error", t("lsp.command"))
      return
    }
    let initialization: Record<string, unknown> | undefined
    if (editor.initialization.trim()) {
      try {
        initialization = JSON.parse(editor.initialization) as Record<string, unknown>
      } catch {
        addToast("error", t("lsp.init"))
        return
      }
    }
    const config: LspConfig = {
      command,
      extensions: editor.extensions
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => (entry.startsWith(".") ? entry : `.${entry}`)),
      ...(editor.env.trim() ? { env: parseKeyValue(editor.env) } : {}),
      ...(initialization ? { initialization } : {}),
      ...(editor.disabled ? { disabled: true } : {}),
    }
    setSaving(true)
    try {
      setData(await rpc("lsp.save", editor.scope, editor.name.trim(), config))
      setEditor(null)
      addToast("success", t("toast.saved"))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (entry: LspEntry) => {
    if (entry.scope === "inherited") return
    if (!window.confirm(t("lsp.removeConfirm", { name: entry.name }))) return
    try {
      setData(await rpc("lsp.remove", entry.scope, entry.name))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const configureFromMarket = (entry: LspMarketEntry) => {
    setEditor({
      ...EMPTY_EDITOR,
      scope,
      name: entry.name,
      command: (entry.serverCommand ?? []).join(" "),
      extensions: entry.extensions.join(", "),
    })
  }

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command)
      addToast("success", t("common.copied"))
    } catch {
      addToast("error", t("common.error"))
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return marketEntries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false
      if (!needle) return true
      return (
        entry.name.toLowerCase().includes(needle) ||
        entry.extensions.some((extension) => extension.toLowerCase().includes(needle)) ||
        entry.requirements.toLowerCase().includes(needle)
      )
    })
  }, [category, search, marketEntries])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={t("lsp.eyebrow")}
        title={t("lsp.title")}
        description={t("lsp.description")}
        actions={
          <>
            <ScopePicker value={scope} onChange={setScope} projectDisabled={!state?.activeProject} />
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? <Spinner size={12} /> : <RefreshCw size={12} />} {t("common.refresh")}
            </Button>
            <Button
              variant="primary"
              onClick={() => setEditor({ ...EMPTY_EDITOR, scope })}
              disabled={!state?.activeProject && scope === "project"}
            >
              <Plus size={13} /> {t("lsp.addServer")}
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
          {t("lsp.installedTab")}
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
          {t("lsp.marketplaceTab")}
          <span className="ml-1.5 rounded-full bg-accent-soft/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
            {marketEntries.length}
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {tab === "installed" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  {t("lsp.forProject")}
                  {data?.enabled ? <Badge tone="good">{t("lsp.enabled")}</Badge> : <Badge>{t("lsp.disabled")}</Badge>}
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted">{t("lsp.disabledHint")}</div>
              </div>
              <Toggle checked={Boolean(data?.enabled)} onChange={(next) => void toggleEnabled(next)} />
            </div>

            {data && data.statuses.length > 0 && (
              <section className="mb-6">
                <div className="mb-2 section-title">{t("lsp.runningServers")}</div>
                <div className="space-y-1.5">
                  {data.statuses.map((status) => (
                    <div
                      key={`${status.id}-${status.root}`}
                      className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2"
                    >
                      <StatusDot tone={status.status === "connected" ? "good" : "bad"} pulse={status.status === "connected"} />
                      <span className="text-[12px] font-medium">{status.name}</span>
                      <span className="font-mono text-[10.5px] text-faint">{status.id}</span>
                      <span className="ml-auto max-w-[45%] truncate font-mono text-[10.5px] text-faint" title={status.root}>
                        {status.root}
                      </span>
                      <Badge tone={status.status === "connected" ? "good" : "bad"}>{t(`status.${status.status}`)}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-2 section-title">{t("lsp.configuredOverrides")}</div>
              {entries.length === 0 ? (
                <EmptyState
                  icon={<Braces size={24} />}
                  title={data?.enabled ? t("lsp.noOverridesEnabled") : t("lsp.noOverridesDisabled")}
                  description={data?.enabled ? t("lsp.noOverridesDescEnabled") : t("lsp.noOverridesDescDisabled")}
                  action={
                    <Button variant="primary" data-tab="market"
          onClick={() => setTab("market")}>
                      <Sparkles size={13} /> {t("lsp.marketplaceTab")}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-1.5">
                  {entries.map((entry) => {
                    const disabled = Boolean(entry.config.disabled) || !data?.enabled
                    return (
                      <div
                        key={`${entry.scope}-${entry.name}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2"
                      >
                        <StatusDot tone={disabled ? "default" : "good"} />
                        <span className="text-[12.5px] font-medium">{entry.name}</span>
                        <Badge>{t(`common.${entry.scope}`)}</Badge>
                        {entry.config.command && (
                          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-faint">
                            {entry.config.command.join(" ")}
                          </span>
                        )}
                        {entry.config.extensions && (
                          <span className="font-mono text-[10.5px] text-faint">{entry.config.extensions.join(" ")}</span>
                        )}
                        {entry.scope !== "inherited" ? (
                          <>
                            <Toggle
                              checked={!entry.config.disabled}
                              onChange={(next) => void toggleServer(entry.scope as ConfigScope, entry.name, !next)}
                              label={entry.name}
                            />
                            <IconButton title={t("lsp.edit")} onClick={() => setEditor(editorFromEntry(entry, entry.scope as ConfigScope))}>
                              <Pencil size={12} />
                            </IconButton>
                            <IconButton
                              className="hover:bg-bad/10 hover:text-bad"
                              title={t("lsp.remove")}
                              onClick={() => void remove(entry)}
                            >
                              <Trash2 size={12} />
                            </IconButton>
                          </>
                        ) : (
                          <Button className="h-6 px-2 text-[10px]" onClick={() => setEditor(editorFromEntry(entry, scope))}>
                            {t("lsp.override")}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <div className="mt-6 rounded-lg border border-line bg-surface/40 px-3 py-2 text-[11px] leading-relaxed text-faint">
              {t("lsp.downloadHint")}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="card-heading">{t("lsp.market.title")}</h2>
                <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-muted">{t("lsp.market.description")}</p>
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
                    placeholder={t("lsp.market.search")}
                    className="w-44 bg-transparent text-[12px] outline-none placeholder:text-faint"
                  />
                </div>
                <Button className="h-8 px-2.5 text-[11px]" onClick={() => void loadMarket(true)} disabled={marketLoading || state?.backend.state !== "running"}>
                  {marketLoading ? <Spinner size={11} /> : <RefreshCw size={11} />}
                </Button>
                {!data?.enabled && (
                  <Button variant="primary" onClick={() => void toggleEnabled(true)}>
                    <Check size={12} /> {t("lsp.market.enable")}
                  </Button>
                )}
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
                {t("lsp.market.category.all")}
              </button>
              {LSP_MARKET_CATEGORIES.map((item) => (
                <button
                  key={item}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    category === item
                      ? "border-accent/50 bg-accent-soft/40 text-accent"
                      : "border-line bg-canvas text-muted hover:border-faint hover:text-ink",
                  )}
                  onClick={() => setCategory(item)}
                >
                  {t(`lsp.market.category.${item}`)}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="mt-8">
                <EmptyState title={t("lsp.market.noResults")} />
              </div>
            ) : (
              <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((entry) => {
                  const configured = byName.get(entry.name)
                  const running = runningNames.has(entry.name.toLowerCase())
                  const disabled = Boolean(configured?.config.disabled) || !data?.enabled
                  return (
                    <div
                      key={entry.name}
                      className="group flex flex-col rounded-xl border border-line bg-surface/60 p-3.5 transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-raised hover:shadow-lg"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-accent">
                          <Braces size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-semibold">{entry.name}</span>
                            {running && <Badge tone="good">{t("common.connected")}</Badge>}
                            {configured && <Badge>{t("lsp.configuredOverrides")}</Badge>}
                            {entry.source && <span className="text-[9px] text-faint">{entry.source}</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {entry.extensions.slice(0, 4).map((extension) => (
                              <span key={extension} className="rounded bg-line-soft/70 px-1 py-0.5 font-mono text-[9px] text-faint">
                                {extension}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-[10.5px] leading-relaxed text-muted">
                        <span className="font-medium text-ink/80">
                          {t("lsp.market.requirements")}:
                        </span>{" "}
                        {entry.autoInstall
                          ? t("lsp.market.autoInstallHint")
                          : entry.installCommand
                            ? t("lsp.market.manualInstallHint")
                            : entry.requirements}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9.5px]">
                        <span className={clsx("badge text-[9.5px]", entry.autoInstall ? "border-good/25 text-good" : "")}>
                          {entry.autoInstall ? t("lsp.market.autoInstall") : t("lsp.market.manualInstall")}
                        </span>
                        <span className="badge text-[9.5px]">{t(`lsp.market.category.${entry.category}`)}</span>
                      </div>
                      {entry.installCommand && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1.5">
                          <code className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted">
                            {entry.installCommand}
                          </code>
                          <button
                            className="shrink-0 text-faint hover:text-ink"
                            title={t("lsp.market.copyCommand")}
                            onClick={() => void copyCommand(entry.installCommand as string)}
                          >
                            <Copy size={10} />
                          </button>
                        </div>
                      )}
                      <div className="mt-3 flex gap-1.5">
                        {entry.serverCommand ? (
                          <Button className="h-7 flex-1 px-2 text-[11px]" onClick={() => configureFromMarket(entry)}>
                            <Pencil size={11} /> {t("lsp.market.addConfig")}
                          </Button>
                        ) : entry.source ? (
                          <Button className="h-7 flex-1 px-2 text-[11px]" disabled>
                            <AlertTriangle size={11} /> {t("lsp.market.manualInstall")}
                          </Button>
                        ) : (
                          <Button
                            className="h-7 flex-1 px-2 text-[11px]"
                            onClick={() => {
                              if (!data?.enabled) {
                                void toggleEnabled(true)
                              } else {
                                void toggleServer(scope, entry.name, !disabled)
                              }
                            }}
                          >
                            {disabled ? <Check size={11} /> : <AlertTriangle size={11} />}
                            {disabled ? t("common.enable") : t("common.disable")}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="mt-5 rounded-lg border border-line bg-surface/40 px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              {t("lsp.warning")}
            </div>
          </>
        )}
      </div>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === "edit" ? t("lsp.editorEdit", { name: editor.name }) : t("lsp.editorAdd")}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? <Spinner size={12} /> : <Check size={12} />} {t("lsp.saveServer")}
            </Button>
          </>
        }
      >
        {editor && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("common.name")}>
                <input
                  className="input"
                  disabled={editor.mode === "edit"}
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                  placeholder="my-lsp"
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
            <Field label={t("lsp.command")} hint={t("lsp.commandHint")}>
              <input
                className="input font-mono"
                value={editor.command}
                onChange={(event) => setEditor({ ...editor, command: event.target.value })}
              />
            </Field>
            <Field label={t("lsp.extensions")} hint={t("lsp.extensionsHint")}>
              <input
                className="input font-mono"
                value={editor.extensions}
                onChange={(event) => setEditor({ ...editor, extensions: event.target.value })}
              />
            </Field>
            <Field label={t("lsp.env")} hint={t("lsp.envHint")}>
              <textarea
                className="input min-h-[70px] font-mono"
                value={editor.env}
                onChange={(event) => setEditor({ ...editor, env: event.target.value })}
              />
            </Field>
            <Field label={t("lsp.init")} hint={t("lsp.initHint")}>
              <textarea
                className="input min-h-[90px] font-mono"
                value={editor.initialization}
                onChange={(event) => setEditor({ ...editor, initialization: event.target.value })}
                placeholder='{ "preferences": { "importModuleSpecifierPreference": "relative" } }'
              />
            </Field>
            <div className="flex items-center gap-3">
              <Toggle
                checked={!editor.disabled}
                onChange={(next) => setEditor({ ...editor, disabled: !next })}
                label={t("lsp.enableServer")}
              />
              <span className="text-[12px] text-muted">{t("lsp.serverEnabled")}</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {t("lsp.warning")}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

