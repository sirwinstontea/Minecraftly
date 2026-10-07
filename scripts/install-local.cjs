// Installs a Minecraftly build on THIS computer right away (silently), then starts it.
// `npm run release` runs this after publishing, so the developer's own PC is always on
// the newest version without waiting for the auto-updater. Other people's installs are
// unaffected: they update through GitHub Releases as usual.
//
//   npm run install-local            -> downloads and installs the latest GitHub release
//   node scripts/install-local.cjs <path-to-Minecraftly-Setup.exe>
//
// Downloading needs the GitHub CLI (https://cli.github.com) with access to the repo.
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (process.platform !== "win32") {
  console.log("Minecraftly is Windows-only; nothing to install here.");
  process.exit(0);
}

const root = path.join(__dirname, "..");
const { build } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const repo = `${build.publish[0].owner}/${build.publish[0].repo}`;
const appExe = path.join(process.env.LOCALAPPDATA, "Programs", "Minecraftly", "Minecraftly.exe");

let installer = process.argv[2];
let downloadDir;
if (!installer) {
  downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "minecraftly-"));
  console.log(`Downloading the latest release of ${repo}...`);
  execFileSync("gh", ["release", "download", "--repo", repo, "--pattern", "Minecraftly-Setup.exe", "--dir", downloadDir], { stdio: "inherit" });
  installer = path.join(downloadDir, "Minecraftly-Setup.exe");
}
if (!fs.existsSync(installer)) throw new Error(`Installer not found: ${installer}`);

const wasInstalled = fs.existsSync(appExe);
try {
  // Close the running copy so its files can be replaced (notes are saved as you type).
  execFileSync("taskkill", ["/IM", "Minecraftly.exe", "/F", "/T"], { stdio: "ignore" });
} catch { /* wasn't running */ }

console.log(wasInstalled ? "Updating Minecraftly on this PC..." : "Installing Minecraftly on this PC...");
// /S = silent; --updated = keep settings and data like an automatic update does.
execFileSync(installer, ["/S", ...(wasInstalled ? ["--updated"] : [])], { stdio: "inherit" });
if (downloadDir) fs.rmSync(downloadDir, { recursive: true, force: true });

if (!fs.existsSync(appExe)) throw new Error(`Install finished but ${appExe} is missing`);
// After an update start quietly in the tray; after a first install open the book.
spawn(appExe, wasInstalled ? ["--updated"] : [], { detached: true, stdio: "ignore" }).unref();
console.log(`Minecraftly ${wasInstalled ? "updated" : "installed"} and running.`);
