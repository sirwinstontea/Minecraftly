const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// Everything the user makes (notes now, more item types later) lives here, laid out like a
// Minecraft inventory: slots 0-8 are the hotbar, 9-35 the storage above it.
const HOTBAR_SLOTS = 9;
const TOTAL_SLOTS = 36;
const PURGE_AFTER = 30 * 24 * 60 * 60 * 1000; // thrown-away items are kept 30 days for undo
const inventoryPath = () => path.join(app.getPath("userData"), "inventory.json");

class InventoryFullError extends Error {
  constructor() {
    super("INVENTORY_FULL: every slot is taken");
  }
}

function readAll() {
  let items = [];
  try {
    const data = JSON.parse(fs.readFileSync(inventoryPath(), "utf8"));
    if (Array.isArray(data.items)) items = data.items;
  } catch { /* no inventory yet */ }
  const now = Date.now();
  items = items.filter((item) => !item.deletedAt || now - Date.parse(item.deletedAt) < PURGE_AFTER);
  // Items saved before slots existed get the first free slots.
  for (const item of items) {
    if (!item.deletedAt && !isSlot(item.slot)) item.slot = firstFreeSlot(items);
  }
  return items;
}

function writeAll(items) {
  const file = inventoryPath();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ version: 2, items }, null, 2));
  fs.renameSync(temp, file); // replace in one step so a crash can't leave half a file
}

const isSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < TOTAL_SLOTS;

// Hotbar first, then storage. Returns undefined when everything is full.
function firstFreeSlot(items) {
  const taken = new Set(items.filter((item) => !item.deletedAt && isSlot(item.slot)).map((item) => item.slot));
  for (let slot = 0; slot < TOTAL_SLOTS; slot += 1) if (!taken.has(slot)) return slot;
  return undefined;
}

function slotIsFree(items, slot, exceptId) {
  return isSlot(slot) && !items.some((item) => !item.deletedAt && item.slot === slot && item.id !== exceptId);
}

function listItems() {
  return readAll().filter((item) => !item.deletedAt);
}

// Insert or update by id. A renamed item keeps its custom title when its content changes.
function putItem(item) {
  if (!item || typeof item.id !== "string" || typeof item.type !== "string") {
    throw new Error("Inventory items need a string id and type");
  }
  const items = readAll();
  const existing = items.find((entry) => entry.id === item.id);
  const live = existing && !existing.deletedAt ? existing : undefined;
  const slot = live && slotIsFree(items, live.slot, live.id) ? live.slot : firstFreeSlot(items);
  if (slot === undefined) throw new InventoryFullError();
  const now = new Date().toISOString();
  const saved = {
    ...existing,
    ...item,
    title: existing?.customTitle ? existing.title : item.title,
    slot,
    createdAt: existing?.createdAt || item.createdAt || now,
    updatedAt: now,
  };
  delete saved.deletedAt;
  writeAll([saved, ...items.filter((entry) => entry.id !== item.id)]);
  return saved;
}

// Drop an item on a slot; if another item is there, the two swap places.
function moveItem(id, slot) {
  if (!isSlot(slot)) return listItems();
  const items = readAll();
  const item = items.find((entry) => entry.id === id && !entry.deletedAt);
  if (!item || item.slot === slot) return listItems();
  const occupant = items.find((entry) => !entry.deletedAt && entry.slot === slot);
  if (occupant) occupant.slot = item.slot;
  item.slot = slot;
  writeAll(items);
  return listItems();
}

function deleteItem(id) {
  const items = readAll();
  const item = items.find((entry) => entry.id === id);
  if (item && !item.deletedAt) {
    item.deletedAt = new Date().toISOString();
    writeAll(items);
  }
  return item;
}

function restoreItem(id) {
  const items = readAll();
  const item = items.find((entry) => entry.id === id);
  if (!item || !item.deletedAt) return item;
  delete item.deletedAt;
  if (!slotIsFree(items, item.slot, item.id)) item.slot = firstFreeSlot(items);
  if (item.slot === undefined) throw new InventoryFullError();
  writeAll(items);
  return item;
}

function renameItem(id, title) {
  const clean = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const items = readAll();
  const item = items.find((entry) => entry.id === id && !entry.deletedAt);
  if (!item || !clean) return item;
  item.title = clean;
  item.customTitle = true;
  writeAll(items);
  return item;
}

function getItem(id) {
  return listItems().find((item) => item.id === id);
}

module.exports = {
  HOTBAR_SLOTS, TOTAL_SLOTS, listItems, getItem, putItem, moveItem, deleteItem, restoreItem, renameItem,
};
