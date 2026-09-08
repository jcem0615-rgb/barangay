// Virus scanning of uploads, tested against a mock clamd speaking the real
// INSTREAM protocol. This exercises the actual client — framing, termination
// and reply parsing — not a stubbed-out function.
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { formFiller } from './fixtures.mjs'

const PORT = 43310
const API_PORT = 4100
const API = `http://127.0.0.1:${API_PORT}/api`
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

// --- mock clamd ---------------------------------------------------------
// verdict: 'clean' | 'infected' | 'garbage'; null = refuse connections.
let verdict = 'clean'
let received = null

const clamd = createServer((socket) => {
  const chunks = []
  let header = null
  socket.on('data', (data) => {
    if (!header) {
      const nul = data.indexOf(0)
      header = data.subarray(0, nul).toString('ascii')
      data = data.subarray(nul + 1)
    }
    // length-prefixed chunks; a zero length ends the stream
    let offset = 0
    while (offset + 4 <= data.length) {
      const len = data.readUInt32BE(offset)
      offset += 4
      if (len === 0) {
        received = { header, body: Buffer.concat(chunks) }
        const reply =
          verdict === 'infected' ? 'stream: Eicar-Test-Signature FOUND\0'
          : verdict === 'garbage' ? 'stream: something odd\0'
          : 'stream: OK\0'
        socket.write(Buffer.from(reply, 'ascii'))
        socket.end()
        return
      }
      chunks.push(data.subarray(offset, offset + len))
      offset += len
    }
  })
})
await new Promise((r) => clamd.listen(PORT, '127.0.0.1', r))

// --- API with scanning pointed at the mock ------------------------------
const api = spawn('node', ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'src/index.ts'], {
  env: { ...process.env, PORT: String(API_PORT), CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(PORT), CLAMAV_TIMEOUT_MS: '3000', SERVE_WEB: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
api.stderr.on('data', () => {})
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${API}/health`)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 250))
}

const formFor = await formFiller(API)
const j = async (p, o = {}) => {
  const res = await fetch(API + p, { method: o.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined })
  return { status: res.status, json: await res.json().catch(() => null) }
}
async function put(path, token, bytes, name) {
  const form = new FormData()
  form.append('file', new Blob([bytes]), name)
  const res = await fetch(API + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(500, 0x20), Buffer.from('\n%%EOF')])
const token = (await j('/auth/register', { method: 'POST', body: { email: `av.${Date.now()}@example.com`, password: 'tamang-lakas-2026', fullName: 'Scan Tester' } })).json.token
const id = (await j('/requests', { method: 'POST', token, body: { serviceId: 'cedula', formValues: formFor('cedula', { purpose: 'Employment' }) } })).json.id

console.log('\n== scanning is reported as on ==')
check('health says scanning enabled', (await j('/health')).json?.virusScanning === 'enabled')

console.log('\n== a clean file is scanned and stored ==')
verdict = 'clean'
const ok = await put(`/requests/${id}/attachments`, token, PDF, 'clean.pdf')
check('upload accepted', ok.status === 201, JSON.stringify(ok.json))
check('the scanner actually saw INSTREAM', received?.header === 'zINSTREAM', received?.header)
check('and received the exact bytes', received?.body.equals(PDF), `${received?.body?.length} vs ${PDF.length}`)

console.log('\n== an infected file is refused ==')
verdict = 'infected'
const bad = await put(`/requests/${id}/attachments`, token, PDF, 'infected.pdf')
check('upload rejected with 422', bad.status === 422, bad.status)
check('the message does not leak the signature', !/eicar/i.test(bad.json?.error ?? ''), bad.json?.error)
check('nothing was added to the request', (await j(`/requests/${id}/attachments`, { token })).json.length === 1)

console.log('\n== an unusable scanner fails closed ==')
verdict = 'garbage'
check('unparseable reply rejects the upload', (await put(`/requests/${id}/attachments`, token, PDF, 'x.pdf')).status === 503)

await new Promise((r) => clamd.close(r))
const down = await put(`/requests/${id}/attachments`, token, PDF, 'y.pdf')
check('scanner down rejects rather than accepting unscanned', down.status === 503, down.status)
check('and says so plainly', /can.t check files for viruses/i.test(down.json?.error ?? ''), down.json?.error)
check('still nothing extra stored', (await j(`/requests/${id}/attachments`, { token })).json.length === 1)

api.kill('SIGTERM')
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
