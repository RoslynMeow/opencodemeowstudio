import clsx from "clsx"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  File,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderSearch,
  GitBranch,
  GitCommit,
  GitFork,
  Image,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { FileContentInfo, FileDiff, FileNodeInfo, GitDiffContent, GitEnvironment, GitFileStatus, GitInfo } from "@shared/types"
import { Button, EmptyState, IconButton, Spinner } from "./ui"
import { UnifiedDiff } from "./UnifiedDiff"
import { GitGraph } from "./GitGraph"
import { GitSetup } from "./GitSetup"
import { CodeEditor } from "./CodeEditor"
import { rpc } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"

export type FilePanelTab = "explorer" | "changes"

function sortNodes(a: FileNodeInfo, b: FileNodeInfo): number {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1
  return a.name.localeCompare(b.name)
}

function FileIcon({ name }: { name: string }) {
  const lower = name.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp)$/.test(lower)) return <Image size={13} className="shrink-0 text-faint" />
  if (/\.(json|jsonc)$/.test(lower)) return <FileJson size={13} className="shrink-0 text-faint" />
  if (/\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|cs|cpp|c|h|css|scss|html)$/.test(lower)) {
    return <FileCode2 size={13} className="shrink-0 text-faint" />
  }
  if (/\.(md|mdx|txt|log|yml|yaml|toml|ini|env)$/.test(lower)) return <FileText size={13} className="shrink-0 text-faint" />
  return <File size={13} className="shrink-0 text-faint" />
}

function CodePreview({ content }: { content: FileContentInfo }) {
  const { t } = useT()
  const lines = useMemo(() => content.content.split(/\r?\n/), [content.content])
  const max = 4000
  const visible = lines.slice(0, max)
  const truncated = content.truncated || lines.length > max
  return (
    <div className="min-w-max py-2 font-mono text-[11px] leading-[1.55]">
      {visible.map((line, index) => (
        <div key={index} className="flex hover:bg-line-soft/40">
          <span className="w-10 shrink-0 select-none border-r border-line/60 pr-1.5 text-right text-faint/60">
            {index + 1}
          </span>
          <span className="whitespace-pre px-2 text-muted">{line || " "}</span>
        </div>
      ))}
      {truncated && (
        <div className="sticky bottom-0 border-t border-line bg-surface px-3 py-1.5 text-[10px] text-faint">
          {t("files.truncated")}
        </div>
      )}
    </div>
  )
}

