// The barangay's logo: the one mark here a resident can fetch.
//
// The seal and the two signatures exist for the PDF writer and are console-only
// reads. This one is the barangay's face in the app — behind the dashboard,
// behind the digital ID, on the top bar — so it has a resident route, and that
// single difference is what this suite is about:
//
//   * the console half behaves exactly like the seal (administrator writes,
//     both roles read, another barangay cannot reach it);
//   * the resident half exists at all, is scoped to their own barangay, and
//     answers 404 rather than 500 for a barangay that has not uploaded one;
//   * the signature route still refuses `logo`, because `:who` interpolates
//     into a closed map and a fourth name must not quietly join the three.
const API = process.env.API_URL ?? 'http://127.0.0.1:4000/api'
let pass = 0, fail = 0
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n} ${x}`) } }

const j = async (p, o = {}) => {
  const res = await fetch(API + p, {
    method: o.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

const put = async (path, token, bytes, filename) => {
  const form = new FormData()
  form.append('file', new Blob([bytes]), filename)
  const res = await fetch(API + path, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

const raw = (path, token) =>
  fetch(API + path, { headers: { Authorization: `Bearer ${token}` } })

const SEED = process.env.SEED_PASSWORD ?? 'elgu-demo-2026'
const login = async (email) =>
  (await j('/auth/login', { method: 'POST', body: { email, password: SEED } })).json?.token

const stamp = Date.now()
const uniq = () => `Maiden ${Date.now()}${Math.random().toString(36).slice(2, 8)}`
const register = async (tag, barangayId) => {
  const token = (await j('/auth/register', { method: 'POST', body: {
    email: `logo.${tag}.${stamp}@example.com`, password: 'logo-portal-2026',
    fullName: `Taga ${tag} ${stamp}`, birthDate: '1992-02-02',
    motherMaidenName: uniq(), residesHere: true, barangayId,
  } })).json.token
  return token
}

const admin = await login('admin.poblacion@malasiqui.gov.ph')
const officer = await login('officer.poblacion@malasiqui.gov.ph')
const kagawad = await login('kagawad.poblacion@malasiqui.gov.ph')
const otherAdmin = await login('admin.nalsian-norte@malasiqui.gov.ph')
const municipalAdmin = await login('admin@malasiqui.gov.ph')

const here = await register('here', 'poblacion')
const elsewhere = await register('elsewhere', 'nalsian-norte')

// A real 16x16 PNG, so the magic-byte sniffing has something true to read.
// A real 16x16 PNG, generated rather than pasted — the first fixture here was a
// base64 string whose pixel data did not inflate, and `pngDecodes` refused it
// exactly as it is meant to. The validator was right and the fixture was wrong.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGMQOJBAEmIY1TCqYfhqAABOTzAQ5b7c1gAAAABJRU5ErkJggg==',
  'base64'
)

// A known starting state. The last section of this suite uploads a logo to the
// other barangay and leaves it there, so a second run against the same database
// would find "a barangay with no logo" already has one — which is a defect in
// the suite rather than in the thing it tests, and it only shows up on the
// second run. Both are cleared first; 404 for "there was none" is fine.
for (const token of [admin, otherAdmin]) {
  await j('/barangay-staff/office/logo', { method: 'DELETE', token })
}

// ---------------------------------------------------------------------------
console.log('\n== the console half, which behaves like the seal ==')
// ---------------------------------------------------------------------------
const clerkWrite = await put('/barangay-staff/office/logo', officer, PNG, 'logo.png')
check('the clerk cannot upload one', clerkWrite.status === 403, String(clerkWrite.status))

const upload = await put('/barangay-staff/office/logo', admin, PNG, 'logo.png')
check('the administrator can', upload.status === 200, JSON.stringify(upload.json))
check('and the office says it now has one', upload.json?.hasLogo === true)
check('with a stamp the app can cache against', typeof upload.json?.logoUpdatedAt === 'string')

const notAnImage = await put('/barangay-staff/office/logo', admin, Buffer.from('%PDF-1.7\nnope'), 'logo.png')
check('a PDF renamed .png is refused on its bytes', notAnImage.status === 415, String(notAnImage.status))

const clerkRead = await raw('/barangay-staff/office/logo', officer)
check('the clerk can see it', clerkRead.status === 200, String(clerkRead.status))

for (const [who, token] of [['the municipal administrator', municipalAdmin], ['a kagawad', kagawad]]) {
  const out = await raw('/barangay-staff/office/logo', token)
  check(`${who} is refused`, out.status === 403, String(out.status))
}

// ---------------------------------------------------------------------------
console.log('\n== the signature route still owns only the two signatures ==')
// ---------------------------------------------------------------------------
const asSignature = await put('/barangay-staff/office/signature/logo', admin, PNG, 'logo.png')
check('PUT /signature/logo is 404, not a fourth slot', asSignature.status === 404, String(asSignature.status))
const readSignature = await raw('/barangay-staff/office/signature/logo', admin)
check('and GET /signature/logo too', readSignature.status === 404, String(readSignature.status))
const asSeal = await put('/barangay-staff/office/signature/seal', admin, PNG, 'seal.png')
check('the seal is still refused there as well', asSeal.status === 404, String(asSeal.status))

// ---------------------------------------------------------------------------
console.log('\n== the resident half, which the seal does not have ==')
// ---------------------------------------------------------------------------
const mine = await j('/barangay/me', { token: here })
check('a resident is told their barangay has one', mine.json?.barangay?.hasLogo === true, JSON.stringify(mine.json?.barangay)?.slice(0, 120))
check('and when it last changed', typeof mine.json?.barangay?.logoUpdatedAt === 'string')
check('but never the storage key', !JSON.stringify(mine.json ?? {}).includes('logo_key') && mine.json?.barangay?.logoKey === undefined)

const fetched = await raw('/barangay/logo', here)
check('and can fetch the image', fetched.status === 200, String(fetched.status))
check('served inline as an image', (fetched.headers.get('content-type') ?? '').startsWith('image/'))
check('with nosniff', fetched.headers.get('x-content-type-options') === 'nosniff')
check('and cached privately, since it is per-barangay',
  /private/.test(fetched.headers.get('cache-control') ?? ''), fetched.headers.get('cache-control'))

const anon = await fetch(`${API}/barangay/logo`)
check('no session gets nothing', anon.status === 401, String(anon.status))

// A resident of a barangay with no logo: the ordinary case, and it must read
// as "none" rather than as an error, because every screen falls back on it.
const theirs = await raw('/barangay/logo', elsewhere)
check("a barangay with no logo answers 404, not 500", theirs.status === 404, String(theirs.status))
const theirMe = await j('/barangay/me', { token: elsewhere })
check('and says so on /barangay/me', theirMe.json?.barangay?.hasLogo === false)

// ---------------------------------------------------------------------------
console.log('\n== removing it ==')
// ---------------------------------------------------------------------------
const clerkRemove = await j('/barangay-staff/office/logo', { method: 'DELETE', token: officer })
check('the clerk cannot remove it', clerkRemove.status === 403, String(clerkRemove.status))
const removed = await j('/barangay-staff/office/logo', { method: 'DELETE', token: admin })
check('the administrator can', removed.status === 200, String(removed.status))
check('and the office says it has none', removed.json?.hasLogo === false)
const gone = await raw('/barangay/logo', here)
check('the resident route goes quiet too', gone.status === 404, String(gone.status))

// ---------------------------------------------------------------------------
console.log('\n== another barangay ==')
// ---------------------------------------------------------------------------
await put('/barangay-staff/office/logo', otherAdmin, PNG, 'logo.png')
const stillNone = await raw('/barangay/logo', here)
check("one barangay's logo is not another's", stillNone.status === 404, String(stillNone.status))
const theirsNow = await raw('/barangay/logo', elsewhere)
check('while their own resident gets it', theirsNow.status === 200, String(theirsNow.status))

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
