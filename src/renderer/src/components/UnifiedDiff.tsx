import clsx from "clsx"
import { useMemo } from "react"
import { useT } from "../i18n/useT"

interface DiffRow {
  type: "add" | "del" | "ctx"
  text: string
  oldNo?: number
  newNo?: number
}

const MAX_ROWS = 4000
const MAX_LINES = 3000
const MAX_CELLS = 8_000_000

function splitLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = normalized.split("\n")
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  return lines
}

function lineDiff(before: string, after: string): { rows: DiffRow[]; truncated: boolean; tooLarge: boolean } {
  const a = splitLines(before)
  const b = splitLines(after)
  if (a.length === 0 && b.length === 0) return { rows: [], truncated: false, tooLarge: false }
  if (a.length > MAX_LINES || b.length > MAX_LINES || a.length * b.length > MAX_CELLS) {
    return { rows: [], truncated: true, tooLarge: true }
  }

  const m = b.length
  const width = m + 1
  const dp = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const index = i * width + j
      if (a[i] === b[j]) dp[index] = (dp[(i + 1) * width + j + 1] ?? 0) + 1
      else dp[index] = Math.max(dp[(i + 1) * width + j] ?? 0, dp[i * width + j + 1] ?? 0)
    }
  }

  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < a.length && j < b.length && rows.length < MAX_ROWS) {
    if (a[i] === b[j]) {
      rows.push({ type: "ctx", text: a[i] ?? "", oldNo: oldNo++, newNo: newNo++ })
      i++
      j++
    } else if ((dp[(i + 1) * width + j] ?? 0) >= (dp[i * width + j + 1] ?? 0)) {
      rows.push({ type: "del", text: a[i] ?? "", oldNo: oldNo++ })
      i++
    } else {
      rows.push({ type: "add", text: b[j] ?? "", newNo: newNo++ })
      j++
    }
  }
  while (i < a.length && rows.length < MAX_ROWS) {
    rows.push({ type: "del", text: a[i] ?? "", oldNo: oldNo++ })
    i++
  }
  while (j < b.length && rows.length < MAX_ROWS) {
    rows.push({ type: "add", text: b[j] ?? "", newNo: newNo++ })
    j++
  }
  const truncated = i < a.length || j < b.length
  return { rows, truncated, tooLarge: false }
}

export function UnifiedDiff({ before, after, className }: { before: string; after: string; className?: string }) {
  const { t } = useT()
  const beforeText = typeof before === "string" ? before : ""
  const afterText = typeof after === "string" ? after : ""
  const { rows, truncated, tooLarge } = useMemo(() => lineDiff(beforeText, afterText), [beforeText, afterText])

  if (tooLarge) {
    return (
      <div className={clsx("px-3 py-6 text-center text-[11px] text-faint", className)}>
        {t("files.diffTooLarge")}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={clsx("px-3 py-6 text-center text-[11px] text-faint", className)}>
        {t("files.noChanges")}
      </div>
    )
  }

  return (
    <div className={clsx("overflow-auto font-mono text-[11px] leading-[1.55]", className)}>
      <div className="min-w-max py-1">
        <div className="sticky top-0 z-10 flex border-b border-line bg-canvas/95 text-[8.5px] font-semibold uppercase tracking-wider text-faint backdrop-blur">
          <span className="w-10 shrink-0 border-r border-line/60 pr-1.5 text-right">{t("files.oldLine")}</span>
          <span className="w-10 shrink-0 border-r border-line/60 pr-1.5 text-right">{t("files.newLine")}</span>
          <span className="w-4 shrink-0" />
          <span className="px-1.5 py-0.5">{t("files.diff")}</span>
        </div>
        {rows.map((row, index) => (
          <div
            key={index}
            className={clsx("flex", row.type === "add" && "bg-good/10", row.type === "del" && "bg-bad/10")}
          >
            <span className="w-10 shrink-0 select-none border-r border-line/60 pr-1.5 text-right text-faint/70">
              {row.oldNo ?? ""}
            </span>
            <span className="w-10 shrink-0 select-none border-r border-line/60 pr-1.5 text-right text-faint/70">
              {row.newNo ?? ""}
            </span>
            <span
              className={clsx(
                "w-4 shrink-0 select-none text-center",
                row.type === "add" ? "text-good" : row.type === "del" ? "text-bad" : "text-faint/50",
              )}
            >
              {row.type === "add" ? "+" : row.type === "del" ? "-" : " "}
            </span>
            <span
              className={clsx(
                "whitespace-pre px-1.5",
                row.type === "add" ? "text-good" : row.type === "del" ? "text-bad" : "text-muted",
              )}
            >
              {row.text || " "}
            </span>
          </div>
        ))}
      </div>
      {truncated && (
        <div className="sticky bottom-0 border-t border-line bg-surface px-3 py-1.5 text-[10px] text-faint">
          {t("files.diffTruncated")}
        </div>
      )}
    </div>
  )
}
