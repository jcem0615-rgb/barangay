import { esc, page, statusPill, ago } from './layout.ts'
import { placeOf, productOf, type Deployment } from '../registry.ts'
import { qrSvg } from '../qr.ts'
import { envFile, rosterFile, commands } from '../provision.ts'
import type { OwnerUser } from '../auth.ts'

type Flash = { error?: string; ok?: string }

export function signIn(opts: { error?: string; next?: string } = {}): string {
  return page({
    title: 'Sign in',
    body: `
    <div style="max-width:380px;margin:8vh auto">
      <h1 style="font-size:21px;font-weight:800;color:#111c44">eLGU Owner</h1>
      <p class="sub">The registry of who runs this portal. Deployments, their health, and the poster that gets residents onto them.</p>
      <div class="card" style="margin-top:18px">
        ${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ''}
        <form method="post" action="/sign-in">
          <input type="hidden" name="next" value="${esc(opts.next ?? '/')}">
          <label><span class="lbl">Email</span>
            <input type="email" name="email" required autocomplete="username" autofocus></label>
          <label><span class="lbl">Password</span>
            <input type="password" name="password" required autocomplete="current-password"></label>
          <div class="actions"><button class="btn primary" type="submit">Sign in</button></div>
        </form>
      </div>
      <p class="sub" style="margin-top:14px">This console holds no resident data. It asks each deployment
      for counts and never reads a customer's database.</p>
    </div>`,
  })
}

/** Up, down, or not yet asked. */
function health(d: Deployment): string {
  if (d.status === 'draft') return `<span class="pill unknown">not stood up</span>`
  if (d.status === 'decommissioned') return `<span class="pill unknown">—</span>`
  if (!d.last_seen_at && d.last_error) return `<span class="pill down">not answering</span>`
  if (!d.last_seen_at) return `<span class="pill unknown">never seen</span>`
  if (d.last_error) return `<span class="pill down">not answering</span>`
  return `<span class="pill up">up</span>`
}

export function list(opts: { user: OwnerUser; csrf: string; rows: Deployment[] } & Flash): string {
  const { rows, user } = opts
  const live = rows.filter((r) => r.status === 'live').length
  const down = rows.filter((r) => r.last_error && r.status !== 'draft' && r.status !== 'decommissioned').length

  return page({
    title: 'Deployments', user, wide: true,
    body: `
    ${opts.ok ? `<div class="ok">${esc(opts.ok)}</div>` : ''}
    ${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ''}
    <div class="row" style="align-items:center;margin-bottom:16px">
      <div class="grow">
        <h1 style="font-size:20px;font-weight:800;color:#111c44">Deployments</h1>
        <p class="sub">${rows.length} on record · ${live} live${down ? ` · <b style="color:#b91c1c">${down} not answering</b>` : ''}</p>
      </div>
      ${user.role === 'owner' ? `<a class="btn primary" href="/new">Add a deployment</a>` : ''}
      <form method="post" action="/probe" style="display:inline">
        <input type="hidden" name="_csrf" value="${esc(opts.csrf)}">
        <button class="btn" type="submit">Check all now</button>
      </form>
    </div>

    <div class="card" style="padding:4px 6px">
      <table>
        <thead><tr>
          <th>Place</th><th>Tier</th><th>Status</th><th>Health</th>
          <th>Last seen</th><th>Residents</th><th>Open</th><th></th>
        </tr></thead>
        <tbody>
        ${rows.length === 0
          ? `<tr><td colspan="8" style="padding:26px;text-align:center" class="muted">
               Nothing here yet. Add the first municipality or barangay.</td></tr>`
          : rows.map((d) => {
              const c = (d.last_status as { counts?: Record<string, number> } | null)?.counts
              const open = d.tier === 'barangay' ? c?.certificateRequestsOpen : c?.requestsOpen
              return `<tr>
                <td><a href="/d/${esc(d.id)}" style="font-weight:600;text-decoration:none">${esc(placeOf(d))}</a>
                    <div class="muted" style="font-size:12px">${esc(d.slug)}</div></td>
                <td><span class="tier ${esc(d.tier)}">${d.tier === 'barangay' ? 'Barangay' : 'Municipal'}</span></td>
                <td>${statusPill(d.status)}</td>
                <td>${health(d)}</td>
                <td class="muted">${esc(ago(d.last_seen_at))}</td>
                <td>${c?.residents ?? '—'}</td>
                <td>${open ?? '—'}</td>
                <td style="text-align:right"><a class="btn" href="/d/${esc(d.id)}/poster" target="_blank">Poster</a></td>
              </tr>`
            }).join('')}
        </tbody>
      </table>
    </div>

    <p class="note" style="margin-top:16px"><b>What this console can and cannot see.</b> Every figure above
    comes from the deployment's own <code>/api/ops/status</code>, which publishes counts, identity and
    health and no row of any kind. There is no connection from here to any customer's database, and no
    account anywhere that can read across two of them &mdash; that is the portal's isolation model, and a
    control plane that broke it would be the most valuable target in the system.</p>`,
  })
}

