// src/screens/VerifyEmailScreen.tsx
import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native'
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native'
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native'
import { useAuth, type OtpPurpose } from '../context/AuthContext'

const CODE_LENGTH = 6
const RESEND_COOLDOWN = 60 // seconds

export default function VerifyEmailScreen() {
  const navigation = useNavigation()
  const route       = useRoute()
  const { email, purpose = 'register' } = (route.params as { email: string; purpose?: OtpPurpose }) ?? { email: '' }
  const { verifyOtp, resendOtp } = useAuth()

  const isLogin = purpose === 'login'

  const [digits,  setDigits]  = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)

  const inputs = useRef<Array<TextInput | null>>([])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const focus = (i: number) => inputs.current[i]?.focus()

  const handleChange = (text: string, index: number) => {
    const clean = text.replace(/\D/g, '')
    if (!clean) {
      const next = [...digits]; next[index] = ''
      setDigits(next)
      return
    }
    // Handles both single-digit typing and a full code being pasted into one box
    const next = [...digits]
    const chars = clean.split('')
    let i = index
    for (const ch of chars) {
      if (i >= CODE_LENGTH) break
      next[i] = ch
      i++
    }
    setDigits(next)
    setMessage('')
    if (i < CODE_LENGTH) focus(i)
    else inputs.current[CODE_LENGTH - 1]?.blur()

   const joined = next.join('')
if (joined.length === CODE_LENGTH) {
  setTimeout(() => handleVerify(joined), 500) // wait 500ms for login to finish saving OTP
}
  }

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && digits[index] === '' && index > 0) {
      focus(index - 1)
    }
  }

  const handleVerify = async (code?: string) => {
    const joined = code ?? digits.join('')
    if (joined.length !== CODE_LENGTH) { setMessage('Enter the full 6-digit code'); setIsError(true); return }
    setLoading(true); setMessage(''); setIsError(false)
    try {
      await verifyOtp(email, joined, purpose)
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Home' }] }))
    } catch (e: unknown) {
      setMessage((e as Error).message ?? 'Invalid code'); setIsError(true)
      setDigits(Array(CODE_LENGTH).fill(''))
      focus(0)
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setResending(true); setMessage(''); setIsError(false)
    try {
      const msg = await resendOtp(email, purpose)
      setMessage(msg); setIsError(false)
      setDigits(Array(CODE_LENGTH).fill(''))
      setCooldown(RESEND_COOLDOWN)
      focus(0)
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
        <Text style={S.sub}>We sent a 6-digit code to:</Text>
        <Text style={S.email}>{email}</Text>

        <View style={S.codeRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={r => { inputs.current[i] = r }}
              value={d}
              onChangeText={v => handleChange(v, i)}
              onKeyPress={e => handleKeyPress(e, i)}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              style={[S.codeBox, d !== '' && S.codeBoxFilled]}
              autoFocus={i === 0}
              selectTextOnFocus
            />
          ))}
        </View>

        {message !== '' && (
          <View style={[S.msgBox, isError && S.msgBoxError]}>
            <Text style={[S.msgTxt, isError && S.msgTxtError]}>{message}</Text>
          </View>
        )}

        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => handleVerify()} disabled={loading}
          style={[S.primaryBtn, loading && S.primaryBtnDim]}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.primaryBtnTxt}>Verify →</Text>}
        </Pressable>

        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={handleResend} disabled={resending || cooldown > 0} style={[S.resendBtn, (resending || cooldown > 0) && { opacity: 0.5 }]}>
          {resending
            ? <ActivityIndicator color="#ff4444" size="small" />
            : <Text style={S.resendTxt}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</Text>}
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
  codeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  codeBox: {
    width: 44, height: 54, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0d0d0d', color: '#f0f0f0', fontSize: 22, fontWeight: '800', textAlign: 'center',
  },
  codeBoxFilled: { borderColor: 'rgba(255,68,68,0.5)' },
  msgBox:      { width: '100%', padding: 12, borderRadius: 10, backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', marginBottom: 16 },
  msgBoxError: { backgroundColor: 'rgba(248,113,113,0.10)', borderColor: 'rgba(248,113,113,0.25)' },
  msgTxt:      { color: '#4ade80', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  msgTxtError: { color: '#f87171' },
  primaryBtn:    { width: '100%', paddingVertical: 15, borderRadius: 13, backgroundColor: '#cc0000', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  primaryBtnDim: { backgroundColor: 'rgba(204,0,0,0.4)' },
  primaryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  resendBtn: { width: '100%', paddingVertical: 14, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,68,68,0.3)', alignItems: 'center', marginBottom: 12 },
  resendTxt: { color: '#ff4444', fontSize: 14, fontWeight: '700' },
  loginBtn:  { paddingVertical: 10 },
  loginTxt:  { color: '#444', fontSize: 13, fontWeight: '600' },
})