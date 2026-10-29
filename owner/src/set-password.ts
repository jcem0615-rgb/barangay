import { pool, one } from './db.ts'
import { checkPassword, setPassword } from './auth.ts'

/**
 * Sets an existing owner account's password.
 *
 *   OWNER_EMAIL=… OWNER_PASSWORD=… npm run set-password
 *
 * A script of its own rather than a flag on `npm run seed`, because the seed
 * runs in provisioning and a provision that quietly resets a password every
 * time it is re-run is a very bad surprise. This only ever does the one thing
 * its name says, and it refuses an account that does not exist rather than
 * creating one — `npm run seed` is what creates.
 *
 * It is the way back in when a password is lost. There is no reset-by-email
 * here: this console has two or three accounts and mail from it would be one
 * more thing to configure correctly on the service that holds every
 * customer's ops token. Somebody with shell access can run this; somebody
 * without it cannot, which is the right boundary for a tool this small.
 *
 * Changing a password ends every other session that account has open — see
 * `setPassword`.
 */
const email = process.env.OWNER_EMAIL?.trim().toLowerCase()
const password = process.env.OWNER_PASSWORD

function fail(message: string): never {
  console.error(message)
  process.exitCode = 1
  void pool.end()
  process.exit(1)
}

if (!email) fail('OWNER_EMAIL is not set. OWNER_EMAIL=… OWNER_PASSWORD=… npm run set-password')
if (!password) fail('OWNER_PASSWORD is not set.')

const problem = checkPassword(password)
if (problem) fail(problem)

const user = await one<{ id: string; name: string; role: string }>(
  `select id, name, role from owner_users where lower(email) = $1`,
  [email]
)
if (!user) fail(`No account for ${email}. Create one with OWNER_EMAIL=${email} npm run seed.`)

await setPassword(user.id, password)
// Never the password itself: this runs in a shell whose history and logs are
// not a place a secret belongs, and the person running it already has it.
console.log(`set the password for ${email} (${user.name}, ${user.role})`)
console.log('every other session for that account has been signed out.')
await pool.end()
