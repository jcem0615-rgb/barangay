import TopBar from '../components/TopBar'
import CategoryTile from '../components/CategoryTile'
import { useCatalogue } from '../lib/catalogue'
import { useNav } from '../lib/nav'

export default function Services() {
  const { push } = useNav()
  const { departments } = useCatalogue()

  return (
    <div className="animate-tap-in pb-6">
      <TopBar title="Services" subtitle="Choose an LGU office" />
      <div className="space-y-3 px-4 pt-4">
        {departments.map((cat) => (
          <CategoryTile key={cat.id} category={cat} onTap={() => push({ name: 'category', categoryId: cat.id })} />
        ))}
      </div>
    </div>
  )
}
