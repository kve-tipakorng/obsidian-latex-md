Latin Modern Roman (subset: Regular, Bold, Italic, Bold Italic)
=================================================================

Source: The Latin Modern font family, GUST e-foundry
(https://www.gust.org.pl/projects/e-foundry/latin-modern)
Version: 2.005 (2021-03-21), obtained from CTAN (fonts/lm.zip).

Authors: Boguslaw Jackowski and Janusz M. Nowacki, on behalf of the
TeX Users Groups (CSTUG, DANTE eV, GUST, GUTenberg, NTG, TUG).
Based on Donald E. Knuth's Computer Modern fonts.

License: GUST Font License (GFL), a free license based on the LaTeX
Project Public License (LPPL) 1.3c or later. See GUST-FONT-LICENSE.txt
in this folder for the full text. The GFL explicitly permits
distribution and modification (including format conversion, as done
here), which is why these fonts can be redistributed as WOFF2 files
bundled inside this plugin.

Files in this folder:
  lmroman10-regular.woff2
  lmroman10-bold.woff2
  lmroman10-italic.woff2
  lmroman10-bolditalic.woff2

These were converted from the original OpenType (.otf) files in the
CTAN "lm" package to WOFF2 using fonttools (pip package "fonttools",
command: `python -m fontTools.ttLib.woff2 compress`), run inside an
isolated Docker container (python:3.11-slim) so no software was
installed on the host machine. No glyphs, metrics, or hinting were
otherwise modified; only the container format changed (OTF -> WOFF2).

Per the "request, but not legally required" clause in the GUST Font
License, note that these are unmodified-name subsets of the original
Latin Modern Roman family repackaged for web/plugin embedding; the
original family name and CTAN package ("lm") are preserved above for
attribution and traceability.
