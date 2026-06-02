// src/screens/NewMatchScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — New Match
// Sends deviceId alongside match data so backend tags match.createdBy = user
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, Pressable,
  ScrollView, StyleSheet, Animated, ActivityIndicator,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native'
import { useNavigation, CommonActions } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl, jsonHeaders } from '../services/api'
import { getDeviceId }         from '../services/deviceId'
import type { RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

async function getToken() { return AsyncStorage.getItem('token').catch(() => null) }
const clamp = (v: number, min = 0, max = 9) => Math.max(min, Math.min(max, v))

function ScalePress({ onPress, style, children, disabled }: {
  onPress: () => void; style?: any; children: React.ReactNode; disabled?: boolean
}) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => !disabled && Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 60 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60 }).start()}
      android_ripple={disabled ? undefined : { color: 'rgba(255,255,255,0.12)' }}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

function Stepper({ value, onChange, min = 0, max = 9 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number
}) {
  return (
    <View style={S.stepperRow}>
      <ScalePress onPress={() => value > min && onChange(value - 1)} disabled={value <= min}>
        <View style={[S.stepBtn, value <= min && { opacity: 0.3 }]}>
          <Text style={S.stepBtnTxt}>−</Text>
        </View>
      </ScalePress>
      <Text style={S.stepVal}>{value}</Text>
      <ScalePress onPress={() => value < max && onChange(value + 1)} disabled={value >= max}>
        <View style={[S.stepBtn, value >= max && { opacity: 0.3 }]}>
          <Text style={S.stepBtnTxt}>+</Text>
        </View>
      </ScalePress>
    </View>
  )
}

