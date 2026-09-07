# HANDOFF

## Current state

The plugin is feature-complete against the original brief and builds
cleanly. It has **not** been visually verified inside a real Obsidian
instance (no Obsidian UI access in the environment this was built in) -
see `test-artifacts/TEST_PLAN.md` for the manual verification steps that
still need to be run by a human with Obsidian installed.

### Done

- Plugin scaffold (`manifest.json`, `package.json`, `tsconfig.json`,
  `esbuild.config.mjs`, `main.ts`, `styles.css`) builds via
  `docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npm install && npm run build"`
  with no TypeScript errors, producing `main.js`.
- Latin Modern Roman (Regular/Bold/Italic/BoldItalic) bundled as WOFF2
  under `fonts/`, sourced from the CTAN `lm` package (GUST Font License)
  and converted with `fonttools` inside Docker - no CDN, no network calls
  at runtime. License + provenance documented in `fonts/`.
- Base typography: justified body text, first-line indent, no
  inter-paragraph blank space, tight heading spacing, headings bold/serif.
- Automatic heading numbering via pure CSS counters
  (`body.latex-look-heading-numbers`), toggleable live in settings.
- `\maketitle`-style title block from frontmatter (`title`/`subtitle`/
  `author`/`date`) via a markdown post-processor, toggleable live in
  settings (forces a reading-view re-render on toggle).
- Blockquotes styled as a LaTeX `quote` environment.
- Code blocks styled as a `verbatim` box (border + existing Obsidian
  monospace/syntax highlighting).
- Tables styled booktabs-style (no vertical rules, heavy top/bottom rules,
  rule under header, no banding).
- Math (MathJax) left alone aside from minor line-height/margin nudges.
- Settings tab: heading-numbering toggle, title-block toggle, base
  font-size dropdown (10/11/12pt), paper-size dropdown (Letter/A4),
  persisted via `loadData`/`saveData`, all applied live.
- Print/export CSS: `@media print` rules plus a JS-injected `@page`
  size/margin rule driven by the paper-size setting.
- `README.md`, this `HANDOFF.md`, `DEVLOG.md`, and
  `test-artifacts/TEST_PLAN.md` (with a sample note at
  `test-artifacts/sample-note.md` exercising every feature).
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

### Known limitations / things a future maintainer should know

1. **No live Obsidian verification.** This was built and unit-tested only
   via `tsc`/`esbuild` in Docker; there is no Obsidian instance in this
   environment to load the plugin into and visually confirm it. The next
   person to touch this should load it into a real (test) vault and work
   through `test-artifacts/TEST_PLAN.md` before trusting the visual
   output, especially:
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
     re-render when the title-block toggle changes) is still present under
     that name/signature on the Obsidian version being tested - it's an
     internal-ish API accessed via a type cast, guarded with `?.` so a
     missing method degrades to "no immediate re-render" rather than a
     crash, but the live-refresh UX should be checked.
2. **Heading numbering scope.** CSS counters number every `h1`-`h6` inside
   `.markdown-rendered`, including ones inside callouts or transcluded/
   embedded notes rendered inline. This mirrors LaTeX's "everything shares
   one counter scope" behavior reasonably well, but if KVE ever wants
   embeds/callouts excluded from the running numbering, that would need
   additional selector scoping (e.g. excluding `.callout` and
   `.markdown-embed` subtrees) - not attempted here to keep scope tight.
3. **Print margin caveat is a platform limitation, not a bug.** See
   `README.md` - Electron's print-to-PDF dialog margin setting can
   override the plugin's `@page` margin. There is no CSS-only way around
   this; it needs the user to pick "None"/"Custom: 0" in Obsidian's export
   dialog.
4. **Font subset.** Only the four core Roman weights/styles were bundled
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
3. Consider whether heading numbering should skip callouts/embeds (see
   limitation #2 above) if that turns out to look wrong in real notes.
