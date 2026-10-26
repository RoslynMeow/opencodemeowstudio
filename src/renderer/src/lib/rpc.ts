import type { RpcArgs, RpcName, RpcResult, StudioApi } from "@shared/types"

declare global {
  interface Window {
    studio: StudioApi
  }
}

export const api = window.studio

export async function rpc<K extends RpcName>(method: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
  return api.rpc(method, ...args)
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, index)
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export function safeJson(value: unknown, max = 4000): string {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
    return text.length > max ? `${text.slice(0, max)}\n…` : text
  } catch {
    return String(value)
  }
}

export function truncate(value: string, max = 120): string {
  const clean = value.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
