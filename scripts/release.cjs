// Builds the installer and publishes it as a GitHub release. Installed copies of
// Minecraftly check that release feed and update themselves automatically.
//
//   1. Bump "version" in package.json (e.g. 1.1.0 -> 1.2.0)
//   2. npm run release
//
// Needs the GitHub CLI (https://cli.github.com) logged in with push access to the repo.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tag = `v${version}`;
const run = (command, args, shell = false) => execFileSync(command, args, { cwd: root, stdio: "inherit", shell });

const assets = ["Minecraftly-Setup.exe", "Minecraftly-Setup.exe.blockmap", "latest.yml"].map((name) => path.join("dist", name));

run("npm", ["run", "dist"], true); // npm is a .cmd script on Windows, so it needs a shell
for (const asset of assets) {
  if (!fs.existsSync(path.join(root, asset))) throw new Error(`Build output missing: ${asset}`);
}
run("gh", ["release", "create", tag, ...assets, "--title", `Minecraftly ${version}`, "--generate-notes", "--latest"]);
console.log(`Released ${tag}. Installed copies will update within a few hours.`);
