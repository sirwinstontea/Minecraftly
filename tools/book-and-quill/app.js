(() => {
  const storageKey = "book-and-quill-note";
  const editor = document.querySelector("#book-text");
  const pageCount = document.querySelector("#page-count");
  const previousButton = document.querySelector("#previous-page");
  const nextButton = document.querySelector("#next-page");
  const exportButton = document.querySelector("#export-button");
  const exportDialog = document.querySelector("#export-dialog");
  const closeExportButton = document.querySelector("#close-export");
  const printDocument = document.querySelector("#print-document");
  const doneButton = document.querySelector("#done-button");
  const scene = document.querySelector(".scene");
  const caret = document.querySelector("#underscore-caret");
  const shell = window.minecraftly;
  const measure = document.createElement("div");
  let pages = [[]];
  let manualBreaks = [];
  let currentPage = 0;
  let resizeTimer;
  let saveTimer;
  let caretFrame = 0;

  Object.assign(measure.style, {
    position: "absolute",
    left: "-10000px",
    top: "0",
    height: "auto",
    minHeight: "0",
    padding: "0",
    border: "0",
    overflow: "visible",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "normal",
    visibility: "hidden",
    pointerEvents: "none",
  });
  scene.append(measure);

  function appendRun(runs, text, bold = false, italic = false) {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.bold === bold && last.italic === italic) last.text += text;
    else runs.push({ text, bold, italic });
  }

  function normalizeRuns(runs) {
    const result = [];
    for (const run of runs || []) {
      if (run && typeof run.text === "string") {
        appendRun(result, run.text, Boolean(run.bold), Boolean(run.italic));
      }
    }
    return result;
  }

  function textOf(runs) {
    return runs.map((run) => run.text).join("");
  }

  function lengthOf(runs) {
    return runs.reduce((length, run) => length + run.text.length, 0);
  }

  function joinRuns(...lists) {
    const result = [];
    for (const list of lists) {
      for (const run of list) appendRun(result, run.text, run.bold, run.italic);
    }
    return result;
  }

  function sliceRuns(runs, start, end = lengthOf(runs)) {
    const result = [];
    let position = 0;
    for (const run of runs) {
      const next = position + run.text.length;
      const from = Math.max(0, start - position);
      const to = Math.min(run.text.length, end - position);
      if (to > from) appendRun(result, run.text.slice(from, to), run.bold, run.italic);
      position = next;
      if (position >= end) break;
    }
    return result;
  }

  function escapeText(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function runsToHtml(runs) {
    return runs.map((run) => {
      const classes = ["text-run"];
      if (run.bold) classes.push("is-bold");
      if (run.italic) classes.push("is-italic");
      return `<span class="${classes.join(" ")}">${escapeText(run.text)}</span>`;
    }).join("");
  }

  function runsFromDom(root) {
    const runs = [];
    let topLevelBlocks = 0;

    function visit(node, bold = false, italic = false, insideBlock = false) {
      if (node.nodeType === Node.TEXT_NODE) {
        appendRun(runs, node.nodeValue || "", bold, italic);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
        if (node.dataset.pad) return;
        appendRun(runs, "\n", bold, italic);
        return;
      }

      const tag = node.nodeType === Node.ELEMENT_NODE ? node.tagName : "";
      const block = tag === "DIV" || tag === "P" || tag === "LI";
      const style = node.nodeType === Node.ELEMENT_NODE ? node.style : null;
      const weight = style?.fontWeight || "";
      let nextBold = bold || tag === "B" || tag === "STRONG"
        || node.classList?.contains("is-bold")
        || weight === "bold" || Number.parseInt(weight, 10) >= 600;
      let nextItalic = italic || tag === "I" || tag === "EM"
        || node.classList?.contains("is-italic") || style?.fontStyle === "italic";
      if (weight) nextBold = weight === "bold" || Number.parseInt(weight, 10) >= 600;
      if (style?.fontStyle) nextItalic = style.fontStyle === "italic";

      if (block && !insideBlock) {
        if (topLevelBlocks > 0 || runs.length > 0) appendRun(runs, "\n", bold, italic);
        topLevelBlocks += 1;
      }

      const children = Array.from(node.childNodes || []);
      const emptyBlockPlaceholder = block && children.length === 1
        && children[0].nodeType === Node.ELEMENT_NODE && children[0].tagName === "BR";
      if (!emptyBlockPlaceholder) {
        for (const child of children) visit(child, nextBold, nextItalic, insideBlock || block);
      }
    }

    for (const child of Array.from(root.childNodes || [])) visit(child);
    return normalizeRuns(runs);
  }

  function selectionOffset(node, offset) {
    if (!node || (node !== editor && !editor.contains(node))) return 0;
    const range = document.createRange();
    range.selectNodeContents(editor);
    try {
      range.setEnd(node, offset);
    } catch {
      return 0;
    }
    return lengthOf(runsFromDom(range.cloneContents()));
  }

  function selectionOffsets() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.anchorNode || !selection.focusNode
      || (selection.anchorNode !== editor && !editor.contains(selection.anchorNode))
      || (selection.focusNode !== editor && !editor.contains(selection.focusNode))) {
      return { anchor: lengthOf(pages[currentPage] || []), focus: lengthOf(pages[currentPage] || []) };
    }
    return {
      anchor: selectionOffset(selection.anchorNode, selection.anchorOffset),
      focus: selectionOffset(selection.focusNode, selection.focusOffset),
    };
  }

  function setSelectionOffset(offset) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let lastText = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      lastText = node;
      if (remaining <= node.nodeValue.length) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.collapse(node, remaining);
        return;
      }
      remaining -= node.nodeValue.length;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    if (lastText) selection.collapse(lastText, lastText.nodeValue.length);
    else selection.collapse(editor, 0);
  }

  function fitProbe(runs) {
    const style = getComputedStyle(editor);
    measure.style.width = `${editor.clientWidth}px`;
    measure.style.font = style.font;
    measure.style.lineHeight = style.lineHeight;
    measure.style.letterSpacing = style.letterSpacing;
    measure.style.wordSpacing = style.wordSpacing;
    measure.innerHTML = runsToHtml(runs) || " ";
    return measure.getBoundingClientRect().height <= editor.clientHeight + 1;
  }

  function splitPage(runs) {
    const total = lengthOf(runs);
    if (fitProbe(runs)) return [runs, []];

    let low = 0;
    let high = total;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fitProbe(sliceRuns(runs, 0, middle))) low = middle;
      else high = middle - 1;
    }

    let cut = low;
    const content = textOf(runs);
    const searchStart = Math.max(0, cut - 120);
    const tail = content.slice(searchStart, cut);
    const match = tail.match(/[^\s][ \t\n]+[^\s]*$/);
    if (match) {
      const breakAt = tail.lastIndexOf(" ", match.index + match[0].length - 1);
      const tabAt = tail.lastIndexOf("\t", match.index + match[0].length - 1);
      const lineAt = tail.lastIndexOf("\n", match.index + match[0].length - 1);
      cut = searchStart + Math.max(breakAt, tabAt, lineAt) + 1;
    }

    if (cut <= 0) cut = Math.max(1, low);
    return [sliceRuns(runs, 0, cut), sliceRuns(runs, cut, total)];
  }

  function flowPages(runs) {
    const total = lengthOf(runs);
    if (!total) return [[]];
    const result = [];
    let remaining = runs;
    while (lengthOf(remaining)) {
      const [page, rest] = splitPage(remaining);
      result.push(page);
      if (!lengthOf(rest) || lengthOf(rest) === lengthOf(remaining)) break;
      remaining = rest;
    }
    return result.length ? result : [[]];
  }

  function paginate(runs, breaks = manualBreaks) {
    const total = lengthOf(runs);
    const boundaries = [...new Set(breaks)]
      .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= total)
      .sort((a, b) => a - b);
    const result = [];
    let start = 0;

    for (const boundary of boundaries) {
      result.push(...flowPages(sliceRuns(runs, start, boundary)));
      start = boundary;
    }

    if (start < total) result.push(...flowPages(sliceRuns(runs, start, total)));
    else if (boundaries.includes(start)) result.push([]);

    return result.length ? result : [[]];
  }

  function documentRuns() {
    return joinRuns(...pages);
  }

  function documentText() {
    return textOf(documentRuns());
  }

  function downloadFile(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function markdownFromRuns(runs) {
    return runs.map((run) => {
      const marker = run.bold && run.italic ? "***"
        : run.bold ? "**"
          : run.italic ? "*" : "";
      return `${marker}${run.text}${marker}`;
    }).join("");
  }

  function escapeXml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function wordRunXml(run) {
    const properties = [
      '<w:rFonts w:ascii="Minecraft" w:hAnsi="Minecraft" w:eastAsia="Minecraft" w:cs="Minecraft"/>',
      ...(run.bold ? ["<w:b/>"] : []),
      ...(run.italic ? ["<w:i/>"] : []),
      '<w:color w:val="17140D"/>',
      '<w:sz w:val="24"/>',
    ].join("");
    return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
  }

  function paragraphsFromRuns(runs) {
    const paragraphs = [[]];
    for (const run of runs) {
      const parts = run.text.split("\n");
      parts.forEach((part, index) => {
        if (part) paragraphs[paragraphs.length - 1].push({ ...run, text: part });
        if (index < parts.length - 1) paragraphs.push([]);
      });
    }
    return paragraphs;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipStoredFiles(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const contents = encoder.encode(file.contents);
      const checksum = crc32(contents);
      const localHeader = new Uint8Array(30 + name.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, contents.length, true);
      localView.setUint32(22, contents.length, true);
      localView.setUint16(26, name.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(name, 30);
      localParts.push(localHeader, contents);

      const centralHeader = new Uint8Array(46 + name.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 33, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, contents.length, true);
      centralView.setUint32(24, contents.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, localOffset, true);
      centralHeader.set(name, 46);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + contents.length;
    }

    const centralDirectory = new Uint8Array(centralParts.reduce((sum, part) => sum + part.length, 0));
    let centralOffset = 0;
    for (const part of centralParts) {
      centralDirectory.set(part, centralOffset);
      centralOffset += part.length;
    }

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localOffset, true);
    endView.setUint16(20, 0, true);

    return new Blob([...localParts, centralDirectory, end], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  function buildDocx(runs) {
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>';
    const relationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>';
    const paragraphs = paragraphsFromRuns(runs).map((paragraph) => (
      `<w:p>${paragraph.map(wordRunXml).join("")}</w:p>`
    )).join("");
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + `<w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>`
      + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>'
      + '</w:sectPr></w:body></w:document>';

    return zipStoredFiles([
      { name: "[Content_Types].xml", contents: contentTypes },
      { name: "_rels/.rels", contents: relationships },
      { name: "word/document.xml", contents: documentXml },
    ]);
  }

  function makePrintDocument() {
    printDocument.replaceChildren();
    pages.forEach((runs, index) => {
      const page = document.createElement("section");
      page.className = "print-page";
      const printScene = document.createElement("div");
      printScene.className = "scene print-scene";
      const artwork = document.createElement("img");
      artwork.className = "artwork";
      artwork.src = "assets/book-and-quill.png";
      artwork.alt = "";
      artwork.draggable = false;
      const count = document.createElement("div");
      count.className = "page-count";
      count.textContent = `Page ${index + 1} of ${pages.length}`;
      const writing = document.createElement("div");
      writing.className = "writing-area print-writing";
      writing.innerHTML = runsToHtml(runs);
      printScene.append(artwork, count, writing);
      // Crop to just the book: the artwork also draws Export/Done buttons below it.
      const crop = document.createElement("div");
      crop.className = "print-crop";
      crop.append(printScene);
      page.append(crop);
      printDocument.append(page);
    });
    return Promise.all([...printDocument.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
  }

  // File name from what the note says: its first line, trimmed to a few words,
  // with characters Windows doesn't allow in file names removed.
  function noteFileName(extension) {
    const firstLine = documentText().split("\n").map((line) => line.trim()).find(Boolean) || "";
    let name = firstLine
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .split(/\s+/).filter(Boolean).slice(0, 8).join(" ")
      .slice(0, 60)
      .replace(/[\s.]+$/, "");
    if (!name || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = "Untitled note";
    return `${name}.${extension}`;
  }

  function closeExportMenu(restoreFocus = true) {
    const wasOpen = !exportDialog.hidden;
    exportDialog.hidden = true;
    exportButton.setAttribute("aria-expanded", "false");
    if (wasOpen && restoreFocus) exportButton.focus();
  }

  function openExportMenu() {
    save();
    exportDialog.hidden = false;
    exportButton.setAttribute("aria-expanded", "true");
    exportDialog.querySelector("[data-export]").focus();
  }

  function exportMarkdown() {
    const content = markdownFromRuns(documentRuns());
    downloadFile(noteFileName("md"), new Blob([content], { type: "text/markdown;charset=utf-8" }));
  }

  function exportDocx() {
    downloadFile(noteFileName("docx"), buildDocx(documentRuns()));
  }

  async function exportPdf() {
    await makePrintDocument();
    if (!shell) {
      // Browsers suggest the page title as the PDF's file name.
      const title = document.title;
      document.title = noteFileName("pdf").replace(/\.pdf$/, "");
      window.addEventListener("afterprint", () => { document.title = title; }, { once: true });
      window.print();
      return;
    }
    try { await shell.exportPdf(noteFileName("pdf")); } finally { printDocument.replaceChildren(); }
  }

  let pageSound;
  function playPageSound() {
    if (pageSound === undefined) {
      pageSound = null;
      const audio = new Audio("assets/page-turn.ogg");
      audio.addEventListener("canplaythrough", () => { pageSound = audio; }, { once: true });
    }
    if (pageSound) {
      pageSound.currentTime = 0;
      pageSound.play().catch(() => {});
      return;
    }
    try {
      const context = playPageSound.context || (playPageSound.context = new AudioContext());
      const length = Math.floor(context.sampleRate * 0.12);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = 2400;
      filter.Q.value = 0.8;
      gain.gain.value = 0.35;
      source.connect(filter).connect(gain).connect(context.destination);
      source.start();
    } catch { /* sound is optional */ }
  }

  // The note being written. It survives closing the book (Esc / clicking away) until Done files it.
  function newDraft() {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { id: `note-${id}`, createdAt: new Date().toISOString() };
  }

  let draft = newDraft();
  // Saves happen while the book is open (typing, closing), so this is "last used".
  let lastSavedAt = 0;
  const IDLE_RESET_MS = 10 * 60 * 1000;

  function save() {
    clearTimeout(saveTimer);
    lastSavedAt = Date.now();
    try {
      const runs = documentRuns();
      localStorage.setItem(storageKey, JSON.stringify({
        ...draft, savedAt: lastSavedAt, text: textOf(runs), runs, breaks: manualBreaks,
      }));
    } catch { /* Keep the book usable without storage. */ }
  }

  function hasContent() {
    return documentText().trim().length > 1;
  }

  function refreshActions() {
    const ready = hasContent();
    exportButton.disabled = !ready;
    doneButton.disabled = !ready;
  }

  // Files the note into the Minecraftly inventory (the app's, or this browser's when run standalone).
  async function storeNote() {
    const runs = documentRuns();
    const text = textOf(runs);
    const item = {
      ...draft,
      type: "note",
      tool: "book-and-quill",
      title: (text.split("\n").find((line) => line.trim()) || "Untitled").trim().slice(0, 60),
      text,
      runs,
      breaks: manualBreaks,
      pageCount: pages.length,
    };
    if (shell) {
      await shell.inventory.put(item);
      return;
    }
    const key = "minecraftly-inventory";
    const items = JSON.parse(localStorage.getItem(key) || "[]").filter((entry) => entry.id !== item.id);
    localStorage.setItem(key, JSON.stringify([{ ...item, updatedAt: new Date().toISOString() }, ...items]));
  }

  // After 10+ minutes without the book open, it starts blank again. An unfinished
  // note is filed into the inventory first, so nothing is lost. Returns true if it reset.
  async function resetIfIdle({ focus = false } = {}) {
    if (Date.now() - lastSavedAt < IDLE_RESET_MS) return false;
    if (hasContent()) {
      try {
        await storeNote();
      } catch {
        return false; // Couldn't file it: keep showing it rather than lose it.
      }
    }
    startBlankNote({ focus });
    return true;
  }

  function startBlankNote({ focus = false } = {}) {
    draft = newDraft();
    pages = [[]];
    manualBreaks = [];
    currentPage = 0;
    save();
    renderPage({ focus, caretOffset: 0 });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 180);
  }

  function refreshPageControls() {
    pageCount.textContent = `Page ${currentPage + 1} of ${pages.length}`;
    previousButton.hidden = pages.length < 2;
    previousButton.disabled = currentPage === 0;
    previousButton.setAttribute("aria-disabled", String(previousButton.disabled));
    nextButton.setAttribute("aria-label", currentPage < pages.length - 1 ? "Next page" : "Add a page");
    refreshActions();
  }

  function refreshCaret() {
    const selection = window.getSelection();
    if (document.activeElement !== editor || !editor.isContentEditable || !selection?.isCollapsed
      || !selection.anchorNode || (selection.anchorNode !== editor && !editor.contains(selection.anchorNode))) {
      caret.classList.remove("visible");
      return;
    }

    const live = selection.getRangeAt(0);
    let liveRect = live.getClientRects()[0];
    if (!liveRect && selection.anchorNode.nodeType === Node.ELEMENT_NODE) {
      const node = selection.anchorNode;
      const child = node === editor ? node.childNodes[selection.anchorOffset] : null;
      const target = child?.nodeType === Node.ELEMENT_NODE ? child
        : node;
      const box = target && target !== editor ? target.getBoundingClientRect() : null;
      if (box && box.height) {
        const fontSize = Number.parseFloat(getComputedStyle(editor).fontSize) || 0;
        const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || box.height;
        liveRect = { left: box.left, bottom: box.top + (lineHeight + fontSize) / 2 };
      }
    }
    if (liveRect) {
      caret.classList.add("visible");
      const sceneBox = scene.getBoundingClientRect();
      caret.style.left = `${Math.round(liveRect.left - sceneBox.left)}px`;
      caret.style.top = `${Math.round(liveRect.bottom - sceneBox.top - (caret.offsetHeight || 2))}px`;
      caret.classList.add("visible");
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    measure.style.width = `${editor.clientWidth}px`;
    const style = getComputedStyle(editor);
    measure.style.font = style.font;
    measure.style.lineHeight = style.lineHeight;
    measure.style.letterSpacing = style.letterSpacing;
    measure.style.wordSpacing = style.wordSpacing;
    measure.innerHTML = runsToHtml(runsFromDom(range.cloneContents()));
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    measure.append(marker);
    const editorRect = editor.getBoundingClientRect();
    const measureRect = measure.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const left = editorRect.left - sceneRect.left + markerRect.left - measureRect.left - editor.scrollLeft;
    const top = editorRect.top - sceneRect.top + markerRect.bottom - measureRect.top - editor.scrollTop
      - (caret.offsetHeight || 2);
    caret.style.left = `${Math.round(left)}px`;
    caret.style.top = `${Math.round(top)}px`;
    caret.classList.add("visible");
  }

  function scheduleCaretRefresh() {
    if (caretFrame) return;
    caretFrame = requestAnimationFrame(() => {
      caretFrame = 0;
      refreshCaret();
    });
  }

  function pageStart(pageIndex) {
    return pages.slice(0, pageIndex).reduce((sum, page) => sum + lengthOf(page), 0);
  }

  function locateCaret(offset, preferredPage = null) {
    if (preferredPage !== null && preferredPage >= 0 && preferredPage < pages.length) {
      const start = pageStart(preferredPage);
      const end = start + lengthOf(pages[preferredPage]);
      if (offset >= start && offset <= end) return { page: preferredPage, caret: offset - start };
    }

    let start = 0;
    for (let page = 0; page < pages.length; page += 1) {
      const end = start + lengthOf(pages[page]);
      if (offset <= end || page === pages.length - 1) {
        return { page, caret: Math.max(0, Math.min(offset - start, lengthOf(pages[page]))) };
      }
      start = end;
    }
    return { page: 0, caret: 0 };
  }

  function renderPage({ focus = false, caretOffset = null } = {}) {
    editor.innerHTML = runsToHtml(pages[currentPage] ?? []);
    // A trailing "\n" renders no blank line in pre-wrap; pad it so the real caret lands where the underscore is drawn.
    if (textOf(pages[currentPage] ?? []).endsWith("\n")) {
      const pad = document.createElement("br");
      pad.dataset.pad = "1";
      editor.append(pad);
    }
    refreshPageControls();
    if (focus) editor.focus();
    if (caretOffset !== null) setSelectionOffset(caretOffset);
    refreshCaret();
  }

  function onInput() {
    const oldRuns = pages[currentPage] ?? [];
    const oldLength = lengthOf(oldRuns);
    const nextRuns = runsFromDom(editor);
    const nextLength = lengthOf(nextRuns);
    const selection = selectionOffsets();
    const start = pageStart(currentPage);
    const end = start + oldLength;

    if (nextLength < oldLength) {
      manualBreaks = manualBreaks.filter((boundary) => boundary < start);
      const combined = joinRuns(...pages.slice(0, currentPage), nextRuns, ...pages.slice(currentPage + 1));
      pages = paginate(combined, manualBreaks);
      const position = locateCaret(start + selection.anchor, Math.max(0, currentPage - 1));
      currentPage = position.page;
      renderPage({ focus: true, caretOffset: position.caret });
      scheduleSave();
      return;
    }

    const delta = nextLength - oldLength;
    manualBreaks = manualBreaks.map((boundary) => {
      if (boundary === start) return boundary;
      return boundary >= end ? boundary + delta : boundary;
    });

    if (editor.scrollHeight > editor.clientHeight + 1) {
      const combined = joinRuns(...pages.slice(0, currentPage), nextRuns, ...pages.slice(currentPage + 1));
      pages = paginate(combined, manualBreaks);
      const position = locateCaret(start + selection.anchor, currentPage);
      currentPage = position.page;
      renderPage({ focus: true, caretOffset: position.caret });
    } else {
      pages[currentPage] = nextRuns;
      scheduleCaretRefresh();
      refreshActions();
    }
    scheduleSave();
  }

  function goToPage(page) {
    save();
    currentPage = Math.max(0, Math.min(page, pages.length - 1));
    renderPage({ focus: true, caretOffset: lengthOf(pages[currentPage]) });
  }

  editor.addEventListener("input", onInput);
  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i") {
        event.preventDefault();
        document.execCommand(key === "b" ? "bold" : "italic", false);
        onInput();
      }
    }
  });
  editor.addEventListener("keyup", scheduleCaretRefresh);
  editor.addEventListener("click", scheduleCaretRefresh);
  editor.addEventListener("select", scheduleCaretRefresh);
  editor.addEventListener("scroll", scheduleCaretRefresh);
  editor.addEventListener("focus", scheduleCaretRefresh);
  editor.addEventListener("blur", scheduleCaretRefresh);
  document.addEventListener("selectionchange", scheduleCaretRefresh);

  previousButton.addEventListener("click", () => {
    if (currentPage > 0) goToPage(currentPage - 1);
  });

  nextButton.addEventListener("click", () => {
    if (currentPage < pages.length - 1) {
      goToPage(currentPage + 1);
      return;
    }
    if (!lengthOf(pages[currentPage])) return;

    manualBreaks.push(lengthOf(documentRuns()));
    pages = paginate(documentRuns(), manualBreaks);
    currentPage = pages.length - 1;
    save();
    renderPage({ focus: true, caretOffset: 0 });
  });

  function runExport(format) {
    if (format === "pdf") exportPdf();
    else if (format === "docx") exportDocx();
    else if (format === "markdown") exportMarkdown();
  }

  exportButton.addEventListener("click", async () => {
    if (!hasContent()) return;
    if (!shell) {
      openExportMenu();
      return;
    }
    // In the desktop app the menu opens centered on the screen, not inside the small book window.
    save();
    const options = [...exportDialog.querySelectorAll("[data-export]")]
      .map((button) => ({ id: button.dataset.export, label: button.textContent }));
    runExport(await shell.choose(exportDialog.querySelector("h1").textContent, options));
  });

  closeExportButton.addEventListener("click", () => closeExportMenu());

  exportDialog.addEventListener("click", (event) => {
    if (event.target === exportDialog) closeExportMenu();
  });

  exportDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeExportMenu();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(exportDialog.querySelectorAll("button:not([disabled])"));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  exportDialog.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      const format = button.dataset.export;
      save();
      closeExportMenu();
      runExport(format);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!exportDialog.hidden) closeExportMenu();
    else if (shell) {
      save();
      shell.hide();
    }
  });

  window.addEventListener("afterprint", () => printDocument.replaceChildren());

  // Done: file the note into the inventory, close the book, and start the next note blank.
  doneButton.addEventListener("click", async () => {
    if (!hasContent()) return;
    save();
    try {
      await storeNote();
    } catch {
      return; // Keep the draft (it is still saved) rather than lose the note.
    }
    editor.blur();
    shell?.hide();
    startBlankNote({ focus: !shell });
  });

  if (shell) {
    const dragStrip = document.createElement("div");
    dragStrip.className = "drag-strip";
    scene.append(dragStrip);

    shell.onOpened(async () => {
      scene.classList.add("is-open");
      playPageSound();
      closeExportMenu(false);
      if (!(await resetIfIdle({ focus: true }))) {
        renderPage({ focus: true, caretOffset: lengthOf(pages[currentPage] ?? []) });
      }
    });

    // Expand to the middle of the screen / minimize back to the corner.
    const resizeToggle = document.querySelector("#resize-toggle");
    const resizeIcon = resizeToggle.querySelector("img");
    let mode = "docked";
    const showMode = (next) => {
      mode = next;
      const expanded = mode === "expanded";
      resizeIcon.src = expanded ? "assets/minimize.png" : "assets/expand.png";
      resizeToggle.setAttribute("aria-label", expanded ? "Minimize" : "Expand");
      resizeToggle.title = expanded ? "Minimize" : "Expand";
    };
    resizeToggle.hidden = false;
    resizeToggle.addEventListener("click", () => shell.setMode(mode === "expanded" ? "docked" : "expanded"));
    shell.onMode((next) => {
      showMode(next);
      editor.focus();
    });
    showMode("docked");
    shell.onClosing(() => {
      save();
      scene.classList.remove("is-open");
      playPageSound();
    });
  }

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const oldOffset = pageStart(currentPage) + selectionOffsets().anchor;
      const hadFocus = document.activeElement === editor;
      pages = paginate(documentRuns(), manualBreaks);
      const position = locateCaret(oldOffset);
      currentPage = position.page;
      renderPage({ focus: hadFocus, caretOffset: position.caret });
      save();
    }, 120);
  });

  window.addEventListener("pagehide", save);

  async function initialize() {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        let parsed;
        try { parsed = JSON.parse(stored); } catch { parsed = null; }
        if (Array.isArray(parsed) && parsed.every((page) => typeof page === "string")) {
          pages = paginate([{ text: parsed.join(""), bold: false, italic: false }], []);
        } else if (typeof parsed === "string") {
          pages = paginate([{ text: parsed, bold: false, italic: false }], []);
        } else if (parsed && typeof parsed.text === "string") {
          if (typeof parsed.id === "string") draft = { id: parsed.id, createdAt: parsed.createdAt };
          if (Number.isFinite(parsed.savedAt)) lastSavedAt = parsed.savedAt;
          const runs = Array.isArray(parsed.runs)
            ? normalizeRuns(parsed.runs)
            : [{ text: parsed.text, bold: false, italic: false }];
          manualBreaks = Array.isArray(parsed.breaks)
            ? parsed.breaks.filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= lengthOf(runs))
            : [];
          pages = paginate(runs, manualBreaks);
        } else if (parsed === null) {
          pages = paginate([{ text: stored, bold: false, italic: false }], []);
        }
      }
    } catch {
      pages = [[]];
      manualBreaks = [];
    }
    currentPage = pages.length - 1;
    if (!(await resetIfIdle({ focus: true }))) {
      renderPage({ focus: true, caretOffset: lengthOf(pages[currentPage] ?? []) });
    }
  }

  document.fonts.load("400 24px Minecraft");
  document.fonts.load("700 24px Minecraft");
  document.fonts.load("italic 400 24px Minecraft");
  document.fonts.ready.then(initialize);
})();
