const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('facturasDesktopApi', {
  getPaths: () => ipcRenderer.invoke('app:paths'),
  migrationRun: (payload) => ipcRenderer.invoke('migration:run', payload),
  configGet: () => ipcRenderer.invoke('config:get'),
  configSet: (config) => ipcRenderer.invoke('config:set', config),
  invoiceList: () => ipcRenderer.invoke('invoice:list'),
  invoiceCreate: (draft) => ipcRenderer.invoke('invoice:create', draft),
  invoiceDelete: (id) => ipcRenderer.invoke('invoice:delete', id),
  pdfSave: (payload) => ipcRenderer.invoke('pdf:save', payload),
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: () => ipcRenderer.invoke('backup:import')
})
