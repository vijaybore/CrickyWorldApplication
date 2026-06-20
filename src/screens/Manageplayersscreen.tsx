// src/screens/Manageplayersscreen.tsx
import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, TextInput, Pressable, FlatList,
  Modal, ScrollView, StyleSheet, ActivityIndicator,
  Alert, StatusBar, Platform, Image
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl, authHeaders, jsonHeaders } from '../services/api'
import { useAuth } from '../context/AuthContext'
import type { Player, PlayerRole, RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

const ROLES: PlayerRole[]               = ['batsman', 'bowler', 'allrounder', 'wk-batsman']
const ROLE_LABEL: Record<string, string> = { batsman: 'Batsman', bowler: 'Bowler', allrounder: 'All-Rounder', 'wk-batsman': 'WK-Bat' }
const ROLE_ICON:  Record<string, string> = { batsman: '🏏', bowler: '🎳', allrounder: '⭐', 'wk-batsman': '🧤' }
const ROLE_COLOR: Record<string, string> = { batsman: '#60a5fa', bowler: '#f87171', allrounder: '#facc15', 'wk-batsman': '#a78bfa' }
const BG_POOL = ['#7f1d1d', '#1e3a5f', '#064e3b', '#78350f', '#3b0764', '#134e4a', '#422006', '#0c4a6e']

const bgFor      = (name: string) => BG_POOL[name.charCodeAt(0) % BG_POOL.length]
const initialsOf = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ player, size = 44 }: { player: Player; size?: number }) {
  const rc = ROLE_COLOR[player.role] || '#555'
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2, borderColor: rc + '44', flexShrink: 0 }}>
      {player.photoUrl
        ? <Image source={{ uri: player.photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <View style={{ flex: 1, backgroundColor: bgFor(player.name), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#e0e0e0', fontSize: size * 0.34, fontWeight: '700' }}>{initialsOf(player.name)}</Text>
          </View>}
    </View>
  )
}

// ── Add Player Drawer ─────────────────────────────────────────────────────────
function AddPlayerDrawer({
  onClose,
  onAdded,
  token,
}: {
  onClose: () => void
  onAdded: (p: Player) => void
  token: string | null
}) {
  const [name,    setName]    = useState('')
  const [role,    setRole]    = useState<PlayerRole>('allrounder')
  const [batSty,  setBatSty]  = useState('')
  const [bowlSty, setBowlSty] = useState('')
  const [jersey,  setJersey]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const inputRef = useRef<TextInput>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 150) }, [])

  const handleSave = async () => {
    if (!name.trim()) { setError('Player name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(apiUrl('/api/players'), {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({
          name: name.trim(),
          role,
          battingStyle: batSty,
          bowlingStyle: bowlSty,
          jerseyNumber: jersey,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { message?: string }
        console.log('❌ Add player failed — status:', res.status, 'body:', d)
        throw new Error(d.message ?? `Server error ${res.status}`)
      }
      onAdded(await res.json() as Player)
      onClose()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to add player')
    } finally { setSaving(false) }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={D.backdrop}>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} style={{ flex: 1 }} onPress={onClose} />
      </View>
      <View style={D.sheet}>
        <View style={D.handle} />
        <View style={D.header}>
          <Text style={D.title}>➕ Add Player</Text>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={onClose} style={D.closeBtn}>
            <Text style={{ color: '#888', fontSize: 16, fontWeight: '700' }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={D.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={D.lbl}>PLAYER NAME *</Text>
          <TextInput ref={inputRef} style={D.input} value={name} onChangeText={setName}
            placeholder="e.g. Virat Kohli" placeholderTextColor="#333" returnKeyType="next" />

          <Text style={D.lbl}>ROLE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {ROLES.map(r => (
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} key={r} onPress={() => setRole(r)}
                style={[D.roleBtn, role === r && { borderColor: ROLE_COLOR[r], backgroundColor: ROLE_COLOR[r] + '22' }]}>
                <Text style={[D.roleTxt, role === r && { color: ROLE_COLOR[r] }]}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={D.lbl}>BATTING STYLE</Text>
          <TextInput style={D.input} value={batSty} onChangeText={setBatSty}
            placeholder="e.g. Right-hand bat" placeholderTextColor="#333" />

          <Text style={D.lbl}>BOWLING STYLE</Text>
          <TextInput style={D.input} value={bowlSty} onChangeText={setBowlSty}
            placeholder="e.g. Right-arm fast" placeholderTextColor="#333" />

          <Text style={D.lbl}>JERSEY NUMBER</Text>
          <TextInput style={D.input} value={jersey} onChangeText={setJersey}
            placeholder="e.g. 18" placeholderTextColor="#333" keyboardType="number-pad" />

          {error !== '' && (
            <View style={D.errorBox}><Text style={D.errorTxt}>{error}</Text></View>
          )}

          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={handleSave} disabled={saving}
            style={[D.saveBtn, saving && { backgroundColor: '#2a2a2a', elevation: 0 }]}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={D.saveTxt}>✅ Add Player</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

const D = StyleSheet.create({
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
  errorBox: { padding: 10, borderRadius: 10, backgroundColor: 'rgba(248,113,113,0.12)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)', marginBottom: 14 },
  errorTxt: { color: '#f87171', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  saveBtn:  { backgroundColor: '#cc0000', borderRadius: 12, padding: 13, alignItems: 'center' },
  saveTxt:  { color: '#fff', fontSize: 15, fontWeight: '800' },
})

// ── Player Card ───────────────────────────────────────────────────────────────
function PlayerCard({
  player, onDelete, deleting, onPress,
}: {
  player: Player
  onDelete: (id: string) => void
  deleting: string | null
  onPress: (player: Player) => void
}) {
  const [confirm, setConfirm] = useState(false)
  const stats: string[] = []
  if ((player.totalRuns    ?? 0) > 0) stats.push(`${player.totalRuns} runs`)
  if ((player.totalWickets ?? 0) > 0) stats.push(`${player.totalWickets} wkts`)
  if ((player.totalMatches ?? 0) > 0) stats.push(`${player.totalMatches} matches`)
  const rc = ROLE_COLOR[player.role] || '#555'

  // ── FIX (round 2): the original "tap once to arm, tap again within 3s to
  // confirm" pattern technically worked — verified via diagnostic logging
  // that confirm correctly went false→true→false on a ~3s timer — but 3
  // seconds isn't enough time for a real person to notice the icon changed,
  // process it, and tap again, especially over a slower connection or while
  // checking the screen. The fix isn't a longer timer; it's removing the
  // race entirely. Tapping delete now reveals explicit Cancel/Confirm
  // buttons that simply stay until the person acts on them — no countdown,
  // no way to "miss the window".
  if (confirm) {
    return (
      <View style={C.row}>
        <View style={C.confirmWrap}>
          <Text style={C.confirmTxt} numberOfLines={1}>Delete {player.name}?</Text>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => setConfirm(false)} style={C.cancelBtn}>
            <Text style={C.cancelTxt}>Cancel</Text>
          </Pressable>
          <Pressable
            android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={() => { setConfirm(false); onDelete(player._id) }}
            disabled={deleting === player._id}
            style={C.confirmBtn}
          >
            {deleting === player._id
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={C.confirmBtnTxt}>Delete</Text>}
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={C.row}>
      <Pressable android_ripple={{ color: 'rgba(255,255,255,0.06)' }} onPress={() => onPress(player)} style={C.card}>
        <Avatar player={player} size={46} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <Text style={C.name} numberOfLines={1}>{player.name}</Text>
            {player.jerseyNumber ? <Text style={C.jersey}>#{player.jerseyNumber}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: rc + '18', borderWidth: 1, borderColor: rc + '33' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: rc }}>{ROLE_ICON[player.role]} {ROLE_LABEL[player.role]}</Text>
            </View>
            {stats.length > 0 ? <Text style={C.stats}>{stats.join(' · ')}</Text> : null}
          </View>
        </View>
      </Pressable>
      <Pressable
        android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
        onPress={() => setConfirm(true)}
        disabled={deleting === player._id}
        style={C.delBtn}
        hitSlop={8}
      >
        <Text style={C.delTxt}>{deleting === player._id ? '⏳' : '🗑'}</Text>
      </Pressable>
    </View>
  )
}

const C = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  card:   { flex: 1, flexDirection: 'row', alignItems: 'center' },
  name:   { fontSize: 14, fontWeight: '700', color: '#f0f0f0' },
  jersey: { fontSize: 10, color: '#444', fontFamily: 'monospace' },
  stats:  { fontSize: 11, color: '#3a3a3a' },
  delBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 },
  delTxt: { fontSize: 15, color: '#444' },
  // No-timer confirm row: replaces the old "tap, wait ≤3s, tap again" flow.
  confirmWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmTxt:  { flex: 1, fontSize: 13, fontWeight: '700', color: '#f87171' },
  cancelBtn:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  cancelTxt:   { color: '#888', fontSize: 12, fontWeight: '800' },
  confirmBtn:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, backgroundColor: '#cc0000', minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  confirmBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
})

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function ManagePlayersScreen() {
  const { user, loginWithDevice } = useAuth()
  const navigation = useNavigation<Nav>()

  const [authToken,     setAuthToken]     = useState<string | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [loading,       setLoading]       = useState(true)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [roleFilter,    setRoleFilter]    = useState<'all' | PlayerRole>('all')
  const [showAdd,       setShowAdd]       = useState(false)
  const [fetchError,    setFetchError]    = useState('')
  const [syncingAll,    setSyncingAll]    = useState(false)

  const ALL_FILTER = ['all', ...ROLES] as const

  useEffect(() => {
    const init = async () => {
      let t = await AsyncStorage.getItem('token')
      if (!t) {
        const ok = await loginWithDevice()
        if (ok) t = await AsyncStorage.getItem('token')
      }
      setAuthToken(t)
      load(t)
    }
    init()
  }, [])

  const load = async (token: string | null = authToken) => {
    setLoading(true); setFetchError('')
    try {
      const res  = await fetch(apiUrl('/api/players'), { headers: authHeaders(token) })
      const data = await res.json()
      setPlayers(Array.isArray(data) ? data : [])
    } catch {
      setFetchError('Failed to load players')
    } finally {
      setLoading(false)
    }
  }

  // ── FIX: actually check the server's response before updating the list.
  // Previously this removed the player from the screen unconditionally, even
  // if the DELETE request failed (e.g. 404 because of an owner mismatch) —
  // so the player would silently reappear the next time the list reloaded,
  // which is exactly what "delete doesn't work" looks like from the outside.
  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(apiUrl(`/api/players/${id}`), {
        method: 'DELETE',
        headers: authHeaders(authToken),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(d.message || `Delete failed (${res.status})`)
      }
      setPlayers(ps => ps.filter(p => p._id !== id))
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to delete player')
    } finally {
      setDeleting(null)
    }
  }

  // One tap to bring every player's career totals up to date with completed
  // and in-progress matches — useful right after finishing a match, or to
  // backfill players who were added before the auto-sync fix shipped.
  const syncAll = async () => {
    if (!players.length || syncingAll) return
    setSyncingAll(true)
    try {
      const updated = await Promise.all(
        players.map(p =>
          fetch(apiUrl(`/api/players/${p._id}/sync`), { method: 'POST', headers: authHeaders(authToken) })
            .then(r => (r.ok ? r.json() as Promise<Player> : p))
            .catch(() => p)
        )
      )
      setPlayers(updated)
    } finally {
      setSyncingAll(false)
    }
  }

  const visible = (players || []).filter(p => {
    const ms = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const mr = roleFilter === 'all' || p.role === roleFilter
    return ms && mr
  })

  const counts: Record<string, number> = { all: players.length }
  ROLES.forEach(r => { counts[r] = players.filter(p => p.role === r).length })

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="#080808" />

      {/* Header */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => navigation.goBack()} style={S.backBtn}>
            <Text style={S.backTxt}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={S.title}>👥 Manage Players</Text>
            <Text style={S.subtitle}>{players.length} total · {visible.length} shown</Text>
          </View>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => setShowAdd(true)} style={S.addBtn}>
            <Text style={S.addBtnTxt}>➕ Add</Text>
          </Pressable>
        </View>

        {/* Sync all */}
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={syncAll} disabled={syncingAll || !players.length} style={S.syncBtn}>
          <Text style={S.syncBtnTxt}>{syncingAll ? '⏳ Syncing every player…' : '↻ Sync All Stats from Matches'}</Text>
        </Pressable>

        {/* Search */}
        <View style={S.searchWrap}>
          <Text style={{ color: '#444', fontSize: 15, marginRight: 8 }}>🔍</Text>
          <TextInput style={S.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search players…" placeholderTextColor="#333" />
          {search !== '' ? (
            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => setSearch('')}>
              <Text style={{ color: '#555', fontSize: 16 }}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Role chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ paddingHorizontal: 14, paddingBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
          {ALL_FILTER.map(r => {
            const active = roleFilter === r
            const color  = r === 'all' ? '#ff4444' : ROLE_COLOR[r]
            const label  = r === 'all'
              ? `All (${counts.all})`
              : `${ROLE_ICON[r]} ${ROLE_LABEL[r]} (${counts[r] ?? 0})`
            return (
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} key={r}
                onPress={() => setRoleFilter(r as 'all' | PlayerRole)}
                style={[S.chip, active && { borderColor: color, backgroundColor: color + '18' }]}>
                <Text style={[S.chipTxt, active && { color }]}>{label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={S.centered}><ActivityIndicator color="#ff4444" size="large" /></View>
      ) : fetchError !== '' ? (
        <View style={S.centered}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ color: '#f87171', fontWeight: '700', marginBottom: 16 }}>{fetchError}</Text>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => load()} style={S.retryBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      ) : visible.length === 0 ? (
        <View style={S.centered}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>👥</Text>
          <Text style={{ color: '#3a3a3a', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
            {search || roleFilter !== 'all' ? 'No players match your filter' : 'No players yet'}
          </Text>
          {!search && roleFilter === 'all' ? (
            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => setShowAdd(true)} style={S.emptyBtn}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>➕ Add First Player</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={p => p._id}
          renderItem={({ item }) => (
            <PlayerCard
              player={item}
              onDelete={handleDelete}
              deleting={deleting}
              // ── FIX: navigate to the real Player Profile screen (Edit, Sync,
              // Delete, full stat tabs) instead of opening the old read-only
              // preview card, which had no way to edit anything.
              onPress={p => navigation.navigate('PlayerProfile', { id: p._id })}
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {showAdd ? (
        <AddPlayerDrawer
          onClose={() => setShowAdd(false)}
          onAdded={p => setPlayers(ps => [p, ...ps])}
          token={authToken}
        />
      ) : null}
    </View>
  )
}

const S = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0d0d0d' },
  header:      { backgroundColor: '#0d0d0d', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingTop: Platform.OS === 'ios' ? 50 : 36 },
  backBtn:     { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  backTxt:     { color: '#aaa', fontSize: 18, fontWeight: '600' },
  title:       { fontSize: 22, fontWeight: '700', color: '#f0f0f0', letterSpacing: 0.5 },
  subtitle:    { fontSize: 11, color: '#444', fontWeight: '600', marginTop: 1 },
  addBtn:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#cc0000' },
  addBtnTxt:   { color: '#fff', fontSize: 13, fontWeight: '800' },
  syncBtn:     { marginHorizontal: 16, marginBottom: 12, padding: 11, borderRadius: 11, backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.18)', alignItems: 'center' },
  syncBtnTxt:  { color: '#4ade80', fontSize: 12, fontWeight: '700' },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 10, backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 14, paddingVertical: 9 },
  searchInput: { flex: 1, color: '#f0f0f0', fontSize: 14 },
  chip:        { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'transparent' },
  chipTxt:     { color: '#444', fontSize: 11, fontWeight: '800' },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  retryBtn:    { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  emptyBtn:    { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: '#cc0000' },
})