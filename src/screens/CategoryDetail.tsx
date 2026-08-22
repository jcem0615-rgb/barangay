import TopBar from '../components/TopBar'
import ServiceListItem from '../components/ServiceListItem'
import { SERVICE_CATEGORIES, SERVICES } from '../data/mockData'
import { useNav, type Screen } from '../lib/nav'
import { resolveIcon } from '../lib/icons'

export default function CategoryDetail({ categoryId }: { categoryId: Extract<Screen, { name: 'category' }>['categoryId'] }) {
  const { push } = useNav()
  const category = SERVICE_CATEGORIES.find((c) => c.id === categoryId)!
  const services = SERVICES.filter((s) => s.categoryId === categoryId)
  const Icon = resolveIcon(category.icon)

  return (
    <div className="animate-tap-in pb-6">
      <TopBar title={category.name} subtitle={category.officeName} />
      <div className="px-4 pt-4">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-navy-50 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white">
            <Icon size={19} strokeWidth={1.9} />
          </span>
          <p className="text-[12.5px] leading-snug text-navy-900">{category.description}</p>
        </div>
        <div className="space-y-3">
          {services.map((s) => (
            <ServiceListItem key={s.id} service={s} onTap={() => push({ name: 'service-form', serviceId: s.id })} />
          ))}
        </div>
      </div>
    </div>
  )
}
