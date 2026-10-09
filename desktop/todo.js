const { app, BrowserWindow, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { foregroundContext } = require("./highlights/foreground");
const { onFullscreenChange, isFullscreen } = require("./fullscreen");
const { anyPanelVisible, panelEvents } = require("./panels");
const { MARGIN, overlayBounds } = require("./layout");
const { putItem } = require("./inventory");
const { broadcast } = require("./inventory-ipc");

// The always-there to-do list (an oak sign) in the top-right corner.
//   desktop showing        -> the full sign
//   another app in front   -> just the sign icon; click it to open ("peek") until you click away
//   a Minecraftly tool open, fullscreen app, or switched off (Alt+T) -> icon / hidden
const ICON = 44;
const DEFAULT_WIDTH = 270;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 120;

const statePath = () => path.join(app.getPath("userData"), "todo.json");
let state = { version: 1, enabled: true, lines: [{ id: "line-1", text: "" }], box: null };
let win;
let mode = "hidden"; // "hidden" | "collapsed" | "expanded"
let context = "neutral"; // last decisive thing in front: "desktop" or "app"
let peek = false; // opened from the icon while another app is in front
let dragging = false;
let contentHeight = MIN_HEIGHT;
let saveTimer;

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    if (Array.isArray(saved.lines)) state = { ...state, ...saved };
  } catch { /* first run */ }
}

