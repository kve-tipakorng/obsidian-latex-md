# TEST_PLAN.md - LaTeX Look (manual visual test plan)

This is a UI-rendering plugin (CSS + a couple of DOM-injecting
post-processors + one Command Palette command), so there is no meaningful
automated test suite - testing is manual and visual, inside a real
Obsidian installation. This plan was written without access to a running
Obsidian instance; a human with Obsidian installed should work through it
before trusting the plugin's visual output.

**Architecture reminder (as of 2026-09-08):** this plugin no longer styles
Reading view by default. All LaTeX-look styling is applied only while the
"Export current note as LaTeX-look PDF" command is actively running,
scoped to the note being exported, and is reverted automatically as soon
as the active leaf changes afterward. Section 2 below (confirming Reading
view looks like plain Obsidian) is a new, important regression check that
did not exist under the plugin's previous always-on design - do not skip
it.

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

## 2. Regression check: Reading view is untouched by default

Before testing anything export-related, confirm the plugin has **no**
visible effect just by being enabled - this is the core requirement of
the current design.

- [ ] With the plugin enabled and the sample note open, switch to Reading
      view. Confirm it looks exactly like default/vanilla Obsidian: no
      Latin Modern / serif font change, no justified or indented body
      text, no heading numbering ("1", "1.1", ...), no title block above
      "Overview", no booktabs-style table rules, no styled code-block
      border beyond Obsidian's own default.
- [ ] Open DevTools (Ctrl/Cmd+Shift+I) and confirm `<body>` does **not**
      have a `latex-look-exporting` class (nor `latex-look-heading-numbers`
      / `latex-look-title-block-enabled`) while just viewing the note
      normally.
- [ ] Open a handful of other pre-existing notes (plain notes, ones with
      tables/callouts/embeds) in Reading view and confirm none of them
      show any LaTeX-look styling either.
- [ ] Open Settings -> LaTeX Look, and without changing anything, confirm
      the settings pane text describes these settings as affecting the
      *export*, not Reading view.

## 3. Settings tab checklist

Open Settings -> LaTeX Look and verify:

- [ ] "Automatic heading numbering" toggle - defaults to **on**. Toggling
      it does **not** visibly change anything in the currently open
      Reading view (this is expected now - it only takes effect on the
      next export).
- [ ] "Title block from frontmatter" toggle - defaults to **on**. Same as
      above: toggling it has no immediate visible effect on Reading view.
- [ ] "Base font size" dropdown (10pt/11pt/12pt, default 11pt) - changing
      it does not visibly change the currently open Reading view.
- [ ] "Paper size" dropdown (Letter/A4, default Letter) - changing it does
      not error or break the settings pane.
- [ ] Close and reopen Obsidian (or disable/re-enable the plugin) and
      confirm all four settings persisted as last set (via `data.json` in
      the plugin folder).
- [ ] Set all four settings back to their defaults (heading numbering on,
      title block on, 11pt, Letter) before continuing, so the export tests
      below match the expected baseline look.

## 4. Export command: happy path

Use `test-artifacts/sample-note.md`, which has `title`/`subtitle`/
`author`/`date` frontmatter and content exercising every styled element.

- [ ] Open the sample note (any mode - Source, Live Preview, or Reading).
- [ ] Open the Command Palette (Cmd/Ctrl+P) and search for "LaTeX-look" or
      "Export current note". Confirm the command **"Export current note as
      LaTeX-look PDF"** appears and is selectable.
- [ ] Run the command. Confirm:
  - [ ] If the note wasn't already in Reading view, it switches there
        automatically.
  - [ ] Briefly, the note in Reading view shows the LaTeX-look styling:
        serif font, justified/indented body text, numbered headings ("1",
        "1.1", "1.1.1", ... - see the same numbering-correctness checks as
        the old plan: "Overview" = "1", "Background" = "1.1", "Results" =
        "1.2", "Data Collection Method" = "1.1.1", "Corrective Actions" =
        "2", "Immediate Actions" = "2.1", "Follow-up" = "2.2"), a centered
        title block (title/subtitle/author/date) above "Overview" with a
        rule beneath it, a booktabs-style table, a boxed code block, and a
        LaTeX-style indented blockquote.
  - [ ] Obsidian's native "Export to PDF" save-file dialog appears.
