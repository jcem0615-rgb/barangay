import TopBar from '../components/TopBar'
import CategoryTile from '../components/CategoryTile'
import { useCatalogue } from '../lib/catalogue'
import { useNav } from '../lib/nav'
import { useT } from '../lib/i18n'

export default function Services() {
  const { push } = useNav()
  const { departments } = useCatalogue()
  const { t } = useT()

  return (
    <div className="animate-tap-in pb-6">
      <TopBar title={t('services.title')} subtitle={t('services.subtitle')} />
      <div className="space-y-3 px-4 pt-4">
        {departments.map((cat) => (
          <CategoryTile key={cat.id} category={cat} onTap={() => push({ name: 'category', categoryId: cat.id })} />
        ))}
      </div>
    </div>
  )
}
