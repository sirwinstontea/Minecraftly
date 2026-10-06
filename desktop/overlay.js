const { BrowserWindow, screen } = require("electron");
const path = require("node:path");
const { overlayBounds } = require("./layout");

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

// Windows reports when a fullscreen app (game, video, slideshow) is in front.
// Uses a small prebuilt library (koffi); if it can't load, the block simply stays visible.
function watchFullscreen() {
  let query;
  try {
    const koffi = require("koffi");
    query = koffi.load("shell32.dll").func("int __stdcall SHQueryUserNotificationState(_Out_ int *state)");
  } catch {
    return;
  }
  const BUSY = 2; // fullscreen app
  const D3D_FULLSCREEN = 3; // fullscreen game
  const PRESENTATION = 4;
  setInterval(() => {
    const state = [0];
    if (query(state) !== 0) return;
    const next = [BUSY, D3D_FULLSCREEN, PRESENTATION].includes(state[0]);
    if (next !== fullscreenActive) {
      fullscreenActive = next;
      refresh();
    }
  }, 1500);
}

module.exports = { createOverlay, setOverlayEnabled, isOverlayEnabled };
