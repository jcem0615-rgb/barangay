import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { env } from './env.ts'
import { query } from './db.ts'

const BCRYPT_ROUNDS = 12
const TOKEN_TTL = '12h'

export type Role = 'resident' | 'staff' | 'admin'

export interface AuthUser {
  id: string
  email: string
  role: Role
  fullName: string
  /** Department ids this staff member may act on. Empty for residents. */
  departments: string[]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

const JWT_ALGORITHM = 'HS256' as const

export function signToken(user: { id: string; role: Role }): string {
  // `iat` is whole seconds, too coarse to tell a session issued moments before
  // a password change from one issued moments after. iatMs carries the
  // millisecond so that comparison is exact.
  return jwt.sign({ sub: user.id, role: user.role, iatMs: Date.now() }, env.jwtSecret, {
    expiresIn: TOKEN_TTL,
    algorithm: JWT_ALGORITHM,
  })
}

/**
 * Loads the user fresh from the database on every request. The token carries
 * only an id, so a revoked account or a changed department assignment takes
 * effect immediately instead of lingering until the token expires.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in to continue.' })
  }

  let userId: string
  let payload: jwt.JwtPayload
  try {
    // Pinning the algorithm keeps verification from being steered by the
    // token's own header, which is the shape of the classic JWT confusion bugs.
    payload = jwt.verify(header.slice(7), env.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload
    if (typeof payload.sub !== 'string') throw new Error('bad subject')
    userId = payload.sub
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' })
  }

  const rows = await query<{
    id: string; email: string; role: Role; full_name: string
    department_id: string | null; password_changed_at: Date
  }>(
    `select u.id, u.email, u.role, u.full_name, u.password_changed_at, sa.department_id
       from users u
       left join staff_assignments sa on sa.user_id = u.id
      where u.id = $1`,
    [userId]
  )

  const first = rows[0]
  if (!first) return res.status(401).json({ error: 'Your account is no longer active.' })

  // Sessions are stateless, so a password change is enforced here: anything
  // issued before it is refused. Without this, resetting a password would not
  // sign out whoever prompted the reset.
  // Tokens issued before the password changed are refused, so a reset signs out
  // whoever was already holding one. Falls back to `iat` for tokens predating
  // iatMs, rounded up to the end of its second so a valid session is never
  // rejected merely because of that coarser resolution.
  const issuedAtMs =
    typeof payload.iatMs === 'number'
      ? payload.iatMs
      : typeof payload.iat === 'number'
        ? payload.iat * 1000 + 999
        : 0
  if (issuedAtMs < first.password_changed_at.getTime()) {
    return res.status(401).json({ error: 'Your password was changed. Sign in again.' })
  }

  req.user = {
    id: first.id,
    email: first.email,
    role: first.role,
    fullName: first.full_name,
    departments: rows.map((r) => r.department_id).filter((d): d is string => d !== null),
  }
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this area.' })
    }
    next()
  }
}

/** True when the staff member is assigned to the department (admins see all). */
export function canActOnDepartment(user: AuthUser, departmentId: string): boolean {
  if (user.role === 'admin') return true
  return user.departments.includes(departmentId)
}
