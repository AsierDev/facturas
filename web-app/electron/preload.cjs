const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('facturasDesktop', {
  exportLegacySnapshot: (payload) => ipcRenderer.invoke('legacy:write-snapshot', payload),
  getLegacySnapshotPath: () => ipcRenderer.invoke('legacy:get-snapshot-path'),
  savePdf: (payload) => ipcRenderer.invoke('pdf:save', payload)
})
