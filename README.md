# ClaudeBox

Stream Deck triggered Claude vision assistant. Select a screen region, type a prompt, get an answer.

## Setup

### 1. Prerequisites
- Node.js 18+
- An Anthropic API key (https://console.anthropic.com)

### 2. Install
```
npm install
```

### 3. API Key
Create a `.env` file in the root folder:
```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
```

### 4. Run (dev)
```
npm start
```

The app will sit in your system tray. Click the tray icon or use `Ctrl+Shift+Space` to trigger a capture.

### 5. Build to .exe
```
npm run build
```
Outputs a portable `.exe` to `dist/`. No install required — just run it on startup.

---

## Stream Deck Setup

1. Build the `.exe` (step 5 above)
2. In Stream Deck software, add a **System > Open** action
3. Set the application path to the `.exe`
4. The app starts in the tray and immediately opens the region selector

Or if the app is already running (recommended for instant response):
1. Use the **Execute** plugin  
2. Run: `taskkill /IM ClaudeBox.exe & start "" "C:\Tools\ClaudeBox\ClaudeBox.exe" --trigger`

To have it start with Windows: add the `.exe` to your Startup folder (`shell:startup`).

---

## Usage

1. Press your Stream Deck button
2. Screen dims — click and drag to select a region
3. ClaudeBox window appears with your screenshot
4. Type your prompt (e.g. "explain this error", "summarise this", "what's wrong here?")
5. Press **Send** or `Ctrl+Enter`
6. Response appears inline below

### Tips
- Works with error messages, code, documentation, emails, anything on screen
- `Ctrl+Shift+Space` is a keyboard shortcut alternative to Stream Deck
- Click **New Capture** to start a fresh selection without closing the window
- Click **Copy** to copy the response to clipboard

---

## Stack
- Electron 33
- Anthropic SDK (claude-sonnet-4-5 with vision)
- Vanilla JS / HTML / CSS
