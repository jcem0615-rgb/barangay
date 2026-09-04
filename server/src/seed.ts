/**
 * Seeds the office and service catalogue from the app's own mockData, so the
 * database and the frontend never drift apart on what the LGU offers.
 * Safe to re-run: catalogue rows are upserted, demo accounts are skipped if present.
 */
import { SECTORAL_PROGRAMS, SERVICES, SERVICE_CATEGORIES } from '../../src/data/mockData.ts'
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
const ADMIN = { email: 'admin@sanfernando.gov.ph', name: 'Office of the Mayor — Administrator' }

const STAFF: Array<{ email: string; name: string; department: string; position: string }> = [
  { email: 'treasury@sanfernando.gov.ph', name: 'Ana R. Lim', department: 'treasury', position: 'Revenue Officer II' },
  { email: 'bpls@sanfernando.gov.ph', name: 'Rico M. Dela Cruz', department: 'bpls', position: 'Licensing Officer' },
  { email: 'obo@sanfernando.gov.ph', name: 'Eng. Jose P. Vega', department: 'obo', position: 'Building Inspector' },
  { email: 'lcr@sanfernando.gov.ph', name: 'Carmen S. Reyes', department: 'lcr', position: 'Registration Officer' },
  { email: 'cswdo@sanfernando.gov.ph', name: 'Grace T. Bautista', department: 'cswdo', position: 'Social Welfare Officer' },
  { email: 'health@sanfernando.gov.ph', name: 'Dr. Elena V. Cruz', department: 'health', position: 'Sanitation Inspector' },
]

async function main() {
  await transaction(async (client) => {
    for (const [index, dept] of SERVICE_CATEGORIES.entries()) {
      await client.query(
        `insert into departments (id, name, office_name, description, icon, sort_order)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
           name = excluded.name, office_name = excluded.office_name,
           description = excluded.description, icon = excluded.icon,
           sort_order = excluded.sort_order`,
        [dept.id, dept.name, dept.officeName, dept.description, dept.icon, index]
      )
    }

    for (const service of SERVICES) {
      await client.query(
        `insert into services (id, department_id, name, short_description, processing_time,
                               fee_centavos, requires_payment, requirements, fields, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         on conflict (id) do update set
           department_id = excluded.department_id, name = excluded.name,
           short_description = excluded.short_description,
           processing_time = excluded.processing_time,
           fee_centavos = excluded.fee_centavos,
           requires_payment = excluded.requires_payment,
           requirements = excluded.requirements, fields = excluded.fields, active = true`,
        [
          service.id, service.categoryId, service.name, service.shortDescription,
          service.processingTime, toCentavos(service.fee), service.requiresPayment,
          JSON.stringify(service.requirements), JSON.stringify(service.fields),
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
  })
  console.log(
    `catalogue: ${SERVICE_CATEGORIES.length} offices, ${SERVICES.length} services, ` +
      `${SECTORAL_PROGRAMS.length} programmes`
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
      `insert into users (email, password_hash, role, full_name) values ($1, $2, 'admin', $3)`,
      [ADMIN.email, passwordHash, ADMIN.name]
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
        `insert into users (email, password_hash, role, full_name)
         values ($1, $2, 'staff', $3) returning id`,
        [staff.email, passwordHash, staff.name]
      )
      await client.query(
        `insert into staff_assignments (user_id, department_id, position) values ($1, $2, $3)`,
        [inserted.rows[0]!.id, staff.department, staff.position]
      )
    })
    created++
  }

  // Existing accounts keep their own password — saying otherwise would send
  // someone hunting for a login that does not work.
  console.log(`accounts: ${created} created, ${kept} already existed (incl. ${ADMIN.email})`)
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
