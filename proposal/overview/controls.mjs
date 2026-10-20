/**
 * Every control in the portal, grouped the way a reader meets it.
 *
 * `icon` is the lucide name as the app imports it. The builder turns it into
 * real SVG from lucide-react's own icon data, so a picture in the overview is
 * the picture on the button rather than a lookalike somebody drew.
 *
 * Where a control carries no icon in the app — a plain text button, a form
 * field — `icon` is null and the builder renders a neutral dot. Inventing a
 * logo for it would teach a reader to look for something that is not there.
 */

export const PORTALS = [
  {
    id: 'resident',
    name: 'Resident app',
    tone: 'navy',
    who: 'Any resident of the municipality. They register themselves.',
    shape: 'A mobile-first progressive web app. Five items in the bottom bar; everything else is reached from them.',
    groups: [
      {
        name: 'The bottom bar',
        note: 'Five destinations, always on screen. Both tiers of government sit under one Services item — a second one would be a second place to make the same choice.',
        items: [
          { icon: 'house', label: 'Home', what: 'The dashboard: digital ID, the emergency button, the two tier buttons, recent requests.' },
          { icon: 'layout-grid', label: 'Services', what: 'The catalogue — municipal offices and barangay certificates, with search.' },
          { icon: 'file-clock', label: 'Requests', what: 'Everything filed, plus drafts not yet submitted.' },
          { icon: 'calendar-clock', label: 'Appointments', what: 'Booked visits and their queue numbers.' },
          { icon: 'user-round', label: 'Profile', what: 'The ID, complaints, data rights, help, language and text size.' },
        ],
      },
      {
        name: 'Home',
        note: 'The emergency button is the only red control on the screen, and the two tier buttons are the largest. Nothing else competes with them.',
        items: [
          { icon: 'bell', label: 'Notifications', what: 'Opens the notification list, with an unread count on the bell.' },
          { icon: 'shield-alert', label: 'Emergency hotlines', what: 'Opens the numbers. It never dials by itself — an app that places a call on a tap is one that rings the fire brigade from a pocket.' },
          { icon: 'landmark', label: 'Municipal', what: '17 services across the hall’s 6 offices.' },
          { icon: 'building', label: 'Barangay', what: 'The resident’s own barangay: notices first, then certificates.' },
          { icon: 'chevron-right', label: 'Digital ID card', what: 'Tap the card to open the full ID.' },
          { icon: 'share', label: 'Install this app', what: 'A dismissible banner, shown only where the browser says installing is possible.' },
        ],
      },
      {
        name: 'Services and the route to a document',
        note: 'Search runs on the device against the cached catalogue, so it is instant and works on one bar of signal.',
        items: [
          { icon: 'search', label: 'Search', what: 'Matches what residents actually type — "sari-sari store", "amilyar", "ayuda" — in both languages.' },
          { icon: 'x', label: 'Clear search', what: 'Restores the office tiles.' },
          { icon: 'landmark', label: 'Tier switch — municipal', what: 'Changes tier without walking back to the dashboard.' },
          { icon: 'building', label: 'Tier switch — barangay', what: 'The same pair as the dashboard, so the tier you are in is always on screen.' },
          { icon: 'circle-help', label: 'How to get this', what: 'Opens the ordered, bilingual route to the document.' },
          { icon: 'arrow-right', label: 'A step that is itself a document', what: 'Becomes the next tap, opening that document’s own route. Chains go four deep.' },
          { icon: 'phone', label: 'Ring the office', what: 'The guide ends with the number, not a disclaimer: "confirm before you travel" is useless without it.' },
        ],
      },
      {
        name: 'Filing a request',
        note: 'Fields are generated from the catalogue, so a new service needs no new screen.',
        items: [
          { icon: 'clipboard-list', label: 'Requirements checklist', what: 'What to bring, shown before the form.' },
          { icon: 'calendar-clock', label: 'If you apply today', what: 'A working-day estimate over the municipality’s own holiday calendar.' },
          { icon: 'check', label: 'Saved', what: 'The draft reached the server.' },
          { icon: 'cloud-off', label: 'Saved on this device', what: 'Written to the phone on every keystroke; the server copy follows, debounced.' },
          { icon: 'trash-2', label: 'Discard draft', what: 'Throws away the resumed draft.' },
          { icon: 'send', label: 'Submit', what: 'Validated in the browser and again on the server.' },
          { icon: 'cloud-off', label: 'Save and send when online', what: 'Offline, it queues and appears in the list at once; the server later records when it was actually filled in.' },
          { icon: 'paperclip', label: 'Attach the files now', what: 'Offered on success where the service has requirements — the office cannot act until they are in.' },
        ],
      },
      {
        name: 'A request, open',
        note: 'Every workflow step says whose move it is in words, never by colour alone.',
        items: [
          { icon: 'camera', label: 'Take photo', what: 'Hands the job to the phone’s own camera, which focuses, uses the flash and applies the phone’s processing.' },
          { icon: 'paperclip', label: 'Attach file', what: 'A PDF or picture already on the device. 10 MB each, 10 per request, type read from the bytes.' },
          { icon: 'trash-2', label: 'Remove attachment', what: 'Takes a file back off the request.' },
          { icon: 'wallet', label: 'Pay now', what: 'Opens payment once the office has assessed the fee.' },
          { icon: 'download', label: 'Download document', what: 'The released PDF, with seal, signatures and a verification QR.' },
          { icon: 'receipt-text', label: 'Download receipt', what: 'The electronic official receipt for a settled payment.' },
          { icon: 'calendar-clock', label: 'Book a visit', what: 'An appointment about this request, rather than starting again.' },
          { icon: 'star', label: 'Rate this service', what: 'Asked once, when the office has finished — including on a rejection.' },
          { icon: 'file-edit', label: 'Continue this draft', what: 'Reopens a half-filled form from the Drafts tab.' },
        ],
      },
      {
        name: 'Paying',
        note: 'Nothing the browser sends moves a peso. The server prices the intent and only a signed callback settles it.',
        items: [
          { icon: 'chevron-right', label: 'Choose a provider', what: 'Hands off to the gateway.' },
          { icon: 'shield-check', label: 'Confirm and pay', what: 'Creates an intent for an amount the server read off the assessment.' },
          { icon: 'loader', label: 'Waiting for the gateway', what: 'Polls the server rather than trusting its own return — close the tab and you are still paid up.' },
          { icon: 'download', label: 'Get the receipt', what: 'Written in the same transaction that settled the payment.' },
        ],
      },
      {
        name: 'The barangay hub',
        note: 'The notice board sits above the certificates: what the barangay is telling you comes before what you can ask it for.',
        items: [
          { icon: 'megaphone', label: 'Notices', what: 'The board. Urgent ones carry a word and an icon in amber — never colour alone.' },
          { icon: 'chevron-right', label: 'Request a certificate', what: 'One purpose field, because that is what a barangay certificate actually asks.' },
          { icon: 'clock', label: 'Valid until', what: 'Stamped when the barangay marks it ready. A lapsed one says so in words and asks you to request a fresh one.' },
          { icon: 'building', label: 'The hall', what: 'Address, hours and phone on the "ready" row and in the notification, so you know before you travel.' },
          { icon: 'download', label: 'Download certificate', what: 'Available once released — the barangay takes its fee at the hall on collection.' },
        ],
      },
      {
        name: 'Appointments',
        note: 'A day the hall is shut cannot be booked; capacity is enforced under a lock.',
        items: [
          { icon: 'plus', label: 'Book an appointment', what: 'Office, service, day, time — optionally about a request the office already holds.' },
          { icon: 'calendar-days', label: 'Pick a day', what: 'Weekends and declared holidays are closed, read from the same calendar as every ready date.' },
          { icon: 'clock-3', label: 'Pick a time', what: 'A full or past slot is greyed, not hidden, so you can see that 8:30 has gone.' },
          { icon: 'check-circle-2', label: 'Confirm', what: 'Returns a queue number drawn from a counter, so a cancellation frees the slot but not the number.' },
          { icon: 'map-pin', label: 'Where to go', what: 'The office this booking is with.' },
          { icon: 'x', label: 'Cancel', what: 'Asks once, then frees the slot for somebody else.' },
        ],
      },
      {
        name: 'The digital ID',
        note: 'There is no national-ID integration and the app no longer implies one. What proves this card is its own code.',
        items: [
          { icon: 'shield-check', label: 'The card face', what: 'Name, address, date of birth and the entitlements live on the record right now. A lapsed one is dropped, so it cannot read as current at a counter.' },
          { icon: 'scan-line', label: 'Show verification code', what: 'Lives 90 seconds and is consumed the first time a clerk checks it. A screenshot is stale before it reaches a window.' },
          { icon: 'refresh-cw', label: 'New code', what: 'Issuing one retires any still outstanding, so a code left open in another tab is not a second key.' },
          { icon: 'image-up', label: 'Take a selfie / choose a photo', what: 'Cropped square and scaled before upload. Only the resident can ever read it back.' },
          { icon: 'trash-2', label: 'Remove photo', what: 'Takes the portrait off the ID.' },
          { icon: 'phone', label: 'Emergency numbers on the ID', what: 'Cached on the device, because somebody needing one is very often somewhere with no signal.' },
        ],
      },
      {
        name: 'Emergency and reporting',
        note: 'Reporting sits under the hotlines, never above. A resident watching a fire should be dialling.',
        items: [
          { icon: 'phone', label: 'Call a hotline', what: 'Municipal numbers first, nationwide below, so you can see what still answers if the municipal line is down.' },
          { icon: 'triangle-alert', label: 'Report an incident', what: 'A flooded road, a downed line, uncollected rubbish. The screen says twice that nobody is dispatched by this.' },
          { icon: 'camera', label: 'Take photo', what: 'Evidence from the phone’s own camera.' },
          { icon: 'video', label: 'Record video', what: 'Streamed to disk rather than held in memory, so one upload cannot take the server down.' },
          { icon: 'send', label: 'Send report', what: 'Returns a reference. Reports land with the administrator, because an incident is not any one office’s work.' },
        ],
      },
      {
        name: 'Profile and the rights screens',
        note: 'Reached from Profile rather than the bottom bar — these are screens you go looking for, not ones you pass through.',
        items: [
          { icon: 'id-card', label: 'Digital ID & verification code', what: 'Opens the full ID.' },
          { icon: 'message-square-warning', label: 'Complaints', what: 'File one against a named office under RA 11032, with a visible deadline in working days.' },
          { icon: 'database-backup', label: 'My data', what: 'Export, correct and close — the three RA 10173 rights as buttons.' },
          { icon: 'file-text', label: 'Privacy notice', what: 'What is held, and who the Data Protection Officer is.' },
          { icon: 'circle-help', label: 'Help & support', what: 'Office address, hours, phone and email.' },
          { icon: 'languages', label: 'English / Filipino', what: 'Switches the whole app, including dates and durations.' },
          { icon: 'a-large-small', label: 'Text size', what: 'Normal, Large, Largest. Each option renders at the size it selects.' },
          { icon: 'bell', label: 'Push notifications', what: 'Only rendered where push is actually configured — a toggle that cannot work is worse than none.' },
          { icon: 'share', label: 'Install the app', what: 'Never dismissed here, and confirms "Installed" once it is.' },
          { icon: 'log-out', label: 'Sign out', what: 'Clears the session on this device.' },
        ],
      },
      {
        name: 'My data — the three rights',
        note: 'Erasure is the right the app cannot grant in full, and it says so first.',
        items: [
          { icon: 'download', label: 'Export my data', what: 'One JSON file: profile, every request and its history, attachments listed, drafts, appointments, complaints, feedback, notifications, programme records, ID checks and devices.' },
          { icon: 'square-pen', label: 'Correct my details', what: 'Address and phone — facts the resident knows better. A name goes through the Civil Registrar, and the screen says so rather than leaving a dead field.' },
          { icon: 'alert-triangle', label: 'See what closing would do', what: 'Names what would be deleted and what would be kept, with the reason, before anything happens.' },
          { icon: 'user-x', label: 'Close my account', what: 'Closes the sign-in, erases contact details and the portrait, cancels upcoming appointments and releases the email address.' },
        ],
      },
    ],
  },

  {
    id: 'staff',
    name: 'Municipal staff console',
    tone: 'slate',
    who: 'Issued accounts for the hall’s 6 offices. Three tabs are the administrator’s alone.',
    shape: 'A desk-width console. Which tabs render depends on the account — and the API refuses the rest regardless. The hidden tab is the courtesy; the refusal is the control.',
    groups: [
      {
        name: 'The tabs',
        note: 'Queue, Today, Verify ID, Complaints and Reports are every officer’s. Payments is the treasury’s. Incidents, Accounts and Municipality are the administrator’s.',
        items: [
          { icon: 'inbox', label: 'Queue', what: 'This office’s requests, filtered by status. Scoped to the departments the account serves — naming another is a refusal, not an empty list.' },
          { icon: 'calendar-clock', label: 'Today', what: 'The counter’s day: one office, in time order, queue number, who is expected and what for — and nothing else about them.' },
          { icon: 'scan-line', label: 'Verify ID', what: 'Check a resident’s ID code. Opens pre-filled and runs itself when the clerk arrived by scanning.' },
          { icon: 'message-square-warning', label: 'Complaints', what: 'Oldest-open-first. Anything past its deadline says "Overdue" in words, not only in colour.' },
          { icon: 'bar-chart-3', label: 'Reports', what: 'What this office did, and whether it was on time.' },
          { icon: 'wallet', label: 'Payments', what: 'Treasury and administrator only. Reconciliation, with the gateway reference on every line.' },
          { icon: 'shield-alert', label: 'Incidents', what: 'Administrator only. Open-first then oldest-first, so the list reads as the order to work it.' },
          { icon: 'users', label: 'Accounts', what: 'Administrator only. Issue, deactivate, reactivate and re-invite staff.' },
          { icon: 'landmark', label: 'Municipality', what: 'Administrator only. The hall’s own data, in seven panels.' },
        ],
      },
      {
        name: 'Working a request',
        note: 'Workflow progression belongs to the server. The console never sets the step itself.',
        items: [
          { icon: 'philippine-peso', label: 'Assess', what: 'Sets the fee. This figure, not the browser’s, is what the payment is later priced from.' },
          { icon: 'arrow-right', label: 'Advance', what: 'Moves the request one step and notifies the resident in the same transaction.' },
          { icon: 'x-circle', label: 'Reject', what: 'Requires a reason the resident can read.' },
          { icon: 'badge-check', label: 'Release', what: 'The final advance. Renders and stores the PDF with the seal, both signature blocks and the verification QR.' },
          { icon: 'download', label: 'Download attachment', what: 'Served as a download only, never inline.' },
          { icon: 'list-ordered', label: 'History', what: 'Every move, who made it and when.' },
          { icon: 'heart-handshake', label: 'Programme records', what: 'Grant or revoke a sectoral or poverty record — CSWDO and admin only, and reached through a request so no endpoint lists residents.' },
          { icon: 'ban', label: 'Withdraw this document', what: 'Final, and needs a reason. Only the office that released it; another office gets "not found".' },
          { icon: 'refresh-cw', label: 'Reissue', what: 'Mints a new document with a new code, printed "REISSUED COPY". Reachable only from a withdrawal, and only while nothing has replaced it.' },
        ],
      },
      {
        name: 'Today, Verify ID and Complaints',
        note: 'What happened at a window should not be quietly rewritten later in the day, so the closing actions are final.',
        items: [
          { icon: 'check', label: 'Arrived', what: 'The resident has presented themselves.' },
          { icon: 'check-circle-2', label: 'Served', what: 'Closes the visit. Final.' },
          { icon: 'x-circle', label: 'No show', what: 'Closes the visit. Final.' },
          { icon: 'scan-line', label: 'Check this code', what: 'Returns a face, a name, where they live and the live entitlements — no email, no phone, no request history.' },
          { icon: 'alert-circle', label: 'Unknown / expired / used', what: 'Three answers, not one failure, because they mean different things at a counter.' },
          { icon: 'send', label: 'Reply to a complaint', what: 'Accepted once. The server refuses a second — an office rewriting what it told a resident is what the mechanism exists to prevent.' },
        ],
      },
      {
        name: 'Reports and Payments',
        note: 'Two turnaround clocks, because either alone lies. The gap between them is itself the finding.',
        items: [
          { icon: 'bar-chart-3', label: 'Office days', what: 'Median and p90 while the office actually held the request.' },
          { icon: 'clock', label: 'Resident days', what: 'Submission to release regardless. A wide gap is a payment step residents struggle with, not a slow office.' },
          { icon: 'check-circle-2', label: 'On time', what: 'Judged against the catalogue’s own maximum — the same promise the resident was quoted.' },
          { icon: 'download', label: 'Download CSV', what: 'The same figures, for a spreadsheet.' },
          { icon: 'wallet', label: 'Settled in this period', what: 'Leads with the total; every line carries the gateway reference.' },
          { icon: 'alert-triangle', label: 'Needs a person', what: 'Anything that did not end cleanly, deliberately not limited to the period — a payment stuck since last week is what reconciliation exists to surface.' },
          { icon: 'receipt-text', label: 'Official receipt', what: 'Opens the eOR for a settled line.' },
          { icon: 'file-clock', label: 'Fee changes', what: 'A read of the audit trail, with the old figure beside the new one.' },
        ],
      },
      {
        name: 'Municipality — the seven panels',
        note: 'Every write here is audited in the same transaction as the change, with the row as it was and the actor’s name beside their id.',
        items: [
          { icon: 'phone', label: 'Emergency hotlines', what: 'Add, edit, reorder, remove. The panel asks whoever is editing to ring the number before saving.' },
          { icon: 'calendar-days', label: 'Holiday calendar', what: 'Declaring one moves dates already promised — intended, because the hall really is shut.' },
          { icon: 'building-2', label: 'Office details', what: 'Address, hours, phone, email, and who signs for that office — plus the hall’s own signatory above them.' },
          { icon: 'receipt-text', label: 'Official receipt', what: 'What prints on an eOR: address, TIN, treasurer, series prefix, seal and signature. The municipality’s name is not editable — that belongs to the register.' },
          { icon: 'file-text', label: 'Barangay certificates', what: 'The shared catalogue every barangay issues, including the attestation text, whose placeholders are checked at the save rather than at the print.' },
          { icon: 'scan-line', label: 'Document checks', what: 'How often each document has been verified. A prompt to look, never a finding — a busy permit and a copied one are identical from here.' },
          { icon: 'alert-triangle', label: 'What changed', what: 'The audit trail, showing only the fields that actually moved.' },
          { icon: 'image-up', label: 'Upload seal / signature', what: 'PNG and JPEG only by the leading bytes, virus-scanned, 2 MB — and a PNG must actually decode, because one damaged file used to take the server down at release.' },
        ],
      },
    ],
  },

  {
    id: 'barangay',
    name: 'Barangay console',
    tone: 'green',
    who: 'The barangay’s own administrator (captain or secretary) and its clerk.',
    shape: 'A separate shell, not a tab in the municipal one. A barangay secretary does not work a municipal queue and has no business seeing one — separate shells mean there is no filter to get wrong.',
    groups: [
      {
        name: 'The tabs',
        note: 'The first five are both roles’. The last three are the administrator’s: what the barangay charges, who works there, and what it has done.',
        items: [
          { icon: 'inbox', label: 'Requests', what: 'The certificate queue: pending, processing, ready, released, rejected.' },
          { icon: 'megaphone', label: 'Notices', what: 'The board of notices residents see in their barangay hub.' },
          { icon: 'book-text', label: 'Blotter', what: 'Katarungang Pambarangay: the book a dispute is written in, and the summons that call both sides.' },
          { icon: 'house', label: 'Households', what: 'The Record of Barangay Inhabitants — who lives where, and the counts the barangay plans from.' },
          { icon: 'landmark', label: 'The hall', what: 'Captain, secretary, address, hours, phone, seal and the two signatures. Both roles read; only the administrator writes.' },
          { icon: 'badge-check', label: 'Summary', what: 'Administrator only. What the office issued and collected.' },
          { icon: 'philippine-peso', label: 'Certificates', what: 'Administrator only. Override the fee on a shared type; add, edit and withdraw the barangay’s own.' },
          { icon: 'users', label: 'Officers', what: 'Administrator only. Issue the barangay’s own clerks and kagawads — but never another administrator.' },
        ],
      },
      {
        name: 'Moving a certificate',
        note: 'The order is enforced on the server, not merely rendered: "ready" means come and collect it, and a resident told that too early makes a wasted trip.',
        items: [
          { icon: 'clock', label: 'Processing', what: 'The secretary has taken the certificate up.' },
          { icon: 'check', label: 'Ready', what: 'Prepared and dated. This is where the validity period is stamped — so a resident who collects three weeks later holds a certificate three weeks into its life, exactly as the paper says.' },
          { icon: 'badge-check', label: 'Released', what: 'Handed over, fee taken at the hall. This is where the PDF is written, with the seal and both signatures.' },
          { icon: 'x-circle', label: 'Reject', what: 'Requires a reason the resident can read.' },
          { icon: 'download', label: 'Download certificate', what: 'The stored PDF — frozen at issue, so an election never reprints it over somebody else’s name.' },
          { icon: 'ban', label: 'Withdraw', what: 'Administrator only. Both roles hand a certificate over; taking the barangay’s word back is a decision.' },
          { icon: 'refresh-cw', label: 'Reissue', what: 'Administrator only. Carries the same valid-until as the one it replaces — correcting a mistake is not renewing.' },
        ],
      },
      {
        name: 'The board of notices',
        note: 'Every other barangay feature refuses to be readable; this one inverts all of it. A notice is worth nothing until the people it concerns have seen it.',
        items: [
          { icon: 'plus', label: 'Post a notice', what: 'Title, body, optional expiry. Appears in every resident’s barangay hub.' },
          { icon: 'triangle-alert', label: 'Mark urgent', what: 'Administrator only. Writes a notification for every resident of the barangay, in the same transaction as the notice.' },
          { icon: 'users', label: 'Reached N residents', what: 'The confirmation waits to be dismissed — the one screen stating the blast radius should not vanish on a timer.' },
          { icon: 'square-pen', label: 'Edit', what: 'Allowed, and the board then says "edited". Urgency is not editable: the notification went or it did not.' },
          { icon: 'trash-2', label: 'Take down', what: 'Administrator only. Keeps the row in the archive — what the barangay said last month is a thing somebody asks about.' },
        ],
      },
      {
        name: 'Blotter and summons',
        note: 'The most defamatory data in the system. No resident route reads it, it is not in the privacy export, and municipal staff get refused — administrator included.',
        items: [
          { icon: 'plus', label: 'Record a matter', what: 'Complainant, respondent, contacts, nature, narrative — all free text, never linked to accounts.' },
          { icon: 'search', label: 'Search the book', what: 'Searching names, bounded to the barangay doing it.' },
          { icon: 'calendar-days', label: 'Issue a summons', what: 'Administrator only — it goes out over the Punong Barangay’s name and compels two people to appear.' },
          { icon: 'send', label: 'Send the reminder', what: 'The only thing here that notifies anybody. Who is asking, when, where, the reference — never the narrative and never the other party’s name.' },
          { icon: 'check', label: 'Record service', what: 'Kept apart from the outcome: a respondent who never received the summons did not fail to appear.' },
          { icon: 'book-text', label: 'Record what happened', what: 'Administrator only. One pending calling at a time.' },
          { icon: 'x-circle', label: 'Close the matter', what: 'Final, cancels any outstanding hearing, and must say how it ended.' },
        ],
      },
      {
        name: 'The register of inhabitants',
        note: 'The one place in the app that is deliberately a directory. Its containment is the barangay boundary — nothing here is readable by the municipality, by another barangay, or by any resident.',
        items: [
          { icon: 'users', label: 'The figures', what: 'Population, households, age bands, per purok — computed over the active register on every read.' },
          { icon: 'alert-triangle', label: 'Without a date of birth', what: 'Reported rather than hidden: counted in the population and in no age band. A feeding programme planned off a silently short count is the harm.' },
          { icon: 'plus', label: 'Add a household', what: 'The head becomes a member automatically — a register whose head is only a column cannot count its own population.' },
          { icon: 'user-round', label: 'Add a member', what: 'Free text, never linked to an account. A link would hand a clerk a view onto the user table.' },
          { icon: 'square-pen', label: 'Edit a member', what: 'PWD and 4Ps ticks are labelled "(noted)" so a checkbox can never read as an entitlement at a counter.' },
          { icon: 'user-x', label: 'Take out of the register', what: 'Administrator only, and needs a reason. Nothing is deleted — next year’s figures have to be comparable with this year’s.' },
        ],
      },
      {
        name: 'The hall, and the barangay’s own accounts',
        note: 'A barangay issues its own clerks and councillors, because the hall does not know who holds a barangay office this term and the captain does.',
        items: [
          { icon: 'square-pen', label: 'Correct the hall’s details', what: 'Captain, secretary, address, hours, phone, email. The barangay’s own name is not editable — that belongs to the register.' },
          { icon: 'image-up', label: 'Upload seal and signatures', what: 'The Punong Barangay’s and the Secretary’s. There is no third slot.' },
          { icon: 'users', label: 'Issue an officer or kagawad', what: 'Starts with an unusable password; the holder chooses their own from an emailed link, and the screen says whether it sent.' },
          { icon: 'user-x', label: 'Revoke', what: 'Spends any outstanding invitation, because a live reset link is a way back in. An administrator’s row is "not found" here — which is what stops a captain and a secretary revoking each other.' },
        ],
      },
    ],
  },

  {
    id: 'kagawad',
    name: 'Council view',
    tone: 'amber',
    who: 'A member of the Sangguniang Barangay.',
    shape: 'Its own mount with its own gate, not a reduced clerk. Putting a third role on the clerk’s gate and carving it back out route by route would leave the blotter one forgotten check away from a councillor.',
    groups: [
      {
        name: 'What a kagawad sees',
        note: 'The figures come from the same code as the secretary’s own screen, so the council and the clerk never quote different population numbers at each other.',
        items: [
          { icon: 'badge-check', label: 'Summary', what: 'What the office issued and collected.' },
          { icon: 'users', label: 'Register figures', what: 'Population, age bands, households per purok — counts only.' },
          { icon: 'megaphone', label: 'The notice board', what: 'Exactly as residents see it.' },
        ],
      },
      {
        name: 'What is withheld, and why',
        note: 'Read-only is deliberate and conservative in the right direction: widening this later is one route; narrowing it after seven people have been using it is not.',
        items: [
          { icon: 'ban', label: 'No certificate queue', what: 'Individual residents and what they asked for.' },
          { icon: 'ban', label: 'No household names', what: 'The register as people rather than as counts.' },
          { icon: 'ban', label: 'No blotter, entirely', what: 'Handing seven elected politicians a searchable book of accusations against their own constituents is a political weapon, and nothing about holding the office requires it.' },
          { icon: 'ban', label: 'No writes at all', what: 'A notice goes out over the barangay’s name, so posting stays with the captain and the clerk. A council seat is not a megaphone.' },
        ],
      },
    ],
  },

  {
    id: 'public',
    name: 'Public document check',
    tone: 'gold',
    who: 'Anybody holding a printout: a bank, an employer, a clerk at another counter. No account.',
    shape: 'Scanning the QR on any document this system issues opens one page, ahead of even the session check. It answers for a municipal document, a barangay certificate and a receipt alike, and says which it found.',
    groups: [
      {
        name: 'The check',
        note: 'A check that needs a login is a check that does not happen. Nothing is disclosed that the holder of the paper does not already have in their hand.',
        items: [
          { icon: 'scan-line', label: 'Scan or type the code', what: 'The QR carries a link, not a bare code — a phone knows what to do with a URL and nothing with sixteen loose characters.' },
          { icon: 'check-circle-2', label: 'Valid', what: 'Type, reference, who holds it, when it was issued, what it is valid until, live status.' },
          { icon: 'clock', label: 'Lapsed', what: 'Amber, and in words. A real document that needs replacing, not a fake one.' },
          { icon: 'ban', label: 'Withdrawn', what: 'Red. Adds whether a replacement exists — the difference between "do not accept this" and "do not accept this, ask for the current one".' },
          { icon: 'x-circle', label: 'Not found', what: 'A typo or a forgery. The codes are long and random, so the endpoint cannot be walked.' },
          { icon: 'alert-triangle', label: 'Checked N times', what: 'The only trace a photocopy leaves. Shown to the person deciding whether to accept the paper, because they are the one who can act on it.' },
        ],
      },
    ],
  },
]
