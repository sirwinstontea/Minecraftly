const { contextBridge, ipcRenderer } = require("electron");

// The bridge every tool page gets as `window.minecraftly` inside the desktop app.
// In a plain browser it is undefined, so tools must keep working without it.
contextBridge.exposeInMainWorld("minecraftly", {
  hide: () => ipcRenderer.send("panel:hide"),
  showTool: (id) => ipcRenderer.send("panel:show-tool", id),
  setClickThrough: (on) => ipcRenderer.send("panel:click-through", on),
  exportPdf: (defaultName) => ipcRenderer.invoke("panel:export-pdf", defaultName),
  // Resolves with the picked option id, or null if dismissed.
  choose: (title, options) => ipcRenderer.invoke("panel:choose", { title, options }),
  newNote: () => ipcRenderer.send("inventory:new-note"),
  inventory: {
    list: () => ipcRenderer.invoke("inventory:list"),
    put: (item) => ipcRenderer.invoke("inventory:put", item),
    move: (id, slot) => ipcRenderer.invoke("inventory:move", id, slot),
    remove: (id) => ipcRenderer.invoke("inventory:remove", id),
    restore: (id) => ipcRenderer.invoke("inventory:restore", id),
    rename: (id, title) => ipcRenderer.invoke("inventory:rename", id, title),
    open: (id) => ipcRenderer.send("inventory:open", id),
    menu: (id) => ipcRenderer.send("inventory:menu", id),
    onChanged: (callback) => ipcRenderer.on("inventory:changed", (event, items) => callback(items)),
    onThrown: (callback) => ipcRenderer.on("inventory:thrown", (event, item) => callback(item)),
    onRenameRequest: (callback) => ipcRenderer.on("inventory:rename-request", (event, id) => callback(id)),
  },
  // `intent` says why the panel opened, e.g. { type: "load", item } or { type: "new" }.
  onOpened: (callback) => ipcRenderer.on("panel:opened", (event, intent) => callback(intent)),
  onClosing: (callback) => ipcRenderer.on("panel:closing", () => callback()),
  // "expanded" = big and centered on screen, "docked" = default corner spot.
  setMode: (mode) => ipcRenderer.send("panel:set-mode", mode),
  onMode: (callback) => ipcRenderer.on("panel:mode", (event, mode) => callback(mode)),
});

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.shell = "overlay";
});
