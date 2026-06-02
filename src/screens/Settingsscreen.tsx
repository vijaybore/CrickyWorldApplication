// src/screens/SettingsScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, Pressable, Switch,
  StyleSheet, StatusBar, Platform, Alert, ActivityIndicator,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'

export default function SettingsScreen() {
  const navigation = useNavigation()
  const { user, logout } = useAuth()
  const [wideRuns,  setWideRuns]  = useState(true)
  const [noBall,    setNoBall]    = useState(true)
  const [autoSave,  setAutoSave]  = useState(true)
  const [clearing,  setClearing]  = useState(false)

  useEffect(() => {
    AsyncStorage.multiGet(['setting_wide', 'setting_noball', 'setting_autosave'])
      .then(pairs => {
        const m = Object.fromEntries(pairs.map(([k, v]) => [k, v]))
        if (m.setting_wide     !== null) setWideRuns(m.setting_wide     === 'true')
        if (m.setting_noball   !== null) setNoBall(m.setting_noball     === 'true')
        if (m.setting_autosave !== null) setAutoSave(m.setting_autosave === 'true')
      })
  }, [])

  const save = (key: string, val: boolean) => AsyncStorage.setItem(key, String(val))

  const handleLogout = () =>
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ])

  const handleClearCache = () =>
    Alert.alert('Clear Cache', 'Removes locally stored tournament data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        setClearing(true)
        await AsyncStorage.removeItem('cw_tournaments_v3').catch(() => {})
        setClearing(false)
        Alert.alert('Done', 'Cache cleared.')
      }},
    ])

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="#080808" />

      {/* ── Header with back button ── */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <Pressable
            android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={() => navigation.goBack()}
            style={S.backBtn}
          >
            <Text style={S.backTxt}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={S.title}>⚙️ Settings</Text>
            {user ? (
              <Text style={S.subtitle}>
                {(user as any).email ?? (user as any).username ?? 'Logged in'}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={S.body} showsVerticalScrollIndicator={false}>

        {/* ── Scoring defaults ── */}
        <Text style={S.section}>SCORING DEFAULTS</Text>
        <View style={S.card}>
          <ToggleRow
            label="Wide ball adds run"
            sub="Extra run on every wide delivery"
            value={wideRuns}
            onToggle={v => { setWideRuns(v); save('setting_wide', v) }}
          />
          <Sep />
          <ToggleRow
            label="No-ball adds run"
            sub="Extra run on every no-ball delivery"
            value={noBall}
            onToggle={v => { setNoBall(v); save('setting_noball', v) }}
          />
          <Sep />
          <ToggleRow
            label="Auto-save match"
            sub="Save ball-by-ball data automatically"
            value={autoSave}
            onToggle={v => { setAutoSave(v); save('setting_autosave', v) }}
          />
        </View>

        {/* ── Account ── */}
        <Text style={S.section}>ACCOUNT</Text>
        <View style={S.card}>
          <InfoRow
            label="Logged in as"
            value={(user as any)?.email ?? (user as any)?.username ?? '—'}
          />
          <Sep />
          <Pressable
            android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
            onPress={handleLogout}
            style={S.actionRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={[S.rowLabel, { color: '#f87171' }]}>Log Out</Text>
              <Text style={S.rowSub}>Sign out of this device</Text>
            </View>
            <Text style={{ color: '#f87171', fontSize: 18 }}>→</Text>
          </Pressable>
        </View>

        {/* ── Data ── */}
        <Text style={S.section}>DATA</Text>
        <View style={S.card}>
          <Pressable
            android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
            onPress={handleClearCache}
            disabled={clearing}
            style={S.actionRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={[S.rowLabel, { color: '#f87171' }]}>Clear Local Cache</Text>
              <Text style={S.rowSub}>Removes stored tournament data</Text>
            </View>
            {clearing
              ? <ActivityIndicator color="#f87171" size="small" />
              : <Text style={{ color: '#f87171', fontSize: 18 }}>→</Text>}
          </Pressable>
        </View>

        {/* ── About ── */}
        <Text style={S.section}>ABOUT</Text>
        <View style={S.card}>
          <InfoRow label="App"      value="CrickyWorld" />
          <Sep />
          <InfoRow label="Version"  value="1.0.0" />
          <Sep />
          <InfoRow label="Platform" value={Platform.OS === 'ios' ? 'iOS' : 'Android'} />
        </View>

        <Text style={S.footer}>CRICKYWORLD • MADE IN INDIA 🇮🇳</Text>
      </ScrollView>
    </View>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function ToggleRow({ label, sub, value, onToggle }: {
  label: string; sub: string; value: boolean; onToggle: (v: boolean) => void
}) {
  return (
    <View style={S.row}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={S.rowLabel}>{label}</Text>
        <Text style={S.rowSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#2a2a2a', true: 'rgba(204,0,0,0.45)' }}
        thumbColor={value ? '#cc0000' : '#555'}
      />
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={S.rowValue}>{value}</Text>
    </View>
  )
}

function Sep() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)' }} />
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d0d' },

  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 36,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0d0d0d',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTxt: { color: '#aaa', fontSize: 18, fontWeight: '600' },

  title:    { color: '#f0f0f0', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#444', fontSize: 12, marginTop: 2 },

  body:    { padding: 16, paddingBottom: 60 },
  section: {
    fontSize: 10, color: '#555', fontWeight: '800',
    letterSpacing: 1.5, marginBottom: 8, marginTop: 22, marginLeft: 4,
  },
  card: {
    backgroundColor: '#111', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  rowLabel: { color: '#e0e0e0', fontSize: 14, fontWeight: '600' },
  rowSub:   { color: '#444', fontSize: 11, marginTop: 2 },
  rowValue: { color: '#555', fontSize: 13 },
  footer: {
    textAlign: 'center', color: '#1e1e1e', fontSize: 10,
    fontWeight: '700', letterSpacing: 2, marginTop: 32,
  },
})