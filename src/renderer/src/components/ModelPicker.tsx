import clsx from "clsx"
import { Bot, Check, ChevronDown, Search, Settings } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react"
import { createPortal } from "react-dom"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"
import { StatusDot } from "./ui"

function usePopoverPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  direction: "up" | "down",
  width: number,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({})
  useEffect(() => {
    if (!open) return
    let frame = 0
    let last = ""
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      const nextWidth = Math.min(width, window.innerWidth - 16)
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - nextWidth - 8)
      const next: CSSProperties =
        direction === "up"
          ? { position: "fixed", left, width: nextWidth, bottom: window.innerHeight - rect.top + 8 }
          : { position: "fixed", left, width: nextWidth, top: rect.bottom + 8 }
      const key = JSON.stringify(next)
      if (key !== last) {
        last = key
        setStyle(next)
      }
    }
    const tick = () => {
      place()
      frame = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener("resize", place)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", place)
    }
  }, [anchorRef, direction, open, width])
  return style
}

export function ModelPicker({
  onManage,
  compact = false,
  direction = "down",
}: {
  onManage?: () => void
  compact?: boolean
  direction?: "up" | "down"
}) {
  const { t } = useT()
  const providers = useStudio((state) => state.providers)
  const projectId = useStudio((state) => state.state?.activeProjectId ?? null)
  const selected = useStudio((state) => (projectId ? state.selectedModels[projectId] : undefined))
  const setModel = useStudio((state) => state.setModel)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuStyle = usePopoverPosition(buttonRef, open, direction, 360)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const active = selected ?? providers?.defaultModel
  const activeProvider = providers?.providers.find((provider) => provider.id === active?.providerID)
  const activeModel = activeProvider?.models.find((model) => model.id === active?.modelID)

  const filtered = useMemo(() => {
    if (!providers) return []
    const needle = query.trim().toLowerCase()
    return providers.providers
      .map((provider) => ({
        ...provider,
        models: needle
          ? provider.models.filter(
              (model) =>
                model.name.toLowerCase().includes(needle) ||
                model.id.toLowerCase().includes(needle) ||
                provider.name.toLowerCase().includes(needle),
            )
          : provider.models,
      }))
      .filter((provider) => provider.models.length > 0)
  }, [providers, query])

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        data-model-picker
        className={clsx(
          "flex items-center gap-2 rounded-lg border border-line bg-surface transition-colors hover:border-faint",
          compact ? "max-w-[220px] px-2 py-1 text-[11.5px]" : "max-w-[280px] px-2.5 py-1.5 text-[12px]",
          open && "border-accent/60",
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <StatusDot tone={activeProvider?.connected ? "good" : "default"} />
        <span className="truncate font-medium">{activeModel?.name ?? t("models.selectModel")}</span>
        {!compact && <span className="truncate text-faint">{activeProvider?.name ?? ""}</span>}
        <ChevronDown size={12} className={clsx("shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            data-popover="model"
            className={clsx(
              "animate-fade-up z-[60] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl",
            )}
            style={menuStyle}
          >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("models.searchModels")}
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-faint"
            />
          </div>
          <div className="max-h-[390px] overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-muted">
                {providers?.providers.length ? t("models.noMatchingModels") : t("models.noProvidersYet")}
              </div>
            )}
            {filtered.map((provider) => (
              <div key={provider.id} className="pb-1">
                <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                  <StatusDot tone={provider.connected ? "good" : "default"} />
                  <span className="truncate">{provider.name}</span>
                  <span className="ml-auto font-normal normal-case tracking-normal text-faint">{provider.models.length}</span>
                </div>
                {provider.models.map((model) => {
                  const isActive = active?.providerID === provider.id && active?.modelID === model.id
                  return (
                    <button
                      key={`${provider.id}/${model.id}`}
                      className={clsx(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-line-soft",
                        isActive && "bg-accent-soft/60",
                      )}
                      onClick={() => {
                        setModel({ providerID: provider.id, modelID: model.id })
                        setOpen(false)
                        setQuery("")
                      }}
                    >
                      <span className="w-3.5 shrink-0">{isActive && <Check size={12} className="text-accent" />}</span>
                      <span className="min-w-0 flex-1 truncate">{model.name}</span>
                      <span className="shrink-0 text-[10.5px] text-faint">
                        {model.contextLimit ? `${Math.round(model.contextLimit / 1000)}k` : ""}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {onManage && (
            <button
              className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[12px] text-muted transition-colors hover:bg-line-soft hover:text-ink"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <Settings size={13} />
              {t("models.manage")}
            </button>
          )}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function AgentPicker({ compact = false }: { compact?: boolean }) {
  const { t } = useT()
  const agents = useStudio((state) => state.agents)
  const projectId = useStudio((state) => state.state?.activeProjectId ?? null)
  const activeSessionId = useStudio((state) => state.activeSessionId)
  const selected = useStudio((state) => (projectId ? state.selectedAgents[projectId] : undefined))
  const sessionAgent = useStudio((state) => (activeSessionId ? state.sessionAgents[activeSessionId] : undefined))
  const setAgent = useStudio((state) => state.setAgent)
  const setSessionAgent = useStudio((state) => state.setSessionAgent)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuStyle = usePopoverPosition(buttonRef, open, "up", 220)
  const primary = agents.filter((agent) => agent.mode !== "subagent")
  const current = sessionAgent ?? selected ?? primary.find((agent) => agent.name === "build")?.name ?? primary[0]?.name ?? ""

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        data-agent-picker
        className={clsx(
          "flex items-center gap-1.5 rounded-lg border border-line bg-surface text-muted transition-colors hover:border-faint",
          compact ? "h-[26px] max-w-[140px] px-2 text-[11px]" : "h-[30px] max-w-[160px] px-2.5 text-[12px]",
          open && "border-accent/60",
        )}
        onClick={() => setOpen((value) => !value)}
        title={t("tree.agent")}
      >
        <Bot size={11} className="shrink-0 text-faint" />
        <span className="min-w-0 truncate">{current}</span>
        <ChevronDown size={11} className={clsx("shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            data-popover="agent"
            className="animate-fade-up z-[60] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-2xl"
            style={menuStyle}
          >
          <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-faint">{t("tree.agent")}</div>
          <div className="max-h-[260px] overflow-y-auto">
            {primary.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-faint">{t("models.noAgents")}</div>}
            {primary.map((agent) => {
              const active = agent.name === current
              return (
                <button
                  key={agent.name}
                  type="button"
                  className={clsx(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-line-soft",
                    active ? "text-ink" : "text-muted",
                  )}
                  onClick={() => {
                    if (activeSessionId) setSessionAgent(activeSessionId, agent.name)
                    else setAgent(agent.name)
                    setOpen(false)
                  }}
                >
                  <span className="w-3 shrink-0">{active && <Check size={11} className="text-accent" />}</span>
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                </button>
              )
            })}
          </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
