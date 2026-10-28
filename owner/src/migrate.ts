import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool, query } from './db.ts'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

async function main() {
  await query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now()
  )`)

  const applied = new Set(
    (await query<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name)
  )
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(migrationsDir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query(`insert into schema_migrations (name) values ($1)`, [file])
      await client.query('commit')
      console.log(`applied ${file}`)
    } catch (err) {
      await client.query('rollback')
      throw new Error(`migration ${file} failed: ${(err as Error).message}`)
    } finally {
      client.release()
    }
  }
  console.log('migrations up to date')
  await pool.end()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
