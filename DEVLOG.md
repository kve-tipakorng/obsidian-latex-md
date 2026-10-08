# DEVLOG

## 2026-09-07 - Initial build

Built the plugin from scratch (empty repo containing only `CLAUDE.md`).

### Scaffold

- Standard Obsidian sample-plugin layout: `manifest.json`, `package.json`,
  `tsconfig.json`, `esbuild.config.mjs`, `main.ts` -> `main.js`,
  `styles.css`.
- devDependencies: `obsidian` (types only), `esbuild`, `typescript`,
  `builtin-modules`, `tslib`, `@types/node` - the standard sample-plugin
  set.
- Per repo `CLAUDE.md` constraints ("don't install anything locally, use
  venv or docker" / "deployment is always docker only"), all `npm install`
  and build steps run inside `node:20` Docker containers with the repo
  bind-mounted, e.g.:
  `docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npm install && npm run build"`.
  Nothing was installed on the host. Verified `main.js` is produced this
  way (currently ~4.8 KB minified, no TypeScript errors from `tsc -noEmit`).

### Font sourcing (Latin Modern Roman)

Went looking for a genuinely embeddable, freely-redistributable LaTeX-style
serif rather than defaulting straight to a system-font fallback:

- Latin Modern is not on Google Fonts / Fontsource, so no CDN/webfont
  shortcut exists.
- Found the canonical CTAN package `fonts/lm.zip` (Latin Modern family,
  v2.005, GUST e-foundry, authors B. Jackowski & J.M. Nowacki), which
  ships OpenType (.otf) files under the **GUST Font License (GFL)** - a
  free license based on the LaTeX Project Public License (LPPL 1.3c+),
  explicitly permitting distribution and modification. This is the same
  license family the task's "OFL/GUST-licensed" wording pointed at.
- Extracted the four core Roman weights/styles needed
  (`lmroman10-regular.otf`, `-bold`, `-italic`, `-bolditalic`) and
  converted them to WOFF2 using `fonttools`
  (`python -m fontTools.ttLib.woff2 compress`), run inside an isolated
  `python:3.11-slim` Docker container so nothing was installed on the
  host. No glyphs, metrics, or hinting were altered - only the container
  format changed (OTF -> WOFF2).
- Result: four WOFF2 files under `fonts/`, ~47-50 KB each (~200 KB total),
  which is small enough to bundle directly in the plugin with no build-time
  network dependency at runtime.
- Kept `fonts/GUST-FONT-LICENSE.txt` (verbatim license text) and added
  `fonts/README.txt` documenting provenance and exactly what transformation
  was applied, for future audit/attribution.
- The CSS `font-family` stack still lists `"CMU Serif"`, `"Nimbus Roman"`,
  Georgia, Times New Roman, serif as fallbacks after `"Latin Modern
  Roman"`, so if the bundled `@font-face` somehow fails to resolve in a
  given Obsidian/OS environment, the layout still degrades to a reasonable
  serif rather than breaking. This fallback was *not* needed in the end -
  the bundled fonts were the actual outcome - but it's kept as a safety
  net per the task's instructions.

### Why CSS approximation instead of Pandoc/LaTeX

The brief was explicit that this must be a CSS/typography approximation,
not a real TeX engine, and must work fully offline with no external
processes. Beyond that constraint, it's also the right call for the use
case: KVE reports/specs/memos are edited and read directly inside
Obsidian's Reading view day-to-day, and most of the value (professional
serif type, numbered sections, justified/indented body text, booktabs
tables, a maketitle-style header) is achievable with CSS alone. A real
Pandoc/LaTeX pipeline would add an external dependency, build/runtime
complexity, and failure modes (missing packages, compile errors on
otherwise-valid Markdown) that aren't worth it for an approximation that
only needs to be "close enough" for internal documents.

### Heading numbering: CSS counters, not a JS post-processor

The brief allowed either approach, preferring pure CSS counters if
Obsidian's rendered heading DOM permits it. Investigated Obsidian's
Reading-view DOM structure: headings render as flat siblings (no nested
`<section>` wrapping per heading level). This turns out not to be a
problem for CSS counters - `counter-reset`/`counter-increment` operate in
document order over the whole counter scope (here, `.markdown-rendered`),
regardless of DOM nesting depth, as long as all headings share that scope.
So a standard "reset deeper counters on each heading level" ruleset (see
`styles.css`, section 4) numbers headings correctly on the existing flat
structure, with:

