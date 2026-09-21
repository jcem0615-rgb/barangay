import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken, type AuthUser, type ResidentProfileData } from './api'

interface AuthValue {
  user: AuthUser | null
  profile: ResidentProfileData | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (body: Record<string, string | boolean>) => Promise<void>
  /** Re-reads the profile after something changed it, such as the ID portrait. */
  refresh: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<ResidentProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  // A stored token is only a claim; the server decides whether it still stands.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api
      .me()
      .then(({ user: u, profile: p }) => {
        setUser(u)
        setProfile(p)
      })
      .catch(() => {
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await api.login(email, password)
    setToken(token)
    setUser(u)
    const me = await api.me().catch(() => null)
    setProfile(me?.profile ?? null)
  }, [])

  const register = useCallback(async (body: Record<string, string | boolean>) => {
    const { token, user: u } = await api.register(body)
    setToken(token)
    setUser(u)
    const me = await api.me().catch(() => null)
    setProfile(me?.profile ?? null)
  }, [])

  const refresh = useCallback(async () => {
    const me = await api.me().catch(() => null)
    if (me) {
      setUser(me.user)
      setProfile(me.profile)
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setProfile(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
