import { FolderOpen, MessageSquare, Plus, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"
import { useStudio } from "../store/useStore"
import { Button, EmptyState, IconButton, PageHeader, StatusDot } from "../components/ui"
import { useT } from "../i18n/useT"
import { relativeTime } from "../lib/rpc"

export function ProjectsView() {
  const { t } = useT()
  const state = useStudio((store) => store.state)
  const setView = useStudio((store) => store.setView)
  const activateProject = useStudio((store) => store.activateProject)
  const pickAndAddProject = useStudio((store) => store.pickAndAddProject)
  const removeProject = useStudio((store) => store.removeProject)
  const addProjectPath = useStudio((store) => store.addProjectPath)
  const [manualPath, setManualPath] = useState("")

  if (!state) return null

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={t("projects.eyebrow")}
        title={t("projects.title")}
        description={t("projects.description")}
        actions={
          <Button variant="primary" onClick={() => void pickAndAddProject()}>
            <Plus size={14} /> {t("projects.openFolder")}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {state.projects.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={26} />}
            title={t("projects.emptyTitle")}
            description={t("projects.emptyDesc")}
            action={
              <Button variant="primary" onClick={() => void pickAndAddProject()}>
                <Plus size={14} /> {t("projects.openFolder")}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {state.projects.map((project) => {
              const active = project.id === state.activeProjectId
              return (
                <div
                  key={project.id}
                  className={`group rounded-xl border p-4 transition-colors ${
                    active ? "border-accent/40 bg-surface" : "border-line bg-surface/50 hover:border-faint/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-gradient-to-br from-canvas to-raised text-accent">
                      <FolderOpen size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[13.5px] font-semibold">{project.name}</div>
                        {active && (
                          <span className="flex items-center gap-1 rounded-full border border-good/30 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-good">
                            <StatusDot tone="good" /> {t("projects.active")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-faint" title={project.path}>
                        {project.path}
                      </div>
                      <div className="mt-1 text-[10px] text-faint">
                        {project.lastOpenedAt ? relativeTime(project.lastOpenedAt) : relativeTime(project.addedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button
                      variant={active ? "default" : "primary"}
                      className="h-7 px-2.5 text-[11.5px]"
                      onClick={async () => {
                        await activateProject(project.id)
                        setView("chat")
                      }}
                    >
                      <MessageSquare size={12} /> {active ? t("projects.openChat") : t("projects.switch")}
                    </Button>
                    <Button
                      className="h-7 px-2.5 text-[11.5px]"
                      onClick={() => void window.studio.rpc("app.showItem", project.path)}
                    >
                      <FolderOpen size={12} /> {t("projects.reveal")}
                    </Button>
                    {active && (
                      <Button className="h-7 px-2.5 text-[11.5px]" onClick={() => setView("settings")}>
                        <Settings2 size={12} /> {t("projects.config")}
                      </Button>
                    )}
                    <IconButton
                      className="ml-auto h-7 w-7 text-bad hover:bg-bad/10"
                      title={t("common.remove")}
                      onClick={() => {
                        if (window.confirm(t("projects.removeConfirm", { name: project.name }))) {
                          void removeProject(project.id)
                        }
                      }}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-line bg-surface/50 p-4">
          <div className="text-[12px] font-semibold">{t("projects.addByPath")}</div>
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              placeholder={t("projects.addByPathPlaceholder")}
              value={manualPath}
              onChange={(event) => setManualPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && manualPath.trim()) {
                  void addProjectPath(manualPath.trim())
                  setManualPath("")
                }
              }}
            />
            <Button
              onClick={() => {
                if (!manualPath.trim()) return
                void addProjectPath(manualPath.trim())
                setManualPath("")
              }}
            >
              {t("projects.add")}
            </Button>
          </div>
        </div>

        {state.configPaths.projectFile && (
          <div className="mt-6 grid gap-2 text-[11px] text-faint md:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface/40 px-3 py-2">
              <div className="mb-0.5 font-semibold uppercase tracking-wider">{t("projects.projectConfig")}</div>
              <div className="truncate font-mono">{state.configPaths.projectFile}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface/40 px-3 py-2">
              <div className="mb-0.5 font-semibold uppercase tracking-wider">{t("projects.projectPlugins")}</div>
              <div className="truncate font-mono">{state.configPaths.projectPlugins ?? "-"}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
