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

After installing, Minecraftly starts with Windows and shows a **grass block** in the bottom-right corner of your screen:

- Click the **grass block**, the **Minecraftly icon** by the clock, or press **Alt+B** anywhere, to open or close Book & Quill.
- The grass block stays out of screen recordings and screen sharing. It also steps aside while a fullscreen game, video or presentation is in front. To hide it entirely, right-click it and untick **Show grass block on screen**.
- Each new note starts blank. An unfinished note stays put if you come back within 10 minutes. After that the book starts blank again, and the unfinished note is saved for you.
- **Export** and **Done** unlock once you've written something. **Done** saves the note to your inventory and closes the book.
- Use the button in the book's top-right corner to **expand** it to the middle of the screen, and again to **minimize** it back to the corner.
- Minecraftly **updates itself**: new versions download in the background and install the next time no tool is open.
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

## Release a new version

Installed copies check this repo's GitHub Releases every few hours and update themselves. To ship a version:

1. Bump `version` in `package.json`, for example `1.1.0` → `1.2.0`.
2. Run `npm run release`. This builds the installer and publishes `Minecraftly-Setup.exe`, its `.blockmap` and `latest.yml` as release `v<version>`. You need the GitHub CLI logged in to an account that can push to the repo.

Auto-updates need the release files to be publicly downloadable, so they only reach users while the repo is public.

The PC you release from gets the new version immediately: `npm run release` installs it there silently and restarts it in the tray. To pull the latest release onto your own PC at any other time, run `npm run install-local`.

## Project layout

- `desktop/` holds the Electron shell:
  - `main.js`: app start-up, tray icon, hotkeys, Start with Windows.
  - `overlay.js`: the grass block.
  - `updater.js`: automatic updates.
  - `panels.js` and `layout.js`: the pop-up windows and where they sit.
  - `chooser.js`: menus centered on the screen.
  - `inventory.js`: the user's saved items.
  - `tools.js`: the **tool registry**.
  - `preload.js`: the `window.minecraftly` bridge for tool pages.
- `tools/<id>/` holds one folder per tool, each a self-contained web page that also works in a plain browser. `tools/book-and-quill/` is the notebook.
- `build/installer.nsh` holds extra installer steps. The uninstaller uses them to remove the Start with Windows entry.
- `scripts/` holds the here.now publishing scripts for the browser version.

### Adding a tool

1. Create `tools/<id>/index.html`, a page with transparent margins.
2. Add `{ id, label, hotkey, width, height }` to `desktop/tools.js`.
3. Optionally use `window.minecraftly` when it exists:
   - `hide()`, `onOpened(cb)` and `onClosing(cb)` control and follow the panel.
   - `setMode("expanded" | "docked")` and `onMode(cb)` handle expand and minimize.
   - `choose(title, options)` shows a menu centered on the screen.
   - `exportPdf(name)` saves the page as a PDF.
   - `inventory.list()` and `inventory.put(item)` read and add to the user's saved items. Book & Quill files notes there with `type: "note"`.

## Publish with here.now

Authenticate with here.now on this computer, then run `npm run publish` to publish Book & Quill to the web. Run `npm run watch` to publish future changes automatically. The scripts create `.herenow/` locally for site metadata; that folder is git-ignored.
