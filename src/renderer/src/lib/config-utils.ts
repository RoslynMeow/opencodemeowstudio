export function splitCommand(value: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    const token = match[1] ?? match[2] ?? match[3]
    if (token !== undefined) tokens.push(token)
  }
  return tokens
}

export function parseKeyValue(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const index = trimmed.indexOf("=")
    if (index === -1) {
      result[trimmed] = ""
      continue
    }
    result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }
  return result
}

export function stringifyKeyValue(value: Record<string, string> | undefined): string {
  if (!value) return ""
  return Object.entries(value)
    .map(([key, entry]) => `${key}=${entry}`)
    .join("\n")
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
