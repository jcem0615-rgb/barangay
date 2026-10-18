import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, Building2, CalendarDays, Loader2, Phone, Plus, ReceiptText, Trash2,
  FileText,
} from 'lucide-react'
import MarkUpload, { SignatureCaveat } from '../../components/MarkUpload'
import CertificateCatalogue, { type CatalogueDraft } from '../../components/CertificateCatalogue'
import {
  api, ApiError,
  type AuditRow, type CertificateType, type Holiday, type Hotline,
  type MunicipalityDetails, type OfficeContact,
} from '../../lib/api'

/**
 * The municipality's own data, and the only screen in the app that can correct
 * it.
 *
 * Hotlines, the holiday calendar and each office's address were seeded and then
 * unreachable: fixing a wrong number meant editing the source and reseeding the
 * database, which is not something a municipality can do, so in practice the
 * numbers stayed wrong. That matters most for the hotlines — a number that
 * rings nowhere is worse than none at all, because a resident trusts it in the
 * moment they can least afford to.
 *
 * Every change here is audited server-side with the old value kept, and the
 * trail is on this screen rather than hidden in the database. An administrator
 * who mistypes the fire hotline needs the old number back, not a note that
 * somebody changed something.
 */
type Tab = 'hotlines' | 'holidays' | 'offices' | 'receipt' | 'certificates' | 'audit'

export default function StaffMunicipality() {
  const [tab, setTab] = useState<Tab>('hotlines')

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([
          ['hotlines', 'Emergency hotlines', Phone],
          ['holidays', 'Holiday calendar', CalendarDays],
          ['offices', 'Office details', Building2],
          ['receipt', 'Official receipt', ReceiptText],
          ['certificates', 'Barangay certificates', FileText],
          ['audit', 'What changed', AlertTriangle],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === key ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'hotlines' && <Hotlines />}
      {tab === 'holidays' && <Holidays />}
      {tab === 'offices' && <Offices />}
      {tab === 'receipt' && <Receipt />}
      {tab === 'certificates' && <SharedCertificates />}
      {tab === 'audit' && <Audit />}
    </div>
  )
}

/* ---------------------------------------------------------------- hotlines */

const BLANK: Hotline = { id: '', label: '', agency: '', phone: '', isNational: false, sortOrder: 0 }

