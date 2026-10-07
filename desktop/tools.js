// Every tool is a page at tools/<id>/index.html, shown in its own pop-up panel.
// Add an entry here and it shows up in the tray menu (and gets its global hotkey).
//   placement: "docked" (default; draggable, expandable), "hotbar" (rises from the
//              grass block) or "center" (centered on the screen)
//   expandsTo: summoning this tool again while it's open opens that tool instead
//   inMenu:    false hides it from the tray / grass-block menu
const TOOLS = [
  {
    id: "hotbar",
    label: "Hotbar",
    hotkey: "Alt+E", // E is Minecraft's inventory key
    placement: "hotbar",
    expandsTo: "inventory",
    inMenu: false,
  },
  {
    id: "inventory",
    label: "Inventory",
    placement: "center",
  },
  {
    id: "book-and-quill",
    label: "Book && Quill", // "&&" renders as "&" in menus
    hotkey: "Alt+B",
    width: 420,
    height: Math.round(420 * 1206 / 1305) + 8,
  },
];

const toolById = (id) => TOOLS.find((tool) => tool.id === id);

// What the grass block, tray icon and app shortcuts open.
module.exports = { TOOLS, DEFAULT_TOOL: toolById("hotbar"), toolById };
