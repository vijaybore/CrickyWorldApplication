// src/screens/ForgotPasswordScreen.tsx
import React, { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar, ScrollView,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { apiUrl } from '../services/api'

export default function ForgotPasswordScreen() {
  const navigation = useNavigation()
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const handleSend = async () => {
    setError('')
    if (!email.trim()) { setError('Please enter your email'); return }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address'); return }

    setLoading(true)
    try {
      const res  = await fetch(apiUrl('/api/auth/forgot-password'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json() as { message?: string }
      if (!res.ok) { setError(data.message ?? 'Failed to send reset email'); return }
      setSent(true)
    } catch {
      setError('Could not connect to server. Please try again.')
    } finally { setLoading(false) }
  }

  if (sent) {
    return (
      <View style={S.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <View style={S.card}>
          <Text style={S.emoji}>📧</Text>
          <Text style={S.title}>Check your email!</Text>
          <Text style={S.sub}>We sent a password reset link to:</Text>
          <Text style={S.emailTxt}>{email}</Text>
          <Text style={S.hint}>
            Tap the link in the email to reset your password. Then come back and sign in.
          </Text>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={() => navigation.navigate('Login' as never)} style={S.primaryBtn}>
            <Text style={S.primaryBtnTxt}>← Back to Sign In</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={S.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backTxt}>← Back</Text>
        </Pressable>

        <View style={S.card}>
          <View style={S.cardHeader}>
            <Text style={{ fontSize: 46, marginBottom: 12 }}>🔐</Text>
            <Text style={S.title}>Forgot Password?</Text>
            <Text style={S.cardSub}>Enter your email and we'll send you a reset link</Text>
          </View>
          <View style={S.cardBody}>
            <Text style={S.label}>EMAIL ADDRESS</Text>
            <TextInput
              style={S.input}
              value={email}
              onChangeText={v => { setEmail(v); setError('') }}
              placeholder="you@example.com"
              placeholderTextColor="#3a3a3a"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSend}
              autoFocus
            />

            {error !== '' && (
              <View style={S.errorBox}>
                <Text style={S.errorTxt}>⚠️ {error}</Text>
              </View>
            )}

            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              onPress={handleSend} disabled={loading}
              style={[S.primaryBtn, loading && S.primaryBtnDim]}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={S.primaryBtnTxt}>Send Reset Link →</Text>}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0a0a0a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  backBtn: { marginBottom: 24, alignSelf: 'flex-start' },
  backTxt: { color: '#666', fontSize: 13, fontWeight: '700' },
  card:       { backgroundColor: '#161616', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  cardHeader: { padding: 28, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', alignItems: 'center', backgroundColor: '#1c1c1c' },
  cardBody:   { padding: 24, gap: 12 },
  cardSub:    { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20 },
  emoji: { fontSize: 56, marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#f0f0f0', marginBottom: 6, textAlign: 'center' },
  sub:   { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 4 },
  emailTxt: { fontSize: 15, fontWeight: '700', color: '#ff4444', textAlign: 'center', marginBottom: 12 },
  hint:  { fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 16 },
  label: { fontSize: 10, color: '#666', fontWeight: '800', letterSpacing: 1.5 },
  input: { backgroundColor: '#0d0d0d', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 13, paddingHorizontal: 16, paddingVertical: 15, color: '#f0f0f0', fontSize: 15 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' },
  errorTxt: { color: '#f87171', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  primaryBtn:    { width: '100%', paddingVertical: 15, borderRadius: 13, backgroundColor: '#cc0000', alignItems: 'center', justifyContent: 'center' },
  primaryBtnDim: { backgroundColor: 'rgba(204,0,0,0.4)' },
  primaryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
})