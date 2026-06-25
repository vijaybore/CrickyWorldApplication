// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Player Profile Screen
// src/screens/PlayerProfileScreen.tsx
// Cricbuzz / ESPNcricinfo style player profile:
//   • Hero header (avatar, name, role, jersey, DOB)
//   • Edit profile (name, DOB, jersey, role, batting/bowling style, photo URL)
//   • Career summary strip
//   • Full batting, bowling & fielding stat tables
//   • Tournaments played (derived from matches' tournamentName)
//   • Delete player
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, Pressable, ScrollView, Modal,
  StyleSheet, ActivityIndicator, Alert, Image, StatusBar, Platform,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { launchImageLibrary } from 'react-native-image-picker'
import { apiUrl, authHeaders, jsonHeaders } from '../services/api'
import type { Player, PlayerRole, RootStackParamList, Match } from '../types'

type Nav   = NativeStackNavigationProp<RootStackParamList>
type Route = RouteProp<RootStackParamList, 'PlayerProfile'>

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES: PlayerRole[] = ['batsman', 'bowler', 'allrounder', 'wk-batsman']
const ROLE_ICON:  Record<string, string> = { batsman:'🏏', bowler:'🎳', allrounder:'⭐', 'wk-batsman':'🧤' }
const ROLE_COLOR: Record<string, string> = { batsman:'#60a5fa', bowler:'#f87171', allrounder:'#facc15', 'wk-batsman':'#a78bfa' }
const ROLE_LABEL: Record<string, string> = { batsman:'Batsman', bowler:'Bowler', allrounder:'All-Rounder', 'wk-batsman':'WK-Batsman' }
const BG_COLORS = ['#7f1d1d','#1e3a5f','#064e3b','#78350f','#3b0764','#134e4a','#422006','#0c4a6e']

async function getToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem('token') } catch { return null }
}

function fmtOv(b: number): string { return `${Math.floor(b / 6)}.${b % 6}` }

function fmtDOB(dob?: string): string {
  if (!dob) return '—'
  const d = new Date(dob)
  if (isNaN(d.getTime())) return dob
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function age(dob?: string): string {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
  return a >= 0 ? `${a} yrs` : ''
}

// Derive display stats (averages, SR, economy etc.) from raw career totals
function derive(p: Player) {
  const to = p.timesOut ?? 0, tr = p.totalRuns ?? 0, bf = p.totalBallsFaced ?? 0
  const wk = p.totalWickets ?? 0, bb = p.totalBallsBowled ?? 0, rc = p.totalRunsConceded ?? 0
  return {
    batAvg:  to > 0 ? (tr / to).toFixed(1) : tr > 0 ? `${tr}*` : '—',
    batSR:   bf > 0 ? (tr / bf * 100).toFixed(1) : '—',
    eco:     bb > 0 ? (rc / (bb / 6)).toFixed(2) : '—',
    bowlAvg: wk > 0 ? (rc / wk).toFixed(1) : '—',
    bowlSR:  wk > 0 ? (bb / wk).toFixed(1) : '—',
    bestFig: (p.bestBowlingW ?? 0) > 0 ? `${p.bestBowlingW}/${p.bestBowlingR}` : '—',
    overs:   fmtOv(bb),
  }
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ player, size = 96 }: { player: Player; size?: number }) {
  const ini = (player.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const bg  = BG_COLORS[(player.name?.charCodeAt(0) ?? 0) % BG_COLORS.length]
  const rc  = ROLE_COLOR[player.role] || '#555'
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 3, borderColor: rc, flexShrink: 0 }}>
      {player.photoUrl
        ? <Image source={{ uri: player.photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#e0e0e0', fontSize: size * 0.34, fontWeight: '700' }}>{ini}</Text>
          </View>}
    </View>
  )
}