- No JS re-render required to toggle the feature - it's just a body class
  (`latex-look-heading-numbers`) flipped in `main.ts`, applied instantly.
- Per-note reset for free - each note's reading-view container is a
  separate DOM subtree, so counter state never leaks between notes.
- No need to special-case Obsidian's inline note title (a contenteditable
  `.inline-title` div, not an actual heading tag) - it was never in scope
  for the counters, but an explicit `.inline-title::before { content:
  none !important; }` guard is included defensively.

This is simpler and more robust than a `registerMarkdownPostProcessor`
that would have to track/rebuild per-file counters across partial
re-renders, so it was chosen over the JS fallback described in the brief.

### Title block: JS post-processor (this part *does* need JS)

Unlike numbering, the `\maketitle`-style block requires reading YAML
frontmatter and injecting new DOM, which CSS can't do. Implemented as a
`registerMarkdownPostProcessor` that:

- Reads `title` / `subtitle` / `author` / `date` from
  `app.metadataCache.getFileCache(file)?.frontmatter` (the cache, not by
  re-parsing the rendered chunk's text).
- Guards against duplication by checking whether the reading-view
  container already has a `.latex-look-title-block` child before
  inserting one - since Obsidian invokes the post-processor once per
  rendered top-level block (paragraph, heading, etc.) in document order,
  the first call for a fresh container inserts the block; every
  subsequent call (including ones triggered by partial re-renders while
  editing) sees it already present and no-ops.
- Skips entirely (renders nothing) when a note has no frontmatter, or has
  frontmatter but none of the four relevant keys - satisfying "must not
  break when frontmatter is absent."
- On toggling the setting off in the settings tab, `main.ts` forces a full
  re-render of any currently open reading-view leaves (via the
  `MarkdownView.previewMode.rerender(true)` escape hatch, guarded so a
  missing/renamed internal API degrades to a no-op instead of throwing)
  so the block disappears immediately rather than only on next file open.

### Print / PDF export sizing

`@page` at-rule properties (`size`, `margin`) cannot be driven by CSS
custom properties in Chromium (the engine behind Obsidian's Export to
PDF) - `var()` inside `@page` is not honored. So instead of trying to
parameterize `styles.css` itself, `main.ts` injects/rewrites a small
dedicated `<style>` element containing a literal `@page { size: ...;
margin: ...; }` block whenever the paper-size setting changes. `styles.css`
still carries a static Letter/1in fallback `@page` rule for the brief
window before the plugin's `onload()` runs.

Documented in `README.md` that Electron's own print-to-PDF margin control
can still override the CSS `@page` margin, and that users should set
Obsidian's export margin to "None"/"Custom: 0" for the CSS margins to take
effect as intended - this is a platform limitation, not something fixable
purely from plugin CSS.

### Git / branching

Repo did not exist yet. Initialized with `git init`, then followed
gitflow: `main` and `develop` created, all implementation work done on
`feature/initial-plugin` off `develop`, merged back into `develop` only
(left `main` for the user to cut an actual release from). Commits are
split by concern (scaffold, fonts, typography CSS, heading numbering,
title block + settings, docs) rather than one giant commit.

## 2026-09-07 - Table column sizing, found via real-note testing

Rather than testing purely with synthetic sample content, validated the
plugin against two of the user's own real notes (dropped into a
gitignored `resources/` folder - confidential business documents used
only as realistic sample material, never committed; see the new
`.gitignore` entries). Rendered them through the plugin's actual
`styles.css` in a standalone HTML harness
(`test-artifacts/halter-side-by-side-sample.html`, itself gitignored)
with a toggle between plain/default-Obsidian-style and LaTeX Look
styling, so the plugin could be visually reviewed without installing it
into a live vault.

This surfaced a real table-layout problem that synthetic test content
hadn't: `.markdown-rendered table` was `width: auto`, so the browser's
default table algorithm sized (and centered) the table purely by
shrink-to-content, with no `table-layout` mode specified. On a 6-column
table with one long-text column ("Risk") next to several short ones
("Impact", "Likelihood", "Rating"), this produced uneven, cramped-looking
columns.

Two iterations were tried:

