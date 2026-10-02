import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open as openFile, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
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

/**
 * Take a file that is already on disk into the store, without ever holding it
 * in memory.
 *
 * This exists for incident video. Everything else here is a photograph or a
 * PDF and fits in a Buffer comfortably; half an hour of phone video does not,
 * and reading it into one to hash it would make a single upload capable of
 * taking the server down.
 *
 * The move is a rename where it can be — same filesystem, so atomic and free —
 * and a streamed copy where it cannot, which is what happens when the temp
 * directory and the upload directory are different mounts.
 */
export async function putFileFromPath(sourcePath: string): Promise<StoredFile> {
  const id = randomUUID()
  const key = `${id.slice(0, 2)}/${id}`
  const path = keyToPath(key)
  await mkdir(dirname(path), { recursive: true })

  // Hashed by streaming, so the file's size is never the process's problem.
  const hash = createHash('sha256')
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(sourcePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', rejectHash)
    stream.on('end', () => resolveHash())
  })

  try {
    await rename(sourcePath, path)
  } catch {
    // Different device: copy, then drop the original.
    const source = await openFile(sourcePath, 'r')
    const target = await openFile(path, 'w')
    try {
      await source.readableWebStream().pipeTo(target.createWriteStream())
    } finally {
      await source.close()
      await target.close()
    }
    await unlink(sourcePath).catch(() => undefined)
  }

  const { size } = await stat(path)
  return { storageKey: key, checksum: hash.digest('hex'), byteSize: size }
}

/** Byte size of a stored file, without reading it. */
export async function fileSize(key: string): Promise<number> {
  const { size } = await stat(keyToPath(key))
  return size
}

/**
 * A read stream over a stored file, optionally a byte range.
 *
 * Incident video is watched in the console rather than downloaded, and a player
 * that cannot seek is a player somebody watches thirty minutes of to find the
 * ten seconds that matter — which needs ranged reads, which needs a stream.
 */
export function fileStream(key: string, range?: { start: number; end: number }) {
  return createReadStream(keyToPath(key), range)
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
