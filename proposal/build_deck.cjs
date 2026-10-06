/**
 * Builds proposal/eLGU-Overview.pptx — the overview deck for presenting the
 * portal to a municipal government.
 *
 *   NODE_PATH=<dir containing pptxgenjs> node proposal/build_deck.cjs
 *
 * The deck is structured: one theme, a handful of layouts, named placeholders,
 * and sections — so a municipality can restyle it in PowerPoint without having
 * to fight any single slide.
 *
 * Fonts are Cambria and Calibri rather than the app's own Plus Jakarta Sans and
 * Inter: a .pptx carries font *names*, not the fonts, so a face the mayor's
 * office does not have installed is silently substituted and the layout moves.
 * The colours are the app's own tokens from src/index.css.
 */

const pptxgen = require("pptxgenjs");
const path = require("path");

const OUT = path.join(__dirname, "eLGU-Overview.pptx");

/* ------------------------------------------------------------------ theme */

const THEME = {
  name: "eLGU Navy and Gold",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0F1D4D", // navy-950 — the dominant colour
    lt1: "FFFFFF",
    dk2: "1E3A8A", // navy-800
    lt2: "F1F4F9", // slate canvas
    accent1: "FBBF24", // gold-500 — the one sharp accent
    accent2: "2F57B8", // navy-600
    accent3: "0E9F6E", // working today
    accent4: "D69E0A", // gold-600
    accent5: "5B6480", // muted ink
    accent6: "B45309", // needs the municipality's own data
    hlink: "2F57B8",
    folHlink: "5B6480",
  },
};

const NAVY = "0F1D4D";
const NAVY_MID = "1E3A8A";
const NAVY_SOFT = "2F57B8";
const GOLD = "FBBF24";
const GOLD_DK = "D69E0A";
const CANVAS = "F1F4F9";
const WHITE = "FFFFFF";
const INK = "15213F";
const MUTED = "5B6480";
const MUTED_ON_DARK = "AEBAD6";
const EMERALD = "0E9F6E";
const AMBER_DK = "B45309";
const HAIRLINE = "D6DDEA";

const W = 13.333;
const H = 7.5;
const M = 0.62; // page margin
const CW = W - 2 * M; // content width

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = "eLGU Citizen Services Portal";
pres.company = "eLGU Citizen Services Portal";
pres.subject = "Overview of the eLGU Citizen Services Portal";
pres.title = "eLGU Citizen Services Portal";

/* ---------------------------------------------------------------- layouts */

/**
 * The seal ring: concentric gold hairlines, bled off the corner. It is the
 * app's one deliberate flourish (the guilloche ring behind the digital ID) and
 * it is the motif that carries across every dark slide here.
 */
function sealRing(slide, cx, cy, radii, opts) {
  const o = opts || {};
  radii.forEach((r, i) => {
    slide.addShape(pres.ShapeType.ellipse, {
      x: cx - r,
      y: cy - r,
      w: r * 2,
      h: r * 2,
      fill: { type: "solid", color: NAVY, transparency: 100 },
      line: { color: o.color || GOLD, width: i === 0 ? 1.5 : 0.75, transparency: o.fade || 72 },
      objectName: "seal ring " + (i + 1),
    });
  });
}

pres.defineSlideMaster({
  title: "COVER",
  background: { color: NAVY },
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: M + 0.1, y: 1.72, w: 9.0, h: 0.4, fontSize: 13, bold: true, charSpacing: 3, color: GOLD, valign: "middle" }, text: " " } },
    { placeholder: { options: { name: "title", type: "title", x: M + 0.1, y: 2.18, w: 9.4, h: 1.85, fontSize: 48, bold: true, color: WHITE, align: "left", valign: "top" }, text: " " } },
    { placeholder: { options: { name: "body", type: "body", x: M + 0.1, y: 4.1, w: 8.2, h: 1.1, fontSize: 16, color: MUTED_ON_DARK, valign: "top" }, text: " " } },
  ],
});

pres.defineSlideMaster({
  title: "SECTION",
  background: { color: NAVY_MID },
  objects: [
    { placeholder: { options: { name: "eyebrow", type: "body", x: M + 0.1, y: 2.5, w: 6.0, h: 0.5, fontSize: 60, bold: true, color: GOLD, valign: "middle" }, text: " " } },
    { placeholder: { options: { name: "title", type: "title", x: M + 0.1, y: 3.25, w: 10.4, h: 1.5, fontSize: 40, bold: true, color: WHITE, align: "left", valign: "top" }, text: " " } },
    { placeholder: { options: { name: "body", type: "body", x: M + 0.1, y: 4.78, w: 9.4, h: 1.0, fontSize: 15, color: MUTED_ON_DARK, valign: "top" }, text: " " } },
  ],
});

/** The content frame, light and dark. Titles sit at one position everywhere. */
function contentMaster(name, bg, titleColor, eyebrowColor, bodyColor, footColor) {
  pres.defineSlideMaster({
    title: name,
    background: { color: bg },
    objects: [
      { placeholder: { options: { name: "eyebrow", type: "body", x: M, y: 0.42, w: CW, h: 0.3, fontSize: 11, bold: true, charSpacing: 2, color: eyebrowColor, valign: "middle", margin: 0 }, text: " " } },
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.74, w: CW, h: 0.78, fontSize: 32, bold: true, color: titleColor, align: "left", valign: "middle", margin: 0 }, text: " " } },
      { placeholder: { options: { name: "body", type: "body", x: M, y: 1.58, w: CW, h: 0.52, fontSize: 14.5, color: bodyColor, valign: "top", margin: 0 }, text: " " } },
      { text: { text: "eLGU Citizen Services Portal", options: { x: M, y: H - 0.52, w: 6, h: 0.26, fontSize: 9, color: footColor, margin: 0, isTextBox: true } } },
      { placeholder: { options: { name: "chart", type: "chart", x: M, y: 2.2, w: CW, h: 4.3, color: bodyColor }, text: " " } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.52, w: 0.6, h: 0.26, fontSize: 9, color: footColor, align: "right" },
  });
}

contentMaster("CONTENT", WHITE, NAVY, GOLD_DK, MUTED, "97A3BD");
contentMaster("CONTENT_TINT", CANVAS, NAVY, GOLD_DK, MUTED, "97A3BD");
contentMaster("CONTENT_DARK", NAVY, WHITE, GOLD, MUTED_ON_DARK, "6C7BA0");

pres.defineSlideMaster({
  title: "CLOSING",
  background: { color: NAVY },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M + 0.1, y: 2.0, w: 8.6, h: 1.3, fontSize: 44, bold: true, color: WHITE, align: "left", valign: "middle" }, text: " " } },
    { placeholder: { options: { name: "body", type: "body", x: M + 0.1, y: 3.35, w: 7.4, h: 1.6, fontSize: 15, color: MUTED_ON_DARK, valign: "top" }, text: " " } },
  ],
});

/* ------------------------------------------------------------- components */

let cardSeq = 0;

/** A content card. Background tint and a soft shadow — never an edge stripe. */
function card(slide, o) {
  cardSeq += 1;
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h,
    rectRadius: o.radius === undefined ? 0.1 : o.radius,
    fill: { color: o.fill || CANVAS },
    line: o.line ? { color: o.line, width: 1 } : { color: o.fill || CANVAS, width: 0 },
    shadow: o.shadow === false ? undefined : {
      type: "outer", angle: 90, blur: 10, offset: 2, color: "0F1D4D", opacity: 0.09,
    },
    objectName: (o.name || "card") + " " + cardSeq,
  });
}

/** The repeated motif: a numeral or glyph inside a gold-ringed disc. */
function badge(slide, x, y, text, o) {
  const opts = o || {};
  const d = opts.d || 0.56;
  slide.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d,
    fill: { color: opts.fill || GOLD },
    line: { color: opts.ring || GOLD, width: 1 },
    objectName: "badge disc",
  });
  slide.addText(text, {
    x, y, w: d, h: d,
    fontSize: opts.size || 14,
    bold: true,
    color: opts.color || NAVY,
    align: "center",
    valign: "middle",
    margin: 0,
    isTextBox: true,
  });
}

