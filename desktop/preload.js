const { contextBridge, ipcRenderer } = require("electron");

// The bridge every tool page gets as `window.minecraftly` inside the desktop app.
// In a plain browser it is undefined, so tools must keep working without it.
contextBridge.exposeInMainWorld("minecraftly", {
  hide: () => ipcRenderer.send("panel:hide"),
  exportPdf: (defaultName) => ipcRenderer.invoke("panel:export-pdf", defaultName),
  onOpened: (callback) => ipcRenderer.on("panel:opened", () => callback()),
  onClosing: (callback) => ipcRenderer.on("panel:closing", () => callback()),
});

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.shell = "overlay";
});
