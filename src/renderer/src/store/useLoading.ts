import { create } from "zustand"

interface LoadingStore {
  pending: number
  label: string | null
  start: (label: string) => void
  end: () => void
}

export const useLoading = create<LoadingStore>()((set) => ({
  pending: 0,
  label: null,
  start: (label) => set((current) => ({ pending: current.pending + 1, label })),
  end: () =>
    set((current) => {
      const pending = Math.max(0, current.pending - 1)
      return { pending, label: pending === 0 ? null : current.label }
    }),
}))
