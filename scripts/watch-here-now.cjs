const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.join(projectRoot, "tools", "book-and-quill");
const stateDirectory = path.join(projectRoot, ".herenow");
const logPath = path.join(stateDirectory, "watcher.log");
const publisherPath = path.join(__dirname, "publish-here-now.cjs");
const credentialsPath = path.join(require("node:os").homedir(), ".herenow", "credentials");
const excludedFiles = new Set(["README.md", "serve.js", ".DS_Store"]);

fs.mkdirSync(stateDirectory, { recursive: true });

function log(message) {
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

function snapshot(directory, prefix = "") {
  const entries = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, item.name);
    const relativePath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      entries.push(...snapshot(absolutePath, relativePath));
    } else if (item.isFile() && !excludedFiles.has(relativePath) && item.name !== ".DS_Store") {
      const bytes = fs.readFileSync(absolutePath);
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      entries.push(`${relativePath}:${bytes.length}:${hash}`);
    }
  }
  return entries.sort().join("\n");
}

function hasApiKey() {
  if (process.env.HERENOW_API_KEY?.trim()) return true;
  return fs.existsSync(credentialsPath) && Boolean(fs.readFileSync(credentialsPath, "utf8").trim());
}

let lastSnapshot = snapshot(siteRoot);
let publishTimer;
let retryTimer;
let isPublishing = false;
let changedDuringPublish = false;
let waitingForAuth = false;
let hadApiKey = hasApiKey();

function schedulePublish(delay = 1800) {
  if (waitingForAuth && !hasApiKey()) return;
  if (isPublishing) {
    changedDuringPublish = true;
    return;
  }
  clearTimeout(publishTimer);
  publishTimer = setTimeout(publish, delay);
}

function publish() {
  if (isPublishing) {
    changedDuringPublish = true;
    return;
  }
  isPublishing = true;
  changedDuringPublish = false;
  log("App files changed; publishing an update.");

  const child = spawn(process.execPath, [publisherPath], {
    cwd: projectRoot,
    env: { ...process.env, HERENOW_SILENT: "1" },
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { errors += chunk; });
  child.on("error", (error) => {
    log(`Publisher could not start: ${error.message}`);
  });
  child.on("close", (code) => {
    isPublishing = false;
    if (code === 0) {
      log("Publish update completed.");
      clearTimeout(retryTimer);
      retryTimer = undefined;
    } else if (/HTTP 401|unauthorized/i.test(errors) && !hasApiKey()) {
      waitingForAuth = true;
      log("here.now requires account sign-in for this Site; waiting for credentials before retrying.");
      clearTimeout(retryTimer);
      retryTimer = undefined;
    } else {
      log(`Publish update failed${errors.trim() ? `: ${errors.trim()}` : ` (exit ${code})`}`);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => schedulePublish(0), 10000);
    }
    if (changedDuringPublish) schedulePublish(1800);
  });
}

setInterval(() => {
  try {
    const hasKey = hasApiKey();
    if (hasKey && !hadApiKey) {
      waitingForAuth = false;
      hadApiKey = true;
      log("here.now credentials are available; resuming automatic publishing.");
      schedulePublish();
    } else {
      hadApiKey = hasKey;
    }
    const current = snapshot(siteRoot);
    if (current !== lastSnapshot && !waitingForAuth) {
      lastSnapshot = current;
      schedulePublish();
    }
  } catch (error) {
    log(`Could not scan app files: ${error.message}`);
  }
}, 2000);

log(`Watching ${siteRoot} for app changes.`);