// ── Stat Table Row ───────────────────────────────────────────────────────────
function StatRow({ label, value, color = '#f0f0f0', isAlt = false }: { label: string; value: unknown; color?: string; isAlt?: boolean }) {
  return (
    <View style={[st.row, isAlt && { backgroundColor: '#141414' }]}>
      <Text style={st.label}>{label}</Text>
      <Text style={[st.value, { color }]}>{String(value ?? '—')}</Text>
    </View>
  )
}
const st = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  label: { fontSize: 12, color: '#888', fontWeight: '700' },
  value: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
})

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return <Text style={S.sectionHeader}>{icon}  {title}</Text>
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────
function EditProfileModal({
  player, onClose, onSaved,
}: { player: Player; onClose: () => void; onSaved: (p: Player) => void }) {
  const [name,         setName]         = useState(player.name)
  const [role,         setRole]         = useState<PlayerRole>(player.role)
  const [jersey,       setJersey]       = useState(player.jerseyNumber || '')
  const [dob,          setDob]          = useState(player.dateOfBirth || '')
  const [battingStyle, setBattingStyle] = useState(player.battingStyle || '')
  const [bowlingStyle, setBowlingStyle] = useState(player.bowlingStyle || '')
  const [photoUrl,     setPhotoUrl]     = useState(player.photoUrl || '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)

  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.6,
      })
      if (result.didCancel) return
      if (result.errorCode) {
        setError(result.errorMessage || 'Failed to open gallery')
        return
      }
      const asset = result.assets?.[0]
      if (!asset?.base64) {
        setError('Could not read selected image')
        return
      }
      const mime = asset.type || 'image/jpeg'
      setPhotoUrl(`data:${mime};base64,${asset.base64}`)
      setError('')
    } catch (e: any) {
      setError(e?.message || 'Failed to open gallery')
    }
  }

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const token = await getToken()
      const res = await fetch(apiUrl(`/api/players/${player._id}`), {
        method: 'PUT',
        headers: jsonHeaders(token),
        body: JSON.stringify({
          name: name.trim(), role, jerseyNumber: jersey,
          dateOfBirth: dob, battingStyle, bowlingStyle, photoUrl: photoUrl.trim(),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(d.message || 'Failed to update profile')
      }
      const updated = await res.json() as Player
      onSaved(updated)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to update profile')
    } finally { setSaving(false) }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={E.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </View>
      <View style={E.sheet}>
        <View style={E.handle} />
        <View style={E.header}>
          <Text style={E.title}>✏️ Edit Profile</Text>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={onClose} style={E.closeBtn}>
            <Text style={{ color: '#888', fontSize: 16, fontWeight: '700' }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={E.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={E.lbl}>NAME *</Text>
          <TextInput style={E.input} value={name} onChangeText={setName}
            placeholder="Player name" placeholderTextColor="#3a3a3a" />

          <Text style={E.lbl}>PROFILE PHOTO</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#2a2a2a' }} />
            ) : (
              <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#2a2a2a', backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>👤</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 8 }}>
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={pickImage} style={E.photoBtn}>
                <Text style={E.photoBtnTxt}>🖼️ Choose from Gallery</Text>
              </Pressable>
              {photoUrl ? (
                <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => setPhotoUrl('')} style={E.photoRemoveBtn}>
                  <Text style={E.photoRemoveTxt}>Remove Photo</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Pressable onPress={() => setShowUrlInput(s => !s)} style={{ marginBottom: showUrlInput ? 6 : 14 }}>
            <Text style={{ color: '#555', fontSize: 11, fontWeight: '700' }}>
              {showUrlInput ? '▾ Hide URL option' : '▸ Or paste an image URL instead'}
            </Text>
          </Pressable>
          {showUrlInput && (
            <TextInput style={E.input} value={photoUrl} onChangeText={setPhotoUrl}
              placeholder="https://…" placeholderTextColor="#3a3a3a" autoCapitalize="none" autoCorrect={false} />
          )}

          <Text style={E.lbl}>DATE OF BIRTH</Text>
          <TextInput style={E.input} value={dob} onChangeText={setDob}
            placeholder="YYYY-MM-DD" placeholderTextColor="#3a3a3a" keyboardType="numbers-and-punctuation" />

          <Text style={E.lbl}>JERSEY NUMBER</Text>
          <TextInput style={E.input} value={jersey} onChangeText={setJersey}
            placeholder="e.g. 18" placeholderTextColor="#3a3a3a" keyboardType="number-pad" />

          <Text style={E.lbl}>ROLE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {ROLES.map(r => (
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} key={r} onPress={() => setRole(r)}
                style={[E.roleBtn, role === r && { borderColor: ROLE_COLOR[r], backgroundColor: ROLE_COLOR[r] + '22' }]}>
                <Text style={[E.roleTxt, role === r && { color: ROLE_COLOR[r] }]}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={E.lbl}>BATTING STYLE</Text>
          <TextInput style={E.input} value={battingStyle} onChangeText={setBattingStyle}
            placeholder="e.g. Right-hand bat" placeholderTextColor="#3a3a3a" />

          <Text style={E.lbl}>BOWLING STYLE</Text>
          <TextInput style={E.input} value={bowlingStyle} onChangeText={setBowlingStyle}
            placeholder="e.g. Right-arm medium" placeholderTextColor="#3a3a3a" />

          {error !== '' && <View style={E.errorBox}><Text style={E.errorTxt}>⚠️ {error}</Text></View>}

          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={save} disabled={saving}
            style={[E.saveBtn, saving && { backgroundColor: '#2a2a2a' }]}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={E.saveTxt}>💾 Save Changes</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}
const E = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.82)' },
  sheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0f0f0f', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  handle:   { width: 40, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginTop: 14 },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  title:    { color: '#f0f0f0', fontWeight: '700', fontSize: 20 },
  closeBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  body:     { padding: 18, paddingBottom: 40 },
  lbl:      { fontSize: 10, color: '#777', fontWeight: '800', letterSpacing: 1.5, marginBottom: 6, marginTop: 2 },
  input:    { backgroundColor: '#0a0a0a', borderRadius: 10, borderWidth: 1.5, borderColor: '#222', color: '#f0f0f0', fontSize: 14, padding: 11, paddingHorizontal: 14, marginBottom: 14 },
  roleBtn:  { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: '#2a2a2a' },
  roleTxt:  { color: '#666', fontSize: 12, fontWeight: '800' },
  photoBtn:       { backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1.5, borderColor: 'rgba(255,68,68,0.3)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  photoBtnTxt:    { color: '#ff4444', fontSize: 12, fontWeight: '800' },
  photoRemoveBtn: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  photoRemoveTxt: { color: '#888', fontSize: 11, fontWeight: '700' },
  errorBox: { padding: 10, borderRadius: 10, backgroundColor: 'rgba(248,113,113,0.12)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)', marginBottom: 14 },
  errorTxt: { color: '#f87171', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  saveBtn:  { backgroundColor: '#cc0000', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 4 },
  saveTxt:  { color: '#fff', fontSize: 15, fontWeight: '800' },
})

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function PlayerProfileScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { id } = route.params

  const [player,  setPlayer]  = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [editing, setEditing] = useState(false)
  const [tab,     setTab]     = useState<'batting' | 'bowling' | 'fielding'>('batting')
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const token = await getToken()
      const [pRes, mRes] = await Promise.all([
        fetch(apiUrl(`/api/players/${id}`), { headers: authHeaders(token) }),
        fetch(apiUrl('/api/matches'), { headers: authHeaders(token) }),
      ])
      if (!pRes.ok) throw new Error('Failed to load player')
      const p = await pRes.json() as Player
      setPlayer(p)

      const mr = await mRes.json().catch(() => [])
      const matchesData: Match[] =
        Array.isArray(mr) ? mr
        : Array.isArray(mr?.matches) ? mr.matches
        : Array.isArray(mr?.data) ? mr.data
        : []
      setMatches(matchesData)
    } catch (e: any) {
      setError(e?.message || 'Failed to load player')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  // Tournaments this player has appeared in (derived from match innings stats)
  const tournaments = useMemo(() => {
    if (!player) return []
    const set = new Map<string, { name: string; matches: number; lastDate?: string }>()
    matches.forEach(m => {
      const appeared =
        (m.innings1?.battingStats ?? []).some(b => b.name === player.name) ||
        (m.innings1?.bowlingStats ?? []).some(b => b.name === player.name) ||
        (m.innings2?.battingStats ?? []).some(b => b.name === player.name) ||
        (m.innings2?.bowlingStats ?? []).some(b => b.name === player.name)
      if (!appeared) return
      const tname = m.tournamentName
      if (!tname) return
      const entry = set.get(tname) || { name: tname, matches: 0, lastDate: m.createdAt }
      entry.matches += 1
      if (m.createdAt && (!entry.lastDate || m.createdAt > entry.lastDate)) entry.lastDate = m.createdAt
      set.set(tname, entry)
    })
    return Array.from(set.values()).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''))
  }, [matches, player])

  const sync = async () => {
    if (!player) return
    setSyncing(true)
    try {
      const token = await getToken()
      const res = await fetch(apiUrl(`/api/players/${player._id}/sync`), {
        method: 'POST', headers: authHeaders(token),
      })
      if (res.ok) {
        const data = await res.json() as Player
        setPlayer(data)
      }
      await load()
    } catch { /* ignore */ }
    finally { setSyncing(false) }
  }

  const handleDelete = () => {
    if (!player) return
    Alert.alert('Delete Player', `Delete ${player.name}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken()
            const res = await fetch(apiUrl(`/api/players/${player._id}`), {
              method: 'DELETE', headers: authHeaders(token),
            })
            if (!res.ok) {
              const d = await res.json().catch(() => ({})) as { message?: string }
              throw new Error(d.message || 'Failed to delete player')
            }
            navigation.goBack()
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to delete player')
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={[S.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <ActivityIndicator color="#ff4444" size="large" />
      </View>
    )
  }

  if (error || !player) {
    return (
      <View style={[S.root, { alignItems: 'center', justifyContent: 'center', padding: 40 }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <Text style={{ fontSize: 36, marginBottom: 12 }}>⚠️</Text>
        <Text style={{ color: '#f87171', fontWeight: '700', marginBottom: 16, textAlign: 'center' }}>
          {error || 'Player not found'}
        </Text>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={load} style={S.retryBtn}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  const d  = derive(player)
  const rc = ROLE_COLOR[player.role] || '#888'

  const hasBat   = (player.totalRuns ?? 0) > 0 || (player.totalBallsFaced ?? 0) > 0
  const hasBowl  = (player.totalWickets ?? 0) > 0 || (player.totalBallsBowled ?? 0) > 0
  const totalDis = (player.catches ?? 0) + (player.stumpings ?? 0) + (player.runOuts ?? 0)
  const hasField = totalDis > 0

  const batRows = [
    { label: 'Matches',        value: player.totalMatches,      color: '#f0f0f0' },
    { label: 'Runs',           value: player.totalRuns,         color: '#ff4444' },
    { label: 'Highest Score',  value: (player.highestScore ?? 0) > 0 ? player.highestScore : '—', color: '#ff6666' },
    { label: 'Average',        value: d.batAvg,                 color: '#60a5fa' },
    { label: 'Strike Rate',    value: d.batSR,                   color: '#facc15' },
    { label: 'Balls Faced',    value: player.totalBallsFaced,    color: '#888' },
    { label: 'Fours (4s)',     value: player.totalFours,         color: '#4ade80' },
    { label: 'Sixes (6s)',     value: player.totalSixes,         color: '#c084fc' },
    { label: 'Half Centuries', value: player.totalFifties,       color: '#fb923c' },
    { label: 'Centuries',      value: player.totalHundreds,      color: '#facc15' },
    { label: 'Times Out',      value: player.timesOut,           color: '#888' },
  ].filter(r => r.value !== undefined)

  const bowlRows = [
    { label: 'Matches',         value: player.totalMatches,       color: '#f0f0f0' },
    { label: 'Wickets',         value: player.totalWickets,       color: '#c084fc' },
    { label: 'Best Figures',    value: d.bestFig,                  color: '#ff4444' },
    { label: 'Economy',         value: d.eco,                      color: '#4ade80' },
    { label: 'Average',         value: d.bowlAvg,                  color: '#60a5fa' },
    { label: 'Strike Rate',     value: d.bowlSR,                    color: '#38bdf8' },
    { label: 'Overs Bowled',    value: d.overs,                    color: '#888' },
    { label: 'Runs Conceded',   value: player.totalRunsConceded,   color: '#f87171' },
    { label: 'Wides',           value: player.totalWides,          color: '#fb923c' },
    { label: '5-Wicket Hauls',  value: player.fiveWickets,         color: '#ff4444' },
  ]

  // Fielding now reads straight off the player record — the backend keeps
  // catches/stumpings/runOuts current automatically, so there's no need to
  // recompute anything from raw match data here.
  const fieldRows = [
    { label: 'Total Dismissals', value: totalDis,             color: '#4ade80' },
    { label: 'Catches',          value: player.catches ?? 0,  color: '#4ade80' },
    { label: 'Stumpings',        value: player.stumpings ?? 0, color: '#a78bfa' },
    { label: 'Run Outs',         value: player.runOuts ?? 0,  color: '#fb923c' },
  ]

  const rows = tab === 'batting' ? batRows : tab === 'bowling' ? bowlRows : fieldRows

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={S.header}>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={S.backTxt}>←</Text>
        </Pressable>
        <Text style={S.headerTitle}>Player Profile</Text>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => setEditing(true)} style={S.editBtn}>
          <Text style={S.editTxt}>✏️ Edit</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
        {/* Hero */}
        <View style={[S.hero, { backgroundColor: BG_COLORS[(player.name?.charCodeAt(0) ?? 0) % BG_COLORS.length] }]}>
          <Avatar player={player} size={92} />
          <Text style={S.heroName}>{player.name}</Text>
          {player.jerseyNumber ? <Text style={S.heroJersey}>#{player.jerseyNumber}</Text> : null}
          <View style={[S.rolePill, { backgroundColor: rc + '22', borderColor: rc + '55' }]}>
            <Text style={[S.rolePillTxt, { color: rc }]}>{ROLE_ICON[player.role]}  {ROLE_LABEL[player.role]}</Text>
          </View>
          {(player.battingStyle || player.bowlingStyle) && (
            <Text style={S.heroStyle}>
              {[player.battingStyle, player.bowlingStyle].filter(Boolean).join(' · ')}
            </Text>
          )}
          {player.dateOfBirth ? (
            <Text style={S.heroDob}>🎂 {fmtDOB(player.dateOfBirth)}{age(player.dateOfBirth) ? `  ·  ${age(player.dateOfBirth)}` : ''}</Text>
          ) : null}
        </View>

        {/* Career summary strip */}
        <View style={S.strip}>
          {[
            { l: 'MATCHES',  v: player.totalMatches ?? 0,  c: '#f0f0f0' },
            { l: 'RUNS',     v: player.totalRuns ?? 0,     c: '#ff4444' },
            { l: 'WICKETS',  v: player.totalWickets ?? 0,  c: '#c084fc' },
          ].map((s, i) => (
            <View key={s.l} style={[S.stripCell, i < 2 && { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)' }]}>
              <Text style={[S.stripVal, { color: s.c }]}>{s.v}</Text>
              <Text style={S.stripLbl}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Sync */}
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={sync} disabled={syncing} style={S.syncBtn}>
          <Text style={S.syncTxt}>{syncing ? '⏳ Syncing…' : '↻ Sync stats from completed matches'}</Text>
        </Pressable>

        {/* Tabs */}
        <SectionHeader icon="📊" title="Career Statistics" />
        <View style={S.tabRow}>
          {(['batting', 'bowling', 'fielding'] as const).map(t => (
            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} key={t} onPress={() => setTab(t)}
              style={[S.tab, tab === t && S.tabActive]}>
              <Text style={[S.tabTxt, tab === t && { color: t === 'batting' ? '#ff4444' : t === 'bowling' ? '#c084fc' : '#4ade80' }]}>
                {t === 'batting' ? '🏏 Batting' : t === 'bowling' ? '🎳 Bowling' : '🧤 Fielding'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Stats table */}
        <View style={S.tableWrap}>
          {rows.map((r, i) => <StatRow key={r.label} label={r.label} value={r.value} color={r.color} isAlt={i % 2 === 1} />)}
        </View>
        {tab === 'batting' && !hasBat && (
          <Text style={S.emptyNote}>No batting record yet — stats appear after matches are scored.</Text>
        )}
        {tab === 'bowling' && !hasBowl && (
          <Text style={S.emptyNote}>No bowling record yet — stats appear after matches are scored.</Text>
        )}
        {tab === 'fielding' && !hasField && (
          <Text style={S.emptyNote}>No fielding record yet — catches, stumpings and run outs appear after matches are scored.</Text>
        )}

        {/* Tournaments */}
        <SectionHeader icon="🏆" title={`Tournaments Played (${tournaments.length})`} />
        {tournaments.length === 0 ? (
          <Text style={S.emptyNote}>No tournament matches recorded for this player yet.</Text>
        ) : (
          <View style={S.tableWrap}>
            {tournaments.map((t, i) => (
              <View key={t.name} style={[S.tourRow, i % 2 === 1 && { backgroundColor: '#141414' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={S.tourName} numberOfLines={1}>{t.name}</Text>
                  {t.lastDate ? <Text style={S.tourDate}>Last played {fmtDOB(t.lastDate)}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={S.tourMatches}>{t.matches}</Text>
                  <Text style={S.tourMatchesLbl}>MATCHES</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Delete */}
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={handleDelete} style={S.deleteBtn}>
          <Text style={S.deleteTxt}>🗑 Delete Player</Text>
        </Pressable>
      </ScrollView>

      {editing && (
        <EditProfileModal
          player={player}
          onClose={() => setEditing(false)}
          onSaved={p => setPlayer(p)}
        />
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 50 : 36, paddingBottom: 14, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backBtn:  { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  backTxt:  { color: '#aaa', fontSize: 18, fontWeight: '600' },
  headerTitle: { flex: 1, color: '#f0f0f0', fontWeight: '700', fontSize: 18, letterSpacing: 0.5 },
  editBtn:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' },
  editTxt:  { color: '#ff4444', fontSize: 13, fontWeight: '800' },

  hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  heroName: { color: '#f5f5f5', fontSize: 24, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  heroJersey: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  rolePill: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1.5, marginTop: 10 },
  rolePillTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  heroStyle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  heroDob: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', marginTop: 6 },

  strip: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  stripCell: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  stripVal: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  stripLbl: { fontSize: 9, color: '#555', fontWeight: '800', letterSpacing: 1, marginTop: 3 },

  syncBtn: { margin: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.18)', alignItems: 'center' },
  syncTxt: { color: '#4ade80', fontSize: 12, fontWeight: '700' },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#555', letterSpacing: 2, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 10 },

  tabRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 8, marginBottom: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  tabActive: { backgroundColor: 'rgba(255,68,68,0.1)', borderColor: 'rgba(255,68,68,0.3)' },
  tabTxt: { color: '#666', fontSize: 12, fontWeight: '800' },

  tableWrap: { marginHorizontal: 14, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },

  emptyNote: { color: '#444', fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24, paddingVertical: 16 },

  tourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tourName: { color: '#e0e0e0', fontSize: 14, fontWeight: '700' },
  tourDate: { color: '#444', fontSize: 10, fontWeight: '600', marginTop: 2 },
  tourMatches: { color: '#facc15', fontSize: 18, fontWeight: '800', fontFamily: 'monospace' },
  tourMatchesLbl: { color: '#444', fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 1 },

  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  deleteBtn: { marginHorizontal: 14, marginTop: 24, marginBottom: 10, padding: 12, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)', alignItems: 'center' },
  deleteTxt: { color: '#ff4444', fontWeight: '800', fontSize: 13 },
})