const { ipcMain, Menu } = require("electron");
const inventory = require("./inventory");
const { toolById } = require("./tools");
const { flags, show, panelFor, allPanels } = require("./panels");

const book = () => toolById("book-and-quill");

// Every open window (bar, full inventory, notebook) redraws when the inventory changes.
function broadcast() {
  const items = inventory.listItems();
  for (const panel of allPanels()) panel.win.webContents.send("inventory:changed", items);
}

// Open a saved item. Notes open in the notebook; `then` can ask it to export right away.
function openItem(id, then) {
  const item = inventory.getItem(id);
  if (item?.type === "note") show(book(), { type: "load", item, then });
}

async function askRename(id, fromPanel) {
  // The bar is too narrow to type in, so renaming happens in the full inventory.
  let target = fromPanel;
  if (fromPanel?.tool.id !== "inventory") {
    await show(toolById("inventory"));
    target = allPanels().find((panel) => panel.tool.id === "inventory");
  }
  target?.win.webContents.send("inventory:rename-request", id);
}

function throwAway(id, panel) {
  const item = inventory.deleteItem(id);
  broadcast();
  if (item) panel?.win.webContents.send("inventory:thrown", item);
}

function registerInventoryIpc() {
  ipcMain.handle("inventory:list", () => inventory.listItems());
  ipcMain.handle("inventory:put", (event, item) => {
    const saved = inventory.putItem(item);
    broadcast();
    return saved;
  });
  ipcMain.handle("inventory:move", (event, id, slot) => {
    inventory.moveItem(id, slot);
    broadcast();
  });
  ipcMain.handle("inventory:remove", (event, id) => throwAway(id, panelFor(event.sender)));
  ipcMain.handle("inventory:restore", (event, id) => {
    inventory.restoreItem(id);
    broadcast();
  });
  ipcMain.handle("inventory:rename", (event, id, title) => {
    inventory.renameItem(id, title);
    broadcast();
  });
  ipcMain.on("inventory:open", (event, id) => openItem(id));
  ipcMain.on("inventory:new-note", () => show(book(), { type: "new" }));

  ipcMain.on("inventory:menu", (event, id) => {
    const panel = panelFor(event.sender);
    const item = inventory.getItem(id);
    if (!panel || !item) return;
    flags.suppressHide = true;
    Menu.buildFromTemplate([
      { label: "Open", click: () => openItem(id) },
      { label: "Rename…", click: () => askRename(id, panel) },
      {
        label: "Export",
        submenu: [
          { label: "PDF (Notebook)", click: () => openItem(id, { export: "pdf" }) },
          { label: "DOCX (Text)", click: () => openItem(id, { export: "docx" }) },
          { label: "Markdown (Text)", click: () => openItem(id, { export: "markdown" }) },
        ],
      },
      { type: "separator" },
      { label: "Throw away", click: () => throwAway(id, panel) },
    ]).popup({
      window: panel.win,
      callback: () => {
        flags.suppressHide = false;
      },
    });
  });
}

module.exports = { registerInventoryIpc, broadcast };
