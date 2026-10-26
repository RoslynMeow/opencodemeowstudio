import clsx from "clsx"
import { Code2, FolderOpen, Package, Plus, Puzzle, RefreshCw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import type { ConfigScope, PluginViewData } from "@shared/types"
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, ScopePicker, Spinner, StatusDot, Toggle } from "../components/ui"
import { formatDate } from "../lib/config-utils"
import { formatBytes, rpc } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"

const PLUGIN_TEMPLATE = `export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  await client.app.log({
    body: {
      service: "my-plugin",
      level: "info",
      message: "Plugin loaded",
      extra: { project: project?.id, directory },
    },
  })

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        // Runs after the agent finishes a turn.
      }
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool === "shell") {
        // Inspect or mutate output.args before the tool runs.
      }
    },
  }
}
`

export function PluginsView() {
  const { t } = useT()
  const state = useStudio((store) => store.state)
  const addToast = useStudio((store) => store.addToast)
  const restartBackend = useStudio((store) => store.restartBackend)
  const [data, setData] = useState<PluginViewData | null>(null)
  const [scope, setScope] = useState<ConfigScope>(state?.activeProject ? "project" : "global")
  const [npmName, setNpmName] = useState("")
  const [adding, setAdding] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [fileName, setFileName] = useState("my-plugin.ts")
  const [content, setContent] = useState(PLUGIN_TEMPLATE)
  const [createScope, setCreateScope] = useState<ConfigScope>(state?.activeProject ? "project" : "global")

  const load = async () => {
    if (state?.backend.state !== "running") return
    try {
      setData(await rpc("plugin.view"))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.backend.state, state?.activeProjectId])

  const addPlugin = async () => {
    if (!npmName.trim()) return
    setAdding(true)
    try {
      setData(await rpc("plugin.add", scope, npmName.trim()))
      setNpmName("")
      addToast("success", t("toast.saved"))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const removePlugin = async (pluginScope: ConfigScope, name: string) => {
    if (!window.confirm(t("plugins.removeConfirm", { name, scope: t(`common.${pluginScope}`) }))) return
    try {
      setData(await rpc("plugin.remove", pluginScope, name))
      addToast("success", t("common.remove"))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const toggleLocal = async (pluginScope: ConfigScope, fileNameToToggle: string, enabled: boolean) => {
    try {
      setData(await rpc("plugin.setLocalEnabled", pluginScope, fileNameToToggle, enabled))
      addToast("success", t("toast.saved"))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const createPlugin = async () => {
    try {
      setData(await rpc("plugin.createLocal", createScope, fileName.trim(), content))
      setCreating(false)
      addToast("success", t("toast.saved"))
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const restart = async () => {
    setRestarting(true)
    try {
      await restartBackend()
      await load()
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={t("plugins.eyebrow")}
        title={t("plugins.title")}
        description={t("plugins.description")}
        actions={
          <>
            <Button
              onClick={() => void rpc("plugin.openFolder", "project").catch((error) => addToast("error", (error as Error).message))}
              disabled={!state?.activeProject}
            >
              <FolderOpen size={12} /> {t("plugins.projectFolder")}
            </Button>
            <Button onClick={() => void rpc("plugin.openFolder", "global")}>
              <FolderOpen size={12} /> {t("plugins.globalFolder")}
            </Button>
            <Button onClick={() => void restart()} disabled={restarting}>
              {restarting ? <Spinner size={12} /> : <RefreshCw size={12} />} {t("plugins.restartBackend")}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={13} /> {t("plugins.newLocal")}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <section className="rounded-xl border border-line bg-surface/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Package size={15} className="text-accent" />
            <div>
              <div className="card-heading">{t("plugins.npmTitle")}</div>
              <div className="text-[11.5px] text-muted">{t("plugins.npmDesc")}</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <Field label={t("plugins.packageName")}>
                <input
                  className="input font-mono"
                  value={npmName}
                  onChange={(event) => setNpmName(event.target.value)}
                  placeholder="opencode-wakatime"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addPlugin()
                  }}
                />
              </Field>
            </div>
            <div className="pb-2">
              <ScopePicker value={scope} onChange={setScope} projectDisabled={!state?.activeProject} />
            </div>
            <Button variant="primary" onClick={() => void addPlugin()} disabled={!npmName.trim() || adding}>
              {adding ? <Spinner size={12} /> : <Plus size={12} />} {t("plugins.add")}
            </Button>
          </div>

          <div className="mt-3 space-y-1.5">
            {(data?.npm.length ?? 0) === 0 && (
              <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-faint">
                {t("plugins.npmEmpty")}
              </div>
            )}
            {data?.npm.map((plugin) => (
              <div
                key={`${plugin.scope}-${plugin.name}`}
                className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-3 py-2"
              >
                <StatusDot tone="good" />
                <span className="font-mono text-[12px]">{plugin.name}</span>
                <Badge>{t(`common.${plugin.scope}`)}</Badge>
                <IconButton
                  className="ml-auto hover:bg-bad/10 hover:text-bad"
                  title={t("common.remove")}
                  onClick={() => void removePlugin(plugin.scope, plugin.name)}
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <Code2 size={15} className="text-accent" />
            <div>
              <div className="card-heading">{t("plugins.localTitle")}</div>
              <div className="text-[11.5px] text-muted">{t("plugins.localDesc")}</div>
            </div>
          </div>

          {(data?.local.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Puzzle size={24} />}
              title={t("plugins.localEmptyTitle")}
              description={t("plugins.localEmptyDesc")}
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={12} /> {t("plugins.createPlugin")}
                </Button>
              }
            />
          ) : (
            <div className="grid gap-2 xl:grid-cols-2">
              {data?.local.map((plugin) => (
                <div key={plugin.path} className="rounded-xl border border-line bg-surface/60 p-3">
                  <div className="flex items-center gap-2">
                    <Code2 size={13} className={plugin.enabled ? "text-accent" : "text-faint"} />
                    <span className="text-[12.5px] font-medium">{plugin.name}</span>
                    <Badge>{t(`common.${plugin.scope}`)}</Badge>
                    <span className="ml-auto">
                      <Toggle
                        checked={plugin.enabled}
                        onChange={(next) => void toggleLocal(plugin.scope, plugin.fileName, next)}
                        label={plugin.name}
                      />
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10.5px] text-faint" title={plugin.path}>
                    {plugin.fileName}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-faint">
                    <span>{formatBytes(plugin.size)}</span>
                    <span>{formatDate(plugin.modified)}</span>
                    <button
                      className="ml-auto hover:text-ink"
                      onClick={() =>
                        void rpc("app.openPath", plugin.path).catch((error) => addToast("error", (error as Error).message))
                      }
                    >
                      {t("plugins.openFile")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-line bg-surface/40 p-4">
          <div className="text-[12.5px] font-semibold">{t("plugins.pluginShape")}</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{t("plugins.pluginShapeDesc")}</p>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[10.5px] leading-relaxed text-muted">
            {PLUGIN_TEMPLATE}
          </pre>
        </section>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t("plugins.createTitle")}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void createPlugin()} disabled={!fileName.trim() || !content.trim()}>
              {t("plugins.createAndRestart")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <Field label={t("plugins.fileName")} hint={t("plugins.fileNameHint")}>
                <input className="input font-mono" value={fileName} onChange={(event) => setFileName(event.target.value)} />
              </Field>
            </div>
            <Field label={t("common.scope")}>
              <select
                className="input"
                value={createScope}
                onChange={(event) => setCreateScope(event.target.value as ConfigScope)}
              >
                <option value="project">{t("common.project")}</option>
                <option value="global">{t("common.global")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("plugins.source")}>
            <textarea
              className={clsx("input min-h-[340px] font-mono text-[11.5px] leading-relaxed")}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              spellCheck={false}
            />
          </Field>
          <div className="text-[11px] text-faint">{t("plugins.dependencyHint")}</div>
        </div>
      </Modal>
    </div>
  )
}