1. **`table-layout: fixed` + equal-ish columns.** Rejected on user
   feedback - this forces every column to the same width regardless of
   content, which is the wrong kind of "balanced": short columns end up
   wasting space while the long-text column wraps into tall rows
   unnecessarily.
2. **`table-layout: auto` + `width: 100%`** (the change actually kept).
   This is the browser's standard content-aware algorithm: each column's
   width is still driven by its content's natural size, but the table
   stretches to fill the container instead of shrink-wrapping, and the
   extra space is distributed in proportion to each column's content
   width. Verified on the real 6-column risk table: `#` ended up at 41px,
   `Risk` at 163px, down to `Impact` at 88px - proportional to actual
   content, filling the full 613px pane width with no horizontal
   overflow. This directly minimizes wrapped row height, which was the
   actual goal.

Also added `overflow-wrap: break-word` on table header/body cells as a
safety net, in case a future note has an unbroken long token (a filename,
a URL) in a narrow column.

## 2026-09-08 - Architecture change: opt-in export command instead of always-on Reading-view theme

### What it was, and what was wrong with it

Up to this point, the plugin applied its LaTeX styling **globally and
always**: `styles.css` had unconditional rules on `.markdown-rendered`,
and `main.ts`'s `applySettings()` permanently toggled body classes
(`latex-look-heading-numbers`, `latex-look-title-block-enabled`) and set
`--latex-look-font-size` the moment the plugin loaded - every note's
Reading view was restyled the instant the plugin was enabled, with no way
to opt out short of disabling the plugin entirely. The title-block
post-processor also ran unconditionally on every rendered note.

The user corrected this directly: that's wrong. A plugin should not
silently change how every note looks the moment it's installed - the
LaTeX styling is specifically useful for producing a nicely typeset PDF to
hand to someone else, not for reading notes day-to-day inside Obsidian.

### What it is now

The plugin no longer touches Reading view at all by default. All styling
is applied on-demand by a new Command Palette command, **"Export current
note as LaTeX-look PDF"** (id `export-latex-look-pdf`), which:

1. Ensures the active `MarkdownView` is in `"preview"` mode (awaiting
   `MarkdownView.setState({ mode: "preview" }, { history: false })` if a
   switch is needed), so the export captures rendered HTML, not source.
2. Applies the export styling: adds `latex-look-exporting` to
   `document.body.classList`, toggles the heading-numbering/title-block
   sub-classes per settings, sets the font-size custom property, and
   rewrites the injected `@page` `<style>` element for the paper-size
   setting - all logic that previously ran unconditionally at `onload()`,
   now only ever invoked from inside the export flow.
3. Forces a full re-render (`previewMode.rerender(true)`, same guarded
   escape hatch as before) so the title-block post-processor - now gated
   behind a `private exporting` flag, returning early when false - picks
   up the frontmatter title block, then waits a frame plus a short delay
   for layout to settle.
4. Locates and triggers Obsidian's own built-in "Export to PDF" command
   (see below for why this is done dynamically rather than by hardcoded
   id), which pops Obsidian's normal native save-file dialog - nothing
   about the actual PDF generation is reimplemented by this plugin.
5. Reverts everything (see below for why on `active-leaf-change` rather
   than a timer) - removes the body classes, strips any injected
   `.latex-look-title-block` element out of that note's DOM, and
   re-renders the view once more so it snaps back to stock Obsidian
   styling.

`styles.css` was restructured so every selector that used to target
`.markdown-rendered` (and the title block, blockquotes, code, tables)
is now prefixed with `body.latex-look-exporting` - with that class absent
(i.e. always, unless an export is actively running), none of the rules in
the file match anything, and Reading view is byte-for-byte vanilla
Obsidian. Heading numbering is additionally gated behind its own
`latex-look-heading-numbers` sub-class, combined with the export gate
(`body.latex-look-exporting.latex-look-heading-numbers ...`), since it's
still an independently toggleable setting. `@font-face` declarations were
left unconditional - loading a font file has no visible effect until
something actually sets that `font-family`, so there's nothing to gate.

`rerenderOpenNotes()` (previously used to instantly restyle all open
notes when a setting toggle changed, since styling used to be always
visible) was deleted outright - dead code now that settings have no
effect until the next time the export command runs, so there's no "open
notes need to instantly reflect this toggle" use case left to serve. A
narrower `rerenderView(view)` helper remains, used only internally by the
export flow itself (to trigger the title block on export-start, and to
clear it again on export-end).

