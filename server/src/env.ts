import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy server/.env.example to server/.env and fill it in.`
    )
  }
  return value
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  // No fallback on purpose: a default signing secret would let anyone mint a
  // valid staff token against a deployed server.
  jwtSecret: required('JWT_SECRET'),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  port: Number(process.env.PORT ?? 4000),
}