/** A bulleted column with a hanging indent, in the deck's body size. */
function bullets(slide, o) {
  const items = o.items.map((t, i) => ({
    text: t,
    options: {
      bullet: { code: "2022", indent: 14 },
      breakLine: i < o.items.length - 1,
    },
  }));
  slide.addText(items, {
    x: o.x, y: o.y, w: o.w, h: o.h,
    fontSize: o.size || 13,
    color: o.color || INK,
    lineSpacingMultiple: 1.08,
    paraSpaceAfter: o.gap === undefined ? 7 : o.gap,
    indentLevel: 0,
    valign: "top",
    margin: 0,
    isTextBox: true,
  });
}

function label(slide, text, o) {
  slide.addText(text, {
    x: o.x, y: o.y, w: o.w, h: o.h || 0.26,
    fontSize: o.size || 10.5, bold: true, charSpacing: 1.4,
    color: o.color || GOLD_DK, margin: 0, valign: "middle", isTextBox: true,
  });
}

function heading(slide, text, o) {
  slide.addText(text, {
    x: o.x, y: o.y, w: o.w, h: o.h || 0.32,
    fontSize: o.size || 15, bold: true, color: o.color || NAVY,
    margin: 0, valign: "middle", isTextBox: true,
  });
}

function body(slide, text, o) {
  slide.addText(text, {
    x: o.x, y: o.y, w: o.w, h: o.h,
    fontSize: o.size || 12.5, color: o.color || MUTED,
    lineSpacingMultiple: 1.1, margin: 0, valign: "top", isTextBox: true,
    align: o.align || "left",
  });
}

function slide(masterName, sectionTitle, eyebrow, title, intro) {
  const s = pres.addSlide({ masterName, sectionTitle });
  if (eyebrow) s.addText(eyebrow.toUpperCase(), { placeholder: "eyebrow" });
  if (title) s.addText(title, { placeholder: "title" });
  if (intro) s.addText(intro, { placeholder: "body" });
  return s;
}

/* ===================================================================== *
 *  SLIDES
 * ===================================================================== */

/* -- 1. Cover ------------------------------------------------------- */
pres.addSection({ title: "Opening" });
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: "Opening" });
  sealRing(s, 11.9, 2.0, [2.65, 2.2, 1.78], { fade: 76 });
  sealRing(s, 11.9, 2.0, [0.95], { fade: 52 });
  s.addText("A PROPOSAL FOR THE MUNICIPAL GOVERNMENT", { placeholder: "eyebrow" });
  s.addText("eLGU Citizen\nServices Portal", { placeholder: "title" });
  s.addText(
    "One application for everything a resident needs from the municipal hall " +
    "and from their own barangay — with the consoles the offices work it from.",
    { placeholder: "body" });

  // Ruled blanks, so one printed or projected copy serves whichever LGU it goes to.
  const yy = 5.55;
  [["Municipality of", 0], ["Province of", 4.5]].forEach(([t, dx]) => {
    s.addText(t, { x: M + 0.1 + dx, y: yy, w: 1.5, h: 0.3, fontSize: 13, color: MUTED_ON_DARK, margin: 0, isTextBox: true });
    s.addShape(pres.ShapeType.line, {
      x: M + 1.45 + dx, y: yy + 0.3, w: 2.9, h: 0,
      line: { color: "47558A", width: 1 }, objectName: "blank rule",
    });
  });
  s.addText("Presented by", { x: M + 0.1, y: yy + 0.62, w: 1.5, h: 0.3, fontSize: 13, color: MUTED_ON_DARK, margin: 0, isTextBox: true });
  s.addShape(pres.ShapeType.line, { x: M + 1.45, y: yy + 0.92, w: 7.4, h: 0, line: { color: "47558A", width: 1 }, objectName: "blank rule" });

  s.addNotes(
    "Open by naming the municipality and yourself out loud — the blanks on this " +
    "slide are deliberately unfilled so one deck serves any LGU.\n\n" +
    "Frame the next 30 minutes: what the portal is, what it already does, and " +
    "exactly what it would need from this municipality before any resident sees it."
  );
}

/* -- 2. The thesis --------------------------------------------------- */
{
  const s = pres.addSlide({ masterName: "CONTENT_DARK", sectionTitle: "Opening" });
  sealRing(s, 12.6, 6.6, [2.3, 1.85], { fade: 82 });
  s.addText("THE PROBLEM, IN ONE SENTENCE", { placeholder: "eyebrow" });
  s.addText(
    [
      { text: "The most expensive thing about dealing with a local government ", options: { color: WHITE } },
      { text: "is the trip you did not need to make", options: { color: GOLD } },
      { text: ".", options: { color: WHITE } },
    ],
    { x: M, y: 2.3, w: 10.6, h: 2.3, fontSize: 38, bold: true, lineSpacingMultiple: 1.12, margin: 0, valign: "middle", isTextBox: true });
  body(s,
    "Not the fee. The morning. A resident who queues for a business permit without " +
    "the barangay clearance it requires is sent away and starts again tomorrow — and " +
    "nothing they could read beforehand would have told them.",
    { x: M, y: 4.9, w: 9.0, h: 1.1, size: 14.5, color: MUTED_ON_DARK });
  s.addNotes(
    "This is the whole argument. Say it, then pause.\n\n" +
    "Everything that follows — the published requirements, the document routes, " +
    "the appointment slots, the status that says whose move it is — exists to " +
    "stop one wasted trip. If the audience remembers one sentence from today, " +
    "this is the one."
  );
}

/* -- 3. Today vs. with the portal ------------------------------------ */
{
  const s = slide("CONTENT", "Opening", "One errand, two ways",
    "The same morning, with and without it",
    "A resident of this municipality applying for a sari-sari store permit.");

  const colW = (CW - 0.4) / 2;
  const steps = [
    {
      title: "Today",
      fill: CANVAS, accent: AMBER_DK, titleColor: NAVY,
      rows: [
        ["07:40", "Travels to the municipal hall, not certain which office handles it."],
        ["08:25", "Queues at Business Permits. Learns the barangay clearance comes first."],
        ["09:30", "Travels back to the barangay. The captain is out; comes back after lunch."],
        ["14:10", "Holds the clearance. The hall closes before the queue clears."],
        ["Next day", "Starts again. Two mornings spent; nothing filed."],
      ],
    },
    {
      title: "With the portal",
      fill: "EAF3EE", accent: EMERALD, titleColor: NAVY,
      rows: [
        ["07:40", "Opens the app. The guide shows the barangay clearance is step one."],
        ["07:45", "Files the clearance with their own barangay, from the phone."],
        ["08:30", "Collects it; the app said the hall opens at eight and gave the number."],
        ["08:50", "Files the permit, photographs the requirements, pays the assessment."],
        ["In 3 days", "Notified the permit is ready. One trip, to collect it."],
      ],
    },
  ];

  steps.forEach((col, ci) => {
    const x = M + ci * (colW + 0.4);
    card(s, { x, y: 2.2, w: colW, h: 4.25, fill: col.fill });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.3, y: 2.46, w: 1.85, h: 0.36, rectRadius: 0.18,
      fill: { color: col.accent }, line: { color: col.accent, width: 0 },
      objectName: "column tag",
    });
    s.addText(col.title.toUpperCase(), {
      x: x + 0.3, y: 2.46, w: 1.85, h: 0.36, fontSize: 10.5, bold: true,
      charSpacing: 1.2, color: WHITE, align: "center", valign: "middle",
      margin: 0, isTextBox: true,
    });
    col.rows.forEach((r, i) => {
      const y = 3.06 + i * 0.66;
      s.addText(r[0], {
        x: x + 0.3, y, w: 1.0, h: 0.3, fontSize: 11, bold: true,
        color: col.accent, margin: 0, valign: "top", isTextBox: true,
      });
      s.addText(r[1], {
        x: x + 1.35, y: y - 0.02, w: colW - 1.7, h: 0.6, fontSize: 11.5,
        color: INK, lineSpacingMultiple: 1.05, margin: 0, valign: "top", isTextBox: true,
      });
    });
  });

  s.addNotes(
    "Walk the left column slowly — most people in the room have lived it, or have " +
    "sent somebody away themselves.\n\n" +
    "The right column is not a promise of speed. The office still takes the days " +
    "its charter says it takes. What changed is that the resident spent one morning " +
    "instead of three, and the office handled one complete application instead of " +
    "three incomplete ones."
  );
}

