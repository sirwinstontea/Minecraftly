// Slot behavior shared by the vertical bar and the full inventory:
// items in slots, hover tooltips, click to open, drag to move (drop on another item to
// swap), drop outside the panel or press Q to throw away (with Undo), right-click menu.
(() => {
  const api = window.minecraftly;
  const ICONS = { note: "../shared/icons/written-book.png" };
  const DRAG_THRESHOLD = 5;

  function formatDate(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  // panel: the .mc-panel element. slots: elements with data-index (inventory slot number).
  // clickThrough: let clicks outside the panel reach the windows below (the bar's window).
  function mount({ panel, clickThrough = false, onKey }) {
    const slots = [...panel.querySelectorAll(".slot[data-index]")];
    const tooltip = Object.assign(document.createElement("div"), { className: "tooltip", hidden: true });
    tooltip.innerHTML = '<div class="title"></div><div class="sub"></div>';
    const toast = Object.assign(document.createElement("div"), { className: "toast", hidden: true });
    toast.innerHTML = '<span></span><button class="mc-button" type="button">Undo</button>';
    document.body.append(tooltip, toast);

    let items = [];
    let hovered = null; // slot element under the pointer
    let press = null; // { item, slot, x, y, pointerId }
    let held = null; // <img> following the cursor while dragging
    let toastTimer;
    let throughState = null;

    const itemIn = (slot) => items.find((item) => item.slot === Number(slot.dataset.index));

    function render(next) {
      items = Array.isArray(next) ? next : items;
      for (const slot of slots) {
        const item = itemIn(slot);
        slot.replaceChildren();
        slot.title = "";
        if (!item) continue;
        const img = document.createElement("img");
        img.src = ICONS[item.type] || ICONS.note;
        img.alt = item.title || "Note";
        img.draggable = false;
        slot.append(img);
      }
      if (hovered) showTooltip(hovered);
    }

    function showTooltip(slot, x, y) {
      const item = slot && itemIn(slot);
      if (!item || held) {
        tooltip.hidden = true;
        return;
      }
      tooltip.querySelector(".title").textContent = item.title || "Untitled note";
      tooltip.querySelector(".sub").textContent = formatDate(item.updatedAt || item.createdAt);
      tooltip.hidden = false;
      const rect = slot.getBoundingClientRect();
      const px = x ?? rect.right;
      const py = y ?? rect.top;
      const { width, height } = tooltip.getBoundingClientRect();
      let left = px + 14;
      if (left + width > innerWidth - 4) left = Math.min(rect.left, px) - 14 - width;
      const top = Math.min(Math.max(4, py - height - 6), innerHeight - height - 4);
      tooltip.style.left = `${Math.max(4, left)}px`;
      tooltip.style.top = `${top}px`;
    }

    function setThrough(on) {
      if (!clickThrough || throughState === on) return;
      throughState = on;
      api.setClickThrough(on);
    }

    function showToast(text, onUndo) {
      clearTimeout(toastTimer);
      toast.querySelector("span").textContent = text;
      toast.querySelector("button").onclick = () => {
        toast.hidden = true;
        onUndo();
      };
      toast.hidden = false;
      const rect = panel.getBoundingClientRect();
      const { width, height } = toast.getBoundingClientRect();
      // Beside the bar (left of it) or under/over the full inventory, always inside the window.
      const left = clickThrough ? rect.left - width - 8 : rect.left + (rect.width - width) / 2;
      const top = clickThrough ? rect.bottom - height : Math.min(rect.bottom + 6, innerHeight - height - 2);
      toast.style.left = `${Math.max(4, left)}px`;
      toast.style.top = `${Math.max(2, top)}px`;
      toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
    }

    function throwAway(item) {
      if (item) api.inventory.remove(item.id);
    }

    api.inventory.onThrown((item) => {
      showToast(`Threw away "${item.title || "Untitled note"}"`, () => api.inventory.restore(item.id));
    });

    function endDrag() {
      held?.remove();
      held = null;
      press?.slot.classList.remove("is-source");
      for (const slot of slots) slot.classList.remove("is-target");
      press = null;
    }

    panel.addEventListener("pointerdown", (event) => {
      const slot = event.target.closest(".slot[data-index]");
      const item = slot && itemIn(slot);
      if (!item || event.button !== 0) return;
      press = { item, slot, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      slot.setPointerCapture(event.pointerId);
    });

    panel.addEventListener("pointermove", (event) => {
      if (!press || event.pointerId !== press.pointerId) return;
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD;
      if (!held && moved) {
        held = Object.assign(document.createElement("img"), { className: "held", src: ICONS[press.item.type] || ICONS.note });
        document.body.append(held);
        press.slot.classList.add("is-source");
        tooltip.hidden = true;
        setThrough(false);
      }
      if (!held) return;
      held.style.left = `${event.clientX}px`;
      held.style.top = `${event.clientY}px`;
      const over = document.elementFromPoint(event.clientX, event.clientY)?.closest(".slot[data-index]");
      for (const slot of slots) slot.classList.toggle("is-target", slot === over && slot !== press.slot);
    });

    panel.addEventListener("pointerup", (event) => {
      if (!press || event.pointerId !== press.pointerId) return;
      const { item, slot: from } = press;
      if (!held) {
        endDrag();
        api.inventory.open(item.id); // a plain click opens it
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const slot = target?.closest(".slot[data-index]");
      const rect = panel.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom;
      endDrag();
      if (slot && slot !== from) api.inventory.move(item.id, Number(slot.dataset.index));
      else if (outside) throwAway(item); // dropped outside the inventory, like Minecraft
    });

    panel.addEventListener("pointercancel", endDrag);

    panel.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const slot = event.target.closest(".slot[data-index]");
      const item = slot && itemIn(slot);
      if (item) api.inventory.menu(item.id);
    });

    // Special slots: + (new note) and the expand arrows.
    panel.addEventListener("click", (event) => {
      const action = event.target.closest(".slot[data-action]")?.dataset.action;
      if (action === "new-note") api.newNote();
      if (action === "expand") api.showTool("inventory");
    });

    document.addEventListener("pointerover", (event) => {
      hovered = event.target.closest?.(".slot[data-index]") || null;
      showTooltip(hovered, event.clientX, event.clientY);
    });

    document.addEventListener("pointermove", (event) => {
      if (hovered && !held) showTooltip(hovered, event.clientX, event.clientY);
      setThrough(!held && !event.target.closest?.(".mc-panel, .toast"));
    });

    document.addEventListener("pointerleave", () => {
      hovered = null;
      tooltip.hidden = true;
    });

    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.target.closest?.("input, textarea")) return;
      if (event.key === "Escape") {
        api.hide();
      } else if (event.key.toLowerCase() === "q" && hovered) {
        throwAway(itemIn(hovered));
      } else {
        onKey?.(event, (index) => items.find((item) => item.slot === index));
      }
    });

    api.inventory.onChanged(render);
    api.onOpened(async () => {
      panel.classList.add("is-open");
      render(await api.inventory.list());
    });
    api.onClosing(() => {
      panel.classList.remove("is-open");
      tooltip.hidden = true;
      endDrag();
    });

    api.inventory.list().then(render);
    return { items: () => items, showToast };
  }

  window.InventoryUI = { mount };
})();
