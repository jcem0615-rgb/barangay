import { useCallback, useEffect, useState } from 'react'
import {
  Home, Loader2, Plus, RefreshCw, Search, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { api, ApiError, type Household, type HouseholdMember } from '../../lib/api'
import { useAuth } from '../../lib/auth'

/**
 * The Record of Barangay Inhabitants.
 *
 * The Local Government Code makes the barangay secretary keep a record of every
 * inhabitant, and it is what a barangay actually plans from: who to feed, who
 * to evacuate, how many seniors live on which purok.
 *
 * **It is the one directory in this app**, which is why the figures sit at the
 * top: a register nobody can get an answer out of gets kept badly, and the
 * questions a barangay is asked are always counts. Everything is scoped
 * server-side to the barangay of the account reading it, and no member is
 * linked to a resident account — the register is the barangay's own compilation
 * of who lives where, which is exactly what stops it becoming a way to look up
 * anybody in the municipality.
 */

const RELATIONSHIPS = [
  'Head', 'Spouse', 'Son', 'Daughter', 'Parent', 'Grandparent', 'Grandchild',
  'Sibling', 'In-law', 'Relative', 'Boarder', 'Helper', 'Other',
]
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled']

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  moved: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-100 text-slate-500',
}

export default function BarangayHouseholds() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'barangay_admin'
  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<Household[]>([])
  const [figures, setFigures] = useState<Awaited<ReturnType<typeof api.householdFigures>> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, summary] = await Promise.all([
        api.households({ status: status || undefined, q: debounced || undefined }),
        api.householdFigures(),
      ])
      setRows(list)
      setFigures(summary)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the register.')
    } finally {
      setLoading(false)
    }
  }, [status, debounced])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <>
      {/* The counts first: these are the questions the register exists to answer. */}
      {figures && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {([
            ['Households', figures.households],
            ['Population', figures.population],
            ['Children', figures.children],
            ['Seniors', figures.seniors],
            ['PWD', figures.pwd],
            ['4Ps', figures.fourPs],
            ['Voters', figures.voters],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="font-display mt-0.5 text-[20px] font-extrabold tabular-nums text-navy-950">{value}</p>
            </div>
          ))}
        </div>
      )}
      {/*
        Said rather than hidden: an age band computed from birth dates silently
        omits everybody recorded without one, and a barangay planning a feeding
        programme off a short count is the harm.
      */}
      {figures && figures.withoutBirthDate > 0 && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
          {figures.withoutBirthDate} {figures.withoutBirthDate === 1 ? 'person has' : 'people have'} no
          date of birth recorded, so they are in the population but in none of the age counts.
        </p>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([['active', 'Active'], ['moved', 'Moved away'], ['archived', 'Archived'], ['', 'All']] as const).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
                status === key ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-slate-500'
              }`}
            >
              {label}
            </button>
          )
        )}
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="A name, or an address"
            aria-label="Search the register"
            className="w-[240px] rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-navy-600"
          />
        </div>
        <button
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          onClick={() => { setAdding(true); setSelectedId(null) }}
          className="flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-900"
        >
          <Plus size={14} /> New household
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          {!loading && rows.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Home size={28} className="text-slate-300" />
              <p className="mt-3 text-[13.5px] font-medium text-slate-400">No households here</p>
            </div>
          ) : (
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.06em] text-slate-400">
                  <th className="px-4 py-3 font-semibold">No.</th>
                  <th className="px-4 py-3 font-semibold">Head</th>
                  <th className="px-4 py-3 font-semibold">Address</th>
                  <th className="px-4 py-3 font-semibold">Purok</th>
                  <th className="px-4 py-3 font-semibold">Members</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => { setSelectedId(h.id); setAdding(false) }}
                    className={`cursor-pointer border-b border-slate-100 text-[13px] transition last:border-0 hover:bg-slate-50 ${
                      selectedId === h.id ? 'bg-navy-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 tabular-nums font-medium text-navy-800">{h.householdNo}</td>
                    <td className="px-4 py-3 text-navy-950">{h.headName}</td>
                    <td className="px-4 py-3 text-slate-600">{h.address}</td>
                    <td className="px-4 py-3 text-slate-600">{h.purok ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{h.memberCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_STYLE[h.status]}`}>
                        {h.status === 'moved' ? 'Moved away' : h.status === 'archived' ? 'Archived' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {adding ? (
          <NewHousehold onDone={() => { setAdding(false); void refresh() }} onCancel={() => setAdding(false)} />
        ) : (
          <HouseholdPanel id={selectedId} isAdmin={isAdmin} onChanged={() => void refresh()} />
        )}
      </div>
    </>
  )
}

function Field({
  label, value, onChange, optional, type = 'text', max,
}: {
  label: string; value: string; onChange: (e: { target: { value: string } }) => void
  optional?: boolean; type?: string; max?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600">
        {label} {optional && <span className="font-normal text-slate-400">— optional</span>}
      </span>
      <input
        value={value}
        onChange={onChange}
        type={type}
        max={max}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
      />
    </label>
  )
}

function NewHousehold({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ address: '', purok: '', headName: '', contact: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.addHousehold({
        address: form.address.trim(),
        purok: form.purok.trim() || undefined,
        headName: form.headName.trim(),
        contact: form.contact.trim() || undefined,
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[16px] font-bold text-navy-950">New household</h2>
        <button onClick={onCancel} aria-label="Cancel" className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>
      <p className="mt-2 rounded-xl bg-slate-50 px-3.5 py-3 text-[12px] leading-snug text-slate-600">
        The head is added as the first member. Add everybody else afterwards —
        the figures count members, not households.
      </p>
      <div className="mt-4 space-y-3">
        <Field label="Head of the household" value={form.headName} onChange={set('headName')} />
        <Field label="Address" value={form.address} onChange={set('address')} />
        <Field label="Purok or sitio" value={form.purok} onChange={set('purok')} optional />
        <Field label="Contact number" value={form.contact} onChange={set('contact')} optional />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">{error}</p>
      )}
      <button
        onClick={() => void submit()}
        disabled={busy || form.headName.trim().length < 2 || form.address.trim().length < 2}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
      >
        {busy && <Loader2 size={14} className="animate-spin" />} Add to the register
      </button>
    </aside>
  )
}

function HouseholdPanel({
  id, isAdmin, onChanged,
}: { id: string | null; isAdmin: boolean; onChanged: () => void }) {
  const [household, setHousehold] = useState<
    (Household & { notes: string | null; members: HouseholdMember[] }) | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [member, setMember] = useState({
    fullName: '', relationship: 'Son', birthDate: '', sex: '', civilStatus: '', occupation: '',
    isPwd: false, isFourPs: false, isVoter: false,
  })
  const [statusNote, setStatusNote] = useState('')

  const load = useCallback(async () => {
    if (!id) { setHousehold(null); return }
    setError(null)
    try {
      setHousehold(await api.household(id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open that household.')
    }
  }, [id])

  useEffect(() => {
    void load()
    setAddingMember(false)
    setStatusNote('')
  }, [load])

  if (!id) {
    return (
      <aside className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-[13px] text-slate-400">
        Pick a household, or add a new one.
      </aside>
    )
  }
  if (error && !household) {
    return <aside className="rounded-2xl bg-rose-50 p-5 text-[13px] text-rose-700">{error}</aside>
  }
  if (!household) {
    return (
      <aside className="rounded-2xl border border-slate-200 bg-white p-5">
        <Loader2 size={18} className="animate-spin text-slate-400" />
      </aside>
    )
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="font-mono text-[12px] text-slate-500">Household {household.householdNo}</p>
        <h2 className="font-display mt-1 text-[16px] font-bold text-navy-950">{household.headName}</h2>
        <p className="mt-0.5 text-[13px] text-slate-600">
          {household.address}{household.purok ? ` · ${household.purok}` : ''}
        </p>
        {household.contact && <p className="mt-0.5 text-[12.5px] text-slate-500">{household.contact}</p>}
        {household.statusNote && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-900">
            {household.statusNote}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-navy-950">
            <Users size={14} /> {household.members.length} in this household
          </h3>
          <button
            onClick={() => setAddingMember((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-navy-800 transition hover:bg-slate-50"
          >
            <UserPlus size={13} /> Add
          </button>
        </div>

        <ul className="mt-3 space-y-2">
          {household.members.map((m) => (
            <li key={m.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-navy-950">{m.fullName}</p>
                  <p className="text-[12px] text-slate-500">
                    {m.relationship}
                    {m.age !== null && ` · ${m.age}`}
                    {m.sex && ` · ${m.sex === 'female' ? 'F' : 'M'}`}
                    {m.occupation && ` · ${m.occupation}`}
                  </p>
                  {/*
                    These read as what they are — the barangay's own note. The
                    entitlement that carries a discount is CSWDO's record, and it
                    is not this.
                  */}
                  {(m.isPwd || m.isFourPs || m.isVoter) && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {m.isPwd && <Tag>PWD (noted)</Tag>}
                      {m.isFourPs && <Tag>4Ps (noted)</Tag>}
                      {m.isVoter && <Tag>Voter</Tag>}
                    </p>
                  )}
                </div>
                {m.relationship !== 'Head' && (
                  <button
                    onClick={() => void act(() => api.removeHouseholdMember(household.id, m.id))}
                    disabled={busy}
                    aria-label={`Remove ${m.fullName}`}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {addingMember && (
          <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
            <Field
              label="Full name"
              value={member.fullName}
              onChange={(e) => setMember((m) => ({ ...m, fullName: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-600">Relationship</span>
                <select
                  value={member.relationship}
                  onChange={(e) => setMember((m) => ({ ...m, relationship: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
                >
                  {RELATIONSHIPS.filter((r) => r !== 'Head').map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-600">Sex</span>
                <select
                  value={member.sex}
                  onChange={(e) => setMember((m) => ({ ...m, sex: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
                >
                  <option value="">—</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
            </div>
            <Field
              label="Date of birth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={member.birthDate}
              onChange={(e) => setMember((m) => ({ ...m, birthDate: e.target.value }))}
              optional
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-600">Civil status</span>
                <select
                  value={member.civilStatus}
                  onChange={(e) => setMember((m) => ({ ...m, civilStatus: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
                >
                  <option value="">—</option>
                  {CIVIL_STATUSES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <Field
                label="Occupation"
                value={member.occupation}
                onChange={(e) => setMember((m) => ({ ...m, occupation: e.target.value }))}
                optional
              />
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              {([['isPwd', 'PWD'], ['isFourPs', '4Ps'], ['isVoter', 'Voter']] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={member[key]}
                    onChange={(e) => setMember((m) => ({ ...m, [key]: e.target.checked }))}
                    className="h-4 w-4 accent-navy-800"
                  />
                  {label}
                </label>
              ))}
            </div>
            <button
              onClick={() => void act(async () => {
                await api.addHouseholdMember(household.id, {
                  fullName: member.fullName.trim(),
                  relationship: member.relationship,
                  birthDate: member.birthDate || undefined,
                  sex: (member.sex || undefined) as 'female' | 'male' | undefined,
                  civilStatus: member.civilStatus || undefined,
                  occupation: member.occupation.trim() || undefined,
                  isPwd: member.isPwd, isFourPs: member.isFourPs, isVoter: member.isVoter,
                })
                setMember({
                  fullName: '', relationship: 'Son', birthDate: '', sex: '', civilStatus: '',
                  occupation: '', isPwd: false, isFourPs: false, isVoter: false,
                })
                setAddingMember(false)
              })}
              disabled={busy || member.fullName.trim().length < 2}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-800 py-2 text-[12.5px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
            >
              {busy && <Loader2 size={13} className="animate-spin" />} Add to the household
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">{error}</p>
      )}

      {isAdmin && household.status === 'active' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-[13px] font-bold text-navy-950">Out of the active register</h3>
          <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
            Nothing is deleted. A household that moved away stays in the book, so
            this year's figures can be compared with last year's.
          </p>
          <label className="mt-2.5 block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">Why</span>
            <input
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-navy-600 focus:bg-white"
            />
          </label>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {([['moved', 'Moved away'], ['archived', 'Archive']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void act(() => api.setHouseholdStatus(household.id, value, statusNote.trim()))}
                disabled={busy || statusNote.trim().length === 0}
                className="rounded-xl border border-slate-200 py-2 text-[12.5px] font-semibold text-navy-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isAdmin && household.status !== 'active' && (
        <button
          onClick={() => void act(() => api.setHouseholdStatus(household.id, 'active'))}
          disabled={busy}
          className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-[12.5px] font-semibold text-navy-800 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Put back in the active register
        </button>
      )}
    </aside>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
      {children}
    </span>
  )
}