/* -- 4. Section 01 --------------------------------------------------- */
pres.addSection({ title: "What it is" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "What it is" });
  sealRing(s, 12.3, 1.3, [2.5, 2.05, 1.6], { fade: 78 });
  s.addText("01", { placeholder: "eyebrow" });
  s.addText("What it is", { placeholder: "title" });
  s.addText("Both tiers of local government, three consoles, one database per municipality.", { placeholder: "body" });
  s.addNotes("Transition slide. Say: 'Here is the shape of the thing.'");
}

/* -- 5. Two tiers ----------------------------------------------------- */
{
  const s = slide("CONTENT", "What it is", "Two tiers of government",
    "A resident deals with two governments, not one",
    "The mistake that costs the trip is not knowing which one owns what — so the tier is asked once, in the two largest controls on the screen.");

  const colW = (CW - 0.45) / 2;
  const tiers = [
    {
      head: "The Municipality",
      sub: "Six offices, seventeen services",
      items: [
        "Business Permits and Licensing",
        "Local Civil Registrar",
        "Office of the Building Official",
        "Municipal Treasurer's Office",
        "Social Welfare and Development",
        "Municipal Health Office",
      ],
      accent: NAVY_MID,
    },
    {
      head: "The Barangay",
      sub: "The documents most residents actually need in a year",
      items: [
        "Barangay Clearance",
        "Certificate of Residency",
        "Certificate of Indigency",
        "Business Clearance",
        "First Time Jobseeker Certificate",
        "Certificate of Good Moral Character",
      ],
      accent: GOLD_DK,
    },
  ];

  tiers.forEach((t, i) => {
    const x = M + i * (colW + 0.45);
    card(s, { x, y: 2.28, w: colW, h: 3.5, fill: i === 0 ? CANVAS : "FDF6E3" });
    badge(s, x + 0.32, y0(2.52), i === 0 ? "M" : "B", { fill: t.accent, ring: t.accent, color: WHITE, size: 15 });
    heading(s, t.head, { x: x + 1.05, y: 2.56, w: colW - 1.35, size: 17 });
    body(s, t.sub, { x: x + 1.05, y: 2.92, w: colW - 1.35, h: 0.3, size: 11, color: MUTED });
    bullets(s, { x: x + 0.34, y: 3.42, w: colW - 0.68, h: 2.2, items: t.items, size: 12, gap: 5 });
  });
  function y0(v) { return v; }

  card(s, { x: M, y: 5.98, w: CW, h: 0.72, fill: NAVY, shadow: false });
  s.addText(
    [
      { text: "Both tiers sit under one Services tab. ", options: { bold: true, color: GOLD } },
      { text: "A second place to make the same choice would be the confusion rather than the cure — and the municipal business permit asks for the barangay clearance first, so the app has to hold both to be able to say so.", options: { color: "DCE3F5" } },
    ],
    { x: M + 0.35, y: 5.98, w: CW - 0.7, h: 0.72, fontSize: 11.5, lineSpacingMultiple: 1.05, valign: "middle", margin: 0, isTextBox: true });

  s.addNotes(
    "The barangay tier is the part most e-government projects leave out, and it is " +
    "the tier a resident touches most often — a clearance, a residency certificate, " +
    "an indigency certificate, several times a year.\n\n" +
    "Holding both is also what makes the document guide possible: the app can turn " +
    "'get the barangay clearance first' into a button, because it issues that too."
  );
}

/* -- 6. Three consoles ------------------------------------------------ */
{
  const s = slide("CONTENT_TINT", "What it is", "One system, four audiences",
    "Each role sees a different application",
    "The role is a fact the server establishes at sign-in. The shell is a convenience; the boundary is enforced by the API on every request.");

  const cols = [
    { n: "01", t: "The resident", d: "A phone-first app covering both tiers: apply, attach, pay, book a slot, carry a digital ID, read the barangay's notices.", c: NAVY_MID },
    { n: "02", t: "Municipal staff", d: "Their own department's queue and nobody else's — assess, advance, release the document, run the office's reports.", c: NAVY_SOFT },
    { n: "03", t: "The barangay", d: "That barangay's own console: certificates, notices, the blotter, the Record of Barangay Inhabitants, the hall's details.", c: GOLD_DK },
    { n: "04", t: "The council", d: "A separate, read-only view for the Sangguniang Barangay: what the office issued and collected, as counts. No resident appears in it.", c: AMBER_DK },
  ];
  const cw = (CW - 3 * 0.26) / 4;
  cols.forEach((c, i) => {
    const x = M + i * (cw + 0.26);
    card(s, { x, y: 2.3, w: cw, h: 3.35, fill: WHITE });
    badge(s, x + 0.3, 2.6, c.n, { fill: c.c, ring: c.c, color: WHITE, size: 12.5, d: 0.52 });
    heading(s, c.t, { x: x + 0.3, y: 3.32, w: cw - 0.6, size: 15 });
    body(s, c.d, { x: x + 0.3, y: 3.74, w: cw - 0.6, h: 1.6, size: 11.5 });
  });

  card(s, { x: M, y: 5.88, w: CW, h: 0.82, fill: WHITE });
  s.addText(
    [
      { text: "The administrator is the fifth, and is deliberately not a super-user.  ", options: { bold: true, color: NAVY } },
      { text: "They issue municipal staff accounts and correct the municipality's own data — hotlines, holidays, office details — and every edit is written to an audit trail in the same transaction as the change. They still get 403 from every barangay route.", options: { color: MUTED } },
    ],
    { x: M + 0.35, y: 5.88, w: CW - 0.7, h: 0.82, fontSize: 11.5, lineSpacingMultiple: 1.05, valign: "middle", margin: 0, isTextBox: true });

  s.addNotes(
    "Worth stressing to a mayor: the municipal administrator cannot read a " +
    "barangay's blotter or its household register. That is not a setting — it is a " +
    "different router with a different gate, so there is no filter for somebody to " +
    "get wrong later."
  );
}

/* -- 7. The offices --------------------------------------------------- */
{
  const s = slide("CONTENT", "What it is", "The municipal catalogue",
    "Seventeen services, published as the Charter",
    "Every fee, requirement and processing time a resident sees comes from one catalogue — which is, in practice, the Citizen's Charter RA 11032 already requires the Municipality to publish.");

  const offices = [
    ["Business Permits & Licensing", "4", "New and renewal permits, Mayor's Permit, closure"],
    ["Local Civil Registrar", "4", "Birth, marriage and death records, and corrections"],
    ["Office of the Building Official", "3", "Building, occupancy and electrical permits"],
    ["Municipal Treasurer's Office", "3", "Cedula, real property tax, business tax clearance"],
    ["Social Welfare & Development", "2", "Assistance, sectoral and poverty-reduction registers"],
    ["Municipal Health Office", "1", "Sanitary permit and health certification"],
  ];
  const cw = (CW - 2 * 0.28) / 3;
  const ch = 1.52;
  offices.forEach((o, i) => {
    const x = M + (i % 3) * (cw + 0.28);
    const y = 2.32 + Math.floor(i / 3) * (ch + 0.26);
    card(s, { x, y, w: cw, h: ch, fill: CANVAS });
    s.addText(o[1], {
      x: x + cw - 0.95, y: y + 0.18, w: 0.72, h: 0.6, fontSize: 30, bold: true,
      color: GOLD, align: "right", valign: "top", margin: 0, isTextBox: true,
    });
    heading(s, o[0], { x: x + 0.3, y: y + 0.26, w: cw - 1.3, size: 13.5, h: 0.5 });
    body(s, o[2], { x: x + 0.3, y: y + 0.82, w: cw - 0.6, h: 0.55, size: 11 });
  });

  s.addText(
    [
      { text: "Adding a service is data, not code. ", options: { bold: true, color: NAVY } },
      { text: "A service carries its own form fields, requirements, fee, processing time and document route; the form renders whatever combination it is given.", options: { color: MUTED } },
    ],
    { x: M, y: 5.98, w: CW, h: 0.5, fontSize: 12, lineSpacingMultiple: 1.05, valign: "middle", margin: 0, isTextBox: true });

  s.addNotes(
    "The service counts shown are the demonstration catalogue. The real catalogue " +
    "is whatever this municipality's Charter says, and replacing it is configuration " +
    "rather than development.\n\n" +
    "If a department head asks 'can it do our form?' — the answer is that the form " +
    "is a list of fields in the catalogue, and the screen renders any combination of " +
    "text, select, date, number and long-text fields without a new screen."
  );
}

