import { describe, expect, it } from "vitest"
import { BUILTIN_LSP, type MasonRegistryPackage } from "@shared/types"
import {
  entriesFromLspRegistry,
  LSP_MARKETPLACE,
  type LspMarketEntry,
} from "../../src/renderer/src/lib/lsp-marketplace"

function pkg(name: string, overrides: Partial<MasonRegistryPackage> = {}): MasonRegistryPackage {
  return { name, ...overrides }
}

function byName(entries: LspMarketEntry[], name: string): LspMarketEntry | undefined {
  return entries.find((entry) => entry.name === name)
}

describe("LSP_MARKETPLACE", () => {
  it("maps every builtin LSP entry with curated metadata", () => {
    expect(LSP_MARKETPLACE).toHaveLength(BUILTIN_LSP.length)
    expect(LSP_MARKETPLACE.map((entry) => entry.name)).toEqual(BUILTIN_LSP.map((entry) => entry.name))
  })

  it("exposes categories, auto-install and commands", () => {
    expect(byName(LSP_MARKETPLACE, "rust")).toMatchObject({
      category: "systems",
      autoInstall: false,
      installCommand: "rustup component add rust-analyzer",
      serverCommand: ["rust-analyzer"],
    })
    expect(byName(LSP_MARKETPLACE, "astro")).toMatchObject({ category: "web", autoInstall: true })
    expect(byName(LSP_MARKETPLACE, "pyright")).toMatchObject({
      category: "backend",
      serverCommand: ["pyright-langserver", "--stdio"],
    })
  })
})

describe("entriesFromLspRegistry", () => {
  it("keeps curated entries and skips registry duplicates case-insensitively", () => {
    const entries = entriesFromLspRegistry([pkg("Rust", { languages: ["Rust"] })])

    expect(entries).toHaveLength(LSP_MARKETPLACE.length)
    expect(byName(entries, "rust")).toMatchObject({ category: "systems" })
    expect(entries.filter((entry) => entry.name.toLowerCase() === "rust")).toHaveLength(1)
  })

  it("maps a registry package with extensions, install command and executable", () => {
    const [entry] = entriesFromLspRegistry([
      pkg("lua-language-server", {
        description: "Lua\\nlanguage server",
        languages: ["Lua"],
        source: { id: "pkg:npm/%40scope/lua-language-server@3.0.0" },
        bin: { "lua-language-server": "bin/lua-language-server" },
      }),
    ]).slice(LSP_MARKETPLACE.length)

    expect(entry).toMatchObject({
      name: "lua-language-server",
      extensions: [".lua"],
      requirements: "Lua\nlanguage server · Lua",
      category: "data",
      autoInstall: false,
      installCommand: "npm i -g @scope/lua-language-server",
      serverCommand: ["lua-language-server"],
      source: "Mason Registry",
    })
  })

  it.each([
    [["Swift", "Rust"], "mobile"],
    [["Rust", "TypeScript"], "systems"],
    [["TypeScript"], "web"],
    [["Python"], "backend"],
    [["Cobol"], "data"],
  ] as const)("derives category %s -> %s", (languages, category) => {
    const [entry] = entriesFromLspRegistry([pkg(`server-${category}-${languages.join("-")}`, { languages: [...languages] })]).slice(
      LSP_MARKETPLACE.length,
    )
    expect(entry?.category).toBe(category)
  })

  it("maps pypi install commands and leaves github sources without one", () => {
    const entries = entriesFromLspRegistry([
      pkg("py-server", { source: { id: "pkg:pypi/py-server@1.0.0" } }),
      pkg("gh-server", { source: { id: "pkg:github/owner/repo" } }),
    ]).slice(LSP_MARKETPLACE.length)

    expect(entries[0]?.installCommand).toBe("pip install py-server")
    expect(entries[1]?.installCommand).toBeUndefined()
  })

  it("deduplicates extensions and composes requirements", () => {
    const [entry] = entriesFromLspRegistry([
      pkg("web-server", { languages: ["TypeScript", "JavaScript"] }),
    ]).slice(LSP_MARKETPLACE.length)

    expect(entry?.extensions).toEqual([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])
    expect(entry?.requirements).toBe("TypeScript, JavaScript")
  })

  it("falls back to generic requirements and omits missing executables", () => {
    const [entry] = entriesFromLspRegistry([pkg("bare-server")]).slice(LSP_MARKETPLACE.length)

    expect(entry?.requirements).toBe("Language server")
    expect(entry?.extensions).toEqual([])
    expect(entry?.serverCommand).toBeUndefined()
    expect(entry?.source).toBe("Mason Registry")
  })

  it("keeps explicit source labels", () => {
    const [entry] = entriesFromLspRegistry([
      pkg("custom-server", { sourceLabel: "Custom Mason Mirror" }),
    ]).slice(LSP_MARKETPLACE.length)

    expect(entry?.source).toBe("Custom Mason Mirror")
  })
})
