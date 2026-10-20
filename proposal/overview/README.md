# The overview PDF

`eLGU-Overview.pdf` — what the system is, who may do what, and **every control
in every portal shown with the icon it actually carries**.

```bash
npm install --no-save playwright   # not a project dependency; see below
node proposal/overview/build.mjs   # (imported, not run directly)
node proposal/overview/pdf.mjs     # -> proposal/eLGU-Overview.pdf
```

## Why a browser renders it

The point of this document is that each control appears beside *its own* icon.
Those icons are lucide vectors the app already imports, so the builder reads
`__iconNode` straight out of `node_modules/lucide-react` and lays it out in
HTML. The picture in the overview is therefore the picture on the button — not
a lookalike somebody redrew, which would drift the first time a screen changed.

A missing icon name throws before anything renders, rather than printing a
blank square into a document somebody is about to hand to a mayor.

lucide keeps its older names as alias modules that re-export the canonical icon
and carry no `__iconNode`. The app still imports several of those
(`AlertTriangle`, `CheckCircle2`, `BarChart3`), so the loader follows the
alias.

## The three files

| File | What it holds |
| --- | --- |
| `controls.mjs` | The inventory: five portals, their groups, and every control with its lucide name and what it does. **This is the file to edit when a screen changes.** |
| `build.mjs` | Icon loading, the LogicGrid mark, embedded fonts, paths. |
| `render.mjs` | The document: cover, the summary page, then a page-set per portal. |
| `pdf.mjs` | Loads the icons, renders, prints to A4 with a running footer. |

## Playwright is not a project dependency

Nothing the app ships needs it, and adding a browser download to every
`npm install` for a document built occasionally is the wrong trade. Install it
when you need to rebuild. Where Chromium is already on the machine, point at it
rather than downloading another:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save playwright
```

`build.mjs` looks for a preinstalled Chromium first and falls back to
Playwright's own lookup.

## The LogicGrid brand assets

`assets/logicgrid-logo.png` is the badge as LogicGrid supplied it — circle,
wordmark, tagline. `assets/logicgrid-glyph.png` is the circuit glyph cut out of
it. Both are embedded in the PDF as data URIs, so it carries its own brand and
renders the same anywhere.

**Two files, because one size does not work at both ends of the document.** The
badge keeps its wordmark *inside* the circle, so it is only legible above about
120px — which is why it sits beside the title on the cover rather than above it,
where it would cost vertical space the contents table needs. The running footer
is 15px tall; the full badge there would be a smudge with unreadable type in it,
so the footer gets the glyph alone with "LogicGrid" set in type next to it.

The stored sizes (512px badge, 160px glyph) are deliberate: they are sharp well
past the sizes used and keep the glyph's base64 out of seventeen page footers at
full resolution.

## Fonts

Inter and Plus Jakarta Sans — the two the app itself is set in — are embedded
as base64 from `proposal/fonts/`, so the PDF renders identically on a machine
that has neither. Run `proposal/fetch_fonts.sh` if that directory is empty.
