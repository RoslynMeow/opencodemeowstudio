import type {
  Agent,
  Command,
  Event,
  FileDiff,
  LspStatus,
  McpStatus,
  Message,
  Part,
  Permission,
  ProviderAuthMethod,
  Session,
  SessionStatus,
} from "@opencode-ai/sdk"

export type {
  Agent,
  Command,
  Event,
  FileDiff,
  LspStatus,
  McpStatus,
  Message,
  Part,
  Permission,
  ProviderAuthMethod,
  Session,
  SessionStatus,
}

export type Profile = "global" | "isolated"
export type ConfigScope = "project" | "global"
export type Theme = "dark" | "light" | "system"
export type AppLanguage = "system" | "en" | "zh-CN"
export type StudioModuleId = "files" | "git"
export type BackendState = "stopped" | "starting" | "running" | "error"
export type RuntimeState = "idle" | "checking" | "downloading" | "extracting" | "ready" | "error"

export interface Project {
  id: string
  name: string
  path: string
  addedAt: number
  lastOpenedAt?: number
}

export interface ModelRef {
  providerID: string
  modelID: string
}

export type MarketSourceKind = "mcp-registry" | "mcp-json" | "mason-github" | "mason-json"

export interface MarketSource {
  id: string
  label: string
  kind: MarketSourceKind
  url: string
  enabled: boolean
  priority: number
  headers?: Record<string, string>
}

export interface MarketSources {
  mcp: MarketSource[]
  lsp: MarketSource[]
}

export interface Settings {
  profile: Profile
  runtimeVersion: string
  autoDownload: boolean
  theme: Theme
  language: AppLanguage
  layoutMode: "pages" | "sidebar"
  sidebarWidth: number
  enabledModules: StudioModuleId[]
  sessionWorktrees: boolean
  singleWriterLock: boolean
  marketSources: MarketSources
  lastProjectId?: string
  lastModels: Record<string, ModelRef>
  lastAgents: Record<string, string>
}

export interface RuntimeStatus {
  state: RuntimeState
  version?: string
  binaryPath?: string
  source?: "downloaded" | "cache" | "system" | "override"
  received?: number
  total?: number
  error?: string
}

export interface BackendStatus {
  state: BackendState
  url?: string
  port?: number
  pid?: number
  error?: string
  version?: string
}

export interface ConfigPaths {
  globalDir: string
  globalFile: string
  projectFile: string | null
  globalPlugins: string
  projectPlugins: string | null
  projectPath: string | null
}

export interface AppState {
  appVersion: string
  platform: string
  locale: string
  userDataDir: string
  projects: Project[]
  activeProjectId: string | null
  activeProject: Project | null
  settings: Settings
  runtime: RuntimeStatus
  backend: BackendStatus
  configPaths: ConfigPaths
}

export interface ModelInfo {
  id: string
  name: string
  providerID: string
  reasoning?: boolean
  attachment?: boolean
  toolCall?: boolean
  contextLimit?: number
  outputLimit?: number
  cost?: { input: number; output: number }
}

export interface ProviderInfo {
  id: string
  name: string
  source?: string
  env: string[]
  connected: boolean
  models: ModelInfo[]
}

export interface ProviderCatalog {
  providers: ProviderInfo[]
  available: Array<{ id: string; name: string; env: string[] }>
  defaultModel?: ModelRef
  totalProviders: number
}

export interface AgentInfo {
  name: string
  description?: string
  mode: Agent["mode"]
  builtin: boolean
  model?: ModelRef
}

export interface SessionEntry {
  info: Message
  parts: Part[]
}

