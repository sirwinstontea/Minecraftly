const { BrowserWindow, screen } = require("electron");
const path = require("node:path");

// A small Minecraft-style message next to the mouse ("Highlighted", "Select some text first").
// Never takes focus, so the app you're highlighting in keeps it.
let win;
let ready;
let hideTimer;

function create() {
  win = new BrowserWindow({
    width: 380,
    height: 40,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(true);
  ready = new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  win.loadFile(path.join(__dirname, "..", "ui", "toast.html"));
}

// info = true: a plain message (no yellow swatch).
async function showToast(text, { info = false } = {}) {
  if (!win || win.isDestroyed()) create();
  await ready;
  const size = await win.webContents.executeJavaScript(`showToast(${JSON.stringify(text)}, ${info})`);
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const x = Math.min(cursor.x + 14, area.x + area.width - size.width - 4);
  const y = Math.min(cursor.y + 20, area.y + area.height - size.height - 4);
  win.setBounds({ x, y, width: size.width, height: size.height });
  win.showInactive();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => win.hide(), 1600);
}

module.exports = { showToast };
