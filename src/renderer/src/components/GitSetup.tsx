import { Download, GitBranch, Plus, Wrench } from "lucide-react"
import { useState } from "react"
import type { GitEnvironment } from "@shared/types"
import { useT } from "../i18n/useT"
import { rpc } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { Button, EmptyState, Spinner } from "./ui"

export function GitSetup({
  environment,
  isRepo,
  onReady,
}: {
  environment: GitEnvironment | null
  isRepo: boolean
  onReady: () => void | Promise<void>
}) {
  const { t } = useT()
  const addToast = useStudio((store) => store.addToast)
  const [installing, setInstalling] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [message, setMessage] = useState("")

  if (!environment) {
    return (
      <div className="flex items-center justify-center py-16 text-faint">
        <Spinner />
      </div>
    )
  }

  const install = async () => {
    setInstalling(true)
    setMessage("")
    try {
      const result = await rpc("git.install")
      if (result.ok) {
        addToast("success", t("git.installSuccess"))
        await onReady()
      } else {
        setMessage(result.manualUrl ? t("git.installManual") : result.output)
        if (result.manualUrl) await rpc("app.openExternal", result.manualUrl)
        addToast("error", t("git.installFailed"))
      }
    } catch (error) {
      setMessage((error as Error).message)
      addToast("error", (error as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  const initialize = async () => {
    setInitializing(true)
    try {
      await rpc("git.init")
      addToast("success", t("git.initSuccess"))
      await onReady()
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setInitializing(false)
    }
  }

  if (!environment.available) {
    return (
      <div className="px-3 py-4">
        <EmptyState
          icon={<GitBranch size={24} />}
          title={t("git.gitMissing")}
          description={t("git.gitMissingDesc")}
          action={
            <Button variant="primary" disabled={installing} onClick={() => void install()}>
              {installing ? <Spinner size={12} /> : environment.canAutoInstall ? <Wrench size={12} /> : <Download size={12} />}
              {installing
                ? t("git.installing")
                : environment.canAutoInstall
                  ? t("git.installWinget")
                  : t("git.downloadGit")}
            </Button>
          }
        />
        {environment.canAutoInstall && <div className="mt-3 text-center text-[10.5px] text-faint">{t("git.installHint")}</div>}
        {message && (
          <div className="mt-3 max-h-32 overflow-auto rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[10px] leading-relaxed text-faint">
            {message}
          </div>
        )}
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className="px-3 py-4">
        <EmptyState
          icon={<GitBranch size={24} />}
          title={t("git.notRepo")}
          description={t("git.notRepoDesc")}
          action={
            <Button variant="primary" disabled={initializing} onClick={() => void initialize()}>
              {initializing ? <Spinner size={12} /> : <Plus size={12} />}
              {t("git.initRepo")}
            </Button>
          }
        />
      </div>
    )
  }

  return null
}
