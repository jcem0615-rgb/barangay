import { NavProvider, useNav } from './lib/nav'
import { AppDataProvider } from './lib/appData'
import BottomNav from './components/BottomNav'
import Dashboard from './screens/Dashboard'
import Services from './screens/Services'
import CategoryDetail from './screens/CategoryDetail'
import ServiceForm from './screens/ServiceForm'
import ApplicationsList from './screens/ApplicationsList'
import ApplicationDetail from './screens/ApplicationDetail'
import PaymentScreen from './screens/PaymentScreen'
import Profile from './screens/Profile'
import IdCardScreen from './screens/IdCardScreen'

function ScreenRouter() {
  const { screen } = useNav()

  switch (screen.name) {
    case 'dashboard':
      return <Dashboard />
    case 'services':
      return <Services />
    case 'category':
      return <CategoryDetail categoryId={screen.categoryId} />
    case 'service-form':
      return <ServiceForm serviceId={screen.serviceId} draftId={screen.draftId} />
    case 'applications':
      return <ApplicationsList />
    case 'application-detail':
      return <ApplicationDetail id={screen.id} />
    case 'payment':
      return <PaymentScreen id={screen.id} />
    case 'profile':
      return <Profile />
    case 'id-card':
      return <IdCardScreen />
    default:
      return <Dashboard />
  }
}

function AppShell() {
  const { screen } = useNav()
  const showBottomNav = !['payment', 'id-card'].includes(screen.name)

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-slate-canvas">
      <main className={showBottomNav ? 'pb-[76px]' : ''}>
        <ScreenRouter />
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <NavProvider>
      <AppDataProvider>
        <AppShell />
      </AppDataProvider>
    </NavProvider>
  )
}
