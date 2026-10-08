// Small Windows helpers for the highlighter, via koffi (prebuilt, nothing to compile).
let api;

function load() {
  if (api !== undefined) return api;
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    api = {
      GetForegroundWindow: user32.func("void* __stdcall GetForegroundWindow()"),
      GetWindowThreadProcessId: user32.func("uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)"),
      keybd_event: user32.func("void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr extra)"),
      OpenProcess: kernel32.func("void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)"),
      QueryFullProcessImageNameW: kernel32.func("bool __stdcall QueryFullProcessImageNameW(void* process, uint32 flags, void* name, _Inout_ uint32* size)"),
      CloseHandle: kernel32.func("bool __stdcall CloseHandle(void* handle)"),
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

module.exports = { foregroundApp, maskAltMenu };