export function form(opts: {
  user: OwnerUser
  csrf: string
  values?: Record<string, string>
  deployment?: Deployment
  error?: string
}): string {
  const v = opts.values ?? {}
  const d = opts.deployment
  const editing = Boolean(d)
  const val = (k: string, fallback = '') => esc(v[k] ?? fallback)

  return page({
    title: editing ? 'Edit deployment' : 'Add a deployment', user: opts.user,
    body: `
    <p class="crumb"><a href="${editing ? `/d/${esc(d!.id)}` : '/'}">&larr; ${editing ? esc(placeOf(d!)) : 'Deployments'}</a></p>
    <h1 style="font-size:20px;font-weight:800;color:#111c44">${editing ? 'Edit deployment' : 'Add a deployment'}</h1>
    <p class="sub">${editing
      ? 'What a place is called can be corrected. Which place it is cannot — see below.'
      : 'One row per instance. A municipality and one of its barangays standing alone are two deployments, two databases and two rows.'}</p>

    <div class="card" style="margin-top:16px">
      ${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ''}
      <form method="post" action="${editing ? `/d/${esc(d!.id)}/edit` : '/new'}">
        <input type="hidden" name="_csrf" value="${esc(opts.csrf)}">

        ${editing ? '' : `
        <label><span class="lbl">Tier</span>
          <select name="tier" required>
            <option value="municipal" ${v.tier === 'barangay' ? '' : 'selected'}>Municipal — the hall and every barangay in it</option>
            <option value="barangay" ${v.tier === 'barangay' ? 'selected' : ''}>Barangay — one barangay, standing alone</option>
          </select>
          <span class="help">This decides which product is built and which routes the instance mounts. It cannot be changed afterwards.</span>
        </label>

        <label><span class="lbl">Slug</span>
          <input type="text" name="slug" required value="${val('slug')}" placeholder="bugallon">
          <span class="help">Lowercase, hyphens. It names the database, the env file and the container, so it is chosen once.</span>
        </label>

        <label><span class="lbl">Municipality code</span>
          <input type="text" name="municipalityCode" required value="${val('municipalityCode')}" placeholder="bugallon-pangasinan">
          <span class="help">Must match <code>MUNICIPALITY_CODE</code> exactly. Every account is stamped with it and the instance refuses to serve a database carrying a different one.</span>
        </label>`}

        <div class="row">
          <label class="grow"><span class="lbl">Municipality</span>
            <input type="text" name="municipalityName" required value="${val('municipalityName', d?.municipality_name ?? '')}" placeholder="Bugallon"></label>
          <label class="grow"><span class="lbl">Province</span>
            <input type="text" name="municipalityProvince" required value="${val('municipalityProvince', d?.municipality_province ?? '')}" placeholder="Pangasinan"></label>
        </div>

        ${editing && d!.tier === 'municipal' ? '' : `
        <div class="row">
          ${editing ? '' : `<label class="grow"><span class="lbl">Barangay id <span class="muted">(barangay tier only)</span></span>
            <input type="text" name="barangayId" value="${val('barangayId')}" placeholder="bolasi">
            <span class="help">The id as it appears in that deployment's roster file.</span></label>`}
          <label class="grow"><span class="lbl">Barangay name${editing ? '' : ' <span class="muted">(barangay tier only)</span>'}</span>
            <input type="text" name="barangayName" value="${val('barangayName', d?.barangay_name ?? '')}" placeholder="Bolasi"></label>
        </div>`}

        <label><span class="lbl">Address residents open</span>
          <input type="url" name="publicUrl" required value="${val('publicUrl', d?.public_url ?? '')}" placeholder="https://bugallon.gov.ph">
          <span class="help">${editing
            ? 'The download QR is built from this. <b>Every certificate already issued carries the old address in its QR and the PDF is stored</b> — moving a live deployment means its existing documents verify against the old host.'
            : 'The download QR appears on the next screen, built from this. It is also what every certificate\'s verification QR is built from, and those PDFs are stored — so it cannot be corrected after documents have been issued.'}</span>
        </label>

        <div class="row">
          <label class="grow"><span class="lbl">Contact</span>
            <input type="text" name="contactName" value="${val('contactName', d?.contact_name ?? '')}" placeholder="Hon. …, Municipal Administrator"></label>
          <label class="grow"><span class="lbl">Contact email</span>
            <input type="email" name="contactEmail" value="${val('contactEmail', d?.contact_email ?? '')}"></label>
          <label class="grow"><span class="lbl">Contact phone</span>
            <input type="text" name="contactPhone" value="${val('contactPhone', d?.contact_phone ?? '')}"></label>
        </div>

        <label><span class="lbl">Notes</span>
          <textarea name="notes" placeholder="Anything the next person needs: who signed, what was promised, what is still outstanding.">${val('notes', d?.notes ?? '')}</textarea></label>

        <div class="actions">
          <button class="btn primary" type="submit">${editing ? 'Save changes' : 'Add deployment'}</button>
          <a class="btn" href="${editing ? `/d/${esc(d!.id)}` : '/'}">Cancel</a>
        </div>
      </form>
    </div>

    ${editing ? `<p class="note" style="margin-top:14px"><b>The slug, the tier, the municipality code and the
    barangay id are not editable.</b> Every account inside a deployment is stamped with its municipality
    code, and sign-in refuses an account from another register &mdash; so changing it here would rename
    nothing. It would only make this registry disagree with the instance, which is exactly the mismatch
    the design exists to surface.</p>` : ''}`,
  })
}

