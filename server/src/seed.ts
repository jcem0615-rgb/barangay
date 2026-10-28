/**
 * Seeds the office and service catalogue from the app's own mockData, so the
 * database and the frontend never drift apart on what the LGU offers.
 * Safe to re-run: catalogue rows are upserted, demo accounts are skipped if present.
 */
import {
  configuredAdministrator, configuredBarangays, configuredMunicipality, seedsSampleAccounts,
  configuredTier, configuredBarangaySlug,
} from './deployment.ts'
import {
  BARANGAY_CERTIFICATES, EMERGENCY_CONTACTS, HOLIDAYS,
  SECTORAL_PROGRAMS, SERVICES, SERVICE_CATEGORIES,
} from '../../src/data/mockData.ts'
import { hashPassword } from './auth.ts'
import { one, pool, query, transaction } from './db.ts'
import { toCentavos } from './serialize.ts'

// A published default password on real staff accounts is an open door, so in
// production one has to be supplied deliberately.
if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
  console.error(
    'Refusing to seed staff accounts with the default password in production.\n' +
      'Set SEED_PASSWORD to a value from your secret store, or create staff accounts yourself.'
  )
  process.exit(1)
}

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'

// The administrator manages staff accounts from inside the app; without one,
// onboarding a new clerk means editing the database by hand.
const ADMIN = configuredAdministrator()

/**
 * The town this instance serves, and the barangays it has.
 *
 * Read from the environment with the sample data as the fallback, so a second
 * municipality is a set of variables and a roster file rather than a fork of
 * this repository. See `deployment.ts`.
 */
const TOWN = configuredMunicipality()
const TIER = configuredTier()

/**
 * Who this instance serves.
 *
 * In `municipal` tier that is the whole roster. In `barangay` tier it is one
 * barangay, and naming an id the roster does not hold stops the seed rather
 * than quietly seeding nothing — an empty `barangays` table in that tier means
 * every console route answers 409 and no resident can register, with nothing in
 * the running app to say why.
 */
const ROSTER = (() => {
  const all = configuredBarangays()
  if (TIER !== 'barangay') return all
  const want = configuredBarangaySlug()!
  const one = all.find((b) => b.id === want)
  if (!one) {
    throw new Error(
      `BARANGAY_ID is '${want}', which is not in the roster. ` +
      `The roster holds: ${all.map((b) => b.id).join(', ')}.`
    )
  }
  return [one]
})()

/**
 * The sample staff and barangay logins all share one password, which is right
 * for clicking through a development copy and wrong for a town. Off in
 * production: provisioning a real LGU creates the administrator and nobody
 * else, and the hall issues its own staff from inside the app.
 */
const SAMPLE_ACCOUNTS = seedsSampleAccounts()

const STAFF: Array<{ email: string; name: string; department: string; position: string }> = [
  { email: 'treasury@malasiqui.gov.ph', name: 'Ana R. Lim', department: 'treasury', position: 'Revenue Officer II' },
  { email: 'bpls@malasiqui.gov.ph', name: 'Rico M. Dela Cruz', department: 'bpls', position: 'Licensing Officer' },
  { email: 'obo@malasiqui.gov.ph', name: 'Eng. Jose P. Vega', department: 'obo', position: 'Building Inspector' },
  { email: 'lcr@malasiqui.gov.ph', name: 'Carmen S. Reyes', department: 'lcr', position: 'Registration Officer' },
  { email: 'cswdo@malasiqui.gov.ph', name: 'Grace T. Bautista', department: 'cswdo', position: 'Social Welfare Officer' },
  { email: 'health@malasiqui.gov.ph', name: 'Dr. Elena V. Cruz', department: 'health', position: 'Sanitation Inspector' },
]

