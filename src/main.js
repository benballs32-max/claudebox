require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  app, BrowserWindow, ipcMain, screen,
  globalShortcut, Tray, Menu, nativeImage, desktopCapturer, clipboard
} = require('electron');
const path = require('path');
const fs   = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { autoUpdater } = require('electron-updater');

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: 'claude-sonnet-4-6',
  systemPrompt: '',
  triggerShortcut: 'CommandOrControl+Shift+Space',
  textTriggerShortcut: 'CommandOrControl+Shift+T',
  presets: [
    { label: 'Explain',   prompt: 'Explain what you see in this image.' },
    { label: 'Fix this',  prompt: "What's wrong here and how would you fix it?" },
    { label: 'Summarise', prompt: 'Summarise the key points concisely.' },
    { label: 'Translate', prompt: 'Translate any text in this image to English.' }
  ]
};

let config = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config = { ...DEFAULT_CONFIG, ...saved };
      if (!Array.isArray(config.presets) || !config.presets.length) {
        config.presets = DEFAULT_CONFIG.presets;
      }
    }
  } catch (e) {
    console.error('Config load error:', e);
    config = { ...DEFAULT_CONFIG };
  }
  if (!config.apiKey) config.apiKey = process.env.ANTHROPIC_API_KEY || '';
}

function saveConfig(updates) {
  config = { ...config, ...updates };
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Config save error:', e);
  }
}

// ─── Anthropic client ─────────────────────────────────────────────────────────

let client = null;
let clientApiKey = null;

function getClient() {
  if (!client || clientApiKey !== config.apiKey) {
    client = new Anthropic({ apiKey: config.apiKey });
    clientApiKey = config.apiKey;
  }
  return client;
}

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow          = null;
let overlayWindows      = [];
let tray                = null;
let capturedImages      = [];
let isAddingRegion      = false;
let conversationHistory = [];

// ─── Main window ──────────────────────────────────────────────────────────────

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 700, height: 620,
    minWidth: 500, minHeight: 450,
    frame: false, transparent: false,
    alwaysOnTop: true, skipTaskbar: false,
    resizable: true, show: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (e) => { e.preventDefault(); mainWindow.hide(); });

  mainWindow.on('hide', () => {
    conversationHistory = [];
    capturedImages      = [];
    isAddingRegion      = false;
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('conversation-reset');
    }
  });
}

// ─── Overlays — one per display, kept alive ───────────────────────────────────

function createOverlays() {
  screen.getAllDisplays().forEach((display) => {
    const win = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y,
      width: display.bounds.width, height: display.bounds.height,
      frame: false, transparent: true, alwaysOnTop: true,
      skipTaskbar: true, resizable: false, movable: false,
      focusable: true, show: false,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true,
        preload: path.join(__dirname, 'preload-overlay.js')
      }
    });
    win.loadFile(path.join(__dirname, 'overlay.html'), {
      query: {
        displayX: String(display.bounds.x),
        displayY: String(display.bounds.y)
      }
    });
    overlayWindows.push(win);
  });
}

function destroyOverlays() {
  overlayWindows.forEach(w => { if (!w.isDestroyed()) w.close(); });
  overlayWindows = [];
}

function recreateOverlays() { destroyOverlays(); createOverlays(); }

function showOverlays() {
  overlayWindows.forEach(w => {
    if (!w.isDestroyed()) { w.webContents.send('reset-overlay'); w.show(); }
  });
  const nearest = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const displays = screen.getAllDisplays();
  const idx = displays.findIndex(d => d.id === nearest.id);
  const target = overlayWindows[idx] || overlayWindows[0];
  if (target && !target.isDestroyed()) target.focus();
}

function hideOverlays() {
  overlayWindows.forEach(w => { if (!w.isDestroyed()) w.hide(); });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const modelLabels = {
    'claude-haiku-4-5-20251001': 'Haiku 4.5',
    'claude-sonnet-4-6':         'Sonnet 4.6',
    'claude-opus-4-7':           'Opus 4.7'
  };

  const modelItems = Object.entries(modelLabels).map(([id, label]) => ({
    label,
    type:    'radio',
    checked: config.model === id,
    click:   () => {
      saveConfig({ model: id });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('model-changed', id);
      }
      buildTrayMenu();
    }
  }));

  const menu = Menu.buildFromTemplate([
    { label: `Snip  [${config.triggerShortcut}]`,     click: () => triggerCapture() },
    { label: `Text  [${config.textTriggerShortcut}]`, click: () => triggerTextCapture() },
    { type: 'separator' },
    { label: 'Model', submenu: modelItems },
    {
      label: 'Settings',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
        const send = () => mainWindow.webContents.send('open-settings');
        if (mainWindow.webContents.isLoading()) {
          mainWindow.webContents.once('did-finish-load', send);
        } else {
          send();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('ClaudeBox — ZavTech AI');
  tray.on('click', () => triggerCapture());
  buildTrayMenu();
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const snapOk = globalShortcut.register(config.triggerShortcut,     () => triggerCapture());
  const textOk = globalShortcut.register(config.textTriggerShortcut, () => triggerTextCapture());
  if (!snapOk) console.error('Snip shortcut failed to register:', config.triggerShortcut);
  if (!textOk) console.error('Text shortcut failed to register:', config.textTriggerShortcut);
}

// ─── Capture flow ─────────────────────────────────────────────────────────────

function triggerCapture() {
  conversationHistory = [];
  capturedImages      = [];
  isAddingRegion      = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('conversation-reset');
  }
  showOverlays();
}

function triggerTextCapture() {
  conversationHistory = [];
  capturedImages      = [];
  isAddingRegion      = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('conversation-reset');
  }

  const text = clipboard.readText();

  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();

  const send = () => {
    if (!text || !text.trim()) {
      mainWindow.webContents.send('text-capture-status', 'empty');
    } else {
      mainWindow.webContents.send('text-ready', text);
    }
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }

  mainWindow.show();
  mainWindow.focus();
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload       = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger             = { info: console.log, warn: console.warn, error: console.error };

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => console.error('Update check failed:', err.message));
  }, 4000);
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => ({ ...config }));

