// Minecraftly Highlighter: background worker. Keeps one native-messaging connection to the
// Minecraftly desktop app (which stores the highlights and owns the Alt+Y shortcut) and passes
// messages between the app and the page scripts.
const HOST = "com.minecraftly.host";
const RETRY_MS = 10000;

let port = null;
let nextRequest = 1;
const waiting = new Map();

function connect() {
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch {
    port = null;
    setTimeout(connect, RETRY_MS);
    return;
  }
  port.onMessage.addListener(onAppMessage);
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // e.g. Minecraftly not installed
    port = null;
    for (const entry of waiting.values()) entry.fail(new Error("Minecraftly isn't running"));
    waiting.clear();
    setTimeout(connect, RETRY_MS);
  });
  port.postMessage({ type: "hello", browser: navigator.userAgent, version: chrome.runtime.getManifest().version });
}

// Request/response with the app.
function ask(message, timeout = 4000) {
  return new Promise((resolve, reject) => {
    if (!port) {
      reject(new Error("Minecraftly isn't running"));
      return;
    }
    const requestId = `ext-${nextRequest++}`;
    const timer = setTimeout(() => {
      waiting.delete(requestId);
      reject(new Error("Minecraftly didn't answer"));
    }, timeout);
    waiting.set(requestId, {
      done: (reply) => { clearTimeout(timer); resolve(reply); },
      fail: (error) => { clearTimeout(timer); reject(error); },
    });
    port.postMessage({ ...message, requestId });
  });
}

async function onAppMessage(message) {
  if (message.type === "result" && waiting.has(message.requestId)) {
    const entry = waiting.get(message.requestId);
    waiting.delete(message.requestId);
    entry.done(message);
  } else if (message.type === "capture") {
    const result = await capture(message.color);
    port?.postMessage({ type: "result", requestId: message.requestId, result });
  }
}

// Alt+Y was pressed while a browser was in front: highlight in this browser's active tab,
// but only if one of this browser's windows actually has the focus.
async function capture(color) {
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return "no-focus";
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab?.id) return "no-focus";
  try {
    // Every frame gets the message; only the frame that has the focus answers.
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "capture", color });
    return reply?.result || "no-selection";
  } catch {
    return "unsupported"; // pages extensions can't touch (browser settings, the web store, ...)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (["list", "put", "remove"].includes(message.type)) {
    ask(message).then(sendResponse, (error) => sendResponse({ error: String(error.message || error) }));
    return true; // answer asynchronously
  }
  if (message.type === "menu") {
    chrome.contextMenus.update("remove-highlight", { visible: Boolean(message.visible) }, () => void chrome.runtime.lastError);
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "remove-highlight", title: "Remove highlight", contexts: ["all"], visible: false });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "remove-highlight" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "remove-at-menu" }, { frameId: info.frameId }).catch(() => {});
  }
});

connect();
