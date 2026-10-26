import { contextBridge, ipcRenderer } from "electron"
import type { RpcArgs, RpcName, RpcResult, StudioApi, StudioEvent } from "@shared/types"

const api: StudioApi = {
  rpc<K extends RpcName>(method: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
    return ipcRenderer.invoke("studio:rpc", method, args) as Promise<RpcResult<K>>
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
