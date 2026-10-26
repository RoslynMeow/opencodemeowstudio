import { BUILTIN_LSP, type BuiltinLsp, type MasonRegistryPackage } from "@shared/types"

export type LspMarketCategory = "web" | "systems" | "backend" | "mobile" | "data"

export interface LspMarketMeta {
  category: LspMarketCategory
  autoInstall: boolean
  installCommand?: string
  serverCommand?: string[]
}

export interface LspMarketEntry extends BuiltinLsp {
  category: LspMarketCategory
  autoInstall: boolean
  installCommand?: string
  serverCommand?: string[]
  source?: string
}

export const LSP_MARKET_CATEGORIES: LspMarketCategory[] = ["web", "systems", "backend", "mobile", "data"]

const META: Record<string, LspMarketMeta> = {
  astro: { category: "web", autoInstall: true },
  bash: { category: "systems", autoInstall: true },
  clangd: { category: "systems", autoInstall: true },
  csharp: { category: "backend", autoInstall: false, installCommand: "dotnet --version" },
  "clojure-lsp": {
    category: "backend",
    autoInstall: false,
    installCommand: "brew install clojure-lsp/brew/clojure-lsp-native",
    serverCommand: ["clojure-lsp"],
  },
  dart: { category: "mobile", autoInstall: false, installCommand: "https://dart.dev/get-dart" },
  deno: { category: "web", autoInstall: false, installCommand: "https://docs.deno.com/runtime/getting_started/installation/",
    serverCommand: ["deno", "lsp"],
  },
  "elixir-ls": { category: "backend", autoInstall: false, installCommand: "mix escript.install hex elixir_ls" },
  eslint: { category: "web", autoInstall: false, installCommand: "npm i -D eslint" },
  fsharp: { category: "backend", autoInstall: false, installCommand: "dotnet --version" },
  gleam: { category: "backend", autoInstall: false, installCommand: "https://gleam.run/getting-started/installing/" },
  gopls: { category: "backend", autoInstall: false, installCommand: "go install golang.org/x/tools/gopls@latest",
    serverCommand: ["gopls"],
  },
  hls: { category: "systems", autoInstall: false, installCommand: "ghcup install hls",
    serverCommand: ["haskell-language-server-wrapper", "--lsp"],
  },
  jdtls: { category: "backend", autoInstall: false, installCommand: "https://github.com/eclipse-jdtls/eclipse.jdt.ls" },
  julials: { category: "data", autoInstall: false, installCommand: "julia -e 'using Pkg; Pkg.add(\"LanguageServer\")'" },
  "kotlin-ls": { category: "mobile", autoInstall: true },
  "lua-ls": { category: "data", autoInstall: true },
  nixd: { category: "systems", autoInstall: false, installCommand: "nix profile install nixpkgs#nixd",
    serverCommand: ["nixd"],
  },
  "ocaml-lsp": { category: "systems", autoInstall: false, installCommand: "opam install ocaml-lsp-server",
    serverCommand: ["ocamllsp"],
  },
  oxlint: { category: "web", autoInstall: false, installCommand: "npm i -D oxlint" },
  "php intelephense": { category: "backend", autoInstall: true },
  prisma: { category: "data", autoInstall: false, installCommand: "npm i -D prisma" },
  pyright: { category: "backend", autoInstall: false, installCommand: "npm i -g pyright",
    serverCommand: ["pyright-langserver", "--stdio"],
  },
  razor: { category: "web", autoInstall: false, installCommand: "dotnet --version" },
  "ruby-lsp": { category: "backend", autoInstall: false, installCommand: "gem install ruby-lsp",
    serverCommand: ["ruby-lsp"],
  },
  rust: { category: "systems", autoInstall: false, installCommand: "rustup component add rust-analyzer",
    serverCommand: ["rust-analyzer"],
  },
  "sourcekit-lsp": { category: "mobile", autoInstall: false, installCommand: "xcode-select --install",
    serverCommand: ["sourcekit-lsp"],
  },
  svelte: { category: "web", autoInstall: true },
  terraform: { category: "data", autoInstall: true },
  tinymist: { category: "data", autoInstall: true },
  typescript: { category: "web", autoInstall: false, installCommand: "npm i -D typescript",
    serverCommand: ["typescript-language-server", "--stdio"],
  },
  vue: { category: "web", autoInstall: true },
  "yaml-ls": { category: "data", autoInstall: true },
  zls: { category: "systems", autoInstall: false, installCommand: "https://github.com/zigtools/zls",
    serverCommand: ["zls"],
  },
}

