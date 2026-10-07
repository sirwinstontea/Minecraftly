const { screen } = require("electron");

// The grass-block overlay owns the bottom-right corner of the main screen;
// tool panels dock just to its left so the two never overlap.
const MARGIN = 12;
const OVERLAY_SIZE = 48;

function overlayBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - OVERLAY_SIZE - MARGIN,
    y: area.y + area.height - OVERLAY_SIZE - MARGIN,
    width: OVERLAY_SIZE,
    height: OVERLAY_SIZE,
  };
}

function dockedBounds(area, { width, height }, overlayVisible) {
  const isPrimary = area.x === screen.getPrimaryDisplay().workArea.x
    && area.y === screen.getPrimaryDisplay().workArea.y;
  const reserve = overlayVisible && isPrimary ? OVERLAY_SIZE + MARGIN : 0;
  return {
    x: area.x + area.width - width - MARGIN - reserve,
    y: area.y + area.height - height - MARGIN,
    width,
    height,
  };
}

// "Expanded": as large as fits comfortably, centered on the screen, same proportions.
function expandedBounds(area, { width, height }) {
  const scale = Math.min((area.height * 0.88) / height, (area.width * 0.9) / width);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round((area.height - h) / 2), width: w, height: h };
}

// The vertical bar (plus, 9 hotbar slots, expand) rises from the grass block, right-aligned
// with it. Its window also has transparent room on the left for item tooltips; that part
// lets clicks through. Geometry must match tools/hotbar (frame 6px, 2 separators of 8px).
const BAR_TOOLTIP_SPACE = 240;
const BAR_CELLS = 11;
const BAR_CHROME = 28;

function hotbarBounds() {
  const block = overlayBounds();
  const area = screen.getPrimaryDisplay().workArea;
  const available = block.y - area.y - MARGIN * 2;
  const slot = Math.max(24, Math.min(44, Math.floor((available - BAR_CHROME) / BAR_CELLS)));
  const barWidth = slot + 12;
  const height = slot * BAR_CELLS + BAR_CHROME;
  return {
    x: block.x + block.width - barWidth - BAR_TOOLTIP_SPACE,
    y: block.y - Math.round(MARGIN / 2) - height,
    width: barWidth + BAR_TOOLTIP_SPACE,
    height,
  };
}

// The full inventory (27 storage + 9 hotbar), centered on the screen the mouse is on.
// Geometry must match tools/inventory: 9 slots wide; 4 rows plus title, gaps and frame.
const INVENTORY_MARGIN = 24;

function inventoryBounds(area) {
  const slot = Math.max(32, Math.min(60, Math.floor((area.width * 0.55) / 9), Math.floor((area.height * 0.7 - 58) / 4)));
  const width = slot * 9 + 20 + INVENTORY_MARGIN * 2;
  const height = slot * 4 + 58 + INVENTORY_MARGIN * 2;
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
}

module.exports = {
  MARGIN, OVERLAY_SIZE, overlayBounds, dockedBounds, expandedBounds, hotbarBounds, inventoryBounds,
};
