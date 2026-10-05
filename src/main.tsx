import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnNewVersion } from './lib/swUpdate'

// Registered before React mounts, like the install prompt's listener: the
// worker can take over at any point and the listener has to already be there.
reloadOnNewVersion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