ipcMain.handle('save-config', (_, updates) => {
  const shortcutChanged = updates.triggerShortcut || updates.textTriggerShortcut;
  const prevShortcuts   = { triggerShortcut: config.triggerShortcut, textTriggerShortcut: config.textTriggerShortcut };

  saveConfig(updates);

  if (shortcutChanged) {
    try {
      registerShortcuts();
    } catch (e) {
      saveConfig(prevShortcuts);
      registerShortcuts();
      return { success: false, error: 'Shortcut already in use or invalid' };
    }
  }

  buildTrayMenu();
  return { success: true };
});

ipcMain.on('set-model', (_, model) => {
  saveConfig({ model });
  buildTrayMenu();
});

ipcMain.handle('validate-api-key', async (_, apiKey) => {
  try {
    const testClient = new Anthropic({ apiKey });
    await testClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }]
    });
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
});

ipcMain.handle('capture-region', async (_, rect) => {
  try {
    hideOverlays();

    const displays = screen.getAllDisplays();
    const cx = rect.x + rect.width  / 2;
    const cy = rect.y + rect.height / 2;
    const targetDisplay = displays.find(d =>
      cx >= d.bounds.x && cx < d.bounds.x + d.bounds.width &&
      cy >= d.bounds.y && cy < d.bounds.y + d.bounds.height
    ) || displays[0];

    const scale = targetDisplay.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width:  Math.round(targetDisplay.bounds.width  * scale),
        height: Math.round(targetDisplay.bounds.height * scale)
      }
    });

    const displayIndex = displays.indexOf(targetDisplay);
    const source =
      sources.find(s => String(s.display_id) === String(targetDisplay.id)) ||
      sources[displayIndex] || sources[0];

    if (!source) throw new Error('No screen source found');

    const cropped = source.thumbnail.crop({
      x:      Math.max(0, Math.round((rect.x - targetDisplay.bounds.x) * scale)),
      y:      Math.max(0, Math.round((rect.y - targetDisplay.bounds.y) * scale)),
      width:  Math.max(1, Math.round(rect.width  * scale)),
      height: Math.max(1, Math.round(rect.height * scale))
    });

    const dataUrl = cropped.toDataURL();
    const adding  = isAddingRegion;
    isAddingRegion = false;

    if (adding) {
      capturedImages.push(dataUrl);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('image-added', dataUrl);
      }
    } else {
      capturedImages = [dataUrl];

      if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();

      const send = () => mainWindow.webContents.send('image-ready', dataUrl);
      if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', send);
      } else {
        send();
      }

      mainWindow.show();
      mainWindow.focus();
    }

    return dataUrl;
  } catch (err) {
    console.error('Capture error:', err);
    isAddingRegion = false;
    return null;
  }
});

ipcMain.on('add-region', () => {
  isAddingRegion = true;
  showOverlays();
});

ipcMain.on('cancel-overlay', () => {
  isAddingRegion = false;
  hideOverlays();
});

ipcMain.handle('send-to-claude', async (_, { prompt, imageDataUrls, capturedText }) => {
  try {
    const userContent = [];

    if (conversationHistory.length === 0) {
      const images = Array.isArray(imageDataUrls)
        ? imageDataUrls
        : (imageDataUrls ? [imageDataUrls] : []);

      if (images.length > 0) {
        images.forEach(dataUrl => {
          const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          userContent.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: base64Data }
          });
        });
      } else if (capturedText) {
        userContent.push({
          type: 'text',
          text: `Captured text:\n\`\`\`\n${capturedText}\n\`\`\``
        });
      }
    }

    userContent.push({ type: 'text', text: prompt });
    conversationHistory.push({ role: 'user', content: userContent });

    let fullText = '';
    const streamParams = {
      model:     config.model,
      max_tokens: 1024,
      messages:  conversationHistory
    };
    if (config.systemPrompt) streamParams.system = config.systemPrompt;

    const stream = getClient().messages.stream(streamParams);
    stream.on('text', (chunk) => {
      fullText += chunk;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('claude-token', chunk);
      }
    });

    const finalMsg = await stream.finalMessage();
    conversationHistory.push({ role: 'assistant', content: fullText });

    return {
      success: true,
      usage: {
        input:  finalMsg.usage.input_tokens,
        output: finalMsg.usage.output_tokens
      }
    };
  } catch (err) {
    conversationHistory.pop();
    console.error('Claude API error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.on('install-update',     () => autoUpdater.quitAndInstall());
ipcMain.on('clear-conversation', () => { conversationHistory = []; });
ipcMain.on('window-close',       () => mainWindow?.hide());
ipcMain.on('window-minimise',    () => mainWindow?.minimize());
ipcMain.on('new-capture',        () => triggerCapture());

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  loadConfig();
  createMainWindow();
  createTray();
  createOverlays();

  screen.on('display-added',           recreateOverlays);
  screen.on('display-removed',         recreateOverlays);
  screen.on('display-metrics-changed', recreateOverlays);

  registerShortcuts();
  setupAutoUpdater();

  if (process.argv.includes('--trigger')) triggerCapture();
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
