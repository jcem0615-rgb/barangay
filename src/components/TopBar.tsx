import { ChevronLeft } from 'lucide-react'
import { useNav } from '../lib/nav'
import type { ReactNode } from 'react'

interface TopBarProps {
  title: string
  subtitle?: string
  transparent?: boolean
  right?: ReactNode
}

export default function TopBar({ title, subtitle, transparent, right }: TopBarProps) {
  const { canGoBack, pop } = useNav()

  return (
    <header
      className={`sticky top-0 z-20 flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] ${
        transparent ? 'bg-transparent' : 'border-b border-slate-200 bg-white/95 backdrop-blur'
      }`}
    >
      {canGoBack ? (
        <button
          onClick={pop}
          aria-label="Go back"
          className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-navy-900 active:bg-slate-100"
        >
          <ChevronLeft size={22} />
        </button>
      ) : (
        <div className="w-9" />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[calc(17px_*_var(--text-scale))] font-bold text-navy-950">{title}</h1>
        {subtitle && <p className="truncate text-[calc(13px_*_var(--text-scale))] text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}
