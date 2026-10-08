const {
  app, Tray, Menu, globalShortcut, nativeImage, ipcMain, dialog, shell,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { TOOLS, DEFAULT_TOOL, toolById } = require("./tools");
const { readState, updateState } = require("./state");
const {
  flags, createPanel, show, hideAnimated, hideById, toggle, setMode, panelFor, anyPanelVisible,
  isVisible, justHiddenByBlur,
} = require("./panels");
const { createOverlay, setOverlayEnabled, isOverlayEnabled } = require("./overlay");
const { startAutoUpdates } = require("./updater");
const { choose } = require("./chooser");
const { registerInventoryIpc } = require("./inventory-ipc");
const { startHighlighter, HIGHLIGHT_HOTKEY } = require("./highlights/router");

const APP_NAME = "Minecraftly";
// Same options for reading and writing, so Windows matches its startup entry.
const loginItem = { name: APP_NAME, args: ["--hidden"] };
let tray;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Launching again from a shortcut while it's running: same as every other way in.
  app.on("second-instance", (event, argv) => {
    if (!isQuietStart(argv)) summon(DEFAULT_TOOL);
  });
  app.whenReady().then(start);
}

// Every way of calling Minecraftly (desktop or Start-menu shortcut, tray icon, grass block,
// Alt+E / Alt+B, menu) goes through summon(), so it behaves the same however it was called.
// Keep it that way when adding new entry points.
// For a tool that expands (the bar): closed -> bar -> full inventory -> closed.
function summon(tool) {
  const bigger = tool.expandsTo && toolById(tool.expandsTo);
  if (bigger) {
    // A click on the tray icon closes the open bar/inventory (blur) just before it arrives.
    const justClosed = justHiddenByBlur();
    if (isVisible(tool.id) || justClosed === tool.id) {
      show(bigger);
      return;
    }
    if (isVisible(bigger.id)) {
      hideById(bigger.id);
      return;
    }
    if (justClosed === bigger.id) return;
  }
  toggle(tool);
}

// Started at login or relaunched after an automatic update: stay quietly in the tray.
function isQuietStart(argv) {
  return argv.includes("--hidden") || argv.includes("--updated");
}

ipcMain.on("panel:hide", (event) => {
  const panel = panelFor(event.sender);
  if (panel) hideAnimated(panel);
});

ipcMain.handle("panel:export-pdf", async (event, defaultName = "export.pdf") => {
  const panel = panelFor(event.sender);
  if (!panel) return;
  const pdf = await panel.win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
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

// A menu centered on the screen (not inside the small tool panel), e.g. Book & Quill's Export.
ipcMain.handle("panel:choose", async (event, spec) => {
  const panel = panelFor(event.sender);
  if (!panel || !Array.isArray(spec?.options)) return null;
  flags.suppressHide = true;
  try {
    return await choose(panel.win, { title: String(spec.title ?? ""), options: spec.options });
  } finally {
    flags.suppressHide = false;
    if (panel.win.isVisible()) panel.win.focus();
  }
});

// Expand (big, centered on screen) / minimize (back to its docked spot).
ipcMain.on("panel:set-mode", (event, mode) => {
  const panel = panelFor(event.sender);
  if (panel && (mode === "expanded" || mode === "docked")) setMode(panel, mode);
});

// Open another tool from inside one (e.g. the bar's expand slot opens the full inventory).
ipcMain.on("panel:show-tool", (event, id) => {
  const tool = toolById(id);
  if (tool) show(tool);
});

// The bar's window has see-through room for tooltips; clicks there go to whatever is below.
ipcMain.on("panel:click-through", (event, on) => {
  panelFor(event.sender)?.win.setIgnoreMouseEvents(Boolean(on), { forward: true });
});

registerInventoryIpc();

function registerHotkeys() {
  const working = new Set();
  for (const tool of TOOLS) {
    if (tool.hotkey && globalShortcut.register(tool.hotkey, () => summon(tool))) working.add(tool);
  }
  return working;
}

// Right-click menu, shared by the tray icon and the grass-block overlay.
function buildMenu(hotkeysWorking) {
  return Menu.buildFromTemplate([
    { label: `${APP_NAME} ${app.getVersion()}`, enabled: false },
    { type: "separator" },
    ...TOOLS.filter((tool) => tool.inMenu !== false).map((tool) => ({
      label: tool.label,
      accelerator: hotkeysWorking.has(tool) ? tool.hotkey : undefined,
      registerAccelerator: false,
      click: () => summon(tool),
    })),
    {
      label: highlighterReady ? "Highlight selected text" : `${HIGHLIGHT_HOTKEY} is used by another app`,
      accelerator: highlighterReady ? HIGHLIGHT_HOTKEY : undefined,
      registerAccelerator: false,
      enabled: false,
    },
    { label: "Get the browser highlighter…", click: () => shell.openExternal(EXTENSION_PAGE) },
    { type: "separator" },
    {
      label: "Show grass block on screen",
      type: "checkbox",
      checked: isOverlayEnabled(),
      click: (item) => {
        setOverlayEnabled(item.checked);
        updateState({ overlayHidden: !item.checked });
        refreshMenu();
      },
    },
    ...(app.isPackaged ? [{
      label: "Start with Windows",
      type: "checkbox",
      checked: app.getLoginItemSettings(loginItem).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...loginItem, openAtLogin: item.checked }),
    }] : []),
    { label: `Quit ${APP_NAME}`, click: () => app.quit() },
  ]);
}

let menuHotkeys = new Set();
let highlighterReady = false;
// Until the extension is in the Chrome Web Store / Edge Add-ons, it is installed from GitHub.
const EXTENSION_PAGE = "https://github.com/sirwinstontea/Minecraftly#browser-highlighter";
function refreshMenu() {
  tray?.setContextMenu(buildMenu(menuHotkeys));
}

function createTray(hotkeysWorking) {
  menuHotkeys = hotkeysWorking;
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icon.ico")));
  const hotkey = hotkeysWorking.has(DEFAULT_TOOL) ? ` (${DEFAULT_TOOL.hotkey})` : "";
  tray.setToolTip(`${APP_NAME}${hotkey}`);
  tray.on("click", () => summon(DEFAULT_TOOL));
  refreshMenu();
}

function welcome(hotkeysWorking) {
  const hotkey = hotkeysWorking.has(DEFAULT_TOOL) ? `, or press ${DEFAULT_TOOL.hotkey} anywhere,` : "";
  tray.displayBalloon({
    iconType: "info",
    title: `${APP_NAME} is ready`,
    content: `Click the grass block in the bottom-right corner or the ${APP_NAME} icon by the clock${hotkey} `
      + "to open your inventory. Alt+B opens the notebook.",
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

  setOverlayEnabled(!state.overlayHidden);
  createOverlay({
    onClick: () => summon(DEFAULT_TOOL),
    onMenu: (window) => buildMenu(menuHotkeys).popup({ window }),
  });
  for (const tool of TOOLS) createPanel(tool);
  const hotkeysWorking = registerHotkeys();
  highlighterReady = startHighlighter();
  createTray(hotkeysWorking);
  startAutoUpdates({ isIdle: () => !anyPanelVisible() && !flags.suppressHide });

  if (isQuietStart(process.argv)) return;
  summon(DEFAULT_TOOL);
  if (!state.welcomed) {
    welcome(hotkeysWorking);
    updateState({ welcomed: true });
  }
}

app.on("before-quit", () => { flags.quitting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { /* keep running in the tray */ });
