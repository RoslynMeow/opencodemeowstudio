import { beforeEach, describe, expect, it } from "vitest"
import { useLoading } from "../../src/renderer/src/store/useLoading"

describe("useLoading", () => {
  beforeEach(() => {
    useLoading.setState({ pending: 0, label: null })
  })

  it("tracks concurrent requests and the most recent label", () => {
    useLoading.getState().start("session.list")
    useLoading.getState().start("worktree.list")

    expect(useLoading.getState()).toMatchObject({ pending: 2, label: "worktree.list" })

    useLoading.getState().end()
    expect(useLoading.getState()).toMatchObject({ pending: 1, label: "worktree.list" })

    useLoading.getState().end()
    expect(useLoading.getState()).toMatchObject({ pending: 0, label: null })
  })

  it("never goes below zero", () => {
    useLoading.getState().end()
    expect(useLoading.getState().pending).toBe(0)
  })
})
