import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { NavProvider, useNav } from './lib/nav'
import { AppDataProvider } from './lib/appData'
import { AuthProvider, useAuth } from './lib/auth'
import { CatalogueProvider } from './lib/catalogue'
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
import SignIn from './screens/SignIn'
import ResetPassword from './screens/ResetPassword'
import StaffConsole from './screens/staff/StaffConsole'

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

function ResidentShell() {
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

/**
 * Pulls a reset token out of the URL once, at boot, and clears it from the
 * address bar so it isn't left in history or shoulder-read. There is no router,
 * so this is the one place a URL means anything.
 */
function takeResetToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = new URLSearchParams(window.location.search).get('reset')
  if (token) {
    window.history.replaceState({}, '', window.location.pathname)
  }
  return token
}

/** Which shell you get is decided by the role the server reports, not the URL. */
function RoleShell() {
  const { user, loading } = useAuth()
  const [resetToken, setResetToken] = useState<string | null>(takeResetToken)

  if (resetToken) {
    return <ResetPassword token={resetToken} onDone={() => setResetToken(null)} />
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-canvas">
        <Loader2 size={22} className="animate-spin text-navy-800" />
      </div>
    )
  }

  if (!user) return <SignIn />
  if (user.role === 'staff' || user.role === 'admin') return <StaffConsole />

  return (
    <NavProvider>
      <ResidentShell />
    </NavProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <CatalogueProvider>
        <AppDataProvider>
          <RoleShell />
        </AppDataProvider>
      </CatalogueProvider>
    </AuthProvider>
  )
}
