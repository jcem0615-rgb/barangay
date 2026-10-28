import { randomBytes } from 'node:crypto'
import { pool, query, one } from './db.ts'
import { hashPassword } from './auth.ts'

/**
 * Creates the first owner account and nothing else.
 *
 * There is no sign-up: this console is two directors at a firm, and an open
 * registration form on the thing that holds every customer's ops token would
 * be the worst door in the system. Further accounts are added by running this
 * again with a different address.
 */
const email = (process.env.OWNER_EMAIL ?? 'owner@fmcm.example').trim().toLowerCase()
const name = process.env.OWNER_NAME ?? 'Owner'
const role = process.env.OWNER_ROLE === 'viewer' ? 'viewer' : 'owner'
const supplied = process.env.OWNER_PASSWORD?.trim()
const password = supplied || randomBytes(12).toString('base64url')

const existing = await one<{ id: string }>(`select id from owner_users where lower(email) = $1`, [email])
if (existing) {
  console.log(`${email} already has an account — nothing to do.`)
} else {
  await query(
    `insert into owner_users (email, name, password_hash, role) values ($1,$2,$3,$4)`,
    [email, name, await hashPassword(password), role]
  )
  console.log(`created ${role} account ${email}`)
  // Only a generated password is safe to print. One supplied through the
  // environment is already a secret somewhere and must not end up in a log.
  if (!supplied) console.log(`password: ${password}`)
  else console.log('password: the one you supplied in OWNER_PASSWORD')
}
await pool.end()
