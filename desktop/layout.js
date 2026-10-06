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

module.exports = { MARGIN, OVERLAY_SIZE, overlayBounds, dockedBounds, expandedBounds };
