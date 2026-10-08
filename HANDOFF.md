# HANDOFF

## Current state

**2026-10-08:** there are now two templates, each with its own Command
Palette export command (`export-ieeetran-pdf`, `export-article-pdf` -
there is no template setting, and the old `export-latex-look-pdf`
command is gone) and named after the LaTeX class each approximates: `IEEEtran`
(default) and `article`. `article` is the original look and doubles as
the shared CSS base (`styles.css` sections 3-10); `IEEEtran` is a set of
overrides in section 12, gated on the body class
`latex-look-template-ieeetran`, plus one bit of JS that tags the note's
first H1 as the paper title. A static render of the IEEEtran rules was
checked in a browser via `test-artifacts/ieeetran-harness.html`; a real
Obsidian export has still not been checked. See DEVLOG.md 2026-10-08.

The plugin is feature-complete against the current design (opt-in export
via a Command Palette command - see `DEVLOG.md`'s 2026-09-08 entry for the
architecture change from the original always-on-Reading-view design, and
the 2026-09-09 entry for the heading-numbering removal and horizontal-rule
restyling found via real-world testing) and builds cleanly. It has **not**
been visually verified inside a real
Obsidian instance (no Obsidian UI access in the environment this was built
in) - see `test-artifacts/TEST_PLAN.md` for the manual verification steps
that still need to be run by a human with Obsidian installed.

Normal Reading view is now untouched by default. All LaTeX-look styling is
applied only for the duration of running one of the **"Export current
note as IEEEtran PDF" / "... as article PDF"** commands from the Command
Palette, and is automatically
reverted as soon as the export finishes or is cancelled.

### Done

- Plugin scaffold (`manifest.json`, `package.json`, `tsconfig.json`,
  `esbuild.config.mjs`, `main.ts`, `styles.css`) builds via
  `docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npm install && npm run build"`
  with no TypeScript errors, producing `main.js`.
- Latin Modern Roman (Regular/Bold/Italic/BoldItalic) bundled as WOFF2
  under `fonts/`, sourced from the CTAN `lm` package (GUST Font License)
  and converted with `fonttools` inside Docker - no CDN, no network calls
  at runtime. License + provenance documented in `fonts/`.
- Command Palette commands `export-ieeetran-pdf` and
  `export-article-pdf` ("Export current note as IEEEtran PDF" / "... as
  article PDF"), each available only when there's an active `MarkdownView`
  (via `checkCallback`), that: switches the view to preview mode if
  needed, applies export-only styling, forces a re-render so the
  title-block post-processor runs, dynamically locates and triggers
  Obsidian's built-in "Export to PDF" command (matched by regex over
  `app.commands.commands` rather than a hardcoded id - the id isn't a
  stable public API), and reverts all styling and the note's previous
  view mode when the export ends: when Obsidian's hidden print window
  closes (finished), or when the export dialog is dismissed with no print
  render following within 2s (cancelled), with a 5-minute `setTimeout`
  safety net. See DEVLOG.md 2026-10-08 for how those signals were found
  in Obsidian's own code.
- All CSS in `styles.css` (typography, title block, blockquotes, code
  blocks, tables) is scoped under `body.latex-look-exporting`, a class
  only ever added to `<body>` for the duration of the export command - so
  Reading view is untouched unless an export is actively running.
- Base typography: justified body text, first-line indent, no
  inter-paragraph blank space, tight heading spacing, headings bold/serif
  - all export-only per the above.
- (Off by default since 2026-10-08.) `\maketitle`-style title block from frontmatter (`title`/`subtitle`/
  `author`/`date`) via a markdown post-processor gated behind a
  `private exporting` instance flag - a no-op outside of an active
  export, and any injected block is stripped from the DOM on cleanup.
- YAML properties are hidden in the exported document (CSS only,
  `styles.css` section 11): the Properties panel and the raw frontmatter
  renderings are `display: none` under `body.latex-look-exporting`. The
  title block still works because it reads the metadata cache, not that
  DOM. Not yet verified against a real export - see TEST_PLAN section 8.
