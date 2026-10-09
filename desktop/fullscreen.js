// Tells interested parts of Minecraftly (grass block, to-do list) when a fullscreen game,
// video or presentation is in front, so they can step aside. Windows reports this through
// SHQueryUserNotificationState; called via koffi (prebuilt). If it can't load, nothing hides.
const listeners = new Set();
let active = false;
let started = false;

function start() {
  if (started) return;
  started = true;
  let query;
  try {
    const koffi = require("koffi");
    query = koffi.load("shell32.dll").func("int __stdcall SHQueryUserNotificationState(_Out_ int *state)");
  } catch {
    return;
  }
  const BUSY = 2; // fullscreen app
  const D3D_FULLSCREEN = 3; // fullscreen game
  const PRESENTATION = 4;
  setInterval(() => {
    const state = [0];
    if (query(state) !== 0) return;
    const next = [BUSY, D3D_FULLSCREEN, PRESENTATION].includes(state[0]);
    if (next === active) return;
    active = next;
    for (const listener of listeners) listener(active);
  }, 1500);
}

function onFullscreenChange(listener) {
  listeners.add(listener);
  start();
}

const isFullscreen = () => active;

module.exports = { onFullscreenChange, isFullscreen };
