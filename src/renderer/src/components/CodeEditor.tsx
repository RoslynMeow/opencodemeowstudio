import CodeMirror from "@uiw/react-codemirror"
import { languages } from "@codemirror/language-data"
import { keymap } from "@codemirror/view"
import type { Extension } from "@codemirror/state"
import { useEffect, useMemo, useRef, useState } from "react"

export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  dark,
}: {
  path: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  dark: boolean
}) {
  const [language, setLanguage] = useState<Extension[]>([])
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  useEffect(() => {
    let active = true
    const lower = path.toLowerCase()
    const description = languages.find((candidate) =>
      candidate.extensions?.some((extension) => lower.endsWith(`.${extension.toLowerCase()}`)),
    )
    if (!description) {
      setLanguage([])
      return
    }
    void description
      .load()
      .then((support) => {
        if (active) setLanguage([support])
      })
      .catch(() => {
        if (active) setLanguage([])
      })
    return () => {
      active = false
    }
  }, [path])

  const extensions = useMemo<Extension[]>(
    () => [
      ...language,
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            saveRef.current()
            return true
          },
        },
      ]),
    ],
    [language],
  )

  return (
    <div className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-editor]:bg-canvas [&_.cm-focused]:outline-none [&_.cm-gutters]:border-r [&_.cm-gutters]:border-line [&_.cm-gutters]:bg-canvas [&_.cm-scroller]:overflow-auto [&_.cm-content]:font-mono [&_.cm-content]:text-[11px]">
      <CodeMirror
        value={value}
        height="100%"
        theme={dark ? "dark" : "light"}
        autoFocus
        extensions={extensions}
        onChange={onChange}
      />
    </div>
  )
}