### Two specific technical choices worth recording

**(a) Why the "Export to PDF" command is looked up dynamically, not
hardcoded.** Obsidian's internal command id for its built-in PDF export
(something like `"file-manager:...pdf"` or similar depending on version)
is not part of any stable public API and is known to have varied across
Obsidian releases. Hardcoding a specific id risks silently breaking on a
future Obsidian update with no clear failure signal to the user beyond
"the command did nothing." Instead, `findExportToPdfCommandId()` scans
`(app as any).commands.commands` (an object keyed by command id) for any
entry whose `id` or `name` matches `/export.*pdf/i`, and calls
`executeCommandById` on whatever it finds. If nothing matches (e.g. the
core plugin providing PDF export is disabled), the plugin shows a
`Notice` explaining that and immediately reverts the styling rather than
leaving the note stuck in export-styled limbo.

**(b) Why cleanup waits for the next `active-leaf-change` event instead
of a fixed delay.** Obsidian's native "Export to PDF" flow hands off to a
real save-file dialog, and there is no API signal for when that dialog
closes - its duration is entirely up to the user (they might take two
seconds or two minutes to pick a location, or cancel outright). A fixed
timeout would either revert the styling while the export is mid-flight
(too short) or leave the note visibly LaTeX-styled for an
arbitrary/awkward stretch after the user is done (too long). Listening
once for `"active-leaf-change"` instead ties cleanup to something that
reliably happens as soon as the user's attention actually moves on - they
switch to another note, or back to the same one - with no guessing
involved. The registered listener is removed via `workspace.offref()` the
first time it fires, so it never fires twice. A `setTimeout` safety net
(5 minutes) backstops this in case the user never changes leaves after
running the command, so the plugin can never get permanently stuck
mid-export; `onunload()` also unconditionally clears the export state
regardless of whether that listener/timeout ever fired.

## 2026-09-09 - Heading numbering removed, horizontal rules restyled

First real-world bug report, against an actual note (not synthetic test
content or a demo harness): "KV 2026 Week 37/ANSI/ANSI-ASQ-Z1.4-2003-
Statistical-Notes.md", exported to PDF and inspected directly (the PDF's
`/Creator (Chromium)` / `/Producer (Skia/PDF m142)` metadata confirms it's
a genuine Obsidian export, not a stand-in). Two problems, reported
together as "the heading has extra numbering":

**1. Double numbering on notes with their own manual section numbers.**
This note's headings already read "## 1. The probability model", "## 2.
The decision rule...", etc. - the author's own academic-notes convention.
The plugin's auto-numbering doesn't know that and prepends its own count
regardless, producing "2.2 1. The probability model" in the exported PDF.

**2. A phantom numbered heading from Obsidian's own note title.** Page 1
of the real export showed "1 ANSI-ASQ-Z1.4-2003-Statistical-Notes" (the
filename) as a numbered heading, above the note's actual first heading -
Obsidian's inline title being swept into the count as if it were content.
`styles.css` already had a guard for exactly this
(`.inline-title::before { content: none !important; }`), carried over
from the original 2026-09-07 build - it evidently doesn't match whatever
element Obsidian's real PDF-export pipeline actually uses for the title,
since the real output shows it numbered anyway. The exact DOM shape there
was never confirmed (no Obsidian devtools access in this environment);
asked the user to inspect it directly, but decided not to chase the fix
before getting an answer.

**Decision: remove heading numbering entirely, not just fix the bug.**
Asked the user how to handle problem 1 (leave it to the user vs. an
auto-detect-and-skip heuristic) and problem 2 (ask for devtools help vs.
some other approach) - the answer for problem 1 was "no automatic
numbering for headers" at all, and a follow-up confirmed that means
deleting the feature outright rather than merely defaulting it off. This
resolves both problems at once (no counters running at all means nothing
to double up, and nothing for a phantom title heading to be swept into),
at the cost of losing the LaTeX `\section`-numbering look entirely. If
it's reintroduced later, HANDOFF.md's suggested-next-steps section has
the two things that would need solving first (the real title-element
selector, and a policy for pre-numbered headings) - don't just restore
the old CSS counters as-is.

