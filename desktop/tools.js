// Every tool is a page at tools/<id>/index.html, shown in its own pop-up panel.
// Add an entry here and it shows up in the tray menu (and gets its global hotkey).
const TOOLS = [
  {
    id: "book-and-quill",
    label: "Book && Quill", // "&&" renders as "&" in menus
    hotkey: "Alt+B",
    width: 420,
    height: Math.round(420 * 1206 / 1305) + 8,
  },
];

module.exports = { TOOLS, DEFAULT_TOOL: TOOLS[0] };