/* -- 8. Document routes ---------------------------------------------- */
{
  const s = slide("CONTENT_DARK", "What it is", "How to get a document",
    "The order, not just the list",
    "A requirements list says what to bring. It never says where any of it comes from or which to get first — which is the question that actually costs the morning.");

  const chain = [
    ["Real Property Tax Clearance", "Treasurer's Office"],
    ["Zoning Clearance", "Municipal Planning"],
    ["Building Permit", "Office of the Building Official"],
    ["Certificate of Occupancy", "Office of the Building Official"],
  ];
  const cw = 2.72;
  chain.forEach((c, i) => {
    const x = M + i * (cw + 0.46);
    card(s, { x, y: 2.42, w: cw, h: 1.92, fill: "1B2C63", shadow: false, line: "2E4486" });
    badge(s, x + 0.28, 2.64, String(i + 1), { d: 0.44, size: 11.5 });
    heading(s, c[0], { x: x + 0.28, y: 3.16, w: cw - 0.56, size: 12.5, color: WHITE, h: 0.62 });
    body(s, c[1], { x: x + 0.28, y: 3.86, w: cw - 0.56, h: 0.3, size: 10, color: MUTED_ON_DARK });
    if (i < chain.length - 1) {
      s.addText("→", {
        x: x + cw, y: 2.42, w: 0.46, h: 1.92, fontSize: 20, color: GOLD,
        align: "center", valign: "middle", margin: 0, isTextBox: true,
      });
    }
  });
  s.addText("collect in this order", {
    x: M, y: 4.42, w: CW, h: 0.24, fontSize: 9.5, color: "6C7BA0",
    align: "center", margin: 0, isTextBox: true,
  });

  const facts = [
    ["Each step is a tap, not a sentence", "Where the app can issue the prerequisite itself — a barangay clearance, a tax clearance — the step becomes a button that opens that document's own route."],
    ["Every route is in Filipino too", "A step is an instruction a resident has to follow, so the Filipino is a required field on the type. Document names are not translated; those are what the counter asks for."],
    ["It ends with the office's number", "A process changes without telling an application. 'Confirm before you travel' is useless advice without the number to confirm with."],
  ];
  const fw = (CW - 2 * 0.3) / 3;
  facts.forEach((f, i) => {
    const x = M + i * (fw + 0.3);
    heading(s, f[0], { x, y: 4.9, w: fw, size: 13, color: GOLD, h: 0.5 });
    body(s, f[1], { x, y: 5.44, w: fw, h: 1.05, size: 11.5, color: MUTED_ON_DARK });
  });

  s.addNotes(
    "Be straight about this one: the chains currently in the application are a " +
    "careful reading of how these documents are ordinarily obtained, not this " +
    "municipality's charter. A route that is wrong about what comes first does the " +
    "exact harm the feature exists to prevent — under the municipality's own name.\n\n" +
    "Every chain has to be checked against each office's own charter before launch. " +
    "That is on the required-from-the-Municipality list later in the deck."
  );
}

/* -- 9. Section 02 ---------------------------------------------------- */
pres.addSection({ title: "The barangay" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "The barangay" });
  sealRing(s, 12.3, 1.3, [2.5, 2.05, 1.6], { fade: 78 });
  s.addText("02", { placeholder: "eyebrow" });
  s.addText("The barangay", { placeholder: "title" });
  s.addText("The office two streets away, with its own records, its own roles and its own console.", { placeholder: "body" });
  s.addNotes("If barangay captains or secretaries are in the room, this is their section — slow down here.");
}

/* -- 10. Five books --------------------------------------------------- */
{
  const s = slide("CONTENT", "The barangay", "The barangay's own console",
    "Five books, kept the way the paper ones are",
    "Separate from the municipal console entirely — a barangay secretary does not work a municipal queue, and municipal staff get 403 from every barangay route.");

  const books = [
    ["Certificates", "The queue, in a fixed order: pending, processing, ready, released. 'Ready' means come and collect it, so the order is enforced by the server, not merely drawn."],
    ["Notices", "The sheet taped to the wall outside the hall, as a screen residents can read. An urgent one reaches every resident's phone — and only the administrator may send it."],
    ["Blotter", "Katarungang Pambarangay under RA 7160: the complaint, the summons, who was served, and how it ended. No resident route reads it, and no municipal account can."],
    ["Inhabitants", "The Record of Barangay Inhabitants the Local Government Code requires — households, members, and the counts a barangay is actually asked for."],
    ["The hall", "Its address, hours, telephone and email, and who holds the two offices. Repeated on the 'ready' row, because that is the moment somebody travels."],
  ];
  const cw = (CW - 4 * 0.22) / 5;
  books.forEach((b, i) => {
    const x = M + i * (cw + 0.22);
    card(s, { x, y: 2.3, w: cw, h: 3.42, fill: i === 2 ? "FDF6E3" : CANVAS });
    badge(s, x + 0.26, 2.58, String(i + 1), { d: 0.46, size: 12 });
    heading(s, b[0], { x: x + 0.26, y: 3.2, w: cw - 0.52, size: 14 });
    body(s, b[1], { x: x + 0.26, y: 3.6, w: cw - 0.52, h: 1.95, size: 10.5 });
  });

  card(s, { x: M, y: 5.95, w: CW, h: 0.75, fill: NAVY, shadow: false });
  s.addText(
    [
      { text: "No barangay can read another's.  ", options: { bold: true, color: GOLD } },
      { text: "Every statement is scoped to the barangay on the signed-in account's own row, so naming another barangay's record returns 'not found' rather than 'refused' — there is nowhere to name one.", options: { color: "DCE3F5" } },
    ],
    { x: M + 0.35, y: 5.95, w: CW - 0.7, h: 0.75, fontSize: 11.5, lineSpacingMultiple: 1.05, valign: "middle", margin: 0, isTextBox: true });

  s.addNotes(
    "The blotter card is tinted because the rules around it are the inverse of " +
    "everything else: it names somebody accused of something who has been found to " +
    "have done nothing.\n\n" +
    "So: no resident screen, not in the privacy export, and nothing notifies anybody " +
    "— with one exception. A summons sends a reminder to the contact numbers the " +
    "barangay typed in, because the whole point is that two people have to know a " +
    "date. It carries who is asking, when, where and the reference — never the " +
    "nature of the complaint and never the other party's name, because a lock " +
    "screen is not private. And the console says in those words that it is not service."
  );
}

