// The to-do sign: one line = one to-do. Plain typing (no checkboxes); Enter makes a new
// line, Backspace at the start joins it with the line above, drag the grip (or Alt+Up/Down)
// to reorder, Ctrl+Z / Ctrl+Y undo and redo. Saved by the app as you type.
(() => {
  const api = window.todo;
  const list = document.querySelector(".lines-inner");
  const scroller = document.querySelector(".lines");
  const sign = document.querySelector(".sign");
  const status = document.querySelector(".status");
  let lines = [];
  let mode = "collapsed";
  const history = [];
  const future = [];
  let typingTimer = null;

  const newId = () => `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const indexOf = (id) => lines.findIndex((line) => line.id === id);
  const rowOf = (element) => element?.closest?.(".line");
  const textOf = (id) => list.querySelector(`.line[data-id="${CSS.escape(id)}"] .text`);

  // ---- drawing ----------------------------------------------------------------------------
  function render(focusId, offset) {
    list.replaceChildren(...lines.map((line) => {
      const row = document.createElement("div");
      row.className = "line";
      row.dataset.id = line.id;
      row.setAttribute("role", "listitem");
      const grip = document.createElement("div");
      grip.className = "grip";
      grip.title = "Drag to reorder";
      const text = document.createElement("div");
      text.className = "text";
      text.contentEditable = "plaintext-only";
      text.spellcheck = false;
      text.textContent = line.text;
      row.append(grip, text);
      return row;
    }));
    if (focusId) placeCaret(focusId, offset);
    changed();
  }

  function changed() {
    document.body.classList.toggle("is-empty", lines.length === 1 && !lines[0].text);
    api.saveLines(lines);
    reportHeight();
  }

  function reportHeight() {
    if (mode === "collapsed") return;
    const chrome = sign.offsetHeight - scroller.clientHeight;
    api.reportHeight(list.offsetHeight + chrome);
  }

  // ---- caret helpers ----------------------------------------------------------------------
  function placeCaret(id, offset = Infinity) {
    const element = textOf(id);
    if (!element) return;
    element.focus();
    const node = element.firstChild;
    const range = document.createRange();
    if (node) range.setStart(node, Math.min(offset, node.length));
    else range.setStart(element, 0);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    element.scrollIntoView({ block: "nearest" });
  }

  // [start, end] of the selection inside one line's text.
  function selectionIn(element) {
    const selection = getSelection();
    if (!selection.rangeCount) return [0, 0];
    const range = selection.getRangeAt(0);
    const measure = (container, offset) => {
      const before = document.createRange();
      before.selectNodeContents(element);
      before.setEnd(container, offset);
      return before.toString().length;
    };
    return [measure(range.startContainer, range.startOffset), measure(range.endContainer, range.endOffset)];
  }

  function caretOnEdgeLine(element, edge) {
    const selection = getSelection();
    if (!selection.rangeCount || !element.textContent) return true;
    const rects = selection.getRangeAt(0).getClientRects();
    const caret = rects[0] || selection.getRangeAt(0).getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return edge === "top" ? caret.top - box.top < 11 : box.bottom - caret.bottom < 11;
  }

  // ---- undo / redo ------------------------------------------------------------------------
  function snapshot() {
    const active = document.activeElement?.closest?.(".text");
    const focus = active ? { id: rowOf(active).dataset.id, offset: selectionIn(active)[0] } : null;
    return { lines: lines.map((line) => ({ ...line })), focus };
  }

  function remember() {
    history.push(snapshot());
    if (history.length > 200) history.shift();
    future.length = 0;
  }

  function restore(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    const state = from.pop();
    lines = state.lines;
    render(state.focus?.id, state.focus?.offset);
  }

  // ---- typing -----------------------------------------------------------------------------
  list.addEventListener("beforeinput", () => {
    if (!typingTimer) remember(); // one undo step per burst of typing
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { typingTimer = null; }, 800);
  });

  list.addEventListener("input", (event) => {
    const row = rowOf(event.target);
    const line = row && lines[indexOf(row.dataset.id)];
    if (!line) return;
    line.text = event.target.textContent.replace(/[\r\n]+/g, " ");
    changed();
  });

  list.addEventListener("keydown", (event) => {
    const element = event.target.closest?.(".text");
    if (!element) return;
    const id = rowOf(element).dataset.id;
    const index = indexOf(id);
    const line = lines[index];
    const [start, end] = selectionIn(element);
    const key = event.key;

    if (key === "Enter") {
      event.preventDefault();
      remember();
      const next = { id: newId(), text: line.text.slice(end) };
      line.text = line.text.slice(0, start);
      lines.splice(index + 1, 0, next);
      render(next.id, 0);
    } else if (key === "Backspace" && start === 0 && end === 0 && index > 0) {
      event.preventDefault();
      remember();
      const previous = lines[index - 1];
      const join = previous.text.length;
      previous.text += line.text;
      lines.splice(index, 1);
      render(previous.id, join);
    } else if (key === "Delete" && start === line.text.length && end === start && index < lines.length - 1) {
      event.preventDefault();
      remember();
      line.text += lines[index + 1].text;
      lines.splice(index + 1, 1);
      render(id, start);
    } else if (event.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
      event.preventDefault();
      const target = index + (key === "ArrowUp" ? -1 : 1);
      if (target < 0 || target >= lines.length) return;
      remember();
      lines.splice(index, 1);
      lines.splice(target, 0, line);
      render(id, start);
    } else if (key === "ArrowUp" && index > 0 && caretOnEdgeLine(element, "top")) {
      event.preventDefault();
      placeCaret(lines[index - 1].id, start);
    } else if (key === "ArrowDown" && index < lines.length - 1 && caretOnEdgeLine(element, "bottom")) {
      event.preventDefault();
      placeCaret(lines[index + 1].id, start);
    } else if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      restore(history, future);
    } else if ((event.ctrlKey || event.metaKey) && (key.toLowerCase() === "y" || (key.toLowerCase() === "z" && event.shiftKey))) {
      event.preventDefault();
      restore(future, history);
    } else if (key === "Escape") {
      event.preventDefault();
      element.blur();
      api.close();
    }
  });

  // Pasting several lines makes one to-do per line (formatting is dropped).
  list.addEventListener("paste", (event) => {
    const element = event.target.closest?.(".text");
    if (!element) return;
    event.preventDefault();
    const parts = (event.clipboardData.getData("text/plain") || "").replace(/\r/g, "").split("\n");
    remember();
    const index = indexOf(rowOf(element).dataset.id);
    const line = lines[index];
    const [start, end] = selectionIn(element);
    const after = line.text.slice(end);
    line.text = line.text.slice(0, start) + parts[0];
    const added = parts.slice(1).map((text) => ({ id: newId(), text }));
    lines.splice(index + 1, 0, ...added);
    const last = added[added.length - 1] || line;
    const caret = last.text.length;
    last.text += after;
    render(last.id, caret);
  });

  // ---- drag a line to reorder -------------------------------------------------------------
  let reorder = null;
  list.addEventListener("pointerdown", (event) => {
    const grip = event.target.closest(".grip");
    if (!grip || event.button !== 0) return;
    event.preventDefault();
    const row = rowOf(grip);
    reorder = { id: row.dataset.id, row, target: null, marker: document.createElement("div") };
    reorder.marker.className = "drop-marker";
    row.classList.add("is-dragging");
    grip.setPointerCapture(event.pointerId);
  });

  list.addEventListener("pointermove", (event) => {
    if (!reorder) return;
    const rows = [...list.querySelectorAll(".line")].filter((row) => row !== reorder.row);
    const before = rows.find((row) => {
      const box = row.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    reorder.target = before ? before.dataset.id : null; // null = to the end
    if (before) list.insertBefore(reorder.marker, before);
    else list.append(reorder.marker);
  });

  list.addEventListener("pointerup", () => {
    if (!reorder) return;
    const { id, target, marker } = reorder;
    marker.remove();
    reorder = null;
    remember();
    const [moved] = lines.splice(indexOf(id), 1);
    const at = target ? indexOf(target) : lines.length;
    lines.splice(at, 0, moved);
    render();
  });

  // ---- move (top strip) and resize (bottom-left corner) -----------------------------------
  function trackWindow(handle, compute) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const start = { x: event.screenX, y: event.screenY, wx: window.screenX, wy: window.screenY, w: innerWidth, h: innerHeight };
      let rect = null;
      handle.setPointerCapture(event.pointerId);
      const move = (e) => {
        rect = compute(start, e.screenX - start.x, e.screenY - start.y);
        api.drag("move", rect);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        api.drag("end", rect);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  trackWindow(document.querySelector(".top"), (s, dx, dy) => ({ x: s.wx + dx, y: s.wy + dy, width: s.w, height: s.h }));
  trackWindow(document.querySelector(".resize"), (s, dx, dy) => {
    const width = Math.max(200, s.w - dx);
    return { x: s.wx + s.w - width, y: s.wy, width, height: Math.max(120, s.h + dy), resized: true };
  });

  // ---- icon, save button, modes -----------------------------------------------------------
  document.querySelector(".icon").addEventListener("click", () => api.peek());

  let statusTimer;
  document.querySelector(".save").addEventListener("click", async () => {
    const { result } = await api.saveToInventory();
    status.textContent = {
      saved: "Saved to your inventory",
      full: "Your inventory is full",
      empty: "Nothing to save yet",
    }[result] || "Couldn't save";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; }, 2500);
  });

  api.onMode((next) => {
    const was = mode;
    mode = next;
    document.body.classList.toggle("is-collapsed", next === "collapsed");
    if (next === "collapsed") return;
    requestAnimationFrame(reportHeight);
    if (next === "peek" && was !== "peek") {
      const last = lines[lines.length - 1];
      requestAnimationFrame(() => placeCaret(last.id));
    }
  });

  new ResizeObserver(reportHeight).observe(list);

  api.load().then((saved) => {
    lines = Array.isArray(saved) && saved.length ? saved : [{ id: newId(), text: "" }];
    render();
  });
})();
