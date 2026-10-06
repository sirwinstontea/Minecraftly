const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
  click: () => ipcRenderer.send("overlay:click"),
  menu: () => ipcRenderer.send("overlay:menu"),
});
