import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { env } from './env.ts'

/**
 * Sealing a deployment's ops token.
 *
 * Every other secret this project stores is hashed — passwords, reset tokens,
 * ID verification codes — because nothing ever needs them back. This one is
 * different in kind: the owner service has to *present* the token to the
 * deployment on every probe, so it has to be able to read it again.
 *
 * That makes this table the most valuable thing the firm holds, so the token
 * is encrypted at rest with a key that lives in the environment rather than in
 * the database. A dump of the registry on its own — a backup left somewhere, a
 * stolen snapshot — is then a list of customers rather than a working key to
 * every one of their status endpoints.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to open rather
 * than decrypting to something else. A fresh 12-byte IV per seal, stored
 * beside the ciphertext, because reusing an IV with GCM is the one mistake
 * that breaks it completely.
 */

const KEY = (() => {
  const raw = env.tokenKey.trim()
  // Hex is what `openssl rand -hex 32` prints, which is what the README says
  // to run; anything else is hashed to 32 bytes rather than refused, so a
  // passphrase someone typed still produces a usable key.
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw).digest()
})()

const VERSION = 'v1'

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function seal(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.')
}

/**
 * Opens a sealed token, or returns null.
 *
 * Null rather than a throw, because the caller is a probe loop: a token that
 * cannot be opened — a rotated key, a corrupted row — must show up as "this
 * deployment cannot be checked, and here is why" on its page, not as an
 * exception that stops every other deployment from being checked.
 */
export function unseal(sealed: string | null | undefined): string | null {
  if (!sealed) return null
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) return null
  try {
    const [, iv, tag, body] = parts
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv!, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag!, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(body!, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** A fresh ops token for a new deployment. 32 bytes, as the docs tell operators to generate. */
export const newOpsToken = (): string => randomBytes(32).toString('hex')
