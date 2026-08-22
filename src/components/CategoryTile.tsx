import { ChevronRight } from 'lucide-react'
import type { ServiceCategory } from '../types'
import { resolveIcon } from '../lib/icons'

export default function CategoryTile({ category, onTap }: { category: ServiceCategory; onTap: () => void }) {
  const Icon = resolveIcon(category.icon)
  return (
    <button
      onClick={onTap}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm shadow-slate-900/[0.02] transition active:scale-[0.99] active:bg-slate-50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
        <Icon size={21} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[14.5px] font-bold text-navy-950">{category.name}</span>
        <span className="mt-0.5 block truncate text-[12px] text-slate-500">{category.description}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-slate-300" />
    </button>
  )
}
