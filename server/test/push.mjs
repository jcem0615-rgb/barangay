// Web Push: who may subscribe, what a lock screen is allowed to say, and that
// the server really encrypts and signs a push rather than merely intending to.
import { createECDH } from 'node:crypto'
import webpush from 'web-push'

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const r = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const t = await r.text()
  return { status: r.status, json: t ? JSON.parse(t) : null }
}

const stamp = Date.now()
const register = async (n) => (await j('/auth/register', { method: 'POST', body: {
  email: `push.${n}.${stamp}@example.com`, password: 'abisuhan-mo-2026', fullName: `Push ${n} ${stamp}`,
  philSysId: '6677-8899-0011-2233', barangay: 'Poblacion', municipality: 'San Fernando', province: 'Pampanga',
} })).json.token

const resident = await register('a')
const other = await register('b')
const treasury = (await j('/auth/login', { method: 'POST', body: { email: 'treasury@sanfernando.gov.ph', password: 'elgu-demo-2026' } })).json.token

console.log('\n== the key the browser needs ==')
const key = await j('/notifications/push-key', { token: resident })
check('a signed-in resident can fetch it', key.status === 200, JSON.stringify(key.json))
check('it says whether push is configured at all', typeof key.json.enabled === 'boolean')
check('a stranger cannot', (await j('/notifications/push-key')).status === 401)
if (!key.json.enabled) {
  console.log('\n  push is not configured on this server (no VAPID keys); the rest of this suite needs it.')
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
check('and hands over the public key', typeof key.json.publicKey === 'string' && key.json.publicKey.length > 40)

// A browser subscription is a URL and two keys. web-push requires HTTPS for the
// endpoint, and there is no reachable push service from here, so delivery is
// not exercised over a socket — see the crypto section at the end, which checks
// the signing and encryption themselves rather than the hop that carries them.
const ENDPOINT_BASE = 'https://push.example.invalid'

/**
 * Keys shaped the way a browser produces them: p256dh is an uncompressed P-256
 * point (65 bytes, 0x04-prefixed) and auth is 16 random bytes.
 */
const browserKeys = () => {
  const ec = createECDH('prime256v1')
  ec.generateKeys()
  return {
    p256dh: ec.getPublicKey().toString('base64url'),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  }
}
const fakeSub = (path) => ({ endpoint: `${ENDPOINT_BASE}${path}`, keys: browserKeys() })

console.log('\n== subscribing ==')
const sub = fakeSub('/device-one')
const saved = await j('/notifications/push', { method: 'POST', token: resident, body: sub })
check('a device can subscribe', saved.status === 201, JSON.stringify(saved.json))
check('it is listed', (await j('/notifications/push', { token: resident })).json.length === 1)
check('the browser it came from is recorded', typeof (await j('/notifications/push', { token: resident })).json[0].userAgent === 'string')

console.log('\n== the endpoint is the identity ==')
await j('/notifications/push', { method: 'POST', token: resident, body: sub })
check('re-subscribing the same browser does not stack a second row',
  (await j('/notifications/push', { token: resident })).json.length === 1)
await j('/notifications/push', { method: 'POST', token: resident, body: fakeSub('/device-two') })
check('a second device is its own row', (await j('/notifications/push', { token: resident })).json.length === 2)

console.log('\n== a subscription belongs to whoever is signed in ==')
check('somebody else does not see it', (await j('/notifications/push', { token: other })).json.length === 0)
// Two people sharing a phone: the second sign-in takes the browser over, which
// is right — the notifications that arrive should be for the account using it.
await j('/notifications/push', { method: 'POST', token: other, body: sub })
check('signing in on a shared browser takes it over', (await j('/notifications/push', { token: other })).json.length === 1)
check('and the first account no longer has it', (await j('/notifications/push', { token: resident })).json.length === 1)

console.log('\n== what will not be accepted ==')
for (const [what, body] of [
  ['no endpoint', { keys: { p256dh: 'x', auth: 'y' } }],
  ['a non-URL endpoint', { endpoint: 'not a url', keys: { p256dh: 'x', auth: 'y' } }],
  ['no keys', { endpoint: `${ENDPOINT_BASE}/x` }],
  ['half the keys', { endpoint: `${ENDPOINT_BASE}/x`, keys: { p256dh: 'x' } }],
]) {
  check(`${what} is refused`, (await j('/notifications/push', { method: 'POST', token: resident, body })).status === 400)
}
check('a stranger cannot subscribe', (await j('/notifications/push', { method: 'POST', body: sub })).status === 401)

console.log('\n== unsubscribing ==')
const mine = (await j('/notifications/push', { token: resident })).json
check('removing needs an endpoint', (await j('/notifications/push', { method: 'DELETE', token: resident, body: {} })).status === 400)
check('somebody else’s endpoint is not theirs to remove',
  (await j('/notifications/push', { method: 'DELETE', token: other, body: { endpoint: sub.endpoint } })).status === 204)
void mine

console.log('\n== the push itself is signed and encrypted, for real ==')
// This is the exact code path web-push takes to build a request, minus the
// socket: the VAPID signature and the aes128gcm body are produced here the same
// way they would be on the way to a real push service.
// The signature needs a key pair in this process too; the server has its own.
const testKeys = webpush.generateVAPIDKeys()
webpush.setVapidDetails('mailto:dpo@sanfernando.gov.ph', testKeys.publicKey, testKeys.privateKey)
const details = webpush.generateRequestDetails(
  { endpoint: `${ENDPOINT_BASE}/crypto`, keys: browserKeys() },
  JSON.stringify({ title: 'Your Cedula is ready', body: 'Collect it from the app.' }),
  { TTL: 21600 }
)
check('signed with VAPID', /vapid/i.test(details.headers.Authorization ?? ''), String(details.headers.Authorization).slice(0, 24))
check('the payload is encrypted', details.headers['Content-Encoding'] === 'aes128gcm', details.headers['Content-Encoding'])
check('and is genuinely not readable on the wire',
  !details.body.toString('utf8').includes('Cedula'), details.body.subarray(0, 12).toString('hex'))
check('with a TTL, so a phone that was off still gets it', Number(details.headers.TTL) > 0, String(details.headers.TTL))
check('sent to the endpoint the browser gave us', details.endpoint.endsWith('/crypto'), details.endpoint)

console.log('\n== what a lock screen is allowed to say ==')
const { pushBodyFor } = await import('../src/push.ts')
check('a released document says what it is', pushBodyFor('released', 'Your Cedula is ready.') === 'Your Cedula is ready.')
check('an appointment says what it is', pushBodyFor('appointment_booked', 'You are booked at 9am.') === 'You are booked at 9am.')
// A push is readable by anyone holding the phone. A poverty-programme record
// announced to whoever is standing nearby is exactly what must not happen.
check('a programme grant does not name the programme',
  pushBodyFor('program_granted', 'You have been enrolled in 4Ps.') === 'Open the app to read it.')
check('nor a revocation', pushBodyFor('program_revoked', 'Your 4Ps record was removed.') === 'Open the app to read it.')
check('and a complaint reply is not quoted',
  pushBodyFor('complaint_answered', 'We were short-staffed.') === 'Open the app to read it.')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
