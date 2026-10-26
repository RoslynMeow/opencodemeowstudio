import { useCallback } from "react"
import { useStudio } from "../store/useStore"
import { resolveLocale, translate, type Locale } from "./index"

export function useT(): {
  t: (key: string, vars?: Record<string, string | number>) => string
  locale: Locale
  language: string
} {
  const language = useStudio((state) => state.state?.settings.language ?? "system")
  const systemLocale = useStudio((state) => state.state?.locale ?? (typeof navigator === "undefined" ? "en" : navigator.language))
  const locale = resolveLocale(language, systemLocale)
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )
  return { t, locale, language }
}
