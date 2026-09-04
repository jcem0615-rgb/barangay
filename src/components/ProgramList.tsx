import { AlertTriangle, HeartHandshake, Users } from 'lucide-react'
import type { ResidentProgram, SectoralProgram } from '../types'
import { useCatalogue } from '../lib/catalogue'
import { useT } from '../lib/i18n'

/**
 * The programmes the municipality has recorded for this resident, as shown on
 * the digital ID.
 *
 * Programme names, benefits and issuing offices come from the catalogue, not
 * the dictionaries — "Solo Parent" and "OSCA ID No." are what the office and
 * the physical card actually say, in either language.
 */
export default function ProgramList({ programs }: { programs: ResidentProgram[] }) {
  const { findProgram } = useCatalogue()
  const { t } = useT()

  if (programs.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[13px] font-bold text-navy-950">{t('programs.title')}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{t('programs.none')}</p>
      </div>
    )
  }

  // Pair each membership with its definition, dropping any the catalogue no
  // longer describes rather than rendering a bare code at the resident.
  const resolved = programs
    .map((p) => ({ record: p, def: findProgram(p.code) }))
    .filter((r): r is { record: ResidentProgram; def: SectoralProgram } => Boolean(r.def))

  const groups = [
    { kind: 'poverty_reduction' as const, heading: t('programs.povertyHeading'), Icon: HeartHandshake },
    { kind: 'sectoral' as const, heading: t('programs.sectoralHeading'), Icon: Users },
  ].map((g) => ({ ...g, items: resolved.filter((r) => r.def.kind === g.kind) }))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[13px] font-bold text-navy-950">{t('programs.title')}</p>
      <p className="mt-0.5 text-[11.5px] text-slate-500">{t('programs.subtitle')}</p>

      {groups
        .filter((g) => g.items.length > 0)
        .map(({ kind, heading, Icon, items }) => (
          <section key={kind} className="mt-4">
            <div className="flex items-center gap-1.5">
              <Icon size={13} className="text-navy-800" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-navy-800">{heading}</h3>
            </div>

            <ul className="mt-2 space-y-2.5">
              {items.map(({ record, def }) => (
                <li
                  key={record.code}
                  className={`rounded-xl border p-3 ${
                    record.expired ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <p className="text-[13px] font-bold leading-snug text-navy-950">{def.name}</p>

                  {def.idLabel && record.referenceNo && (
                    <p className="mt-1 text-[12px] text-slate-600">
                      <span className="text-slate-500">{def.idLabel} </span>
                      <span className="font-medium tabular-nums text-navy-950">{record.referenceNo}</span>
                    </p>
                  )}

                  <p className="mt-1.5 text-[11.5px] leading-snug text-slate-600">
                    <span className="font-medium text-navy-950">{t('programs.entitles')}: </span>
                    {def.benefit}
                  </p>

                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-dashed border-slate-200 pt-2 text-[11px]">
                    <div>
                      <dt className="text-slate-500">{t('programs.enrolledOn')}</dt>
                      <dd className="font-medium text-navy-950">{formatDate(record.enrolledOn)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t('programs.validUntil')}</dt>
                      <dd className="font-medium text-navy-950">
                        {record.validUntil ? formatDate(record.validUntil) : t('programs.noExpiry')}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-slate-500">{t('programs.issuedBy')}</dt>
                      <dd className="font-medium text-navy-950">{def.issuingOffice}</dd>
                    </div>
                  </dl>

                  {record.expired && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-800">
                      <AlertTriangle size={13} className="shrink-0" />
                      {t('programs.expired')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}

/** Dates come from Postgres as plain YYYY-MM-DD, with no timezone to shift. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}