Removed: `headingNumbering` from `LatexLookSettings` and its settings-tab
toggle (`main.ts`); the `latex-look-heading-numbers` body class and all
`applyExportStyling`/`clearExportStyling` references to it; the entire
CSS counter block (section 4 of the old `styles.css` numbering, counters
`llh1`-`llh6`, the `::before` content rules, and the now-pointless
`.inline-title::before` guard) from `styles.css`.

**Also fixed while reviewing that same PDF: horizontal rules.** The note
uses `---` fairly often as a personal section-divider convention.
`styles.css` never had any `hr` rule at all, so it fell back to
Obsidian's default full-width divider - which, in the real export, looked
redundant directly under a table (which already ends in its own
full-width booktabs bottom rule) and oddly spaced next to a numbered
heading's own generous top margin. Rather than hide `---` entirely
(the user's own explicit choice: restyle, not remove - some notes clearly
use it as intentional structure), gave it a dedicated look: a short
(30%-width), centered, thin (0.6pt), slightly translucent rule with
generous vertical margin (`styles.css`, new section 5). This is the
classic scholarly-document "thematic break" convention - visually
distinct from the full-width table/title-block rules elsewhere on the
page, so it reads as a deliberate break rather than a second copy of a
table's bottom line.

## 2026-09-16 - Wide tables were silently losing data in real exports

Second real-world bug report, this time from
"FG and Raw Material Requirements Summary.md"
(`Notes - KV/Archive/KV 2026 Week 25/260615 RFQ 26030 Transtop-ABB RFQ/`),
a 38-page Transtop/ABB RFQ costing document - external-facing, not
internal notes. Exported PDF confirmed genuine (`/Creator (Chromium)`,
`/Producer (Skia/PDF m142)`). Reported as "quite broken."

**Root cause: `table-layout: auto` has no floor.** The `Material Summary`
table (repeated per part, 7 of them) has 7 columns, two of which
(`Customer spec`, `Notes`) hold paragraph-length text. Auto layout sizes
each column to its natural content width and, when the columns' combined
minimum exceeds the page's printable width, lets the table overflow its
container rather than compress further - and a printed page can't scroll
to compensate. The overflow was silently clipped at the page edge: on
page 4 of the real export, the **Cost/unit (USD)** and **Notes** columns
were completely missing, and **Unit cost** was cut down to a bare
currency symbol with no number. This is real data loss in a document
meant to go to a customer, not a cosmetic issue - worse in kind than the
09-09 table-balance complaint, even though both are "the table looks
wrong." A 6-column table elsewhere in the same document, with terser
cells, rendered fine - confirming this only bites on wide/dense tables,
which this document has several of.

**The fix, arrived at over a few iterations (verified each time against
the actual failing table, rendered at the real Letter-minus-1in-margins
content width of 624px, not just eyeballed):**

1. `overflow-wrap: anywhere` (up from the existing `break-word`) on
   `th`/`td` - `break-word` only breaks at an already-allowed point
   (after a hyphen, at a space); `anywhere` will break at an arbitrary
   character as a last resort. This collapses each column's minimum
   content width down to about one character, which is what actually
   stops the overflow - `table-layout: auto` is otherwise left alone, so
   proportional-by-content sizing (the explicit 09-09 requirement) still
   applies whenever a table already fits.
2. First iteration of (1) alone overcorrected: short header words like
   "Element" got squeezed down to one letter per line ("E-l-e-m-e-n-t"),
   ugly even though nothing was actually lost. Fixed with `min-width:
   4.5em` on every `th`/`td`, giving short columns a floor before
   `anywhere` kicks in. (Tried `3.5em` first; still let "Element" break
   as "Eleme-nt" with no hyphen - `4.5em` was the value that actually
   let it sit on one line in the verification render.) A per-column
   floor times a realistic column count stays well under a page's usable
   width, so it doesn't reintroduce the overflow it's meant to prevent
   for tables in the range this plugin is meant to handle - an
   extreme-enough column count could in principle still overflow, but
   that's an inherent limit of keeping `auto` at all, not something
   `table-layout: fixed` would avoid either (fixed would just make such
   a table unreadably narrow instead).
3. Also dropped table cell padding from `0.9em` to `0.7em` horizontal,
   and added `table { font-size: 0.85em }` - tables now render a size
   down from body text, which is standard LaTeX practice for wide tables
   (`\small`/`\footnotesize`) and directly reduces how often (2)'s
   `anywhere` fallback is needed at all, rather than just papering over
   it with a wider floor.
