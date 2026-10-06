#!/usr/bin/env python3
"""
Builds proposal/eLGU-Letter-of-Intent.pdf — a two-page letter of intent with the
municipality's own details left as ruled blanks, so one printed copy can be
filled in by hand for whichever LGU it is being sent to.

Fonts: Plus Jakarta Sans + Inter if fetch_fonts.sh has been run, Helvetica
otherwise. The letter is designed to look right either way — nothing depends on
a glyph the fallback lacks, and the peso sign is avoided for the same reason
(the Google Fonts latin subset does not carry it).

    python3 proposal/build_letter.py
"""

import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "eLGU-Letter-of-Intent.pdf")

# The app's own tokens, from src/index.css.
NAVY = colors.HexColor("#0f1d4d")
NAVY_MID = colors.HexColor("#1e3a8a")
GOLD = colors.HexColor("#d69e0a")
GOLD_LIGHT = colors.HexColor("#fbbf24")
RULE = colors.HexColor("#8c99b8")
MUTED = colors.HexColor("#5b6480")
CANVAS = colors.HexColor("#f1f4f9")

# Filled in by the first build pass so the footer can say "of N".
TOTAL_PAGES = None


# --------------------------------------------------------------------------- #
# Fonts
# --------------------------------------------------------------------------- #

def register_fonts():
    """Returns (display, display_bold, body, body_bold, body_semibold)."""
    candidates = [
        ("eLGU-Display", "Jakarta-ExtraBold.ttf"),
        ("eLGU-Display-Bold", "Jakarta-ExtraBold.ttf"),
        ("eLGU-Body", "Inter-Regular.ttf"),
        ("eLGU-Body-Bold", "Inter-Bold.ttf"),
        ("eLGU-Body-Semi", "Inter-SemiBold.ttf"),
    ]
    font_dir = os.environ.get("ELGU_FONT_DIR", os.path.join(HERE, "fonts"))
    try:
        for name, filename in candidates:
            pdfmetrics.registerFont(TTFont(name, os.path.join(font_dir, filename)))
    except Exception:
        return ("Helvetica-Bold", "Helvetica-Bold", "Helvetica",
                "Helvetica-Bold", "Helvetica-Bold")
    pdfmetrics.registerFontFamily(
        "eLGU-Body", normal="eLGU-Body", bold="eLGU-Body-Bold",
        italic="eLGU-Body", boldItalic="eLGU-Body-Bold",
    )
    return ("eLGU-Display", "eLGU-Display-Bold", "eLGU-Body",
            "eLGU-Body-Bold", "eLGU-Body-Semi")


DISPLAY, DISPLAY_BOLD, BODY, BODY_BOLD, BODY_SEMI = register_fonts()


# --------------------------------------------------------------------------- #
# A ruled blank: the thing this document is actually for
# --------------------------------------------------------------------------- #

class Blank(Flowable):
    """One ruled line to write on, with an optional caption beneath it.

    The caption is what makes a fill-in form usable — a bare rule leaves the
    person holding the pen guessing what belongs on it.
    """

    def __init__(self, width, label=None, prefix=None, gap=4.5,
                 label_size=6.6, prefix_size=10.5):
        super().__init__()
        self.rule_width = width
        self.label = label
        self.prefix = prefix
        self.gap = gap
        self.label_size = label_size
        self.prefix_size = prefix_size
        self.prefix_width = 0
        if prefix:
            self.prefix_width = pdfmetrics.stringWidth(prefix, BODY, prefix_size) + 4
        self.width = self.prefix_width + width
        self.height = 15 + (self.label_size + self.gap if label else 0)

    def draw(self):
        c = self.canv
        baseline = self.height - 13
        if self.prefix:
            c.setFont(BODY, self.prefix_size)
            c.setFillColor(NAVY)
            c.drawString(0, baseline + 2.5, self.prefix)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.7)
        c.line(self.prefix_width, baseline, self.prefix_width + self.rule_width, baseline)
        if self.label:
            c.setFont(BODY, self.label_size)
            c.setFillColor(MUTED)
            c.drawString(self.prefix_width + 1, baseline - self.gap - self.label_size + 1,
                         self.label.upper())


