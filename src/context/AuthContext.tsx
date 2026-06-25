// src/context/AuthContext.tsx
import React, {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl } from '../services/api'
import { getDeviceId } from '../services/deviceId'
import type { User } from '../types'

interface AuthContextValue {
  user:            User | null
  loading:         boolean
  isGuest:         boolean
  deviceId:        string | null
  loginWithEmail:  (email: string, password: string) => Promise<{ verifyRequired?: boolean; loginToken?: string }>
  register:        (name: string, email: string, password: string) => Promise<{ verifyRequired?: boolean; loginToken?: string }>
  loginWithDevice: () => Promise<boolean>
  continueAsGuest: () => Promise<void>
  logout:          () => Promise<void>
  completeVerification: (token: string, userProfile: User) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove(['token', 'user', 'isGuest'])
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,     setUser]     = useState<User | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [isGuest,  setIsGuest]  = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        // Wake up Render server
        fetch(apiUrl('/api/auth/me')).catch(() => {})

        const did = await getDeviceId()
        setDeviceId(did)

        // Check guest mode
        const guestMode = await AsyncStorage.getItem('isGuest')
        if (guestMode === 'true') {
          setIsGuest(true)
          setUser({ id: 'guest', name: 'Guest' })
          return
        }

        // Try stored token
        const token = await AsyncStorage.getItem('token')
        if (token) {
          try {
            const res = await fetch(apiUrl('/api/auth/me'), {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (res.ok) { setUser(await res.json() as User); return }
          } catch { }
        }

        // Try device login (silent re-auth)
        try {
          const res = await fetch(apiUrl('/api/auth/device-login'), {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ deviceId: did }),
          })
          if (res.ok) {
            const data = await res.json() as { token?: string; user?: User }
            if (data.token && data.user) {
              await AsyncStorage.setItem('token', data.token)
              await AsyncStorage.setItem('user',  JSON.stringify(data.user))
              setUser(data.user); return
            }
          }
        } catch { }

        // Offline fallback
        try {
          const raw = await AsyncStorage.getItem('user')
          if (raw) setUser(JSON.parse(raw) as User)
        } catch { }

      } finally { setLoading(false) }
    }
    init()
  }, [])

  // Logs in directly or requests verify-link step if verification is enabled.
  const loginWithEmail = useCallback(async (email: string, password: string): Promise<{ verifyRequired?: boolean; loginToken?: string }> => {
    const did = await getDeviceId()
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, deviceId: did }),
    })
    const data = await res.json() as { token?: string; user?: User; verifyRequired?: boolean; loginToken?: string; message?: string }
    if (!res.ok) throw new Error(data.message ?? 'Login failed')
    
    if (data.verifyRequired) {
      return { verifyRequired: true, loginToken: data.loginToken }
    }

    if (!data.token || !data.user) throw new Error('Server response was missing login data. Please try again.')

    await AsyncStorage.setItem('token', data.token)
    await AsyncStorage.setItem('user',  JSON.stringify(data.user))
    await AsyncStorage.removeItem('isGuest')
    setIsGuest(false)
    setDeviceId(did)
    setUser(data.user)
    return { verifyRequired: false }
  }, [])

  // Creates the account and requests verify-link step if verification is enabled.
  const register = useCallback(async (name: string, email: string, password: string): Promise<{ verifyRequired?: boolean; loginToken?: string }> => {
    const did = await getDeviceId()
    const res = await fetch(apiUrl('/api/auth/register'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password, deviceId: did }),
    })
    const data = await res.json() as { token?: string; user?: User; verifyRequired?: boolean; loginToken?: string; message?: string }
    if (!res.ok) throw new Error(data.message ?? 'Registration failed')

    if (data.verifyRequired) {
      return { verifyRequired: true, loginToken: data.loginToken }
    }

    if (!data.token || !data.user) throw new Error('Server response was missing login data. Please try again.')

    await AsyncStorage.setItem('token', data.token)
    await AsyncStorage.setItem('user',  JSON.stringify(data.user))
    await AsyncStorage.removeItem('isGuest')
    setIsGuest(false)
    setDeviceId(did)
    setUser(data.user)
    return { verifyRequired: false }
  }, [])

  const completeVerification = useCallback(async (token: string, userProfile: User): Promise<void> => {
    const did = await getDeviceId()
    await AsyncStorage.setItem('token', token)
    await AsyncStorage.setItem('user',  JSON.stringify(userProfile))
    await AsyncStorage.removeItem('isGuest')
    setIsGuest(false)
    setDeviceId(did)
    setUser(userProfile)
  }, [])

  const loginWithDevice = useCallback(async (): Promise<boolean> => {
    try {
      const did = await getDeviceId()
      const res = await fetch(apiUrl('/api/auth/device-login'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ deviceId: did }),
      })
      if (!res.ok) return false
      const data = await res.json() as { token?: string; user?: User }
      if (!data.token || !data.user) return false
      await AsyncStorage.setItem('token', data.token)
      await AsyncStorage.setItem('user',  JSON.stringify(data.user))
      setUser(data.user)
      return true
    } catch { return false }
  }, [])

  const continueAsGuest = useCallback(async () => {
    console.log('[AuthContext] continueAsGuest: clearing token/user...')
    await AsyncStorage.multiRemove(['token', 'user'])
    console.log('[AuthContext] continueAsGuest: setting isGuest flag...')
    await AsyncStorage.setItem('isGuest', 'true')
    console.log('[AuthContext] continueAsGuest: calling setUser/setIsGuest...')
    setIsGuest(true)
    setUser({ id: 'guest', name: 'Guest' })
    console.log('[AuthContext] continueAsGuest: done')
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    await clearAuth()
    setUser(null)
    setIsGuest(false)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading, isGuest, deviceId,
      loginWithEmail, register,
      loginWithDevice, continueAsGuest, logout,
      completeVerification,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}