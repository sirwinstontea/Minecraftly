const { BrowserWindow, screen } = require("electron");
const path = require("node:path");
const { readState, updateState } = require("./state");
const { dockedBounds, expandedBounds } = require("./layout");
const { isOverlayEnabled } = require("./overlay");

const panels = new Map();
const flags = { quitting: false, suppressHide: false };
let hiddenByBlurAt = 0;

function fitsOnSomeDisplay({ x, y }, { width, height }) {
  return screen.getAllDisplays().some(({ workArea: a }) => (
    x >= a.x && y >= a.y && x + width <= a.x + a.width && y + height <= a.y + a.height
  ));
}

// Docked (default): where the user last dragged it, else bottom-right beside the grass block.
// Expanded: big and centered on the screen. Programmatic moves aren't saved as the user's spot.
function place(panel) {
  const { tool, win } = panel;
  panel.placedAt = Date.now();
  const area = panel.mode === "expanded"
    ? screen.getDisplayMatching(win.getBounds()).workArea
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  if (panel.mode === "expanded") {
    win.setBounds(expandedBounds(area, tool));
    return;
  }
  const saved = readState().positions?.[tool.id];
  if (saved && Number.isInteger(saved.x) && Number.isInteger(saved.y) && fitsOnSomeDisplay(saved, tool)) {
    win.setBounds({ x: saved.x, y: saved.y, width: tool.width, height: tool.height });
    return;
  }
  win.setBounds(dockedBounds(area, tool, isOverlayEnabled()));
}

function setMode(panel, mode) {
  if (panel.mode === mode) return;
  panel.mode = mode;
  place(panel);
  panel.win.webContents.send("panel:mode", mode);
}

function createPanel(tool) {
  const win = new BrowserWindow({
    width: tool.width,
    height: tool.height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  const panel = { tool, win, hideTimer: undefined, shownAt: 0, placedAt: 0, mode: "docked" };
  panel.loaded = new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  win.setAlwaysOnTop(true, "pop-up-menu");
  win.loadFile(path.join(__dirname, "..", "tools", tool.id, "index.html"), { query: { shell: "overlay" } });

  // Keep each tool a single fixed page: no navigation (e.g. a dropped file), popups or zoom.
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("zoom-changed", () => win.webContents.setZoomFactor(1));
  win.webContents.setVisualZoomLevelLimits(1, 1);

  win.on("blur", () => {
    if (flags.suppressHide || Date.now() - panel.shownAt < 300) return;
    hideAnimated(panel, { byBlur: true });
  });
  win.on("moved", () => {
    if (panel.mode !== "docked" || Date.now() - panel.placedAt < 500) return;
    const [x, y] = win.getPosition();
    updateState({ positions: { ...readState().positions, [tool.id]: { x, y } } });
  });
  win.on("close", (event) => {
    if (flags.quitting) return;
    event.preventDefault();
    hideAnimated(panel);
  });

  // Text exports arrive as downloads; Electron shows its own save dialog,
  // so keep blur from hiding the panel until the download settles.
  win.webContents.session.on("will-download", (event, item, contents) => {
    if (contents !== win.webContents) return;
    flags.suppressHide = true;
    item.once("done", () => {
      flags.suppressHide = false;
      win.focus();
    });
  });

  panels.set(tool.id, panel);
  return panel;
}

async function show(tool) {
  const panel = panels.get(tool.id) || createPanel(tool);
  await panel.loaded;
  for (const other of panels.values()) if (other !== panel) hideAnimated(other);
  clearTimeout(panel.hideTimer);
  panel.hideTimer = undefined;
  if (!panel.win.isVisible()) place(panel);
  panel.shownAt = Date.now();
  panel.win.showInactive();
  panel.win.focus();
  panel.win.webContents.send("panel:opened");
}

function hideAnimated(panel, { byBlur = false } = {}) {
  if (!panel.win.isVisible() || panel.hideTimer) return;
  if (byBlur) hiddenByBlurAt = Date.now();
  panel.win.webContents.send("panel:closing");
  panel.hideTimer = setTimeout(() => {
    panel.hideTimer = undefined;
    panel.win.hide();
  }, 140);
}

function toggle(tool) {
  // Clicking the tray icon blurs the open panel first; treat that click as "close", not "reopen".
  if (Date.now() - hiddenByBlurAt < 400) return;
  const panel = panels.get(tool.id);
  if (panel?.win.isVisible() && !panel.hideTimer) hideAnimated(panel);
  else show(tool);
}

function panelFor(webContents) {
  return [...panels.values()].find((panel) => panel.win.webContents === webContents);
}

function anyPanelVisible() {
  return [...panels.values()].some((panel) => panel.win.isVisible());
}

module.exports = { flags, createPanel, show, hideAnimated, toggle, setMode, panelFor, anyPanelVisible };
