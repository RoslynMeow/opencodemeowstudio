import clsx from "clsx"
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Circle,
  FileText,
  Globe,
  ListTodo,
  Pencil,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  Undo2,
  Wrench,
  X,
} from "lucide-react"
import { useState } from "react"
import type { Part, SessionEntry } from "@shared/types"
import { safeJson, truncate } from "../lib/rpc"
import { CopyButton, Spinner } from "./ui"
import { Markdown } from "./Markdown"
import { ClarificationCard } from "./ClarificationCard"
import { parseClarifications } from "../lib/clarifications"
import { useT } from "../i18n/useT"

type ToolPart = Extract<Part, { type: "tool" }>

function textOf(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .map((part) => parseClarifications(part.text).plain)
    .filter(Boolean)
    .join("\n\n")
}

function toolIcon(tool: string) {
  const name = tool.toLowerCase()
  if (name.includes("bash") || name.includes("shell") || name.includes("terminal")) return Terminal
  if (name.includes("read") || name.includes("write") || name.includes("edit") || name.includes("patch")) return FileText
  if (name.includes("grep") || name.includes("glob") || name.includes("search")) return Search
  if (name.includes("webfetch") || name.includes("fetch") || name.includes("web")) return Globe
  if (name.includes("todo")) return ListTodo
  return Wrench
}

function toolSummary(part: ToolPart): string {
  const state = part.state
  const input = "input" in state ? (state.input as Record<string, unknown>) : {}
  const candidate =
    input.command ??
    input.filePath ??
    input.path ??
    input.pattern ??
    input.query ??
    input.url ??
    input.description ??
    input.todos
  if (Array.isArray(candidate)) return truncate(candidate.map((item) => String(item)).join(", "), 90)
  if (candidate !== undefined) return truncate(String(candidate), 100)
  if ("title" in state && state.title) return truncate(state.title, 100)
  return part.tool
}

