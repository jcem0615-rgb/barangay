/**
 * Seeds the office and service catalogue from the app's own mockData, so the
 * database and the frontend never drift apart on what the LGU offers.
 * Safe to re-run: catalogue rows are upserted, demo accounts are skipped if present.
 */
import {
  BARANGAY_CERTIFICATES, BARANGAYS, EMERGENCY_CONTACTS, HOLIDAYS, MUNICIPALITY,
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
const ADMIN = { email: 'admin@malasiqui.gov.ph', name: 'Office of the Mayor — Administrator' }

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
    for (const [index, dept] of SERVICE_CATEGORIES.entries()) {
      await client.query(
        `insert into departments (id, name, office_name, description, icon, sort_order,
                                  address, hours, phone, email)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do update set
           name = excluded.name, office_name = excluded.office_name,
           description = excluded.description, icon = excluded.icon,
           sort_order = excluded.sort_order, address = excluded.address,
           hours = excluded.hours, phone = excluded.phone, email = excluded.email`,
        [
          dept.id, dept.name, dept.officeName, dept.description, dept.icon, index,
          dept.address ?? null, dept.hours ?? null, dept.phone ?? null, dept.email ?? null,
        ]
      )
    }

    for (const service of SERVICES) {
      await client.query(
        `insert into services (id, department_id, name, short_description, processing_time,
                               processing_days_min, processing_days_max,
                               fee_centavos, requires_payment, requirements, fields,
                               search_terms, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
         on conflict (id) do update set
           department_id = excluded.department_id, name = excluded.name,
           short_description = excluded.short_description,
           processing_time = excluded.processing_time,
           processing_days_min = excluded.processing_days_min,
           processing_days_max = excluded.processing_days_max,
           fee_centavos = excluded.fee_centavos,
           requires_payment = excluded.requires_payment,
           requirements = excluded.requirements, fields = excluded.fields,
           search_terms = excluded.search_terms, active = true`,
        [
          service.id, service.categoryId, service.name, service.shortDescription,
          service.processingTime, service.processingDaysMin, service.processingDaysMax,
          toCentavos(service.fee), service.requiresPayment,
          JSON.stringify(service.requirements), JSON.stringify(service.fields),
          service.searchTerms ?? [],
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
    for (const barangay of BARANGAYS) {
      await client.query(
        `insert into barangays (id, name, municipality_code, captain, secretary)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do update set
           name = excluded.name, captain = excluded.captain, secretary = excluded.secretary`,
        [barangay.id, barangay.name, MUNICIPALITY.code, barangay.captain, barangay.secretary]
      )
    }
    for (const [index, type] of BARANGAY_CERTIFICATES.entries()) {
      await client.query(
        `insert into barangay_certificate_types
           (id, name, description, fee_centavos, purpose_hint, sort_order)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
           name = excluded.name, description = excluded.description,
           fee_centavos = excluded.fee_centavos, purpose_hint = excluded.purpose_hint,
           sort_order = excluded.sort_order`,
        [type.id, type.name, type.description, toCentavos(type.fee), type.purposeHint, index]
      )
    }

    // The municipality this deployment serves. Upserted onto the single row, so
    // re-seeding corrects a name or province without ever creating a second.
    //
    // The code is left alone once set: changing it would orphan every account
    // already stamped with the old one, which is a migration somebody has to
    // decide on, not something a re-seed should do quietly.
    await client.query(
      `insert into municipality (only_row, code, name, province)
       values (true, $1, $2, $3)
       on conflict (only_row) do update set
         name = excluded.name, province = excluded.province`,
      [MUNICIPALITY.code, MUNICIPALITY.name, MUNICIPALITY.province]
    )

    // Accounts made before residency scoping existed. This deployment has only
    // ever served one municipality, so that is the one they belong to.
    await client.query(
      `update users set municipality_code = $1 where municipality_code is null`,
      [MUNICIPALITY.code]
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
    `catalogue: ${MUNICIPALITY.name}, ${MUNICIPALITY.province} — ` +
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
    await query(
      `insert into users (email, password_hash, role, full_name, municipality_code)
       values ($1, $2, 'admin', $3, $4)`,
      [ADMIN.email, passwordHash, ADMIN.name, MUNICIPALITY.code]
    )
    created++
  }
  for (const staff of STAFF) {
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
        [staff.email, passwordHash, staff.name, MUNICIPALITY.code]
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
  for (const [index, barangay] of BARANGAYS.entries()) {
    const accounts = [
      { email: `admin.${barangay.id}@malasiqui.gov.ph`, name: `${barangay.name} Barangay Secretary`, role: 'barangay_admin' },
      ...(index === 0
        ? [{ email: `officer.${barangay.id}@malasiqui.gov.ph`, name: `${barangay.name} Barangay Clerk`, role: 'barangay_officer' }]
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
        [account.email, passwordHash, account.role, account.name, MUNICIPALITY.code, barangay.id]
      )
      barangayAccounts++
      created++
    }
  }

  // Existing accounts keep their own password — saying otherwise would send
  // someone hunting for a login that does not work.
  console.log(`accounts: ${created} created, ${kept} already existed (incl. ${ADMIN.email})`)
  console.log(`barangays: ${BARANGAYS.length} seeded, ${barangayAccounts} barangay accounts created`)
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