export interface FileNodeInfo {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

export interface GitFileStatus {
  path: string
  index: string
  worktree: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  status: string
}

export interface GitInfo {
  isRepo: boolean
  root?: string
  branch?: string
  upstream?: string
  ahead?: number
  behind?: number
  clean: boolean
  staged: GitFileStatus[]
  unstaged: GitFileStatus[]
  gitAvailable?: boolean
  gitVersion?: string
  remoteUrl?: string
  githubUrl?: string
  conflicts?: string[]
  operation?: "merge" | "rebase" | null
  stashCount?: number
}

export interface GitDiffContent {
  before: string
  after: string
}

export interface GitEnvironment {
  available: boolean
  version?: string
  path?: string
  platform: string
  canAutoInstall: boolean
}

export interface GitInstallResult {
  ok: boolean
  output: string
  environment: GitEnvironment
  manualUrl?: string
}

export interface GitRef {
  name: string
  kind: "head" | "local" | "remote" | "tag"
}

export interface GitCommit {
  hash: string
  shortHash: string
  parents: string[]
  author: string
  authorEmail: string
  timestamp: number
  subject: string
  refs: GitRef[]
}

export interface GitGraphData {
  commits: GitCommit[]
  head: string | null
  branch: string | null
  remoteNames: string[]
  truncated: boolean
}

export interface GitCommitFile {
  path: string
  status: string
  additions: number
  deletions: number
}

export interface GitCommitDetail {
  commit: GitCommit
  body: string
  committer: string
  committerEmail: string
  commitTimestamp: number
  files: GitCommitFile[]
  insertions: number
  deletions: number
}

export interface GitBranch {
  name: string
  current: boolean
  upstream?: string
  remote?: boolean
}

export interface GitBranches {
  local: GitBranch[]
  remotes: GitBranch[]
  current: string | null
}

export interface GitRemote {
  name: string
  url: string
  defaultBranch?: string
  github?: {
    owner: string
    repo: string
    url: string
  }
}

export interface GitOperationResult {
  ok: boolean
  output: string
  info: GitInfo
}


export interface FileContentInfo {
  path: string
  absolute: string
  type: "text" | "binary"
  content: string
  truncated: boolean
  mimeType?: string
}

export type WorktreeStatus = "active" | "merged" | "conflict" | "missing"

export interface WorktreeInfo {
  sessionId: string
  projectId: string
  path: string
  branch: string
  baseBranch: string
  status: WorktreeStatus
  createdAt: number
  updatedAt: number
  mergedAt?: number
  commit?: string
  error?: string
}

export interface MergeInfo {
  id: string
  projectId: string
  sessionId: string
  sourceBranch: string
  targetBranch: string
  status: "merged" | "conflict" | "failed"
  commit?: string
  message?: string
  createdAt: number
  updatedAt: number
}

export interface WorktreeView {
  isRepo: boolean
  mainBranch?: string
  worktrees: WorktreeInfo[]
  merges: MergeInfo[]
}

export interface WorktreeMergeResult {
  ok: boolean
  status: WorktreeStatus
  output: string
  worktree: WorktreeInfo
  merge: MergeInfo
}

export interface SessionUsage {
  sessionID: string
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
  agent?: string
  model?: ModelRef
  messages: number
  completed: boolean
}

export interface ChatInput {
  sessionId: string
  text: string
  providerID?: string
  modelID?: string
  agent?: string
}

export interface CommandInput extends ChatInput {
  command: string
  arguments: string
}

export interface PermissionReply {
  sessionId: string
  permissionId: string
  response: "once" | "always" | "reject"
}

export interface RawConfig {
  scope: ConfigScope
  path: string
  exists: boolean
  content: string
  parsed: Record<string, unknown>
}

export interface McpLocalConfig {
  type: "local"
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export interface McpRemoteOAuth {
  clientId?: string
  clientSecret?: string
  scope?: string
}

export interface McpRemoteConfig {
  type: "remote"
  url: string
  enabled?: boolean
  headers?: Record<string, string>
  oauth?: false | McpRemoteOAuth
  timeout?: number
}

export type McpConfig = McpLocalConfig | McpRemoteConfig

export interface McpRegistryHeader {
  name: string
  description?: string
  isRequired?: boolean
  isSecret?: boolean
  default?: string
}

export interface McpRegistryPackage {
  registryType?: string
  identifier?: string
  version?: string
  runtimeHint?: string
  transport?: { type?: string }
  runtimeArguments?: Array<{ value?: string; type?: string; name?: string }>
  environmentVariables?: Array<{
    name: string
    description?: string
    isRequired?: boolean
    isSecret?: boolean
    default?: string
  }>
}

export interface McpRegistryServer {
  name: string
  title?: string
  description?: string
  version?: string
  websiteUrl?: string
  repository?: { url?: string; source?: string }
  remotes?: Array<{ type?: string; url?: string; headers?: McpRegistryHeader[] }>
  packages?: McpRegistryPackage[]
  sourceLabel?: string
}

export interface McpRegistryMarket {
  entries: McpRegistryServer[]
  fetchedAt: number
  source: string
  errors?: string[]
}

export interface MasonRegistryPackage {
  name: string
  description?: string
  homepage?: string
  languages?: string[]
  categories?: string[]
  licenses?: string[]
  source?: { id?: string; extra_packages?: string }
  bin?: Record<string, string>
  neovim?: { lspconfig?: string }
  sourceLabel?: string
}

export interface LspRegistryMarket {
  entries: MasonRegistryPackage[]
  fetchedAt: number
  source: string
  errors?: string[]
}

export interface McpEntry {
  name: string
  scope: ConfigScope | "inherited"
  config: McpConfig
  status?: McpStatus
}

export interface McpViewData {
  entries: McpEntry[]
  statuses: Record<string, McpStatus>
  projectFile: string | null
  globalFile: string
}

export interface LspConfig {
  disabled?: boolean
  command?: string[]
  extensions?: string[]
  env?: Record<string, string>
  initialization?: Record<string, unknown>
}

export interface LspEntry {
  name: string
  scope: ConfigScope | "inherited"
  config: LspConfig
}

export interface LspViewData {
  enabled: boolean
  entries: LspEntry[]
  statuses: LspStatus[]
  projectFile: string | null
  globalFile: string
}

export interface LocalPlugin {
  name: string
  fileName: string
  path: string
  scope: ConfigScope
  enabled: boolean
  size: number
  modified: number
}

export interface NpmPlugin {
  name: string
  scope: ConfigScope
}

export interface PluginViewData {
  npm: NpmPlugin[]
  local: LocalPlugin[]
  projectPluginsDir: string | null
  globalPluginsDir: string
}

export interface OllamaModel {
  name: string
  size?: number
  parameterSize?: string
  quantization?: string
}

export interface OllamaInfo {
  reachable: boolean
  baseUrl: string
  version?: string
  models: OllamaModel[]
  error?: string
}

export interface ProviderOAuthStart {
  url: string
  method: "auto" | "code"
  instructions: string
}

export interface McpAuthStart {
  url: string
  instructions?: string
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"
  | "disabled"

export interface UpdateStatus {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  percent?: number
  message?: string
  releaseDate?: string
  portable?: boolean
}

export interface StudioEventEnvelope {
  directory: string
  event: Event
}

export type StudioEvent =
  | { type: "state"; state: AppState }
  | { type: "backend"; status: BackendStatus }
  | { type: "runtime"; status: RuntimeStatus }
  | { type: "opencode"; payload: StudioEventEnvelope }
  | { type: "log"; line: string }
  | { type: "update"; status: UpdateStatus }
  | { type: "toast"; level: "info" | "success" | "error"; message: string }

export interface BuiltinLsp {
  name: string
  extensions: string[]
  requirements: string
}

export const DEFAULT_RUNTIME_VERSION = "1.19.3"

export const BUILTIN_LSP: BuiltinLsp[] = [
  { name: "astro", extensions: [".astro"], requirements: "Auto-installs for Astro projects" },
  { name: "bash", extensions: [".sh", ".bash", ".zsh", ".ksh"], requirements: "Auto-installs bash-language-server" },
  { name: "clangd", extensions: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp"], requirements: "Auto-installs for C/C++ projects" },
  { name: "csharp", extensions: [".cs", ".csx"], requirements: ".NET SDK installed" },
  { name: "clojure-lsp", extensions: [".clj", ".cljs", ".cljc", ".edn"], requirements: "clojure-lsp command available" },
  { name: "dart", extensions: [".dart"], requirements: "dart command available" },
  { name: "deno", extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"], requirements: "deno command available" },
  { name: "elixir-ls", extensions: [".ex", ".exs"], requirements: "elixir command available" },
  { name: "eslint", extensions: [".ts", ".tsx", ".js", ".jsx", ".vue"], requirements: "eslint dependency in project" },
  { name: "fsharp", extensions: [".fs", ".fsi", ".fsx"], requirements: ".NET SDK installed" },
  { name: "gleam", extensions: [".gleam"], requirements: "gleam command available" },
  { name: "gopls", extensions: [".go"], requirements: "go command available" },
  { name: "hls", extensions: [".hs", ".lhs"], requirements: "haskell-language-server-wrapper available" },
  { name: "jdtls", extensions: [".java"], requirements: "Java SDK 21+ installed" },
  { name: "julials", extensions: [".jl"], requirements: "julia + LanguageServer.jl" },
  { name: "kotlin-ls", extensions: [".kt", ".kts"], requirements: "Auto-installs for Kotlin projects" },
  { name: "lua-ls", extensions: [".lua"], requirements: "Auto-installs for Lua projects" },
  { name: "nixd", extensions: [".nix"], requirements: "nixd command available" },
  { name: "ocaml-lsp", extensions: [".ml", ".mli"], requirements: "ocamllsp command available" },
  { name: "oxlint", extensions: [".ts", ".tsx", ".js", ".jsx", ".svelte", ".astro"], requirements: "oxlint dependency in project" },
  { name: "php intelephense", extensions: [".php"], requirements: "Auto-installs for PHP projects" },
  { name: "prisma", extensions: [".prisma"], requirements: "prisma command available" },
  { name: "pyright", extensions: [".py", ".pyi"], requirements: "pyright dependency installed" },
  { name: "ruby-lsp", extensions: [".rb", ".rake", ".gemspec", ".ru"], requirements: "ruby + gem available" },
  { name: "rust", extensions: [".rs"], requirements: "rust-analyzer command available" },
  { name: "svelte", extensions: [".svelte"], requirements: "Auto-installs for Svelte projects" },
  { name: "terraform", extensions: [".tf", ".tfvars"], requirements: "Auto-installs from GitHub releases" },
  { name: "tinymist", extensions: [".typ", ".typc"], requirements: "Auto-installs from GitHub releases" },
  { name: "typescript", extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"], requirements: "typescript dependency in project" },
  { name: "vue", extensions: [".vue"], requirements: "Auto-installs for Vue projects" },
  { name: "yaml-ls", extensions: [".yaml", ".yml"], requirements: "Auto-installs Red Hat yaml-language-server" },
  { name: "zls", extensions: [".zig", ".zon"], requirements: "zig command available" },
]

export const MCP_PRESETS: Array<{ label: string; description: string; config: McpConfig }> = [
  {
    label: "Filesystem",
    description: "Read and write files outside the project sandbox",
    config: { type: "local", command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."], enabled: true },
  },
  {
    label: "Everything (test)",
    description: "Reference MCP server that exposes every capability",
    config: { type: "local", command: ["npx", "-y", "@modelcontextprotocol/server-everything"], enabled: true },
  },
  {
    label: "Context7",
    description: "Up-to-date library documentation",
    config: { type: "remote", url: "https://mcp.context7.com/mcp", enabled: true },
  },
  {
    label: "Grep by Vercel",
    description: "Search code examples on GitHub",
    config: { type: "remote", url: "https://mcp.grep.app", enabled: true },
  },
  {
    label: "Sentry",
    description: "Query Sentry projects and issues (OAuth)",
    config: { type: "remote", url: "https://mcp.sentry.dev/mcp", oauth: {}, enabled: true },
  },
]

export interface RpcMap {
  "app.state": { args: []; result: AppState }
  "app.updateSettings": { args: [patch: Partial<Settings>]; result: AppState }
  "app.restartBackend": { args: []; result: AppState }
  "app.reloadConfig": { args: []; result: boolean }
  "app.pickProject": { args: []; result: string | null }
  "app.openPath": { args: [target: string]; result: void }
  "app.showItem": { args: [target: string]; result: void }
  "app.openExternal": { args: [url: string]; result: void }
  "app.openTerminal": { args: [path?: string]; result: void }
  "app.openCrashReports": { args: []; result: void }
  "app.logs": { args: []; result: string[] }
  "app.updateStatus": { args: []; result: UpdateStatus }
  "app.checkUpdates": { args: []; result: UpdateStatus }
  "app.downloadUpdate": { args: []; result: UpdateStatus }
  "app.installUpdate": { args: []; result: boolean }
  "app.clearLogs": { args: []; result: void }

  "runtime.ensure": { args: [force?: boolean]; result: AppState }
  "runtime.versions": { args: []; result: { installed: string[]; latest?: string } }

  "project.add": { args: [path: string]; result: AppState }
  "project.remove": { args: [id: string]; result: AppState }
  "project.activate": { args: [id: string]; result: AppState }
  "project.rename": { args: [id: string, name: string]; result: AppState }

  "provider.catalog": { args: []; result: ProviderCatalog }
  "provider.agents": { args: []; result: AgentInfo[] }
  "provider.authMethods": { args: []; result: Record<string, ProviderAuthMethod[]> }
  "provider.setApiKey": { args: [id: string, key: string]; result: boolean }
  "provider.oauthAuthorize": { args: [id: string, method: number]; result: ProviderOAuthStart }
  "provider.oauthCallback": { args: [id: string, method: number, code?: string]; result: boolean }
  "provider.ollamaDetect": { args: [baseUrl?: string]; result: OllamaInfo }
  "provider.ollamaInstall": { args: [scope: ConfigScope, baseUrl: string, models: string[]]; result: RawConfig }

  "session.list": { args: []; result: Session[] }
  "session.create": { args: [title?: string]; result: Session }
  "session.focus": { args: [id: string]; result: string }
  "session.delete": { args: [id: string]; result: boolean }
  "session.deleteTree": { args: [id: string]; result: boolean }
  "session.update": { args: [id: string, title: string]; result: Session }
  "session.messages": { args: [id: string]; result: SessionEntry[] }
  "session.revert": { args: [id: string, messageID: string]; result: Session }
  "session.unrevert": { args: [id: string]; result: Session }
  "session.usage": { args: [ids: string[]]; result: Record<string, SessionUsage> }
  "file.list": { args: [path: string]; result: FileNodeInfo[] }
  "file.read": { args: [path: string]; result: FileContentInfo }
  "file.write": { args: [path: string, content: string]; result: void }
  "file.find": { args: [query: string]; result: string[] }
  "git.info": { args: []; result: GitInfo }
  "git.environment": { args: []; result: GitEnvironment }
  "git.install": { args: []; result: GitInstallResult }
  "git.init": { args: []; result: GitOperationResult }
  "git.graph": { args: [limit?: number]; result: GitGraphData }
  "git.commitDetail": { args: [hash: string]; result: GitCommitDetail }
  "git.branches": { args: []; result: GitBranches }
  "git.remotes": { args: []; result: GitRemote[] }
  "git.fetch": { args: []; result: GitOperationResult }
  "git.pull": { args: []; result: GitOperationResult }
  "git.push": { args: []; result: GitOperationResult }
  "git.checkout": { args: [branch: string]; result: GitOperationResult }
  "git.createBranch": { args: [name: string]; result: GitOperationResult }
  "git.merge": { args: [branch: string]; result: GitOperationResult }
  "git.rebase": { args: [branch: string]; result: GitOperationResult }
  "git.abort": { args: []; result: GitOperationResult }
  "git.continue": { args: []; result: GitOperationResult }
  "git.stash": { args: [message?: string]; result: GitOperationResult }
  "git.stashPop": { args: []; result: GitOperationResult }
  "git.tag": { args: [name: string]; result: GitOperationResult }
  "git.deleteBranch": { args: [name: string]; result: GitOperationResult }
  "git.stage": { args: [paths: string[]]; result: GitInfo }
  "git.unstage": { args: [paths: string[]]; result: GitInfo }
  "git.commit": { args: [message: string]; result: { ok: boolean; info: GitInfo; output: string } }
  "git.diff": { args: [path: string, staged: boolean]; result: GitDiffContent }
  "session.diff": { args: [id: string]; result: FileDiff[] }
  "session.abort": { args: [id: string]; result: boolean }
  "session.status": { args: []; result: Record<string, SessionStatus> }
  "worktree.list": { args: []; result: WorktreeView }
  "worktree.merge": { args: [sessionId: string]; result: WorktreeMergeResult }
  "worktree.remove": { args: [sessionId: string]; result: WorktreeView }

  "chat.send": { args: [input: ChatInput]; result: void }
  "chat.command": { args: [input: CommandInput]; result: void }
  "command.list": { args: []; result: Command[] }
  "permission.reply": { args: [input: PermissionReply]; result: boolean }

  "config.read": { args: [scope: ConfigScope]; result: RawConfig }
  "config.write": { args: [scope: ConfigScope, content: string]; result: RawConfig }
  "config.patch": { args: [scope: ConfigScope, path: (string | number)[], value: unknown]; result: RawConfig }
  "config.remove": { args: [scope: ConfigScope, path: (string | number)[]]; result: RawConfig }
  "config.effective": { args: []; result: Record<string, unknown> }
  "config.paths": { args: []; result: ConfigPaths }
  "market.mcp": { args: [force?: boolean]; result: McpRegistryMarket }
  "market.lsp": { args: [force?: boolean]; result: LspRegistryMarket }

  "mcp.view": { args: []; result: McpViewData }
  "mcp.save": { args: [scope: ConfigScope, name: string, config: McpConfig]; result: McpViewData }
  "mcp.remove": { args: [scope: ConfigScope, name: string]; result: McpViewData }
  "mcp.toggle": { args: [scope: ConfigScope, name: string, enabled: boolean]; result: McpViewData }
  "mcp.connect": { args: [name: string]; result: boolean }
  "mcp.disconnect": { args: [name: string]; result: boolean }
  "mcp.authStart": { args: [name: string]; result: McpAuthStart }
  "mcp.authCallback": { args: [name: string, code?: string]; result: boolean }
  "mcp.authRemove": { args: [name: string]; result: boolean }

  "lsp.view": { args: []; result: LspViewData }
  "lsp.setEnabled": { args: [scope: ConfigScope, enabled: boolean]; result: LspViewData }
  "lsp.save": { args: [scope: ConfigScope, name: string, config: LspConfig]; result: LspViewData }
  "lsp.remove": { args: [scope: ConfigScope, name: string]; result: LspViewData }
  "lsp.toggle": { args: [scope: ConfigScope, name: string, disabled: boolean]; result: LspViewData }

  "plugin.view": { args: []; result: PluginViewData }
  "plugin.add": { args: [scope: ConfigScope, name: string]; result: PluginViewData }
  "plugin.remove": { args: [scope: ConfigScope, name: string]; result: PluginViewData }
  "plugin.setLocalEnabled": { args: [scope: ConfigScope, fileName: string, enabled: boolean]; result: PluginViewData }
  "plugin.openFolder": { args: [scope: ConfigScope]; result: void }
  "plugin.createLocal": { args: [scope: ConfigScope, fileName: string, content: string]; result: PluginViewData }
}

export type RpcName = keyof RpcMap
export type RpcArgs<K extends RpcName> = RpcMap[K]["args"]
export type RpcResult<K extends RpcName> = RpcMap[K]["result"]

export interface StudioApi {
  rpc<K extends RpcName>(method: K, ...args: RpcArgs<K>): Promise<RpcResult<K>>
  onEvent(listener: (event: StudioEvent) => void): () => void
  platform: string
  versions: { electron: string; chrome: string; node: string }
}
