import { AlertTriangle, Check, Info, X } from "lucide-react"
import clsx from "clsx"
import { useStudio } from "../store/useStore"
import { IconButton } from "./ui"

export function Toasts() {
  const toasts = useStudio((state) => state.toasts)
  const dismiss = useStudio((state) => state.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[340px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            "animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-raised/95 px-3.5 py-3 shadow-xl backdrop-blur",
            toast.level === "error" ? "border-bad/40" : toast.level === "success" ? "border-good/40" : "border-line",
          )}
        >
          <div
            className={clsx(
              "mt-0.5",
              toast.level === "error" ? "text-bad" : toast.level === "success" ? "text-good" : "text-accent",
            )}
          >
            {toast.level === "error" ? (
              <AlertTriangle size={15} />
            ) : toast.level === "success" ? (
              <Check size={15} />
            ) : (
              <Info size={15} />
            )}
          </div>
          <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink">{toast.message}</div>
          <IconButton className="h-6 w-6" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            <X size={13} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
