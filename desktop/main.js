const { app, Tray, Menu, globalShortcut, nativeImage, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { TOOLS, DEFAULT_TOOL } = require("./tools");
const { readState, updateState } = require("./state");
const { flags, createPanel, show, hideAnimated, toggle, panelFor } = require("./panels");

const APP_NAME = "Minecraftly";
// Same options for reading and writing, so Windows matches its startup entry.
const loginItem = { name: APP_NAME, args: ["--hidden"] };
let tray;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Launching again from the Start menu / desktop shortcut brings the default tool up.
  app.on("second-instance", () => show(DEFAULT_TOOL));
  app.whenReady().then(start);
}

ipcMain.on("panel:hide", (event) => {
  const panel = panelFor(event.sender);
  if (panel) hideAnimated(panel);
});

ipcMain.handle("panel:export-pdf", async (event, defaultName = "export.pdf") => {
  const panel = panelFor(event.sender);
  if (!panel) return;
  const pdf = await panel.win.webContents.printToPDF({ landscape: true, pageSize: "A4", printBackground: true });
  flags.suppressHide = true;
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(panel.win, {
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!canceled && filePath) fs.writeFileSync(filePath, pdf);
  } finally {
    flags.suppressHide = false;
    panel.win.focus();
  }
});

function registerHotkeys() {
  const working = new Set();
  for (const tool of TOOLS) {
    if (tool.hotkey && globalShortcut.register(tool.hotkey, () => toggle(tool))) working.add(tool);
  }
  return working;
}

function createTray(hotkeysWorking) {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icon.ico")));
  const hotkey = hotkeysWorking.has(DEFAULT_TOOL) ? ` (${DEFAULT_TOOL.hotkey})` : "";
  tray.setToolTip(`${APP_NAME}${hotkey}`);
  tray.on("click", () => toggle(DEFAULT_TOOL));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: APP_NAME, enabled: false },
    { type: "separator" },
    ...TOOLS.map((tool) => ({
      label: tool.label,
      accelerator: hotkeysWorking.has(tool) ? tool.hotkey : undefined,
      registerAccelerator: false,
      click: () => show(tool),
    })),
    { type: "separator" },
    ...(app.isPackaged ? [{
      label: "Start with Windows",
      type: "checkbox",
      checked: app.getLoginItemSettings(loginItem).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...loginItem, openAtLogin: item.checked }),
    }] : []),
    { label: `Quit ${APP_NAME}`, click: () => app.quit() },
  ]));
}

function welcome(hotkeysWorking) {
  const hotkey = hotkeysWorking.has(DEFAULT_TOOL) ? `, or press ${DEFAULT_TOOL.hotkey} anywhere,` : "";
  tray.displayBalloon({
    iconType: "info",
    title: `${APP_NAME} lives next to your clock`,
    content: `Click the ${APP_NAME} icon by the clock${hotkey} to open your tools. `
      + "If you can't see it, click the ^ arrow and drag it onto the taskbar.",
  });
}

function start() {
  app.setAppUserModelId("com.minecraftly.app");
  Menu.setApplicationMenu(null);
  const state = readState();

  // The tray icon should always be there: start with Windows unless the user turns it off.
  if (app.isPackaged && !state.loginItemConfigured) {
    app.setLoginItemSettings({ ...loginItem, openAtLogin: true });
    updateState({ loginItemConfigured: true });
  }

  for (const tool of TOOLS) createPanel(tool);
  const hotkeysWorking = registerHotkeys();
  createTray(hotkeysWorking);

  // Started at login: stay quietly in the tray. Opened by the user: show the default tool.
  if (process.argv.includes("--hidden")) return;
  show(DEFAULT_TOOL);
  if (!state.welcomed) {
    welcome(hotkeysWorking);
    updateState({ welcomed: true });
  }
}

app.on("before-quit", () => { flags.quitting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { /* keep running in the tray */ });
