export interface ClarificationQuestion {
  id?: string
  question: string
  options?: string[]
  multiple?: boolean
}

export interface ClarificationPayload {
  intro?: string
  questions: ClarificationQuestion[]
}

const BLOCK = /```meow-questions[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === "{") depth++
    else if (char === "}") {
      depth--
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

export function parseClarifications(text: string): { plain: string; payloads: ClarificationPayload[] } {
  const payloads: ClarificationPayload[] = []
  const ranges: Array<[number, number]> = []
  for (const match of text.matchAll(BLOCK)) {
    const raw = match[0]
    const body = match[1] ?? ""
    const jsonText = extractJsonObject(body)
    if (!jsonText) continue
    try {
      const parsed = JSON.parse(jsonText) as Partial<ClarificationPayload>
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .filter((question): question is ClarificationQuestion => Boolean(question && typeof question.question === "string"))
            .map((question) => ({
              id: typeof question.id === "string" ? question.id : undefined,
              question: question.question,
              options: Array.isArray(question.options) ? question.options.filter((option) => typeof option === "string") : [],
              multiple: Boolean(question.multiple),
            }))
        : []
      if (questions.length === 0) continue
      payloads.push({ intro: typeof parsed.intro === "string" ? parsed.intro : undefined, questions })
      const bodyStart = match.index + raw.indexOf(body)
      const jsonStart = bodyStart + body.indexOf(jsonText)
      const start = match.index
      const end = raw.endsWith("```") ? match.index + raw.length : jsonStart + jsonText.length
      ranges.push([start, end])
    } catch {
      // Leave malformed blocks as normal text.
    }
  }

  let plain = text
  for (const [start, end] of ranges.reverse()) {
    plain = plain.slice(0, start) + plain.slice(end)
  }
  return { plain: plain.replace(/\n{3,}/g, "\n\n").trim(), payloads }
}