async function main() {
  await transaction(async (client) => {
    // ---------------------------------------------------------------------
    // The hall's catalogue: its offices, its services, and the sectoral
    // registers its social welfare office administers.
    //
    // None of it exists in a barangay deployment. A barangay does not run a
    // Business Permits office and cannot enrol anybody in 4Ps — those records
    // are issued by the municipality, and seeding empty departments here would
    // put offices in the resident's app that nobody is behind.
    //
    // The hotlines, the holiday calendar and the municipality row below are
    // seeded in both: a barangay still wants the numbers to ring in an
    // emergency, still shuts on the same holidays, and is still *in* a town
    // whose name and province print on every certificate it issues.
    // ---------------------------------------------------------------------
    if (TIER === 'municipal') {
      for (const [index, dept] of SERVICE_CATEGORIES.entries()) {
        await client.query(
          // `head_title` is seeded because it is a fact about the office; the head's
          // *name* is not, because nobody has held it here — a released document
          // prints the rule and the title with no name over it until the hall fills
          // one in, and a seeded name would be a person this app invented signing
          // official paper.
          `insert into departments (id, name, office_name, description, icon, sort_order,
                                    address, hours, phone, email, head_title)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           on conflict (id) do update set
             name = excluded.name, office_name = excluded.office_name,
             description = excluded.description, icon = excluded.icon,
             sort_order = excluded.sort_order, address = excluded.address,
             hours = excluded.hours, phone = excluded.phone, email = excluded.email,
             head_title = coalesce(departments.head_title, excluded.head_title)`,
          [
            dept.id, dept.name, dept.officeName, dept.description, dept.icon, index,
            dept.address ?? null, dept.hours ?? null, dept.phone ?? null, dept.email ?? null,
            dept.headTitle ?? null,
          ]
        )
      }

      for (const service of SERVICES) {
        await client.query(
          `insert into services (id, department_id, name, short_description, processing_time,
                                 processing_days_min, processing_days_max,
                                 fee_centavos, requires_payment, requirements, fields,
                                 search_terms, steps, active)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
           on conflict (id) do update set
             department_id = excluded.department_id, name = excluded.name,
             short_description = excluded.short_description,
             processing_time = excluded.processing_time,
             processing_days_min = excluded.processing_days_min,
             processing_days_max = excluded.processing_days_max,
             fee_centavos = excluded.fee_centavos,
             requires_payment = excluded.requires_payment,
             requirements = excluded.requirements, fields = excluded.fields,
             search_terms = excluded.search_terms, steps = excluded.steps, active = true`,
          [
            service.id, service.categoryId, service.name, service.shortDescription,
            service.processingTime, service.processingDaysMin, service.processingDaysMax,
            toCentavos(service.fee), service.requiresPayment,
            JSON.stringify(service.requirements), JSON.stringify(service.fields),
            service.searchTerms ?? [],
            JSON.stringify(service.steps ?? []),
          ]
        )
      }

      for (const [index, program] of SECTORAL_PROGRAMS.entries()) {
        await client.query(
          `insert into sectoral_programs (code, name, kind, short_name, description, benefit,
                                          issuing_office, id_label, expires, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (code) do update set
             name = excluded.name, kind = excluded.kind, short_name = excluded.short_name,
             description = excluded.description, benefit = excluded.benefit,
             issuing_office = excluded.issuing_office, id_label = excluded.id_label,
             expires = excluded.expires, sort_order = excluded.sort_order`,
          [
            program.code, program.name, program.kind, program.shortName, program.description,
            program.benefit, program.issuingOffice, program.idLabel, program.expires, index,
          ]
        )
      }
    }

    for (const [index, contact] of EMERGENCY_CONTACTS.entries()) {
      await client.query(
        `insert into emergency_contacts (id, label, agency, phone, is_national, sort_order)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
           label = excluded.label, agency = excluded.agency, phone = excluded.phone,
           is_national = excluded.is_national, sort_order = excluded.sort_order`,
        [contact.id, contact.label, contact.agency, contact.phone, contact.isNational, index]
      )
    }

    // Every office starts bookable. 018_appointments.sql seeds these too, but
    // migrations run before this file has inserted a single department, so on a
    // freshly provisioned database that insert selects from an empty table and
    // appointments are dead until somebody notices. Here the departments exist.
    await client.query(
      `insert into office_booking (department_id)
       select id from departments on conflict do nothing`
    )

    // The barangays, and what they issue. Upserted by id so correcting a
    // captain's name is a re-seed rather than a migration.
    //
    // The hall's own details are seeded and then editable in the barangay's
    // console, like the municipal office details — so a reseed restores the
    // authored set rather than preserving what a barangay corrected. That is the
    // same trade `mockData.ts` makes everywhere: it is the authoring source for
    // a fresh database, not a mirror of a live one.
    for (const barangay of ROSTER) {
      await client.query(
        `insert into barangays
           (id, name, municipality_code, captain, secretary,
            hall_address, office_hours, phone, email)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do update set
           name = excluded.name, captain = excluded.captain, secretary = excluded.secretary,
           hall_address = excluded.hall_address, office_hours = excluded.office_hours,
           phone = excluded.phone, email = excluded.email`,
        [
          barangay.id, barangay.name, TOWN.code, barangay.captain, barangay.secretary,
          barangay.hallAddress, barangay.officeHours, barangay.phone, barangay.email,
        ]
      )
    }
    // Who owns the certificate catalogue, and it is the whole difference
    // between the two products.
    //
    // Municipally the rows are **shared** — `barangay_id` null — because a
    // Barangay Clearance is the same document in all seventy-three, and letting
    // each invent its own would make a resident's certificate depend on which
    // street they live on. The municipal administrator owns that list.
    //
    // In a barangay deployment there is no municipal administrator, and
    // `/admin` is not mounted. Seeding shared rows there would leave a
    // catalogue nobody in the running system can edit — the barangay console
    // reaches its *own* rows and a shared one reads as not found. So the rows
    // are stamped with this barangay and the administrator owns them outright,
    // which is also the honest model: a barangay standing alone decides what it
    // issues and what it charges.
    const catalogueOwner = TIER === 'barangay' ? ROSTER[0]!.id : null
    for (const [index, type] of BARANGAY_CERTIFICATES.entries()) {
      await client.query(
        `insert into barangay_certificate_types
           (id, name, description, fee_centavos, purpose_hint, sort_order, steps,
            validity_days, attestation, barangay_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do update set
           name = excluded.name, description = excluded.description,
           fee_centavos = excluded.fee_centavos, purpose_hint = excluded.purpose_hint,
           sort_order = excluded.sort_order, steps = excluded.steps,
           validity_days = excluded.validity_days,
           attestation = excluded.attestation,
           barangay_id = excluded.barangay_id`,
        [
          type.id, type.name, type.description, toCentavos(type.fee), type.purposeHint,
          index, JSON.stringify(type.steps ?? []), type.validityDays ?? null,
          type.attestation?.trim() || null, catalogueOwner,
        ]
      )
    }

    // The municipality this deployment serves. Upserted onto the single row, so
    // re-seeding corrects a name or province without ever creating a second.
    //
    // The code is left alone once set: changing it would orphan every account
    // already stamped with the old one, which is a migration somebody has to
    // decide on, not something a re-seed should do quietly.
    //
    // The receipt details are filled into *blanks only* on a re-seed. The
    // Municipality tab is where they are corrected, and a seed that overwrote a
    // treasurer's name or a corrected TIN every time somebody ran it would make
    // the editing screen a lie. Null means nobody has set it yet.
    await client.query(
      `insert into municipality
         (only_row, code, name, province, address, phone, email, website, tin,
          treasurer_name, treasurer_title, receipt_prefix, receipt_form_label,
          receipt_footer)
       values (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (only_row) do update set
         name = excluded.name,
         province = excluded.province,
         address = coalesce(municipality.address, excluded.address),
         phone = coalesce(municipality.phone, excluded.phone),
         email = coalesce(municipality.email, excluded.email),
         website = coalesce(municipality.website, excluded.website),
         tin = coalesce(municipality.tin, excluded.tin),
         treasurer_name = coalesce(municipality.treasurer_name, excluded.treasurer_name),
         receipt_form_label = coalesce(municipality.receipt_form_label, excluded.receipt_form_label),
         receipt_footer = coalesce(municipality.receipt_footer, excluded.receipt_footer)`,
      [
        TOWN.code, TOWN.name, TOWN.province,
        blankToNull(TOWN.address), blankToNull(TOWN.phone), blankToNull(TOWN.email),
        blankToNull(TOWN.website), blankToNull(TOWN.tin), blankToNull(TOWN.treasurerName),
        TOWN.treasurerTitle || 'Municipal Treasurer',
        TOWN.receiptPrefix || 'OR',
        blankToNull(TOWN.receiptFormLabel), blankToNull(TOWN.receiptFooter),
      ]
    )

    // Accounts made before residency scoping existed. This deployment has only
    // ever served one municipality, so that is the one they belong to.
    await client.query(
      `update users set municipality_code = $1 where municipality_code is null`,
      [TOWN.code]
    )

    for (const holiday of HOLIDAYS) {
      await client.query(
        `insert into holidays (observed_on, name, is_local) values ($1, $2, $3)
         on conflict (observed_on) do update set
           name = excluded.name, is_local = excluded.is_local`,
        [holiday.date, holiday.name, holiday.local ?? false]
      )
    }
  })
  console.log(
    TIER === 'barangay'
      ? `catalogue: ${TOWN.name}, ${TOWN.province} — no hall in this tier; ` +
        `${HOLIDAYS.length} holidays, ${EMERGENCY_CONTACTS.length} hotlines`
      : `catalogue: ${TOWN.name}, ${TOWN.province} — ` +
        `${SERVICE_CATEGORIES.length} offices, ${SERVICES.length} services, ` +
        `${SECTORAL_PROGRAMS.length} programmes, ${HOLIDAYS.length} holidays, ` +
        `${EMERGENCY_CONTACTS.length} hotlines`
  )

  const passwordHash = await hashPassword(DEMO_PASSWORD)
  let created = 0
  let kept = 0

  const existingAdmin = await one<{ id: string }>(
    `select id from users where lower(email) = lower($1)`, [ADMIN.email]
  )
  if (existingAdmin) {
    kept++
  } else {
    // The root account, and in a barangay deployment it is a *barangay*
    // administrator rather than a municipal one.
    //
    // Municipally the escalation line runs downward: the hall issues each
    // barangay its administrator, and a barangay can issue its own clerks and
    // kagawads but never another administrator, so a revoked captain cannot
    // have left one behind. Standing alone there is no hall above to issue it,
    // so provisioning creates it directly — and it is still the only account
    // that exists, with everyone else invited from inside the app.
    //
    // A municipal `admin` here would be worse than useless: `/admin` and
    // `/staff` are not mounted in this tier, so it could sign in and reach
    // nothing at all.
    await query(
      TIER === 'barangay'
        ? `insert into users (email, password_hash, role, full_name, municipality_code, barangay_id)
           values ($1, $2, 'barangay_admin', $3, $4, $5)`
        : `insert into users (email, password_hash, role, full_name, municipality_code)
           values ($1, $2, 'admin', $3, $4)`,
      TIER === 'barangay'
        ? [ADMIN.email, passwordHash, ADMIN.name, TOWN.code, ROSTER[0]!.id]
        : [ADMIN.email, passwordHash, ADMIN.name, TOWN.code]
    )
    created++
  }
  // The sample offices and barangay logins, which all share one password. A
  // real deployment gets the administrator and nobody else: the hall issues its
  // own staff from the Accounts tab and each barangay issues its own clerks and
  // kagawads, both of which mail an invitation rather than setting a password.
  // The sample office logins sit in departments, and a barangay deployment has
  // none — so there is nobody for them to be, and the insert would fail on the
  // foreign key rather than on anything meaningful.
  for (const staff of SAMPLE_ACCOUNTS && TIER === 'municipal' ? STAFF : []) {
    const existing = await one<{ id: string }>(
      `select id from users where lower(email) = lower($1)`, [staff.email]
    )
    if (existing) {
      kept++
      await query(
        `insert into staff_assignments (user_id, department_id, position) values ($1, $2, $3)
         on conflict (user_id, department_id) do update set position = excluded.position`,
        [existing.id, staff.department, staff.position]
      )
      continue
    }
    await transaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into users (email, password_hash, role, full_name, municipality_code)
         values ($1, $2, 'staff', $3, $4) returning id`,
        [staff.email, passwordHash, staff.name, TOWN.code]
      )
      await client.query(
        `insert into staff_assignments (user_id, department_id, position) values ($1, $2, $3)`,
        [inserted.rows[0]!.id, staff.department, staff.position]
      )
    })
    created++
  }

  // Barangay staff. Two per barangay would be a lot of demo accounts, so the
  // first barangay gets both roles and the rest get an administrator — enough to
  // show the isolation without seeding a directory.
  //
  // Officers are issued, never self-registered: nothing in the app lets a
  // resident become one, which is the whole reason these are here.
  let barangayAccounts = 0
  for (const [index, barangay] of ROSTER.entries()) {
    const accounts = !SAMPLE_ACCOUNTS ? [] : [
      { email: `admin.${barangay.id}@malasiqui.gov.ph`, name: `${barangay.name} Barangay Secretary`, role: 'barangay_admin' },
      ...(index === 0
        ? [
            { email: `officer.${barangay.id}@malasiqui.gov.ph`, name: `${barangay.name} Barangay Clerk`, role: 'barangay_officer' },
            // One kagawad, in the first barangay only, for the same reason as
            // the clerk: enough to show what the council may and may not see
            // without seeding a seven-seat roster nobody reads.
            { email: `kagawad.${barangay.id}@malasiqui.gov.ph`, name: `${barangay.name} Barangay Kagawad`, role: 'barangay_kagawad' },
          ]
        : []),
    ]
    for (const account of accounts) {
      const existing = await one<{ id: string }>(
        `select id from users where lower(email) = lower($1)`, [account.email]
      )
      if (existing) {
        // The password is left alone — saying otherwise would send somebody
        // hunting for a login that does not work. The barangay is not: every
        // query in that console scopes on it, so an account missing it answers
        // 409 to everything, and a reseed is the one chance to repair it.
        await query(
          `update users set barangay_id = $2 where id = $1 and barangay_id is distinct from $2`,
          [existing.id, barangay.id]
        )
        kept++
        continue
      }
      await query(
        `insert into users (email, password_hash, role, full_name, municipality_code, barangay_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [account.email, passwordHash, account.role, account.name, TOWN.code, barangay.id]
      )
      barangayAccounts++
      created++
    }
  }

  // Existing accounts keep their own password — saying otherwise would send
  // someone hunting for a login that does not work.
  console.log(`accounts: ${created} created, ${kept} already existed (incl. ${ADMIN.email})`)
  console.log(
    TIER === 'barangay'
      ? `barangay: ${ROSTER[0]!.name} — ${BARANGAY_CERTIFICATES.length} certificate types, ` +
        `${barangayAccounts} staff accounts created`
      : `barangays: ${ROSTER.length} seeded, ${barangayAccounts} barangay accounts created`
  )
  if (!SAMPLE_ACCOUNTS) {
    // Said plainly, because somebody provisioning a town will otherwise look
    // for the logins the development copy has and conclude the seed failed.
    console.log(
      'sample staff and barangay logins were not created (SEED_SAMPLE_ACCOUNTS is off).\n' +
      `  sign in as ${ADMIN.email} and issue the rest from the Accounts tab.`
    )
  }
  if (created > 0) {
    // Only the development default is safe to print. A supplied SEED_PASSWORD
    // is a real secret and must not end up in deploy logs.
    console.log(
      process.env.SEED_PASSWORD
        ? 'new accounts use the password from SEED_PASSWORD'
        : `new accounts use the development password: ${DEMO_PASSWORD}`
    )
  }
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

/** An unset environment variable is a blank string; the column wants a null. */
function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