class Rule(Flowable):
    """A horizontal hairline. Two weights stacked gives the letterhead its edge."""

    def __init__(self, width, weight=0.8, color=NAVY, space_before=0, space_after=0,
                 second=None):
        super().__init__()
        self.width = width
        self.weight = weight
        self.color = color
        self.second = second
        self.space_before = space_before
        self.height = space_before + weight + space_after + (2.6 if second else 0)

    def draw(self):
        c = self.canv
        y = self.height - self.space_before - self.weight
        c.setStrokeColor(self.color)
        c.setLineWidth(self.weight)
        c.line(0, y, self.width, y)
        if self.second:
            c.setStrokeColor(self.second)
            c.setLineWidth(2.0)
            c.line(0, y - 3.4, self.width * 0.14, y - 3.4)


def gap(text, chars=12):
    """An underlined in-paragraph blank, for a gap inside running prose."""
    return '<u color="#8c99b8">%s</u>' % ("&nbsp;" * chars) if not text else text


# --------------------------------------------------------------------------- #
# Styles
# --------------------------------------------------------------------------- #

S = {
    "kicker": ParagraphStyle(
        "kicker", fontName=BODY_SEMI, fontSize=7.6, leading=10,
        textColor=GOLD, alignment=TA_CENTER, spaceAfter=5,
    ),
    "title": ParagraphStyle(
        "title", fontName=DISPLAY_BOLD, fontSize=17.5, leading=21,
        textColor=NAVY, alignment=TA_CENTER,
    ),
    "body": ParagraphStyle(
        "body", fontName=BODY, fontSize=10.3, leading=15.4,
        textColor=colors.HexColor("#15213f"), alignment=TA_JUSTIFY,
        spaceAfter=9.5, firstLineIndent=0,
    ),
    "flush": ParagraphStyle(
        "flush", fontName=BODY, fontSize=10.3, leading=15.4,
        textColor=colors.HexColor("#15213f"), spaceAfter=3,
    ),
    "subject": ParagraphStyle(
        "subject", fontName=BODY, fontSize=10.3, leading=14.6,
        textColor=NAVY, spaceAfter=11,
    ),
    "h2": ParagraphStyle(
        "h2", fontName=DISPLAY_BOLD, fontSize=12.4, leading=15,
        textColor=NAVY, spaceBefore=2, spaceAfter=7,
    ),
    "h3": ParagraphStyle(
        "h3", fontName=BODY_SEMI, fontSize=8.1, leading=11,
        textColor=GOLD, spaceAfter=5,
    ),
    "cell": ParagraphStyle(
        "cell", fontName=BODY, fontSize=8.9, leading=12.4,
        textColor=colors.HexColor("#15213f"),
        leftIndent=10.5, firstLineIndent=-10.5, spaceAfter=5.4,
    ),
    "cellhead": ParagraphStyle(
        "cellhead", fontName=BODY_SEMI, fontSize=8.6, leading=11.5,
        textColor=colors.white,
    ),
    "stat": ParagraphStyle(
        "stat", fontName=DISPLAY_BOLD, fontSize=16, leading=18,
        textColor=NAVY, alignment=TA_CENTER,
    ),
    "statlabel": ParagraphStyle(
        "statlabel", fontName=BODY, fontSize=6.8, leading=8.6,
        textColor=MUTED, alignment=TA_CENTER,
    ),
    "fine": ParagraphStyle(
        "fine", fontName=BODY, fontSize=7.9, leading=11.2,
        textColor=MUTED, alignment=TA_JUSTIFY,
    ),
    "note": ParagraphStyle(
        "note", fontName=BODY, fontSize=7.4, leading=10,
        textColor=MUTED, alignment=TA_CENTER,
    ),
}


# --------------------------------------------------------------------------- #
# Page furniture
# --------------------------------------------------------------------------- #

PAGE_W, PAGE_H = LETTER
MARGIN_X = 0.95 * inch
MARGIN_TOP = 0.78 * inch
MARGIN_BOT = 0.72 * inch
CONTENT_W = PAGE_W - 2 * MARGIN_X


