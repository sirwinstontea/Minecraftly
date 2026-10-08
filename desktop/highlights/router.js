const { BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { panelFor } = require("../panels");
const { foregroundApp, maskAltMenu } = require("./foreground");
const bridge = require("./bridge");
const { showToast } = require("./toast");

// Alt+Y anywhere: highlight the selected text (or remove the highlight it's on).
//   1. In a Minecraftly tool (Book & Quill): the tool highlights inside its own text.
//   2. In Chrome/Edge with the Minecraftly Highlighter extension: real in-page highlight.
//   3. Elsewhere: not supported yet (Word, PDFs, Firefox and more come in later steps).
const HOTKEY = "Alt+Y";
const CHROMIUM_BROWSERS = new Set(["chrome.exe", "msedge.exe", "brave.exe", "vivaldi.exe", "opera.exe", "chromium.exe"]);

const MESSAGES = {
  created: ["Highlighted", false],
  removed: ["Highlight removed", true],
  "no-selection": ["Select some text first", true],
};

let nextRequest = 1;
const panelResults = new Map();
ipcMain.on("highlight:result", (event, requestId, result) => panelResults.get(requestId)?.(result));

function askPanel(panel, color) {
  const requestId = nextRequest++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => done("unsupported"), 1000);
    function done(result) {
      clearTimeout(timer);
      panelResults.delete(requestId);
      resolve(result);
    }
    panelResults.set(requestId, done);
    panel.win.webContents.send("highlight:toggle", requestId, color);
  });
}

function tell(result) {
  const [text, info] = MESSAGES[result] || ["Minecraftly can't highlight here yet", true];
  showToast(text, { info });
}

async function highlightSelection(color = "yellow") {
  maskAltMenu();
  const focused = BrowserWindow.getFocusedWindow();
  const panel = focused && panelFor(focused.webContents);
  if (panel) {
    tell(await askPanel(panel, color));
    return;
  }
  const front = foregroundApp();
  if (front && CHROMIUM_BROWSERS.has(front.exe)) {
    const result = await bridge.requestCapture(color);
    if (MESSAGES[result]) {
      tell(result);
      return;
    }
    if (result === "not-connected" || result === "no-focus") {
      showToast("Add the Minecraftly Highlighter extension to highlight in this browser", { info: true });
      return;
    }
  }
  tell("unsupported");
}

function startHighlighter() {
  bridge.startBridge();
  return globalShortcut.register(HOTKEY, () => highlightSelection());
}

module.exports = { startHighlighter, HIGHLIGHT_HOTKEY: HOTKEY };