function ToolCard({ part }: { part: ToolPart }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(part.state.status === "error")
  const state = part.state
  const Icon = toolIcon(part.tool)
  const title = "title" in state && state.title ? state.title : part.tool
  const output = state.status === "completed" ? state.output : undefined
  const error = state.status === "error" ? state.error : undefined
  const attachments = state.status === "completed" ? state.attachments ?? [] : []
  const hasDetails = Boolean(output || error || attachments.length)

  return (
    <div
      className={clsx(
        "my-2 overflow-hidden rounded-xl border bg-surface/70",
        state.status === "error" ? "border-bad/35" : "border-line",
      )}
    >
      <button
        className="w-full px-3 py-2 text-left transition-colors hover:bg-line-soft/50"
        onClick={() => hasDetails && setExpanded((value) => !value)}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={clsx(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
              state.status === "error"
                ? "border-bad/30 bg-bad/10 text-bad"
                : state.status === "completed"
                  ? "border-good/25 bg-good/10 text-good"
                  : "border-line bg-raised text-accent",
            )}
          >
            {state.status === "pending" || state.status === "running" ? (
              <Spinner size={12} />
            ) : state.status === "completed" ? (
              <Check size={12} />
            ) : (
              <X size={12} />
            )}
          </span>
          <Icon size={13} className="shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-medium text-ink">{title}</span>
          {state.status === "completed" && state.time.end && (
            <span className="shrink-0 text-[10px] text-faint">{Math.max(0, state.time.end - state.time.start)}ms</span>
          )}
          {hasDetails && (
            <ChevronRight size={13} className={clsx("shrink-0 text-faint transition-transform", expanded && "rotate-90")} />
          )}
        </div>
        <div className="mt-1 line-clamp-2 break-words pl-9 pr-1 font-mono text-[10.5px] leading-relaxed text-faint [overflow-wrap:anywhere]">
          {toolSummary(part)}
        </div>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-line px-3 py-2.5">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{t("message.input")}</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-muted">
              {safeJson(state.input, 3000)}
            </pre>
          </div>
          {error && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-bad">{t("message.error")}</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-bad/25 bg-bad/5 p-2.5 font-mono text-[11px] leading-relaxed text-bad">
                {error}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                <span>{t("message.output")}</span>
                <CopyButton text={output} />
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-muted">
                {truncate(output, 12000)}
              </pre>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((attachment) => (
                <span key={attachment.id} className="badge">
                  <FileText size={11} />
                  {attachment.filename ?? attachment.mime}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PartView({ part, streaming }: { part: Part; streaming: boolean }) {
  const { t } = useT()
  switch (part.type) {
    case "text": {
      if (!part.text.trim()) return null
      const parsed = parseClarifications(part.text)
      if (!parsed.plain && parsed.payloads.length === 0) return null
      return (
        <>
          {parsed.plain && (
            <div className={clsx(streaming && "streaming-caret")}>
              <Markdown text={parsed.plain} />
            </div>
          )}
          {parsed.payloads.map((payload, index) => (
            <ClarificationCard key={`clarify-${index}`} payload={payload} />
          ))}
        </>
      )
    }
    case "reasoning":
      return (
        <details className="my-2 rounded-lg border border-line/70 bg-canvas/40 px-3 py-2 text-[12px] text-muted">
          <summary className="flex cursor-pointer select-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
            <Sparkles size={11} />
            {t("message.thinking")}
            <span className="font-normal normal-case tracking-normal text-faint">
              ({t("message.chars", { count: part.text.length })})
            </span>
          </summary>
          <div className="mt-2 whitespace-pre-wrap border-l-2 border-line pl-3 leading-relaxed">{part.text}</div>
        </details>
      )
    case "tool":
      return <ToolCard part={part} />
    case "file": {
      const image = part.mime.startsWith("image/") && part.url.startsWith("data:")
      return (
        <div className="my-1.5">
          {image ? (
            <img src={part.url} alt={part.filename ?? "attachment"} className="max-h-64 rounded-lg border border-line" />
          ) : (
            <span className="badge max-w-full">
              <FileText size={11} />
              <span className="truncate">{part.filename ?? part.url}</span>
            </span>
          )}
        </div>
      )
    }
    case "patch":
      return (
        <div className="my-2 rounded-lg border border-line bg-surface/70 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
            <Pencil size={11} />
            {part.files.length} {t("common.files")}
          </div>
          <div className="space-y-0.5">
            {part.files.map((file) => (
              <div key={file} className="truncate font-mono text-[11px] text-muted">
                {file}
              </div>
            ))}
          </div>
        </div>
      )
    case "retry":
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11.5px] text-warn">
          <AlertTriangle size={12} />
          {t("message.retrying", {
            attempt: part.attempt,
            message: part.error.data?.message ?? "model request failed",
          })}
        </div>
      )
    case "compaction":
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-1.5 text-[11px] text-muted">
          <Circle size={7} className="fill-current" />
          {part.auto ? t("message.compactedAuto") : t("message.compactedManual")}
        </div>
      )
    case "agent":
      return (
        <div className="my-1.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-muted">
          <Bot size={11} /> @{part.name}
        </div>
      )
    case "subtask":
      return (
        <div className="my-2 rounded-lg border border-line bg-surface/60 px-3 py-2">
          <div className="text-[11px] font-semibold text-accent">
            {t("message.subtask")} · {part.agent}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">{part.description}</div>
        </div>
      )
    case "step-start":
    case "step-finish":
    case "snapshot":
      return null
    default:
      return (
        <details className="my-2 rounded-lg border border-line bg-canvas/40 px-3 py-2 text-[11px] text-muted">
          <summary className="cursor-pointer text-faint">
            {t("message.part", { type: (part as { type?: string }).type ?? "unknown" })}
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{safeJson(part, 2000)}</pre>
        </details>
      )
  }
}

export function MessageItem({
  entry,
  busy,
  isLast,
  onEdit,
  onWithdraw,
  onRestore,
}: {
  entry: SessionEntry
  busy: boolean
  isLast: boolean
  onEdit?: (text: string) => void
  onWithdraw?: () => void
  onRestore?: () => void
}) {
  const { t } = useT()
  const { info, parts } = entry
  const streaming = busy && isLast && info.role === "assistant"
  const fullText = textOf(parts)

  if (info.role === "user") {
    return (
      <div className="group/msg animate-fade-up flex justify-end gap-3 px-6 py-2">
        {!busy && (onEdit || onWithdraw) && (
          <div className="flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover/msg:opacity-100">
            {onEdit && (
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-line-soft hover:text-ink"
                title={t("message.edit")}
                onClick={() => onEdit(fullText)}
              >
                <Pencil size={11} />
              </button>
            )}
            {onWithdraw && (
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-line-soft hover:text-bad"
                title={t("message.withdraw")}
                onClick={onWithdraw}
              >
                <Undo2 size={11} />
              </button>
            )}
          </div>
        )}
        <div className="max-w-[78%] rounded-2xl rounded-tr-md border border-line bg-raised px-4 py-2.5">
          {parts.map((part) => {
            if (part.type === "text") {
              return (
                <div key={part.id} className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
                  {part.text}
                </div>
              )
            }
            if (part.type === "file") {
              return (
                <div key={part.id} className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-0.5 text-[10.5px] text-muted">
                  <FileText size={10} />
                  {part.filename ?? "attachment"}
                </div>
              )
            }
            return null
          })}
          <div className="mt-1 flex justify-end text-[10px] text-faint">
            {new Date(info.time.created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    )
  }

  const tokens = info.tokens
  const totalTokens = tokens ? tokens.input + tokens.output : 0

  return (
    <div className="animate-fade-up group/msg flex gap-3 px-6 py-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-soft/50 text-accent">
        <Sparkles size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-ink">{info.mode || t("message.assistant")}</span>
          <span className="truncate text-[10.5px] text-faint">
            {info.providerID}/{info.modelID}
          </span>
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
            {onRestore && !busy && (
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-line-soft hover:text-ink"
                title={t("message.restoreHere")}
                onClick={onRestore}
              >
                <RotateCcw size={11} />
              </button>
            )}
            {fullText && <CopyButton text={fullText} />}
          </div>
        </div>
        <div className="min-w-0">
          {parts.map((part, index) => (
            <PartView
              key={part.id}
              part={part}
              streaming={streaming && index === parts.length - 1 && part.type === "text"}
            />
          ))}
          {streaming && parts.length === 0 && (
            <div className="flex items-center gap-2 py-2 text-[12px] text-muted">
              <Spinner size={12} /> {t("message.waiting")}
            </div>
          )}
        </div>
        {(totalTokens > 0 || info.cost > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-faint">
            {totalTokens > 0 && <span>{t("message.tokens", { count: totalTokens.toLocaleString() })}</span>}
            {tokens && tokens.cache.read > 0 && (
              <span>{t("message.cached", { count: tokens.cache.read.toLocaleString() })}</span>
            )}
            {info.cost > 0 && <span>${info.cost.toFixed(4)}</span>}
            {info.time.completed && <span>{Math.max(1, Math.round((info.time.completed - info.time.created) / 1000))}s</span>}
            {info.error && <span className="text-bad">{info.error.name}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export function OptimisticUserMessage({ text }: { text: string }) {
  return (
    <div className="animate-fade-up flex justify-end gap-3 px-6 py-2 opacity-70">
      <div className="max-w-[78%] rounded-2xl rounded-tr-md border border-line bg-raised px-4 py-2.5">
        <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{text}</div>
        <div className="mt-1 flex justify-end">
          <Spinner size={10} className="text-faint" />
        </div>
      </div>
    </div>
  )
}
