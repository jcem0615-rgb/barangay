import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { NavProvider, useNav } from './lib/nav'
import { AppDataProvider } from './lib/appData'
import { AuthProvider, useAuth } from './lib/auth'
import { CatalogueProvider } from './lib/catalogue'
import { I18nProvider } from './lib/i18n'
import { TextScaleProvider } from './lib/textScale'
import { ThemeProvider } from './lib/theme'
import { BarangayLogoProvider } from './lib/barangayLogo'
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
import NotificationsScreen from './screens/Notifications'
import SignIn from './screens/SignIn'
import ResetPassword from './screens/ResetPassword'
import StaffConsole from './screens/staff/StaffConsole'
import HelpSupport from './screens/HelpSupport'
import Appointments from './screens/Appointments'
import BookAppointment from './screens/BookAppointment'
import Complaints from './screens/Complaints'
import MyData from './screens/MyData'
import Emergency from './screens/Emergency'
import ReportIncident from './screens/ReportIncident'
import DataPrivacy from './screens/DataPrivacy'
import BarangayHub from './screens/BarangayHub'
import BarangayRequestForm from './screens/BarangayRequestForm'
import BarangayComplaintForm from './screens/BarangayComplaintForm'
import BarangayComplaints from './screens/BarangayComplaints'
import DocumentGuide from './screens/DocumentGuide'
import BarangayConsole from './screens/barangay/BarangayConsole'
import VerifyDocument from './screens/VerifyDocument'
import { clearScannedDocumentCode, scannedDocumentCode } from './lib/scannedDocument'
import KagawadConsole from './screens/barangay/KagawadConsole'

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
      return <ServiceForm serviceId={screen.serviceId} />
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
    case 'notifications':
      return <NotificationsScreen />
    case 'appointments':
      return <Appointments />
    case 'book-appointment':
      return <BookAppointment serviceId={screen.serviceId} requestId={screen.requestId} />
    case 'complaints':
      return <Complaints />
    case 'help':
      return <HelpSupport />
    case 'privacy':
      return <DataPrivacy />
    case 'my-data':
      return <MyData />
    case 'emergency':
      return <Emergency />
    case 'report-incident':
      return <ReportIncident />
    case 'barangay':
      return <BarangayHub />
    case 'barangay-request':
      return <BarangayRequestForm typeId={screen.typeId} />
    case 'barangay-complaint-form':
      return <BarangayComplaintForm />
    case 'barangay-complaints':
      return <BarangayComplaints />
    case 'service-guide':
      return <DocumentGuide serviceId={screen.serviceId} certificateId={screen.certificateId} />
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
  const [docCode, setDocCode] = useState<string | null>(scannedDocumentCode)

  if (resetToken) {
    return <ResetPassword token={resetToken} onDone={() => setResetToken(null)} />
  }

  /*
   * The document check, before the session gate and before the loading spinner.
   *
   * Whoever scanned the QR on a permit is a bank, an employer or a clerk in
   * another office — none of them have an account here, and waiting on
   * `/auth/me` to decide which shell they get would make them wait for an
   * answer that has nothing to do with the question they asked. A staff member
   * who scans one lands here too and closes it back into their console.
   */
  if (docCode !== null) {
    return (
      <VerifyDocument
        code={docCode}
        onClose={() => { clearScannedDocumentCode(); setDocCode(null) }}
      />
    )
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
  // The barangay gets its own console rather than a tab in the municipal one:
  // a barangay secretary has no business in a municipal queue, and separate
  // shells mean there is no filter to get wrong.
  if (user.role === 'barangay_admin' || user.role === 'barangay_officer') return <BarangayConsole />
  // Its own shell rather than the console with tabs hidden: a kagawad is
  // elected rather than clerical, and the API refuses them every route that
  // console calls, so sharing one would only invite a filter to get wrong.
  if (user.role === 'barangay_kagawad') return <KagawadConsole />

  return (
    <NavProvider>
      <ResidentShell />
    </NavProvider>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <TextScaleProvider>
            <AuthProvider>
            <BarangayLogoProvider>
            <CatalogueProvider>
            <AppDataProvider>
              <RoleShell />
            </AppDataProvider>
            </CatalogueProvider>
            </BarangayLogoProvider>
          </AuthProvider>
        </TextScaleProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}
