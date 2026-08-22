import { CloudOff } from 'lucide-react'

export default function OfflineBanner({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800">
      <CloudOff size={16} className="shrink-0" />
      <p className="text-[12.5px] leading-snug">
        {compact
          ? "You're offline. Changes are saved on this device."
          : "You're offline. Forms you submit now are saved as drafts on this device and will send automatically once you're back online."}
      </p>
    </div>
  )
}
