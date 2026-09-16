
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  processMultiPDF: (data) => ipcRenderer.invoke('process-multi-pdf', data),
  cancelMultiPDF: () => ipcRenderer.invoke('cancel-multi-pdf'),
  cancelSecurity: () => ipcRenderer.invoke('cancel-security'),
  cancelUniversal: () => ipcRenderer.invoke('cancel-universal'),
  applyPdfSecurity: (data) => ipcRenderer.invoke('apply-pdf-security', data),
  // Both subscriptions return an unsubscribe function so panels can clean
  // up on unmount instead of leaking duplicate listeners. Callers that
  // ignore the return value behave exactly as before.
  onProgress: (callback) => {
    const handler = (event, value) => callback(value);
    ipcRenderer.on('process-progress', handler);
    return () => ipcRenderer.removeListener('process-progress', handler);
  },
  convertUniversal: (data) => ipcRenderer.invoke('convert-universal', data),
  clearUniversalTemp: () => ipcRenderer.invoke('clear-universal-temp'),
  clearSecurityTemp: () => ipcRenderer.invoke('clear-security-temp'),
  exportFiles: (data) => ipcRenderer.invoke('export-files', data),
  // New-tools (additive expansion) bridges. Existing bridges above untouched.
  getFileData: (payload) => ipcRenderer.invoke('get-file-data', payload),
  runNewTool: (payload) => ipcRenderer.invoke('run-new-tool', payload),
  cancelNewTool: (payload) => ipcRenderer.invoke('cancel-new-tool', payload),
  onNewToolProgress: (callback) => {
    const handler = (event, value) => callback(value);
    ipcRenderer.on('newtool-progress', handler);
    return () => ipcRenderer.removeListener('newtool-progress', handler);
  },
});
