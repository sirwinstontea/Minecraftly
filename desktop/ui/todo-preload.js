const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("todo", {
  load: () => ipcRenderer.invoke("todo:load"),
  saveLines: (lines) => ipcRenderer.send("todo:lines", lines),
  reportHeight: (height) => ipcRenderer.send("todo:height", height),
  peek: () => ipcRenderer.send("todo:peek"),
  close: () => ipcRenderer.send("todo:close"),
  // phase: "move" | "end"; rect: { x, y, width, height, resized } in screen coordinates
  drag: (phase, rect) => ipcRenderer.send("todo:drag", phase, rect),
  saveToInventory: (lines) => ipcRenderer.invoke("todo:save-to-inventory", lines),
  onMode: (callback) => ipcRenderer.on("todo:mode", (event, mode) => callback(mode)),
});
