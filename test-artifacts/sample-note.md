---
title: Quarterly Inspection Report
subtitle: Line 3 Coil Winding Cell
author: J. Somchai
date: 2026-09-07
---

# Overview

This is the first paragraph right after the title-level heading, so it
should **not** be indented. It should, however, be fully justified, with
the right edge of the text aligned like a typeset book page, wrapping
normally at the container width.

This is a second paragraph. There is no blank visual gap above it beyond
normal line spacing, and instead the first line is indented, the way a
LaTeX `article` document handles new paragraphs by default.

## Background

Another paragraph immediately after a subsection heading, also expected
to start flush left with no first-line indent.

Then a normal paragraph that should be indented, to confirm the "first
paragraph after a heading is flush, later ones are indented" rule holds
inside a subsection too.

### Data Collection Method

Text under a sub-subsection heading, to confirm three levels of numbering
(1, 1.1, 1.1.1 style) render correctly and reset properly when a new
top-level section starts below.

## Results

A blockquote, styled like a LaTeX `quote` environment (indented both
sides, no decorative quotation marks, no background tint):

> Line yield improved from 91.2% to 94.6% after the fixture change on
> 2026-08-30, with no corresponding increase in rework rate.

A table, styled booktabs-style (no vertical rules, heavy rule above and
below the header row, heavy rule at the very bottom, no row banding):

| Week | Units Wound | First-Pass Yield | Scrap (units) |
|------|-------------|-------------------|----------------|
| 32   | 4,120       | 91.2%             | 362            |
| 33   | 4,240       | 92.8%             | 305            |
| 34   | 4,310       | 94.1%             | 254            |
| 35   | 4,290       | 94.6%             | 232            |

A code/verbatim block (should look like a lightly boxed monospace block,
not a plain paragraph):

```
turns = 240
wire_gauge_awg = 32
inductance_target_uh = 330
tolerance_pct = 10
```

Inline code like `inductance_target_uh` should also get a subtle boxed
look without breaking the surrounding justified text flow.

A math expression, left to Obsidian/MathJax's own rendering:

$$
L = \frac{N^2 \mu_0 \mu_r A}{l}
$$

and inline math such as $R_{DC} = \rho \dfrac{l}{A}$ within a sentence,
to confirm the surrounding serif body text doesn't visually clash with
MathJax's own math font.

# Corrective Actions

A second top-level section, to confirm the H1 counter increments to "2"
and all deeper counters (H2, H3, ...) reset back to 0 under it.

## Immediate Actions

1. Re-torque the tension arm on Winder 3.
2. Re-run first-article inspection on the next 5 units.

## Follow-up

- Owner: Production Engineering
- Due: 2026-09-21

---

*End of sample note.*
