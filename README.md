# Plainpage

A markdown editor for macOS and Windows. Free, open source, file-first, and
unreasonably well-typeset.

Plainpage is built on [**Foolscap**](https://github.com/seamoss/Foolscap) by
Seánan McCullough — all of the craft in the editor is his. This version adds a
few features that haven't landed upstream yet (a copy button on code blocks,
double-click that keeps your place in code) and a Windows build. It's
maintained by [@productengineered](https://github.com/productengineered) for
students; it is not an official Foolscap release, so please send Plainpage
issues here rather than to Foolscap.

![Editing — syntax marks recede instead of hiding](docs/editing.png)

The buffer is plain markdown text at all times — live preview is decorations
over that text, never a document model — so the file on disk is always exactly
what you wrote.

## What it does

- Files open where you left them; ⇧⌘T reopens a closed tab; drop an image from Finder or File Explorer or paste a URL over a selection and the markdown writes itself
- Live preview of every markdown construct: headings (Fraunces, real optical sizing), emphasis, lists with hanging indents and real bullets, links (⌘-click, or Ctrl-click on Windows, to open), Shiki-highlighted code fences, inline images, blockquotes, rules, clickable task-list checkboxes, and tables that render as a real grid and edit in place (click a cell and type; ⌥-click for the pipe source with its normalizing formatter, drag-to-resize columns, and hover column controls)
- Atomic saves — temp file, fsync, rename; a crash can never truncate your manuscript
- Autosave with a browsable version history (File ▸ Browse Versions…), restores that ⌘Z undoes, and an undo stack that survives relaunch
- External-change watching: clean buffers reload silently, dirty buffers get a choice
- Command palette (⌘K / Ctrl+K) with recent files a keystroke away, find & replace, outline panel, typewriter and focus modes, optional line numbers, a word count that counts the selection
- Seven themes — from the house Ledger and Plate to GitHub, Vercel, and VS Code — plus load-your-own-CSS custom themes ([THEMING.md](THEMING.md))
- Ten writing faces, five serif and five sans; one font per page, and code keeps [Ioskeley Mono](https://github.com/ahatem/IoskeleyMono)
- Paste images from the clipboard, or drop them in, into a sibling `assets/` folder
- Tabs and windows — drag a tab out and it becomes a window — with full session restore: quitting is silent and the next launch sets the desk back up, unsaved drafts included
- Self-contained HTML export and typeset PDF export with the editor's real fonts — pretty-wrapped, hyphenated, headings balanced
- Runs on macOS and Windows

## Install

Download the latest from [Releases](https://github.com/productengineered/plainpage/releases).

Plainpage isn't code-signed (signing costs money every year), so your computer
will ask once whether you trust it. That's expected — here's the one-time step.

### Windows

1. Run `Plainpage-Setup-<version>-x64.exe` (or `-arm64` on an ARM PC).
2. If you see **"Windows protected your PC"**, click **More info → Run anyway**.
3. Follow the installer. After that, Plainpage opens like any other app.

### macOS

1. Open the `.dmg` (`arm64` for Apple Silicon, `x64` for Intel) and drag
   Plainpage to Applications.
2. The first time you open it, macOS will say it can't verify the developer.
   Either:
   - open **System Settings → Privacy & Security**, scroll down, and click
     **Open Anyway** next to Plainpage; or
   - paste this into Terminal once:
     ```
     xattr -dr com.apple.quarantine /Applications/Plainpage.app
     ```
3. After that, it opens normally.

Plainpage doesn't update itself; download a new version from Releases when
one comes out. Your documents and settings carry over.

## Opening files by link

Other apps and web pages can open a document in Plainpage with a link:

```
plainpage://open?path=<URL-encoded absolute path>
plainpage://open?path=%2FUsers%2Fyou%2Fnotes%2Fbrief.md
```

The path must be absolute and point at an existing `.md`, `.markdown`, or
`.txt` file; anything else shows a short error and opens nothing. A file
that's already open gets its tab brought forward instead of a second copy.
From a terminal:

```
open "plainpage://open?path=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' /absolute/path/to/some.md)"
```

macOS learns the scheme the first time Plainpage launches. Browsers ask
before handing a link to an app; Chrome can remember the answer.

## Testing

Three layers, and [docs/adr/0001-testing.md](docs/adr/0001-testing.md)
says which one a change needs: `pnpm test` (vitest, with coverage floors
under `pnpm test:coverage`), the golden fixtures in `fixtures/`, and
`pnpm e2e`, which drives the built app through real input events.

## Building

```
pnpm install
pnpm dev        # run in development
pnpm test       # vitest
pnpm typecheck
pnpm pack:app   # unsigned local app build (dist/)
```

Release installers have no auto-updater and are unsigned. Build them with
the release script, which handles the per-architecture details (one NSIS
installer per arch, the ARM64 compression fix, no update feed file):

```
pnpm release        # everything (run on a Mac; on Windows use pnpm release win)
pnpm release mac    # Plainpage-<version>-{arm64,x64}.dmg
pnpm release win    # Plainpage-Setup-<version>-{x64,arm64}.exe (builds fine from a Mac)
```

## License

[MIT](LICENSE). Foolscap © 2026 Seánan McCullough; Plainpage changes © 2026
productengineered.
