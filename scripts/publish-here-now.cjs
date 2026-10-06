const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.join(projectRoot, "tools", "book-and-quill");
const stateDirectory = path.join(projectRoot, ".herenow");
const statePath = path.join(stateDirectory, "state.json");
const apiBase = "https://here.now";
const clientHeader = "codex/direct-api";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".otf": "font/otf",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function readApiKey() {
  if (process.env.HERENOW_API_KEY) return process.env.HERENOW_API_KEY.trim();
  const credentialsPath = path.join(os.homedir(), ".herenow", "credentials");
  if (fs.existsSync(credentialsPath)) {
    return fs.readFileSync(credentialsPath, "utf8").trim();
  }
  return "";
}

function readState() {
  if (!fs.existsSync(statePath)) return { publishes: {} };
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.mkdirSync(stateDirectory, { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, statePath);
}

function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath, relativePath));
      continue;
    }
    if (!entry.isFile() || entry.name === ".DS_Store") continue;
    // These files are only for local development; publish the app and its assets.
    if (relativePath === "README.md" || relativePath === "serve.js") continue;

    const contents = fs.readFileSync(absolutePath);
    const extension = path.extname(entry.name).toLowerCase();
    files.push({
      path: relativePath,
      absolutePath,
      contents,
      size: contents.length,
      contentType: contentTypes[extension] || "application/octet-stream",
      hash: crypto.createHash("sha256").update(contents).digest("hex"),
    });
  }
  return files;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text.slice(0, 500) };
  }
  if (!response.ok || body.error) {
    const detail = body.message || body.error || response.statusText;
    const code = body.code ? ` (${body.code})` : "";
    throw new Error(`here.now returned HTTP ${response.status}${code}: ${detail}`);
  }
  return body;
}

async function main() {
  if (!fs.existsSync(path.join(siteRoot, "index.html"))) {
    throw new Error(`Missing site entry file: ${path.join(siteRoot, "index.html")}`);
  }

  const files = collectFiles(siteRoot).sort((a, b) => a.path.localeCompare(b.path));
  if (!files.length) throw new Error("No app files were found to publish.");

  const state = readState();
  const absoluteSiteRoot = path.resolve(siteRoot);
  const existing = Object.entries(state.publishes || {}).find(
    ([, value]) => value.path === absoluteSiteRoot,
  );
  const slug = existing?.[0] || process.env.HERENOW_SLUG || "";
  const previous = slug ? state.publishes?.[slug] || {} : {};
  const apiKey = readApiKey();
  const headers = {
    "content-type": "application/json",
    "x-herenow-client": clientHeader,
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const body = { files: files.map(({ path: filePath, size, contentType, hash }) => ({
    path: filePath,
    size,
    contentType,
    hash,
  })) };
  if (slug && previous.claimToken) body.claimToken = previous.claimToken;
  if (slug && previous.versionId && previous.path === absoluteSiteRoot) {
    body.baseVersionId = previous.versionId;
  }

  const endpoint = slug
    ? `${apiBase}/api/v1/publish/${encodeURIComponent(slug)}`
    : `${apiBase}/api/v1/publish`;
  const staged = await requestJson(endpoint, {
    method: slug ? "PUT" : "POST",
    headers,
    body: JSON.stringify(body),
  });

  const outputSlug = staged.slug;
  const uploadInfo = staged.upload || {};
  if (!outputSlug || !uploadInfo.versionId || !uploadInfo.finalizeUrl) {
    throw new Error("here.now returned an incomplete publish response.");
  }

  const entry = {
    ...previous,
    siteUrl: staged.siteUrl || previous.siteUrl,
    path: absoluteSiteRoot,
    ...(staged.claimToken ? { claimToken: staged.claimToken } : {}),
    ...(staged.claimUrl ? { claimUrl: staged.claimUrl } : {}),
    ...(staged.expiresAt ? { expiresAt: staged.expiresAt } : {}),
  };
  state.publishes = { ...(state.publishes || {}), [outputSlug]: entry };
  writeState(state);

  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const uploads = uploadInfo.uploads || [];
  await Promise.all(uploads.map(async (upload) => {
    const file = fileByPath.get(upload.path);
    if (!file) throw new Error(`here.now requested an unknown file: ${upload.path}`);
    const uploadHeaders = new Headers(upload.headers || {});
    if (!uploadHeaders.has("content-type")) uploadHeaders.set("content-type", file.contentType);
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: uploadHeaders,
      body: file.contents,
    });
    if (!response.ok) {
      throw new Error(`Upload failed for ${upload.path} (HTTP ${response.status}).`);
    }
  }));

  const finalized = await requestJson(uploadInfo.finalizeUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ versionId: uploadInfo.versionId }),
  });

  entry.siteUrl = finalized.siteUrl || staged.siteUrl || entry.siteUrl;
  entry.versionId = finalized.currentVersionId || uploadInfo.versionId;
  if (staged.claimToken) entry.claimToken = staged.claimToken;
  if (staged.claimUrl) entry.claimUrl = staged.claimUrl;
  if (staged.expiresAt) entry.expiresAt = staged.expiresAt;
  state.publishes[outputSlug] = entry;
  writeState(state);

  if (!process.env.HERENOW_SILENT) {
    console.log(entry.siteUrl);
    console.log(`Published ${files.length} app files (${apiKey ? "saved to account" : "anonymous, expires in 24 hours"}).`);
    if (!apiKey && entry.claimUrl) console.log(`Claim this site to keep it permanently: ${entry.claimUrl}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
