import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { CertificateType } from '../lib/api'
import { formatPeso } from '../lib/money'

/**
 * Adding, editing and withdrawing a certificate — the same screen for both
 * tiers, because they are doing the same thing to the same table.
 *
 * The only difference is which rows the caller owns, and that arrives as
 * `canEdit`. Writing this twice would have meant two validation rules and two
 * sets of wording for the same act, and the half that drifted would have been
 * whichever one got less use.
 *
 * **Withdraw, never delete**, and the wording says so: an issued certificate has
 * to keep rendering its own name, so a row leaves the resident's list and stays
 * in the table. "Delete" would promise something the database will not do.
 */

export interface CatalogueDraft {
  name: string
  description: string
  fee: string
  validityDays: string
  attestation: string
}

const EMPTY: CatalogueDraft = {
  name: '', description: '', fee: '0', validityDays: '', attestation: '',
}

/** What the renderer can fill in. Anything else is refused at the save. */
const PLACEHOLDERS = [
  ['{name}', "the resident's full name"],
  ['{residence}', 'their address and barangay, or just the barangay'],
  ['{barangay}', 'the barangay'],
  ['{municipality}', 'the municipality'],
  ['{province}', 'the province'],
  ['{purpose}', 'what the resident said it is for'],
  ['{date}', 'the date it was released'],
] as const

export default function CertificateCatalogue({
  rows, canEdit, busy, error, note, onAdd, onEdit, onWithdraw,
}: {
  rows: CertificateType[]
  canEdit: (row: CertificateType) => boolean
  busy: boolean
  error: string | null
  note: React.ReactNode
  onAdd: (draft: CatalogueDraft) => Promise<void>
  onEdit: (id: string, draft: CatalogueDraft) => Promise<void>
  onWithdraw: (id: string, restore: boolean) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<CatalogueDraft>(EMPTY)

  const ready =
    draft.name.trim().length >= 3 &&
    draft.description.trim().length >= 10 &&
    Number.isFinite(Number(draft.fee)) && Number(draft.fee) >= 0

  const startEdit = (row: CertificateType) => {
    setAdding(false)
    setEditing(row.id)
    setDraft({
      name: row.name,
      description: row.description,
      fee: String(row.fee),
      validityDays: row.validityDays === null ? '' : String(row.validityDays),
      attestation: row.attestation ?? '',
    })
  }

  const submit = async () => {
    if (editing) await onEdit(editing, draft)
    else await onAdd(draft)
    setAdding(false)
    setEditing(null)
    setDraft(EMPTY)
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 rounded-xl bg-navy-50 px-4 py-3 text-[12.5px] leading-snug text-navy-900">
        {note}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</p>
      )}

      {(adding || editing) && (
        <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[13px] font-bold text-navy-950">
            {editing ? 'Edit this certificate' : 'Add a certificate'}
          </p>
          <Field label="Name" help="What a resident will ask for at the counter.">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className={INPUT}
            />
          </Field>
          <Field label="What it is for" help="One or two sentences, as a resident would read them.">
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={2}
              className={INPUT}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fee (₱)" help="0 for a certificate issued free.">
              <input
                value={draft.fee}
                onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))}
                inputMode="decimal"
                className={INPUT}
              />
            </Field>
            <Field
              label="Good for (days)"
              help="Leave blank if your office states no validity period — residents are told that in those words."
            >
              <input
                value={draft.validityDays}
                onChange={(e) => setDraft((d) => ({ ...d, validityDays: e.target.value }))}
                inputMode="numeric"
                placeholder="e.g. 180"
                className={INPUT}
              />
            </Field>
          </div>
          {/*
            The text of the document itself, which is the half that was missing:
            a letterhead with a generic sentence under it is not a clearance.
          */}
          {/*
            Not a <Field>: that puts its help line after the children, and the
            two things below the box have to read in order — what it is, then
            what it can fill in, then the warning.
          */}
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-navy-950">
              What the certificate says
            </span>
            <textarea
              value={draft.attestation}
              onChange={(e) => setDraft((d) => ({ ...d, attestation: e.target.value }))}
              rows={8}
              placeholder={'This is to certify that {name} is a bona fide resident of {residence}…'}
              className={`${INPUT} font-mono text-[12px] leading-relaxed`}
            />
            <span className="mt-1 block text-[11.5px] leading-snug text-slate-500">
              The wording printed on the certificate itself. Leave it blank and it falls back
              to a plain sentence saying only that this barangay issued it. Separate
              paragraphs with a blank line.
            </span>
            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {PLACEHOLDERS.map(([token, meaning]) => (
                <span key={token} className="text-[11px] text-slate-500">
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-navy-800">{token}</code>{' '}
                  {meaning}
                </span>
              ))}
            </span>
            <span className="mt-2 block rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-900">
              This is the barangay's own statement. Nothing here checks it — a clearance
              saying the holder has no pending case says so because the office releasing it
              says so, not because the app looked.
            </span>
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => void submit()}
              disabled={!ready || busy}
              className="flex items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Save changes' : 'Add it'}
            </button>
            <button
              onClick={() => { setAdding(false); setEditing(null); setDraft(EMPTY) }}
              className="text-[13px] font-medium text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!adding && !editing && (
        <button
          onClick={() => { setAdding(true); setDraft(EMPTY) }}
          className="mb-4 flex items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-navy-900"
        >
          <Plus size={15} /> Add a certificate
        </button>
      )}

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-navy-950">
                {row.name}
                {!row.active && (
                  <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    Withdrawn
                  </span>
                )}
                {/* Said on the row rather than in a legend: which catalogue a
                    document belongs to is what decides who may change it. */}
                {row.barangayId === null ? (
                  <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-800">
                    Shared
                  </span>
                ) : (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Ours
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{row.description}</p>
              <p className="mt-1 text-[12px] text-slate-500">
                {row.fee > 0 ? formatPeso(row.fee) : 'Free'}
                {' · '}
                {row.validityDays === null ? 'no stated validity' : `good for ${row.validityDays} days`}
              </p>
            </div>
            {canEdit(row) && (
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => startEdit(row)}
                  aria-label={`Edit ${row.name}`}
                  className="text-[12px] font-medium text-navy-800 hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => void onWithdraw(row.id, !row.active)}
                  aria-label={`${row.active ? 'Withdraw' : 'Restore'} ${row.name}`}
                  className={`text-[12px] font-medium hover:underline ${
                    row.active ? 'text-rose-700' : 'text-navy-800'
                  }`}
                >
                  {row.active ? 'Withdraw' : 'Restore'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] text-navy-950 outline-none focus:border-navy-600 focus:bg-white'

function Field({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-navy-950">{label}</span>
      {children}
      <span className="mt-1 block text-[11.5px] leading-snug text-slate-500">{help}</span>
    </label>
  )
}
