const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chooser", {
  get: () => ipcRenderer.invoke("chooser:get"),
  pick: (id) => ipcRenderer.send("chooser:pick", id),
});
