import { AlertTriangle, ShieldCheck } from "lucide-react"
import { safeJson } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { Badge, Button } from "./ui"
import { useT } from "../i18n/useT"

export function PermissionDialog() {
  const { t } = useT()
  const permissions = useStudio((state) => state.permissions)
  const activeSessionId = useStudio((state) => state.activeSessionId)
  const respond = useStudio((state) => state.respondPermission)
  const permission = permissions.find((item) => item.sessionID === activeSessionId)
  if (!permission) return null

  const metadata = safeJson(permission.metadata, 2200)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
      <div className="panel animate-fade-up relative w-full max-w-xl overflow-hidden bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warn/30 bg-warn/10 text-warn">
            <ShieldCheck size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">{t("permission.title")}</div>
            <div className="mt-0.5 truncate text-[12px] text-muted">{permission.title}</div>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn">{permission.type}</Badge>
            {permission.pattern && (
              <span className="truncate rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted">
                {Array.isArray(permission.pattern) ? permission.pattern.join(", ") : permission.pattern}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-line bg-canvas">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              <AlertTriangle size={12} />
              {t("permission.details")}
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11.5px] leading-relaxed text-muted">
              {metadata}
            </pre>
          </div>
          <p className="text-[12px] leading-relaxed text-muted">{t("permission.body")}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="danger" onClick={() => void respond(permission, "reject")}>
            {t("permission.reject")}
          </Button>
          <Button onClick={() => void respond(permission, "once")}>{t("permission.allowOnce")}</Button>
          <Button variant="primary" onClick={() => void respond(permission, "always")}>
            {t("permission.alwaysAllow")}
          </Button>
        </div>
      </div>
    </div>
  )
}
