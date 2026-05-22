const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  captureRegion: (rect) => ipcRenderer.invoke('capture-region', rect),
  cancel: () => ipcRenderer.send('cancel-overlay'),
  onReset: (cb) => ipcRenderer.on('reset-overlay', () => cb())
});
