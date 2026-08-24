import pg from 'pg'
import { env } from './env.ts'

// Fees are integers in the DB; make sure pg hands back numbers, not strings.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))

export const pool = new pg.Pool({ connectionString: env.databaseUrl })

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
  const rows = await query<T>(text, params)
  return rows[0]
}

/** Runs fn inside a transaction, rolling back if it throws. */
export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
