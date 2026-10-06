const { BrowserWindow, screen } = require("electron");
const path = require("node:path");

let open;

// Shows a Minecraft-style menu centered on the screen the tool is on, with a dimmed
// backdrop. Resolves with the picked option id, or null if dismissed.
function choose(parent, { title, options }) {
  open?.finish(null);
  const area = screen.getDisplayMatching(parent.getBounds()).workArea;
  const win = new BrowserWindow({
    ...area,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, "ui", "chooser-preload.js"), contextIsolation: true },
  });
  win.setAlwaysOnTop(true, "pop-up-menu");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      open = undefined;
      resolve(value);
      if (!win.isDestroyed()) win.destroy();
    };
    open = { finish };

    win.webContents.ipc.handle("chooser:get", () => ({ title, options }));
    win.webContents.ipc.on("chooser:pick", (event, id) => {
      finish(options.some((option) => option.id === id) ? id : null);
    });
    win.on("blur", () => finish(null));
    win.on("closed", () => finish(null));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });
    win.loadFile(path.join(__dirname, "ui", "chooser.html"));
  });
}

module.exports = { choose };
