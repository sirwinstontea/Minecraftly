# Minecraftly

Minecraft-style desktop tools that pop up from the Windows taskbar. The first tool is **Book & Quill**, a notebook with paginated pages, Minecraft fonts, and PDF, DOCX, and Markdown export.

## Download

**[⬇ Download Minecraftly for Windows](https://github.com/sirwinstontea/Minecraftly/releases/latest/download/Minecraftly-Setup.exe)** (Windows 10/11, 64-bit)

Or download and start the installer from a terminal:

**PowerShell**
```powershell
$f = "$env:TEMP\Minecraftly-Setup.exe"; Invoke-WebRequest "https://github.com/sirwinstontea/Minecraftly/releases/latest/download/Minecraftly-Setup.exe" -OutFile $f; Start-Process $f
```

**Command Prompt**
```bat
curl -L -o "%TEMP%\Minecraftly-Setup.exe" https://github.com/sirwinstontea/Minecraftly/releases/latest/download/Minecraftly-Setup.exe && start "" "%TEMP%\Minecraftly-Setup.exe"
```

All versions are listed on the [Releases page](https://github.com/sirwinstontea/Minecraftly/releases).

## Install (Windows)

Run `Minecraftly-Setup.exe` by double-clicking it in File Explorer; don't open it in a browser tab. The installer isn't code-signed yet, so Windows SmartScreen may show **"Windows protected your PC"**. If it does, click **More info → Run anyway**.

After installing, Minecraftly sits next to the clock and starts with Windows:

- Click the **Minecraftly icon** by the clock, or press **Alt+B** anywhere, to open or close Book & Quill.
- **Can't see the icon?** Windows 11 hides new icons at first. Click the **^** arrow next to the clock and drag the icon onto the taskbar. Alternatively, turn Minecraftly on under **Settings → Personalization → Taskbar → Other system tray icons**.
- Click anywhere else or press **Esc** to tuck the tool away. **Done** saves and closes.
- Drag the top edge of the book to move it. The position is remembered.
- Right-click the icon to pick a tool, turn **Start with Windows** off, or quit.

Notes are saved automatically on this computer and are kept if you uninstall.

## Develop

Install Node.js, open a terminal **in this folder**, and run:

```sh
npm install
npm run desktop   # run the desktop app from source
npm run dist      # build dist/Minecraftly-Setup.exe
npm start         # Book & Quill in a browser at http://localhost:5600
```

## Project layout

- `desktop/` holds the Electron shell:
  - `main.js`: app start-up, tray icon, hotkeys, Start with Windows.
  - `panels.js`: the pop-up windows.
  - `tools.js`: the **tool registry**.
  - `preload.js`: the `window.minecraftly` bridge for tool pages.
- `tools/<id>/` holds one folder per tool, each a self-contained web page that also works in a plain browser. `tools/book-and-quill/` is the notebook.
- `build/installer.nsh` holds extra installer steps. The uninstaller uses them to remove the Start with Windows entry.
- `scripts/` holds the here.now publishing scripts for the browser version.

### Adding a tool

1. Create `tools/<id>/index.html`, a page with transparent margins.
2. Add `{ id, label, hotkey, width, height }` to `desktop/tools.js`.
3. Optionally use `window.minecraftly` (`hide`, `exportPdf`, `onOpened`, `onClosing`) when it exists.

## Publish with here.now

Authenticate with here.now on this computer, then run `npm run publish` to publish Book & Quill to the web. Run `npm run watch` to publish future changes automatically. The scripts create `.herenow/` locally for site metadata; that folder is git-ignored.