function Hotlines() {
  const [rows, setRows] = useState<Hotline[]>([])
  const [draft, setDraft] = useState<Hotline | null>(null)
  const { loading, error, setError, run, reload } = useLoader(
    useCallback(async () => setRows(await api.listHotlines()), [])
  )

  const save = (row: Hotline) =>
    run(async () => {
      const body = { label: row.label, agency: row.agency, phone: row.phone, isNational: row.isNational, sortOrder: row.sortOrder }
      if (row.id) await api.updateHotline(row.id, body)
      else await api.createHotline(body)
      setDraft(null)
      await reload()
    })

  return (
    <Panel
      title="Emergency hotlines"
      blurb="These print on every resident's digital ID and are cached on their phone, so they answer with no signal. Ring each one before you save it: a hotline that goes nowhere is worse than none at all, because a resident will trust it in the moment they can least afford to."
      error={error}
      loading={loading}
      action={
        <button
          onClick={() => setDraft({ ...BLANK })}
          className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white active:bg-navy-900"
        >
          <Plus size={13} /> Add a hotline
        </button>
      }
    >
      {draft && <HotlineForm row={draft} onChange={setDraft} onSave={() => save(draft)} onCancel={() => setDraft(null)} />}

      {(['municipal', 'nationwide'] as const).map((group) => {
        const groupRows = rows.filter((r) => r.isNational === (group === 'nationwide'))
        if (groupRows.length === 0) return null
        return (
          <section key={group} className="mt-4 first:mt-0">
            <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              {group === 'municipal' ? 'This municipality' : 'Nationwide'}
            </h3>
            <ul className="space-y-2">
              {groupRows.map((row) => (
                <HotlineRow
                  key={row.id}
                  row={row}
                  onSave={save}
                  onDelete={() => run(async () => { await api.deleteHotline(row.id); await reload() })}
                  setError={setError}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </Panel>
  )
}

function HotlineRow({
  row, onSave, onDelete, setError,
}: {
  row: Hotline
  onSave: (row: Hotline) => Promise<boolean>
  onDelete: () => Promise<boolean>
  setError: (message: string | null) => void
}) {
  const [editing, setEditing] = useState<Hotline | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (editing) {
    return (
      <li>
        <HotlineForm
          row={editing}
          onChange={setEditing}
          // Closed only on success, so a rejected number stays on screen to fix.
          onSave={() => { void onSave(editing).then((ok) => { if (ok) setEditing(null) }) }}
          onCancel={() => setEditing(null)}
        />
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-navy-950">{row.label}</p>
        <p className="text-[12.5px] text-slate-600">{row.agency}</p>
      </div>
      <a href={`tel:${row.phone.replace(/\s/g, '')}`} className="font-display text-[15px] font-bold text-navy-800 hover:underline">
        {row.phone}
      </a>
      <div className="flex gap-2">
        <button onClick={() => { setError(null); setEditing({ ...row }) }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50">
          Edit
        </button>
        {confirming ? (
          <>
            <button onClick={() => void onDelete()} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">
              Remove it
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] text-slate-600">
              Keep
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${row.label}`}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  )
}

function HotlineForm({
  row, onChange, onSave, onCancel,
}: {
  row: Hotline
  onChange: (row: Hotline) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="mb-3 rounded-xl border border-navy-100 bg-navy-50 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="What a resident is looking for">
          <Input value={row.label} onChange={(v) => onChange({ ...row, label: v })} placeholder="Fire" />
        </Field>
        <Field label="Who answers it">
          <Input value={row.agency} onChange={(v) => onChange({ ...row, agency: v })} placeholder="Bureau of Fire Protection — Malasiqui" />
        </Field>
        <Field label="Number">
          <Input value={row.phone} onChange={(v) => onChange({ ...row, phone: v })} placeholder="(075) 961-2410" />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700">
        <input
          type="checkbox"
          checked={row.isNational}
          onChange={(e) => onChange({ ...row, isNational: e.target.checked })}
          className="h-4 w-4"
        />
        Nationwide, not this municipality — listed separately so a resident can see what still answers if the local line is down
      </label>
      <div className="mt-3 flex gap-2">
        <button onClick={onSave} className="rounded-xl bg-navy-800 px-4 py-2 text-[13px] font-semibold text-white active:bg-navy-900">
          Save
        </button>
        <button onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600">
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- holidays */

function Holidays() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [rows, setRows] = useState<Holiday[]>([])
  const [draft, setDraft] = useState<Holiday | null>(null)
  const { loading, error, run, reload } = useLoader(
    useCallback(async () => setRows(await api.listHolidays(year)), [year])
  )

  return (
    <Panel
      title="Holiday calendar"
      blurb="Every date the app promises a resident is counted in working days over this calendar, so a missing holiday quietly promises a day the hall is shut. National holidays move each year by proclamation — check this list against the year's proclamation, and replace the local rows with the days this municipality actually declares."
      error={error}
      loading={loading}
      action={
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px]"
            aria-label="Year"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setDraft({ date: `${year}-01-01`, name: '', isLocal: true })}
            className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white active:bg-navy-900"
          >
            <Plus size={13} /> Declare a day
          </button>
        </div>
      }
    >
      {draft && (
        <div className="mb-3 rounded-xl border border-navy-100 bg-navy-50 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Date">
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-navy-600"
              />
            </Field>
            <Field label="What it is">
              <Input value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="Founding Anniversary" />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={draft.isLocal} onChange={(e) => setDraft({ ...draft, isLocal: e.target.checked })} className="h-4 w-4" />
            Declared by this municipality, not a national holiday
          </label>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => { void run(async () => { await api.saveHoliday(draft); await reload() }).then((ok) => { if (ok) setDraft(null) }) }}
              className="rounded-xl bg-navy-800 px-4 py-2 text-[13px] font-semibold text-white active:bg-navy-900"
            >
              Save
            </button>
            <button onClick={() => setDraft(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>Nothing is declared for {year}. Every day is a working day, which is almost certainly wrong.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {rows.map((row) => (
            <li key={row.date} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <p className="font-display w-28 shrink-0 text-[13.5px] font-bold tabular-nums text-navy-950">
                {new Date(`${row.date}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', weekday: 'short' })}
              </p>
              <p className="min-w-0 flex-1 text-[13.5px] text-navy-950">{row.name}</p>
              <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${row.isLocal ? 'bg-gold-100 text-navy-900' : 'bg-slate-100 text-slate-600'}`}>
                {row.isLocal ? 'Declared here' : 'National'}
              </span>
              <button
                onClick={() => run(async () => { await api.deleteHoliday(row.date); await reload() })}
                aria-label={`Remove ${row.name}`}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ----------------------------------------------------------------- offices */

function Offices() {
  const [rows, setRows] = useState<OfficeContact[]>([])
  const { loading, error, run, reload } = useLoader(
    useCallback(async () => setRows(await api.listOffices()), [])
  )

  return (
    <Panel
      title="Office details"
      blurb="Where to find an office when the app cannot help — a resident whose permit is stuck needs an address, an opening time and a number to ring — and who signs what it releases. What an office is called and what it offers is the service catalogue, and is not editable here."
      error={error}
      loading={loading}
    >
      <SignatureCaveat />
      <ul className="space-y-3">
        {rows.map((row) => (
          <OfficeRow
            key={row.id}
            row={row}
            onSave={(patch) => run(async () => { await api.updateOffice(row.id, patch); await reload() })}
            onChanged={reload}
          />
        ))}
      </ul>
    </Panel>
  )
}

function OfficeRow({
  row, onSave, onChanged,
}: {
  row: OfficeContact
  onSave: (patch: Partial<OfficeContact>) => Promise<boolean>
  onChanged: () => Promise<void>
}) {
  const [edit, setEdit] = useState(row)
  useEffect(() => setEdit(row), [row])
  const dirty =
    edit.address !== row.address || edit.hours !== row.hours ||
    edit.phone !== row.phone || edit.email !== row.email ||
    edit.headName !== row.headName || edit.headTitle !== row.headTitle

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-display text-[14px] font-bold text-navy-950">{row.officeName}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Address">
          <Input value={edit.address ?? ''} onChange={(v) => setEdit({ ...edit, address: v || null })} placeholder="2F Municipal Hall, Poblacion" />
        </Field>
        <Field label="Opening hours">
          <Input value={edit.hours ?? ''} onChange={(v) => setEdit({ ...edit, hours: v || null })} placeholder="Mon–Fri, 8:00 AM – 5:00 PM" />
        </Field>
        <Field label="Phone">
          <Input value={edit.phone ?? ''} onChange={(v) => setEdit({ ...edit, phone: v || null })} placeholder="(075) 961-2400" />
        </Field>
        <Field label="Email">
          <Input value={edit.email ?? ''} onChange={(v) => setEdit({ ...edit, email: v || null })} placeholder="treasury@malasiqui.gov.ph" />
        </Field>
        {/*
          Who holds the office, which is what gets printed on what the office
          releases — the same kind of fact as the barangay's captain and
          secretary, and it changes when somebody leaves the post.
        */}
        <Field label="Who signs (name)">
          <Input value={edit.headName ?? ''} onChange={(v) => setEdit({ ...edit, headName: v || null })} placeholder="Nobody is named yet" />
        </Field>
        <Field label="Their title">
          <Input value={edit.headTitle ?? ''} onChange={(v) => setEdit({ ...edit, headTitle: v || null })} placeholder={row.officeName} />
        </Field>
      </div>
      {dirty && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => void onSave({
              address: edit.address, hours: edit.hours, phone: edit.phone, email: edit.email,
              headName: edit.headName, headTitle: edit.headTitle,
            })}
            className="rounded-xl bg-navy-800 px-4 py-2 text-[13px] font-semibold text-white active:bg-navy-900"
          >
            Save changes
          </button>
          <button onClick={() => setEdit(row)} className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600">
            Discard
          </button>
        </div>
      )}

      <div className="mt-3">
        <MarkUpload
          title="Signature"
          shape="wide"
          blurb={
            row.headName
              ? `Printed above ${row.headName}'s name on every document this office releases. Leave it empty and the document prints the rule and the title, so the paper can still be signed by hand.`
              : 'Printed on every document this office releases, above whoever is named above. Name somebody first — a signature with no name under it is not worth much on a counter.'
          }
          present={row.hasSignature}
          updatedAt={row.signatureUpdatedAt}
          keepsNote="Documents released before now keep the signature they were printed with."
          load={() => api.officeSignature(row.id)}
          upload={(file) => api.uploadOfficeSignature(row.id, file)}
          remove={() => api.removeOfficeSignature(row.id)}
          onChanged={onChanged}
        />
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------- audit */

function Audit() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const { loading, error } = useLoader(
    useCallback(async () => setRows(await api.auditTrail(100)), [])
  )

  return (
    <Panel
      title="What changed"
      blurb="Every change on this screen, newest first, with the value it used to be. This is the whole safety net: an administrator can point the fire hotline anywhere, and the defence against a mistake nobody notices is a record with the old number still in it."
      error={error}
      loading={loading}
    >
      {rows.length === 0 ? (
        <Empty>Nothing has been changed yet.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[13.5px] font-semibold text-navy-950">{describe(row)}</p>
                <p className="text-[12px] text-slate-500">
                  {row.actorName} · {new Date(row.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <Diff before={row.before} after={row.after} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const ACTIONS: Record<string, string> = {
  'hotline.create': 'Added a hotline',
  'hotline.update': 'Corrected a hotline',
  'hotline.delete': 'Withdrew a hotline',
  'holiday.create': 'Declared a non-working day',
  'holiday.update': 'Corrected a non-working day',
  'holiday.delete': 'Removed a non-working day',
  'office.update': 'Updated office details',
  'municipality.update': 'Changed what the official receipt says',
  'municipality.seal.update': 'Uploaded a new municipal seal',
  'municipality.seal.remove': 'Removed the municipal seal',
  'municipality.signature.update': "Uploaded a new treasurer's signature",
  'municipality.signature.remove': "Removed the treasurer's signature",
  'office.signature.update': "Uploaded a new office head's signature",
  'office.signature.remove': "Removed an office head's signature",
}

const describe = (row: AuditRow) => `${ACTIONS[row.action] ?? row.action} — ${row.target}`

/** The fields worth reading back, in the order someone checking would want them. */
const READABLE = [
  'label', 'agency', 'phone', 'name', 'officeName', 'address', 'hours', 'email',
  'isLocal', 'isNational',
  'website', 'tin', 'treasurerName', 'treasurerTitle', 'receiptPrefix',
  'receiptFormLabel', 'receiptFooter', 'hasSeal', 'hasTreasurerSignature',
  'headName', 'headTitle', 'hasSignature',
] as const

const show = (value: unknown) =>
  value === null || value === undefined || value === '' ? '—' : String(value)

function summarize(value: Record<string, unknown>): string {
  const parts = READABLE
    .filter((k) => value[k] !== undefined && value[k] !== null && value[k] !== '')
    .map((k) => String(value[k]))
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(value)
}

/**
 * On an edit, only the fields that actually moved.
 *
 * Printing the whole row twice is complete but useless for the job this screen
 * exists to do — someone scanning for the mistake nobody noticed should not
 * have to diff two long lines of office address by eye. A create or a deletion
 * has nothing to compare against, so those print in full.
 */
function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (before && after) {
    const changed = READABLE.filter((k) => k in before && k in after && before[k] !== after[k])
    if (changed.length === 0) {
      return <p className="mt-1 text-[12.5px] text-slate-500">No visible change.</p>
    }
    return (
      <ul className="mt-1 space-y-0.5">
        {changed.map((key) => (
          <li key={key} className="text-[12.5px] leading-snug text-slate-600">
            <span className="font-medium text-slate-500">{key}:</span>{' '}
            <span className="text-slate-500 line-through">{show(before[key])}</span>{' '}
            <span aria-hidden="true">→</span>{' '}
            <span className="font-semibold text-navy-950">{show(after[key])}</span>
          </li>
        ))}
      </ul>
    )
  }
  const only = after ?? before
  if (!only) return null
  return (
    <p className="mt-1 text-[12.5px] leading-snug text-slate-600">
      {after ? 'Added: ' : 'Was: '}
      <span className="text-navy-950">{summarize(only)}</span>
    </p>
  )
}

/* ------------------------------------------------------------------ shared */

/**
 * Load-on-mount plus a place for the one error message a panel can show.
 * `run` reloads after a write and keeps the failure on screen if one refuses.
 */
function useLoader(load: () => Promise<void>) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load that.')
    } finally {
      setLoading(false)
    }
  }, [load])

  useEffect(() => { void reload() }, [reload])

  /**
   * Returns whether the write went through. Callers need that: a form that
   * closes on a rejected save throws away what the administrator typed and
   * leaves them re-entering a number they have just been told is wrong.
   */
  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
      return false
    }
  }, [])

  return { loading, error, setError, run, reload }
}

function Panel({
  title, blurb, error, loading, action, children,
}: {
  title: string
  blurb: string
  error: string | null
  loading: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-display text-[15px] font-bold text-navy-950">{title}</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">{blurb}</p>
        </div>
        {action}
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{error}</p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 py-10 text-[13px] text-slate-500">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      ) : (
        children
      )}
    </div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-[13px] text-slate-600">
    {children}
  </p>
)

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
    {children}
  </label>
)

const Input = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none placeholder:text-slate-400 focus:border-navy-600"
  />
)


/* ----------------------------------------------------------------- receipt */

/**
 * What an official receipt says, and the seal printed on it.
 *
 * Every field here is on a document a resident keeps and may be asked to
 * produce years later, which is why it is editable at all: a seeded TIN, a
 * seeded address and a treasurer who left office two elections ago are exactly
 * the sort of thing nobody can correct by reseeding a database.
 *
 * What is *not* editable is the municipality's own name and province. Those
 * belong to the register — the same rule a barangay's name follows one tier
 * down — so they are shown and locked rather than left out, because an
 * administrator looking for them should find out why rather than wonder.
 */
function Receipt() {
  const [row, setRow] = useState<MunicipalityDetails | null>(null)
  const [edit, setEdit] = useState<MunicipalityDetails | null>(null)
  const { loading, error, setError, run, reload } = useLoader(
    useCallback(async () => {
      const next = await api.municipalityDetails()
      setRow(next)
      setEdit(next)
    }, [])
  )

  const dirty = !!row && !!edit && FIELDS.some(([key]) => (edit[key] ?? '') !== (row[key] ?? ''))

  return (
    <Panel
      title="Official receipt"
      blurb="What every electronic official receipt this municipality issues will say, and the seal printed on it. A receipt already issued keeps the details it was printed with — changing these affects the next one, never one somebody is already holding."
      error={error}
      loading={loading}
    >
      {edit && row && (
        <div className="space-y-4">
          {/* The seal and the treasurer's signature */}
          <MarkUpload
            title="Municipal seal"
            blurb="Printed at the head of every receipt and faintly behind it — and on every document the offices release. PNG or JPEG only: those are the two a PDF can actually be printed with, so anything else is refused rather than accepted and silently left off. A transparent PNG looks best."
            present={row.hasSeal}
            updatedAt={row.sealUpdatedAt}
            keepsNote="Receipts and documents issued before now keep the seal they were printed with."
            load={api.municipalSeal}
            upload={(file) => api.uploadMunicipalSeal(file)}
            remove={() => api.removeMunicipalSeal()}
            onChanged={reload}
          />

          <SignatureCaveat />

          <MarkUpload
            title="Treasurer's signature"
            shape="wide"
            blurb={`Printed above ${row.treasurerName ?? 'the treasurer'}'s name on every receipt. Scan it on white paper and upload a transparent PNG if you can — a photograph with a grey background prints as a grey box. Leave it empty and the receipt prints the rule and the title, so a printout can still be signed by hand.`}
            present={row.hasTreasurerSignature}
            updatedAt={row.treasurerSignatureUpdatedAt}
            keepsNote="Receipts issued before now keep the signature they were printed with."
            load={api.treasurerSignature}
            upload={(file) => api.uploadTreasurerSignature(file)}
            remove={() => api.removeTreasurerSignature()}
            onChanged={reload}
          />

          {/* The municipality, as it is printed */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-display text-[14px] font-bold text-navy-950">Printed on the receipt</p>
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
              <span className="font-semibold text-navy-950">{row.name}, {row.province}</span>
              {' '}comes from this deployment's register and is not editable here — what a place
              is called is not a thing an administrator retypes.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {FIELDS.map(([key, label, placeholder, hint]) => (
                <Field key={key} label={label}>
                  <Input
                    value={edit[key] ?? ''}
                    onChange={(v) => setEdit({ ...edit, [key]: v || null })}
                    placeholder={placeholder}
                  />
                  {hint && <span className="text-[11.5px] leading-snug text-slate-500">{hint}</span>}
                </Field>
              ))}
            </div>
            {dirty && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void run(async () => {
                    await api.updateMunicipality(
                      Object.fromEntries(FIELDS.map(([key]) => [key, edit[key]])) as never
                    )
                    await reload()
                  })}
                  className="rounded-xl bg-navy-800 px-4 py-2 text-[13px] font-semibold text-white active:bg-navy-900"
                >
                  Save changes
                </button>
                <button
                  onClick={() => { setEdit(row); setError(null) }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600"
                >
                  Discard
                </button>
              </div>
            )}
          </div>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-snug text-amber-900">
            <strong className="font-semibold">An official receipt is an accountable form.</strong>{' '}
            This app issues a receipt for a payment its own payment provider confirmed. Whether
            that stands as this municipality's Official Receipt depends on the authority the
            municipality holds to issue one electronically — BIR accreditation where it applies,
            and COA concurrence for the form itself. Leave the accountable form number blank
            until you have been issued one; a number nobody authorised is worse than none.
          </p>
        </div>
      )}
    </Panel>
  )
}

/** The editable fields, in the order somebody filling this in would want them. */
const FIELDS = [
  ['address', 'Municipal hall address', 'Municipal Hall, Poblacion, Malasiqui, Pangasinan 2421', null],
  ['phone', 'Telephone', '(075) 632-0000', 'Ring it before saving. A number that rings nowhere is worse than none.'],
  ['email', 'Email', 'treasury@malasiqui.gov.ph', null],
  ['website', 'Website', 'malasiqui.gov.ph', null],
  ['tin', 'TIN', '000-000-000-00000', 'The municipality\'s own, as the BIR issued it.'],
  ['treasurerName', 'Treasurer', 'Aurelio B. Mendoza', 'The name the receipt is issued over. It changes with the office.'],
  ['treasurerTitle', 'Title', 'Municipal Treasurer', null],
  ['receiptPrefix', 'Receipt series prefix', 'OR', 'Capitals, digits and hyphens. Numbering continues; changing this never renumbers a receipt already issued.'],
  ['receiptFormLabel', 'Accountable form number', 'Accountable Form No. 51', 'Leave blank unless the municipality has been issued one. Nothing is printed when it is blank.'],
  ['receiptFooter', 'Footer note', 'Keep this receipt. Present it when claiming your document at the counter.', null],
] as const satisfies ReadonlyArray<
  readonly [keyof MunicipalityDetails, string, string, string | null]
>

/**
 * The shared barangay certificate catalogue.
 *
 * It lives on the Municipality tab rather than anywhere barangay-shaped because
 * that is what it is: a fact about what this municipality's barangays issue,
 * alongside its hotlines, its holidays and its offices. Adding one here puts it
 * on every barangay's list at once, which is exactly why it is not a barangay's
 * to add — and why the panel says so before the button.
 */
function SharedCertificates() {
  const [rows, setRows] = useState<CertificateType[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await api.sharedCertificates())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the catalogue.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  const toBody = (draft: CatalogueDraft) => ({
    name: draft.name.trim(),
    description: draft.description.trim(),
    fee: Number(draft.fee),
    validityDays: draft.validityDays.trim() === '' ? null : Number(draft.validityDays),
    // Blank clears it back to the plain sentence, which is a change rather than
    // "leave it alone" — the same shape validityDays has one line up.
    attestation: draft.attestation.trim() === '' ? null : draft.attestation,
  })

  return (
    <CertificateCatalogue
      rows={rows}
      canEdit={() => true}
      busy={busy}
      error={error}
      note={
        <>
          The documents <strong>every barangay</strong> issues. Adding one here puts it on
          all of their lists at once at the fee you set, which each barangay then
          overrides for itself &mdash; that blast radius is why this is the hall&rsquo;s
          and not a barangay&rsquo;s. A document only one barangay issues belongs in that
          barangay&rsquo;s own console instead. Withdrawing removes it from residents&rsquo;
          lists without deleting it, so certificates already issued keep their name, and
          the treasury sees every change you make here.
        </>
      }
      onAdd={(draft) => run(() => api.addSharedCertificate(toBody(draft)))}
      onEdit={(id, draft) => run(() => api.editSharedCertificate(id, toBody(draft)))}
      onWithdraw={(id, restore) => run(() => api.withdrawSharedCertificate(id, restore))}
    />
  )
}
