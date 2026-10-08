// Assembles the Minecraftly Highlighter browser extension into dist-extension/ (load it via
// chrome://extensions -> Developer mode -> Load unpacked) and zips it for the Chrome Web Store /
// Edge Add-ons: dist/minecraftly-highlighter.zip
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = path.join(root, "extension");
const out = path.join(root, "dist-extension");

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(source, out, { recursive: true });
// The text-matching library is shared with the desktop app; the extension gets a copy.
fs.copyFileSync(path.join(root, "lib", "anchor.js"), path.join(out, "anchor.js"));

// Same file name every version, so "releases/latest/download/minecraftly-highlighter.zip" always works.
const zip = path.join(root, "dist", "minecraftly-highlighter.zip");
fs.mkdirSync(path.dirname(zip), { recursive: true });
fs.rmSync(zip, { force: true });
// Windows' own tar (10+) writes .zip with -a; call it by path so Git Bash's GNU tar isn't used.
const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
execFileSync(tar, ["-a", "-c", "-f", zip, "-C", out, "."]);
console.log(`Extension ready: ${path.relative(root, out)} (unpacked) and ${path.relative(root, zip)}`);
