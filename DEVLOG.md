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
