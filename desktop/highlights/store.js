const { app } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Highlights made outside Minecraftly (web pages for now; PDFs, Word and other apps later).
// Stored in the app's own data folder, one file per page/document ("source"), so loading a
// page only reads that page's file. Separate from the inventory.
//
// Highlight: { id, color, createdAt, updatedAt,
//              source: { kind: "web", key, url, title },
//              selector: { exact, prefix, suffix, start, end } }   (see lib/anchor.js)
const dir = () => path.join(app.getPath("userData"), "highlights");
const fileFor = (key) => path.join(dir(), `${crypto.createHash("sha1").update(key).digest("hex").slice(0, 20)}.json`);

function readSource(key) {
  try {
    const data = JSON.parse(fs.readFileSync(fileFor(key), "utf8"));
    return data.key === key && Array.isArray(data.highlights) ? data : { key, highlights: [] };
  } catch {
    return { key, highlights: [] };
  }
}

function writeSource(data) {
  fs.mkdirSync(dir(), { recursive: true });
  const file = fileFor(data.key);
  if (!data.highlights.length) {
    fs.rmSync(file, { force: true });
    return;
  }
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data));
  fs.renameSync(temp, file); // one step, so a crash can't leave half a file
}

// All highlights for any of these source keys (a page can be known by several URLs).
function listHighlights(keys) {
  const seen = new Map();
  for (const key of new Set((keys || []).filter((value) => typeof value === "string" && value))) {
    for (const highlight of readSource(key).highlights) seen.set(highlight.id, highlight);
  }
  return [...seen.values()];
}

const COLORS = ["yellow", "green", "blue", "pink"];

function putHighlight(highlight) {
  const key = highlight?.source?.key;
  if (typeof highlight?.id !== "string" || typeof key !== "string" || typeof highlight.selector?.exact !== "string") {
    throw new Error("A highlight needs an id, a source key and a selector");
  }
  const data = readSource(key);
  const existing = data.highlights.find((entry) => entry.id === highlight.id);
  const now = new Date().toISOString();
  const saved = {
    ...existing,
    ...highlight,
    color: COLORS.includes(highlight.color) ? highlight.color : "yellow",
    createdAt: existing?.createdAt || highlight.createdAt || now,
    updatedAt: now,
  };
  data.highlights = [...data.highlights.filter((entry) => entry.id !== highlight.id), saved];
  data.source = { ...data.source, ...highlight.source };
  writeSource(data);
  return saved;
}

function removeHighlight(id, key) {
  const data = readSource(key);
  const before = data.highlights.length;
  data.highlights = data.highlights.filter((entry) => entry.id !== id);
  if (data.highlights.length !== before) writeSource(data);
  return before !== data.highlights.length;
}

module.exports = { listHighlights, putHighlight, removeHighlight };
