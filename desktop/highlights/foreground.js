// Small Windows helpers for the highlighter, via koffi (prebuilt, nothing to compile).
let api;

function load() {
  if (api !== undefined) return api;
  try {
    const koffi = require("koffi");
    koffi.proto("bool __stdcall EnumWindowsProc(void* hWnd, intptr param)");
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    api = {
      GetForegroundWindow: user32.func("void* __stdcall GetForegroundWindow()"),
      GetWindowThreadProcessId: user32.func("uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)"),
      keybd_event: user32.func("void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr extra)"),
      OpenProcess: kernel32.func("void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)"),
      QueryFullProcessImageNameW: kernel32.func("bool __stdcall QueryFullProcessImageNameW(void* process, uint32 flags, void* name, _Inout_ uint32* size)"),
      CloseHandle: kernel32.func("bool __stdcall CloseHandle(void* handle)"),
      GetClassNameW: user32.func("int __stdcall GetClassNameW(void* hWnd, void* name, int max)"),
      IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(void* hWnd)"),
      IsIconic: user32.func("bool __stdcall IsIconic(void* hWnd)"),
      GetWindow: user32.func("void* __stdcall GetWindow(void* hWnd, uint32 cmd)"),
      GetWindowLongW: user32.func("long __stdcall GetWindowLongW(void* hWnd, int index)"),
      GetWindowTextLengthW: user32.func("int __stdcall GetWindowTextLengthW(void* hWnd)"),
      EnumWindows: user32.func("bool __stdcall EnumWindows(EnumWindowsProc* callback, intptr param)"),
      DwmGetWindowAttribute: koffi.load("dwmapi.dll").func("long __stdcall DwmGetWindowAttribute(void* hWnd, uint32 attr, _Out_ int* value, uint32 size)"),
    };
  } catch {
    api = null;
  }
  return api;
}

// The program whose window is in front: { pid, exe } with exe like "chrome.exe", or null.
function foregroundApp() {
  const win32 = load();
  if (!win32) return null;
  const hwnd = win32.GetForegroundWindow();
  if (!hwnd) return null;
  const pid = [0];
  win32.GetWindowThreadProcessId(hwnd, pid);
  const process = win32.OpenProcess(0x1000, false, pid[0]); // PROCESS_QUERY_LIMITED_INFORMATION
  if (!process) return { pid: pid[0], exe: "" }; // e.g. an app running as administrator
  try {
    const name = Buffer.alloc(2048);
    const size = [1024];
    if (!win32.QueryFullProcessImageNameW(process, 0, name, size)) return { pid: pid[0], exe: "" };
    const path = name.toString("utf16le", 0, size[0] * 2);
    return { pid: pid[0], exe: path.split("\\").pop().toLowerCase(), path };
  } finally {
    win32.CloseHandle(process);
  }
}

// Alt+<key> shortcuts make Word show its ribbon letters and Firefox its menu bar when Alt is
// released, because they only saw Alt pressed alone. Tapping an unassigned key while Alt is
// still down prevents that (the "menu mask key" trick AutoHotkey uses).
function maskAltMenu() {
  const win32 = load();
  if (!win32) return;
  win32.keybd_event(0xE8, 0, 0, 0);
  win32.keybd_event(0xE8, 0, 2, 0); // KEYEVENTF_KEYUP
}

function className(win32, hwnd) {
  const name = Buffer.alloc(512);
  const length = win32.GetClassNameW(hwnd, name, 256);
  return name.toString("utf16le", 0, Math.max(0, length) * 2);
}

function windowPid(win32, hwnd) {
  const pid = [0];
  win32.GetWindowThreadProcessId(hwnd, pid);
  return pid[0];
}

const DESKTOP = new Set(["Progman", "WorkerW"]);
// Shell surfaces that shouldn't change what Minecraftly shows: taskbar, Start, search,
// Alt+Tab, notification center, tray overflow, context menus.
const SHELL = new Set([
  "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow", "TopLevelWindowForOverflowXamlIsland",
  "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow", "MultitaskingViewFrame", "ForegroundStaging",
  "TaskListThumbnailWnd", "Shell_InputSwitchTopLevelWindow", "#32768",
]);

// Is any normal app window open (visible, not minimized, not a tool window or popup,
// on this virtual desktop)? The same rules Alt+Tab uses, roughly.
function appWindowOpen(win32) {
  let found = false;
  win32.EnumWindows((hwnd) => {
    if (!win32.IsWindowVisible(hwnd) || win32.IsIconic(hwnd)) return true;
    if (win32.GetWindow(hwnd, 4)) return true; // GW_OWNER: owned popup
    if (win32.GetWindowLongW(hwnd, -20) & 0x80) return true; // WS_EX_TOOLWINDOW
    if (win32.GetWindowTextLengthW(hwnd) === 0) return true;
    const cloaked = [0];
    if (win32.DwmGetWindowAttribute(hwnd, 14, cloaked, 4) === 0 && cloaked[0]) return true; // other desktop / suspended app
    if (windowPid(win32, hwnd) === process.pid) return true; // Minecraftly itself
    const name = className(win32, hwnd);
    if (DESKTOP.has(name) || SHELL.has(name)) return true;
    found = true;
    return false; // stop
  }, 0);
  return found;
}

// What's in front: "desktop" (desktop showing or no app windows open), "app" (another program),
// or "neutral" (Minecraftly itself, the taskbar, Start, Alt+Tab... -> keep the current state).
function foregroundContext() {
  const win32 = load();
  if (!win32) return "neutral";
  const hwnd = win32.GetForegroundWindow();
  const name = hwnd ? className(win32, hwnd) : "";
  if (DESKTOP.has(name)) return "desktop";
  const own = hwnd && windowPid(win32, hwnd) === process.pid;
  if (!hwnd || own || SHELL.has(name)) return appWindowOpen(win32) ? "neutral" : "desktop";
  return "app";
}

module.exports = {
  foregroundApp, maskAltMenu, foregroundContext, anyAppWindowOpen: () => Boolean(load() && appWindowOpen(load())),
};
