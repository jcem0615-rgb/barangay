import { CloudOff } from 'lucide-react'
import { useT } from '../lib/i18n'

export default function OfflineBanner({ compact }: { compact?: boolean }) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800">
      <CloudOff size={16} className="shrink-0" />
      <p className="text-[12.5px] leading-snug">
        {compact ? t('common.offlineShort') : t('common.offline')}
      </p>
    </div>
  )
}