/* -- 11. The council -------------------------------------------------- */
{
  const s = slide("CONTENT_TINT", "The barangay", "The Sangguniang Barangay",
    "The council reads figures, never people",
    "Seven kagawads legislate, pass the budget and answer to the people who elected them. None of that is clerical work, so the councillor's account is not a clerk's with fewer tabs.");

  const canW = (CW - 0.5) / 2;
  const can = ["What the office issued and collected, by period", "The register as counts — population, age bands, households per purok", "The notice board exactly as residents see it"];
  const cannot = ["The certificate queue, or any individual request", "Household names, addresses or members", "The blotter — in any form, under any filter", "Any resident, anywhere in any response"];

  card(s, { x: M, y: 2.3, w: canW, h: 2.95, fill: "EAF3EE" });
  badge(s, M + 0.32, 2.56, "✓", { fill: EMERALD, ring: EMERALD, color: WHITE, size: 14 });
  heading(s, "What a kagawad can read", { x: M + 1.02, y: 2.6, w: canW - 1.3, size: 15 });
  bullets(s, { x: M + 0.34, y: 3.42, w: canW - 0.68, h: 1.6, items: can, size: 12 });

  const x2 = M + canW + 0.5;
  card(s, { x: x2, y: 2.3, w: canW, h: 2.95, fill: "FBEDE4" });
  badge(s, x2 + 0.32, 2.56, "✕", { fill: AMBER_DK, ring: AMBER_DK, color: WHITE, size: 14 });
  heading(s, "What no kagawad can reach", { x: x2 + 1.02, y: 2.6, w: canW - 1.3, size: 15 });
  bullets(s, { x: x2 + 0.34, y: 3.42, w: canW - 0.68, h: 1.7, items: cannot, size: 12 });

  card(s, { x: M, y: 5.45, w: CW, h: 1.08, fill: NAVY, shadow: false });
  s.addText(
    [
      { text: "A separate router, not a third role on the clerk's gate.\n", options: { bold: true, color: GOLD, fontSize: 13 } },
      { text: "The clerk's routes open with a check that excludes a councillor from all of them — including every route somebody adds next year without thinking about this. Handing seven elected politicians a searchable book of accusations against their own constituents is a political weapon, and nothing about holding the office requires it.", options: { color: "DCE3F5", fontSize: 11.5 } },
    ],
    { x: M + 0.35, y: 5.45, w: CW - 0.7, h: 1.08, lineSpacingMultiple: 1.06, valign: "middle", margin: 0, isTextBox: true });

  s.addNotes(
    "Expect a question here: why not just hide the tabs? Because hiding a tab is a " +
    "rendering choice and the next developer adds a route without remembering it. " +
    "A separate gate fails closed for routes that do not exist yet.\n\n" +
    "Also note what is deliberately not built: the council cannot post notices. A " +
    "notice goes out over the barangay's name, and a council seat is not a megaphone. " +
    "That can be widened later; narrowing it after seven people have been using it cannot."
  );
}

/* -- 12. Section 03 --------------------------------------------------- */
pres.addSection({ title: "Trust" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "Trust" });
  sealRing(s, 12.3, 1.3, [2.5, 2.05, 1.6], { fade: 78 });
  s.addText("03", { placeholder: "eyebrow" });
  s.addText("Trust", { placeholder: "title" });
  s.addText("Identity at the counter, money that cannot be faked, and data that cannot cross a boundary.", { placeholder: "body" });
  s.addNotes("This is the section a municipal administrator and a treasurer will judge the whole proposal on.");
}

/* -- 13. ID verification ---------------------------------------------- */
{
  const s = slide("CONTENT", "Trust", "Verifying an identity",
    "The card proves nothing; the code does",
    "A digital ID can be screenshotted, and the badges on it are worth real money — a senior-citizen record is a 20% statutory discount, a 4Ps record is a cash grant. So the card is not the proof.");

  const facts = [
    ["90", "seconds", "A code lives ninety seconds. A screenshot is stale before it reaches a window."],
    ["1", "use only", "It is spent the first time a clerk checks it. A code passed along buys nothing."],
    ["3", "answers", "Unknown, expired and already-used are reported apart — they mean different things at a counter."],
  ];
  const fw = (CW - 2 * 0.3) / 3;
  facts.forEach((f, i) => {
    const x = M + i * (fw + 0.3);
    card(s, { x, y: 2.3, w: fw, h: 1.92, fill: CANVAS });
    s.addText(f[0], { x: x + 0.3, y: 2.46, w: 1.5, h: 0.78, fontSize: 40, bold: true, color: NAVY, margin: 0, valign: "middle", isTextBox: true });
    s.addText(f[1], { x: x + 0.3, y: 3.2, w: fw - 0.6, h: 0.26, fontSize: 11, bold: true, charSpacing: 1.2, color: GOLD_DK, margin: 0, isTextBox: true });
    body(s, f[2], { x: x + 0.3, y: 3.5, w: fw - 0.6, h: 0.6, size: 11 });
  });

  card(s, { x: M, y: 4.46, w: CW, h: 2.0, fill: WHITE, line: HAIRLINE });
  heading(s, "What the clerk gets back — and what they do not", { x: M + 0.38, y: 4.72, w: CW - 0.76, size: 14.5 });
  const yesW = (CW - 1.3) / 2;
  bullets(s, {
    x: M + 0.38, y: 5.18, w: yesW, h: 1.1, size: 11.5, gap: 4,
    items: ["The face on the record, and the name", "Where they live", "The last four digits of the PhilSys number", "The entitlements live on the record right now"],
  });
  bullets(s, {
    x: M + 0.38 + yesW + 0.54, y: 5.18, w: yesW, h: 1.1, size: 11.5, gap: 4, color: AMBER_DK,
    items: ["No email address, no telephone number", "No request history", "Never the whole PhilSys number", "No way to search — only a code the resident chose to show"],
  });

  s.addNotes(
    "The important property is at the end: this is not a directory. The only way in " +
    "is a code the resident generated and read out, so every check is one the " +
    "resident started, and every check records which clerk ran it.\n\n" +
    "The QR is real and scannable with the clerk's own phone camera — it carries a " +
    "link back into the app. Be honest if asked: PhilSys itself is not connected. " +
    "The verification code is real and checked server-side; the PhilSys sync shown " +
    "on the ID is representative only."
  );
}

/* -- 14. Payments ------------------------------------------------------ */
{
  const s = slide("CONTENT_DARK", "Trust", "Money", "Nothing the browser says moves a peso",
    "The flow below is the one every payment provider expects, and the reason it looks like this is that every other shape is broken.");

  const steps = [
    ["The server prices it", "An intent is created for an amount the server read off the request's own assessment. The browser is never asked what it owes."],
    ["The resident pays", "At the provider. The application is not involved and never sees a card number."],
    ["The provider calls back, signed", "The server verifies the signature over the raw bytes, checks the timestamp against a replay window, and only then settles."],
  ];
  const cw = (CW - 2 * 0.5) / 3;
  steps.forEach((st, i) => {
    const x = M + i * (cw + 0.5);
    card(s, { x, y: 2.4, w: cw, h: 2.3, fill: "1B2C63", shadow: false, line: "2E4486" });
    badge(s, x + 0.3, 2.62, String(i + 1), { d: 0.48, size: 12.5 });
    heading(s, st[0], { x: x + 0.3, y: 3.18, w: cw - 0.6, size: 13.5, color: WHITE, h: 0.56 });
    body(s, st[1], { x: x + 0.3, y: 3.8, w: cw - 0.6, h: 0.8, size: 11, color: MUTED_ON_DARK });
    if (i < steps.length - 1) {
      s.addText("→", { x: x + cw, y: 2.4, w: 0.5, h: 2.3, fontSize: 20, color: GOLD, align: "center", valign: "middle", margin: 0, isTextBox: true });
    }
  });

  const guards = [
    ["Close the tab and you are still paid up", "The server's record decides, not the browser's return trip. The payment screen polls the server rather than trusting itself."],
    ["A duplicate callback settles once", "A gateway retries until it gets a success, so the same event arrives more than once as a matter of course. One settled payment per request is a database guarantee."],
    ["A wrong amount is flagged, not settled", "A callback for a different figure is marked and left for a treasurer the same day. Settling it would either short-change the municipality or overcharge the resident."],
  ];
  const gw = (CW - 2 * 0.3) / 3;
  guards.forEach((g, i) => {
    const x = M + i * (gw + 0.3);
    heading(s, g[0], { x, y: 5.02, w: gw, size: 12.5, color: GOLD, h: 0.5 });
    body(s, g[1], { x, y: 5.56, w: gw, h: 1.0, size: 11, color: MUTED_ON_DARK });
  });

  s.addNotes(
    "State the limitation out loud before anyone asks, because a treasurer will ask.\n\n" +
    "The architecture is complete and tested — server-priced intents, signed " +
    "webhooks, idempotent settlement, amount checking, a reconciliation view with " +
    "the gateway reference on every line. The only provider implemented is a " +
    "development simulator that signs and verifies exactly as a real one does but " +
    "takes no money.\n\n" +
    "Connecting a real gateway — GCash, Maya, Landbank — means implementing one " +
    "interface and setting two configuration values. Nothing else about the flow changes."
  );
}

