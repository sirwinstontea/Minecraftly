const { app } = require("electron");
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const store = require("./store");

// Link between the app and the Minecraftly Highlighter browser extension.
//
//   extension --(Chrome native messaging)--> minecraftly-host (native-host/host.js, run by
//   Minecraftly.exe in Node mode) --(named pipe, JSON lines)--> this server
//
// Only the extension IDs below may start the host (Chrome enforces allowed_origins).
const HOST_NAME = "com.minecraftly.host";
const EXTENSION_IDS = [
  "cholocphklpijolefnaicjojbclpihjh", // unpacked / self-hosted build (fixed by the key in extension/manifest.json)
];
const BROWSER_KEYS = [
  "Software\\Google\\Chrome\\NativeMessagingHosts",
  "Software\\Microsoft\\Edge\\NativeMessagingHosts",
  "Software\\Chromium\\NativeMessagingHosts",
];

// One pipe per Minecraftly data folder, so a test copy never talks to the installed app.
const pipePath = () => `\\\\.\\pipe\\minecraftly-${crypto.createHash("sha1").update(app.getPath("userData")).digest("hex").slice(0, 12)}`;

const connections = new Set();
const pending = new Map();
let nextRequest = 1;

function send(connection, message) {
  if (!connection.socket.destroyed) connection.socket.write(`${JSON.stringify(message)}\n`);
}

function reply(connection, message, payload) {
  send(connection, { type: "result", requestId: message.requestId, ...payload });
}

function handle(connection, message) {
  try {
    if (message.type === "hello") {
      connection.info = { browser: String(message.browser || ""), version: String(message.version || "") };
    } else if (message.type === "list") {
      reply(connection, message, { highlights: store.listHighlights(message.keys) });
    } else if (message.type === "put") {
      reply(connection, message, { highlight: store.putHighlight(message.highlight) });
    } else if (message.type === "remove") {
      reply(connection, message, { removed: store.removeHighlight(message.id, message.key) });
    } else if (message.type === "result" && pending.has(message.requestId)) {
      pending.get(message.requestId)(connection, message);
    }
  } catch (error) {
    reply(connection, message, { error: String(error.message || error) });
  }
}

function startBridge() {
  const server = net.createServer((socket) => {
    const connection = { socket, buffer: "", info: null };
    connections.add(connection);
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      connection.buffer += chunk;
      let newline = connection.buffer.indexOf("\n");
      while (newline !== -1) {
        const line = connection.buffer.slice(0, newline);
        connection.buffer = connection.buffer.slice(newline + 1);
        if (line.trim()) {
          try {
            handle(connection, JSON.parse(line));
          } catch { /* ignore malformed lines */ }
        }
        newline = connection.buffer.indexOf("\n");
      }
    });
    socket.on("close", () => connections.delete(connection));
    socket.on("error", () => connections.delete(connection));
  });
  server.on("error", () => { /* another copy owns this pipe; nothing to do */ });
  server.listen(pipePath());
  registerNativeHost();
}

function extensionConnected() {
  return connections.size > 0;
}

// Ask every connected browser to highlight its current selection. Only the browser window
// that is in front answers with something other than "no-focus".
function requestCapture(color, timeout = 900) {
  if (!connections.size) return Promise.resolve("not-connected");
  const requestId = `capture-${nextRequest++}`;
  return new Promise((resolve) => {
    let waiting = connections.size;
    const finish = (result) => {
      pending.delete(requestId);
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish("timeout"), timeout);
    pending.set(requestId, (connection, message) => {
      waiting -= 1;
      if (message.result && message.result !== "no-focus") finish(message.result);
      else if (waiting <= 0) finish("no-focus");
    });
    for (const connection of connections) send(connection, { type: "capture", requestId, color });
  });
}

// Tell Chrome/Edge where the host is: a .bat that runs host.js with Minecraftly.exe in Node
// mode, plus the host manifest, plus one registry value per browser. Rewritten on every start
// so it always points at the current install (and at this copy's pipe).
function registerNativeHost() {
  if (process.platform !== "win32") return;
  try {
    const folder = path.join(app.getPath("userData"), "native-host");
    fs.mkdirSync(folder, { recursive: true });
    const hostScript = app.isPackaged
      ? path.join(process.resourcesPath, "native-host", "host.js")
      : path.join(__dirname, "..", "..", "native-host", "host.js");
    const bat = path.join(folder, "minecraftly-host.bat");
    fs.writeFileSync(bat, [
      "@echo off",
      "set ELECTRON_RUN_AS_NODE=1",
      `"${process.execPath}" "${hostScript}" "${pipePath()}" %*`,
      "",
    ].join("\r\n"));
    const manifest = path.join(folder, `${HOST_NAME}.json`);
    fs.writeFileSync(manifest, JSON.stringify({
      name: HOST_NAME,
      description: "Minecraftly Highlighter link to the Minecraftly desktop app",
      path: bat,
      type: "stdio",
      allowed_origins: EXTENSION_IDS.map((id) => `chrome-extension://${id}/`),
    }, null, 2));
    for (const key of BROWSER_KEYS) {
      execFile("reg", ["add", `HKCU\\${key}\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"], { windowsHide: true }, () => {});
    }
  } catch { /* the extension simply won't connect */ }
}

module.exports = { startBridge, extensionConnected, requestCapture, HOST_NAME, BROWSER_KEYS };