export const LSP_MARKETPLACE: LspMarketEntry[] = BUILTIN_LSP.map((entry) => {
  const meta = META[entry.name] ?? { category: "data", autoInstall: false }
  return { ...entry, ...meta }
})




const EXTENSIONS_BY_LANGUAGE: Record<string, string[]> = {
  astro: [".astro"],
  bash: [".sh", ".bash", ".zsh"],
  c: [".c", ".h"],
  "c++": [".cpp", ".cc", ".cxx", ".hpp"],
  csharp: [".cs"],
  css: [".css", ".scss", ".less"],
  clojure: [".clj", ".cljs", ".cljc"],
  dart: [".dart"],
  elixir: [".ex", ".exs"],
  go: [".go"],
  haskell: [".hs"],
  html: [".html", ".htm"],
  java: [".java"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  json: [".json"],
  julia: [".jl"],
  kotlin: [".kt", ".kts"],
  lua: [".lua"],
  markdown: [".md", ".mdx"],
  php: [".php"],
  python: [".py", ".pyi"],
  ruby: [".rb"],
  rust: [".rs"],
  scala: [".scala"],
  solidity: [".sol"],
  svelte: [".svelte"],
  swift: [".swift"],
  terraform: [".tf", ".tfvars"],
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  vue: [".vue"],
  yaml: [".yaml", ".yml"],
  zig: [".zig"],
}

function extensionsFor(languages: string[] | undefined): string[] {
  const result = new Set<string>()
  for (const language of languages ?? []) {
    for (const extension of EXTENSIONS_BY_LANGUAGE[language.toLowerCase()] ?? []) result.add(extension)
  }
  return [...result]
}

function categoryForLanguages(languages: string[] | undefined): LspMarketCategory {
  const set = new Set((languages ?? []).map((language) => language.toLowerCase()))
  if (["swift", "kotlin", "dart", "objective-c"].some((language) => set.has(language))) return "mobile"
  if (["c", "c++", "rust", "go", "zig", "haskell", "ocaml", "nix"].some((language) => set.has(language))) return "systems"
  if (["typescript", "javascript", "html", "css", "vue", "svelte", "astro"].some((language) => set.has(language))) return "web"
  if (["python", "java", "c#", "php", "ruby", "elixir", "clojure", "scala"].some((language) => set.has(language))) return "backend"
  return "data"
}

function installCommandFor(source: string | undefined): string | undefined {
  if (!source) return undefined
  const match = source.match(/^pkg:(npm|pypi|github)\/(.+?)(?:@[^@/]+)?$/)
  if (!match) return undefined
  const [, type, identifier] = match
  if (type === "npm") return `npm i -g ${decodeURIComponent(identifier as string)}`
  if (type === "pypi") return `pip install ${decodeURIComponent(identifier as string)}`
  return undefined
}

export function entriesFromLspRegistry(packages: MasonRegistryPackage[]): LspMarketEntry[] {
  const curated = new Map(LSP_MARKETPLACE.map((entry) => [entry.name.toLowerCase(), entry]))
  const result = [...LSP_MARKETPLACE]
  const seen = new Set(curated.keys())
  for (const pkg of packages) {
    const key = pkg.name.toLowerCase()
    if (seen.has(key)) continue
    const languages = pkg.languages ?? []
    const executable = Object.keys(pkg.bin ?? {})[0]
    result.push({
      name: pkg.name,
      extensions: extensionsFor(languages),
      requirements: [(pkg.description ?? "").replace(/\\n/g, "\n").trim(), languages.length ? languages.join(", ") : ""].filter(Boolean).join(" · ") || "Language server",
      category: categoryForLanguages(languages),
      autoInstall: false,
      installCommand: installCommandFor(pkg.source?.id),
      serverCommand: executable ? [executable] : undefined,
      source: pkg.sourceLabel ?? "Mason Registry",
    })
    seen.add(key)
  }
  return result
}