/** Shown once, straight after adding: the token and the QR, together. */
export function added(opts: { user: OwnerUser; d: Deployment; opsToken: string }): string {
  const { d, opsToken } = opts
  return page({
    title: 'Added', user: opts.user,
    body: `
    <div class="ok">Added ${esc(placeOf(d))}.</div>
    <h1 style="font-size:20px;font-weight:800;color:#111c44">${esc(placeOf(d))} is on the registry</h1>
    <p class="sub">Two things to do with this page before you leave it.</p>

    <div class="card" style="margin-top:16px">
      <h2>1. The download QR — ready now</h2>
      <p class="muted" style="margin-top:4px">It is built from the address you entered, so there is nothing
      to set up and nothing for the office to configure. Print it and it works the day they open.</p>
      <div class="qrbox" style="margin-top:14px">
        <div class="code">${qrSvg(d.public_url, { size: 168 })}</div>
        <div class="grow">
          <div class="kv"><dt>Opens</dt><dd><code>${esc(d.public_url)}</code></dd>
            <dt>Product</dt><dd>${esc(productOf(d.tier))}</dd></div>
          <div class="actions">
            <a class="btn primary" href="/d/${esc(d.id)}/poster" target="_blank">Open the poster</a>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>2. The ops token — shown once</h2>
      <p class="muted" style="margin-top:4px">Copy it into the deployment's <code>OPS_TOKEN</code>. The
      registry keeps only a sealed copy it can present to the instance; it will never display it again,
      because a secret a console will show you twice is one sitting in a page somebody left open. If you
      lose it, rotate a new one.</p>
      <pre style="margin-top:12px">OPS_TOKEN=${esc(opsToken)}</pre>
    </div>

    <div class="actions">
      <a class="btn primary" href="/d/${esc(d.id)}">Go to ${esc(d.slug)}</a>
      <a class="btn" href="/d/${esc(d.id)}/setup">See the full setup</a>
      <a class="btn" href="/">All deployments</a>
    </div>`,
  })
}

const COUNT_LABELS: Array<[string, string]> = [
  ['residents', 'Residents'],
  ['requests', 'Requests'],
  ['requestsOpen', 'Requests open'],
  ['certificateRequests', 'Certificates asked'],
  ['certificateRequestsOpen', 'Certificates open'],
  ['documents', 'Documents issued'],
  ['certificates', 'Certificates issued'],
  ['receipts', 'Receipts'],
  ['payments', 'Payments settled'],
  ['notices', 'Notices up'],
  ['households', 'Households'],
  ['householdMembers', 'Inhabitants'],
  ['blotterEntries', 'Blotter entries'],
  ['appointments', 'Appointments'],
  ['complaints', 'Complaints'],
  ['incidents', 'Incident reports'],
  ['verifications', 'Document checks'],
  ['staffAccounts', 'Staff accounts'],
  ['barangayAccounts', 'Barangay accounts'],
  ['barangays', 'Barangays'],
  ['attachments', 'Attachments'],
]

