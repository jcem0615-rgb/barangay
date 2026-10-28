import pg from 'pg'
import { env } from './env.ts'

pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  // A two-person console. Ten would be generous.
  max: Number(process.env.PGPOOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => console.error('unexpected idle client error', err))

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params)
  return result.rows
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | undefined> {
  return (await query<T>(text, params))[0]
}

/** A transaction, so a change and the event that records it land together. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