def page_furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont(BODY, 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(PAGE_W / 2, MARGIN_BOT - 22,
                             "Page %d of %s" % (doc.page, TOTAL_PAGES or "?"))
    if doc.page > 1:
        canvas.setFont(BODY, 7.2)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN_X, PAGE_H - MARGIN_TOP + 20,
                          "Letter of Intent  ·  eLGU Citizen Services Portal")
        canvas.setStrokeColor(colors.HexColor("#d6ddea"))
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN_X, PAGE_H - MARGIN_TOP + 12,
                    PAGE_W - MARGIN_X, PAGE_H - MARGIN_TOP + 12)
    canvas.restoreState()


# --------------------------------------------------------------------------- #
# Page 1 — the letter
# --------------------------------------------------------------------------- #

def letterhead():
    out = [
        Paragraph("PROPOSAL TO THE MUNICIPAL GOVERNMENT", S["kicker"]),
        Paragraph("Letter of Intent", S["title"]),
        Spacer(1, 7),
        Paragraph(
            "Deployment of an electronic Local Government Unit (eLGU) "
            "Citizen Services Portal",
            ParagraphStyle("sub", fontName=BODY, fontSize=9.2, leading=12.6,
                           textColor=MUTED, alignment=TA_CENTER),
        ),
        Spacer(1, 9),
        Rule(CONTENT_W, weight=1.1, color=NAVY, second=GOLD_LIGHT),
        Spacer(1, 16),
    ]
    return out


