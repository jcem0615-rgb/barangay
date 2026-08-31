import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { env } from './env.ts'

/**
 * Where uploaded files live. A directory today; the interface is deliberately
 * narrow (put / get / remove by opaque key) so an S3-backed implementation can
 * replace it without touching the routes.
 *
 * In a container this directory must be a mounted volume — otherwise every
 * resident's uploaded requirements vanish on the next deploy.
 */
const root = resolve(env.uploadDir)

/** Keys are server-generated, so an uploaded filename can never shape a path. */
function keyToPath(key: string): string {
  if (!/^[0-9a-f]{2}\/[0-9a-f-]{36}$/.test(key)) {
    throw new Error(`refusing to resolve a malformed storage key: ${key}`)
  }
  return join(root, key)
}

export interface StoredFile {
  storageKey: string
  checksum: string
  byteSize: number
}

export async function putFile(content: Buffer): Promise<StoredFile> {
  const id = randomUUID()
  // Shard by the first byte so one directory doesn't accumulate every file.
  const key = `${id.slice(0, 2)}/${id}`
  const path = keyToPath(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  return {
    storageKey: key,
    checksum: createHash('sha256').update(content).digest('hex'),
    byteSize: content.length,
  }
}

export function getFile(key: string): Promise<Buffer> {
  return readFile(keyToPath(key))
}

export async function removeFile(key: string): Promise<void> {
  await unlink(keyToPath(key)).catch(() => undefined)
}
