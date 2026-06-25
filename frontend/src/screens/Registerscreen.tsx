// src/screens/Registerscreen.tsx
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

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>()
  const { register } = useAuth()

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // See LoginScreen — same fix: onSubmitEditing on the confirm-password field
  // and the button's onPress can both fire handleRegister before `disabled`
  // re-renders, sending two /register calls that would each mint a different
  // verify-link token.
  const submittingRef = useRef(false)

  const handleRegister = async () => {
    if (submittingRef.current) return
    setError('')
    if (!name.trim())    { setError('Please enter your name'); return }
    if (!email.trim())   { setError('Please enter your email'); return }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm)  { setError('Passwords do not match'); return }

    submittingRef.current = true
    setLoading(true)
    try {
      const res = await register(name.trim(), email.trim().toLowerCase(), password)
      if (res && res.verifyRequired) {
        navigation.navigate('WaitingForVerification', {
          email: email.trim().toLowerCase(),
          purpose: 'register',
          loginToken: res.loginToken || '',
        })
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <KeyboardAvoidingView style={S.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={S.card}>
          <View style={S.cardHeader}>
            <Text style={{ fontSize: 46, marginBottom: 12 }}>🏏</Text>
            <Text style={S.cardTitle}>Create your account</Text>
            <Text style={S.cardSub}>Your stats & matches will be saved forever</Text>
          </View>
          <View style={S.cardBody}>
            <Text style={S.label}>FULL NAME</Text>
            <TextInput style={S.input} value={name} onChangeText={v => { setName(v); setError('') }}
              placeholder="e.g. Virat Kohli" placeholderTextColor="#3a3a3a" autoCapitalize="words" returnKeyType="next" autoFocus />

            <Text style={S.label}>EMAIL ADDRESS</Text>
            <TextInput style={S.input} value={email} onChangeText={v => { setEmail(v); setError('') }}
              placeholder="you@example.com" placeholderTextColor="#3a3a3a" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />

            <Text style={S.label}>PASSWORD</Text>
            <View style={S.passRow}>
              <TextInput style={[S.input, { flex: 1, borderWidth: 0 }]} value={password} onChangeText={v => { setPassword(v); setError('') }}
                placeholder="Min 6 characters" placeholderTextColor="#3a3a3a" secureTextEntry={!showPass} returnKeyType="next" />
              <Pressable onPress={() => setShowPass(p => !p)} style={S.eyeBtn}>
                <Text style={{ fontSize: 16 }}>{showPass ? '🙈' : '👁️'}</Text>
              </Pressable>
            </View>

            <Text style={S.label}>CONFIRM PASSWORD</Text>
            <View style={S.passRow}>
              <TextInput style={[S.input, { flex: 1, borderWidth: 0 }]} value={confirm} onChangeText={v => { setConfirm(v); setError('') }}
                placeholder="Repeat your password" placeholderTextColor="#3a3a3a" secureTextEntry={!showConf} returnKeyType="done" onSubmitEditing={handleRegister} />
              <Pressable onPress={() => setShowConf(p => !p)} style={S.eyeBtn}>
                <Text style={{ fontSize: 16 }}>{showConf ? '🙈' : '👁️'}</Text>
              </Pressable>
            </View>

            {error !== '' && <View style={S.errorBox}><Text style={S.errorTxt}>⚠️ {error}</Text></View>}

            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={handleRegister} disabled={loading}
              style={[S.primaryBtn, loading && S.primaryBtnDim]}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.primaryBtnTxt}>🏏 Create Account</Text>}
            </Pressable>

            <View style={S.loginRow}>
              <Text style={S.loginHint}>Already have an account? </Text>
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => navigation.navigate('Login' as never)}>
                <Text style={S.loginLink}>Sign in →</Text>
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
  input: { backgroundColor: '#0d0d0d', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 13, paddingHorizontal: 16, paddingVertical: 15, color: '#f0f0f0', fontSize: 15 },
  passRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 13, overflow: 'hidden' },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 15, opacity: 0.6 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' },
  errorTxt: { color: '#f87171', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  primaryBtn:    { width: '100%', paddingVertical: 15, borderRadius: 13, backgroundColor: '#cc0000', alignItems: 'center', justifyContent: 'center' },
  primaryBtnDim: { backgroundColor: 'rgba(204,0,0,0.4)' },
  primaryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  loginRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  loginHint: { color: '#444', fontSize: 13 },
  loginLink: { color: '#ff4444', fontSize: 13, fontWeight: '700' },
  footerNote: { marginTop: 24, textAlign: 'center', fontSize: 11, color: '#2a2a2a', lineHeight: 18 },
})