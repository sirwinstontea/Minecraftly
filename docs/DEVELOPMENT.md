# Developing Minecraftly

## Run and build

Install [Node.js](https://nodejs.org), open a terminal in the repo folder, and run:

```sh
npm install
npm run desktop          # run the app from source
npm test                 # highlight-matching tests
npm run build:extension  # browser extension -> dist-extension/ (unpacked) + dist/minecraftly-highlighter.zip
npm run dist             # Windows installer -> dist/Minecraftly-Setup.exe
npm start                # Book & Quill alone in a browser at http://localhost:5600
```

## Release a new version

Installed copies check GitHub Releases every few hours and update themselves.

1. Bump `version` in `package.json`.
2. Run `npm run release`. You need the GitHub CLI logged in to an account that can push to the repo.

This builds the installer and the browser extension and publishes them as release `v<version>`, with `latest.yml` for the auto-updater. It also installs the new version silently on the PC you release from. Run `npm run install-local` to pull the latest release onto your PC at any other time.

Auto-updates only reach users while the release files are publicly downloadable, which means the repo has to be public.

## Project layout

- `desktop/`: the Electron app.
  - `main.js`: start-up, tray icon, global shortcuts, Start with Windows.
  - `tools.js`: the **tool registry**.
  - `panels.js` and `layout.js`: the pop-up windows and where they sit.
  - `overlay.js`: the grass block in the screen corner.
  - `todo.js`, `ui/todo.html` and `ui/todo-page.js`: the to-do sign.
    - It's fully open while the desktop is showing; `foregroundContext()` in `highlights/foreground.js` checks this 4× a second.
    - Over other apps it shrinks to an icon, and it collapses whenever a tool panel opens (`panelEvents`).
    - It only slides up and down the right edge, from the top to just above the grass block.
    - It's saved in `todo.json`.
  - `fullscreen.js`: tells the grass block and to-do sign when a fullscreen app is in front.
  - `inventory.js` and `inventory-ipc.js`: the inventory (slots, moving, throwing away, renaming).
  - `chooser.js`: menus centered on the screen.
  - `updater.js`: automatic updates.
  - `preload.js`: the `window.minecraftly` bridge for tool pages.
  - `highlights/`: the highlighter.
    - `router.js` handles Alt+Y.
    - `store.js` saves highlights.
    - `bridge.js` is the link to the browser extension.
    - `foreground.js` and `toast.js` are Windows helpers and the "Highlighted" message.
- `lib/anchor.js`: finds highlighted text again after a page changes (exact match, then fuzzy, never guesses). Shared by the app and the extension; tested in `test/`.
- `extension/`: the Minecraftly Highlighter browser extension (Manifest V3). It paints highlights with the CSS Custom Highlight API, so pages are never modified.
- `native-host/host.js`: the native-messaging link between the extension and the app. Chrome and Edge start it; it runs on Minecraftly.exe in Node mode and talks to the app over a named pipe.
- `tools/<id>/`: one folder per tool, each a self-contained web page.
  - `book-and-quill/`: the notebook.
  - `hotbar/` and `inventory/`: the vertical bar and the full inventory.
  - `shared/`: slot code, styles and icons.
- `build/installer.nsh`: extra uninstall steps (Start with Windows entry, browser link).
- `scripts/`: release, local install, extension build, and here.now publishing for the browser version.

## Adding a tool

1. Create `tools/<id>/index.html`, a page with transparent margins.
2. Add `{ id, label, hotkey, width, height }` to `desktop/tools.js`.
3. Optionally use `window.minecraftly` when it exists:
   - `hide()`, `onOpened(cb)` and `onClosing(cb)`: control the panel.
   - `setMode("expanded" | "docked")` and `onMode(cb)`: expand and minimize.
   - `choose(title, options)`: a menu centered on the screen.
   - `exportPdf(name)`: save the page as a PDF.
   - `inventory.list()` and `inventory.put(item)`: the user's saved items.
   - `onHighlightRequest(cb)`: handle Alt+Y inside the tool.

## How highlighting works

When you press Alt+Y, Minecraftly checks which app is in front.

- **Minecraftly tool:** the tool highlights inside its own text.
- **Chrome or Edge with the extension:** the app asks the extension, which saves a description of the selected text: the quote, about 64 characters around it, and its position. It then paints the highlight with the browser's built-in highlight API.

On every visit, `lib/anchor.js` finds that text again. It looks for an exact match first. If the text has changed a little, it uses a fuzzy match, inspired by Hypothesis' anchoring. If the text is gone, or the match is ambiguous, nothing is drawn.

Planned next: a Minecraftly PDF reader, then a text-locked overlay for Word, Firefox and other apps.
