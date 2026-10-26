import clsx from "clsx"
import { Check, Copy, Loader, X } from "lucide-react"
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react"
import { useT } from "../i18n/useT"

type Variant = "default" | "primary" | "ghost" | "danger"

export function Button({
  variant = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles =
    variant === "primary"
      ? "btn-primary"
      : variant === "ghost"
        ? "btn-ghost"
        : variant === "danger"
          ? "btn-danger"
          : "btn"
  return <button className={clsx(styles, className)} {...props} />
}

export function IconButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={clsx("btn-ghost h-8 w-8 shrink-0 p-0", className)} {...props} />
}

export function Spinner({ size = 15, className }: { size?: number; className?: string }) {
  return <Loader size={size} className={clsx("animate-spin", className)} />
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode
  tone?: "default" | "good" | "warn" | "bad" | "accent"
  className?: string
}) {
  const tones = {
    default: "badge",
    good: "badge border-good/30 text-good",
    warn: "badge border-warn/30 text-warn",
    bad: "badge border-bad/30 text-bad",
    accent: "badge border-accent/30 text-accent",
  }
  return <span className={clsx(tones[tone], className)}>{children}</span>
}

export function StatusDot({ tone = "default", pulse = false }: { tone?: "good" | "warn" | "bad" | "default" | "accent"; pulse?: boolean }) {
  const colors = {
    good: "bg-good",
    warn: "bg-warn",
    bad: "bg-bad",
    accent: "bg-accent",
    default: "bg-faint",
  }
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className={clsx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", colors[tone])} />}
      <span className={clsx("relative inline-flex h-2 w-2 rounded-full", colors[tone])} />
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40",
        checked ? "border-accent/60 bg-accent/80" : "border-line bg-line-soft",
      )}
    >
      <span
        className={clsx(
          "absolute left-0 top-0.5 h-3.5 w-3.5 rounded-full bg-ink shadow-sm transition-transform",
          checked ? "translate-x-[19px]" : "translate-x-[3px]",
        )}
      />
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-faint">{hint}</span>}
    </label>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-8 py-6">
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</div>}
        <h1 className="text-[21px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-8 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <div className="text-[14px] font-medium">{title}</div>
      {description && <div className="mt-1 max-w-md text-[12.5px] leading-relaxed text-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const { t } = useT()
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={clsx("panel animate-fade-up relative flex max-h-[85vh] w-full flex-col bg-surface shadow-2xl", width)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-[14px] font-semibold">{title}</div>
          <IconButton onClick={onClose} aria-label={t("common.close")}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ProgressBar({ value, max }: { value: number; max?: number }) {
  const percent = max && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : undefined
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line-soft">
      <div
        className={clsx("h-full rounded-full bg-accent transition-all", percent === undefined && "w-1/3 animate-pulse")}
        style={percent !== undefined ? { width: `${percent}%` } : undefined}
      />
    </div>
  )
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  return (
    <IconButton
      className={className}
      aria-label={t("common.copy")}
      title={copied ? t("common.copied") : t("common.copy")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          // ignore
        }
      }}
    >
      {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
    </IconButton>
  )
}

export function ScopePicker({
  value,
  onChange,
  projectDisabled,
}: {
  value: "project" | "global"
  onChange: (scope: "project" | "global") => void
  projectDisabled?: boolean
}) {
  const { t } = useT()
  return (
    <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-[12px]">
      <button
        className={clsx(
          "rounded-md px-2.5 py-1 font-medium transition-colors",
          value === "project" ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink",
        )}
        onClick={() => onChange("project")}
        disabled={projectDisabled}
      >
        {t("common.project")}
      </button>
      <button
        className={clsx(
          "rounded-md px-2.5 py-1 font-medium transition-colors",
          value === "global" ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink",
        )}
        onClick={() => onChange("global")}
      >
        {t("common.global")}
      </button>
    </div>
  )
}

export function CodeBlock({ text, className }: { text: string; className?: string }) {
  return (
    <div className={clsx("group relative rounded-lg border border-line bg-canvas", className)}>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11.5px] leading-relaxed text-muted">
        {text}
      </pre>
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={text} />
      </div>
    </div>
  )
}
