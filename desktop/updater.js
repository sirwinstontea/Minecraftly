const { app } = require("electron");

const CHECK_EVERY = 4 * 60 * 60 * 1000; // 4 hours
const RETRY_INSTALL_EVERY = 60 * 1000;

// Keeps installed copies on the newest GitHub release without the user doing anything:
// new versions download in the background and install silently the next time no tool
// is open (or when the app quits). The app then restarts quietly in the tray.
function startAutoUpdates({ isIdle }) {
  if (!app.isPackaged) return { checkNow: () => {} };
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return { checkNow: () => {} };
  }

  let ready = false;
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", () => { /* offline or no release reachable: try again later */ });
  autoUpdater.on("update-downloaded", () => {
    ready = true;
    installIfIdle();
  });

  function installIfIdle() {
    if (ready && isIdle()) autoUpdater.quitAndInstall(true, true); // silent, then relaunch
  }

  const checkNow = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(checkNow, 10 * 1000);
  setInterval(checkNow, CHECK_EVERY);
  setInterval(installIfIdle, RETRY_INSTALL_EVERY);
  return { checkNow };
}

module.exports = { startAutoUpdates };