4. `code` spans inside table cells needed their own
   `white-space: normal` override - Obsidian's inline-code styling
   otherwise resists wrapping independently of the cell's own
   `overflow-wrap`, which would leave a long backticked part number
   (e.g. `301-1653200-T10`) as a fixed unbreakable chunk regardless of
   how narrow its column got.

**Rejected: switching to `table-layout: fixed`.** This would have
guaranteed no overflow outright (offered as the recommended option), but
the user chose to keep `auto` and add a cap instead, preserving the
content-proportional sizing from 09-09 for the common case where a table
does fit.

**Verification method worth reusing next time:** rather than trust a
screenshot of the full demo page (previous rounds' Combined Risk Summary
tables all "looked fine" partly because that demo pane was wider than a
real printed page ever would be), built a minimal isolated harness -
just the one failing table, wrapped in a 624px box with `overflow:
hidden` and a visible red border, so any real overflow is immediately
obvious rather than easy to miss by eye in a long scrollable page.

## 2026-10-08 - YAML properties removed from the exported document

Request: no YAML properties in the exported PDF. With "Properties in
document" set to Visible, Obsidian prints the Properties panel at the top
of the export, above the title block.

Fix is CSS only (`styles.css` section 11): `display: none !important` on
`.metadata-container`, plus the raw/legacy frontmatter renderings
(`.frontmatter-container`, `pre.frontmatter`, `.frontmatter`), all scoped
under `body.latex-look-exporting` like everything else, so Reading view
outside an export is untouched. `main.ts` is unchanged, so `main.js` did
not need a rebuild.

Decision worth recording: the `\maketitle`-style title block was kept.
It is derived from frontmatter but is not a rendering of the properties
themselves, and it already has its own on/off setting. It keeps working
because the post-processor reads `metadataCache`, not the hidden DOM.

Not verified in a real Obsidian export in this session - the selectors
are Obsidian's standard class names, but the check added to TEST_PLAN
section 8 still needs to be run by hand.

## 2026-10-08 - Export now reverts as soon as it ends

Reported: after generating a PDF, the note's Reading view stayed in the
LaTeX look. That was the 09-08 design working as written (cleanup on the
next `active-leaf-change`, else a 5-minute timeout), and it was the wrong
design - nobody switches panes just to get their note back.

The 09-08 entry said there is no signal for the export ending. There is
one; it was found this time by reading the export code in the installed
Obsidian's `obsidian.asar` rather than guessing:

- Confirming the export dialog shows the save dialog *while the dialog is
  still open*, then closes it and opens a hidden popup window
  (`window.open("about:blank", ...)`), renders the note into a `.print`
  div in that window, prints, and closes the window.
- Obsidian mirrors the main window's `<body>` classes, `--*` inline
  properties and `<head>` styles into that popup. That is why
  `body.latex-look-exporting` on the main window styles the PDF at all,
  and why it has to stay there until the print is done.
- The print render goes through the normal post-processor pipeline, so
  the plugin's post-processor is called with an element whose document
  is the popup's.

New cleanup, replacing the leaf-change listener:

- Finished: the post-processor sees a render in a window that is not the
  main one, records it, and polls `closed` on that window every 200ms.
  Closed means the PDF was written (or failed) - revert.
- Cancelled: a MutationObserver watches for the export dialog leaving
  `document.body`. If no print render follows within 2s, it was a cancel
  - revert. (On a save, the popup opens in the same tick the dialog
  closes and renders about 200ms later, so 2s is generous.)
- The 5-minute timeout stays as a backstop only.

Also new: the note's previous mode (Live Preview / Source) is remembered
and restored on revert, instead of leaving it in Reading view.

`finishExport()` no longer takes a view; it reads the state it needs and
is safe to call when nothing is exporting, so `onunload` and the start
of a new export both just call it.

Built in Docker (`tsc` clean). Not run in a live Obsidian in this session
- TEST_PLAN section 5 was rewritten for the new behaviour and needs a
hand run. The dependency on Obsidian printing through a separate popup
window is version-specific: if a future version prints in the main
window again, the "finished" signal will not fire and the cancel path
will revert the styling 2s after the dialog closes, possibly before the
PDF is captured. That is the first thing to check if exports come out
unstyled after an Obsidian update.

## 2026-10-08 - Title block now off by default