/* -- 15. Isolation ----------------------------------------------------- */
{
  const s = slide("CONTENT", "Trust", "No data leak", "One municipality, one database",
    "The alternative — every town in one database, with every query scoped by a column — makes a single forgotten clause a permanent leak of one town's residents to another town's staff.");

  const left = M;
  const lw = CW * 0.52;
  card(s, { x: left, y: 2.3, w: lw, h: 3.0, fill: CANVAS });
  heading(s, "What that buys", { x: left + 0.36, y: 2.58, w: lw - 0.72, size: 15 });
  bullets(s, {
    x: left + 0.36, y: 3.04, w: lw - 0.72, h: 2.1, size: 12,
    items: [
      "Two municipalities share no row, so neither can leak into the other",
      "The instance refuses to start if it is pointed at another municipality's database — it exits and names both sides",
      "Sign-in refuses an account that belongs to another register",
      "Every boot prints which municipality it is serving",
    ],
  });

  const rx = left + lw + 0.4;
  const rw = CW - lw - 0.4;
  card(s, { x: rx, y: 2.3, w: rw, h: 3.0, fill: "FBEDE4" });
  heading(s, "What it costs, stated plainly", { x: rx + 0.36, y: 2.58, w: rw - 0.72, size: 15 });
  bullets(s, {
    x: rx + 0.36, y: 3.04, w: rw - 0.72, h: 2.1, size: 12, color: INK,
    items: [
      "A second municipality is an operational act, not a form in a screen",
      "There is no province-wide administrator inside this application, because there is nowhere for one to stand",
      "A resident who moves towns keeps no history here",
    ],
  });

  card(s, { x: M, y: 5.52, w: CW, h: 1.0, fill: NAVY, shadow: false });
  s.addText(
    [
      { text: "Inside one municipality the same rule holds one level down.  ", options: { bold: true, color: GOLD } },
      { text: "A department sees its own queue; a barangay sees its own records. Both are enforced by what the query is scoped to rather than by a check somebody has to remember — which is why naming another barangay's record answers 'not found' rather than 'refused'.", options: { color: "DCE3F5" } },
    ],
    { x: M + 0.35, y: 5.52, w: CW - 0.7, h: 1.0, fontSize: 11.5, lineSpacingMultiple: 1.06, valign: "middle", margin: 0, isTextBox: true });

  s.addNotes(
    "This is the slide to linger on if there is an IT officer or a DPO in the room.\n\n" +
    "The honest trade-off is on the right. A province that wanted one dashboard " +
    "across its towns would build a separate service reading each deployment — it " +
    "is not a role inside this application, and that is deliberate."
  );
}

/* -- 16. Privacy -------------------------------------------------------- */
{
  const s = slide("CONTENT_TINT", "Trust", "RA 10173", "A privacy notice that is made of buttons",
    "Saying a resident may see, correct and erase what is held about them, without providing it, is the version of compliance that helps nobody.");

  const items = [
    ["Export", "One file with the profile, every request and its history, attachments, drafts, appointments, complaints, feedback, notifications, programme records and every time a clerk checked their ID.", EMERALD],
    ["Correct", "An address and a telephone number are facts the resident knows better than the office. A name or a PhilSys number is an identity claim an office verified — so those go through the Civil Registrar, and the screen says so.", NAVY_SOFT],
    ["Close the account", "The sign-in is closed, the password destroyed, contact details and the ID portrait erased, drafts and notifications deleted, and upcoming appointments cancelled so the slot goes to somebody else.", GOLD_DK],
    ["What must stay, and why", "A released business permit is a public record the municipality must keep, and a permit with no applicant on it is not a record. The screen names what would be kept, with the reason, before anything happens.", AMBER_DK],
  ];
  const cw = (CW - 3 * 0.26) / 4;
  items.forEach((it, i) => {
    const x = M + i * (cw + 0.26);
    card(s, { x, y: 2.3, w: cw, h: 3.6, fill: WHITE });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.3, y: 2.58, w: 0.52, h: 0.18, rectRadius: 0.09,
      fill: { color: it[2] }, line: { color: it[2], width: 0 }, objectName: "tag",
    });
    heading(s, it[0], { x: x + 0.3, y: 2.9, w: cw - 0.6, size: 15, h: 0.58 });
    body(s, it[1], { x: x + 0.3, y: 3.58, w: cw - 0.6, h: 2.1, size: 11 });
  });

  body(s,
    "Finding out afterwards which records could not be erased would be the worst possible order, so the preview comes first — and a record of what was erased and what was retained is written as it was at the time, with the resident's name on it, so the Municipality can still answer who asked.",
    { x: M, y: 6.06, w: CW, h: 0.6, size: 11.5 });

  s.addNotes(
    "One thing to flag honestly: the automatic erasure happens immediately, but " +
    "there is no screen yet for the Data Protection Officer to work through the " +
    "retained items and erase what the retention period has expired on. Right now " +
    "that review happens in the database. It is a real obligation and a known gap."
  );
}

/* -- 17. Section 04 ------------------------------------------------------ */
pres.addSection({ title: "Running the office" });
{
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: "Running the office" });
  sealRing(s, 12.3, 1.3, [2.5, 2.05, 1.6], { fade: 78 });
  s.addText("04", { placeholder: "eyebrow" });
  s.addText("Running the office", { placeholder: "title" });
  s.addText("What a department head can finally answer, and what the law already asks them to.", { placeholder: "body" });
  s.addNotes("Pivot from 'what the resident gets' to 'what the municipality gets'. This is the section that wins a department head.");
}

/* -- 18. Two clocks (chart) ---------------------------------------------- */
{
  const s = slide("CONTENT", "Running the office", "Turnaround", "Two clocks, because either one alone lies",
    "Office days run only while the office actually held the request. Resident days run from filing to release regardless. The gap between them is itself the finding.");

  const cats = ["Business\nPermit", "Building\nPermit", "Birth\nCertificate", "Cedula", "Sanitary\nPermit", "Occupancy\nPermit"];
  const chartData = [
    { name: "Office days (median)", labels: cats, values: [3, 6, 1, 1, 2, 4] },
    { name: "Resident days (median)", labels: cats, values: [5, 11, 1, 1, 3, 9] },
  ];

  s.addChart(pres.ChartType.bar, chartData, {
    x: M, y: 2.34, w: CW * 0.63, h: 3.5,
    barDir: "col",
    barGapWidthPct: 60,
    chartColors: [NAVY_MID, GOLD],
    showTitle: false,
    showLegend: true,
    legendPos: "t",
    legendFontSize: 10,
    legendColor: MUTED,
    legendFontFace: "+mn-lt",
    showValue: true,
    dataLabelPosition: "outEnd",
    dataLabelFontSize: 9,
    dataLabelColor: MUTED,
    dataLabelFontFace: "+mn-lt",
    catAxisLabelColor: MUTED,
    catAxisLabelFontSize: 9.5,
    catAxisLabelFontFace: "+mn-lt",
    valAxisLabelColor: MUTED,
    valAxisLabelFontSize: 9.5,
    valAxisLabelFontFace: "+mn-lt",
    valAxisTitle: "Working days",
    showValAxisTitle: true,
    valAxisTitleColor: MUTED,
    valAxisTitleFontSize: 10,
    valAxisTitleFontFace: "+mn-lt",
    valGridLine: { color: "E4E9F2", size: 1 },
    catGridLine: { style: "none" },
    border: { pt: 0, color: "FFFFFF" },
  });

  const rx = M + CW * 0.63 + 0.42;
  const rw = CW - CW * 0.63 - 0.42;
  const notes = [
    ["Medians, never means", "One permit stuck behind a land dispute for eight months would drag an average until the number described nothing. A separate ninetieth-percentile column says how bad the tail gets."],
    ["On time against your own promise", "Judged on the office clock against the processing time the Charter quoted the resident — so the report can never drift from the front of the application."],
    ["Working days only", "Weekends and the holiday calendar are skipped. An office is not late for a day the hall was shut."],
  ];
  notes.forEach((n, i) => {
    const y = 2.34 + i * 1.2;
    heading(s, n[0], { x: rx, y, w: rw, size: 12.5, h: 0.34 });
    body(s, n[1], { x: rx, y: y + 0.38, w: rw, h: 0.78, size: 10.5 });
  });

  body(s,
    "Illustrative figures. On a live deployment these are computed from the Municipality's own requests, for any period up to a year, and offered as a spreadsheet.",
    { x: M, y: 6.06, w: CW, h: 0.4, size: 10.5 });

  s.addNotes(
    "Make the point about the gap: a wide gap between the two bars is not a slow " +
    "office. It is a payment step residents are struggling with, and quoting only " +
    "the resident clock would blame the office for a permit that sat unpaid for a week.\n\n" +
    "Say clearly that the numbers on screen are illustrative. The real ones come " +
    "from this municipality's own queue."
  );
}

