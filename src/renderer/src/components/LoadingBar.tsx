import clsx from "clsx"
import { useEffect, useRef, useState } from "react"
import { useLoading } from "../store/useLoading"

export function LoadingBar() {
  const pending = useLoading((store) => store.pending)
  const label = useLoading((store) => store.label)
  const [visible, setVisible] = useState(false)
  const showTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (pending > 0) {
      if (hideTimer.current !== undefined) {
        window.clearTimeout(hideTimer.current)
        hideTimer.current = undefined
      }
      if (showTimer.current === undefined) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = undefined
          setVisible(true)
        }, 140)
      }
    } else {
      if (showTimer.current !== undefined) {
        window.clearTimeout(showTimer.current)
        showTimer.current = undefined
        setVisible(false)
        return
      }
      if (hideTimer.current === undefined) {
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = undefined
          setVisible(false)
        }, 260)
      }
    }
  }, [pending])

  useEffect(
    () => () => {
      if (showTimer.current !== undefined) window.clearTimeout(showTimer.current)
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  return (
    <div
      className={clsx(
        "pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px] transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
      role="progressbar"
      aria-busy={pending > 0}
      aria-label={label ? `Loading ${label}` : "Loading"}
      title={label ?? undefined}
      data-loading-bar={visible ? "visible" : "hidden"}
    >
      <div className="h-full w-full overflow-hidden bg-accent/15">
        <div className="loading-bar-indeterminate h-full w-1/3 bg-accent" />
      </div>
    </div>
  )
}
