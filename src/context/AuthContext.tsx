// src/context/AuthContext.tsx
import React, {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl } from '../services/api'
import { getDeviceId } from '../services/deviceId'
import type { User } from '../types'

export type VerifyPurpose = 'register' | 'login'

interface LoginResult {
  purpose:    VerifyPurpose
  email:      string
  loginToken: string
  message?:   string
}

interface AuthContextValue {
  user:            User | null
  loading:         boolean
  isGuest:         boolean
  deviceId:        string | null
  loginWithEmail:    (email: string, password: string) => Promise<LoginResult>
  register:          (name: string, email: string, password: string) => Promise<LoginResult>
  pollLoginStatus:   (loginToken: string, purpose: VerifyPurpose) => Promise<boolean>
  resendVerifyLink:  (email: string, purpose: VerifyPurpose) => Promise<{ message: string; loginToken: string }>
  loginWithDevice:   () => Promise<boolean>
  continueAsGuest:   () => void
  logout:            () => Promise<void>
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

        // Try device login (silent re-auth — does NOT require OTP)
        try {
          const res = await fetch(apiUrl('/api/auth/device-login'), {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ deviceId: did }),
          })
          if (res.ok) {
            const data = await res.json() as { token: string; user: User }
            await AsyncStorage.setItem('token', data.token)
            await AsyncStorage.setItem('user',  JSON.stringify(data.user))
            setUser(data.user); return
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

  // Step 1 of login: verifies the password and triggers a verify-link email.
  // Does NOT set the user/token — that only happens once pollLoginStatus sees
  // the link has been confirmed.
  const loginWithEmail = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json() as { token?: string; user?: User; message?: string; purpose?: VerifyPurpose; email?: string; loginToken?: string }
    if (!res.ok) throw new Error(data.message ?? 'Login failed')

    // If direct token returned (no verify-link required)
    if (data.token) {
      await AsyncStorage.setItem('token', data.token)
      await AsyncStorage.setItem('user', JSON.stringify(data.user))
      await AsyncStorage.removeItem('isGuest')
      setIsGuest(false)
      setUser(data.user!)
      return { purpose: 'login', email: data.user!.email ?? email, loginToken: '' }
    }
    return {
      purpose:    data.purpose ?? 'login',
      email:      data.email ?? email,
      loginToken: data.loginToken ?? '',
    }
  }, [])

  const register = useCallback(async (name: string, email: string, password: string): Promise<LoginResult> => {
    const res = await fetch(apiUrl('/api/auth/register'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password }),
    })
    const data = await res.json() as { message?: string; purpose?: VerifyPurpose; email?: string; loginToken?: string }
    if (!res.ok) throw new Error(data.message ?? 'Registration failed')
    return {
      purpose:    data.purpose ?? 'register',
      email:      data.email ?? email,
      loginToken: data.loginToken ?? '',
    }
  }, [])

  // Step 2 of both register-verification and login-confirm: checks whether the
  // emailed link has been tapped yet. Returns true once confirmed, at which
  // point the real token/user have already been stored — false means "keep
  // waiting", and it throws if the link expired or the token is invalid so the
  // waiting screen can show an error and offer to resend.
  const pollLoginStatus = useCallback(async (loginToken: string, purpose: VerifyPurpose): Promise<boolean> => {
    console.log(`[pollLoginStatus] polling token=${loginToken.slice(0, 8)}... purpose=${purpose}`)
    const did = await getDeviceId()
    const res = await fetch(apiUrl(`/api/auth/login-status/${loginToken}?deviceId=${encodeURIComponent(did)}`))
    console.log(`[pollLoginStatus] response status=${res.status}, ok=${res.ok}`)
    const data = await res.json() as {
      confirmed?: boolean; expired?: boolean; message?: string
      token?: string; user?: User
    }
    console.log(`[pollLoginStatus] data=${JSON.stringify(data)}`)

    // 410 = explicitly expired, 404 = token not found (treat as expired/invalid)
    // Both are terminal — throw so WaitingForVerificationScreen shows the error
    // and lets the user resend, instead of silently polling forever.
    if (res.status === 410 || res.status === 404) {
      throw new Error(data.message ?? 'Link expired. Please resend.')
    }

    if (!res.ok || !data.confirmed) {
      console.log('[pollLoginStatus] not confirmed yet, returning false')
      return false
    }

    console.log('[pollLoginStatus] CONFIRMED! Storing token and user, calling setUser...')
    await AsyncStorage.setItem('token', data.token!)
    await AsyncStorage.setItem('user',  JSON.stringify(data.user!))
    await AsyncStorage.removeItem('isGuest')
    setIsGuest(false)
    setDeviceId(did)
    setUser(data.user!)
    console.log(`[pollLoginStatus] setUser called with email=${data.user!.email}. Returning true.`)
    return true
  }, [])

  const resendVerifyLink = useCallback(async (email: string, purpose: VerifyPurpose): Promise<{ message: string; loginToken: string }> => {
    const res = await fetch(apiUrl('/api/auth/resend-link'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, purpose }),
    })
    const data = await res.json() as { message?: string; loginToken?: string }
    if (!res.ok) throw new Error(data.message ?? 'Failed to resend link')
    return { message: data.message ?? 'Link sent!', loginToken: data.loginToken ?? '' }
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
      const data = await res.json() as { token: string; user: User }
      await AsyncStorage.setItem('token', data.token)
      await AsyncStorage.setItem('user',  JSON.stringify(data.user))
      setUser(data.user)
      return true
    } catch { return false }
  }, [])

  const continueAsGuest = useCallback(async () => {
    await AsyncStorage.multiRemove(['token', 'user'])
    await AsyncStorage.setItem('isGuest', 'true')
    setIsGuest(true)
    setUser({ id: 'guest', name: 'Guest' })
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    await clearAuth()
    setUser(null)
    setIsGuest(false)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading, isGuest, deviceId,
      loginWithEmail, register, pollLoginStatus, resendVerifyLink,
      loginWithDevice, continueAsGuest, logout,
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