def sender_block():
    half = (CONTENT_W - 0.35 * inch) / 2
    rows = [
        [Blank(half, "Your name"), Blank(half, "Date")],
        [Blank(half, "Address"), Blank(half, "Contact number")],
        [Blank(half, "Address (continued)"), Blank(half, "Email address")],
    ]
    t = Table(rows, colWidths=[half, half + 0.35 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def addressee_block():
    w = 3.95 * inch
    return [
        Paragraph("The Honorable", S["flush"]),
        Blank(w, "Name of the Municipal Mayor"),
        Spacer(1, 2),
        Paragraph("Municipal Mayor", S["flush"]),
        Blank(w, "Municipality", prefix="Municipality of"),
        Spacer(1, 2),
        Blank(w, "Province", prefix="Province of"),
    ]


def letter_body():
    body = []

    body.append(Paragraph(
        "<b>Subject:&nbsp;&nbsp;</b>Letter of intent to propose and deploy an "
        "electronic Local Government Unit (eLGU) Citizen Services Portal for "
        "the Municipality", S["subject"]))

    body.append(Paragraph("Dear Mayor %s:" % gap(None, 20), S["flush"]))
    body.append(Spacer(1, 11))

    paras = [
        "I respectfully write to convey my intent to propose, deploy and support an "
        "<b>electronic Local Government Unit (eLGU) Citizen Services Portal</b> for the "
        "Municipality of {m}, Province of {p}, and to request the opportunity to present "
        "it to your good office and to the department heads concerned.",

        "The most expensive part of transacting with a local government is not the fee. It "
        "is the trip that need not have been made &mdash; the resident who queues for a "
        "business permit without the barangay clearance the permit requires first, or who "
        "travels to the municipal hall for a document the barangay two streets away "
        "issues. The portal exists to prevent that trip. Every requirement, fee, "
        "processing time and the order in which documents must be obtained is published in "
        "the application, and at every stage of a transaction the resident is told plainly "
        "whose move it is &mdash; the office&rsquo;s or their own.",

        "The system covers both tiers of local government in one application. On the "
        "municipal side it serves the Business Permits and Licensing Office, the Local "
        "Civil Registrar, the Office of the Building Official, the Municipal "
        "Treasurer&rsquo;s Office, the Municipal Social Welfare and Development Office and "
        "the Municipal Health Office, each with its own staff console. On the barangay "
        "side every barangay receives its own console for the certificates it issues, its "
        "board of notices, its blotter under Katarungang Pambarangay and its Record of "
        "Barangay Inhabitants, together with a separate figures&ndash;only view for the "
        "Sangguniang Barangay. The two tiers are kept strictly apart: municipal personnel "
        "cannot read a barangay&rsquo;s records, and no barangay can read another&rsquo;s.",

        "The design follows obligations the law already places on the Municipality: "
        "<b>Republic Act No. 11032</b>, the Ease of Doing Business and Efficient "
        "Government Service Delivery Act, for the publication of the Citizen&rsquo;s "
        "Charter and for a working feedback and complaints mechanism; <b>Republic Act No. "
        "10173</b>, the Data Privacy Act, for a resident&rsquo;s right to see, correct and "
        "have erased what is held about them; <b>Republic Act No. 7160</b>, the Local "
        "Government Code, for the barangay&rsquo;s record of inhabitants and the "
        "Katarungang Pambarangay process; and <b>Republic Act No. 11261</b> for the "
        "First Time Jobseekers Assistance certificate.",

        "I wish to state plainly what the present build does and does not yet do. "
        "Accounts and roles, the workflow of a request, document release, supporting "
        "attachments, appointments and queue numbers, the office reports, the data "
        "privacy rights and the barangay consoles all operate against a real database. "
        "Online payment is implemented end to end &mdash; priced by the server, settled "
        "only on a signed confirmation from the gateway &mdash; but it is at present "
        "connected to a development simulator, and settling real money requires the "
        "Municipality&rsquo;s chosen payment provider. Verification against the "
        "Philippine Identification System is represented in the interface but is not yet "
        "connected to PhilSys itself. The emergency hotlines, the holiday calendar, the "
        "fees, the validity periods and the step&ndash;by&ndash;step document routes "
        "currently carry placeholder values, and these must be replaced with the "
        "Municipality&rsquo;s own Citizen&rsquo;s Charter and verified telephone numbers "
        "before any public launch.",

        "I therefore respectfully request a courtesy meeting on a date convenient to your "
        "office, together with permission to conduct a demonstration for the offices "
        "concerned. The presentation carries no cost and places no obligation on the "
        "Municipality. Should your office find the system suitable, I am prepared to "
        "discuss configuration, the training of personnel, the migration of existing "
        "records and continuing technical support on whatever terms the Municipality "
        "prescribes.",

        "Thank you for your time and for your continued service to the people of {m2}. I "
        "remain at your disposal for any clarification or further information your office "
        "may require.",
    ]

    for p in paras:
        body.append(Paragraph(
            p.format(m=gap(None, 16), p=gap(None, 14), m2=gap(None, 16)),
            S["body"]))

    return body


def signature_block():
    w = 2.9 * inch
    return KeepTogether([
        Spacer(1, 6),
        Paragraph("Very truly yours,", S["flush"]),
        Spacer(1, 30),
        Blank(w, "Signature"),
        Spacer(1, 3),
        Blank(w, "Printed name"),
        Spacer(1, 3),
        Blank(w, "Designation / Company"),
        Spacer(1, 14),
        Rule(CONTENT_W, weight=0.6, color=colors.HexColor("#d6ddea")),
        Spacer(1, 7),
        Paragraph(
            "The ruled fields above are left blank deliberately, to be completed by hand "
            "for the municipality this copy is addressed to.", S["note"]),
    ])


# --------------------------------------------------------------------------- #
# Page 2 — Annex A
# --------------------------------------------------------------------------- #

def two_col_table(left_title, left_items, right_title, right_items):
    """Two independent columns of bullets.

    Each column is a single cell holding all of its own paragraphs, rather than
    a row per bullet: pairing them row by row makes a two-line item on one side
    open a gap on the other, which is the uneven spacing that makes a table
    look unconsidered.
    """
    col = (CONTENT_W - 0.22 * inch) / 2

    def bullets(items):
        return [Paragraph(
            '<font color="#d69e0a">\u2022</font>&nbsp;&nbsp;' + i, S["cell"])
            for i in items]

    rows = [
        [Paragraph(left_title, S["cellhead"]), Paragraph(right_title, S["cellhead"])],
        [bullets(left_items), bullets(right_items)],
    ]
    t = Table(rows, colWidths=[col, col], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, 0), 5.5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5.5),
        ("TOPPADDING", (0, 1), (-1, 1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 3),
        ("BACKGROUND", (0, 1), (-1, 1), CANVAS),
        ("LINEAFTER", (0, 0), (0, -1), 2.4, colors.white),
    ]))
    return t


def stat_strip(pairs):
    col = CONTENT_W / len(pairs)
    row_v = [Paragraph(v, S["stat"]) for v, _ in pairs]
    row_l = [Paragraph(l, S["statlabel"]) for _, l in pairs]
    t = Table([row_v, row_l], colWidths=[col] * len(pairs), hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 0), (-1, -1), CANVAS),
    ]
    for i in range(1, len(pairs)):
        style.append(("LINEBEFORE", (i, 0), (i, -1), 0.7, colors.HexColor("#d6ddea")))
    t.setStyle(TableStyle(style))
    return t


