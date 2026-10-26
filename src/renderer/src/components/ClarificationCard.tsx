import { Check, MessageCircleQuestion, Send } from "lucide-react"
import { useState } from "react"
import type { ClarificationPayload, ClarificationQuestion } from "../lib/clarifications"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"
import { Button } from "./ui"

export function ClarificationCard({ payload }: { payload: ClarificationPayload }) {
  const { t } = useT()
  const send = useStudio((store) => store.send)
  const busy = useStudio((store) => store.busy)
  const [selected, setSelected] = useState<Record<number, string[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [sent, setSent] = useState(false)

  const toggle = (index: number, question: ClarificationQuestion, option: string) => {
    setSelected((current) => {
      const values = current[index] ?? []
      if (question.multiple) {
        return { ...current, [index]: values.includes(option) ? values.filter((value) => value !== option) : [...values, option] }
      }
      return { ...current, [index]: [option] }
    })
  }

  const answer = (index: number) => {
    const values = [...(selected[index] ?? [])]
    const extra = custom[index]?.trim()
    if (extra) values.push(extra)
    return values
  }

  const canSubmit = payload.questions.some((_, index) => answer(index).length > 0)

  const submit = async () => {
    if (!canSubmit || busy || sent) return
    const body = payload.questions
      .map((question, index) => {
        const values = answer(index)
        return `${index + 1}. ${question.question}\n${values.length ? values.map((value) => `- ${value}`).join("\n") : "-"}`
      })
      .join("\n\n")
    if (await send(`${t("clarify.answerIntro")}\n\n${body}`)) setSent(true)
  }

  return (
    <div className="my-2 rounded-xl border border-accent/35 bg-accent-soft/10 p-3" data-clarification>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
        <MessageCircleQuestion size={13} />
        {t("clarify.title")}
      </div>
      {payload.intro && <div className="mt-1.5 text-[12px] leading-relaxed text-muted">{payload.intro}</div>}
      <div className="mt-2.5 space-y-3">
        {payload.questions.map((question, index) => (
          <div key={question.id ?? index}>
            <div className="text-[12px] font-medium leading-relaxed text-ink">
              {index + 1}. {question.question}
            </div>
            {(question.options?.length ?? 0) > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {question.options?.map((option) => {
                  const active = (selected[index] ?? []).includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={busy || sent}
                      onClick={() => toggle(index, question, option)}
                      className={[
                        "rounded-md border px-2 py-1 text-left text-[10.5px] transition-colors disabled:opacity-50",
                        active
                          ? "border-accent/60 bg-accent-soft/50 text-ink"
                          : "border-line bg-surface text-muted hover:border-faint hover:text-ink",
                      ].join(" ")}
                    >
                      {active && <Check size={10} className="mr-1 inline text-accent" />}
                      {option}
                    </button>
                  )
                })}
              </div>
            )}
            <input
              className="input mt-1.5 h-7 w-full px-2 text-[11px]"
              placeholder={t("clarify.customPlaceholder")}
              value={custom[index] ?? ""}
              disabled={busy || sent}
              onChange={(event) => setCustom((current) => ({ ...current, [index]: event.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Button variant="primary" className="h-7 px-2.5 text-[11px]" disabled={!canSubmit || busy || sent} onClick={submit}>
          {sent ? <Check size={11} /> : <Send size={11} />}
          {sent ? t("clarify.sent") : t("clarify.send")}
        </Button>
        <span className="text-[10px] text-faint">{t("clarify.hint")}</span>
      </div>
    </div>
  )
}