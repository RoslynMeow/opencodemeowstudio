import clsx from "clsx"
import { Check, ChevronDown, Cpu, Download, ExternalLink, KeyRound, RefreshCw, Search, Server, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { OllamaInfo, ProviderAuthMethod, ProviderInfo, ProviderOAuthStart } from "@shared/types"
import { Badge, Button, EmptyState, Field, Modal, PageHeader, ScopePicker, Spinner, StatusDot } from "../components/ui"
import { formatBytes, rpc, truncate } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"

interface OAuthState {
  method: number
  start: ProviderOAuthStart
}

export function ModelsView() {
  const { t } = useT()
  const state = useStudio((store) => store.state)
  const catalog = useStudio((store) => store.providers)
  const refreshProviders = useStudio((store) => store.refreshProviders)
  const addToast = useStudio((store) => store.addToast)
  const setModel = useStudio((store) => store.setModel)
  const projectId = useStudio((store) => store.state?.activeProjectId ?? null)
  const selected = useStudio((store) => (projectId ? store.selectedModels[projectId] : undefined))

  const [search, setSearch] = useState("")
  const [authMethods, setAuthMethods] = useState<Record<string, ProviderAuthMethod[]>>({})
  const [provider, setProvider] = useState<ProviderInfo | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [savingKey, setSavingKey] = useState(false)
  const [oauth, setOauth] = useState<OAuthState | null>(null)
  const [oauthCode, setOauthCode] = useState("")
  const [oauthBusy, setOauthBusy] = useState(false)

  const [ollamaBase, setOllamaBase] = useState("http://127.0.0.1:11434")
  const [ollama, setOllama] = useState<OllamaInfo | null>(null)
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<Set<string>>(new Set())
  const [ollamaScope, setOllamaScope] = useState<"project" | "global">(state?.activeProject ? "project" : "global")
  const [installing, setInstalling] = useState(false)

  const running = state?.backend.state === "running"

  const detect = async () => {
    setOllamaLoading(true)
    try {
      const info = await rpc("provider.ollamaDetect", ollamaBase)
      setOllama(info)
      if (info.reachable) setOllamaModels(new Set(info.models.map((model) => model.name)))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setOllamaLoading(false)
    }
  }

  const loadAuthMethods = async () => {
    if (!running) return
    try {
      setAuthMethods(await rpc("provider.authMethods"))
    } catch {
      setAuthMethods({})
    }
  }

  useEffect(() => {
    void detect()
    void loadAuthMethods()
    if (running) void refreshProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const filteredProviders = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const available = catalog?.available ?? []
    if (!needle) return available.slice(0, 80)
    return available
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.id.toLowerCase().includes(needle) ||
          item.env.some((entry) => entry.toLowerCase().includes(needle)),
      )
      .slice(0, 80)
  }, [catalog, search])

  const connected = useMemo(() => new Set((catalog?.providers ?? []).map((item) => item.id)), [catalog])

  const installOllama = async () => {
    if (!ollama) return
    const models = [...ollamaModels]
    if (models.length === 0) {
      addToast("error", t("models.ollama.noModels"))
      return
    }
    setInstalling(true)
    try {
      await rpc("provider.ollamaInstall", ollamaScope, ollama.baseUrl, models)
      await refreshProviders()
      addToast("success", t("mcp.market.installSuccess", { name: t("models.ollama.title") }))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  const saveKey = async () => {
    if (!provider || !apiKey.trim()) return
    setSavingKey(true)
    try {
      await rpc("provider.setApiKey", provider.id, apiKey.trim())
      await refreshProviders()
      addToast("success", `${provider.name} ${t("common.connected")}`)
      setProvider(null)
      setApiKey("")
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setSavingKey(false)
    }
  }

  const startOAuth = async (methodIndex: number) => {
    if (!provider) return
    setOauthBusy(true)
    try {
      const start = await rpc("provider.oauthAuthorize", provider.id, methodIndex)
      setOauth({ method: methodIndex, start })
      setOauthCode("")
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setOauthBusy(false)
    }
  }

  const finishOAuth = async () => {
    if (!provider || !oauth) return
    setOauthBusy(true)
    try {
      if (oauth.start.method !== "auto") {
        await rpc("provider.oauthCallback", provider.id, oauth.method, oauthCode.trim() || undefined)
      }
      await refreshProviders()
      addToast("success", `${provider.name} ${t("common.connected")}`)
      setProvider(null)
      setOauth(null)
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setOauthBusy(false)
    }
  }

  const methods = provider ? authMethods[provider.id] ?? [] : []

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={t("models.eyebrow")}
        title={t("models.title")}
        description={t("models.description")}
        actions={
          <Button onClick={() => void refreshProviders()} disabled={!running}>
            <RefreshCw size={13} /> {t("common.refresh")}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!running && (
          <div className="mb-4 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-warn">
            {t("models.offlineWarning")}
          </div>
        )}

        <section className="rounded-xl border border-accent/25 bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <Cpu size={16} className="text-accent" />
                {t("models.ollama.title")}
                {ollama?.reachable && <Badge tone="good">{t("models.ollama.reachable")}</Badge>}
                {ollama && !ollama.reachable && <Badge tone="bad">{t("models.ollama.offline")}</Badge>}
              </div>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">{t("models.ollama.desc")}</p>
            </div>
            <div className="flex items-center gap-2">
              <ScopePicker value={ollamaScope} onChange={setOllamaScope} projectDisabled={!state?.activeProject} />
              <Button onClick={() => void detect()} disabled={ollamaLoading}>
                {ollamaLoading ? <Spinner size={12} /> : <RefreshCw size={12} />} {t("models.ollama.detect")}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <Field label={t("models.ollama.endpoint")}>
                <input className="input" value={ollamaBase} onChange={(event) => setOllamaBase(event.target.value)} />
              </Field>
            </div>
            <Button
              variant="primary"
              onClick={() => void installOllama()}
              disabled={!ollama?.reachable || ollama.models.length === 0 || installing}
            >
              {installing ? <Spinner size={12} /> : <Download size={13} />} {t("models.ollama.install")}
            </Button>
          </div>

          {ollama && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
                <Server size={12} />
                {ollama.reachable
                  ? t("models.ollama.models", { version: ollama.version ?? "", count: ollama.models.length })
                  : t("models.ollama.unreachable", { error: ollama.error ?? "-" })}
              </div>
              {ollama.models.length > 0 && (
                <div className="grid max-h-52 gap-1.5 overflow-y-auto md:grid-cols-2">
                  {ollama.models.map((model) => {
                    const checked = ollamaModels.has(model.name)
                    return (
                      <button
                        key={model.name}
                        className={clsx(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors",
                          checked ? "border-accent/40 bg-accent-soft/30" : "border-line bg-canvas hover:border-faint",
                        )}
                        onClick={() => {
                          setOllamaModels((current) => {
                            const next = new Set(current)
                            if (next.has(model.name)) next.delete(model.name)
                            else next.add(model.name)
                            return next
                          })
                        }}
                      >
                        <span
                          className={clsx(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked ? "border-accent bg-accent text-accent-contrast" : "border-line",
                          )}
                        >
                          {checked && <Check size={10} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{model.name}</span>
                        <span className="shrink-0 text-[10px] text-faint">
                          {model.parameterSize ?? formatBytes(model.size)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {ollama.reachable && ollama.models.length === 0 && (
                <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11.5px] text-faint">
                  {t("models.ollama.noModels")}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="card-heading">{t("models.connectedModels")}</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                {catalog
                  ? t("models.connectedSummary", { connected: catalog.providers.length, total: catalog.totalProviders })
                  : t("common.loading")}
              </p>
            </div>
          </div>

          {!catalog || catalog.providers.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={24} />}
              title={t("models.noProvidersTitle")}
              description={t("models.noProvidersDesc")}
            />
          ) : (
            <div className="space-y-2">
              {catalog.providers.map((item) => (
                <details key={item.id} className="overflow-hidden rounded-xl border border-line bg-surface/60">
                  <summary className="flex cursor-pointer select-none items-center gap-2.5 px-4 py-2.5 hover:bg-line-soft/40">
                    <ChevronDown size={13} className="text-faint" />
                    <StatusDot tone={item.connected ? "good" : "default"} />
                    <span className="text-[13px] font-medium">{item.name}</span>
                    <span className="font-mono text-[10.5px] text-faint">{item.id}</span>
                    <span className="ml-auto text-[10.5px] text-faint">
                      {t("models.modelsCount", { count: item.models.length })}
                    </span>
                    <Button
                      className="h-6 px-2 text-[10.5px]"
                      onClick={(event) => {
                        event.preventDefault()
                        setProvider(item)
                        setApiKey("")
                        setOauth(null)
                        if (Object.keys(authMethods).length === 0) void loadAuthMethods()
                      }}
                    >
                      <KeyRound size={11} /> {t("models.auth")}
                    </Button>
                  </summary>
                  <div className="grid gap-1 border-t border-line p-2 md:grid-cols-2">
                    {item.models.map((model) => {
                      const isSelected = selected?.providerID === item.id && selected.modelID === model.id
                      return (
                        <button
                          key={model.id}
                          className={clsx(
                            "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                            isSelected ? "bg-accent-soft/50 text-ink" : "hover:bg-line-soft/60",
                          )}
                          onClick={() => {
                            setModel({ providerID: item.id, modelID: model.id })
                            addToast("success", t("toast.usingModel", { model: model.name }))
                          }}
                        >
                          <span className="w-3">{isSelected && <Check size={11} className="text-accent" />}</span>
                          <span className="min-w-0 flex-1 truncate">{model.name}</span>
                          <span className="shrink-0 text-[10px] text-faint">
                            {model.contextLimit
                              ? t("models.context", { count: Math.round(model.contextLimit / 1000) })
                              : ""}
                          </span>
                          {model.reasoning && <Badge className="text-[9px]">{t("models.reasoning")}</Badge>}
                          {model.toolCall && <Badge className="text-[9px]">{t("models.tools")}</Badge>}
                        </button>
                      )
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-line bg-surface/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="card-heading">{t("models.allProviders")}</h2>
              <p className="mt-0.5 text-[12px] text-muted">{t("models.allProvidersDesc")}</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5">
              <Search size={13} className="text-faint" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("models.searchProviders")}
                className="w-52 bg-transparent text-[12px] outline-none placeholder:text-faint"
              />
            </div>
          </div>
          <div className="grid max-h-[320px] gap-1.5 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
            {filteredProviders.map((item) => (
              <button
                key={item.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-2.5 py-2 text-left transition-colors hover:border-faint hover:bg-raised"
                onClick={() => {
                  const info = catalog?.providers.find((entry) => entry.id === item.id)
                  setProvider(
                    info ?? {
                      id: item.id,
                      name: item.name,
                      env: item.env,
                      connected: connected.has(item.id),
                      models: [],
                    },
                  )
                  setApiKey("")
                  setOauth(null)
                  if (Object.keys(authMethods).length === 0) void loadAuthMethods()
                }}
              >
                <StatusDot tone={connected.has(item.id) ? "good" : "default"} />
                <span className="min-w-0 flex-1 truncate text-[12px]">{item.name}</span>
                {connected.has(item.id) && <Check size={11} className="text-good" />}
              </button>
            ))}
            {filteredProviders.length === 0 && (
              <div className="col-span-full py-6 text-center text-[12px] text-faint">{t("models.noMatchingProviders")}</div>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={Boolean(provider)}
        onClose={() => {
          setProvider(null)
          setOauth(null)
        }}
        title={
          <span className="flex items-center gap-2">
            <KeyRound size={15} className="text-accent" />
            {provider?.name}
            <span className="font-mono text-[11px] font-normal text-faint">{provider?.id}</span>
          </span>
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setProvider(null)
                setOauth(null)
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void saveKey()} disabled={!apiKey.trim() || savingKey}>
              {savingKey ? <Spinner size={12} /> : <KeyRound size={12} />} {t("models.saveApiKey")}
            </Button>
          </>
        }
      >
        {provider && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11.5px] text-muted">
              {provider.env.length > 0
                ? t("models.envVars", { vars: provider.env.join(", ") })
                : t("models.noEnvVars")}
            </div>
            <Field label={t("models.apiKey")} hint={t("models.apiKeyHint")}>
              <input
                type="password"
                className="input"
                placeholder="sk-…"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveKey()
                }}
              />
            </Field>

            <div>
              <div className="label">{t("models.oauthMethods")}</div>
              {methods.length === 0 ? (
                <div className="text-[12px] text-faint">{t("models.noOauth")}</div>
              ) : (
                <div className="space-y-1.5">
                  {methods.map((method, index) => (
                    <div
                      key={`${method.type}-${index}`}
                      className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2"
                    >
                      <span className="text-[12px]">{method.label}</span>
                      <Badge className="text-[9px]">{method.type}</Badge>
                      <Button
                        className="ml-auto h-6 px-2 text-[10.5px]"
                        onClick={() => void startOAuth(index)}
                        disabled={oauthBusy}
                      >
                        {oauthBusy ? <Spinner size={10} /> : <ExternalLink size={10} />} {t("models.start")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {oauth && (
              <div className="space-y-2 rounded-lg border border-accent/30 bg-accent-soft/20 p-3">
                <div className="text-[12px] font-medium">{t("models.authStarted")}</div>
                <div className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">{oauth.start.instructions}</div>
                {oauth.start.url && (
                  <button
                    className="flex items-center gap-1.5 break-all text-left text-[11px] text-accent hover:underline"
                    onClick={() => void rpc("app.openExternal", oauth.start.url)}
                  >
                    <ExternalLink size={11} /> {truncate(oauth.start.url, 90)}
                  </button>
                )}
                {oauth.start.method === "code" && (
                  <Field label={t("models.authCode")}>
                    <input className="input" value={oauthCode} onChange={(event) => setOauthCode(event.target.value)} />
                  </Field>
                )}
                <Button onClick={() => void finishOAuth()} disabled={oauthBusy}>
                  {oauthBusy ? <Spinner size={12} /> : <Check size={12} />}{" "}
                  {oauth.start.method === "auto" ? t("models.refreshConnection") : t("models.authComplete")}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
