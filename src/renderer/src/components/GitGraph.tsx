import clsx from "clsx"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Tag,
  Target,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GitBranches, GitCommitDetail, GitEnvironment, GitGraphData, GitInfo, GitRemote } from "@shared/types"
import { useT } from "../i18n/useT"
import { layoutGitGraph, laneColor, GRAPH_ROW_HEIGHT, graphNodeX, graphNodeY } from "../lib/git-graph"
import { rpc } from "../lib/rpc"
import { useStudio } from "../store/useStore"
import { GitSetup } from "./GitSetup"
import { Button, EmptyState, IconButton, Modal, Spinner } from "./ui"

type Busy = "fetch" | "pull" | "push" | "checkout" | "branch" | "merge" | "rebase" | "stash" | "tag" | "abort" | "continue" | null

export function GitGraph({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useT()
  const addToast = useStudio((store) => store.addToast)
  const project = useStudio((store) => store.state?.activeProject)
  const [environment, setEnvironment] = useState<GitEnvironment | null>(null)
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [graph, setGraph] = useState<GitGraphData | null>(null)
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [remotes, setRemotes] = useState<GitRemote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [branchOpen, setBranchOpen] = useState(false)
  const [newBranch, setNewBranch] = useState("")
  const [opsOpen, setOpsOpen] = useState(false)
  const [targetBranch, setTargetBranch] = useState("")
  const [stashMessage, setStashMessage] = useState("")
  const [tagName, setTagName] = useState("")
  const [hover, setHover] = useState<{ commit: GitGraphData["commits"][number]; x: number; y: number } | null>(null)
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [detail, setDetail] = useState<GitCommitDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [focusHash, setFocusHash] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const movedRef = useRef(false)
  const focusTimer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextEnvironment = await rpc("git.environment")
      setEnvironment(nextEnvironment)
      if (!nextEnvironment.available) {
        setInfo(null)
        setGraph(null)
        setBranches(null)
        setRemotes([])
        return
      }
      const nextInfo = await rpc("git.info")
      setInfo(nextInfo)
      if (!nextInfo.isRepo) {
        setGraph(null)
        setBranches(null)
        setRemotes([])
        return
      }
      const [nextGraph, nextBranches, nextRemotes] = await Promise.all([
        rpc("git.graph", 300),
        rpc("git.branches"),
        rpc("git.remotes"),
      ])
      setGraph(nextGraph)
      setBranches(nextBranches)
      setRemotes(nextRemotes)
    } catch (nextError) {
      const message = (nextError as Error).message
      setError(message)
      addToast("error", message)
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshKey, project?.id])

  useEffect(() => {
    setSelectedHash(null)
    setDetail(null)
  }, [project?.id])

  const currentBranch = graph?.branch ?? branches?.current ?? info?.branch ?? null
  const remote = remotes.find((entry) => entry.name === "origin") ?? remotes[0]
  const github = remote?.github
  const layout = useMemo(() => layoutGitGraph(graph?.commits ?? []), [graph?.commits])

  const scrollToCommit = (hash: string) => {
    const row = graph?.commits.findIndex((commit) => commit.hash === hash) ?? -1
    const node = scrollRef.current
    if (row < 0 || !node) return
    node.scrollTo({ top: Math.max(0, row * GRAPH_ROW_HEIGHT - node.clientHeight / 2), behavior: "smooth" })
    setFocusHash(hash)
    if (focusTimer.current) window.clearTimeout(focusTimer.current)
    focusTimer.current = window.setTimeout(() => setFocusHash(null), 1800)
  }

  const openCommit = async (hash: string) => {
    setSelectedHash(hash)
    setDetail(null)
    setDetailLoading(true)
    try {
      setDetail(await rpc("git.commitDetail", hash))
    } catch (nextError) {
      addToast("error", (nextError as Error).message)
      setSelectedHash(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const runOperation = async (label: Exclude<Busy, null>, action: () => Promise<{ output: string }>, success: string) => {
    setBusy(label)
    try {
      await action()
      addToast("success", success)
      await refresh()
    } catch (nextError) {
      addToast("error", (nextError as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const runBranchOperation = async (
    label: Exclude<Busy, null>,
    action: () => Promise<{ ok: boolean; output: string; info: GitInfo }>,
    success: string,
  ) => {
    setBusy(label)
    try {
      const result = await action()
      setOpsOpen(false)
      await refresh()
      if (!result.ok) {
        const count = result.info.conflicts?.length ?? 0
        addToast("error", count > 0 ? t("git.conflicts", { count }) : result.output || t("git.operationFailed"))
      } else {
        addToast("success", success)
      }
    } catch (nextError) {
      addToast("error", (nextError as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const mergeBranch = () => {
    if (!targetBranch) return
    void runBranchOperation("merge", () => rpc("git.merge", targetBranch), t("git.mergeSuccess", { branch: targetBranch }))
  }

  const rebaseBranch = () => {
    if (!targetBranch) return
    void runBranchOperation("rebase", () => rpc("git.rebase", targetBranch), t("git.rebaseSuccess", { branch: targetBranch }))
  }

  const abortOperation = () => {
    void runBranchOperation("abort", () => rpc("git.abort"), t("git.abortSuccess"))
  }

  const continueOperation = () => {
    void runBranchOperation("continue", () => rpc("git.continue"), t("git.continueSuccess"))
  }

  const stashChanges = () => {
    void runBranchOperation("stash", () => rpc("git.stash", stashMessage), t("git.stashSuccess"))
  }

  const popStash = () => {
    void runBranchOperation("stash", () => rpc("git.stashPop"), t("git.stashPopSuccess"))
  }

  const createTag = () => {
    if (!tagName.trim()) return
    void runBranchOperation("tag", () => rpc("git.tag", tagName.trim()), t("git.tagSuccess", { name: tagName.trim() }))
  }

  const checkout = (name: string) => {
    setBranchOpen(false)
    void runOperation("checkout", () => rpc("git.checkout", name), t("git.checkoutSuccess"))
  }

  const removeBranch = (name: string) => {
    if (!window.confirm(t("git.deleteBranchConfirm", { branch: name }))) return
    setBranchOpen(false)
    void runOperation("branch", () => rpc("git.deleteBranch", name), t("git.deleteBranchSuccess"))
  }

  const createBranch = () => {
    const name = newBranch.trim()
    if (!name) return
    setBranchOpen(false)
    setNewBranch("")
    void runOperation("branch", () => rpc("git.createBranch", name), t("git.branchCreated"))
  }

  const openExternal = (url: string) => {
    void rpc("app.openExternal", url).catch((nextError) => addToast("error", (nextError as Error).message))
  }

  const pullRequestUrl = (() => {
    if (!github || !currentBranch || !remote?.defaultBranch || currentBranch === remote.defaultBranch) return null
    return `${github.url}/compare/${encodeURIComponent(remote.defaultBranch)}...${encodeURIComponent(currentBranch)}?expand=1`
  })()

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const node = scrollRef.current
    if (!node) return
    movedRef.current = false
    dragRef.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const node = scrollRef.current
    if (!drag || !node) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true
    if (!movedRef.current) return
    if (!node.hasPointerCapture(event.pointerId)) node.setPointerCapture(event.pointerId)
    node.scrollLeft = drag.left - dx
    node.scrollTop = drag.top - dy
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = scrollRef.current
    if (node?.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
    dragRef.current = null
    setDragging(false)
  }

  const selectCommit = (hash: string) => {
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    setHover(null)
    void openCommit(hash)
  }

  const hoverCard = hover && (
    <div
      className="pointer-events-none fixed z-[80] w-[300px] rounded-xl border border-line bg-surface/95 p-3 text-[11px] shadow-2xl backdrop-blur"
      style={{
        left: Math.max(8, Math.min(hover.x + 14, window.innerWidth - 316)),
        top: Math.max(8, Math.min(hover.y + 14, window.innerHeight - 210)),
      }}
    >
      <div className="font-medium leading-snug text-ink">{hover.commit.subject || t("git.noSubject")}</div>
      <div className="mt-2 grid grid-cols-[54px_1fr] gap-x-2 gap-y-1 text-[10.5px]">
        <span className="text-faint">{t("git.hash")}</span>
        <span className="font-mono text-muted">{hover.commit.shortHash}</span>
        <span className="text-faint">{t("git.author")}</span>
        <span className="truncate text-muted">{hover.commit.author}</span>
        <span className="text-faint">{t("git.date")}</span>
        <span className="text-muted">{formatDate(hover.commit.timestamp)}</span>
        <span className="text-faint">{t("git.parents")}</span>
        <span className="truncate font-mono text-muted">
          {hover.commit.parents.length > 0 ? hover.commit.parents.map((parent) => parent.slice(0, 7)).join(", ") : t("git.rootCommit")}
        </span>
      </div>
      {hover.commit.refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {hover.commit.refs.map((ref) => (
            <span key={`${ref.kind}-${ref.name}`} className="rounded border border-line px-1 py-0.5 text-[9px] text-muted">
              {ref.name}
            </span>
          ))}
        </div>
      )}
      {hover.commit.parents.length > 1 && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-accent">
          <GitMerge size={10} /> {t("git.mergeCommit")}
        </div>
      )}
    </div>
  )

  const detailModal = (
    <Modal
      open={Boolean(selectedHash)}
      onClose={() => {
        setSelectedHash(null)
        setDetail(null)
      }}
      title={detail?.commit.subject || t("git.commitDetail")}
      width="max-w-2xl"
      footer={
        sideFooter({
          detail,
          githubUrl: github?.url,
          onCopy: async (hash: string) => {
            await navigator.clipboard.writeText(hash)
            addToast("success", t("common.copied"))
          },
          onOpen: openExternal,
          t,
        })
      }
    >
      {detailLoading || !detail ? (
        <div className="flex items-center justify-center py-12 text-faint">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-canvas/50 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
              <span className="font-mono text-muted">{detail.commit.hash}</span>
              <span>·</span>
              <span>{detail.commit.author}</span>
              <span>·</span>
              <span>{formatDate(detail.commit.timestamp)}</span>
            </div>
            {detail.body && <div className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">{detail.body}</div>}
            <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-faint">{t("git.author")}</div>
                <div className="mt-0.5 text-muted">{detail.commit.author}</div>
                <div className="text-[10px] text-faint">{detail.commit.authorEmail}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-faint">{t("git.committer")}</div>
                <div className="mt-0.5 text-muted">{detail.committer}</div>
                <div className="text-[10px] text-faint">{detail.committerEmail}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-faint">{t("git.parents")}:</span>
              {detail.commit.parents.length === 0 ? (
                <span className="text-[10px] text-faint">{t("git.rootCommit")}</span>
              ) : (
                detail.commit.parents.map((parent) => (
                  <button
                    key={parent}
                    className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-accent hover:bg-raised"
                    onClick={() => {
                      setSelectedHash(null)
                      setDetail(null)
                      const exists = graph?.commits.some((commit) => commit.hash === parent)
                      if (exists) {
                        scrollToCommit(parent)
                      } else {
                        void openCommit(parent)
                      }
                    }}
                  >
                    {parent.slice(0, 7)}
                  </button>
                ))
              )}
            </div>
            {detail.commit.refs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {detail.commit.refs.map((ref) => (
                  <span
                    key={`${ref.kind}-${ref.name}`}
                    className="rounded border border-line bg-surface px-1.5 py-0.5 text-[9.5px] text-muted"
                  >
                    {ref.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
              <GitCommit size={12} className="text-faint" />
              <span>{t("git.filesChanged", { count: detail.files.length })}</span>
              <span className="text-good">+{detail.insertions}</span>
              <span className="text-bad">-{detail.deletions}</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-xl border border-line">
              {detail.files.length === 0 ? (
                <div className="px-3 py-5 text-center text-[11px] text-faint">{t("git.noFileChanges")}</div>
              ) : (
                detail.files.map((file) => (
                  <div key={file.path} className="flex items-center gap-2 border-b border-line/60 px-2.5 py-1.5 last:border-b-0">
                    <span className="w-4 shrink-0 text-center font-mono text-[10px] text-faint">{file.status}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted" title={file.path}>
                      {file.path}
                    </span>
                    <span className="shrink-0 text-[10px] text-good">+{file.additions}</span>
                    <span className="shrink-0 text-[10px] text-bad">-{file.deletions}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )

  const operationsModal = (
    <Modal
      open={opsOpen}
      onClose={() => setOpsOpen(false)}
      title={t("git.branchOperations")}
      width="max-w-lg"
      footer={<Button variant="ghost" onClick={() => setOpsOpen(false)}>{t("common.close")}</Button>}
    >
      <div className="space-y-4">
        <div>
          <div className="label">{t("git.targetBranch")}</div>
          <select
            className="input mt-1 w-full text-[12px]"
            value={targetBranch}
            onChange={(event) => setTargetBranch(event.target.value)}
          >
            <option value="">{t("git.selectBranch")}</option>
            {(branches?.local ?? []).filter((branch) => !branch.current).map((branch) => (
              <option key={branch.name} value={branch.name}>{branch.name}</option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" className="h-7 px-2.5 text-[11px]" disabled={!targetBranch || Boolean(busy)} onClick={mergeBranch}>
              {busy === "merge" ? <Spinner size={11} /> : <GitMerge size={12} />} {t("git.merge")}
            </Button>
            <Button className="h-7 px-2.5 text-[11px]" disabled={!targetBranch || Boolean(busy)} onClick={rebaseBranch}>
              {busy === "rebase" ? <Spinner size={11} /> : <GitBranch size={12} />} {t("git.rebase")}
            </Button>
          </div>
        </div>
        <div className="border-t border-line pt-3">
          <div className="label">{t("git.stash")} {info?.stashCount ? `(${info.stashCount})` : ""}</div>
          <div className="mt-1 flex gap-1.5">
            <input
              className="input h-7 min-w-0 flex-1 px-2 text-[11px]"
              placeholder={t("git.stashMessage")}
              value={stashMessage}
              onChange={(event) => setStashMessage(event.target.value)}
            />
            <Button className="h-7 px-2 text-[11px]" disabled={Boolean(busy)} onClick={stashChanges}>{t("git.stashChanges")}</Button>
            <Button className="h-7 px-2 text-[11px]" disabled={Boolean(busy) || !info?.stashCount} onClick={popStash}>{t("git.popStash")}</Button>
          </div>
        </div>
        <div className="border-t border-line pt-3">
          <div className="label">{t("git.createTag")}</div>
          <div className="mt-1 flex gap-1.5">
            <input
              className="input h-7 min-w-0 flex-1 px-2 font-mono text-[11px]"
              placeholder="v1.2.3"
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") createTag() }}
            />
            <Button className="h-7 px-2 text-[11px]" disabled={!tagName.trim() || Boolean(busy)} onClick={createTag}>{t("git.tag")}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <EmptyState title={t("toast.projectFirst")} />
      </div>
    )
  }

  if (environment && (!environment.available || !info?.isRepo)) {
    return (
      <div className="h-full overflow-y-auto">
        <GitSetup environment={environment} isRepo={Boolean(info?.isRepo)} onReady={refresh} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-1.5 py-1.5">
        <div className="relative">
          <button
            data-git-branch={currentBranch ?? ""}
            className="flex h-6 max-w-[150px] items-center gap-1 rounded-md border border-line bg-canvas/60 px-1.5 text-[10.5px] text-ink hover:bg-raised"
            onClick={() => setBranchOpen((value) => !value)}
          >
            <GitBranch size={11} className="shrink-0 text-accent" />
            <span className="truncate font-mono">{currentBranch ?? t("git.detached")}</span>
            <ChevronDown size={10} className="shrink-0 text-faint" />
          </button>
          {(info?.ahead ?? 0) > 0 && <span className="ml-1 text-[9.5px] text-accent">↑{info?.ahead}</span>}
          {(info?.behind ?? 0) > 0 && <span className="ml-1 text-[9.5px] text-warn">↓{info?.behind}</span>}
          {branchOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setBranchOpen(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 w-[250px] rounded-lg border border-line bg-surface p-1 shadow-2xl">
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-faint">{t("git.localBranches")}</div>
                <div className="max-h-48 overflow-y-auto">
                  {branches?.local.map((branch) => (
                    <div key={branch.name} className="group flex items-center gap-0.5">
                      <button
                        className={clsx(
                          "flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-left font-mono text-[10.5px] hover:bg-line-soft",
                          branch.current ? "text-accent" : "text-muted",
                        )}
                        onClick={() => checkout(branch.name)}
                      >
                        {branch.current && <Check size={10} />}
                        <span className="truncate">{branch.name}</span>
                        {branch.upstream && <span className="ml-auto truncate text-[9px] text-faint">{branch.upstream}</span>}
                      </button>
                      {!branch.current && (
                        <button
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint opacity-0 transition-colors hover:bg-line-soft hover:text-bad group-hover:opacity-100"
                          title={t("git.deleteBranch")}
                          onClick={() => removeBranch(branch.name)}
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                  {branches?.remotes.length ? (
                    <>
                      <div className="mt-1 border-t border-line px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wider text-faint">
                        {t("git.remoteBranches")}
                      </div>
                      {branches.remotes.slice(0, 12).map((branch) => (
                        <div key={branch.name} className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10.5px] text-faint">
                          <Cloud size={9} />
                          <span className="truncate">{branch.name}</span>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
                <div className="mt-1 border-t border-line p-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      className="input h-7 min-w-0 flex-1 px-2 font-mono text-[10.5px]"
                      placeholder={t("git.newBranchPlaceholder")}
                      value={newBranch}
                      onChange={(event) => setNewBranch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") createBranch()
                      }}
                    />
                    <IconButton className="h-7 w-7" title={t("git.createBranch")} onClick={createBranch}>
                      <Plus size={12} />
                    </IconButton>
                  </div>
                  <div className="mt-1.5 text-[9px] leading-relaxed text-faint">{t("git.authHint")}</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          {github && (
            <IconButton className="h-6 w-6" title={t("git.openGithub")} onClick={() => openExternal(github.url)}>
              <ExternalLink size={11} />
            </IconButton>
          )}
          {pullRequestUrl && (
            <IconButton className="h-6 w-6" title={t("git.createPr")} onClick={() => openExternal(pullRequestUrl)}>
              <GitPullRequest size={11} />
            </IconButton>
          )}
          <IconButton
            className="h-6 w-6"
            title={t("git.fetch")}
            disabled={Boolean(busy)}
            onClick={() => void runOperation("fetch", () => rpc("git.fetch"), t("git.fetchSuccess"))}
          >
            {busy === "fetch" ? <Spinner size={10} /> : <Download size={11} />}
          </IconButton>
          <IconButton
            className="h-6 w-6"
            title={t("git.pull")}
            disabled={Boolean(busy)}
            onClick={() => void runOperation("pull", () => rpc("git.pull"), t("git.pullSuccess"))}
          >
            {busy === "pull" ? <Spinner size={10} /> : <ArrowDown size={11} />}
          </IconButton>
          <IconButton
            className="h-6 w-6"
            title={t("git.push")}
            disabled={Boolean(busy)}
            onClick={() => void runOperation("push", () => rpc("git.push"), t("git.pushSuccess"))}
          >
            {busy === "push" ? <Spinner size={10} /> : <ArrowUp size={11} />}
          </IconButton>
          <IconButton className="h-6 w-6" title={t("files.refresh")} disabled={loading} onClick={() => void refresh()}>
            {loading ? <Spinner size={10} /> : <RefreshCw size={11} />}
          </IconButton>
          <IconButton
            data-git-ops
            className="h-6 w-6"
            title={t("git.branchOperations")}
            onClick={() => {
              setTargetBranch(branches?.local.find((branch) => !branch.current)?.name ?? "")
              setOpsOpen(true)
            }}
          >
            <MoreHorizontal size={12} />
          </IconButton>
        </div>
      </div>

      {(info?.operation || (info?.conflicts?.length ?? 0) > 0) && (
        <div className="border-b border-warn/30 bg-warn/5 px-2.5 py-2 text-[10.5px] text-warn">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} />
            <span>{t("git.operationInProgress", { operation: info?.operation ?? "merge" })}</span>
            {(info?.conflicts?.length ?? 0) > 0 && <span className="text-muted">{t("git.conflicts", { count: info?.conflicts?.length ?? 0 })}</span>}
          </div>
          {info?.conflicts && info.conflicts.length > 0 && (
            <div className="mt-1 space-y-0.5 pl-[18px] font-mono text-[9.5px] text-muted">
              {info.conflicts.slice(0, 8).map((file) => <div key={file} className="truncate">{file}</div>)}
            </div>
          )}
          <div className="mt-1.5 flex gap-1.5">
            <Button variant="ghost" className="h-6 px-2 text-[10px]" disabled={Boolean(busy)} onClick={abortOperation}>
              {t("git.abortOperation")}
            </Button>
            <Button variant="ghost" className="h-6 px-2 text-[10px]" disabled={Boolean(busy)} onClick={continueOperation}>
              {t("git.continueOperation")}
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <AlertTriangle size={22} className="text-warn" />
          <div className="text-[12px] text-muted">{error}</div>
          <Button variant="ghost" onClick={() => void refresh()}>
            <RefreshCw size={12} /> {t("common.retry")}
          </Button>
        </div>
      ) : loading && !graph ? (
        <div className="flex flex-1 items-center justify-center text-faint">
          <Spinner />
        </div>
      ) : !graph || graph.commits.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <EmptyState icon={<GitCommit size={24} />} title={t("git.noCommits")} description={t("git.noCommitsDesc")} />
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className={clsx(
              "min-h-0 flex-1 overflow-auto overscroll-contain",
              dragging ? "cursor-grabbing select-none" : "cursor-grab",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={(event) => {
              if (event.buttons === 0) endDrag(event)
            }}
          >
            <div className="relative" style={{ height: layout.height, minWidth: layout.width + 260 }}>
              {layout.rows.map((row) => {
                const commit = row.commit
                const active = selectedHash === commit.hash || focusHash === commit.hash
                return (
                  <div
                    key={commit.hash}
                    className="absolute inset-x-0 flex h-[34px] items-center"
                    style={{ top: row.row * GRAPH_ROW_HEIGHT }}
                    onMouseEnter={(event) => setHover({ commit, x: event.clientX, y: event.clientY })}
                    onMouseMove={(event) => setHover({ commit, x: event.clientX, y: event.clientY })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => selectCommit(commit.hash)}
                  >
                    <div className="h-full shrink-0" style={{ width: layout.width }} />
                    <button
                      data-commit-row={commit.hash}
                      className={clsx(
                        "flex h-full min-w-0 flex-1 items-center gap-2 rounded-r-md pr-3 text-left transition-colors",
                        active ? "bg-raised/55" : "hover:bg-line-soft/45",
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectCommit(commit.hash)
                      }}
                      title={`${commit.shortHash} ${commit.subject}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{commit.subject || t("git.noSubject")}</span>
                      {commit.parents.length > 1 && <GitMerge size={10} className="shrink-0 text-accent/70" />}
                      <span className="flex max-w-[48%] shrink-0 items-center justify-end gap-1 overflow-hidden">
                        {commit.refs.slice(0, 2).map((ref) => (
                          <RefBadge key={`${ref.kind}-${ref.name}`} kind={ref.kind} name={ref.name} />
                        ))}
                        {commit.refs.length > 2 && <span className="text-[9px] text-faint">+{commit.refs.length - 2}</span>}
                      </span>
                    </button>
                  </div>
                )
              })}

              <svg
                className="pointer-events-none absolute left-0 top-0 z-10"
                width={layout.width}
                height={layout.height}
                aria-hidden
              >
                {layout.edges.map((edge, index) => (
                  <path
                    key={`${edge.parent}-${edge.fromRow}-${index}`}
                    d={edgePath(edge)}
                    fill="none"
                    stroke={edge.color}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    opacity={edge.stub ? 0.35 : 0.82}
                    strokeDasharray={edge.stub ? "2 3" : undefined}
                  />
                ))}
                {layout.rows.map((row) => {
                  const commit = row.commit
                  const color = laneColor(row.lane)
                  const isHead = graph.head === commit.hash
                  const isSelected = selectedHash === commit.hash || focusHash === commit.hash
                  const merge = commit.parents.length > 1
                  return (
                    <g key={`node-${commit.hash}`}>
                      {isHead && (
                        <circle
                          cx={graphNodeX(row.lane)}
                          cy={graphNodeY(row.row)}
                          r={6.6}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.1}
                          opacity={0.7}
                        />
                      )}
                      {isSelected && (
                        <circle
                          cx={graphNodeX(row.lane)}
                          cy={graphNodeY(row.row)}
                          r={7.6}
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeWidth={1.2}
                          opacity={0.9}
                        />
                      )}
                      <circle
                        cx={graphNodeX(row.lane)}
                        cy={graphNodeY(row.row)}
                        r={merge ? 4.2 : 3.5}
                        fill={merge ? "var(--color-canvas)" : color}
                        stroke={color}
                        strokeWidth={merge ? 2 : 1}
                      />
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-1 text-[9.5px] text-faint">
            <span>{t("git.graphHint")}</span>
            <span>{graph.truncated ? t("git.graphTruncated", { count: graph.commits.length }) : graph.commits.length}</span>
          </div>
        </>
      )}

      {hoverCard}
      {detailModal}
      {operationsModal}
    </div>
  )
}

function edgePath(edge: { fromRow: number; fromLane: number; toRow: number; toLane: number; stub: boolean }): string {
  const x1 = graphNodeX(edge.fromLane)
  const y1 = graphNodeY(edge.fromRow)
  const x2 = graphNodeX(edge.toLane)
  const y2 = edge.stub ? y1 + GRAPH_ROW_HEIGHT / 2 : graphNodeY(edge.toRow)
  if (Math.abs(x1 - x2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const bend = Math.min(18, Math.max(6, Math.abs(y2 - y1) / 3))
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
}

function RefBadge({ kind, name }: { kind: "head" | "local" | "remote" | "tag"; name: string }) {
  const Icon = kind === "tag" ? Tag : kind === "remote" ? Cloud : kind === "head" ? Target : GitBranch
  return (
    <span
      className={clsx(
        "inline-flex max-w-[110px] items-center gap-0.5 truncate rounded border px-1 py-px text-[8.5px] font-medium",
        kind === "head"
          ? "border-accent/40 bg-accent/15 text-accent"
          : kind === "remote"
            ? "border-sky-400/35 bg-sky-400/10 text-sky-300"
            : kind === "tag"
              ? "border-warn/35 bg-warn/10 text-warn"
              : "border-line bg-surface text-muted",
      )}
      title={name}
    >
      <Icon size={8} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "—"
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function sideFooter({
  detail,
  githubUrl,
  onCopy,
  onOpen,
  t,
}: {
  detail: GitCommitDetail | null
  githubUrl?: string
  onCopy: (hash: string) => void | Promise<void>
  onOpen: (url: string) => void
  t: (key: string) => string
}) {
  if (!detail) return null
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" onClick={() => void onCopy(detail.commit.hash)}>
        <Copy size={12} /> {t("git.copyHash")}
      </Button>
      {githubUrl && (
        <Button variant="ghost" onClick={() => onOpen(`${githubUrl}/commit/${detail.commit.hash}`)}>
          <ExternalLink size={12} /> {t("git.openGithub")}
        </Button>
      )}
    </div>
  )
}