- Blockquotes styled as a LaTeX `quote` environment.
- Code blocks styled as a `verbatim` box (border + existing Obsidian
  monospace/syntax highlighting).
- Tables styled booktabs-style (no vertical rules, heavy top/bottom rules,
  rule under header, no banding).
- Horizontal rules (markdown `---`) styled as a short, centered, thin
  divider instead of Obsidian's default full-width `<hr>`.
- Math (MathJax) left alone aside from minor line-height/margin nudges.
- Settings tab: title-block toggle, base font-size dropdown (10/11/12pt),
  paper-size dropdown (Letter/A4), persisted via `loadData`/`saveData`.
  Descriptions say they control the export, not Reading view; they no
  longer apply "live" since nothing is visible to apply them to until the
  export command runs.
- Print/export CSS: `@media print` rules plus a JS-injected `@page`
  size/margin rule driven by the paper-size setting, written fresh at the
  start of each export.
- `rerenderOpenNotes()` (used previously to instantly restyle all open
  notes on a live settings change) was deleted as dead code - there is no
  longer a "propagate this setting change to already-open notes" use case
  now that nothing is visible until export time.
- `README.md`, this `HANDOFF.md`, `DEVLOG.md`, and
  `test-artifacts/TEST_PLAN.md` updated for the new command-based flow
  (with a sample note at `test-artifacts/sample-note.md` exercising every
  feature).
- Git repo initialized with gitflow branches (`main`, `develop`,
  `feature/initial-plugin`), feature branch merged into `develop`.

### Not done / explicitly out of scope

Per the brief's scope-discipline instruction, none of the following were
implemented, and they were not attempted or partially started:

- Bibliography / citation support (no BibTeX-style references).
- Automatic table-of-contents block insertion.
- Multi-template selection (only one look: the `article`-class
  approximation).
- Two-column layout.
- Obsidian community-plugin store submission prep (this is a manual-install
  / BRAT-only plugin as specified).
