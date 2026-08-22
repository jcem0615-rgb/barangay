import TopBar from '../components/TopBar'
import CategoryTile from '../components/CategoryTile'
import { SERVICE_CATEGORIES } from '../data/mockData'
import { useNav } from '../lib/nav'

export default function Services() {
  const { push } = useNav()

  return (
    <div className="animate-tap-in pb-6">
      <TopBar title="Services" subtitle="Choose an LGU office" />
      <div className="space-y-3 px-4 pt-4">
        {SERVICE_CATEGORIES.map((cat) => (
          <CategoryTile key={cat.id} category={cat} onTap={() => push({ name: 'category', categoryId: cat.id })} />
        ))}
      </div>
    </div>
  )
}