- [ ] Save the PDF somewhere in the test vault's parent folder (not inside
      the vault itself, to avoid it being picked up as a note). Open the
      resulting PDF and confirm it shows the same LaTeX-look styling
      described above - serif font, numbering, title block, booktabs
      table, boxed code, justified/indented body text - and that math
      (block and inline) still renders correctly.
- [ ] If a PDF margin option is exposed in the export dialog, set it to
      "None"/"Custom: 0" per the README caveat and confirm the resulting
      PDF page margins roughly match 1in (Letter, the default paper-size
      setting).

## 5. Export command: reverts automatically after use

- [ ] Immediately after completing (or cancelling) the export dialog in
      section 4, switch to a different note, then switch back to the
      sample note. Confirm Reading view now looks like plain, unstyled
      Obsidian again - no serif font, no numbering, no title block, no
      booktabs table styling.
- [ ] Open DevTools and confirm `<body>` no longer has the
      `latex-look-exporting` class (nor the heading-numbers/title-block
      sub-classes) after switching away and back.
- [ ] Confirm no leftover `.latex-look-title-block` element remains in the
      sample note's rendered DOM (inspect via DevTools, or simply confirm
      visually that no title block renders any more above "Overview").
- [ ] Repeat the export (section 4) once more to confirm the command is
      fully repeatable - it should apply and revert cleanly on a second
      run, not be left in a stuck or partially-applied state from the
      first run.

## 6. Export command: no active note / unavailable state

- [ ] Switch focus to a non-Markdown view - e.g. open the graph view, or
      close all note tabs so no Markdown file is active.
- [ ] Open the Command Palette and search for "LaTeX-look" / "Export
      current note". Confirm the command is either absent from the
      results or shown greyed out / not selectable, and that invoking it
      (if selectable at all) does nothing.
- [ ] Switch back to a Markdown note and confirm the command becomes
      available again.

## 7. Export command: PDF-export core plugin disabled (best effort)

This exercises the "couldn't find Obsidian's built-in PDF export command"
fallback path. Skip if the test Obsidian version doesn't allow disabling
the relevant core functionality.

- [ ] If possible, disable whatever core plugin/feature provides
      Obsidian's "Export to PDF" command.
- [ ] Run "Export current note as LaTeX-look PDF" on the sample note.
      Confirm a `Notice` appears explaining the built-in PDF export
      command could not be found.
- [ ] Confirm the note is **not** left stuck in export-styled state - it
      should look like plain Obsidian immediately after the notice
      appears (no need to switch leaves first, since this path reverts
      styling itself rather than waiting on `active-leaf-change`).
- [ ] Re-enable the core PDF export functionality afterward and confirm
      the export command works normally again (section 4).

## 8. Title block edge cases

Run these by invoking the export command on each note described (per
section 4) rather than just viewing them in Reading view, since the title
block only ever renders during an active export now.

- [ ] Create a note with **no frontmatter at all**. Export it. Confirm the
      exported styling applies (serif font, etc.) with no title block and
      no console errors.
- [ ] Create a note with frontmatter that has *only* `title` (no
      subtitle/author/date). Export it. Confirm only the title line
      renders in the styled preview/PDF, sized correctly, with no empty
      gaps where the other fields would go.
- [ ] Create a note with frontmatter that has unrelated keys only (e.g.
      `tags: [foo]`) and no `title`/`subtitle`/`author`/`date`. Export it.
      Confirm no title block renders.
- [ ] Edit the sample note's title in Live Preview/Source mode, then run
      the export command again. Confirm the title block reflects the new
      value and does **not** duplicate (only one title block should ever
      be present in a single export).

## 9. Regression sanity

- [ ] Open a handful of pre-existing, unrelated notes in the test vault
      (plain notes, ones with existing tables/callouts/embeds), view them
      normally (no export), and confirm nothing looks obviously broken -
      this should be a no-op given section 2, but re-confirm after having
      run several exports in this session, in case any export left global
      state behind.
- [ ] Disable the plugin entirely (ideally right after having just run an
      export) and confirm Reading view stays/returns to Obsidian's normal
      default look with no leftover body classes or injected `<style>`
      tags - check via DevTools that `latex-look-exporting`,
      `latex-look-heading-numbers`, `latex-look-title-block-enabled`
      classes are removed from `<body>` and the
      `#latex-look-print-page-style` `<style>` element is removed from
      `<head>`.

## Result recording

Record pass/fail plus any screenshots for each numbered section above in
a dated file alongside this one (e.g.
`test-artifacts/TEST_RESULTS_<date>.md`) when this plan is actually run
against a live Obsidian instance.
