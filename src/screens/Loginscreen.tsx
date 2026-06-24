// src/screens/Loginscreen.tsx
import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function LoginScreen() {
  const navigation = useNavigation<Nav>()
  const { loginWithEmail, continueAsGuest } = useAuth()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Synchronous guard against double-submits (e.g. tapping "Sign In" right after
  // pressing Enter/Done on the password field). `loading` state alone isn't
  // enough here — both events can fire in the same tick before the re-render
  // that sets disabled={true} actually happens.
  const submittingRef = useRef(false)

  const handleLogin = async () => {
    if (submittingRef.current) return
    setError('')
    if (!email.trim())    { setError('Please enter your email'); return }
    if (!password.trim()) { setError('Please enter your password'); return }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address'); return }
    submittingRef.current = true
    setLoading(true)
    try {
      // Logs in directly — no email verify-link step. AuthContext's
      // loginWithEmail sets the user/token itself; RootNavigator picks up
      // the change automatically and swaps to AppStack.
      await loginWithEmail(email.trim().toLowerCase(), password)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Login failed. Please try again.')
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  const handleGuest = async () => {
    console.log('[LoginScreen] Continue as Guest tapped')
    try {
      await continueAsGuest()
      console.log('[LoginScreen] continueAsGuest resolved')
    } catch (e: unknown) {
      console.log('[LoginScreen] continueAsGuest FAILED:', (e as Error).message)
      setError('Could not continue as guest. Please try again.')
    }
  }

  return (
    <KeyboardAvoidingView style={S.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={S.card}>
          <View style={S.cardHeader}>
            <Text style={{ fontSize: 46, marginBottom: 12 }}>🏏</Text>
            <Text style={S.cardTitle}>Welcome back!</Text>
            <Text style={S.cardSub}>Sign in to continue to CrickyWorld</Text>
          </View>
          <View style={S.cardBody}>
            <Text style={S.label}>EMAIL ADDRESS</Text>
            <TextInput style={S.input} value={email} onChangeText={v => { setEmail(v); setError('') }}
              placeholder="you@example.com" placeholderTextColor="#3a3a3a"
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next" autoFocus />

            <View style={S.passwordHeader}>
              <Text style={S.label}>PASSWORD</Text>
              <Pressable onPress={() => navigation.navigate('ForgotPassword' as never)}>
                <Text style={S.forgotTxt}>Forgot password?</Text>
              </Pressable>
            </View>
            <View style={S.passRow}>
              <TextInput style={[S.input, { flex: 1, borderWidth: 0 }]} value={password}
                onChangeText={v => { setPassword(v); setError('') }}
                placeholder="Enter your password" placeholderTextColor="#3a3a3a"
                secureTextEntry={!showPass} returnKeyType="done" onSubmitEditing={handleLogin} />
              <Pressable onPress={() => setShowPass(p => !p)} style={S.eyeBtn}>
                <Text style={{ fontSize: 16 }}>{showPass ? '🙈' : '👁️'}</Text>
              </Pressable>
            </View>

            {error !== '' && <View style={S.errorBox}><Text style={S.errorTxt}>⚠️ {error}</Text></View>}

            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={handleLogin} disabled={loading}
              style={[S.primaryBtn, loading && S.primaryBtnDim]}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.primaryBtnTxt}>Sign In →</Text>}
            </Pressable>

            <View style={S.divider}>
              <View style={S.divLine} /><Text style={S.divTxt}>OR</Text><View style={S.divLine} />
            </View>

            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={handleGuest} style={S.guestBtn}>
              <Text style={S.guestIcon}>👤</Text>
              <View>
                <Text style={S.guestTxt}>Continue as Guest</Text>
                <Text style={S.guestSub}>Data won't be saved if app is deleted</Text>
              </View>
            </Pressable>

            <View style={S.registerRow}>
              <Text style={S.registerHint}>Don't have an account? </Text>
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => navigation.navigate('Register' as never)}>
                <Text style={S.registerLink}>Create one →</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <Text style={S.footerNote}>Your matches & players are private to your account 🔒</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0a0a0a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  card:       { backgroundColor: '#161616', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  cardHeader: { padding: 28, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', alignItems: 'center', backgroundColor: '#1c1c1c' },
  cardTitle:  { fontSize: 20, fontWeight: '800', color: '#f0f0f0', marginBottom: 6, textAlign: 'center' },
  cardSub:    { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20 },
  cardBody:   { padding: 24, gap: 12 },
  label: { fontSize: 10, color: '#666', fontWeight: '800', letterSpacing: 1.5 },
  passwordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  forgotTxt: { fontSize: 11, color: '#ff4444', fontWeight: '700' },
  input: { backgroundColor: '#0d0d0d', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 13, paddingHorizontal: 16, paddingVertical: 15, color: '#f0f0f0', fontSize: 15 },
  passRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 13, overflow: 'hidden' },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 15, opacity: 0.6 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' },
  errorTxt: { color: '#f87171', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  primaryBtn:    { width: '100%', paddingVertical: 15, borderRadius: 13, backgroundColor: '#cc0000', alignItems: 'center', justifyContent: 'center' },
  primaryBtnDim: { backgroundColor: 'rgba(204,0,0,0.4)' },
  primaryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  divTxt:  { color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  guestBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: '#0d0d0d' },
  guestIcon: { fontSize: 24 },
  guestTxt:  { color: '#ccc', fontSize: 14, fontWeight: '700' },
  guestSub:  { color: '#555', fontSize: 11, marginTop: 2 },
  registerRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  registerHint: { color: '#444', fontSize: 13 },
  registerLink: { color: '#ff4444', fontSize: 13, fontWeight: '700' },
  footerNote: { marginTop: 24, textAlign: 'center', fontSize: 11, color: '#2a2a2a', lineHeight: 18 },
})