- Automatic heading numbering. This existed briefly (2026-09-07/08) and was
  **removed** on 2026-09-09 after real-world testing against an actual
  note (not a synthetic sample) surfaced two problems: it double-numbers
  headings that already contain their own manual numbers (common in these
  notes' academic/reference style, e.g. "## 1. The probability model"),
  and it swept Obsidian's own inline note title into the count as a
  phantom "heading #1" in the real exported PDF - a genuine bug whose
  exact DOM cause was never pinned down (see DEVLOG.md 2026-09-09). Rather
  than chase an increasingly fragile exclusion selector, the feature was
  deleted outright per explicit instruction rather than merely
  defaulted-off.

### Known limitations / things a future maintainer should know

1. **No live Obsidian verification - and this is now more true than
   before.** This was built and unit-tested only via `tsc`/`esbuild` in
   Docker; there is no Obsidian instance in this environment to load the
   plugin into and visually confirm it. The next person to touch this
   should load it into a real (test) vault and work through
   `test-artifacts/TEST_PLAN.md` before trusting the visual output.
   Beyond the pre-existing unknowns below, the entire export command flow
   added on 2026-09-08 - mode switch, dynamic command lookup, the actual
   native PDF dialog, and cleanup-on-leaf-change - is brand new and has
   **never** been run against a real Obsidian instance, which is a bigger
   unverified surface than the previous styling-only build had:
   - Whether `MarkdownView.setState({ mode: "preview" }, { history: false })`
     actually resolves its returned Promise only once the mode switch (and
     associated re-render) has visibly completed, or resolves earlier -
     this determines whether the subsequent `rerender(true)` call is
     racing the mode switch in practice.
   - Whether `(app as any).commands.commands` is actually shaped the way
     assumed (an object keyed by command id, each value carrying `.id`
     and `.name`) on the Obsidian version being tested, and whether the
     regex `/export.*pdf/i` actually matches the real built-in command's
     id/name without also matching something unintended.
   - Whether `executeCommandById` on the located PDF-export command
     actually opens the native save dialog synchronously enough that the
     styling is still applied when Chromium captures the page - if
     Obsidian defers the actual print/capture step, there could be a race
     between styling application and export capture that the
     requestAnimationFrame+50ms delay in `exportCurrentNoteAsPdf` doesn't
     fully cover.
   - Whether the revert-on-export-end signals (2026-10-08) behave as
     read from Obsidian's bundled code: the print render arriving in a
     separate popup window that closes when the PDF is written, and the
     export dialog being a direct `.modal-container` child of
     `document.body`. Both are internals and version-specific. If the
     print-window signal stops firing, the cancel path reverts styling 2s
     after the dialog closes, which could be before the PDF is captured -
     the symptom would be unstyled PDFs.
   - Whether the relative `url("fonts/...")` paths in `styles.css`
     actually resolve inside Obsidian's plugin CSS loading pipeline on
     their Obsidian version/platform (this is documented as supported for
     theme/plugin-relative assets, and the code was written on that
     assumption, but it has not been confirmed against a running app in
     this session).
   - Whether the `.el-h1 + .el-p`-style wrapper-div selectors used for
     "no indent on the first paragraph after a heading" actually match
     Obsidian's current reading-view DOM (Obsidian has changed rendering
     wrapper conventions between versions before). Fallback direct-sibling
     selectors (`h1 + p`, etc.) are also included for robustness, but this
     hasn't been visually confirmed.
   - Whether `MarkdownView.previewMode.rerender(true)` (used to force a
     re-render at export-start and export-end) is still present under that
     name/signature on the Obsidian version being tested - it's an
     internal-ish API accessed via a type cast, guarded with `?.` so a
     missing method degrades to a no-op rather than a crash, but if it is
     in fact missing/renamed on the tested version, the title block simply
     won't appear in the export (silently), which should be checked for.
2. **Print margin caveat is a platform limitation, not a bug.** See
   `README.md` - Electron's print-to-PDF dialog margin setting can
   override the plugin's `@page` margin. There is no CSS-only way around
   this; it needs the user to pick "None"/"Custom: 0" in Obsidian's export
   dialog.
3. **Font subset.** Only the four core Roman weights/styles were bundled
   (Regular, Bold, Italic, Bold Italic) - no Latin Modern Sans or Latin
   Modern Mono were bundled, since the brief only asked for body-text
   typography and code blocks already use Obsidian's existing monospace
   font. If a future iteration wants monospace code blocks in a matching
   "LaTeX verbatim" font, `lmmono10-regular.otf` etc. are in the same CTAN
   `lm.zip` package and could be converted the same way.

## Suggested next steps

1. Load into a real test vault and run through
   `test-artifacts/TEST_PLAN.md`; file any visual bugs found there against
   the specific CSS rule or `main.ts` function responsible.
2. If font loading via relative `url()` turns out not to work on some
   platform, the fix is to have `main.ts` resolve the actual resource path
   at runtime (e.g. via `this.app.vault.adapter.getResourcePath(...)`
   relative to the plugin's own directory) and inject a small `<style>`
   block with absolute `app://` URLs instead of relying on the static
   `styles.css` relative paths - the WOFF2 files and their license/
   provenance docs would not need to change, only how they're referenced.
3. If heading numbering is ever wanted back, don't just re-add the old CSS
   counters: first find, in a real Obsidian devtools inspector, exactly
   what element/class wraps the note's inline title in the PDF-export DOM
   (this was never pinned down - see DEVLOG.md 2026-09-09) so it can be
   reliably excluded, and separately decide how to handle notes whose
   headings already contain manual numbers (skip numbering entirely for
   those, or attempt a "strip existing leading number" heuristic, which
   risks misfiring on headings that legitimately start with a digit).