export function detail(opts: {
  user: OwnerUser
  csrf: string
  d: Deployment
  events: Array<{ kind: string; summary: string; actor_name: string; created_at: string }>
  checks: Array<{ ok: boolean; error: string | null; duration_ms: number | null; checked_at: string }>
} & Flash): string {
  const { d, user, csrf } = opts
  const status = d.last_status as Record<string, unknown> | null
  const counts = (status?.counts ?? {}) as Record<string, number>
  const writable = user.role === 'owner'
  const gone = d.status === 'decommissioned'

  const flags = status
    ? [
        ['Mail', String(status.mail), status.mail === 'smtp'],
        ['Virus scanning', status.virusScanning ? 'on' : 'off', Boolean(status.virusScanning)],
        ['Push', status.push ? 'on' : 'off', Boolean(status.push)],
        ['SMS', String(status.sms), status.sms !== 'off'],
        ['Payments', String(status.paymentProvider),
          d.tier === 'barangay' ? true : status.paymentProvider !== 'mock'],
      ] as Array<[string, string, boolean]>
    : []

  return page({
    title: placeOf(d), user, wide: true,
    body: `
    ${opts.ok ? `<div class="ok">${esc(opts.ok)}</div>` : ''}
    ${opts.error ? `<div class="err">${esc(opts.error)}</div>` : ''}
    <p class="crumb"><a href="/">&larr; Deployments</a></p>
    <div class="row" style="align-items:center">
      <div class="grow">
        <h1 style="font-size:20px;font-weight:800;color:#111c44">${esc(placeOf(d))}</h1>
        <p class="sub"><span class="tier ${esc(d.tier)}">${esc(productOf(d.tier))}</span>
          &middot; <code>${esc(d.slug)}</code> &middot; ${statusPill(d.status)}
          &middot; last seen ${esc(ago(d.last_seen_at))}</p>
      </div>
      <a class="btn" href="/d/${esc(d.id)}/poster" target="_blank">Poster</a>
      <a class="btn" href="/d/${esc(d.id)}/setup">Setup</a>
      ${writable && !gone ? `<a class="btn" href="/d/${esc(d.id)}/edit">Edit</a>` : ''}
      ${!gone ? `<form method="post" action="/d/${esc(d.id)}/probe" style="display:inline">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <button class="btn primary" type="submit">Check now</button></form>` : ''}
    </div>

    ${d.last_error ? `<div class="err" style="margin-top:14px"><b>Not answering.</b> ${esc(d.last_error)}</div>` : ''}
    ${gone ? `<div class="warn" style="margin-top:14px"><b>Decommissioned${d.decommissioned_at ? ` ${esc(new Date(d.decommissioned_at).toISOString().slice(0, 10))}` : ''}.</b>
      ${esc(d.decommission_reason ?? '')} The registry no longer checks it. <b>Its database was not touched</b> —
      dropping an LGU's records is something somebody does deliberately against a backup they have checked.</div>` : ''}

    <div class="row" style="margin-top:14px">
      <div class="card grow">
        <h2>How residents get the app</h2>
        <p class="muted" style="margin-top:4px">Built from the address on this row, so it exists from the
        moment the deployment was added. Nothing to configure at the office.</p>
        <div class="qrbox" style="margin-top:12px">
          <div class="code">${qrSvg(d.public_url, { size: 168 })}</div>
          <div class="grow">
            <div class="kv">
              <dt>Opens</dt><dd><a href="${esc(d.public_url)}" target="_blank"><code>${esc(d.public_url)}</code></a></dd>
              <dt>Contact</dt><dd>${esc(d.contact_name || '—')}</dd>
              <dt>Email</dt><dd>${esc(d.contact_email || '—')}</dd>
              <dt>Phone</dt><dd>${esc(d.contact_phone || '—')}</dd>
            </div>
            <div class="actions"><a class="btn primary" href="/d/${esc(d.id)}/poster" target="_blank">Open the poster</a></div>
          </div>
        </div>
      </div>

      <div class="card grow" style="flex-basis:300px">
        <h2>Instance</h2>
        <div class="kv" style="margin-top:8px">
          <dt>Reports as</dt><dd>${status ? esc(String(status.productName)) : '—'}</dd>
          <dt>Municipality</dt><dd><code>${esc(d.municipality_code)}</code></dd>
          ${d.barangay_id ? `<dt>Barangay</dt><dd><code>${esc(d.barangay_id)}</code></dd>` : ''}
          <dt>Migrations</dt><dd>${status ? esc(String(status.migrations)) : '—'}</dd>
          <dt>Up since</dt><dd>${status?.startedAt ? esc(ago(String(status.startedAt))) : '—'}</dd>
          <dt>Last activity</dt><dd>${status?.lastActivity ? esc(ago(String(status.lastActivity))) : '—'}</dd>
        </div>
        ${flags.length ? `<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
          ${flags.map(([k, v, good]) => `<span class="pill ${good ? 'up' : 'suspended'}">${esc(k)}: ${esc(v)}</span>`).join('')}
        </div>
        <p class="muted" style="margin-top:8px;font-size:12px">Amber is not a fault — it is a deployment
        running without something a live LGU normally needs. A barangay with no payment gateway is correct.</p>` : ''}
      </div>
    </div>

    ${Object.keys(counts).length ? `<div class="card">
      <h2>Use</h2>
      <p class="muted" style="margin-top:4px">Counts as the deployment reports them. No name, no address and
      no row reaches this console.</p>
      <div class="counts" style="margin-top:12px">
        ${COUNT_LABELS.filter(([k]) => counts[k] !== undefined && !(d.tier === 'barangay' && ['requests', 'requestsOpen', 'receipts', 'payments', 'documents', 'appointments', 'complaints', 'incidents', 'staffAccounts'].includes(k)))
          .map(([k, label]) => `<div class="count"><b>${esc(counts[k] ?? 0)}</b><span>${esc(label)}</span></div>`).join('')}
      </div>
    </div>` : ''}

    <div class="row">
      <div class="card grow">
        <h2>Recent checks</h2>
        <table style="margin-top:8px">
          <tbody>
          ${opts.checks.length === 0 ? `<tr><td class="muted">Not checked yet.</td></tr>`
            : opts.checks.slice(0, 12).map((c) => `<tr>
                <td style="width:1%"><span class="pill ${c.ok ? 'up' : 'down'}">${c.ok ? 'up' : 'down'}</span></td>
                <td class="muted">${esc(ago(c.checked_at))}${c.duration_ms != null ? ` · ${esc(c.duration_ms)}ms` : ''}</td>
                <td class="muted">${esc(c.error ?? '')}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="card grow">
        <h2>What changed</h2>
        <table style="margin-top:8px">
          <tbody>
          ${opts.events.length === 0 ? `<tr><td class="muted">Nothing yet.</td></tr>`
            : opts.events.slice(0, 12).map((e) => `<tr>
                <td>${esc(e.summary)}<div class="muted" style="font-size:12px">${esc(e.actor_name)} · ${esc(ago(e.created_at))}</div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${d.notes ? `<div class="card"><h2>Notes</h2><p class="muted" style="margin-top:6px;white-space:pre-wrap">${esc(d.notes)}</p></div>` : ''}

    ${writable ? `<div class="card">
      <h2>Lifecycle</h2>
      ${gone ? `
        <p class="muted" style="margin-top:4px">This deployment is decommissioned. Removing it from the
        registry is permanent and keeps only the activity log, which carries the slug as text.</p>
        <form method="post" action="/d/${esc(d.id)}/forget" style="margin-top:12px">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <label><span class="lbl">Type <code>${esc(d.slug)}</code> to confirm</span>
            <input type="text" name="confirm" required placeholder="${esc(d.slug)}" autocomplete="off"></label>
          <div class="actions"><button class="btn danger" type="submit">Remove from the registry</button></div>
        </form>`
      : `
        <div class="actions">
          ${(['draft', 'provisioning', 'live', 'suspended'] as const).filter((s) => s !== d.status).map((s) => `
            <form method="post" action="/d/${esc(d.id)}/status" style="display:inline">
              <input type="hidden" name="_csrf" value="${esc(csrf)}">
              <input type="hidden" name="status" value="${s}">
              <button class="btn" type="submit">Mark ${s}</button>
            </form>`).join('')}
          <form method="post" action="/d/${esc(d.id)}/rotate" style="display:inline">
            <input type="hidden" name="_csrf" value="${esc(csrf)}">
            <button class="btn" type="submit">Rotate ops token</button>
          </form>
        </div>
        <form method="post" action="/d/${esc(d.id)}/decommission" style="margin-top:18px;border-top:1px solid var(--line);padding-top:16px">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <label><span class="lbl">Decommission</span>
            <input type="text" name="reason" required placeholder="Why — contract ended, moved to another supplier, …" autocomplete="off">
            <span class="help">Stops the checks and keeps every record. <b>It does not touch their database.</b></span></label>
          <div class="actions"><button class="btn danger" type="submit">Decommission ${esc(d.slug)}</button></div>
        </form>`}
    </div>` : ''}`,
  })
}

export function setup(opts: { user: OwnerUser; d: Deployment }): string {
  const { d } = opts
  return page({
    title: `Setup — ${d.slug}`, user: opts.user, wide: true,
    body: `
    <p class="crumb"><a href="/d/${esc(d.id)}">&larr; ${esc(placeOf(d))}</a></p>
    <h1 style="font-size:20px;font-weight:800;color:#111c44">Standing up ${esc(d.slug)}</h1>
    <p class="sub">Generated from this row. Copy rather than retype — that is where the mistakes come from.</p>

    <p class="note" style="margin-top:14px"><b>This console does not provision anything itself.</b>
    Provisioning creates a database, writes secrets and starts a container; a web page that did it would
    hold credentials for every customer's infrastructure, and one stolen session would be every town at
    once. So it produces the exact files and the exact commands, and a person runs them.</p>

    <div class="card" style="margin-top:14px">
      <h2><code>/etc/elgu/${esc(d.slug)}.env</code></h2>
      <pre>${esc(envFile(d, null))}</pre>
    </div>

    <div class="card">
      <h2><code>/etc/elgu/${esc(d.slug)}-roster.json</code></h2>
      <p class="muted" style="margin-top:4px">${d.tier === 'barangay'
        ? 'One row is enough in barangay tier — the instance reads the file and keeps the row BARANGAY_ID names. Leave BARANGAY_COUNT unset.'
        : 'The real PSGC listing for the municipality. <b>A short roster leaves those barangays\' residents unable to register</b>, which is what BARANGAY_COUNT refuses.'}</p>
      <pre>${esc(rosterFile(d))}</pre>
    </div>

    <div class="card">
      <h2>Commands</h2>
      <pre>${esc(commands(d))}</pre>
    </div>

    <div class="card">
      <h2>Then check it from here</h2>
      <p class="muted" style="margin-top:4px">Once it is up with <code>OPS_TOKEN</code> set, press
      <b>Check now</b> on its page. A green light means the instance answered <em>and</em> reported the
      same municipality this row has — a database wired to the wrong instance fails that check rather
      than passing quietly.</p>
    </div>`,
  })
}

export function activity(opts: {
  user: OwnerUser
  rows: Array<{ deployment_id: string | null; deployment_slug: string; kind: string; summary: string; actor_name: string; created_at: string }>
}): string {
  return page({
    title: 'Activity', user: opts.user, wide: true,
    body: `
    <h1 style="font-size:20px;font-weight:800;color:#111c44">Activity</h1>
    <p class="sub">Every change to the registry, with who made it. Written in the same transaction as the
    change itself &mdash; the same rule the portal applies to a municipality's own edits.</p>
    <div class="card" style="margin-top:16px;padding:4px 6px">
      <table>
        <thead><tr><th>What</th><th>Deployment</th><th>Who</th><th>When</th></tr></thead>
        <tbody>
        ${opts.rows.length === 0 ? `<tr><td colspan="4" class="muted" style="padding:24px;text-align:center">Nothing yet.</td></tr>`
          : opts.rows.map((r) => `<tr>
              <td>${esc(r.summary)}</td>
              <td>${r.deployment_id ? `<a href="/d/${esc(r.deployment_id)}">${esc(r.deployment_slug)}</a>` : `<span class="muted">${esc(r.deployment_slug)}</span>`}</td>
              <td class="muted">${esc(r.actor_name)}</td>
              <td class="muted">${esc(ago(r.created_at))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`,
  })
}

export function notFound(user?: OwnerUser): string {
  return page({
    title: 'Not found', user,
    body: `<h1 style="font-size:20px;font-weight:800;color:#111c44">Not found</h1>
      <p class="sub">That deployment is not in the registry.</p>
      <div class="actions"><a class="btn primary" href="/">All deployments</a></div>`,
  })
}
