// Builds the installer and publishes it as a GitHub release. Installed copies of
// Minecraftly check that release feed and update themselves automatically.
//
//   1. Bump "version" in package.json (e.g. 1.1.0 -> 1.2.0)
//   2. npm run release   (also installs it on this PC right away)
//
// Needs the GitHub CLI (https://cli.github.com) logged in with push access to the repo.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tag = `v${version}`;
const run = (command, args, shell = false) => execFileSync(command, args, { cwd: root, stdio: "inherit", shell });

const assets = ["Minecraftly-Setup.exe", "Minecraftly-Setup.exe.blockmap", "latest.yml", "minecraftly-highlighter.zip"]
  .map((name) => path.join("dist", name));

// Release exactly what's committed and pushed, and tag that commit (not whatever main points to).
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("status", "--porcelain")) throw new Error("Commit (and push) your changes before releasing.");
const commit = git("rev-parse", "HEAD");
if (!git("ls-remote", "origin", "HEAD").startsWith(commit)) throw new Error("Push your commits before releasing.");

run("npm", ["test"], true); // npm is a .cmd script on Windows, so it needs a shell
run("npm", ["run", "dist"], true);
run("node", [path.join(__dirname, "build-extension.cjs")]);
for (const asset of assets) {
  if (!fs.existsSync(path.join(root, asset))) throw new Error(`Build output missing: ${asset}`);
}
run("gh", ["release", "create", tag, ...assets, "--target", commit, "--title", `Minecraftly ${version}`, "--generate-notes", "--latest"]);
console.log(`Released ${tag}. Installed copies will update within a few hours.`);

// This PC gets the new version immediately (the one that just shipped).
run("node", [path.join(__dirname, "install-local.cjs"), path.join(root, "dist", "Minecraftly-Setup.exe")]);
