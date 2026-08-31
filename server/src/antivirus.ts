import { connect } from 'node:net'
import { env } from './env.ts'

/**
 * Virus scanning for resident uploads, spoken directly to clamd over TCP.
 *
 * Type-checking an upload stops the obvious web attacks, but a genuine PDF can
 * still carry a payload, and municipal staff open these files on office
 * workstations. Scanning is the control that protects the people on the other
 * side of the counter.
 *
 * Disabled unless CLAMAV_HOST is set, so development does not require a daemon.
 * When it IS configured, a scan that cannot be completed rejects the upload
 * rather than letting it through — an unavailable scanner must not silently
 * become no scanner.
 */

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'unavailable'; reason: string }

export const scanningEnabled = () => Boolean(env.clamavHost)

const CHUNK = 64 * 1024

/**
 * clamd INSTREAM: send `zINSTREAM\0`, then length-prefixed chunks, then a
 * zero-length chunk to end the stream. The reply is `stream: OK` or
 * `stream: <signature> FOUND`.
 */
export function scanBuffer(content: Buffer): Promise<ScanResult> {
  if (!env.clamavHost) return Promise.resolve({ status: 'clean' })

  return new Promise((resolve) => {
    let settled = false
    const done = (result: ScanResult) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    const socket = connect({ host: env.clamavHost!, port: env.clamavPort })
    socket.setTimeout(env.clamavTimeoutMs)

    socket.on('timeout', () => done({ status: 'unavailable', reason: 'scanner timed out' }))
    socket.on('error', (err) => done({ status: 'unavailable', reason: err.message }))

    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0', 'ascii'))
      for (let offset = 0; offset < content.length; offset += CHUNK) {
        const slice = content.subarray(offset, offset + CHUNK)
        const size = Buffer.alloc(4)
        size.writeUInt32BE(slice.length)
        socket.write(size)
        socket.write(slice)
      }
      socket.write(Buffer.alloc(4)) // zero-length chunk terminates the stream
    })

    let reply = ''
    socket.on('data', (chunk) => {
      reply += chunk.toString('ascii')
      if (!reply.includes('\0') && !reply.includes('\n')) return

      const line = reply.replace(/\0/g, '').trim()
      if (/\bOK$/.test(line)) return done({ status: 'clean' })

      const found = /^stream:\s*(.+?)\s+FOUND$/.exec(line)
      if (found) return done({ status: 'infected', signature: found[1]! })

      done({ status: 'unavailable', reason: `unexpected reply: ${line.slice(0, 120)}` })
    })

    socket.on('close', () => done({ status: 'unavailable', reason: 'scanner closed the connection' }))
  })
}
