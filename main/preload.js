
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  processMultiPDF: (data) => ipcRenderer.invoke('process-multi-pdf', data),
  cancelMultiPDF: () => ipcRenderer.invoke('cancel-multi-pdf'),
  applyPdfSecurity: (data) => ipcRenderer.invoke('apply-pdf-security', data),
  onProgress: (callback) => ipcRenderer.on('process-progress', (event, value) => callback(value)),
  convertUniversal: (data) => ipcRenderer.invoke('convert-universal', data),
  clearUniversalTemp: () => ipcRenderer.invoke('clear-universal-temp'),
  clearSecurityTemp: () => ipcRenderer.invoke('clear-security-temp'),
  exportFiles: (data) => ipcRenderer.invoke('export-files', data),
  // New-tools (additive expansion) bridges. Existing bridges above untouched.
  runNewTool: (payload) => ipcRenderer.invoke('run-new-tool', payload),
  cancelNewTool: (payload) => ipcRenderer.invoke('cancel-new-tool', payload),
  onNewToolProgress: (callback) => ipcRenderer.on('newtool-progress', (event, value) => callback(value)),
});
