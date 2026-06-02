// src/screens/VerifyEmailScreen.tsx
import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, StatusBar } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { apiUrl } from '../services/api'

export default function VerifyEmailScreen() {
  const navigation = useNavigation()
  const route      = useRoute()
  const email      = (route.params as { email: string })?.email ?? ''

  const [loading,  setLoading]  = useState(false)
  const [message,  setMessage]  = useState('')
  const [isError,  setIsError]  = useState(false)

  const handleResend = async () => {
    setLoading(true); setMessage(''); setIsError(false)
    try {
      const res  = await fetch(apiUrl('/api/auth/resend-verification'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      const data = await res.json() as { message?: string }
      setMessage(data.message ?? 'Email sent!')
      setIsError(!res.ok)
    } catch {
      setMessage('Failed to resend. Try again.'); setIsError(true)
    } finally { setLoading(false) }
  }

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={S.card}>
        <Text style={S.emoji}>📧</Text>
        <Text style={S.title}>Check your email!</Text>
        <Text style={S.sub}>We sent a verification link to:</Text>
        <Text style={S.email}>{email}</Text>
        <Text style={S.hint}>
          Open your email and tap the verification link to activate your account. Then come back and sign in.
        </Text>

        {message !== '' && (
          <View style={[S.msgBox, isError && S.msgBoxError]}>
            <Text style={[S.msgTxt, isError && S.msgTxtError]}>{message}</Text>
          </View>
        )}

        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={handleResend} disabled={loading} style={[S.resendBtn, loading && { opacity: 0.5 }]}>
          {loading ? <ActivityIndicator color="#ff4444" size="small" />
                   : <Text style={S.resendTxt}>Resend verification email</Text>}
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
  email: { fontSize: 15, fontWeight: '700', color: '#ff4444', marginTop: 6, marginBottom: 16, textAlign: 'center' },
  hint:  { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  msgBox:      { width: '100%', padding: 12, borderRadius: 10, backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', marginBottom: 16 },
  msgBoxError: { backgroundColor: 'rgba(248,113,113,0.10)', borderColor: 'rgba(248,113,113,0.25)' },
  msgTxt:      { color: '#4ade80', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  msgTxtError: { color: '#f87171' },
  resendBtn: { width: '100%', paddingVertical: 14, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,68,68,0.3)', alignItems: 'center', marginBottom: 12 },
  resendTxt: { color: '#ff4444', fontSize: 14, fontWeight: '700' },
  loginBtn:  { paddingVertical: 10 },
  loginTxt:  { color: '#444', fontSize: 13, fontWeight: '600' },
})