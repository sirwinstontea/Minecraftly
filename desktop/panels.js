const { BrowserWindow, screen } = require("electron");
const path = require("node:path");
const { readState, updateState } = require("./state");
const { dockedBounds, expandedBounds, hotbarBounds, inventoryBounds } = require("./layout");
const { isOverlayEnabled } = require("./overlay");

const { EventEmitter } = require("node:events");

const panels = new Map();
// "shown" / "hidden" (tool id): lets the to-do sign get out of the way of open tools.
const panelEvents = new EventEmitter();
const flags = { quitting: false, suppressHide: false };
let hiddenByBlur = { id: undefined, at: 0 };

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
  // Fixed spots: the vertical bar above the grass block, the full inventory centered.
  if (tool.placement === "hotbar") {
    win.setBounds(hotbarBounds());
    return;
  }
  if (tool.placement === "center") {
    win.setBounds(inventoryBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea));
    return;
  }
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
    width: tool.width || 100,
    height: tool.height || 100,
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

// `intent` tells the tool why it was opened, e.g. { type: "load", item } for the notebook.
async function show(tool, intent = null) {
  const panel = panels.get(tool.id) || createPanel(tool);
  await panel.loaded;
  for (const other of panels.values()) if (other !== panel) hideAnimated(other);
  clearTimeout(panel.hideTimer);
  panel.hideTimer = undefined;
  // Fixed-spot panels (bar, inventory) are always re-placed; docked ones keep where you dragged them.
  if (!panel.win.isVisible() || panel.tool.placement === "hotbar" || panel.tool.placement === "center") place(panel);
  panel.shownAt = Date.now();
  panel.win.showInactive();
  panel.win.focus();
  panel.win.webContents.send("panel:opened", intent);
  panelEvents.emit("shown", tool.id);
}

function hideAnimated(panel, { byBlur = false } = {}) {
  if (!panel.win.isVisible() || panel.hideTimer) return;
  if (byBlur) hiddenByBlur = { id: panel.tool.id, at: Date.now() };
  panel.win.webContents.send("panel:closing");
  panel.hideTimer = setTimeout(() => {
    panel.hideTimer = undefined;
    panel.win.hide();
    panelEvents.emit("hidden", panel.tool.id);
  }, 140);
}

// Which panel (if any) a click elsewhere closed in the last moment. Clicking the tray icon
// blurs the open panel before the click arrives, so callers can tell what was open.
function justHiddenByBlur() {
  return Date.now() - hiddenByBlur.at < 400 ? hiddenByBlur.id : undefined;
}

function isVisible(id) {
  const panel = panels.get(id);
  return Boolean(panel?.win.isVisible() && !panel.hideTimer);
}

function hideById(id) {
  const panel = panels.get(id);
  if (panel) hideAnimated(panel);
}

function toggle(tool) {
  if (justHiddenByBlur()) return;
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

function allPanels() {
  return [...panels.values()];
}

module.exports = {
  flags, createPanel, show, hideAnimated, hideById, toggle, setMode, panelFor, anyPanelVisible,
  isVisible, justHiddenByBlur, allPanels, panelEvents,
};