def steps_strip(items):
    """The proposed sequence, as numbered cards across the page."""
    col = (CONTENT_W - 3 * 0.14 * inch) / 4
    num = ParagraphStyle("num", fontName=DISPLAY_BOLD, fontSize=15, leading=17,
                         textColor=GOLD)
    head = ParagraphStyle("sh", fontName=BODY_SEMI, fontSize=8.8, leading=11.6,
                          textColor=NAVY, spaceBefore=3, spaceAfter=2.5)
    desc = ParagraphStyle("sd", fontName=BODY, fontSize=7.8, leading=10.6,
                          textColor=MUTED)
    cells = []
    for i, (title, text) in enumerate(items, start=1):
        cells.append([
            Paragraph(str(i).zfill(2), num),
            Paragraph(title, head),
            Paragraph(text, desc),
        ])
    t = Table([cells], colWidths=[col] * len(items), hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
        ("BACKGROUND", (0, 0), (-1, -1), CANVAS),
    ]
    for i in range(1, len(items)):
        style.append(("LINEBEFORE", (i, 0), (i, -1), 2.4, colors.white))
    t.setStyle(TableStyle(style))
    return t


def annex():
    out = [
        Paragraph("ANNEX A", S["h3"]),
        Paragraph("Scope and present status", S["h2"]),
        Paragraph(
            "Provided for information only. Nothing in this annex is an offer of warranty; "
            "final scope, timelines and terms would be set out in a separate agreement "
            "with the Municipality.", S["fine"]),
        Spacer(1, 13),

        Paragraph("WHAT THE SYSTEM HOLDS", S["h3"]),
        two_col_table(
            "For the resident, on a phone",
            [
                "17 municipal services across 6 offices, each with its fee, "
                "requirements and processing time",
                "Barangay certificates &mdash; clearance, residency, indigency and "
                "others &mdash; from the resident&rsquo;s own barangay",
                "A step&ndash;by&ndash;step route for every document, saying which "
                "prerequisite to obtain first and where",
                "A digital identity card with a verification code a clerk can check, "
                "valid for ninety seconds and single use",
                "Photographed or uploaded requirements, compressed on the phone",
                "Appointments with a real queue number, over the office&rsquo;s own hours",
                "The municipality&rsquo;s emergency hotlines, readable with no signal",
                "Incident reports with photo or video evidence",
                "Feedback and complaints with a reference and a visible deadline",
                "A full export, correction and account closure under the Data Privacy Act",
                "English and Filipino throughout, with three text sizes",
            ],
            "For the Municipality and its barangays",
            [
                "A queue for each office, scoped so staff see only their own department",
                "Assessment, release and the rendering of a signed&ndash;off PDF document",
                "A treasury view of every payment, with the gateway reference on each line",
                "Turnaround reports on two clocks &mdash; the office&rsquo;s and the "
                "resident&rsquo;s &mdash; judged against the Charter&rsquo;s own promise",
                "An administrator&rsquo;s tab for hotlines, holidays, office details and "
                "staff accounts, every edit written to an audit trail",
                "A console per barangay: certificates, notices, blotter and the Record of "
                "Barangay Inhabitants",
                "A figures&ndash;only view for the Sangguniang Barangay &mdash; counts, "
                "never individual residents",
                "Each barangay issues its own clerks and councillors by emailed invitation",
                "8 sectoral and poverty&ndash;reduction registers, administered only by "
                "the office entitled to",
                "Notification of the resident on every change, in the same transaction",
            ],
        ),
        Spacer(1, 16),

        Paragraph("AS CONFIGURED FOR DEMONSTRATION", S["h3"]),
        stat_strip([
            ("6", "municipal<br/>offices"),
            ("17", "municipal<br/>services"),
            ("6", "barangay<br/>certificates"),
            ("8", "sectoral<br/>registers"),
            ("2", "languages,<br/>in full"),
            ("480", "translated<br/>interface strings"),
            ("37", "automated<br/>test suites"),
        ]),

        PageBreak(),

        Paragraph("ANNEX A, CONTINUED", S["h3"]),
        Paragraph("What is working, and what the Municipality must supply", S["h2"]),
        two_col_table(
            "Operating today against a live database",
            [
                "Resident registration, staff accounts and every role boundary",
                "The whole lifecycle of a request, from filing to released document",
                "Attachments, type&ndash;checked by content and virus&ndash;scanned",
                "Appointments, queue numbers and the working&ndash;day calendar",
                "Identity verification at the counter",
                "Office reports, feedback and complaints",
                "Both barangay consoles and the council&rsquo;s view",
                "Data privacy export, correction and account closure",
                "Offline use of a half&ndash;filled form and of the hotlines",
            ],
            "Required from the Municipality before launch",
            [
                "The Citizen&rsquo;s Charter &mdash; the real fees, requirements, "
                "processing times and document routes, which currently hold placeholders",
                "Verified emergency hotline numbers. A number that rings nowhere is "
                "worse than none, and every municipal number shipped is invented",
                "The holiday calendar for the year, national and locally declared",
                "The complete barangay roster, with the incumbent captains and secretaries",
                "A payment gateway account, if fees are to be settled online",
                "The response time the Charter commits to for a complaint",
                "The municipal seal and wordmark",
                "Nominated administrators, and the personnel each office will issue "
                "accounts to",
            ],
        ),
        Spacer(1, 16),

        Paragraph(
            "<b>One municipality, one database.</b> The portal serves a single "
            "municipality from its own instance and its own database. There is no shared "
            "table in which one town&rsquo;s residents could become visible to another "
            "town&rsquo;s personnel, and the instance refuses to start if it is ever "
            "pointed at a database belonging to a different municipality. Residents of "
            "this Municipality are therefore structurally unreachable from anywhere else, "
            "rather than protected by a rule somebody has to remember.", S["fine"]),
        Spacer(1, 20),

        Paragraph("A SEQUENCE THE MUNICIPALITY WOULD CONTROL AT EVERY STEP", S["h3"]),
        steps_strip([
            ("Courtesy meeting",
             "A short briefing for the Mayor&rsquo;s office on what the portal does and "
             "what it would ask of the Municipality."),
            ("Demonstration",
             "A working walk&ndash;through for each office concerned and for one "
             "barangay, on their own questions."),
            ("Configuration",
             "The Citizen&rsquo;s Charter, the verified hotlines, the holiday calendar "
             "and the barangay roster replace every placeholder."),
            ("Pilot, then launch",
             "One office and one barangay first, with training, before the Municipality "
             "decides whether to open it to the public."),
        ]),
        Spacer(1, 13),
        Paragraph(
            "No step commits the Municipality to the next. Nothing is published to "
            "residents until the Municipality is satisfied that what the application says "
            "about its fees, its requirements and its telephone numbers is correct.",
            S["fine"]),
    ]
    return out


