const { contextBridge, ipcRenderer } = require('electron');

let _tokenCb = null;
ipcRenderer.on('claude-token', (_, chunk) => { if (_tokenCb) _tokenCb(chunk); });

contextBridge.exposeInMainWorld('claudebox', {
  // Capture
  newCapture:    () => ipcRenderer.send('new-capture'),
  addRegion:     () => ipcRenderer.send('add-region'),
  // Window controls
  closeWindow:   () => ipcRenderer.send('window-close'),
  minimiseWindow:() => ipcRenderer.send('window-minimise'),
  // Claude
  sendToClaude:  (prompt, imageDataUrls, capturedText) => ipcRenderer.invoke('send-to-claude', { prompt, imageDataUrls, capturedText }),
  clearConversation: () => ipcRenderer.send('clear-conversation'),
  // Config
  getConfig:     ()        => ipcRenderer.invoke('get-config'),
  saveConfig:    (updates) => ipcRenderer.invoke('save-config', updates),
  setModel:      (model)   => ipcRenderer.send('set-model', model),
  validateApiKey:(key)     => ipcRenderer.invoke('validate-api-key', key),
  // Updates
  installUpdate: () => ipcRenderer.send('install-update'),
  // Events
  onImageReady:        (cb) => ipcRenderer.on('image-ready',        (_, data)    => cb(data)),
  onImageAdded:        (cb) => ipcRenderer.on('image-added',        (_, data)    => cb(data)),
  onConversationReset: (cb) => ipcRenderer.on('conversation-reset', ()           => cb()),
  onClaudeToken:       (cb) => { _tokenCb = cb; },
  offClaudeToken:      ()   => { _tokenCb = null; },
  onTextReady:         (cb) => ipcRenderer.on('text-ready',         (_, text)    => cb(text)),
  onTextCaptureStatus: (cb) => ipcRenderer.on('text-capture-status',(_, status)  => cb(status)),
  onUpdateAvailable:   (cb) => ipcRenderer.on('update-available',   (_, version) => cb(version)),
  onUpdateDownloaded:  (cb) => ipcRenderer.on('update-downloaded',  (_, version) => cb(version)),
  onModelChanged:      (cb) => ipcRenderer.on('model-changed',      (_, model)   => cb(model)),
  onOpenSettings:      (cb) => ipcRenderer.on('open-settings',      ()           => cb())
});