export function FilePanel({
  tab,
  onTabChange,
  onClose,
  mode = "sidebar",
  showTabs = true,
  showSessionTab = true,
  defaultChangeMode,
}: {
  tab: FilePanelTab
  onTabChange: (tab: FilePanelTab) => void
  onClose?: () => void
  mode?: "sidebar" | "page"
  showTabs?: boolean
  showSessionTab?: boolean
  defaultChangeMode?: "session" | "git" | "graph"
}) {
  const { t } = useT()
  const state = useStudio((store) => store.state)
  const activeSessionId = useStudio((store) => store.activeSessionId)
  const addToast = useStudio((store) => store.addToast)
  const project = state?.activeProject ?? null
  const dark = typeof document !== "undefined" && document.documentElement.dataset.theme !== "light"

  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<string[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [children, setChildren] = useState<Record<string, FileNodeInfo[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["."]))
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<FileContentInfo | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [diff, setDiff] = useState<FileDiff[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null)
  const [changeMode, setChangeMode] = useState<"session" | "git" | "graph">(() => {
    if (defaultChangeMode) return defaultChangeMode
    const saved = localStorage.getItem("meowstudio:changeTab")
    if (saved === "git" || saved === "graph") return saved
    return showSessionTab ? "session" : "git"
  })
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [gitEnvironment, setGitEnvironment] = useState<GitEnvironment | null>(null)
  const [graphRefreshKey, setGraphRefreshKey] = useState(0)
  const [gitLoading, setGitLoading] = useState(false)
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null)
  const [selectedGitStaged, setSelectedGitStaged] = useState(false)
  const [gitDiff, setGitDiff] = useState<GitDiffContent | null>(null)
  const [gitDiffLoading, setGitDiffLoading] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [committing, setCommitting] = useState(false)

  const loadDir = async (path: string) => {
    if (state?.backend.state !== "running") return
    setLoadingDirs((current) => new Set(current).add(path))
    try {
      const nodes = await rpc("file.list", path)
      setChildren((current) => ({
        ...current,
        [path]: nodes.filter((node) => !node.ignored).sort(sortNodes),
      }))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setLoadingDirs((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
    }
  }

  useEffect(() => {
    setChildren({})
    setExpanded(new Set(["."]))
    setSelectedPath(null)
    setContent(null)
    setQuery("")
    setSearchResults(null)
    if (project && state?.backend.state === "running") void loadDir(".")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  useEffect(() => {
    if (state?.backend.state === "running" && project && !children["."]) void loadDir(".")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.backend.state, project?.id])

  useEffect(() => {
    const value = query.trim()
    if (!value) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    if (state?.backend.state !== "running") {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      void rpc("file.find", value)
        .then((results) => setSearchResults(results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const loadDiff = async () => {
    if (state?.backend.state !== "running") return
    if (!activeSessionId) {
      setDiff([])
      setSelectedDiffPath(null)
      return
    }
    setDiffLoading(true)
    try {
      const next = await rpc("session.diff", activeSessionId)
      setDiff(next)
      setSelectedDiffPath((current) => (current && next.some((file) => file.file === current) ? current : next[0]?.file ?? null))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setDiffLoading(false)
    }
  }

  useEffect(() => {
    if (tab === "changes") void loadDiff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeSessionId, state?.backend.state])

  const switchChangeMode = (mode: "session" | "git" | "graph") => {
    setChangeMode(mode)
    localStorage.setItem("meowstudio:changeTab", mode)
  }

  const loadGit = async () => {
    if (state?.backend.state !== "running") return
    setGitLoading(true)
    try {
      const [info, environment] = await Promise.all([rpc("git.info"), rpc("git.environment")])
      setGitInfo(info)
      setGitEnvironment(environment)
      if (info.isRepo) {
        const all = [...info.staged, ...info.unstaged]
        const current = selectedGitPath ? all.find((file) => file.path === selectedGitPath) : undefined
        if (!current) {
          const first = info.unstaged[0] ?? info.staged[0]
          if (first) {
            setSelectedGitPath(first.path)
            setSelectedGitStaged(info.staged.some((file) => file.path === first.path) && !info.unstaged.some((file) => file.path === first.path))
          } else {
            setSelectedGitPath(null)
          }
        }
      } else {
        setSelectedGitPath(null)
      }
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setGitLoading(false)
    }
  }

  useEffect(() => {
    if (tab === "changes" && changeMode === "git") void loadGit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, changeMode, state?.backend.state])

  useEffect(() => {
    if (tab !== "changes" || changeMode !== "git" || !selectedGitPath) {
      setGitDiff(null)
      return
    }
    setGitDiffLoading(true)
    void rpc("git.diff", selectedGitPath, selectedGitStaged)
      .then((next) => setGitDiff(next))
      .catch(() => setGitDiff(null))
      .finally(() => setGitDiffLoading(false))
  }, [tab, changeMode, selectedGitPath, selectedGitStaged])

  const moveGit = async (paths: string[], targetStaged: boolean) => {
    if (paths.length === 0) return
    try {
      const info = await rpc(targetStaged ? "git.stage" : "git.unstage", paths)
      setGitInfo(info)
      if (selectedGitPath && paths.includes(selectedGitPath)) setSelectedGitStaged(targetStaged)
    } catch (error) {
      addToast("error", (error as Error).message)
    }
  }

  const commitChanges = async () => {
    if (!gitInfo || !commitMessage.trim()) return
    setCommitting(true)
    try {
      const result = await rpc("git.commit", commitMessage.trim())
      setGitInfo(result.info)
      setCommitMessage("")
      setSelectedGitPath(null)
      setGitDiff(null)
      addToast("success", t("git.commitSuccess"))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setCommitting(false)
    }
  }

  const selectFile = async (path: string) => {
    setSelectedPath(path)
    setEditing(false)
    setDraft("")
    setContentLoading(true)
    try {
      setContent(await rpc("file.read", path))
    } catch (error) {
      setContent(null)
      addToast("error", (error as Error).message)
    } finally {
      setContentLoading(false)
    }
  }

  const startEditing = () => {
    if (!content || content.type !== "text" || content.truncated) return
    setDraft(content.content)
    setEditing(true)
  }

  const saveFile = async () => {
    if (!content) return
    setSaving(true)
    try {
      await rpc("file.write", content.path, draft)
      setContent({ ...content, content: draft })
      setEditing(false)
      addToast("success", t("files.saved"))
    } catch (error) {
      addToast("error", (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggleDir = (node: FileNodeInfo) => {
    const open = expanded.has(node.path)
    setExpanded((current) => {
      const next = new Set(current)
      if (open) next.delete(node.path)
      else next.add(node.path)
      return next
    })
    if (!open && !children[node.path]) void loadDir(node.path)
  }

  const renderTree = (path: string, depth: number) => {
    const nodes = children[path] ?? []
    return nodes.map((node) => {
      if (node.type === "directory") {
        const open = expanded.has(node.path)
        return (
          <div key={node.path}>
            <button
              data-file-path={node.path}
              className="flex w-full items-center gap-1 rounded px-1 py-[3px] text-left text-[11.5px] text-muted transition-colors hover:bg-line-soft/60 hover:text-ink"
              style={{ paddingLeft: 6 + depth * 13 }}
              onClick={() => toggleDir(node)}
            >
              {open ? <ChevronDown size={11} className="shrink-0 text-faint" /> : <ChevronRight size={11} className="shrink-0 text-faint" />}
              {open ? <FolderOpen size={13} className="shrink-0 text-accent/80" /> : <Folder size={13} className="shrink-0 text-accent/70" />}
              <span className="truncate">{node.name}</span>
            </button>
            {open &&
              (loadingDirs.has(node.path) ? (
                <div className="flex items-center gap-1.5 py-1 text-[10px] text-faint" style={{ paddingLeft: 25 + depth * 13 }}>
                  <Spinner size={9} /> {t("common.loading")}
                </div>
              ) : (
                renderTree(node.path, depth + 1)
              ))}
          </div>
        )
      }
      return (
        <button
          key={node.path}
          data-file-path={node.path}
          className={clsx(
            "flex w-full items-center gap-1.5 rounded px-1 py-[3px] text-left text-[11.5px] transition-colors",
            selectedPath === node.path ? "bg-accent-soft/40 text-ink" : "text-muted hover:bg-line-soft/60 hover:text-ink",
          )}
          style={{ paddingLeft: 8 + depth * 13 }}
          onClick={() => void selectFile(node.path)}
        >
          <span className="w-[11px] shrink-0" />
          <FileIcon name={node.name} />
          <span className="truncate">{node.name}</span>
        </button>
      )
    })
  }

  const totals = diff.reduce(
    (sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }),
    { additions: 0, deletions: 0 },
  )
  const selectedDiff = diff.find((file) => file.file === selectedDiffPath) ?? null

  const refreshCurrent = () => {
    if (tab === "explorer") {
      setChildren({})
      setExpanded(new Set(["."]))
      void loadDir(".")
    } else if (changeMode === "graph") {
      setGraphRefreshKey((value) => value + 1)
    } else if (changeMode === "git") {
      void loadGit()
    } else {
      void loadDiff()
    }
  }

  const gitFileRow = (file: GitFileStatus, staged: boolean) => {
    const active = selectedGitPath === file.path && selectedGitStaged === staged
    return (
      <div
        key={`${staged}-${file.path}`}
        className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-line-soft/60"
      >
        <button
          data-git-file={file.path}
          data-git-staged={staged ? "true" : "false"}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px]"
          onClick={() => {
            setSelectedGitPath(file.path)
            setSelectedGitStaged(staged)
          }}
        >
          <FileIcon name={file.path} />
          <span className={clsx("truncate", active ? "text-ink" : "text-muted")}>{file.path}</span>
          <span className="ml-auto shrink-0 rounded border border-line px-1 text-[8.5px] text-faint">
            {file.untracked ? "?" : file.status}
          </span>
        </button>
        <IconButton
          className="h-5 w-5"
          title={staged ? t("git.unstage") : t("git.stage")}
          onClick={() => void moveGit([file.path], !staged)}
        >
          {staged ? <Minus size={10} /> : <Plus size={10} />}
        </IconButton>
      </div>
    )
  }

  return (
    <aside
      className={clsx(
        "flex h-full min-w-0 flex-1 flex-col bg-surface/85",
        mode === "sidebar" && "border-l border-line xl:w-[420px] xl:flex-none",
      )}
    >
      {(showTabs || onClose) && (
      <div className={clsx("flex items-center gap-1 border-b border-line px-1.5 py-1.5", !showTabs && "justify-end")}>
        {showTabs && (
        <button
          data-file-tab="explorer"
          className={clsx(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors",
            tab === "explorer" ? "bg-raised text-ink" : "text-muted hover:bg-line-soft hover:text-ink",
          )}
          onClick={() => onTabChange("explorer")}
        >
          <FolderSearch size={12} className={tab === "explorer" ? "text-accent" : "text-faint"} />
          {t("files.explorer")}
        </button>
        )}
        {showTabs && (
        <button
          data-file-tab="changes"
          className={clsx(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors",
            tab === "changes" ? "bg-raised text-ink" : "text-muted hover:bg-line-soft hover:text-ink",
          )}
          onClick={() => onTabChange("changes")}
        >
          <GitBranch size={12} className={tab === "changes" ? "text-accent" : "text-faint"} />
          {t("files.changes")}
          {diff.length > 0 && <span className="text-[9px] text-faint">{diff.length}</span>}
        </button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton className="h-6 w-6" title={t("files.refresh")} onClick={refreshCurrent}>
            <RefreshCw size={11} />
          </IconButton>
          {onClose && (
            <IconButton className="h-6 w-6" title={t("common.close")} onClick={onClose}>
              <X size={12} />
            </IconButton>
          )}
        </div>
      </div>
      )}

      {tab === "explorer" ? (
        <>
          <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
            <Search size={12} className="text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("files.searchFiles")}
              className="w-full bg-transparent text-[11.5px] outline-none placeholder:text-faint"
            />
            {searching && <Spinner size={10} />}
            <IconButton className="h-6 w-6 shrink-0" title={t("files.refresh")} onClick={refreshCurrent}>
              <RefreshCw size={11} />
            </IconButton>
          </div>

          <div className="min-h-0 flex-[0.9] overflow-y-auto px-1 py-1.5">
            {query.trim() ? (
              <div>
                {searchResults === null ? (
                  <div className="flex items-center justify-center py-6 text-faint">
                    <Spinner />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-faint">{t("files.noFiles")}</div>
                ) : (
                  <>
                    <div className="px-2 pb-1 text-[9.5px] uppercase tracking-wider text-faint">
                      {t("files.searchResults", { count: searchResults.length })}
                    </div>
                    {searchResults.map((path) => (
                      <button
                        key={path}
                        data-file-path={path}
                        className={clsx(
                          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors",
                          selectedPath === path ? "bg-accent-soft/40 text-ink" : "text-muted hover:bg-line-soft/60 hover:text-ink",
                        )}
                        onClick={() => void selectFile(path)}
                      >
                        <FileIcon name={path} />
                        <span className="truncate">{path}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : project ? (
              <>
                <button
                  className="flex w-full items-center gap-1 rounded px-1 py-[3px] text-left text-[11.5px] font-medium text-ink hover:bg-line-soft/60"
                  onClick={() => {
                    const open = expanded.has(".")
                    setExpanded((current) => {
                      const next = new Set(current)
                      if (open) next.delete(".")
                      else next.add(".")
                      return next
                    })
                    if (!open && !children["."]) void loadDir(".")
                  }}
                >
                  {expanded.has(".") ? <ChevronDown size={11} className="text-faint" /> : <ChevronRight size={11} className="text-faint" />}
                  <FolderOpen size={13} className="text-accent" />
                  <span className="truncate">{project.name}</span>
                </button>
                {expanded.has(".") &&
                  (loadingDirs.has(".") && !children["."] ? (
                    <div className="flex items-center gap-1.5 px-6 py-2 text-[10px] text-faint">
                      <Spinner size={9} /> {t("common.loading")}
                    </div>
                  ) : (
                    renderTree(".", 1)
                  ))}
                {(children["."]?.length ?? 0) === 0 && !loadingDirs.has(".") && (
                  <div className="px-3 py-6 text-center text-[11px] text-faint">{t("files.noFiles")}</div>
                )}
              </>
            ) : (
              <div className="px-3 py-6 text-center text-[11px] text-faint">{t("files.noFiles")}</div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-t border-line">
            {selectedPath ? (
              <>
                <div className="flex items-center gap-1.5 border-b border-line/70 px-2 py-1.5">
                  <FileText size={12} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted" title={selectedPath}>
                    {selectedPath}
                  </span>
                  <span className="shrink-0 text-[9.5px] text-faint">
                    {content
                      ? (() => {
                          const count = content.content ? content.content.split(/\r?\n/).length : 0
                          return count === 1 ? t("files.line", { count }) : t("files.lines", { count })
                        })()
                      : ""}
                  </span>
                  {content?.type === "text" && !content.truncated && !editing && (
                    <IconButton data-file-edit className="h-6 w-6" title={t("files.edit")} onClick={startEditing}>
                      <Pencil size={11} />
                    </IconButton>
                  )}
                  {editing && (
                    <>
                      <IconButton className="h-6 w-6" title={t("files.save")} disabled={saving} onClick={() => void saveFile()}>
                        {saving ? <Spinner size={10} /> : <Save size={11} />}
                      </IconButton>
                      <IconButton
                        className="h-6 w-6"
                        title={t("common.cancel")}
                        onClick={() => {
                          setEditing(false)
                          setDraft("")
                        }}
                      >
                        <X size={11} />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    className="h-6 w-6"
                    title={t("files.copyPath")}
                    onClick={() => {
                      void navigator.clipboard.writeText(content?.absolute ?? selectedPath).then(
                        () => addToast("success", t("common.copied")),
                        () => addToast("error", t("common.error")),
                      )
                    }}
                  >
                    <Copy size={11} />
                  </IconButton>
                  <IconButton
                    className="h-6 w-6"
                    title={t("files.reveal")}
                    onClick={() => {
                      if (content?.absolute) void rpc("app.showItem", content.absolute)
                    }}
                    disabled={!content?.absolute}
                  >
                    <FolderOpen size={11} />
                  </IconButton>
                  <IconButton
                    className="h-6 w-6"
                    title={t("files.openExternal")}
                    onClick={() => {
                      if (content?.absolute) {
                        void rpc("app.openPath", content.absolute).catch((error) => addToast("error", (error as Error).message))
                      }
                    }}
                    disabled={!content?.absolute}
                  >
                    <ExternalLink size={11} />
                  </IconButton>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {contentLoading ? (
                    <div className="flex items-center justify-center py-10 text-faint">
                      <Spinner />
                    </div>
                  ) : content ? (
                    content.type === "binary" ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-faint">
                        <FileText size={20} />
                        <span className="text-[11px]">{t("files.binary")}</span>
                      </div>
                    ) : editing ? (
                      <CodeEditor
                        path={content.path}
                        value={draft}
                        onChange={setDraft}
                        onSave={() => void saveFile()}
                        dark={dark}
                      />
                    ) : (
                      <CodePreview content={content} />
                    )
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <FileText size={22} className="text-faint/60" />
                <div className="text-[12px] font-medium text-muted">{t("files.selectFile")}</div>
                <div className="text-[10.5px] leading-relaxed text-faint">{t("files.selectFileHint")}</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
            {showSessionTab && (
            <button
              data-change-tab="session"
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                changeMode === "session" ? "bg-raised text-ink" : "text-muted hover:bg-line-soft hover:text-ink",
              )}
              onClick={() => switchChangeMode("session")}
            >
              {t("git.session")}
              {diff.length > 0 && <span className="text-[9px] text-faint">{diff.length}</span>}
            </button>
            )}
            <button
              data-change-tab="git"
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                changeMode === "git" ? "bg-raised text-ink" : "text-muted hover:bg-line-soft hover:text-ink",
              )}
              onClick={() => switchChangeMode("git")}
            >
              <GitBranch size={11} className={changeMode === "git" ? "text-accent" : "text-faint"} />
              {t("git.title")}
              {gitInfo?.isRepo && !gitInfo.clean && (
                <span className="text-[9px] text-faint">{gitInfo.staged.length + gitInfo.unstaged.length}</span>
              )}
            </button>
            <button
              data-change-tab="graph"
              className={clsx(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                changeMode === "graph" ? "bg-raised text-ink" : "text-muted hover:bg-line-soft hover:text-ink",
              )}
              onClick={() => switchChangeMode("graph")}
            >
              <GitFork size={11} className={changeMode === "graph" ? "text-accent" : "text-faint"} />
              {t("git.graph")}
            </button>
          </div>

          {changeMode === "graph" ? (
            <GitGraph refreshKey={graphRefreshKey} />
          ) : changeMode === "session" ? (
            activeSessionId ? (
              <>
                <div className="flex items-center gap-2 border-b border-line px-2.5 py-2 text-[10.5px] text-muted">
                  <span>{t("files.changedFiles", { count: diff.length })}</span>
                  <span className="text-good">+{totals.additions}</span>
                  <span className="text-bad">-{totals.deletions}</span>
                </div>
                {diffLoading ? (
                  <div className="flex items-center justify-center py-10 text-faint">
                    <Spinner />
                  </div>
                ) : diff.length === 0 ? (
                  <div className="px-3 py-8">
                    <EmptyState title={t("files.noChanges")} description={t("files.noChangesHint")} />
                  </div>
                ) : (
                  <>
                    <div className="max-h-[36%] min-h-[80px] overflow-y-auto border-b border-line p-1">
                      {diff.map((file) => (
                        <button
                          key={file.file}
                          data-diff-file={file.file}
                          className={clsx(
                            "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors",
                            selectedDiffPath === file.file
                              ? "bg-accent-soft/40 text-ink"
                              : "text-muted hover:bg-line-soft/60 hover:text-ink",
                          )}
                          onClick={() => setSelectedDiffPath(file.file)}
                        >
                          <FileCode2 size={12} className="shrink-0 text-faint" />
                          <span className="truncate">{file.file}</span>
                          <span className="ml-auto shrink-0 text-[9.5px] text-good">+{file.additions}</span>
                          <span className="shrink-0 text-[9.5px] text-bad">-{file.deletions}</span>
                        </button>
                      ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      {selectedDiff ? (
                        <UnifiedDiff before={selectedDiff.before} after={selectedDiff.after} className="h-full" />
                      ) : (
                        <div className="px-3 py-8 text-center text-[11px] text-faint">{t("files.selectChange")}</div>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="px-3 py-8">
                <EmptyState title={t("files.noSession")} description={t("files.noChangesHint")} />
              </div>
            )
          ) : !gitInfo || gitLoading ? (
            <div className="flex items-center justify-center py-10 text-faint">
              <Spinner />
            </div>
          ) : !gitEnvironment || !gitEnvironment.available || !gitInfo.isRepo ? (
            <div className="h-full overflow-y-auto">
              <GitSetup environment={gitEnvironment} isRepo={Boolean(gitInfo.isRepo)} onReady={loadGit} />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-line px-2.5 py-2 text-[10.5px]">
                <GitBranch size={12} className="text-accent" />
                <span className="min-w-0 truncate font-mono text-[11px] text-ink">{gitInfo.branch ?? "HEAD"}</span>
                {(gitInfo.ahead ?? 0) > 0 && <span className="text-accent">↑{gitInfo.ahead}</span>}
                {(gitInfo.behind ?? 0) > 0 && <span className="text-warn">↓{gitInfo.behind}</span>}
                <span className="ml-auto text-faint">
                  {gitInfo.clean
                    ? t("git.clean")
                    : t("git.staged") + " " + gitInfo.staged.length + " · " + t("git.unstaged") + " " + gitInfo.unstaged.length}
                </span>
                <IconButton className="h-5 w-5" title={t("common.refresh")} onClick={() => void loadGit()}>
                  <RefreshCw size={10} />
                </IconButton>
              </div>

              {gitInfo.clean ? (
                <div className="border-b border-line px-3 py-3 text-center text-[11px] text-faint">{t("git.cleanDesc")}</div>
              ) : (
                <div className="max-h-[30%] min-h-[84px] overflow-y-auto border-b border-line py-0.5">
                  {gitInfo.staged.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 px-2 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                        <span>
                          {t("git.staged")} · {gitInfo.staged.length}
                        </span>
                        <button
                          className="ml-auto font-medium normal-case tracking-normal text-accent hover:underline"
                          onClick={() => void moveGit(gitInfo.staged.map((file) => file.path), false)}
                        >
                          {t("git.unstageAll")}
                        </button>
                      </div>
                      {gitInfo.staged.map((file) => gitFileRow(file, true))}
                    </>
                  )}
                  {gitInfo.unstaged.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 px-2 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-faint">
                        <span>
                          {t("git.unstaged")} · {gitInfo.unstaged.length}
                        </span>
                        <button
                          className="ml-auto font-medium normal-case tracking-normal text-accent hover:underline"
                          onClick={() => void moveGit(gitInfo.unstaged.map((file) => file.path), true)}
                        >
                          {t("git.stageAll")}
                        </button>
                      </div>
                      {gitInfo.unstaged.map((file) => gitFileRow(file, false))}
                    </>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-hidden">
                {selectedGitPath ? (
                  gitDiffLoading ? (
                    <div className="flex items-center justify-center py-10 text-faint">
                      <Spinner />
                    </div>
                  ) : gitDiff ? (
                    <UnifiedDiff before={gitDiff.before} after={gitDiff.after} className="h-full" />
                  ) : (
                    <div className="px-3 py-8 text-center text-[11px] text-faint">{t("git.diffUnavailable")}</div>
                  )
                ) : (
                  <div className="px-3 py-8 text-center text-[11px] text-faint">{t("git.noDiff")}</div>
                )}
              </div>

              <div className="border-t border-line p-2">
                <textarea
                  className="input min-h-[54px] resize-none text-[11.5px]"
                  placeholder={gitInfo.staged.length > 0 ? t("git.commitPlaceholder") : t("git.stageToCommit")}
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                />
                <Button
                  variant="primary"
                  className="mt-1.5 h-7 w-full px-2 text-[11px]"
                  disabled={!commitMessage.trim() || committing || gitInfo.staged.length === 0}
                  onClick={() => void commitChanges()}
                >
                  {committing ? <Spinner size={11} /> : <GitCommit size={11} />} {t("git.commit")}
                </Button>
                {gitInfo.staged.length === 0 && (
                  <div className="mt-1 text-center text-[9.5px] text-faint">{t("git.stageToCommit")}</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