# --------------------------------------------------------------------------- #

def build(target=OUT):
    doc = BaseDocTemplate(
        target, pagesize=LETTER,
        leftMargin=MARGIN_X, rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP, bottomMargin=MARGIN_BOT,
        title="Letter of Intent - eLGU Citizen Services Portal",
        author="", subject="Proposal to deploy an eLGU Citizen Services Portal",
        creator="eLGU Citizen Portal",
    )
    frame = Frame(MARGIN_X, MARGIN_BOT, CONTENT_W,
                  PAGE_H - MARGIN_TOP - MARGIN_BOT, id="body",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="letter", frames=[frame], onPage=page_furniture),
    ])

    story = []
    story += letterhead()
    story.append(sender_block())
    story.append(Spacer(1, 11))
    story += addressee_block()
    story.append(Spacer(1, 17))
    story += letter_body()
    story.append(signature_block())
    story.append(PageBreak())
    story += annex()

    doc.build(story)
    return doc.page


if __name__ == "__main__":
    import tempfile

    # Two passes: the first only to learn how many pages there are, so the
    # footer can say "Page 2 of 3" rather than guessing at a total.
    with tempfile.NamedTemporaryFile(suffix=".pdf") as probe:
        TOTAL_PAGES = build(probe.name)
    build()
    print("wrote %s (%d bytes, %d pages)"
          % (OUT, os.path.getsize(OUT), TOTAL_PAGES))