/* -- 19. Compliance ------------------------------------------------------ */
{
  const s = slide("CONTENT_DARK", "Running the office", "What the law already asks",
    "Four statutes, built in rather than bolted on",
    "None of this is new obligation. It is obligation the Municipality already carries, given somewhere to live.");

  const laws = [
    ["RA 11032", "Ease of Doing Business and Efficient Government Service Delivery Act", "The service catalogue is the Citizen's Charter, published to every resident. Feedback is asked once, when the office has finished. A complaint gets a reference and a visible deadline in working days, and a reply, once given, stands."],
    ["RA 10173", "Data Privacy Act", "Export, correction and account closure are screens a resident can reach. What cannot be erased is named with its reason before anything happens."],
    ["RA 7160", "Local Government Code", "The barangay's Record of Barangay Inhabitants, and the Katarungang Pambarangay blotter with its summons and service recorded apart from the outcome."],
    ["RA 11261", "First Time Jobseekers Assistance Act", "The certificate is in the barangay catalogue, with the one-year validity the law gives it."],
  ];
  const cw = (CW - 3 * 0.26) / 4;
  laws.forEach((l, i) => {
    const x = M + i * (cw + 0.26);
    card(s, { x, y: 2.34, w: cw, h: 3.55, fill: "1B2C63", shadow: false, line: "2E4486" });
    s.addText(l[0], { x: x + 0.3, y: 2.6, w: cw - 0.6, h: 0.42, fontSize: 20, bold: true, color: GOLD, margin: 0, valign: "middle", isTextBox: true });
    body(s, l[1], { x: x + 0.3, y: 3.06, w: cw - 0.6, h: 0.7, size: 10.5, color: "9FAFD2" });
    body(s, l[2], { x: x + 0.3, y: 3.84, w: cw - 0.6, h: 1.85, size: 11, color: "DCE3F5" });
  });

  body(s,
    "The RA 11032 response deadline currently carries a placeholder number of working days. It must be set to the response time this Municipality's own Citizen's Charter commits to — a deadline the office never agreed to is worse than none, because the application then reports it late against it.",
    { x: M, y: 6.06, w: CW, h: 0.6, size: 11, color: MUTED_ON_DARK });

  s.addNotes(
    "The complaints mechanism is worth a sentence of its own: the server refuses a " +
    "second reply to a complaint. An office quietly rewriting what it told a resident " +
    "is the precise thing a complaints mechanism exists to prevent.\n\n" +
    "Also mention: the rating is one question with an optional sentence, not the " +
    "prescribed Client Satisfaction Measurement dimensions. Eight questions on a " +
    "phone gets eight blank answers; one gets a real one. If the municipality must " +
    "report the full CSM, that is a known difference to close."
  );
}

/* -- 20. Reaching everyone ------------------------------------------------ */
{
  const s = slide("CONTENT", "Running the office", "Reaching everyone",
    "Built for the phone in the barangay",
    "This application registers senior citizens and persons with disability. Legibility and a weak signal are requirements here, not polish.");

  const cards = [
    ["English and Filipino", "480 interface strings in both, and a missing Filipino translation is a build error rather than a stray English word on a Filipino screen. Document names stay as the counter says them."],
    ["Three text sizes", "Every size in the resident app scales from one control in the profile. Secondary text sits at a contrast ratio that passes WCAG AA; every tap target is at least 44 pixels."],
    ["It works with no signal", "The emergency hotlines and the digital ID open from the device. A half-filled form is written to the phone on every keystroke, and a submission made offline is queued and sent when the signal returns."],
    ["It installs", "Installable to the home screen from the browser, with the three steps spelled out on iPhone, which has no install button to offer."],
    ["It tells the resident", "Email, SMS and push when a request moves. A programme enrolment or a complaint reply never shows its text on a lock screen — a 4Ps membership announced to whoever is holding the phone is a disclosure to the room."],
    ["Emergency, one tap", "The municipality's hotlines are the only red thing on the dashboard, and every number is a real dialling link. The app never places the call itself."],
  ];
  const cw = (CW - 2 * 0.28) / 3;
  const ch = 1.78;
  cards.forEach((c, i) => {
    const x = M + (i % 3) * (cw + 0.28);
    const y = 2.3 + Math.floor(i / 3) * (ch + 0.26);
    card(s, { x, y, w: cw, h: ch, fill: CANVAS });
    heading(s, c[0], { x: x + 0.3, y: y + 0.26, w: cw - 0.6, size: 13.5, h: 0.34 });
    body(s, c[1], { x: x + 0.3, y: y + 0.68, w: cw - 0.6, h: 0.95, size: 10.8 });
  });

  s.addNotes(
    "If there is an MSWDO or an OSCA officer in the room, the text-size control and " +
    "the contrast work are for their clients specifically.\n\n" +
    "On push: the signing and encryption are real and tested, but nothing in the " +
    "development environment can reach a push service, so the final delivery hop has " +
    "never actually run. Verify it on the real deployment before relying on push as " +
    "the channel that tells a resident their document is ready."
  );
}

/* -- 21. By the numbers --------------------------------------------------- */
pres.addSection({ title: "Where this stands" });
{
  const s = slide("CONTENT_DARK", "Where this stands", "Scale", "Where the build stands today",
    "Configured for demonstration on sample data for a Pangasinan municipality. Every per-town figure is replaced at configuration.");

  const stats = [
    ["6", "municipal offices,\neach with its own queue"],
    ["17", "municipal services,\nwith fees and routes"],
    ["6", "barangay certificates,\neditable in the console"],
    ["8", "sectoral and poverty\nregisters"],
    ["99", "document steps,\nwritten in both languages"],
    ["480", "interface strings,\ntranslated in full"],
    ["37", "automated test suites\nover the API"],
    ["34", "database migrations,\nversioned"],
  ];
  const cw = (CW - 3 * 0.24) / 4;
  const ch = 1.72;
  stats.forEach((st, i) => {
    const x = M + (i % 4) * (cw + 0.24);
    const y = 2.4 + Math.floor(i / 4) * (ch + 0.26);
    card(s, { x, y, w: cw, h: ch, fill: "1B2C63", shadow: false, line: "2E4486" });
    s.addText(st[0], { x: x + 0.3, y: y + 0.22, w: cw - 0.6, h: 0.78, fontSize: 42, bold: true, color: GOLD, margin: 0, valign: "middle", isTextBox: true });
    body(s, st[1], { x: x + 0.3, y: y + 1.0, w: cw - 0.6, h: 0.6, size: 10.8, color: "C3CEE8" });
  });

  body(s,
    "Approximately 37,000 lines of TypeScript across the resident application, the staff consoles and the API.",
    { x: M, y: 6.3, w: CW, h: 0.34, size: 11, color: MUTED_ON_DARK });

  s.addNotes(
    "Do not oversell these. They describe a working build on sample data, not a " +
    "deployment. The sample barangay roster is six barangays with invented captains " +
    "— the real roster for a municipality like this one runs to dozens, and replacing " +
    "it is configuration.\n\n" +
    "The test-suite count matters more than the line count: it is the reason a change " +
    "to one office's rules does not quietly break another's."
  );
}

