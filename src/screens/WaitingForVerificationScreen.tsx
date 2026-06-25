// src/screens/WaitingForVerificationScreen.tsx
import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, StatusBar, ScrollView,
} from 'react-native'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { apiUrl } from '../services/api'
import type { RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'WaitingForVerification'>

export default function WaitingForVerificationScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { email, purpose, loginToken } = route.params
  const { completeVerification, deviceId } = useAuth()

  const [currentLoginToken, setCurrentLoginToken] = useState(loginToken)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [expired, setExpired] = useState(false)

  // Use a ref for polling to avoid closing over stale state
  const tokenRef = useRef(currentLoginToken)
  tokenRef.current = currentLoginToken

  useEffect(() => {
    let active = true
    let timerId: ReturnType<typeof setInterval> | null = null

    const checkStatus = async () => {
      if (!active || expired) return
      try {
        const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''
        const url = apiUrl(`/api/auth/login-status/${tokenRef.current}${query}`)
        
        const res = await fetch(url)
        if (!active) return

        if (res.status === 410) {
          setExpired(true)
          setError('Verification link has expired. Please request a new one.')
          if (timerId) clearInterval(timerId)
          return
        }

        const data = await res.json() as { confirmed: boolean; token?: string; refreshToken?: string; user?: any; message?: string }
        if (!res.ok) {
          // If we got another error, don't break polling unless it's a critical error
          console.warn('[Polling] checkStatus returned non-ok:', data.message)
          return
        }

        if (data.confirmed && data.token && data.user) {
          if (timerId) clearInterval(timerId)
          setSuccessMsg('Email verified! Redirecting...')
          // Log user in (flips `user` in AuthContext — what RootNavigator
          // uses to decide AuthStack vs AppStack).
          await completeVerification(data.token, data.user, data.refreshToken)

          // IMPORTANT: when this screen was reached from a Guest session
          // (Home -> "Sign In" -> this modal, all inside AppStack), `user`
          // was already truthy before completeVerification ran — it just
          // changes from the guest placeholder to the real account.
          // RootNavigator's `user ? <AppStack/> : <AuthStack/>` check sees
          // no falsy->truthy transition in that case, so it never remounts
          // the stack, and this screen was left sitting on top forever
          // showing "Redirecting...". Pop back to Home explicitly so both
          // the logged-out and guest-upgrade paths land in the same place.
          //
          // When coming from the logged-out AuthStack, completeVerification
          // just flipped user null -> truthy, so RootNavigator may already
          // be swapping this whole navigator for AppStack in the same
          // render pass. Calling reset/popToTop on a navigator that's mid
          // unmount can throw, so this is wrapped defensively.
          try {
            if (navigation.canGoBack()) {
              navigation.popToTop()
            } else {
              navigation.reset({ index: 0, routes: [{ name: 'Home' }] })
            }
          } catch (navErr) {
            console.log('[Polling] navigation reset skipped (stack likely already swapping):', navErr)
          }
        }
      } catch (err: unknown) {
        console.error('[Polling] Error:', err)
      }
    }

    // Run initial check and set interval
    checkStatus()
    timerId = setInterval(checkStatus, 3000)

    return () => {
      active = false
      if (timerId) clearInterval(timerId)
    }
  }, [currentLoginToken, expired, deviceId])

  const handleResend = async () => {
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/auth/resend-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      })
      const data = await res.json() as { message?: string; loginToken?: string }
      if (!res.ok) {
        setError(data.message ?? 'Failed to resend link')
        return
      }
      if (data.loginToken) {
        setCurrentLoginToken(data.loginToken)
        setExpired(false)
        setSuccessMsg('A new verification link has been sent to your email!')
      } else {
        setError('Failed to obtain new verification token')
      }
    } catch {
      setError('Could not connect to server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    navigation.navigate('Login')
  }

  return (
    <KeyboardAvoidingView style={S.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
        <View style={S.card}>
          <View style={S.cardHeader}>
            <Text style={{ fontSize: 56, marginBottom: 12 }}>📧</Text>
            <Text style={S.title}>Verify Your Email</Text>
            <Text style={S.cardSub}>We sent a verification link to:</Text>
            <Text style={S.emailTxt}>{email}</Text>
          </View>

          <View style={S.cardBody}>
            <Text style={S.hint}>
              Tap the verification button/link inside the email on this device. Once verified, the app will log you in automatically.
            </Text>

            {successMsg !== '' && (
              <View style={S.successBox}>
                <Text style={S.successTxt}>🎉 {successMsg}</Text>
              </View>
            )}

            {error !== '' && (
              <View style={S.errorBox}>
                <Text style={S.errorTxt}>⚠️ {error}</Text>
              </View>
            )}

            {!expired && !successMsg && (
              <View style={S.pollingRow}>
                <ActivityIndicator color="#ff4444" size="small" style={{ marginRight: 8 }} />
                <Text style={S.pollingTxt}>Waiting for verification...</Text>
              </View>
            )}

            <Pressable
              android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              onPress={handleResend}
              disabled={loading}
              style={[S.primaryBtn, loading && S.primaryBtnDim]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={S.primaryBtnTxt}>Resend Email Link</Text>
              )}
            </Pressable>

            <Pressable
              android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
              onPress={handleCancel}
              style={S.secondaryBtn}
            >
              <Text style={S.secondaryBtnTxt}>Cancel & Back to Sign In</Text>
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
  card:       { backgroundColor: '#161616', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  cardHeader: { padding: 28, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', alignItems: 'center', backgroundColor: '#1c1c1c' },
  cardBody:   { padding: 24, gap: 16 },
  cardSub:    { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#f0f0f0', marginBottom: 6, textAlign: 'center' },
  emailTxt: { fontSize: 15, fontWeight: '700', color: '#ff4444', textAlign: 'center', marginVertical: 4 },
  hint:  { fontSize: 13, color: '#999', textAlign: 'center', lineHeight: 20, marginBottom: 12, paddingHorizontal: 10 },
  pollingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  pollingTxt: { color: '#666', fontSize: 13, fontWeight: '600' },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)' },
  errorTxt: { color: '#f87171', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  successBox: { padding: 12, borderRadius: 10, backgroundColor: 'rgba(74,222,128,0.10)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)' },
  successTxt: { color: '#4ade80', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  primaryBtn:    { width: '100%', paddingVertical: 15, borderRadius: 13, backgroundColor: '#cc0000', alignItems: 'center', justifyContent: 'center' },
  primaryBtnDim: { backgroundColor: 'rgba(204,0,0,0.4)' },
  primaryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryBtn:    { width: '100%', paddingVertical: 15, borderRadius: 13, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  secondaryBtnTxt: { color: '#666', fontSize: 13, fontWeight: '700' },
})