function save() {
  clearTimeout(saveTimer);
  try {
    const temp = `${statePath()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2));
    fs.renameSync(temp, statePath()); // one step, so a crash can't leave half a file
  } catch { /* try again on the next change */ }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

// ---- where the sign sits ------------------------------------------------------------------
function area() {
  return screen.getPrimaryDisplay().workArea;
}

// The sign always hugs the right edge of the main screen; it only slides up and down, from the
// top down to just above the grass block (never over it, never toward the middle).
function verticalRange(work = area()) {
  return { top: work.y + MARGIN, bottom: overlayBounds().y - MARGIN - MIN_HEIGHT };
}

function clampY(y, work = area()) {
  const { top, bottom } = verticalRange(work);
  return Math.round(Math.min(Math.max(y, top), Math.max(top, bottom)));
}

function rightAlignedX(width, work = area()) {
  return work.x + work.width - width - MARGIN;
}

// The sign's box: remembered height on the right edge and size; default top right.
function box() {
  const work = area();
  const saved = state.box || {};
  const width = Math.min(Math.max(saved.width || DEFAULT_WIDTH, MIN_WIDTH), work.width - 2 * MARGIN);
  const y = clampY(Number.isInteger(saved.y) ? saved.y : work.y + MARGIN, work);
  const room = overlayBounds().y - MARGIN - y; // down to just above the grass block
  const limit = Math.min(Math.max(saved.maxHeight || Math.round(work.height * 0.5), MIN_HEIGHT), Math.max(MIN_HEIGHT, room));
  return { x: rightAlignedX(width, work), y, width, maxHeight: limit };
}

function expandedBounds() {
  const b = box();
  const height = Math.min(Math.max(contentHeight, MIN_HEIGHT), b.maxHeight);
  return { x: b.x, y: b.y, width: b.width, height };
}

// The icon sits at the sign's top-right corner.
function collapsedBounds() {
  const b = box();
  return { x: b.x + b.width - ICON, y: b.y, width: ICON, height: ICON };
}

// ---- which state to show ------------------------------------------------------------------
function desiredMode() {
  if (!state.enabled || isFullscreen()) return "hidden";
  if (anyPanelVisible()) return "collapsed"; // never overlap the hotbar, inventory or notebook
  if (peek) return "expanded";
  return context === "desktop" ? "expanded" : "collapsed";
}

let sentMode = "";
function tellPage(value) {
  if (sentMode === value) return;
  sentMode = value;
  win.webContents.send("todo:mode", value);
}

function placeAt(bounds) {
  const now = win.getBounds();
  if (now.x !== bounds.x || now.y !== bounds.y || now.width !== bounds.width || now.height !== bounds.height) {
    win.setBounds(bounds);
  }
  if (!win.isVisible()) win.showInactive(); // never steals focus by itself
}

function apply() {
  if (!win || win.isDestroyed() || dragging) return;
  const next = desiredMode();
  const previous = mode;
  mode = next;
  if (next === "hidden") {
    if (win.isVisible()) win.hide();
    tellPage("collapsed");
    return;
  }
  if (next === "collapsed") {
    tellPage("collapsed"); // swap to the icon first, then shrink, so the sign never squashes
    if (previous === "collapsed") placeAt(collapsedBounds());
    else setTimeout(() => mode === "collapsed" && placeAt(collapsedBounds()), 16);
    return;
  }
  placeAt(expandedBounds()); // grow first, then show the sign
  tellPage(peek ? "peek" : "expanded");
  if (previous !== "expanded" && peek) win.focus();
}

function poll() {
  const next = foregroundContext();
  if (next !== "neutral") context = next;
  apply();
}

// ---- the window ---------------------------------------------------------------------------
function createTodo() {
  load();
  win = new BrowserWindow({
    ...collapsedBounds(),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, "ui", "todo-preload.js"), contextIsolation: true },
  });
  win.setAlwaysOnTop(true, "pop-up-menu");
  win.setContentProtection(true); // hidden in screen recordings and screen sharing
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const ipc = win.webContents.ipc;
  ipc.handle("todo:load", () => state.lines);
  ipc.on("todo:lines", (event, lines) => {
    if (!Array.isArray(lines)) return;
    state.lines = lines
      .filter((line) => line && typeof line.id === "string")
      .map((line) => ({ id: line.id, text: String(line.text ?? "").replace(/[\r\n]+/g, " ") }));
    scheduleSave();
  });
  // A copy of the list goes into the inventory as a note with the oak-sign look; the list stays.
  ipc.handle("todo:save-to-inventory", () => {
    const texts = state.lines.map((line) => line.text.trim()).filter(Boolean);
    if (!texts.length) return { result: "empty" };
    const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const text = texts.join("\n");
    try {
      putItem({
        id: `todo-${Date.now()}`,
        type: "note",
        variant: "todo",
        title: `To-do list, ${date}`,
        text,
        runs: [{ text, bold: false, italic: false }],
        breaks: [],
      });
      broadcast();
      return { result: "saved" };
    } catch (error) {
      return { result: String(error.message).includes("INVENTORY_FULL") ? "full" : "error" };
    }
  });
  ipc.on("todo:height", (event, height) => {
    contentHeight = Math.round(Number(height) || MIN_HEIGHT);
    if (mode === "expanded" && !dragging) win.setBounds(expandedBounds());
  });
  ipc.on("todo:peek", () => {
    peek = true;
    apply();
    win.focus();
  });
  ipc.on("todo:close", () => {
    peek = false;
    if (context !== "desktop") apply();
  });
  // Moving (the sign's top strip or the icon) and resizing (corner handle) are tracked by the
  // page, which reports where the pointer wants the box; the window follows directly. Moving
  // only ever changes the height on the right edge: sideways movement is ignored.
  ipc.on("todo:drag", (event, phase, rect) => {
    dragging = phase !== "end";
    if (rect) {
      const work = area();
      const y = clampY(rect.y, work);
      if (rect.icon) {
        state.box = { ...state.box, y };
        win.setBounds(collapsedBounds());
      } else {
        const width = Math.min(Math.max(MIN_WIDTH, Math.round(rect.width)), work.width - 2 * MARGIN);
        const room = overlayBounds().y - MARGIN - y;
        const height = Math.min(Math.max(MIN_HEIGHT, Math.round(rect.height)), Math.max(MIN_HEIGHT, room));
        win.setBounds({ x: rightAlignedX(width, work), y, width, height });
        state.box = { ...state.box, y, width, maxHeight: rect.resized ? height : (state.box?.maxHeight ?? null) };
      }
    }
    if (!dragging) {
      save();
      apply();
    }
  });

  win.on("blur", () => {
    if (dragging) return;
    if (peek) {
      peek = false;
      setTimeout(poll, 50); // re-check what's in front now
    }
  });
  win.loadFile(path.join(__dirname, "ui", "todo.html"));
  win.webContents.once("did-finish-load", () => {
    poll();
    setInterval(poll, 250);
  });

  onFullscreenChange(apply);
  panelEvents.on("shown", () => {
    peek = false;
    apply();
  });
  panelEvents.on("hidden", () => setTimeout(apply, 160));
  for (const event of ["display-added", "display-removed", "display-metrics-changed"]) {
    screen.on(event, () => {
      mode = "";
      apply();
    });
  }
  app.on("before-quit", save);
}

function setTodoEnabled(enabled) {
  state.enabled = Boolean(enabled);
  peek = false;
  save();
  apply();
}

const isTodoEnabled = () => state.enabled;
const todoInUse = () => Boolean(win && !win.isDestroyed() && win.isFocused());

module.exports = { createTodo, setTodoEnabled, isTodoEnabled, todoInUse };
