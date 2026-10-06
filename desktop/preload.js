const { contextBridge, ipcRenderer } = require("electron");

// The bridge every tool page gets as `window.minecraftly` inside the desktop app.
// In a plain browser it is undefined, so tools must keep working without it.
contextBridge.exposeInMainWorld("minecraftly", {
  hide: () => ipcRenderer.send("panel:hide"),
  exportPdf: (defaultName) => ipcRenderer.invoke("panel:export-pdf", defaultName),
  // Resolves with the picked option id, or null if dismissed.
  choose: (title, options) => ipcRenderer.invoke("panel:choose", { title, options }),
  inventory: {
    list: () => ipcRenderer.invoke("inventory:list"),
    put: (item) => ipcRenderer.invoke("inventory:put", item),
  },
  onOpened: (callback) => ipcRenderer.on("panel:opened", () => callback()),
  onClosing: (callback) => ipcRenderer.on("panel:closing", () => callback()),
  // "expanded" = big and centered on screen, "docked" = default corner spot.
  setMode: (mode) => ipcRenderer.send("panel:set-mode", mode),
  onMode: (callback) => ipcRenderer.on("panel:mode", (event, mode) => callback(mode)),
});

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.shell = "overlay";
});
