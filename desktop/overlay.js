const { BrowserWindow, screen } = require("electron");
const path = require("node:path");
const { overlayBounds } = require("./layout");
const { onFullscreenChange } = require("./fullscreen");

// The grass block that always sits in the bottom-right corner (like Wispr Flow's bar).
// It never takes focus, is hidden from screen recordings and screen sharing,
// and steps aside while a fullscreen game, video or presentation is in front.
let win;
let enabled = true;
let fullscreenActive = false;

function createOverlay({ onClick, onMenu }) {
  win = new BrowserWindow({
    ...overlayBounds(),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, "ui", "overlay-preload.js"), contextIsolation: true },
  });
  win.setAlwaysOnTop(true, "pop-up-menu");
  win.setContentProtection(true);
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.ipc.on("overlay:click", () => onClick());
  win.webContents.ipc.on("overlay:menu", () => onMenu(win));
  win.loadFile(path.join(__dirname, "ui", "overlay.html"));
  win.once("ready-to-show", refresh);

  for (const event of ["display-added", "display-removed", "display-metrics-changed"]) {
    screen.on(event, () => win.setBounds(overlayBounds()));
  }
  watchFullscreen();
}

function refresh() {
  if (!win || win.isDestroyed()) return;
  if (enabled && !fullscreenActive) {
    win.setBounds(overlayBounds());
    win.showInactive();
  } else {
    win.hide();
  }
}

function setOverlayEnabled(value) {
  enabled = value;
  refresh();
}

function isOverlayEnabled() {
  return enabled;
}

function watchFullscreen() {
  onFullscreenChange((active) => {
    fullscreenActive = active;
    refresh();
  });
}

module.exports = { createOverlay, setOverlayEnabled, isOverlayEnabled };
