import type { StudioEvent } from "@shared/types"

let sink: ((event: StudioEvent) => void) | null = null

export function setEventSink(next: ((event: StudioEvent) => void) | null): void {
  sink = next
}

export function emitEvent(event: StudioEvent): void {
  sink?.(event)
}
