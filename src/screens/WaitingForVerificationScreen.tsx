// src/screens/WaitingForVerificationScreen.tsx
import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useAuth, type VerifyPurpose } from '../context/AuthContext'

const POLL_INTERVAL = 3000 // ms — how often we ask the server "has the link been clicked yet?"
const RESEND_COOLDOWN = 60 // seconds

export default function WaitingForVerificationScreen() {
  const navigation = useNavigation()
  const route       = useRoute()
  const {
    email,
    purpose = 'register',
    loginToken: initialToken,
  } = (route.params as { email: string; purpose?: VerifyPurpose; loginToken: string }) ?? { email: '', loginToken: '' }
  const { pollLoginStatus, resendVerifyLink } = useAuth()

  const isLogin = purpose === 'login'

  const [loginToken, setLoginToken] = useState(initialToken)
  const [message,    setMessage]    = useState('')
  const [isError,    setIsError]    = useState(false)
  const [resending,  setResending]  = useState(false)
  const [cooldown,   setCooldown]   = useState(RESEND_COOLDOWN)

  // Guards against two polls (or a poll + a resend) racing each other and both
  // trying to finish login at once.
  const pollingRef = useRef(false)
  // Keep the latest token in a ref too, so the interval callback (captured
  // once when the effect was set up) always reads the current value instead
  // of a stale one from a closure made at mount time.
  const tokenRef = useRef(loginToken)
  tokenRef.current = loginToken

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (pollingRef.current || cancelled) return
      pollingRef.current = true
      try {
        const confirmed = await pollLoginStatus(tokenRef.current, purpose)
        if (confirmed && !cancelled) {
          // Do NOT call navigation.navigate('Home') here.
          //
          // pollLoginStatus already called setUser() in AuthContext, which
          // causes RootNavigator to re-render. RootNavigator's
          //   user ? <AppStack /> : <AuthStack />
          // logic then unmounts AuthStack and mounts AppStack, whose initial
          // screen IS Home — so navigation happens automatically without any
          // explicit navigate() call from here.
          //
          // Calling navigate('Home') while still inside AuthStack (which has
          // no 'Home' screen) is exactly what causes the error:
          //   "The action 'NAVIGATE' with payload {"name":"Home"} was not
          //    handled by any navigator."
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setMessage((e as Error).message ?? 'Link expired or invalid. Please resend.')
          setIsError(true)
        }
      } finally {
        pollingRef.current = false
      }
    }

    const t = setInterval(tick, POLL_INTERVAL)
    tick() // also check immediately on mount instead of waiting a full interval
    return () => { cancelled = true; clearInterval(t) }
  }, [purpose, pollLoginStatus])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const handleResend = async () => {
    if (cooldown > 0) return
    setResending(true); setMessage(''); setIsError(false)
    try {
      const { message: msg, loginToken: freshToken } = await resendVerifyLink(email, purpose)
      setMessage(msg); setIsError(false)
      setLoginToken(freshToken)
      tokenRef.current = freshToken
      setCooldown(RESEND_COOLDOWN)
    } catch (e: unknown) {
      setMessage((e as Error).message ?? 'Failed to resend. Try again.'); setIsError(true)
    } finally { setResending(false) }
  }

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={S.card}>
        <Text style={S.emoji}>{isLogin ? '🔐' : '📧'}</Text>
        <Text style={S.title}>{isLogin ? "Confirm it's you" : 'Verify your email'}</Text>
        <Text style={S.sub}>We sent a verify link to:</Text>
        <Text style={S.email}>{email}</Text>

        <View style={S.waitingBox}>
          <ActivityIndicator color="#ff4444" size="small" />
          <Text style={S.waitingTxt}>
            Open the email on this device and tap{' '}
            <Text style={{ fontWeight: '800', color: '#fff' }}>"Verify it's you"</Text> — we'll log you in automatically.
          </Text>
        </View>

        {message !== '' && (
          <View style={[S.msgBox, isError && S.msgBoxError]}>
            <Text style={[S.msgTxt, isError && S.msgTxtError]}>{message}</Text>
          </View>
        )}

        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={handleResend} disabled={resending || cooldown > 0} style={[S.resendBtn, (resending || cooldown > 0) && { opacity: 0.5 }]}>
          {resending
            ? <ActivityIndicator color="#ff4444" size="small" />
            : <Text style={S.resendTxt}>{cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}</Text>}
        </Pressable>

        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={() => navigation.navigate('Login' as never)} style={S.loginBtn}>
          <Text style={S.loginTxt}>← Back to Sign In</Text>
        </Pressable>
      </View>
    </View>
  )
}

const S = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 24 },
  card:  { backgroundColor: '#161616', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 32, alignItems: 'center' },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#f0f0f0', marginBottom: 8, textAlign: 'center' },
  sub:   { fontSize: 13, color: '#666', textAlign: 'center' },
  email: { fontSize: 15, fontWeight: '700', color: '#ff4444', marginTop: 6, marginBottom: 24, textAlign: 'center' },
  waitingBox: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0d0d0d', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 13, padding: 16, marginBottom: 20,
  },
  waitingTxt: { flex: 1, color: '#aaa', fontSize: 13, lineHeight: 19 },
  msgBox:      { width: '100%', padding: 12, borderRadius: 10, backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', marginBottom: 16 },
  msgBoxError: { backgroundColor: 'rgba(248,113,113,0.10)', borderColor: 'rgba(248,113,113,0.25)' },
  msgTxt:      { color: '#4ade80', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  msgTxtError: { color: '#f87171' },
  resendBtn: { width: '100%', paddingVertical: 14, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,68,68,0.3)', alignItems: 'center', marginBottom: 12 },
  resendTxt: { color: '#ff4444', fontSize: 14, fontWeight: '700' },
  loginBtn:  { paddingVertical: 10 },
  loginTxt:  { color: '#444', fontSize: 13, fontWeight: '600' },
})