export default function NewMatchScreen() {
  const navigation = useNavigation<Nav>()
  const [team1,      setTeam1]      = useState('')
  const [team2,      setTeam2]      = useState('')
  const [overs,      setOvers]      = useState('')
  const [noBallRuns, setNoBallRuns] = useState(1)
  const [wideRuns,   setWideRuns]   = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const submitScale = useRef(new Animated.Value(1)).current

  const handleSubmit = async () => {
    setError('')
    if (!team1.trim())                 { setError('Enter Team 1 name'); return }
    if (!team2.trim())                 { setError('Enter Team 2 name'); return }
    if (team1.trim() === team2.trim()) { setError('Team names must be different'); return }
    if (!overs || Number(overs) < 1)  { setError('Enter a valid number of overs'); return }

    setLoading(true)
    Animated.spring(submitScale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start()
    try {
      const token    = await getToken()
      const deviceId = await getDeviceId()  // tag match with device owner
      const res = await fetch(apiUrl('/api/matches'), {
        method:  'POST',
        headers: jsonHeaders(token),
        body:    JSON.stringify({
          team1:        team1.trim(),
          team2:        team2.trim(),
          overs:        Number(overs),
          tossWinner:   team1.trim(),
          battingFirst: team1.trim(),
          noBallRuns,
          wideRuns,
          team1Players: [],
          team2Players: [],
          deviceId,   // backend sets createdBy from this or from JWT
        }),
      })
      const data = await res.json() as { _id?: string; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Failed to create match')
      navigation.dispatch(CommonActions.reset({
        index: 0,
        routes: [{ name: 'Home' }, { name: 'Scoring', params: { id: data._id! } }],
      }))
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to create match')
    } finally {
      setLoading(false)
      Animated.spring(submitScale, { toValue: 1, useNativeDriver: true, speed: 50 }).start()
    }
  }

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={S.header}>
        <ScalePress onPress={() => navigation.goBack()}>
          <View style={S.backBtn}><Text style={S.backTxt}>←</Text></View>
        </ScalePress>
        <View>
          <Text style={S.headerTitle}>🏏 New Match</Text>
          <Text style={S.headerSub}>Set up your match details</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <Text style={S.label}>TEAM 1</Text>
          <TextInput style={S.input} value={team1} onChangeText={setTeam1}
            placeholder="Team name" placeholderTextColor="#3a3a3a"
            maxLength={30} returnKeyType="next" autoCapitalize="words" />

          <Text style={S.label}>TEAM 2</Text>
          <TextInput style={S.input} value={team2} onChangeText={setTeam2}
            placeholder="Team name" placeholderTextColor="#3a3a3a"
            maxLength={30} returnKeyType="next" autoCapitalize="words" />

          <Text style={S.label}>OVERS</Text>
          <TextInput style={S.input} value={overs}
            onChangeText={v => setOvers(v.replace(/\D/g, ''))}
            placeholder="Total overs" placeholderTextColor="#3a3a3a"
            keyboardType="numeric" returnKeyType="done" maxLength={2} />

          <Text style={S.label}>EXTRAS</Text>
          <View style={S.extrasCard}>
            <View style={[S.extrasRow, S.extrasRowBorder]}>
              <Text style={S.extrasLabel}>Runs on NO ball</Text>
              <Stepper value={noBallRuns} onChange={v => setNoBallRuns(clamp(v))} />
            </View>
            <View style={S.extrasRow}>
              <Text style={S.extrasLabel}>Runs on Wide ball</Text>
              <Stepper value={wideRuns} onChange={v => setWideRuns(clamp(v))} />
            </View>
          </View>

          {error !== '' && (
            <View style={S.errorBox}><Text style={S.errorTxt}>{error}</Text></View>
          )}

          <Pressable onPress={loading ? undefined : handleSubmit}
            onPressIn={() => !loading && Animated.spring(submitScale, { toValue: 0.96, useNativeDriver: true, speed: 60 }).start()}
            onPressOut={() => Animated.spring(submitScale, { toValue: 1, useNativeDriver: true, speed: 60 }).start()}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
            accessibilityRole="button" accessibilityState={{ busy: loading }}>
            <Animated.View style={[S.startBtn, loading && S.startBtnDim, { transform: [{ scale: submitScale }] }]}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={S.startBtnTxt}>▶  START MATCH</Text>}
            </Animated.View>
          </Pressable>

          <View style={S.noteBox}>
            <Text style={S.noteIcon}>🚀</Text>
            <Text style={S.noteTxt}>
              <Text style={S.noteBold}>Note: </Text>
              <Text style={S.noteBold}>{team1.trim() || 'Team 1'} </Text>
              <Text style={S.noteItalic}>will bat first</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const S = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#0a0a0a' },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 40, paddingBottom: 14, backgroundColor: '#161616', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backBtn:        { width: 38, height: 38, borderRadius: 11, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  backTxt:        { color: '#f0f0f0', fontSize: 18, fontWeight: '600' },
  headerTitle:    { fontSize: 20, fontWeight: '700', color: '#f0f0f0', letterSpacing: 0.5 },
  headerSub:      { fontSize: 11, color: '#777', marginTop: 1 },
  scroll:         { flex: 1, backgroundColor: '#111' },
  scrollContent:  { padding: 16, paddingBottom: 48, gap: 14 },
  label:          { fontSize: 11, fontWeight: '800', letterSpacing: 1.8, color: '#cc0000' },
  input:          { backgroundColor: '#1a1a1a', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, color: '#f0f0f0', fontSize: 15 },
  extrasCard:     { backgroundColor: '#1a1a1a', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' },
  extrasRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  extrasRowBorder:{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  extrasLabel:    { fontSize: 14, color: '#c0c0c0', fontWeight: '600' },
  stepperRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn:        { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  stepBtnTxt:     { color: '#f0f0f0', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stepVal:        { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#f0f0f0' },
  errorBox:       { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)', borderRadius: 12, alignItems: 'center' },
  errorTxt:       { fontSize: 13, color: '#f87171', fontWeight: '700', textAlign: 'center' },
  startBtn:       { width: '100%', paddingVertical: 17, borderRadius: 14, backgroundColor: '#cc0000', alignItems: 'center', justifyContent: 'center', shadowColor: '#cc0000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },
  startBtnDim:    { backgroundColor: 'rgba(204,0,0,0.40)', shadowOpacity: 0, elevation: 0 },
  startBtnTxt:    { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  noteBox:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, backgroundColor: 'rgba(204,0,0,0.06)', borderWidth: 1, borderColor: 'rgba(204,0,0,0.15)', borderRadius: 12 },
  noteIcon:       { fontSize: 18, flexShrink: 0 },
  noteTxt:        { fontSize: 12, lineHeight: 18, flex: 1 },
  noteBold:       { color: '#c0c0c0', fontWeight: '700' },
  noteItalic:     { color: '#ff6666', fontWeight: '700', fontStyle: 'italic' },
})
