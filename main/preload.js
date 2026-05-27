
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  processMultiPDF: (data) => ipcRenderer.invoke('process-multi-pdf', data),
  applyPdfSecurity: (data) => ipcRenderer.invoke('apply-pdf-security', data),
  onProgress: (callback) => ipcRenderer.on('process-progress', (event, value) => callback(value)),
  convertUniversal: (data) => ipcRenderer.invoke('convert-universal', data),
  clearUniversalTemp: () => ipcRenderer.invoke('clear-universal-temp'),
  clearSecurityTemp: () => ipcRenderer.invoke('clear-security-temp'),
  exportFiles: (data) => ipcRenderer.invoke('export-files', data),
});
