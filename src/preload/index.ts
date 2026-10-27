import { contextBridge, ipcRenderer } from "electron"
import type { RpcArgs, RpcName, RpcResult, StudioApi, StudioEvent } from "@shared/types"

interface RpcErrorEnvelope {
  __meowstudioRpcError: string
}

function isRpcError(value: unknown): value is RpcErrorEnvelope {
  return Boolean(value && typeof value === "object" && typeof (value as RpcErrorEnvelope).__meowstudioRpcError === "string")
}

const api: StudioApi = {
  async rpc<K extends RpcName>(method: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
    const result = (await ipcRenderer.invoke("studio:rpc", method, args)) as unknown
    if (isRpcError(result)) throw new Error(result.__meowstudioRpcError)
    return result as RpcResult<K>
  },
  onEvent(listener: (event: StudioEvent) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: StudioEvent) => listener(payload)
    ipcRenderer.on("studio:event", handler)
    return () => ipcRenderer.removeListener("studio:event", handler)
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? "",
    chrome: process.versions.chrome ?? "",
    node: process.versions.node ?? "",
  },
}

contextBridge.exposeInMainWorld("studio", api)