Follow-up to the properties entry above, which got the request wrong.
"Remove all YAML properties from the exported doc" was about the title
block: the note's `author: Claude` was being printed on the first page
of the PDF. I had kept the title block on the reasoning that it is not a
rendering of the properties - but to the reader it is exactly that.

Also found while checking Obsidian's bundled CSS: Obsidian already hides
`.metadata-container` inside `.print`, so the Properties panel never
reached the PDF in the first place. The section 11 rule in `styles.css`
is therefore only doing something for the on-screen Reading view during
the export; it is harmless and was left in.

Change: `DEFAULT_SETTINGS.titleBlock` is now `false`. The feature and
its setting remain for anyone who wants a `\maketitle` block. The vault
install had no `data.json`, so the new default applies there directly;
an install that had saved settings earlier would keep whatever it saved.

## 2026-10-08 - Templates: IEEEtran added, made the default

Request: mimic the IEEE Transactions template, as a template option.
Templates are named after the LaTeX class they approximate, at the
user's instruction: `IEEEtran` and `article` (the existing look, which
was always an approximation of `article.cls` with Latin Modern).

Decisions taken with the user before building:

- Single column, not two. The notes this is used on are table-heavy.
- Paper title = the note's first H1. No author block; nothing from YAML.
- IEEE heading styles without automatic numbering (numbering stays
  removed, per 2026-09-09).

One point I decided myself and should be confirmed: the request said
IEEE would be "default and only one for now", and the answer to "what
happens to the article look" was to name things by their original
template name. I kept `article` as a second option rather than deleting
it. Removing it later is a small change (drop the dropdown entry and
fold section 12 into the base).

How it is built:

- `settings.template`, default `ieeetran`. While exporting, the body
  gets `latex-look-template-<id>` next to `latex-look-exporting`.
- CSS: sections 3-10 unchanged (article, and the shared base). Section
  12 holds the IEEEtran overrides, each selector carrying both body
  classes so it outranks the base rule it replaces. The font swap is a
  redefinition of `--latex-look-serif`, so everything that already uses
  the variable follows. Times is taken from the system rather than
  bundled - no new font files or licences.
- Title: CSS cannot select "first H1 of the document" through Obsidian's
  per-block wrappers, so the post-processor adds `latex-look-doc-title`.
  In the print render the whole document arrives in one call with no
  section info, so it is simply the first H1 found. In Reading view
  sections arrive separately, so the section's start line is compared
  with the first level-1 heading in the metadata cache. The class is
  removed again on cleanup.
- `@page` margins are now per template: IEEEtran uses approximately the
  journal text block (43pc wide), i.e. about 0.67in side margins on
  Letter. At 10pt in one column that is a long line (the real class's
  `onecolumn` option has the same property). If it reads badly, widening
  the IEEEtran margins in `PAGE_SPECS` is the knob.
- Default base font size changed from 11pt to 10pt, which is the actual
  default of both classes.

Known approximations: IEEEtran runs subsubsection headings into the
paragraph text; here they are separate indented italic lines. H1 after
the title and H2 are both styled as sections.

Verification: `tsc` clean; IEEEtran rules rendered in a browser through
`test-artifacts/ieeetran-harness.html` and looked right. Not exported
from Obsidian.

## 2026-10-08 - IEEEtran: the H1 is the title, even over the file name

With "Include file name as title" ticked in Obsidian's export dialog,
the file name was becoming the paper title and the note's H1 a section
heading. The user wants the H1 as the title. In the print render the
file-name heading is the only H1 that is a direct child of the
container (Obsidian wraps every block of the note in a div), so when the
note has an H1 of its own the file-name heading is removed before the
title is tagged. A note with no H1 keeps the file name as its title.
IEEEtran only; `article` is unchanged. Not exported from Obsidian.

## 2026-10-08 - article: first H1 as title too

Same treatment as IEEEtran, at the user's request: `markDocumentTitle`
now runs for every template (including dropping the export dialog's
file-name heading when the note has its own H1), and the base CSS styles
`h1.latex-look-doc-title` the way `\maketitle` sets `\title` in
article.cls - centered, about `\LARGE`, regular weight. Later H1s keep
the bold section style.

If the optional frontmatter title block is turned on as well, a note
with both a `title:` field and an H1 will show two titles. Left as is:
the block is off by default and that combination is the user's choice.
Not exported from Obsidian.
