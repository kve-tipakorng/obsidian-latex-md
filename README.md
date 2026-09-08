# LaTeX Look

An Obsidian plugin that adds a Command Palette command,
**"Export current note as LaTeX-look PDF"**, which exports the currently
open note as a PDF typeset to look like a classic LaTeX `article`-class
document — via Obsidian's own built-in "Export to PDF" flow (the same
native save-file dialog Obsidian already provides).

**Normal note viewing is untouched.** This plugin does not change how any
note looks in Reading view, Live Preview, or Source mode. It only applies
its styling for the duration of the export command, to the note being
exported, and reverts automatically as soon as you switch away from it.
If you never run the export command, this plugin has no visible effect at
all.

This is a **CSS/typography approximation**, not a real LaTeX engine. There is
no Pandoc, no LaTeX distribution, and no network calls involved — everything
ships bundled inside the plugin and runs fully offline.

Primary use case: internal KV Electronics (KVE) work documents (reports,
specs, memos) that should look clean and professional rather than
"academic paper" cute, when exported to share as a PDF.

## How it works

1. Open the note you want to export.
2. Open the Command Palette (Cmd/Ctrl+P) and run **"Export current note as
   LaTeX-look PDF"**.
3. The plugin switches the note to Reading view (if it isn't already),
   applies the LaTeX-look styling just to that note, and then triggers
   Obsidian's native "Export to PDF" command — the same save-file dialog
   you'd get from Obsidian's own File menu.
4. Save the PDF wherever you like. As soon as you switch to another note
   (or back), the plugin automatically reverts the note to plain,
   untouched Obsidian styling — there is nothing to undo manually.

If the command can't find Obsidian's built-in PDF export command (for
example because the core plugin that provides it is disabled), it shows a
notice explaining that and leaves the note in its normal, unstyled state.

If there is no active Markdown note (e.g. focus is on the graph view or an
empty pane), the command is greyed out / unavailable in the Command
Palette.

## Features

All of the following apply **only to the note being exported, only for the
duration of the export command** — never to Reading view in general.

- **Typography**: body text set in Latin Modern Roman (a free, GUST/LPPL
  licensed clone of the classic Computer Modern / LaTeX font), bundled as
  WOFF2 files inside the plugin — no CDN, no Google Fonts. Justified body
  text with a first-line paragraph indent and no blank line between
  paragraphs, matching `article.cls` defaults (suppresses Obsidian's normal
  paragraph spacing).
- **Automatic heading numbering**: H1 -> "1", H2 -> "1.1", H3 -> "1.1.1",
  etc., like LaTeX's `\section` / `\subsection` / `\subsubsection`,
  implemented with pure CSS counters, toggleable in settings.
- **Title block**: if a note's frontmatter has `title`, `subtitle`,
  `author`, and/or `date`, a centered `\maketitle`-style block is rendered
  at the top of the exported PDF. Notes without that frontmatter are left
  untouched.
- **Blockquotes** styled like a LaTeX `quote` environment (indented on both
  sides, no big decorative quotation mark).
- **Code blocks** styled like a `verbatim` block (subtle border, existing
  Obsidian monospace font and syntax highlighting untouched).
- **Tables** styled "booktabs"-style: no vertical rules, a heavy rule above
  the header row, a rule below the header row, a heavy rule at the bottom,
  no row banding.
- **Math**: Obsidian/MathJax rendering is left as-is (it already looks
  close to LaTeX); this plugin only nudges surrounding line-height so it
  doesn't clash.
- **Settings tab** with:
  - Toggle: automatic heading numbering (default **on**)
  - Toggle: frontmatter title block (default **on**)
  - Dropdown: base font size — 10pt / 11pt / 12pt (default **11pt**),
    matching the standard `article` class options
  - Dropdown: paper size for export — Letter / A4 (default **Letter**)

  Settings are read fresh each time you run the export command — there is
  nothing to apply live, since nothing is visible until you export.

## Installation

This plugin is not published to the Obsidian community plugin store. Two
ways to install it:

### Manual install

1. Copy `main.js`, `manifest.json`, and `styles.css` (and the `fonts/`
   folder) from this repository into:
   ```
   <your-vault>/.obsidian/plugins/latex-look/
   ```
   so that the folder contains:
   ```
   .obsidian/plugins/latex-look/
     main.js
     manifest.json
     styles.css
     fonts/
       lmroman10-regular.woff2
       lmroman10-bold.woff2
       lmroman10-italic.woff2
       lmroman10-bolditalic.woff2
   ```
2. In Obsidian: Settings -> Community plugins -> reload plugins (or
   restart Obsidian) -> enable "LaTeX Look".

### BRAT (for testing against a git repo)

If you use the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin,
you can point it at this repository to install/update the plugin directly
from git without a community-store listing.

## Settings explained

All of these only take effect when you run the "Export current note as
LaTeX-look PDF" command — they have no effect on ordinary Reading view.

| Setting | Default | Effect |
|---|---|---|
| Automatic heading numbering | On | Adds "1", "1.1", "1.1.1" ... prefixes to H1-H6 in the exported PDF, via CSS counters. Numbering resets per note automatically. |
| Title block from frontmatter | On | Looks for `title` / `subtitle` / `author` / `date` in a note's YAML frontmatter and renders a centered title block above the body in the exported PDF. Notes without any of these fields are unaffected. |
| Base font size | 11pt | Sets the body text size in the exported PDF, mirroring LaTeX's `\documentclass[10pt\|11pt\|12pt]{article}` options. |
| Paper size (export) | Letter | Sets the `@page` size and an approximate 1in (Letter) / 25mm (A4) margin used when exporting, which is what Obsidian's "Export to PDF" renders against. |

## Important caveat: PDF export margins

Obsidian's "Export to PDF" goes through Electron's print-to-PDF pipeline.
Electron's print dialog has its **own** page-margin setting, and depending
on version/platform it can override the `@page { margin: ... }` rule this
plugin sets via CSS. If your exported PDF has larger margins than expected:

1. Open the Export to PDF dialog.
2. Set the PDF margin option to **"None"** (or a custom value of **0**) if
   your Obsidian version exposes that option.
3. This plugin's CSS margin (1in for Letter, 25mm for A4) will then be the
   only margin applied, giving the intended `article`-class-like page.

If your Obsidian version does not expose a margin override in the export
dialog, the built-in Electron default margin will be layered on top of
this plugin's CSS margin, and the page will look more generously margined
than a real LaTeX article — this is a known limitation of Chromium's
print-to-PDF pipeline, not something a plugin CSS file can force around.

## Font licensing note

The bundled font is **Latin Modern Roman** (Regular / Bold / Italic / Bold
Italic), from the Latin Modern family produced by the GUST e-foundry,
based on Donald Knuth's Computer Modern. It is distributed under the
**GUST Font License (GFL)**, a free license based on the LaTeX Project
Public License, which explicitly permits redistribution and modification
(including format conversion, which is all that was done here: the
original OpenType files were converted to WOFF2 with `fonttools`, no
glyph/metric changes). See `fonts/GUST-FONT-LICENSE.txt` and
`fonts/README.txt` for the full license text and provenance notes.

If, in some environment, the bundled `@font-face` files fail to load for
any reason, the CSS falls back through `"CMU Serif"`, `"Nimbus Roman"`,
Georgia, and finally the browser/OS default serif — so the layout still
degrades gracefully rather than breaking.

## Scope / non-goals

This plugin intentionally does **not** implement: bibliography/citation
support, automatic table-of-contents insertion, multi-template selection,
or two-column layout. See `HANDOFF.md` for details and suggested next
steps if you want to extend it.

## Development

```bash
# Install dependencies and build (inside Docker, nothing installed on the host):
docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npm install && npm run build"

# Watch mode while developing (also inside Docker):
docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npm install && npm run dev"
```

`main.js`, `manifest.json`, and `styles.css` are committed to this
repository (the standard convention for Obsidian plugins distributed
outside the community store, since users load them directly). Only
`node_modules/` is gitignored.

See `DEVLOG.md` for the development log and design decisions, and
`test-artifacts/TEST_PLAN.md` for the manual visual test plan.
