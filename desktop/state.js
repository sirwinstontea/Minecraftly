const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// Small JSON file in the user's app-data folder: panel positions, first-run flags.
const statePath = () => path.join(app.getPath("userData"), "state.json");

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath(), "utf8")); } catch { return {}; }
}

function updateState(patch) {
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ ...readState(), ...patch }));
  } catch { /* not critical */ }
}

module.exports = { readState, updateState };
