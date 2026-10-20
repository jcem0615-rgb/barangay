# Proposal pack

Two documents for taking the portal to a municipal government, and the scripts
that build them.

| File | What it is |
|---|---|
| `eLGU-Letter-of-Intent.pdf` | Four pages: a two-page letter, then Annex A on scope and present status. **Every municipality-specific field is a ruled blank** — the date, the Mayor's name, the municipality, the province, and the sender's own details — so one printed copy is filled in by hand for whoever it is addressed to. |
| `eLGU-Overview.pptx` | A 24-slide overview deck, with speaker notes on every slide. The cover and the closing slide carry the same blanks. |

## Rebuilding

```bash
# The letter. Fonts are optional — without them it falls back to Helvetica.
./proposal/fetch_fonts.sh
python3 proposal/build_letter.py

# The deck. pptxgenjs is not a dependency of this project, so point NODE_PATH
# at wherever it is installed. PPTX_SKILL_DIR is optional; without it the deck
# builds with Office's stock palette instead of the navy-and-gold theme.
npm install --no-save pptxgenjs
node proposal/build_deck.cjs
```

## Before sending either of these to a real LGU

Both documents are deliberately honest about what is simulated, and that
honesty has to survive editing. Specifically, they state — and this is
accurate — that:

- **Online payment settles through a development simulator.** The architecture
  is complete and tested, but no real gateway is wired. Do not let either
  document imply otherwise, and do not deploy with `PAYMENT_PROVIDER=mock`.
- **There is no PhilSys integration, and the app no longer implies one.** The
  ID's own verification code is real and checked server-side. Do not let
  either document suggest a national-ID check this system does not perform.
- **The hotlines, fees, validity periods, holiday calendar and document routes
  are placeholders.** They read as plausible because they were written
  carefully, which is exactly what makes them dangerous under a municipality's
  own name. The deck's slide on document routes says so; keep it.
- **The barangay roster is six samples**, with invented captains and
  secretaries.

The figures quoted in both documents (6 offices, 17 services, 6 barangay
certificates, 8 registers, 99 document steps, 480 interface strings, 37 test
suites, 34 migrations) describe the demonstration build. Re-check them against
the repository before quoting them again — `DEPLOY.md` holds the full
pre-launch checklist that Annex A summarises.

The turnaround figures on the deck's chart are illustrative and the slide says
so on its face. Do not replace them with real numbers from another LGU.
