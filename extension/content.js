// Minecraftly Highlighter: page script. Finds this page's saved highlights again and paints
// them with the CSS Custom Highlight API, which colors text ranges WITHOUT changing the page
// (safe for React apps, editors and anything else). Runs in every frame.
(() => {
  if (window.__minecraftlyHighlighter) return;
  window.__minecraftlyHighlighter = true;

  const { describe, locate, normalize, canonicalUrl } = window.MinecraftlyAnchor;
  const COLORS = { yellow: "#ffe45c", green: "#9be67a", blue: "#8fd3ff", pink: "#ffa3d1" };
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "IFRAME", "OBJECT"]);
  const supported = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";

  let highlights = []; // { record, status, start, end, range, healed }
  let model = null; // { raw, nodes: [{ node, start }], index: Map(node -> i) }
  let menuTarget = null;
  let href = location.href;

  // ---- this page's identity ------------------------------------------------------------
  const pageKey = () => canonicalUrl(location.href);
  function sourceKeys() {
    const keys = [pageKey()];
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (canonical) keys.push(canonicalUrl(canonical));
    return [...new Set(keys)];
  }
  const source = () => ({ kind: "web", key: pageKey(), url: location.href, title: document.title });

  // ---- the page's visible text, with a way back to DOM positions -------------------------
  function isVisible(element, cache) {
    if (cache.has(element)) return cache.get(element);
    const visible = typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
    cache.set(element, visible);
    return visible;
  }

  function buildModel() {
    const nodes = [];
    const index = new Map();
    const cache = new Map();
    let raw = "";
    const root = document.body || document.documentElement;
    if (!root) return { raw, nodes, index };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !node.nodeValue || SKIP.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return isVisible(parent, cache) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) {
      index.set(walker.currentNode, nodes.length);
      nodes.push({ node: walker.currentNode, start: raw.length });
      raw += walker.currentNode.nodeValue;
    }
    return { raw, nodes, index };
  }

  // Raw text offset -> [textNode, offsetInNode]
  function pointAt(offset) {
    const { nodes } = model;
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (nodes[mid].start <= offset) lo = mid;
      else hi = mid - 1;
    }
    const entry = nodes[lo];
    return [entry.node, Math.min(offset - entry.start, entry.node.nodeValue.length)];
  }

  function rangeFor(start, end) {
    if (!model.nodes.length) return null;
    const range = document.createRange();
    range.setStart(...pointAt(start));
    range.setEnd(...pointAt(end));
    return range;
  }

  // DOM boundary point -> raw text offset (the first visible text at or after it).
  function offsetOf(container, offset) {
    if (container.nodeType === Node.TEXT_NODE && model.index.has(container)) {
      return model.nodes[model.index.get(container)].start + offset;
    }
    const point = document.createRange();
    try {
      point.setStart(container, offset);
    } catch {
      return null;
    }
    const { nodes } = model;
    let lo = 0;
    let hi = nodes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (point.comparePoint(nodes[mid].node, 0) < 0) lo = mid + 1; // node starts before the point
      else hi = mid;
    }
    return lo < nodes.length ? nodes[lo].start : model.raw.length;
  }

  // ---- drawing ---------------------------------------------------------------------------
  function ensureStyle() {
    if (document.getElementById("minecraftly-highlighter-style")) return;
    const style = document.createElement("style");
    style.id = "minecraftly-highlighter-style";
    style.textContent = Object.entries(COLORS)
      .map(([color, value]) => `::highlight(minecraftly-${color}) { background-color: ${value}; color: #000; }`)
      .join("\n");
    (document.head || document.documentElement).append(style);
  }

  function render() {
    if (!supported) return;
    ensureStyle();
    for (const color of Object.keys(COLORS)) {
      const ranges = highlights
        .filter((entry) => entry.status === "anchored" && entry.range && (entry.record.color || "yellow") === color)
        .map((entry) => entry.range);
      if (ranges.length) CSS.highlights.set(`minecraftly-${color}`, new Highlight(...ranges));
      else CSS.highlights.delete(`minecraftly-${color}`);
    }
  }

  // ---- finding saved highlights on the page ----------------------------------------------
  function anchorAll() {
    model = buildModel();
    const normalized = normalize(model.raw);
    for (const entry of highlights) {
      const found = locate(model.raw, entry.record.selector, { normalized });
      entry.status = found.status;
      if (found.status !== "anchored") {
        entry.range = null;
        continue;
      }
      entry.start = found.start;
      entry.end = found.end;
      entry.range = rangeFor(found.start, found.end);
      // The text changed a little: remember the new wording so it keeps up with future edits.
      if (found.confidence < 1 && !entry.healed) {
        entry.healed = true;
        entry.record = { ...entry.record, selector: found.selector };
        chrome.runtime.sendMessage({ type: "put", highlight: entry.record }).catch(() => {});
      }
    }
    render();
  }

  async function load() {
    highlights = [];
    render();
    const reply = await chrome.runtime.sendMessage({ type: "list", keys: sourceKeys() }).catch(() => null);
    if (!reply || reply.error || !Array.isArray(reply.highlights)) return;
    highlights = reply.highlights.map((record) => ({ record, status: "pending" }));
    if (highlights.length) anchorAll();
  }

  // ---- Alt+Y -----------------------------------------------------------------------------
  // Only the frame that has the keyboard focus answers (the top page defers to a focused iframe).
  function ownsFocus() {
    if (!document.hasFocus()) return false;
    const active = document.activeElement;
    return !(active && (active.tagName === "IFRAME" || active.tagName === "FRAME"));
  }

  async function removeEntry(entry) {
    await chrome.runtime.sendMessage({ type: "remove", id: entry.record.id, key: entry.record.source.key }).catch(() => {});
    highlights = highlights.filter((other) => other !== entry);
  }

  // Same rules as everywhere in Minecraftly: on (or inside) a highlight -> remove it;
  // otherwise highlight the selection, merging any highlights it overlaps.
  async function toggle(color) {
    if (!supported) return "unsupported";
    const selection = getSelection();
    if (!selection || !selection.rangeCount) return "no-selection";
    anchorAll(); // fresh positions for the current page text
    const range = selection.getRangeAt(0);
    const from = offsetOf(range.startContainer, range.startOffset);
    const to = selection.isCollapsed ? from : offsetOf(range.endContainer, range.endOffset);
    if (from === null || to === null) return "no-selection";
    const anchored = highlights.filter((entry) => entry.status === "anchored");
    if (from === to) {
      const hit = anchored.find((entry) => entry.start <= from && from <= entry.end);
      if (!hit) return "no-selection";
      await removeEntry(hit);
      render();
      return "removed";
    }
    if (!model.raw.slice(from, to).trim()) return "no-selection";
    const overlapping = anchored.filter((entry) => entry.start < to && entry.end > from);
    const container = overlapping.find((entry) => entry.start <= from && to <= entry.end);
    if (container) {
      await removeEntry(container);
      render();
      return "removed";
    }
    const start = Math.min(from, ...overlapping.map((entry) => entry.start));
    const end = Math.max(to, ...overlapping.map((entry) => entry.end));
    for (const entry of overlapping) await removeEntry(entry);
    const record = { id: crypto.randomUUID(), color, source: source(), selector: describe(model.raw, start, end) };
    const reply = await chrome.runtime.sendMessage({ type: "put", highlight: record }).catch(() => null);
    if (!reply || reply.error) return "error";
    highlights.push({ record: reply.highlight || record, status: "anchored", start, end, range: rangeFor(start, end) });
    selection.collapseToEnd(); // so the new color isn't hidden under the blue selection
    render();
    return "created";
  }

  // ---- right-click "Remove highlight" ----------------------------------------------------
  function offsetAtPoint(x, y) {
    const caret = document.caretPositionFromPoint?.(x, y);
    if (caret) return offsetOf(caret.offsetNode, caret.offset);
    const range = document.caretRangeFromPoint?.(x, y);
    return range ? offsetOf(range.startContainer, range.startOffset) : null;
  }

  document.addEventListener("contextmenu", (event) => {
    menuTarget = null;
    if (model && highlights.length) {
      const offset = offsetAtPoint(event.clientX, event.clientY);
      if (offset !== null) {
        menuTarget = highlights.find((entry) => entry.status === "anchored" && entry.start <= offset && offset < entry.end) || null;
      }
    }
    chrome.runtime.sendMessage({ type: "menu", visible: Boolean(menuTarget) }).catch(() => {});
  }, true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "capture") {
      if (!ownsFocus()) {
        // The top page says "not focused" when nothing here has focus; otherwise the focused frame answers.
        if (window === window.top && !document.hasFocus()) sendResponse({ result: "no-focus" });
        return false;
      }
      toggle(message.color || "yellow").then((result) => sendResponse({ result }));
      return true;
    }
    if (message.type === "remove-at-menu" && menuTarget) {
      removeEntry(menuTarget).then(render);
      menuTarget = null;
    }
    return false;
  });

  // ---- keeping up with the page ----------------------------------------------------------
  // Pages that change their content (apps, infinite scroll, opened sections): find the
  // highlights again once things settle. Navigation without reload: load the new page's set.
  let settleTimer;
  new MutationObserver((mutations) => {
    if (!highlights.length) return;
    const ours = (node) => node?.id === "minecraftly-highlighter-style";
    const relevant = mutations.some((mutation) => !ours(mutation.target)
      && (mutation.type !== "attributes" || highlights.some((entry) => entry.status !== "anchored")));
    if (!relevant) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(anchorAll, 600);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "open", "aria-hidden", "aria-expanded"],
  });

  setInterval(() => {
    if (location.href === href) return;
    href = location.href;
    load();
  }, 1000);

  load();
})();
