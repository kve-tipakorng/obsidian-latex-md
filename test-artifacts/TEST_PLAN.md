# TEST_PLAN.md - LaTeX Look (manual visual test plan)

This is a UI-rendering plugin (CSS + a couple of DOM-injecting
post-processors), so there is no meaningful automated test suite - testing
is manual and visual, inside a real Obsidian installation. This plan was
written without access to a running Obsidian instance; a human with
Obsidian installed should work through it before trusting the plugin's
visual output.

## 1. Setup

1. Create (or use) a throwaway test vault - do **not** test against a
   production KVE notes vault first, in case something needs correcting.
2. Build the plugin per `README.md`:
   ```bash
   docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npm install && npm run build"
   ```
   Confirm `main.js` exists and is non-empty afterward.
3. Copy `main.js`, `manifest.json`, `styles.css`, and the `fonts/` folder
   into `<test-vault>/.obsidian/plugins/latex-look/`.
4. In Obsidian: Settings -> Community plugins -> turn on Community
   plugins (if prompted) -> reload/refresh -> enable "LaTeX Look".
5. Copy `test-artifacts/sample-note.md` into the test vault and open it.

## 2. Baseline visual checklist (Reading view, default settings)

Open the sample note and switch to Reading view. Check each item:

- [ ] Body font is a serif face (Latin Modern Roman if the bundled font
      loaded; otherwise a fallback serif like Georgia/Times - either is
      acceptable, but note which one actually rendered).
- [ ] A title block appears above "Overview": large centered title
      ("Quarterly Inspection Report"), smaller centered subtitle ("Line 3
      Coil Winding Cell"), then author ("J. Somchai") and date
      ("2026-09-07") below that, with a horizontal rule separating the
      block from the body.
- [ ] "Overview" is numbered "1" and "Corrective Actions" is numbered "2".
- [ ] "Background" is numbered "1.1"; "Results" is numbered "1.2" (i.e.
      the H2 counter continued rather than resetting per-H1-only... it
      *should* reset to 1 under each new H1 - confirm "Background" is
      "1.1" and "Results" is "1.2", both under section 1, and that
      "Immediate Actions"/"Follow-up" under section 2 read "2.1"/"2.2").
- [ ] "Data Collection Method" is numbered "1.1.1".
- [ ] Body paragraphs are justified (right edge roughly aligned, not
      ragged) and each new paragraph starts with a first-line indent.
- [ ] The paragraph immediately after "Overview", after "Background", and
      after "Data Collection Method" do **not** have a first-line indent
      (only paragraphs that follow another paragraph should be indented).
- [ ] There is no extra blank-line gap between consecutive paragraphs
      beyond normal line spacing (paragraphs should look "close" like a
      typeset book, not spaced like typical web text).
- [ ] The blockquote under "Results" is indented from both the left and
      right margins, with no large decorative quotation mark and no
      shaded background.
- [ ] The table under "Results" has: no vertical lines between columns, a
      heavier rule above the header row, a rule below the header row, a
      heavier rule below the last data row, and no alternating row-color
      banding.
- [ ] The fenced code block renders in monospace with a visible border
      (subtle box), and inline code (`` `inductance_target_uh` ``) has a
      small boxed/shaded look without disrupting the justified text
      around it.
- [ ] Both the block math ($L = ...$) and inline math ($R_{DC} = ...$)
      render via MathJax as usual and don't look visually broken next to
      the serif body text.
- [ ] Headings are bold and in the same serif family as the body text.

## 3. Settings tab checklist

Open Settings -> LaTeX Look and verify:

- [ ] "Automatic heading numbering" toggle - defaults to **on**; turning
      it off immediately removes the "1", "1.1", etc. prefixes from the
      already-open reading view with no reload needed; turning it back on
      restores them immediately.
- [ ] "Title block from frontmatter" toggle - defaults to **on**; turning
      it off removes the title block from the currently open note
      (may take a brief moment - it forces a re-render); turning it back
      on restores it.
- [ ] "Base font size" dropdown (10pt/11pt/12pt, default 11pt) - changing
      it visibly changes the body text size in the already-open reading
      view without needing to reopen the note.
- [ ] "Paper size" dropdown (Letter/A4, default Letter) - changing it
      doesn't need to visibly change anything in Reading view (it only
      affects `@media print`); confirm it does not error or break the
      settings pane.
- [ ] Close and reopen Obsidian (or disable/re-enable the plugin) and
      confirm all four settings persisted as last set (via `data.json` in
      the plugin folder).

## 4. Title block edge cases

- [ ] Create a note with **no frontmatter at all**. Confirm Reading view
      renders normally with no title block and no console errors.
- [ ] Create a note with frontmatter that has *only* `title` (no
      subtitle/author/date). Confirm only the title line renders, sized
      correctly, with no empty gaps where the other fields would go.
- [ ] Create a note with frontmatter that has unrelated keys only (e.g.
      `tags: [foo]`) and no `title`/`subtitle`/`author`/`date`. Confirm no
      title block renders.
- [ ] Edit the sample note's title in Live Preview/Source mode, switch to
      Reading view, and confirm the title block updates to the new value
      and does **not** duplicate (only one title block should ever be
      present).
- [ ] Scroll a long note in Reading view (forcing Obsidian to lazily
      render sections as they scroll into view) and confirm the title
      block still appears exactly once, at the very top.

## 5. Print / Export to PDF

- [ ] With Paper size = Letter, use Obsidian's "Export to PDF" on the
      sample note. Open the resulting PDF and confirm the page looks like
      the Reading view (serif font, numbered headings, title block,
      booktabs table, boxed code block) with roughly 1-inch margins if the
      export dialog's margin option was set to None/Custom 0 (see the
      README caveat).
- [ ] Repeat with Paper size = A4 and confirm the exported page is A4-sized
      with roughly 25mm margins under the same margin-dialog condition.
- [ ] If the Obsidian version being tested does not expose a PDF margin
      override, note the actual margin behavior observed (this is a known
      platform limitation, not necessarily a plugin bug - see README).

## 6. Regression sanity

- [ ] Open a handful of pre-existing, unrelated notes in the test vault
      (plain notes, ones with existing tables/callouts/embeds) and
      confirm nothing looks obviously broken (no missing text, no
      infinite-loop-looking duplicated title blocks, no console errors in
      the developer console).
- [ ] Disable the plugin entirely and confirm Reading view returns to
      Obsidian's normal default look (no leftover body classes / injected
      `<style>` tags - check via DevTools that
      `latex-look-heading-numbers`, `latex-look-title-block-enabled`
      classes are removed from `<body>` and the
      `#latex-look-print-page-style` `<style>` element is removed from
      `<head>`).

## Result recording

Record pass/fail plus any screenshots for each numbered section above in
a dated file alongside this one (e.g.
`test-artifacts/TEST_RESULTS_<date>.md`) when this plan is actually run
against a live Obsidian instance.
