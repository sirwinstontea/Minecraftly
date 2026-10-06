const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// Everything the user makes (notes now, more item types later) lives here, so the
// upcoming Inventory tool can list it. Stored in the user's app-data folder.
const inventoryPath = () => path.join(app.getPath("userData"), "inventory.json");

function listItems() {
  try {
    const data = JSON.parse(fs.readFileSync(inventoryPath(), "utf8"));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  const file = inventoryPath();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ version: 1, items }, null, 2));
  fs.renameSync(temp, file); // replace in one step so a crash can't leave half a file
}

// Insert or update by id; newest first.
function putItem(item) {
  if (!item || typeof item.id !== "string" || typeof item.type !== "string") {
    throw new Error("Inventory items need a string id and type");
  }
  const now = new Date().toISOString();
  const items = listItems();
  const existing = items.find((entry) => entry.id === item.id);
  const saved = { ...existing, ...item, createdAt: existing?.createdAt || item.createdAt || now, updatedAt: now };
  writeItems([saved, ...items.filter((entry) => entry.id !== item.id)]);
  return saved;
}

module.exports = { listItems, putItem };
