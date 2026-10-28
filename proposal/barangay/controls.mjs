/**
 * Every control in the eBarangay Portal, grouped the way a reader meets it.
 *
 * This is the same shape as `proposal/overview/controls.mjs` and deliberately
 * not an import of it. The two products share a codebase; they do not share a
 * control list, and generating this one by filtering that one would mean a
 * screen added to the hall silently appearing in a barangay's proposal — the
 * document that tells somebody what they are buying.
 *
 * `icon` is the lucide name as the app imports it. The builder turns it into
 * real SVG from lucide-react's own icon data, so a picture here is the picture
 * on the button rather than a lookalike somebody drew. Where a control carries
 * no icon in the app, `icon` is null and a neutral dot is drawn instead.
 */

export const PORTALS = [
  {
    id: 'resident',
    name: 'Resident app',
    tone: 'navy',
    who: 'Anybody living in the barangay. They register themselves; nobody at the hall types them in.',
    shape: 'A mobile-first app that installs to the home screen. Three items in the bottom bar — the municipal portal’s two extra tabs are the hall’s, and a barangay deployment does not pretend to have them.',
    groups: [
      {
        name: 'The bottom bar',
        note: 'Three destinations, always on screen. There is one government here, so there is no tier to choose and no switch to get wrong.',
        items: [
          { icon: 'house', label: 'Home', what: 'The dashboard: digital ID, the emergency button, and the one door into the barangay.' },
          { icon: 'layout-grid', label: 'Services', what: 'The barangay hub — notices first, then what the barangay issues, then what you have asked for.' },
          { icon: 'user-round', label: 'Profile', what: 'The ID, data rights, help, language and text size.' },
        ],
      },
      {
        name: 'Home',
        note: 'The emergency button is the only red control on the screen. A resident who needs it is not reading — they are looking for the one thing that is obviously it.',
        items: [
          { icon: 'bell', label: 'Notifications', what: 'Everything the barangay has told this resident, with an unread count on the bell.' },
          { icon: 'shield-alert', label: 'Emergency hotlines', what: 'Opens the numbers. It never dials by itself — an app that places a call on a tap is one that rings the fire brigade from a pocket.' },
          { icon: 'building', label: 'Your barangay', what: 'The single door. It names the barangay rather than offering a choice there is only one answer to.' },
          { icon: 'chevron-right', label: 'Digital ID card', what: 'Tap the card to open the full ID.' },
          { icon: 'share', label: 'Install this app', what: 'A dismissible banner, shown only where the browser says installing is actually possible.' },
        ],
      },
      {
        name: 'The barangay hub',
        note: 'The notice board sits above the certificates: what the barangay is telling you comes before what you can ask it for.',
        items: [
          { icon: 'megaphone', label: 'Notices', what: 'The board outside the hall, on the phone. Urgent ones carry a word and an icon in amber — never colour alone.' },
          { icon: 'chevron-right', label: 'Request a certificate', what: 'One purpose field, because that is what a barangay certificate actually asks for.' },
          { icon: 'file-clock', label: 'My barangay requests', what: 'Everything asked for, with where each one has got to.' },
          { icon: 'clock', label: 'Valid until', what: 'Stamped when the barangay marks it ready, so the app says what the paper says. A lapsed one says so in words and asks for a fresh one.' },
          { icon: 'building', label: 'The hall', what: 'Address, hours, the captain, the secretary and a number to ring — repeated on the "ready" row, so nobody travels to a closed hall.' },
          { icon: 'download', label: 'Download certificate', what: 'Available once released — the barangay takes its fee at the hall on collection.' },
        ],
      },
      {
        name: 'The digital ID',
        note: 'There is no national-ID integration and the app does not imply one. What proves this card is its own code, which the barangay checks.',
        items: [
          { icon: 'shield-check', label: 'The card face', what: 'Name, barangay, date of birth and the portrait. It is headed eBarangay Digital ID, not somebody else’s system.' },
          { icon: 'scan-line', label: 'Show verification code', what: 'Lives 90 seconds and is spent the first time a clerk checks it, so a screenshot is stale before it reaches a window.' },
          { icon: 'refresh-cw', label: 'New code', what: 'Issuing one retires any still outstanding, so a code left open in another tab is not a second key.' },
          { icon: 'image-up', label: 'Take a selfie / choose a photo', what: 'Cropped square and scaled before upload. Only the resident can ever read it back.' },
          { icon: 'trash-2', label: 'Remove photo', what: 'Takes the portrait off the ID.' },
          { icon: 'phone', label: 'Emergency numbers on the ID', what: 'Cached on the device, because somebody needing one is very often somewhere with no signal.' },
        ],
      },
      {
        name: 'Profile and the rights screens',
        note: 'Reached from Profile rather than the bottom bar — these are screens you go looking for, not ones you pass through.',
        items: [
          { icon: 'id-card', label: 'Digital ID & verification code', what: 'Opens the full ID.' },
          { icon: 'database-backup', label: 'My data', what: 'Export, correct and close — the three RA 10173 rights as buttons.' },
          { icon: 'file-text', label: 'Privacy notice', what: 'What is held, and who the Data Protection Officer is.' },
          { icon: 'circle-help', label: 'Help & support', what: 'How to reach the barangay.' },
          { icon: 'languages', label: 'English / Filipino', what: 'Switches the whole app, including dates and durations.' },
          { icon: 'a-large-small', label: 'Text size', what: 'Normal, Large, Largest. Each option renders at the size it selects — which matters in a barangay with seniors in it.' },
          { icon: 'bell', label: 'Push notifications', what: 'Only rendered where push is actually configured — a toggle that cannot work is worse than none.' },
          { icon: 'share', label: 'Install the app', what: 'Never dismissed here, and confirms "Installed" once it is.' },
          { icon: 'log-out', label: 'Sign out', what: 'Clears the session on this device.' },
        ],
      },
      {
        name: 'My data — the three rights',
        note: 'Erasure is the right the system cannot grant in full, and it says so before anything happens rather than afterwards.',
        items: [
          { icon: 'download', label: 'Export my data', what: 'One file: the profile, every certificate request and its history, attachments listed, notifications, ID checks and the devices set to notify them.' },
          { icon: 'square-pen', label: 'Correct my details', what: 'Address and phone — facts the resident knows better than the office. A name is an identity claim and goes through the Civil Registrar; the screen says so rather than leaving a dead field.' },
          { icon: 'alert-triangle', label: 'See what closing would do', what: 'Names what would be deleted and what would be kept, with the reason, before anything happens.' },
          { icon: 'user-x', label: 'Close my account', what: 'Closes the sign-in, erases contact details and the portrait, and releases the email address.' },
        ],
      },
    ],
  },

  {
    id: 'barangay',
    name: 'Barangay console',
    tone: 'green',
    who: 'The Punong Barangay or the Secretary as administrator, and the barangay’s own clerks.',
    shape: 'A desk-width console. Which tabs render depends on the account — and the server refuses the rest regardless. The hidden tab is the courtesy; the refusal is the control.',
    groups: [
      {
        name: 'The tabs',
        note: 'The first five are both roles’. The last three are the administrator’s: what the barangay charges, who works there, and what it has done.',
        items: [
          { icon: 'inbox', label: 'Requests', what: 'The certificate queue: pending, processing, ready, released, rejected.' },
          { icon: 'megaphone', label: 'Notices', what: 'The board of notices residents see on their phones.' },
          { icon: 'book-text', label: 'Blotter', what: 'Katarungang Pambarangay: the book a dispute is written in, and the summons that call both sides.' },
          { icon: 'house', label: 'Households', what: 'The Record of Barangay Inhabitants — who lives where, and the counts the barangay plans from.' },
          { icon: 'landmark', label: 'The hall', what: 'Captain, secretary, address, hours, phone, seal and the two signatures. Both roles read; only the administrator writes.' },
          { icon: 'badge-check', label: 'Summary', what: 'Administrator only. What the office issued and collected.' },
          { icon: 'philippine-peso', label: 'Certificates', what: 'Administrator only. What the barangay issues and what it charges for each.' },
          { icon: 'users', label: 'Officers', what: 'Administrator only. Issue the barangay’s own clerks and kagawads — but never another administrator.' },
        ],
      },
      {
        name: 'Moving a certificate',
        note: 'The order is enforced on the server, not merely rendered: "ready" means come and collect it, and a resident told that too early makes a wasted trip.',
        items: [
          { icon: 'clock', label: 'Processing', what: 'The secretary has taken the certificate up. The resident is told in the same transaction.' },
          { icon: 'check', label: 'Ready', what: 'Prepared and dated. This is where the validity period is stamped — so a resident who collects three weeks later holds a certificate three weeks into its life, exactly as the paper says.' },
          { icon: 'badge-check', label: 'Released', what: 'Handed over, fee taken at the hall. This is where the PDF is written, with the seal and both signatures.' },
          { icon: 'x-circle', label: 'Reject', what: 'Requires a reason the resident can read.' },
          { icon: 'download', label: 'Download certificate', what: 'The stored PDF — frozen at issue, so an election never reprints it over somebody else’s name.' },
          { icon: 'ban', label: 'Withdraw', what: 'Administrator only, and it needs a reason. Both roles hand a certificate over; taking the barangay’s word back is a decision.' },
          { icon: 'refresh-cw', label: 'Reissue', what: 'Administrator only. Mints a replacement carrying the same valid-until as the one it replaces — correcting a mistake is not renewing.' },
        ],
      },
      {
        name: 'The board of notices',
        note: 'Everything else in this console refuses to be readable; this one inverts all of it. A notice is worth nothing until the people it concerns have seen it.',
        items: [
          { icon: 'plus', label: 'Post a notice', what: 'Title, body, optional expiry. Appears on every resident’s phone, and comes off the board by itself on the day it lapses.' },
          { icon: 'triangle-alert', label: 'Mark urgent', what: 'Administrator only. Rings every resident of the barangay, written in the same transaction as the notice.' },
          { icon: 'users', label: 'Reached N residents', what: 'The confirmation waits to be dismissed — the one screen stating the blast radius of what somebody just did should not vanish on a timer.' },
          { icon: 'square-pen', label: 'Edit', what: 'Allowed, and the board then says "edited". Urgency is not editable: the notification went or it did not.' },
          { icon: 'trash-2', label: 'Take down', what: 'Administrator only. Keeps the row in the archive — what the barangay said last month is a thing somebody asks about.' },
        ],
      },
      {
        name: 'Blotter and summons',
        note: 'The most defamatory data a barangay holds. No resident route reads it, it is not in the privacy export, and the council cannot see it at all.',
        items: [
          { icon: 'plus', label: 'Record a matter', what: 'Complainant, respondent, contacts, nature, narrative — all free text, never linked to accounts, exactly as the paper book does it.' },
          { icon: 'search', label: 'Search the book', what: 'Searching names, bounded to this barangay.' },
          { icon: 'calendar-days', label: 'Issue a summons', what: 'Administrator only — it goes out over the Punong Barangay’s name and compels two people to appear on a date.' },
          { icon: 'send', label: 'Send the reminder', what: 'Carries who is asking, when, where and the reference — never the narrative and never the other party’s name, because a lock screen is not private. It says in those words that it is not service.' },
          { icon: 'check', label: 'Record service', what: 'Kept apart from the outcome: a respondent who never received the summons did not fail to appear.' },
          { icon: 'book-text', label: 'Record what happened', what: 'Administrator only. One pending calling at a time, because two open summons are two dates and only one is right.' },
          { icon: 'x-circle', label: 'Close the matter', what: 'Final, cancels any outstanding hearing, and must say how it ended.' },
        ],
      },
      {
        name: 'The register of inhabitants',
        note: 'The Local Government Code makes the Secretary keep this, and it is what a barangay actually plans from: who to feed, who to evacuate, how many seniors live on which purok.',
        items: [
          { icon: 'users', label: 'The figures', what: 'Population, households, age bands, per purok — computed over the active register on every read, so they are never stale.' },
          { icon: 'alert-triangle', label: 'Without a date of birth', what: 'Reported rather than hidden: counted in the population and in no age band. A feeding programme planned off a silently short count is the harm.' },
          { icon: 'plus', label: 'Add a household', what: 'The head becomes a member automatically — a register whose head is only a column cannot count its own population.' },
          { icon: 'user-round', label: 'Add a member', what: 'Free text, never linked to an account. A link would hand a clerk a view onto every account in the municipality.' },
          { icon: 'square-pen', label: 'Edit a member', what: 'PWD and 4Ps ticks are labelled "(noted)" so a clerk’s checkbox can never read as an entitlement at a counter.' },
          { icon: 'user-x', label: 'Take out of the register', what: 'Administrator only, and needs a reason. Nothing is deleted — next year’s figures have to be comparable with this year’s.' },
        ],
      },
      {
        name: 'The hall, and the barangay’s own accounts',
        note: 'The barangay issues its own clerks and councillors, because nobody else knows who holds a barangay office this term.',
        items: [
          { icon: 'square-pen', label: 'Correct the hall’s details', what: 'Captain, secretary, address, hours, phone, email — the facts that change at every barangay election, corrected here rather than by a developer.' },
          { icon: 'image-up', label: 'Upload seal and signatures', what: 'The barangay’s seal and the two officials’ signatures, drawn onto every certificate from then on. There is no third slot.' },
          { icon: 'users', label: 'Issue an officer or kagawad', what: 'Starts with an unusable password; the holder chooses their own from an emailed link, and the screen says whether it actually sent.' },
          { icon: 'user-x', label: 'Revoke', what: 'Spends any outstanding invitation, because a live reset link is a way back in. The administrator’s own row is out of reach here, which is what stops a captain and a secretary revoking each other.' },
        ],
      },
    ],
  },

  {
    id: 'kagawad',
    name: 'Council view',
    tone: 'amber',
    who: 'A member of the Sangguniang Barangay.',
    shape: 'Its own sign-in with its own gate, not a clerk with fewer tabs. Putting the council on the clerk’s gate and carving it back out screen by screen would leave the blotter one forgotten check away from a councillor.',
    groups: [
      {
        name: 'What a kagawad sees',
        note: 'The figures come from the same code as the Secretary’s own screen, so the council and the clerk never quote different population numbers at each other.',
        items: [
          { icon: 'badge-check', label: 'Summary', what: 'What the office issued and collected.' },
          { icon: 'users', label: 'Register figures', what: 'Population, age bands, households per purok — counts only, never a name.' },
          { icon: 'megaphone', label: 'The notice board', what: 'Exactly as residents see it.' },
        ],
      },
      {
        name: 'What is withheld, and why',
        note: 'Read-only, and conservative in the right direction: widening this later is one screen; narrowing it after seven people have been using it is not.',
        items: [
          { icon: 'ban', label: 'No certificate queue', what: 'Individual residents and what they asked the barangay for.' },
          { icon: 'ban', label: 'No household names', what: 'The register as people rather than as counts.' },
          { icon: 'ban', label: 'No blotter, entirely', what: 'Handing seven elected politicians a searchable book of accusations against their own constituents is a political weapon, and nothing about holding the office requires it.' },
          { icon: 'ban', label: 'No writes at all', what: 'A notice goes out over the barangay’s name, so posting stays with the captain and the clerk. A council seat is not a megaphone.' },
        ],
      },
    ],
  },

  {
    id: 'public',
    name: 'Public certificate check',
    tone: 'gold',
    who: 'Anybody holding a printout: a bank, an employer, a school, a clerk at the municipal hall. No account.',
    shape: 'Every certificate carries a QR. Scanning it opens one page that says what the barangay actually recorded — no app to install, no login, nothing to set up at the other end.',
    groups: [
      {
        name: 'The check',
        note: 'A check that needs a login is a check that does not happen. Nothing is disclosed that the holder of the paper does not already have in their hand.',
        items: [
          { icon: 'scan-line', label: 'Scan or type the code', what: 'The QR carries a link, not a bare code — every phone knows what to do with a URL and none of them know what to do with sixteen loose characters.' },
          { icon: 'check-circle-2', label: 'Valid', what: 'What it is, the reference, who holds it, when it was issued, what it is valid until, and the live status.' },
          { icon: 'clock', label: 'Lapsed', what: 'Amber, and in words. A real certificate that needs replacing, not a fake one — a counter acts differently on each.' },
          { icon: 'ban', label: 'Withdrawn', what: 'Red, and it says whether a replacement exists: the difference between "do not accept this" and "do not accept this, ask them for the current one".' },
          { icon: 'x-circle', label: 'Not found', what: 'A typo or a forgery. The codes are long and random, so the list cannot be walked.' },
          { icon: 'alert-triangle', label: 'Checked N times', what: 'The only trace a photocopy leaves, shown to the person deciding whether to accept the paper — they are the one who can act on it.' },
        ],
      },
    ],
  },
]
