import type { OwnerUser } from '../auth.ts'

export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The console's own chrome.
 *
 * Server-rendered, with no build step, and that is a deliberate trade rather
 * than a corner cut. This is an internal tool for the handful of people who
 * sell the portal; giving it a second React bundle, a second Vite config and a
 * second deploy would cost more than it buys, and the thing that actually
 * matters here — that the registry is correct and its writes are audited —
 * lives entirely on the server either way.
 *
 * The palette is the portal's own: navy for the hall, green for a barangay,
 * gold used sparingly. Somebody showing a customer this screen should not have
 * to explain that it is a different product.
 */
export function page(opts: {
  title: string
  user?: OwnerUser
  body: string
  wide?: boolean
}): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)} · eLGU Owner</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1e3a8a; --navy950: #111c44; --green: #166534; --gold: #b7791f;
    --line: #dde3ee; --mute: #5b6478; --canvas: #f1f4f9;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, system-ui, sans-serif; background: var(--canvas); color: #1b2235;
         font-size: 14px; line-height: 1.55; }
  h1, h2, h3 { font-family: 'Plus Jakarta Sans', Inter, sans-serif; letter-spacing: -.015em; }
  a { color: var(--navy); }
  header.top { background: var(--navy950); color: #fff; }
  header.top .in { max-width: ${opts.wide ? '1180px' : '960px'}; margin: 0 auto; padding: 14px 20px;
                   display: flex; align-items: center; gap: 16px; }
  header.top .brand { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 16px; }
  header.top .brand span { color: #fbbf24; }
  header.top nav { margin-left: auto; display: flex; align-items: center; gap: 14px; font-size: 13px; }
  header.top nav a { color: #c7d2fe; text-decoration: none; font-weight: 600; }
  header.top nav a:hover { color: #fff; }
  header.top .who { color: #94a3c4; }
  main { max-width: ${opts.wide ? '1180px' : '960px'}; margin: 0 auto; padding: 24px 20px 64px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; }
  .card + .card { margin-top: 14px; }
  .card h2 { font-size: 15px; font-weight: 700; color: var(--navy950); }
  .muted { color: var(--mute); font-size: 13px; }
  .row { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
  .grow { flex: 1 1 320px; min-width: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em;
       color: var(--mute); font-weight: 700; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  td { padding: 11px 10px; border-bottom: 1px solid #eef1f6; vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700;
          padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
  .pill.live { background: #ecfdf5; color: #065f46; }
  .pill.draft { background: #f1f5f9; color: #475569; }
  .pill.provisioning { background: #eff6ff; color: #1e40af; }
  .pill.suspended { background: #fef3c7; color: #92400e; }
  .pill.decommissioned { background: #f1f5f9; color: #64748b; }
  .pill.up { background: #ecfdf5; color: #065f46; }
  .pill.down { background: #fef2f2; color: #991b1b; }
  .pill.unknown { background: #f1f5f9; color: #64748b; }
  .tier { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .tier.municipal { color: var(--navy); }
  .tier.barangay { color: var(--green); }
  .btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px;
         font-weight: 600; border-radius: 10px; padding: 8px 14px; border: 1px solid var(--line);
         background: #fff; color: var(--navy950); cursor: pointer; text-decoration: none; }
  .btn:hover { background: #f8fafc; }
  .btn.primary { background: var(--navy); border-color: var(--navy); color: #fff; }
  .btn.primary:hover { background: #172e6e; }
  .btn.danger { background: #fff; border-color: #fecaca; color: #b91c1c; }
  .btn.danger:hover { background: #fef2f2; }
  label { display: block; margin-top: 14px; }
  label .lbl { display: block; font-size: 12.5px; font-weight: 700; color: var(--navy950); margin-bottom: 4px; }
  label .help { display: block; font-size: 12px; color: var(--mute); margin-top: 4px; }
  input[type=text], input[type=email], input[type=url], input[type=password], textarea, select {
    width: 100%; font: inherit; font-size: 13.5px; padding: 9px 11px; border: 1px solid var(--line);
    border-radius: 10px; background: #fbfcfe; color: #1b2235; }
  textarea { min-height: 76px; resize: vertical; }
  .err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 10px;
         padding: 10px 13px; font-size: 13px; margin-bottom: 14px; }
  .ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 10px;
        padding: 10px 13px; font-size: 13px; margin-bottom: 14px; }
  .warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 10px;
          padding: 11px 14px; font-size: 13px; }
  .note { border-left: 4px solid var(--gold); background: #fdfbf6; border-radius: 8px;
          padding: 11px 14px; font-size: 12.8px; color: #44506a; }
  pre { background: #0f172a; color: #e2e8f0; border-radius: 10px; padding: 14px 16px; overflow-x: auto;
        font-size: 12.3px; line-height: 1.6; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12.5px; }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; font-size: 13px; }
  .kv dt { color: var(--mute); }
  .kv dd { color: var(--navy950); font-weight: 500; word-break: break-word; }
  .counts { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
  .count { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: #fbfcfe; }
  .count b { display: block; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 19px;
             font-weight: 800; color: var(--navy950); }
  .count span { font-size: 11.5px; color: var(--mute); }
  .sub { font-size: 13px; color: var(--mute); margin-top: 4px; }
  .crumb { font-size: 13px; margin-bottom: 12px; }
  .crumb a { text-decoration: none; font-weight: 600; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; align-items: center; }
  .qrbox { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
  .qrbox .code { border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: #fff; }
  .qrbox .code svg { display: block; width: 168px; height: 168px; }
</style></head>
<body>
<header class="top"><div class="in">
  <span class="brand">eLGU <span>Owner</span></span>
  ${opts.user ? `<nav>
    <a href="/">Deployments</a>
    <a href="/activity">Activity</a>
    <a href="/password" class="who" style="color:#94a3c4;text-decoration:none">${esc(opts.user.name)}${opts.user.role === 'viewer' ? ' · read only' : ''}</a>
    <a href="/sign-out">Sign out</a>
  </nav>` : ''}
</div></header>
<main>${opts.body}</main>
</body></html>`
}

/** A status pill, in the one place its wording is decided. */
export function statusPill(status: string): string {
  return `<span class="pill ${esc(status)}">${esc(status)}</span>`
}

/**
 * How long ago, in words.
 *
 * "4 minutes ago" is what somebody reads a monitor for; a timestamp makes them
 * do arithmetic to find out whether a thing is broken right now.
 */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