/* -- 22. Honest status ---------------------------------------------------- */
{
  const s = slide("CONTENT", "Where this stands", "Plainly",
    "What works today, and what still needs you",
    "Stated before being asked, because a system that overstates itself at the proposal stage is found out at the counter.");

  const colW = (CW - 0.45) / 2;
  card(s, { x: M, y: 2.22, w: colW, h: 3.92, fill: "EAF3EE" });
  badge(s, M + 0.32, 2.5, "✓", { fill: EMERALD, ring: EMERALD, color: WHITE, size: 14 });
  heading(s, "Operating against a live database", { x: M + 1.02, y: 2.54, w: colW - 1.3, size: 15 });
  bullets(s, {
    x: M + 0.34, y: 3.24, w: colW - 0.68, h: 2.78, size: 11.5, gap: 5,
    items: [
      "Accounts, roles and every boundary between them",
      "The full life of a request, filing through released document",
      "Attachments, checked by content and virus-scanned",
      "Appointments, queue numbers, the working-day calendar",
      "Identity verification at the counter",
      "Office reports, feedback and complaints",
      "Both barangay consoles and the council's view",
      "Privacy export, correction and account closure",
      "Offline use of a half-filled form and of the hotlines",
    ],
  });

  const x2 = M + colW + 0.45;
  card(s, { x: x2, y: 2.22, w: colW, h: 3.92, fill: "FBEDE4" });
  badge(s, x2 + 0.32, 2.5, "!", { fill: AMBER_DK, ring: AMBER_DK, color: WHITE, size: 15 });
  heading(s, "Not yet real, or not yet yours", { x: x2 + 1.02, y: 2.54, w: colW - 1.3, size: 15 });
  bullets(s, {
    x: x2 + 0.34, y: 3.24, w: colW - 0.68, h: 2.78, size: 11.3, gap: 4.5, color: INK,
    items: [
      "Online payment settles only through a development simulator — a real gateway account is required",
      "PhilSys verification is represented, not connected",
      "The hotlines, fees, validity periods and document routes are placeholders awaiting your Citizen's Charter",
      "The holiday calendar needs the year's proclamation and your own local declarations",
      "The barangay roster is six samples, not your real one",
      "A released PDF carries a verification code but is not digitally signed",
      "Barangay fees are settled at the hall, not online",
    ],
  });

  body(s,
    "Nothing on the right is hidden in the application either — the deployment checklist in the repository names every one of them.",
    { x: M, y: 6.34, w: CW, h: 0.4, size: 11.5 });

  s.addNotes(
    "Put this slide up and let it be read. A mayor's office has been promised " +
    "finished systems before.\n\n" +
    "The strongest thing to say here: the right-hand column is mostly not " +
    "engineering. It is this municipality's own data — its charter, its numbers, its " +
    "barangays — and nobody else can supply it. The engineering items are the " +
    "payment gateway and PhilSys, and both are integrations with a known shape."
  );
}

/* -- 23. Next steps -------------------------------------------------------- */
{
  const s = slide("CONTENT_TINT", "Where this stands", "Next",
    "A sequence you control at every step",
    "No step commits you to the next, and nothing is published to residents until you are satisfied that what it says about your fees, your requirements and your telephone numbers is correct.");

  const steps = [
    ["Courtesy meeting", "A short briefing for the Mayor's office on what the portal does and what it would ask of the Municipality.", "This meeting"],
    ["Demonstration", "A working walk-through for each office concerned and for one barangay, answering their own questions.", "At your convenience"],
    ["Configuration", "Your Citizen's Charter, your verified hotlines, your holiday calendar and your barangay roster replace every placeholder.", "With each office"],
    ["Pilot, then launch", "One office and one barangay first, with training, before the Municipality decides whether to open it to the public.", "Your decision"],
  ];
  const cw = (CW - 3 * 0.28) / 4;
  steps.forEach((st, i) => {
    const x = M + i * (cw + 0.28);
    card(s, { x, y: 2.45, w: cw, h: 3.0, fill: WHITE });
    badge(s, x + 0.3, 2.74, String(i + 1).padStart(2, "0"), { d: 0.58, size: 13 });
    heading(s, st[0], { x: x + 0.3, y: 3.44, w: cw - 0.6, size: 14.5, h: 0.36 });
    body(s, st[1], { x: x + 0.3, y: 3.86, w: cw - 0.6, h: 1.25, size: 11 });
    s.addText(st[2].toUpperCase(), {
      x: x + 0.3, y: 5.02, w: cw - 0.6, h: 0.26, fontSize: 9.5, bold: true,
      charSpacing: 1.1, color: GOLD_DK, margin: 0, isTextBox: true,
    });
    if (i < steps.length - 1) {
      s.addText("→", { x: x + cw, y: 2.45, w: 0.28, h: 3.0, fontSize: 16, color: GOLD_DK, align: "center", valign: "middle", margin: 0, isTextBox: true });
    }
  });

  heading(s, "What the Municipality would need to nominate", { x: M, y: 5.72, w: CW, size: 14 });
  const asks = [
    "An administrator for the municipal hall",
    "One contact per office, to confirm its charter",
    "One barangay willing to pilot its own console",
  ];
  const aw = (CW - 2 * 0.3) / 3;
  asks.forEach((a, i) => {
    body(s, "— " + a, { x: M + i * (aw + 0.3), y: 6.16, w: aw, h: 0.5, size: 11.5, color: INK });
  });

  s.addNotes(
    "Close on the ask, not on the technology. What you want out of this room is a " +
    "date for the demonstration and the names of the people in step three.\n\n" +
    "If they ask about cost, the honest answer at this stage is that the " +
    "demonstration carries none, and terms follow once the scope of configuration " +
    "and training is clear."
  );
}

/* -- 24. Closing ------------------------------------------------------------ */
{
  const s = pres.addSlide({ masterName: "CLOSING", sectionTitle: "Where this stands" });
  sealRing(s, 11.6, 3.6, [2.9, 2.4, 1.9], { fade: 76 });
  sealRing(s, 11.6, 3.6, [1.0], { fade: 50 });
  s.addText("Thank you", { placeholder: "title" });
  s.addText(
    "One trip instead of three. That is the whole proposition — and every rule in " +
    "this system exists to make it true for a resident who has no reason to trust " +
    "an application yet.",
    { placeholder: "body" });

  const rows = [["Presented by", 5.15], ["Contact number", 5.72], ["Email address", 6.29]];
  rows.forEach(([lbl, y]) => {
    s.addText(lbl, { x: M + 0.1, y, w: 1.75, h: 0.3, fontSize: 12.5, color: MUTED_ON_DARK, margin: 0, isTextBox: true });
    s.addShape(pres.ShapeType.line, {
      x: M + 1.95, y: y + 0.3, w: 5.4, h: 0,
      line: { color: "47558A", width: 1 }, objectName: "blank rule",
    });
  });

  s.addNotes(
    "Leave this slide up for questions.\n\n" +
    "The blanks are for writing in, or for filling in before you present. If you are " +
    "asked one thing to take away, offer the demonstration — it answers more in " +
    "twenty minutes than any deck does."
  );
}

/* ------------------------------------------------------------------ write */

(async () => {
  await pres.writeFile({ fileName: OUT });
  const skill = process.env.PPTX_SKILL_DIR;
  if (skill) {
    const { applyTheme } = require(path.join(skill, "scripts", "apply_theme.js"));
    await applyTheme(OUT, THEME);
    console.log("theme applied");
  } else {
    console.log("PPTX_SKILL_DIR not set — theme colours not written");
  }
  console.log("wrote " + OUT);
})();
