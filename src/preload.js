const { contextBridge, ipcRenderer } = require('electron');

let _tokenCb = null;
ipcRenderer.on('claude-token', (_, chunk) => { if (_tokenCb) _tokenCb(chunk); });

contextBridge.exposeInMainWorld('claudebox', {
  // Capture
  newCapture:    () => ipcRenderer.send('new-capture'),
  // Window controls
  closeWindow:   () => ipcRenderer.send('window-close'),
  minimiseWindow:() => ipcRenderer.send('window-minimise'),
  // Claude
  sendToClaude:  (prompt, imageDataUrl) => ipcRenderer.invoke('send-to-claude', { prompt, imageDataUrl }),
  clearConversation: () => ipcRenderer.send('clear-conversation'),
  // Config
  getConfig:     ()       => ipcRenderer.invoke('get-config'),
  saveConfig:    (updates)=> ipcRenderer.invoke('save-config', updates),
  setModel:      (model)  => ipcRenderer.send('set-model', model),
  validateApiKey:(key)    => ipcRenderer.invoke('validate-api-key', key),
  // Events
  onImageReady:      (cb) => ipcRenderer.on('image-ready',       (_, data) => cb(data)),
  onConversationReset:(cb) => ipcRenderer.on('conversation-reset',()       => cb()),
  onClaudeToken:     (cb) => { _tokenCb = cb; },
  offClaudeToken:    ()   => { _tokenCb = null; }
});
