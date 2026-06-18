// src/screens/ScoringScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Scoring Screen (v3 — matches provided design reference)
//
// WHAT'S NEW / FIXED IN THIS VERSION
// ───────────────────────────────────
// 1. Player rows redesigned as full-width color-coded cards exactly like the
//    reference screenshot:
//       Striker      → blue accent   (#3b82f6 family)
//       Non-Striker  → green accent  (#22c55e family)
//       Bowler       → purple/amber accent (#f59e0b family, matches ref)
//    Each row shows an icon avatar circle, role label, name or placeholder
//    text, R/B/SR (or O/R/W for bowler) stat columns, and a chevron.
//
// 2. "Players Not Set" dialog redesigned to match the reference exactly:
//    bat+stumps emoji header, close (✕) button, title, helper text, and
//    three full-width tappable rows — Tap to Set Striker / Non-Striker /
//    Bowler — colour-coded the same as the main cards. Tapping a row opens
//    that player's picker directly (no extra step).
//
// 3. THE CORE FIX — Set Name now actually works end-to-end:
//      • PlayerPicker lists every existing player for context (already-
//        registered players from /api/players, plus anyone already used in
//        this match) so you can simply pick an existing name.
//      • Typing a brand-new name shows a "+ Add "<name>"" row. Selecting it
//        (or any name) immediately:
//          a) sets that player as striker / non-striker / bowler, AND
//          b) silently calls autoSyncPlayer() which POSTs to /api/players
//             if the name doesn't already exist (case-insensitive match),
//             so it now permanently shows up in the Manage Players list.
//      • This sync runs for all three roles and for the in-dialog rows too,
//        since they route through the exact same handler functions.
//
// 4. Read-only mode preserved for completed matches; Second Innings dialog
//    and Match Result popup preserved from the prior pass.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, Pressable, ScrollView, TextInput,
  Modal, FlatList, StyleSheet, ActivityIndicator,
  Alert, StatusBar, Platform, Animated,
} from 'react-native'
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl, authHeaders, jsonHeaders } from '../services/api'
import type { RootStackParamList, Ball } from '../types'

type Route = RouteProp<RootStackParamList, 'Scoring'>
type Nav   = NativeStackNavigationProp<RootStackParamList>

type PlayerInfo = {
  name: string; role?: string
  jerseyNumber?: string | number
  battingStyle?: string; bowlingStyle?: string
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: '#0a0a0a', surface: '#111111', card: '#161616', card2: '#1c1c1c',
  border: '#222222', border2: '#1a1a1a',
  accent: '#cc0000', accentDim: '#4a0000', accentBright: '#ff2222',
  gold: '#f59e0b', goldDim: '#78350f',
  green: '#22c55e', greenDim: '#14532d',
  orange: '#fb923c', orangeDim: '#431407',
  sky: '#38bdf8', purple: '#c084fc', purpleDim: '#3b0764',
  text: '#f0f0f0', text2: '#cccccc', subtext: '#888888', muted: '#555555',
  faint: '#1a1a1a',
}

// Role-specific colors — pulled from the app's own theme (T) instead of
// foreign hex values, so the cards feel native to CrickyWorld rather than
// imported from a reference mockup.
//   Striker      → T.accent (the app's signature red)
//   Non-Striker  → T.sky    (cool blue, reads clearly distinct from red)
//   Bowler       → T.gold   (amber — already used for "live"/highlight states)
const ROLE_COLORS = {
  striker:    { main: T.accent, dim: T.accentDim, border: T.accent + '55', bg: 'rgba(204,0,0,0.07)' },
  nonStriker: { main: T.sky,    dim: '#0a2536',    border: T.sky + '55',    bg: 'rgba(56,189,248,0.06)' },
  bowler:     { main: T.gold,   dim: T.goldDim,    border: T.gold + '55',   bg: 'rgba(245,158,11,0.06)' },
}

const fmtOv   = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
const calcCRR = (runs: number, balls: number) => balls === 0 ? '0.0' : (runs / (balls / 6)).toFixed(1)
const calcRRR = (target: number, runs: number, balls: number, totalOvers: number) => {
  const rem = totalOvers * 6 - balls
  return rem <= 0 ? '—' : ((target - runs) / (rem / 6)).toFixed(1)
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('token').catch(() => null)
}

// ── getBattingTeam (priority logic preserved) ─────────────────────────────────
function getBattingTeam(match: any, inningsKey: 'innings1' | 'innings2'): string {
  const t1 = match.team1 || ''
  const t2 = match.team2 || ''
  const inn = match[inningsKey]
  const innBT = inn?.battingTeam
  if (innBT && (innBT === t1 || innBT === t2)) return innBT
  const bf = match.battingFirst || match.battingTeam || match.battingFirstTeam
  if (bf && (bf === t1 || bf === t2)) {
    return inningsKey === 'innings1' ? bf : (bf === t1 ? t2 : t1)
  }
  return inningsKey === 'innings1' ? t1 : t2
}
function getBowlingTeam(match: any, inningsKey: 'innings1' | 'innings2'): string {
  const battingTeam = getBattingTeam(match, inningsKey)
  return battingTeam === match.team1 ? match.team2 : match.team1
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE FIX: Auto Player Sync — guarantees uniqueness
//
// Every player name is unique, case-insensitively, across the whole roster.
// Before creating anything we:
//   1. Re-fetch the live player list from the server (never trust a stale
//      local cache for this decision — two screens, two devices, or a
//      previous session could have added the name already).
//   2. Compare case-insensitively, trimming whitespace, so "MS Dhoni",
//      "ms dhoni", and "  MS Dhoni " are all treated as the same player.
//   3. Only POST a create if truly absent.
//   4. Use an in-flight lock keyed by lowercased name so that picking the
//      same brand-new name twice in quick succession (e.g. setting them as
//      both striker candidates before the first request resolves) cannot
//      race into two separate records — the second caller just waits for
//      and reuses the first call's result.
// ─────────────────────────────────────────────────────────────────────────────
type Player_API = { _id?: string; name: string; role?: string; jerseyNumber?: string | number }

const inFlightSync = new Map<string, Promise<PlayerInfo>>()

async function fetchAllPlayers(): Promise<Player_API[]> {
  try {
    const token    = await getToken()
    const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
    const baseUrl  = apiUrl('/api/players')
    const url      = !token && deviceId ? `${baseUrl}?deviceId=${deviceId}` : baseUrl
    const res      = await fetch(url, { headers: authHeaders(token) })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function findExisting(list: Player_API[], name: string): Player_API | undefined {
  const needle = name.trim().toLowerCase()
  return list.find(p => (p.name ?? '').trim().toLowerCase() === needle)
}

async function autoSyncPlayer(
  rawName: string,
  role: 'batsman' | 'bowler',
  teamName: string,
): Promise<PlayerInfo> {
  const trimmed = rawName.trim()
  if (!trimmed) return { name: trimmed, role }

  const key = trimmed.toLowerCase()

  // If a sync for this exact name (case-insensitive) is already running,
  // piggyback on it instead of starting a second create request.
  const existingCall = inFlightSync.get(key)
  if (existingCall) return existingCall

  const task = (async (): Promise<PlayerInfo> => {
    try {
      // 1. Fresh, authoritative existence check — never trust local cache here.
      const liveList = await fetchAllPlayers()
      const match    = findExisting(liveList, trimmed)
      if (match) {
        return { name: match.name, role: match.role ?? role, jerseyNumber: match.jerseyNumber }
      }

      // 2. Confirmed absent — safe to create exactly one record.
      const token    = await getToken()
      const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
      const body: Record<string, any> = {
        name: trimmed,
        role,
        team: teamName,
        battingStyle: 'Right-hand bat',
        bowlingStyle: role === 'batsman' ? '' : 'Right-arm medium',
      }
      if (!token && deviceId) body.deviceId = deviceId

      const res = await fetch(apiUrl('/api/players'), {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const created = await res.json() as Player_API
        return { name: created.name ?? trimmed, role: created.role ?? role, jerseyNumber: created.jerseyNumber }
      }

      // 3. Create failed (e.g. backend enforces a unique index and rejected
      //    a same-millisecond duplicate from another client) — re-check the
      //    server once more so we still resolve to the canonical record
      //    rather than silently losing the player.
      const recheck = await fetchAllPlayers()
      const found    = findExisting(recheck, trimmed)
      if (found) return { name: found.name, role: found.role ?? role, jerseyNumber: found.jerseyNumber }
    } catch {
      // Network failure must never block scoring — fall back to the typed
      // name so the innings can continue; Manage Players will simply not
      // show this player until connectivity returns and the screen retries.
    }
    return { name: trimmed, role }
  })()

  inFlightSync.set(key, task)
  try {
    return await task
  } finally {
    inFlightSync.delete(key)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Picker — lists existing players, supports adding a new one inline
// ─────────────────────────────────────────────────────────────────────────────
function PlayerPicker({
  visible, onClose, onSelect, title, accentColor, players, allPlayerInfo = [],
}: {
  visible: boolean; onClose: () => void; onSelect: (name: string) => void
  title: string; accentColor: string; players: string[]; allPlayerInfo?: PlayerInfo[]
}) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (visible) setQuery('') }, [visible])

  const filtered  = players.filter(n => n.toLowerCase().includes(query.toLowerCase()))
  const canAddNew = query.trim() !== '' && !players.some(n => n.toLowerCase() === query.trim().toLowerCase())
  const getInfo   = (name: string) => allPlayerInfo.find(p => p.name.toLowerCase() === name.toLowerCase())

  const listData = canAddNew
    ? [{ name: query.trim(), isNew: true }, ...filtered.map(n => ({ name: n, isNew: false }))]
    : filtered.map(n => ({ name: n, isNew: false }))

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={PP.backdrop}><Pressable style={{ flex: 1 }} onPress={onClose} /></View>
      <View style={PP.sheet}>
        <View style={PP.handle} />
        <Text style={[PP.title, { color: accentColor }]}>{title}</Text>
        <View style={PP.inputRow}>
          <View style={[PP.inputWrap, { borderColor: accentColor + '55' }]}>
            <Text style={{ color: accentColor, fontSize: 14, marginRight: 6 }}>🔍</Text>
            <TextInput style={PP.input} value={query} onChangeText={setQuery}
              placeholder="Search or type a new name…" placeholderTextColor={T.muted} autoFocus
              returnKeyType="done" onSubmitEditing={() => query.trim() && onSelect(query.trim())} />
            {query !== '' && <Pressable onPress={() => setQuery('')}><Text style={{ color: T.muted, fontSize: 14 }}>✕</Text></Pressable>}
          </View>
        </View>
        <FlatList data={listData} keyExtractor={(item, i) => item.name + i} style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.isNew) return (
              <Pressable onPress={() => onSelect(item.name)}
                style={[PP.playerRow, { backgroundColor: accentColor + '14', borderColor: accentColor + '55' }]}>
                <View style={[PP.avatar, { backgroundColor: accentColor + '22', borderColor: accentColor }]}>
                  <Text style={{ color: accentColor, fontSize: 16 }}>＋</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: accentColor, fontWeight: '800', fontSize: 14 }}>Add "{item.name}"</Text>
                  <Text style={{ color: T.muted, fontSize: 11, marginTop: 1 }}>New player · will be added to Manage Players</Text>
                </View>
              </Pressable>
            )
            const info = getInfo(item.name)
            const initials = item.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
            return (
              <Pressable onPress={() => onSelect(item.name)} style={PP.playerRow}>
                <View style={[PP.avatar, { backgroundColor: accentColor + '18', borderColor: accentColor + '55' }]}>
                  <Text style={{ color: accentColor, fontSize: 12, fontWeight: '800' }}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={PP.playerName}>{item.name}</Text>
                  {info?.role ? <Text style={PP.playerSub}>{info.role}</Text> : null}
                </View>
                {info?.jerseyNumber ? <Text style={PP.jersey}>#{info.jerseyNumber}</Text> : null}
              </Pressable>
            )
          }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>🔍</Text>
              <Text style={{ color: T.muted, fontSize: 13, textAlign: 'center' }}>No players found.{'\n'}Type a name above to add.</Text>
            </View>
          }
        />
        <Pressable onPress={onClose} style={PP.cancelBtn}>
          <Text style={{ color: T.subtext, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const PP = StyleSheet.create({
  backdrop:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.80)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36, borderWidth: 1, borderColor: T.border, maxHeight: '80%' },
  handle:     { width: 36, height: 4, backgroundColor: T.muted, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:      { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  inputRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  inputWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: T.surface, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  input:      { flex: 1, color: T.text, fontSize: 14 },
  playerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, marginBottom: 6 },
  avatar:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  playerName: { color: T.text, fontWeight: '700', fontSize: 14 },
  playerSub:  { color: T.muted, fontSize: 11, marginTop: 1, textTransform: 'capitalize' },
  jersey:     { color: T.muted, fontSize: 10, fontFamily: 'monospace' },
  cancelBtn:  { marginTop: 12, padding: 11, borderRadius: 10, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Players Not Set Dialog — matches reference screenshot exactly
// ─────────────────────────────────────────────────────────────────────────────
function PlayersNotSetDialog({
  visible, onClose, onTapStriker, onTapNonStriker, onTapBowler,
  needStriker, needNonStriker, needBowler,
}: {
  visible: boolean; onClose: () => void
  onTapStriker: () => void; onTapNonStriker: () => void; onTapBowler: () => void
  needStriker: boolean; needNonStriker: boolean; needBowler: boolean
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={PNS.overlay}>
        <View style={PNS.card}>
          <Pressable onPress={onClose} style={PNS.closeBtn}>
            <Text style={{ color: '#888', fontSize: 14, fontWeight: '700' }}>✕</Text>
          </Pressable>

          <Text style={{ fontSize: 52, textAlign: 'center', marginBottom: 10 }}>🏏</Text>
          <Text style={PNS.title}>Players Not Set</Text>
          <Text style={PNS.subtitle}>
            Please select the Striker, Non-Striker, and Bowler before scoring can begin.
          </Text>

          {needStriker && (
            <Pressable onPress={onTapStriker} style={[PNS.row, { borderColor: ROLE_COLORS.striker.border, backgroundColor: ROLE_COLORS.striker.bg }]}>
              <View style={[PNS.icon, { backgroundColor: ROLE_COLORS.striker.main }]}>
                <Text style={{ fontSize: 16 }}>🏏</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[PNS.rowTitle, { color: ROLE_COLORS.striker.main }]}>Tap to Set Striker</Text>
                <Text style={PNS.rowSub}>Select the striker for this innings</Text>
              </View>
              <Text style={{ color: ROLE_COLORS.striker.main, fontSize: 18 }}>›</Text>
            </Pressable>
          )}

          {needNonStriker && (
            <Pressable onPress={onTapNonStriker} style={[PNS.row, { borderColor: ROLE_COLORS.nonStriker.border, backgroundColor: ROLE_COLORS.nonStriker.bg }]}>
              <View style={[PNS.icon, { backgroundColor: ROLE_COLORS.nonStriker.main }]}>
                <Text style={{ fontSize: 16 }}>🏏</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[PNS.rowTitle, { color: ROLE_COLORS.nonStriker.main }]}>Tap to Set Non-Striker</Text>
                <Text style={PNS.rowSub}>Select the non-striker for this innings</Text>
              </View>
              <Text style={{ color: ROLE_COLORS.nonStriker.main, fontSize: 18 }}>›</Text>
            </Pressable>
          )}

          {needBowler && (
            <Pressable onPress={onTapBowler} style={[PNS.row, { borderColor: ROLE_COLORS.bowler.border, backgroundColor: ROLE_COLORS.bowler.bg }]}>
              <View style={[PNS.icon, { backgroundColor: ROLE_COLORS.bowler.main }]}>
                <Text style={{ fontSize: 16 }}>🎳</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[PNS.rowTitle, { color: ROLE_COLORS.bowler.main }]}>Tap to Set Bowler</Text>
                <Text style={PNS.rowSub}>Select the bowler for this innings</Text>
              </View>
              <Text style={{ color: ROLE_COLORS.bowler.main, fontSize: 18 }}>›</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  )
}

const PNS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'flex-end', padding: 0 },
  card: {
    width: '100%', backgroundColor: '#0d0d0d', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36, borderWidth: 1, borderColor: '#222',
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  title:    { color: '#f0f0f0', fontWeight: '800', fontSize: 22, textAlign: 'center', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 22, paddingHorizontal: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14,
    borderWidth: 1.5, marginBottom: 10,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontWeight: '800', fontSize: 14, marginBottom: 1 },
  rowSub:   { color: '#777', fontSize: 11.5 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Player Card Row — the main scoring screen's color-coded role cards
// ─────────────────────────────────────────────────────────────────────────────
function PlayerCardRow({
  role, label, name, placeholder, stats, statLabels, accent, onPress,
}: {
  role: 'striker' | 'nonStriker' | 'bowler'
  label: string
  name: string
  placeholder: string
  stats: [string | number, string | number, string | number]
  statLabels: [string, string, string]
  accent: { main: string; dim: string; border: string; bg: string }
  onPress: () => void
}) {
  const icon = role === 'bowler' ? '🎳' : '🏏'
  return (
    <Pressable onPress={onPress} style={[PCR.row, { borderColor: accent.border, backgroundColor: accent.bg }]}>
      <View style={[PCR.avatar, { backgroundColor: accent.main }]}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent.main }} />
          <Text style={[PCR.label, { color: accent.main }]}>{label}</Text>
        </View>
        <Text style={[PCR.name, !name && { color: T.muted, fontWeight: '500', fontSize: 13 }]} numberOfLines={1}>
          {name || placeholder}
        </Text>
      </View>
      <View style={PCR.statsCol}>
        <Text style={PCR.statVal}>{stats[0]}</Text>
        <Text style={PCR.statLbl}>{statLabels[0]}</Text>
      </View>
      <View style={PCR.statsCol}>
        <Text style={PCR.statVal}>{stats[1]}</Text>
        <Text style={PCR.statLbl}>{statLabels[1]}</Text>
      </View>
      <View style={PCR.statsCol}>
        <Text style={[PCR.statVal, role === 'bowler' && { color: T.accent }]}>{stats[2]}</Text>
        <Text style={PCR.statLbl}>{statLabels[2]}</Text>
      </View>
      <Text style={{ color: accent.main, fontSize: 18, marginLeft: 2 }}>›</Text>
    </Pressable>
  )
}

const PCR = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 14, padding: 12, marginBottom: 8,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  name:  { color: T.text, fontWeight: '800', fontSize: 14, marginTop: 1 },
  statsCol: { width: 38, alignItems: 'center' },
  statVal: { color: T.text2, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLbl: { color: T.muted, fontSize: 8, fontWeight: '700', marginTop: 1 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Other modals: NewBatsmanModal, BowlerChangeModal, UpdateOversModal
// (Unchanged behaviour from prior version — included in full so file is complete)
// ─────────────────────────────────────────────────────────────────────────────
function NewBatsmanModal({ visible, outName, wicketType, players, onConfirm }: {
  visible: boolean; outName: string; wicketType?: string
  players: string[]; onConfirm: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (visible) setQuery('') }, [visible])
  const filtered  = players.filter(n => n.toLowerCase().includes(query.toLowerCase()))
  const canAddNew = query.trim() !== '' && !players.some(n => n.toLowerCase() === query.trim().toLowerCase())
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={NB.overlay}>
        <View style={NB.box}>
          <Text style={{ fontSize: 36, textAlign: 'center', marginBottom: 6 }}>💀</Text>
          <Text style={NB.title}>WICKET!</Text>
          <Text style={NB.sub}>{outName} — {wicketType ?? 'Out'}</Text>
          <Text style={NB.sub2}>Select next batsman</Text>
          <TextInput style={NB.input} value={query} onChangeText={setQuery}
            placeholder="Search or type name…" placeholderTextColor={T.muted}
            autoFocus returnKeyType="done" onSubmitEditing={() => query.trim() && onConfirm(query.trim())} />
          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
            {canAddNew && (
              <Pressable onPress={() => onConfirm(query.trim())} style={[NB.row, { backgroundColor: 'rgba(204,0,0,0.1)', borderColor: 'rgba(204,0,0,0.3)' }]}>
                <Text style={{ color: T.accent, fontWeight: '700', fontSize: 13 }}>＋ Add "{query.trim()}"</Text>
              </Pressable>
            )}
            {filtered.map(name => (
              <Pressable key={name} onPress={() => onConfirm(name)} style={NB.row}>
                <Text style={{ color: T.text, fontWeight: '700', fontSize: 14 }}>{name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {query.trim() !== '' && (
            <Pressable onPress={() => onConfirm(query.trim())} style={NB.confirmBtn}>
              <Text style={{ color: T.text, fontWeight: '800', fontSize: 16 }}>✓ CONFIRM</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  )
}
const NB = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.90)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  box:        { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderRadius: 20, padding: 24, paddingBottom: 20, borderWidth: 1, borderColor: 'rgba(204,0,0,0.3)', maxHeight: '80%' },
  title:      { color: T.accent, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 1, marginBottom: 4 },
  sub:        { color: T.subtext, fontSize: 13, textAlign: 'center', marginBottom: 4 },
  sub2:       { color: T.text2, fontSize: 12, textAlign: 'center', marginBottom: 16 },
  input:      { backgroundColor: T.surface, borderWidth: 1.5, borderColor: 'rgba(204,0,0,0.35)', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, color: T.text, fontSize: 14, marginBottom: 10 },
  row:        { paddingVertical: 11, paddingHorizontal: 13, borderRadius: 9, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, marginBottom: 6 },
  confirmBtn: { backgroundColor: T.accent, borderRadius: 11, padding: 13, alignItems: 'center', marginTop: 8 },
})

function BowlerChangeModal({ visible, players, lastBowler, onConfirm, onSkip }: {
  visible: boolean; players: string[]; lastBowler: string
  onConfirm: (name: string) => void; onSkip: () => void
}) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (visible) setQuery('') }, [visible])
  const filtered  = players.filter(n => n !== lastBowler && n.toLowerCase().includes(query.toLowerCase()))
  const canAddNew = query.trim() !== '' && !players.some(n => n.toLowerCase() === query.trim().toLowerCase())
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <View style={BC.overlay}><Pressable style={{ flex: 1 }} onPress={onSkip} /></View>
      <View style={BC.sheet}>
        <View style={BC.handle} />
        <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 6 }}>🏏</Text>
        <Text style={BC.title}>OVER COMPLETE</Text>
        <Text style={BC.sub}>Select bowler for next over</Text>
        <TextInput style={BC.input} value={query} onChangeText={setQuery}
          placeholder="Search or type bowler name…" placeholderTextColor={T.muted}
          autoFocus returnKeyType="done" onSubmitEditing={() => query.trim() && onConfirm(query.trim())} />
        <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
          {canAddNew && (
            <Pressable onPress={() => onConfirm(query.trim())} style={[BC.row, { backgroundColor: 'rgba(251,146,60,0.1)', borderColor: 'rgba(251,146,60,0.3)' }]}>
              <Text style={{ color: T.orange, fontWeight: '700', fontSize: 13 }}>＋ Add "{query.trim()}"</Text>
            </Pressable>
          )}
          {filtered.map(name => (
            <Pressable key={name} onPress={() => onConfirm(name)} style={BC.row}>
              <Text style={{ color: T.text, fontWeight: '700', fontSize: 14 }}>{name}</Text>
            </Pressable>
          ))}
          {filtered.length === 0 && !canAddNew && (
            <Text style={BC.empty}>{lastBowler ? `${lastBowler} cannot bowl consecutive overs.` : 'Type a bowler name above.'}</Text>
          )}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable onPress={onSkip} style={BC.skipBtn}>
            <Text style={{ color: T.subtext, fontWeight: '700', fontSize: 14 }}>Skip</Text>
          </Pressable>
          {query.trim() !== '' && (
            <Pressable onPress={() => onConfirm(query.trim())} style={BC.confirmBtn}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>✓ SET BOWLER</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  )
}
const BC = StyleSheet.create({
  overlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.80)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 36, borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)' },
  handle:     { width: 36, height: 4, backgroundColor: T.muted, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title:      { color: T.orange, fontSize: 20, fontWeight: '700', textAlign: 'center', letterSpacing: 1 },
  sub:        { color: T.subtext, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  input:      { backgroundColor: T.surface, borderWidth: 1.5, borderColor: 'rgba(251,146,60,0.35)', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, color: T.text, fontSize: 14, marginBottom: 10 },
  row:        { paddingVertical: 11, paddingHorizontal: 13, borderRadius: 9, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, marginBottom: 6 },
  empty:      { color: T.muted, fontSize: 12, textAlign: 'center', padding: 16 },
  skipBtn:    { flex: 1, padding: 12, borderRadius: 11, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  confirmBtn: { flex: 2, padding: 12, borderRadius: 11, backgroundColor: T.orange, alignItems: 'center' },
})

function UpdateOversModal({ visible, currentOvers, onConfirm, onClose }: {
  visible: boolean; currentOvers: number; onConfirm: (overs: number) => void; onClose: () => void
}) {
  const [value, setValue] = useState(String(currentOvers))
  useEffect(() => { if (visible) setValue(String(currentOvers)) }, [visible, currentOvers])
  const options = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50]
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.80)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: T.border }}>
        <View style={{ width: 36, height: 4, backgroundColor: T.muted, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
        <Text style={{ color: T.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center', marginBottom: 4 }}>UPDATE OVERS</Text>
        <Text style={{ color: T.subtext, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>Current: {currentOvers} overs</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Pressable onPress={() => setValue(v => String(Math.max(1, parseInt(v || '1') - 1)))}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: T.text, fontSize: 24, fontWeight: '700' }}>−</Text>
          </Pressable>
          <TextInput value={value} onChangeText={setValue} keyboardType="number-pad"
            style={{ flex: 1, backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.accent + '55', borderRadius: 12, padding: 12, color: T.text, fontSize: 22, fontWeight: '800', textAlign: 'center' }} />
          <Pressable onPress={() => setValue(v => String(Math.min(50, parseInt(v || '0') + 1)))}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: T.text, fontSize: 24, fontWeight: '700' }}>＋</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {options.map(o => (
            <Pressable key={o} onPress={() => setValue(String(o))}
              style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: parseInt(value) === o ? T.accent : T.border2, borderWidth: 1, borderColor: parseInt(value) === o ? T.accent : T.border }}>
              <Text style={{ color: parseInt(value) === o ? '#fff' : T.subtext, fontWeight: '700', fontSize: 13 }}>{o}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={onClose} style={{ flex: 1, padding: 13, borderRadius: 11, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center' }}>
            <Text style={{ color: T.subtext, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={() => { const n = parseInt(value); if (n >= 1 && n <= 50) onConfirm(n) }} style={{ flex: 2, padding: 13, borderRadius: 11, backgroundColor: T.accent, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>✓ UPDATE OVERS</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Second Innings Dialog (kept from prior pass)
// ─────────────────────────────────────────────────────────────────────────────
function SecondInningsDialog({ visible, match, onStartInnings }: { visible: boolean; match: any; onStartInnings: () => void }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(60)).current
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }),
      ]).start()
    } else { fadeAnim.setValue(0); slideAnim.setValue(60) }
  }, [visible])
  if (!match) return null
  const inn1Score = match.innings1?.runs ?? 0
  const inn1Wkts  = match.innings1?.wickets ?? 0
  const inn1Balls = match.innings1?.balls ?? 0
  const target    = inn1Score + 1
  const totalBalls = (match.overs ?? 10) * 6
  const bat1Team  = getBattingTeam(match, 'innings1')
  const bowl1Team = getBowlingTeam(match, 'innings1')
  const bat2Team  = bowl1Team
  const bowl2Team = bat1Team
  const rrRequired = totalBalls > 0 ? (target / (totalBalls / 6)).toFixed(2) : '—'
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => {}}>
      <View style={SID.overlay}>
        <Animated.View style={[SID.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={SID.badge}><Text style={SID.badgeTxt}>🏏  INNINGS COMPLETE</Text></View>
          <View style={SID.inn1Card}>
            <Text style={SID.inn1Label}>{bat1Team}</Text>
            <Text style={SID.inn1Score}>{inn1Score}/{inn1Wkts}<Text style={SID.inn1Overs}>  ({fmtOv(inn1Balls)} ov)</Text></Text>
          </View>
          <View style={SID.targetCard}>
            <Text style={SID.targetLabel}>TARGET</Text>
            <Text style={SID.targetNum}>{target}</Text>
            <Text style={SID.targetSub}>{bat2Team} need {target} runs in {match.overs} overs</Text>
            <View style={SID.targetStats}>
              <View style={SID.targetStat}><Text style={SID.targetStatVal}>{totalBalls}</Text><Text style={SID.targetStatLbl}>BALLS</Text></View>
              <View style={[SID.targetStat, { borderLeftWidth: 1, borderLeftColor: '#22c55e33' }]}><Text style={SID.targetStatVal}>{rrRequired}</Text><Text style={SID.targetStatLbl}>RRR</Text></View>
              <View style={[SID.targetStat, { borderLeftWidth: 1, borderLeftColor: '#22c55e33' }]}><Text style={SID.targetStatVal}>{match.overs ?? 10}</Text><Text style={SID.targetStatLbl}>OVERS</Text></View>
            </View>
          </View>
          <View style={SID.swapRow}>
            <View style={SID.swapCard}>
              <Text style={SID.swapEmoji}>🏏</Text>
              <Text style={SID.swapTeam} numberOfLines={2}>{bat2Team}</Text>
              <View style={SID.swapRoleBadge}><Text style={SID.swapRoleTxt}>BATTING</Text></View>
            </View>
            <View style={SID.swapArrow}><Text style={{ color: T.muted, fontSize: 22 }}>⚡</Text></View>
            <View style={[SID.swapCard, { borderColor: '#3a3a3a' }]}>
              <Text style={SID.swapEmoji}>🎳</Text>
              <Text style={SID.swapTeam} numberOfLines={2}>{bowl2Team}</Text>
              <View style={[SID.swapRoleBadge, { backgroundColor: '#1a1a1a', borderColor: '#3a3a3a' }]}><Text style={[SID.swapRoleTxt, { color: '#999' }]}>BOWLING</Text></View>
            </View>
          </View>
          <Pressable onPress={onStartInnings} style={SID.ctaBtn}>
            <Text style={SID.ctaTxt}>▶  Start 2nd Innings</Text>
          </Pressable>
          <Text style={SID.hint}>You'll set the opening batsmen and bowler next</Text>
        </Animated.View>
      </View>
    </Modal>
  )
}
const SID = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  container: { width: '100%', maxWidth: 420, backgroundColor: '#0d0d0d', borderRadius: 20, borderWidth: 1, borderColor: T.accent + '33', padding: 20, paddingBottom: 24 },
  badge: { alignSelf: 'center', backgroundColor: T.accentDim, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 20, borderWidth: 1, borderColor: T.accent + '44' },
  badgeTxt: { color: T.accentBright, fontWeight: '800', fontSize: 11, letterSpacing: 2 },
  inn1Card: { backgroundColor: '#111', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16, alignItems: 'center' },
  inn1Label: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  inn1Score: { color: '#f0f0f0', fontSize: 36, fontWeight: '700' },
  inn1Overs: { color: '#666', fontSize: 16, fontWeight: '400' },
  targetCard: { backgroundColor: '#1a0505', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: T.accent + '44', marginBottom: 16, alignItems: 'center' },
  targetLabel: { color: T.accentBright, fontSize: 10, fontWeight: '800', letterSpacing: 2.5, marginBottom: 6 },
  targetNum: { color: T.accentBright, fontSize: 64, fontWeight: '700', lineHeight: 68 },
  targetSub: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  targetStats: { flexDirection: 'row', width: '100%', paddingTop: 14, borderTopWidth: 1, borderTopColor: T.accent + '22' },
  targetStat: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  targetStatVal: { color: '#f0f0f0', fontSize: 20, fontWeight: '700' },
  targetStatLbl: { color: '#444', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  swapRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  swapCard: { flex: 1, backgroundColor: '#1a0808', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: T.accent + '33', alignItems: 'center', gap: 6 },
  swapEmoji: { fontSize: 24 },
  swapTeam: { color: '#f0f0f0', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  swapRoleBadge: { backgroundColor: T.accentDim, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: T.accent + '44' },
  swapRoleTxt: { color: T.accentBright, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  swapArrow: { alignSelf: 'center' },
  ctaBtn: { backgroundColor: T.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  hint: { color: '#555', fontSize: 11, textAlign: 'center' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Match Result Popup (kept from prior pass)
// ─────────────────────────────────────────────────────────────────────────────
function MatchResultPopup({ visible, match, onViewScorecard, onMatchSummary, onDone }: {
  visible: boolean; match: any; onViewScorecard: () => void; onMatchSummary: () => void; onDone: () => void
}) {
  const scaleAnim = useRef(new Animated.Value(0.7)).current
  const fadeAnim  = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
      ]).start()
    } else { scaleAnim.setValue(0.7); fadeAnim.setValue(0) }
  }, [visible])
  if (!match) return null
  const result = match.result || ''
  const isTied = result.toLowerCase().includes('tied') || result.toLowerCase().includes('tie')
  const isNoResult = result.toLowerCase().includes('no result')
  const byWickets = result.match(/by (\d+) wicket/i)
  const byRuns    = result.match(/by (\d+) run/i)
  let winnerTeam = '', marginText = '', marginEmoji = '🏆'
  if (isTied) { winnerTeam = 'TIED!'; marginText = 'Match tied'; marginEmoji = '🤝' }
  else if (isNoResult) { winnerTeam = 'NO RESULT'; marginText = ''; marginEmoji = '🌧️' }
  else {
    const wonIdx = result.toLowerCase().indexOf(' won')
    winnerTeam = wonIdx > 0 ? result.slice(0, wonIdx) : match.team1
    if (byWickets) { marginText = `Won by ${byWickets[1]} wicket${byWickets[1] === '1' ? '' : 's'}`; marginEmoji = '🏏' }
    else if (byRuns) { marginText = `Won by ${byRuns[1]} run${byRuns[1] === '1' ? '' : 's'}`; marginEmoji = '⚡' }
    else marginText = result
  }
  const inn1Score = `${match.innings1?.runs ?? 0}/${match.innings1?.wickets ?? 0} (${fmtOv(match.innings1?.balls ?? 0)})`
  const inn2Score = `${match.innings2?.runs ?? 0}/${match.innings2?.wickets ?? 0} (${fmtOv(match.innings2?.balls ?? 0)})`
  const bat1Team  = getBattingTeam(match, 'innings1')
  const bat2Team  = getBattingTeam(match, 'innings2')
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDone}>
      <View style={MRP.overlay}>
        <Animated.View style={[MRP.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={MRP.trophyArea}><Text style={{ fontSize: 64 }}>{marginEmoji}</Text></View>
          {!isTied && !isNoResult && <View style={MRP.winnerBanner}><Text style={MRP.winnerLabel}>WINNER</Text></View>}
          <Text style={MRP.winnerName} numberOfLines={2}>{winnerTeam}</Text>
          {marginText && marginText !== result && <Text style={MRP.marginText}>{marginText}</Text>}
          <View style={MRP.scoreBox}>
            <View style={MRP.scoreRow}><Text style={MRP.scoreTeam} numberOfLines={1}>{bat1Team}</Text><Text style={MRP.scoreVal}>{inn1Score}</Text></View>
            <View style={[MRP.scoreRow, { borderTopWidth: 1, borderTopColor: '#2a2a2a' }]}><Text style={MRP.scoreTeam} numberOfLines={1}>{bat2Team}</Text><Text style={MRP.scoreVal}>{inn2Score}</Text></View>
          </View>
          <View style={MRP.actions}>
            <Pressable onPress={onViewScorecard} style={MRP.actionBtn}><Text style={MRP.actionBtnTxt}>📋  Scorecard</Text></Pressable>
            <Pressable onPress={onMatchSummary} style={[MRP.actionBtn, { borderColor: T.gold + '44' }]}><Text style={[MRP.actionBtnTxt, { color: T.gold }]}>📊  Summary</Text></Pressable>
          </View>
          <Pressable onPress={onDone} style={MRP.doneBtn}><Text style={MRP.doneBtnTxt}>Done</Text></Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}
const MRP = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  container: { width: '100%', maxWidth: 400, backgroundColor: '#0d0d0d', borderRadius: 22, borderWidth: 1, borderColor: '#f59e0b44', padding: 24, alignItems: 'center' },
  trophyArea: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#78350f33', borderWidth: 2, borderColor: '#f59e0b44', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  winnerBanner: { backgroundColor: '#78350f', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 5, marginBottom: 8, borderWidth: 1, borderColor: '#f59e0b55' },
  winnerLabel: { color: '#f59e0b', fontWeight: '800', fontSize: 10, letterSpacing: 3 },
  winnerName: { color: '#f0f0f0', fontWeight: '900', fontSize: 26, textAlign: 'center', marginBottom: 6, letterSpacing: 0.4 },
  marginText: { color: '#22c55e', fontSize: 15, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  scoreBox: { width: '100%', backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 22, overflow: 'hidden' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  scoreTeam: { color: '#aaa', fontSize: 13, fontWeight: '700', flex: 1 },
  scoreVal: { color: '#f0f0f0', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 12 },
  actionBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center' },
  actionBtnTxt: { color: '#f0f0f0', fontWeight: '700', fontSize: 13 },
  doneBtn: { paddingVertical: 10, paddingHorizontal: 40, borderRadius: 10, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a' },
  doneBtnTxt: { color: '#666', fontWeight: '700', fontSize: 14 },
})

// ─────────────────────────────────────────────────────────────────────────────
// BallDot — small colored pill used in both the "this over" strip and the
// Ball-by-Ball log. Pulled out as a shared component so both tabs render
// balls identically.
// ─────────────────────────────────────────────────────────────────────────────
function BallDot({ ball, size = 30 }: { ball: Ball; size?: number }) {
  let bg = T.faint, color = T.muted, label = String(ball.runs ?? 0)
  if      (ball.isWicket) { bg = T.accentDim;  color = T.accent;  label = 'W' }
  else if (ball.isWide)   { bg = '#1e3a5f';    color = T.sky;     label = ball.runs > 1 ? `+${ball.runs}` : 'Wd' }
  else if (ball.isNoBall) { bg = T.orangeDim;  color = T.orange;  label = ball.runs > 0 ? `+${ball.runs}` : 'NB' }
  else if (ball.runs === 4) { bg = T.greenDim; color = T.green;   label = '4' }
  else if (ball.runs === 6) { bg = T.purpleDim;color = T.purple;  label = '6' }
  else if (ball.runs === 0) { bg = T.border2;  color = T.muted;   label = '·' }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: 1, borderColor: color + '44', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: size < 30 ? 10 : 11, fontWeight: '800' }}>{label}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ScorecardTab — full batting + bowling card for both innings, live-updating
// from the same `match` object the Scoring tab uses (no separate fetch, so
// it's always in sync the instant a ball is recorded).
// ─────────────────────────────────────────────────────────────────────────────
function ScorecardTab({ match, onUndo, undoDisabled, onRedo, redoAvailable }: { match: any; onUndo: () => void; undoDisabled: boolean; onRedo: () => void; redoAvailable: boolean }) {
  const inn1BattingTeam = getBattingTeam(match, 'innings1')
  const inn2BattingTeam = getBattingTeam(match, 'innings2')

  const hasInn2 = (match.innings2?.balls ?? 0) > 0
    || (match.innings2?.battingStats?.length ?? 0) > 0
    || (match.innings2?.runs ?? 0) > 0

  // Default to whichever innings is currently live so re-opening this tab
  // mid-match always lands on the relevant scorecard, not innings 1.
  const [activeInn, setActiveInn] = useState<'innings1' | 'innings2'>(
    match.status === 'innings2' || match.status === 'completed' && hasInn2 ? 'innings2' : 'innings1'
  )
  useEffect(() => {
    if (match.status === 'innings2' && activeInn === 'innings1') setActiveInn('innings2')
  }, [match.status])

  const inn = match[activeInn] ?? {}
  const scores = (inn.battingStats ?? []).map((p: any) => p.runs ?? 0)
  const hs = scores.length > 0 ? Math.max(...scores) : 0

  const activeBattingTeam = getBattingTeam(match, activeInn)
  const activeBowlingTeam = getBowlingTeam(match, activeInn)

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border }}>
          <Pressable onPress={() => setActiveInn('innings1')}
            style={[SC.tab, activeInn === 'innings1' && { borderBottomWidth: 2, borderBottomColor: T.accent }]}>
            <Text style={[SC.tabTxt, activeInn === 'innings1' && { color: T.accent }]}>1st Inn</Text>
            <Text style={[SC.tabTeam, activeInn === 'innings1' && { color: T.accent + 'aa' }]}>{inn1BattingTeam}</Text>
          </Pressable>
          {hasInn2 && (
            <Pressable onPress={() => setActiveInn('innings2')}
              style={[SC.tab, activeInn === 'innings2' && { borderBottomWidth: 2, borderBottomColor: T.gold }]}>
              <Text style={[SC.tabTxt, activeInn === 'innings2' && { color: T.gold }]}>2nd Inn</Text>
              <Text style={[SC.tabTeam, activeInn === 'innings2' && { color: T.gold + 'aa' }]}>{inn2BattingTeam}</Text>
            </Pressable>
          )}
        </View>

        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: '#1a0505' }}>
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 6 }}>
            <Text style={{ fontSize: 11, color: T.text2, fontWeight: '700' }}>🏏 {activeBattingTeam} batting</Text>
            <Text style={{ fontSize: 11, color: T.muted, fontWeight: '700' }}>🎯 {activeBowlingTeam} bowling</Text>
          </View>
          <Text style={SC.scoreText}>{inn.runs ?? 0}/{inn.wickets ?? 0}</Text>
          <Text style={SC.oversText}>({fmtOv(inn.balls ?? 0)} ov)  ·  CRR {calcCRR(inn.runs ?? 0, inn.balls ?? 0)}</Text>
        </View>

        <View style={SC.tableHeader}>
          {['BATTER', 'R', 'B', '4s', '6s', 'SR'].map((h, i) => (
            <Text key={h} style={[SC.th, i === 0 && { flex: 2, textAlign: 'left' }]}>{h}</Text>
          ))}
        </View>

        {(inn.battingStats ?? []).length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: T.muted, fontSize: 13 }}>No batting data yet</Text>
          </View>
        ) : (
          (inn.battingStats ?? []).map((p: any, i: number) => (
            <View key={i} style={[SC.row, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.02)' }]}>
              <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {!p.isOut && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent }} />}
                <Text style={[SC.td, { flex: 1, textAlign: 'left', color: p.runs === hs && hs > 0 ? T.gold : T.text }]} numberOfLines={1}>
                  {p.name}{p.isOut ? '' : ' *'}
                </Text>
              </View>
              <Text style={[SC.td, { color: (p.runs ?? 0) >= 50 ? T.gold : T.text, fontWeight: '700' }]}>{p.runs ?? 0}</Text>
              <Text style={SC.td}>{p.balls ?? 0}</Text>
              <Text style={[SC.td, { color: T.green }]}>{p.fours ?? 0}</Text>
              <Text style={[SC.td, { color: T.purple }]}>{p.sixes ?? 0}</Text>
              <Text style={SC.td}>{(p.balls ?? 0) > 0 ? (((p.runs ?? 0) / (p.balls ?? 1)) * 100).toFixed(0) : '—'}</Text>
            </View>
          ))
        )}

        <View style={[SC.row, { backgroundColor: T.goldDim + '33', borderTopWidth: 1, borderTopColor: T.gold + '44' }]}>
          <Text style={[SC.td, { flex: 3, textAlign: 'left', color: T.gold, fontWeight: '800' }]}>TOTAL</Text>
          <Text style={[SC.td, { flex: 3, textAlign: 'right', color: T.gold, fontWeight: '800', fontSize: 14 }]}>
            {inn.runs ?? 0}/{inn.wickets ?? 0} ({fmtOv(inn.balls ?? 0)})
          </Text>
        </View>

        <View style={[SC.tableHeader, { backgroundColor: '#181818', marginTop: 4 }]}>
          {['BOWLER', 'O', 'R', 'W', 'ECO'].map((h, i) => (
            <Text key={h} style={[SC.th, { color: T.purple }, i === 0 && { flex: 2, textAlign: 'left' }]}>{h}</Text>
          ))}
        </View>

        {(inn.bowlingStats ?? []).length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: T.muted, fontSize: 13 }}>No bowling data yet</Text>
          </View>
        ) : (
          (inn.bowlingStats ?? []).map((b: any, i: number) => (
            <View key={i} style={[SC.row, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.02)' }]}>
              <Text style={[SC.td, { flex: 2, textAlign: 'left', color: (b.wickets ?? 0) >= 3 ? T.purple : T.text2 }]} numberOfLines={1}>{b.name}</Text>
              <Text style={SC.td}>{fmtOv(b.balls ?? 0)}</Text>
              <Text style={SC.td}>{b.runs ?? 0}</Text>
              <Text style={[SC.td, { color: (b.wickets ?? 0) > 0 ? T.purple : T.muted, fontWeight: '700' }]}>{b.wickets ?? 0}</Text>
              <Text style={[SC.td, { color: (b.balls ?? 0) > 0 && (b.runs ?? 0) / ((b.balls ?? 1) / 6) <= 6 ? T.green : T.text2 }]}>
                {(b.balls ?? 0) > 0 ? ((b.runs ?? 0) / ((b.balls ?? 1) / 6)).toFixed(2) : '—'}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Undo/Redo reachable from the Scorecard tab — fixing a wrong entry
          from a few balls ago doesn't require switching back to the
          Scoring tab. */}
      {(!undoDisabled || redoAvailable) && (
        <View style={[SC.undoBar, { flexDirection: 'row', gap: 8 }]}>
          {!undoDisabled && (
            <Pressable onPress={onUndo} style={[SC.undoBarBtn, { flex: 1 }]}>
              <Text style={SC.undoBarTxt}>↩  UNDO</Text>
            </Pressable>
          )}
          {redoAvailable && (
            <Pressable onPress={onRedo} style={[SC.undoBarBtn, { flex: 1, backgroundColor: T.goldDim, borderColor: T.gold + '55' }]}>
              <Text style={[SC.undoBarTxt, { color: T.gold }]}>↪  REDO</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

const SC = StyleSheet.create({
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabTxt: { color: T.muted, fontWeight: '800', fontSize: 13 },
  tabTeam: { color: T.muted, fontWeight: '600', fontSize: 10, marginTop: 1 },
  scoreText: { fontSize: 36, fontWeight: '700', color: T.text, fontVariant: ['tabular-nums'] },
  oversText: { fontSize: 12, color: T.subtext },
  tableHeader: { flexDirection: 'row', backgroundColor: T.card, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: T.border },
  th: { flex: 1, textAlign: 'right', fontSize: 10, color: T.gold, fontWeight: '800', letterSpacing: 0.8 },
  row: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
  td: { flex: 1, textAlign: 'right', fontSize: 12, color: T.text2, fontVariant: ['tabular-nums'] },
  undoBar: { padding: 10, backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border },
  undoBarBtn: { paddingVertical: 11, borderRadius: 10, backgroundColor: T.accentDim, borderWidth: 1, borderColor: T.accent + '55', alignItems: 'center' },
  undoBarTxt: { color: T.accentBright, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
})

// ─────────────────────────────────────────────────────────────────────────────
// BallByBallTab — full commentary log, grouped by over, newest over first.
// Also reads directly from `match`, so it updates the instant a ball posts.
// ─────────────────────────────────────────────────────────────────────────────
function BallByBallTab({ match, onUndo, undoDisabled, onRedo, redoAvailable }: { match: any; onUndo: () => void; undoDisabled: boolean; onRedo: () => void; redoAvailable: boolean }) {
  const allInnings = [
    { inn: match.innings1, key: 'innings1' as const },
    { inn: match.innings2, key: 'innings2' as const },
  ].filter(({ inn }) => inn && ((inn.ballByBall?.length ?? 0) > 0 || (inn.runs ?? 0) > 0 || (inn.battingStats?.length ?? 0) > 0))

  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    if (match.status === 'innings2' && allInnings.length > 1) setActiveIdx(1)
    else setActiveIdx(0)
  }, [match.status])

  const getTeamName = (key: 'innings1' | 'innings2') => getBattingTeam(match, key)

  const currentEntry = allInnings[activeIdx] ?? allInnings[0]
  const current      = currentEntry?.inn
  const currentKey    = currentEntry?.key ?? 'innings1'
  const balls: Ball[]  = current?.ballByBall ?? []

  const InningsSwitcher = allInnings.length > 1 ? (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border }}>
      {allInnings.map(({ key }, i) => (
        <Pressable key={key} onPress={() => setActiveIdx(i)}
          style={[SC.tab, activeIdx === i && { borderBottomColor: T.gold }]}>
          <Text style={[SC.tabTxt, activeIdx === i && { color: T.gold }]}>{i === 0 ? '1st Inn' : '2nd Inn'}</Text>
          <Text style={[SC.tabTeam, activeIdx === i && { color: T.gold + 'aa' }]}>{getTeamName(key)}</Text>
        </Pressable>
      ))}
    </View>
  ) : null

  if (!current || balls.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        {InningsSwitcher}
        <View style={{ alignItems: 'center', padding: 60 }}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>📻</Text>
          <Text style={{ color: T.text2, fontWeight: '700', marginBottom: 6 }}>No balls bowled yet</Text>
          <Text style={{ color: T.muted, fontSize: 12, textAlign: 'center' }}>Go to Scoring tab and record balls</Text>
        </View>
      </View>
    )
  }

  const overs: Ball[][] = []
  let legalCount = 0
  balls.forEach((b: Ball) => {
    const isExtra = b.isWide || b.isNoBall
    const overIdx = Math.floor(legalCount / 6)
    if (!overs[overIdx]) overs[overIdx] = []
    overs[overIdx].push(b)
    if (!isExtra) legalCount++
  })

  const getBallDesc = (ball: Ball): string => {
    if (ball.isWicket) return `OUT! ${ball.batsmanName ?? 'Batsman'} — ${ball.wicketType ?? 'dismissed'}`
    if (ball.isWide)   return `Wide${(ball.runs ?? 0) > 1 ? ` +${ball.runs}` : ''}`
    if (ball.isNoBall) return `No Ball${(ball.runs ?? 0) > 0 ? ` +${ball.runs}` : ''}`
    if (ball.runs === 6) return `SIX! ${ball.batsmanName ?? ''} — over the boundary`
    if (ball.runs === 4) return `FOUR! ${ball.batsmanName ?? ''} — races to the fence`
    if (ball.runs === 0) return `Dot ball — ${ball.batsmanName ?? 'Batsman'} defends`
    return `${ball.batsmanName ?? 'Batsman'} — ${ball.runs} run${(ball.runs ?? 0) !== 1 ? 's' : ''}`
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {InningsSwitcher}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#1a0505', borderBottomWidth: 1, borderBottomColor: T.border }}>
          <Text style={{ color: T.text, fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] }}>
            {current.runs ?? 0}/{current.wickets ?? 0}
          </Text>
          <Text style={{ color: T.subtext, fontSize: 12, alignSelf: 'center' }}>
            {fmtOv(current.balls ?? 0)} ov  ·  CRR {calcCRR(current.runs ?? 0, current.balls ?? 0)}
          </Text>
          <Text style={{ color: T.subtext, fontSize: 11, alignSelf: 'center' }}>🏏 {getTeamName(currentKey)}</Text>
        </View>

        {[...overs].reverse().map((overBalls, ri) => {
          const overNum  = overs.length - 1 - ri
          const overRuns = overBalls.reduce((s: number, b: Ball) => s + (b.runs ?? 0), 0)
          const overWkts = overBalls.filter((b: Ball) => b.isWicket).length
          const isMaiden = overRuns === 0 && overWkts === 0 && overBalls.filter(b => !b.isWide && !b.isNoBall).length === 6
          return (
            <View key={overNum} style={{ borderBottomWidth: 1, borderBottomColor: T.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, paddingHorizontal: 14, backgroundColor: T.card }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: T.gold, fontWeight: '800', fontSize: 12 }}>Over {overNum + 1}</Text>
                  {isMaiden && (
                    <View style={{ backgroundColor: T.greenDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ color: T.green, fontSize: 9, fontWeight: '800' }}>MAIDEN</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {overBalls.map((b: Ball, i: number) => <BallDot key={i} ball={b} size={24} />)}
                </View>
                <Text style={{ color: T.text2, fontSize: 11, fontVariant: ['tabular-nums'] }}>
                  {overRuns}r{overWkts > 0 ? ` · ${overWkts}W` : ''}
                </Text>
              </View>
              {[...overBalls].reverse().map((ball: Ball, bi: number) => (
                <View key={bi} style={[
                  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
                  ball.isWicket && { backgroundColor: 'rgba(204,0,0,0.07)' },
                  (ball.runs ?? 0) === 6 && !ball.isWicket && { backgroundColor: 'rgba(192,132,252,0.06)' },
                  (ball.runs ?? 0) === 4 && !ball.isWicket && { backgroundColor: 'rgba(34,197,94,0.05)' },
                ]}>
                  <BallDot ball={ball} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 13,
                      color: ball.isWicket ? T.accent : (ball.runs ?? 0) >= 6 ? T.purple : (ball.runs ?? 0) >= 4 ? T.green : T.text,
                      fontWeight: ball.isWicket || (ball.runs ?? 0) >= 4 ? '700' : '400',
                    }}>{getBallDesc(ball)}</Text>
                    {ball.bowlerName && (
                      <Text style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                        {ball.bowlerName} to {ball.batsmanName ?? 'batsman'}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )
        })}
      </ScrollView>

      {/* Undo/Redo reachable from the Ball-by-Ball tab too — correcting
          the last few deliveries shouldn't require leaving the
          commentary view. */}
      {(!undoDisabled || redoAvailable) && (
        <View style={[SC.undoBar, { flexDirection: 'row', gap: 8 }]}>
          {!undoDisabled && (
            <Pressable onPress={onUndo} style={[SC.undoBarBtn, { flex: 1 }]}>
              <Text style={SC.undoBarTxt}>↩  UNDO</Text>
            </Pressable>
          )}
          {redoAvailable && (
            <Pressable onPress={onRedo} style={[SC.undoBarBtn, { flex: 1, backgroundColor: T.goldDim, borderColor: T.gold + '55' }]}>
              <Text style={[SC.undoBarTxt, { color: T.gold }]}>↪  REDO</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function ScoringScreen() {
  const route      = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const { id }     = route.params

  const [match,      setMatch]      = useState<any>(null)
  const [tab,        setTab]        = useState<'scoring' | 'scorecard' | 'ballbyball'>('scoring')
  const [loading,    setLoading]    = useState(false)
  const [fetching,   setFetching]   = useState(true)
  const [error,      setError]      = useState('')
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([])

  const [striker,      setStriker]      = useState('')
  const [nonStriker,   setNonStriker]   = useState('')
  const [bowlerName,   setBowlerName]   = useState('')
  const [runs,         setRuns]         = useState<number | null>(null)
  const [wicket,       setWicket]       = useState(false)
  const [wicketType,   setWicketType]   = useState('Wicket')
  const [assistName,   setAssistName]   = useState('')
  const [wide,         setWide]         = useState(false)
  const [noBall,       setNoBall]       = useState(false)
  const [showWktMenu,  setShowWktMenu]  = useState(false)

  const [picker,          setPicker]          = useState<'striker' | 'nonStriker' | 'bowler' | null>(null)
  const [newBatsmanOpen,  setNewBatsmanOpen]  = useState(false)
  const [overChangeOpen,  setOverChangeOpen]  = useState(false)
  const [updateOversOpen, setUpdateOversOpen] = useState(false)
  const [pendingBall,     setPendingBall]     = useState<any>(null)

  const [showInn2Dialog,   setShowInn2Dialog]   = useState(false)
  const [showResultPopup,  setShowResultPopup]  = useState(false)
  const [showPlayersNotSet, setShowPlayersNotSet] = useState(false)

  // ── Fetch match ───────────────────────────────────────────────────────────
  const fetchMatch = useCallback(async () => {
    try {
      const token    = await getToken()
      const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
      const baseUrl  = apiUrl(`/api/matches/${id}`)
      const url      = !token && deviceId ? `${baseUrl}?deviceId=${deviceId}` : baseUrl
      const res      = await fetch(url, { headers: authHeaders(token) })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setMatch(data)
      if (data.status === 'completed') setShowResultPopup(true)
    } catch { setError('Failed to load match') }
    finally { setFetching(false) }
  }, [id])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  // ── Fetch all registered players (this is the Manage Players source) ───────
  const loadPlayers = useCallback(async () => {
    const token    = await getToken()
    const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
    const baseUrl  = apiUrl('/api/players')
    const url      = !token && deviceId ? `${baseUrl}?deviceId=${deviceId}` : baseUrl
    const res      = await fetch(url, { headers: authHeaders(token) })
    if (res.ok) setAllPlayers(await res.json() as PlayerInfo[])
  }, [])
  useEffect(() => { loadPlayers().catch(() => {}) }, [loadPlayers])

  // ── Player init from existing match data ────────────────────────────────────
  // Reconstructs who's at the crease after a remount (navigating away and
  // back, app backgrounded, etc). This previously guessed from
  // battingStats array order, which breaks whenever the non-striker hasn't
  // faced a ball yet (they may not even appear in battingStats), causing
  // "Players Not Set" to wrongly reappear even mid-over.
  //
  // Fix: prefer explicit fields the server may persist for exactly this
  // purpose (currentStriker / currentNonStriker / currentBowler, or
  // nonStrikerName on the innings object — whatever your backend calls
  // them). Only fall back to the old heuristic if none of those exist,
  // e.g. on a very old match recorded before this field existed.
  useEffect(() => {
    if (!match) return
    const inningsKey: 'innings1' | 'innings2' = match.status === 'innings1' ? 'innings1' : 'innings2'
    const inn = match[inningsKey]
    if (!inn) return

    const battingTeamName = getBattingTeam(match, inningsKey)
    const battingIsTeam1  = battingTeamName === match.team1
    const battingRoster   = battingIsTeam1 ? (match.team1Players ?? []) : (match.team2Players ?? [])
    const bowlingRoster   = battingIsTeam1 ? (match.team2Players ?? []) : (match.team1Players ?? [])

    // 1. Preferred — explicit "who's at the crease right now" fields,
    //    checked across the few field-name variants a backend might use.
    const explicitStriker    = inn.currentStriker ?? inn.striker ?? match.currentStriker
    const explicitNonStriker = inn.currentNonStriker ?? inn.nonStriker ?? inn.nonStrikerName ?? match.currentNonStriker
    const explicitBowler     = inn.currentBowler ?? match.currentBowler

    if (!striker && explicitStriker)       setStriker(explicitStriker)
    if (!nonStriker && explicitNonStriker) setNonStriker(explicitNonStriker)
    if (!bowlerName && explicitBowler)     setBowlerName(explicitBowler)

    // 2. Fallback heuristic — only used for fields the explicit data above
    //    didn't cover (e.g. older matches, or a backend that doesn't yet
    //    persist these fields). Not-out batters from battingStats, then
    //    roster order as a last resort.
    if (!striker || !nonStriker) {
      const activeBatters = (inn.battingStats ?? [])
        .filter((p: any) => !p.isOut)
        .map((p: any) => p.name)
        // Exclude whichever name we already resolved above so we don't
        // assign the same player to both ends.
        .filter((n: string) => n !== explicitStriker && n !== explicitNonStriker)

      if (!striker) {
        const c = explicitStriker || activeBatters[0] || battingRoster[0] || ''
        if (c) setStriker(c)
      }
      if (!nonStriker) {
        const c = explicitNonStriker || activeBatters.find((n: string) => n !== striker) || battingRoster.find((n: string) => n !== striker) || ''
        if (c) setNonStriker(c)
      }
    }

    if (!bowlerName) {
      const lastBowler = inn.bowlingStats?.length ? inn.bowlingStats[inn.bowlingStats.length - 1].name : ''
      const c = explicitBowler || lastBowler || bowlingRoster[0] || ''
      if (c) setBowlerName(c)
    }
  }, [match])

  // ── Show Players-Not-Set dialog if needed (replaces the old Alert.alert) ───
  useEffect(() => {
    if (!match || match.status === 'setup' || match.status === 'completed') return
    const timer = setTimeout(() => {
      if (!striker || !nonStriker || !bowlerName) setShowPlayersNotSet(true)
    }, 800)
    return () => clearTimeout(timer)
  }, [match?._id])

  // Auto-close the dialog once all three are set
  useEffect(() => {
    if (striker && nonStriker && bowlerName) setShowPlayersNotSet(false)
  }, [striker, nonStriker, bowlerName])

  if (fetching) return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={T.accent} size="large" />
    </View>
  )
  if (error || !match) return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center', padding: 40 }]}>
      <Text style={{ color: T.accent, fontSize: 16, marginBottom: 20 }}>{error || 'Match not found'}</Text>
      <Pressable onPress={() => navigation.goBack()} style={{ padding: 12, backgroundColor: T.accentDim, borderRadius: 10 }}>
        <Text style={{ color: T.text, fontWeight: '700' }}>← Go Back</Text>
      </Pressable>
    </View>
  )

  const isCompleted = match.status === 'completed'
  const inningsKey: 'innings1' | 'innings2' = match.status === 'innings1' ? 'innings1' : 'innings2'
  const innings    = match[inningsKey]
  const isInnings2 = match.status === 'innings2'
  const target     = isInnings2 ? (match.innings1?.runs ?? 0) + 1 : null

  const activeBattingTeam = getBattingTeam(match, inningsKey)
  const activeBowlingTeam = getBowlingTeam(match, inningsKey)

  const WICKET_TYPES = ['Wicket', 'Caught', 'Bowled', 'Stumped', 'RunOut(Striker)', 'RunOut(Non-Striker)', 'LBW', 'Hit-Wicket']
  const ASSIST_TYPES = ['Caught', 'Stumped', 'RunOut(Striker)', 'RunOut(Non-Striker)']

  const battingIsTeam1    = activeBattingTeam === match.team1
  const battingTeamRoster: string[] = battingIsTeam1 ? (match.team1Players ?? []) : (match.team2Players ?? [])
  const bowlingTeamRoster: string[] = battingIsTeam1 ? (match.team2Players ?? []) : (match.team1Players ?? [])

  const allPlayerNames  = allPlayers.map(p => p.name)
  const recordedBatters = (innings?.battingStats ?? []).map((p: any) => p.name) as string[]
  const knownBatters    = [...new Set([...battingTeamRoster, ...recordedBatters, ...allPlayerNames])].filter(Boolean)
  const recordedBowlers = (innings?.bowlingStats ?? []).map((p: any) => p.name) as string[]
  const knownBowlers    = [...new Set([...bowlingTeamRoster, ...recordedBowlers, ...allPlayerNames])].filter(Boolean)

  const allBalls     = (innings?.ballByBall ?? []) as Ball[]
  const legalBalls   = allBalls.filter((b: Ball) => !b.isWide && !b.isNoBall)
  const overBallNum  = legalBalls.length % 6
  let currentOverBalls: Ball[] = []
  if (overBallNum > 0) {
    let lc = 0
    for (let i = allBalls.length - 1; i >= 0; i--) {
      const b = allBalls[i]
      currentOverBalls.unshift(b)
      if (!b.isWide && !b.isNoBall) { lc++; if (lc >= overBallNum) break }
    }
  }
  const overRuns        = currentOverBalls.reduce((s: number, b: Ball) => s + (b.runs ?? 0), 0)
  const overWkts        = currentOverBalls.filter((b: Ball) => b.isWicket).length
  const strikerStats    = innings?.battingStats?.find((p: any) => p.name === striker)
  const nonStrikerStats = innings?.battingStats?.find((p: any) => p.name === nonStriker)
  const bowlerStats     = innings?.bowlingStats?.find((p: any) => p.name === bowlerName)
  const okEnabled       = runs !== null && !loading && !isCompleted

  // ──────────────────────────────────────────────────────────────────────
  // CORE FIX — Set Name handlers. Each one:
  //   1. assigns the player to the relevant scoring slot immediately, so
  //      scoring is never blocked on a network round trip
  //   2. calls ensureRegistered(), which only SKIPS the network call when
  //      the local cache already has an exact case-insensitive match (a
  //      cheap optimization for the common "picked an existing player"
  //      case) — for anything else it defers to autoSyncPlayer(), which
  //      re-checks the server fresh and is itself race-proof, so true
  //      uniqueness never depends on this local cache being correct
  //   3. merges the resolved record back into allPlayers so Manage Players
  //      and the picker reflect it without a manual refetch
  // ──────────────────────────────────────────────────────────────────────
  const ensureRegistered = async (name: string, role: 'batsman' | 'bowler', team: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const needle = trimmed.toLowerCase()

    // Fast path only — not the uniqueness guarantee itself.
    const alreadyCachedLocally = allPlayers.some(p => p.name.trim().toLowerCase() === needle)
    if (alreadyCachedLocally) return

    // Authoritative path — server-checked, race-proof.
    const synced = await autoSyncPlayer(trimmed, role, team)
    setAllPlayers(prev =>
      prev.some(p => p.name.trim().toLowerCase() === synced.name.trim().toLowerCase())
        ? prev
        : [...prev, synced]
    )
  }

  const handleSelectStriker = (name: string) => {
    setStriker(name)
    setPicker(null)
    ensureRegistered(name, 'batsman', activeBattingTeam)
  }
  const handleSelectNonStriker = (name: string) => {
    setNonStriker(name)
    setPicker(null)
    ensureRegistered(name, 'batsman', activeBattingTeam)
  }
  const handleSelectBowler = (name: string) => {
    setBowlerName(name)
    setPicker(null)
    ensureRegistered(name, 'bowler', activeBowlingTeam)
  }

  // Opens a player picker after refreshing the registry, so the "+ Add"
  // affordance only appears for names that are genuinely new — reducing
  // (though, thanks to autoSyncPlayer's server check, never relying on)
  // false "new player" prompts for names that exist but weren't cached yet.
  const openPicker = (role: 'striker' | 'nonStriker' | 'bowler') => {
    setPicker(role)
    loadPlayers().catch(() => {})
  }

  // Used by the Players-Not-Set dialog rows — opens the picker directly
  const openStrikerFromDialog    = () => { setShowPlayersNotSet(false); openPicker('striker') }
  const openNonStrikerFromDialog = () => { setShowPlayersNotSet(false); openPicker('nonStriker') }
  const openBowlerFromDialog     = () => { setShowPlayersNotSet(false); openPicker('bowler') }

  // ── Ball recording ───────────────────────────────────────────────────────
  const postBall = async (ballData: any) => {
    if (!striker || !nonStriker || !bowlerName) { setShowPlayersNotSet(true); return }
    try {
      setLoading(true)
      const token    = await getToken()
      const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
      const body     = token ? ballData : { ...ballData, deviceId }
      const res      = await fetch(apiUrl(`/api/matches/${id}/ball`), {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to record ball')
      const data = await res.json()
      setMatch(data)
      if (data.status === 'completed') setShowResultPopup(true)
    } catch { Alert.alert('Error', 'Failed to record ball') }
    finally { setLoading(false) }
  }

  const submitBall = (ballData: any, nextBatsman: string | null) => {
    const isLegal = !ballData.isWide && !ballData.isNoBall

    // Compute the resulting crease state using the EXACT same rules the
    // local state updates below apply, so what we send to the server
    // matches what the UI will display after this function returns.
    // This has to happen synchronously here (not read back from state
    // after the setStriker/setNonStriker calls below) because React state
    // updates aren't immediately readable — striker/nonStriker in this
    // closure are still the PRE-ball values until next render.
    let resultStriker    = striker
    let resultNonStriker = nonStriker
    const resultBowler   = bowlerName  // bowler only changes via BowlerChangeModal, handled separately

    if (ballData.isWicket && nextBatsman) {
      resultStriker = nextBatsman
      // non-striker unaffected by a wicket unless it was a non-striker run-out,
      // which the existing UI doesn't separately model here — kept as-is.
    } else if (isLegal && (ballData.runs ?? 0) % 2 !== 0) {
      // Odd-run rotation swaps ends.
      resultStriker    = nonStriker
      resultNonStriker = striker
    }
    if (isLegal && (legalBalls.length + 1) % 6 === 0) {
      // Over complete — ends swap regardless of the run count, mirroring
      // the over-change logic below.
      const tmp = resultStriker
      resultStriker    = resultNonStriker
      resultNonStriker = tmp
    }

    postBall({ ...ballData, resultingStriker: resultStriker, resultingNonStriker: resultNonStriker, resultingBowler: resultBowler })

    if (isLegal && (ballData.runs ?? 0) % 2 !== 0) { const tmp = striker; setStriker(nonStriker); setNonStriker(tmp) }
    if (ballData.isWicket && nextBatsman) setStriker(nextBatsman)
    if (isLegal && (legalBalls.length + 1) % 6 === 0) {
      setStriker(s => { setNonStriker(s); return nonStriker })
      setOverChangeOpen(true)
    }
    setRuns(null); setWicket(false); setWicketType('Wicket')
    setAssistName(''); setWide(false); setNoBall(false)
  }

  const handleOK = () => {
    if (runs === null) return
    const ball = {
      runs, isWicket: wicket,
      wicketType: wicket ? wicketType : null,
      assistPlayer: wicket && ASSIST_TYPES.includes(wicketType) ? assistName : null,
      isWide: wide, isNoBall: noBall,
      extraRuns: wide || noBall ? 1 : 0,
      batsmanName: striker, bowlerName,
      // Sent so the server can persist who's currently at the crease —
      // without this, a remount has no reliable way to know the
      // non-striker, since they may not yet appear in battingStats at all
      // (e.g. they haven't faced a ball this innings).
      nonStrikerName: nonStriker,
    }
    if (wicket) { setPendingBall(ball); setNewBatsmanOpen(true) }
    else submitBall(ball, null)
  }

  // New batsman after wicket also goes through ensureRegistered
  const handleConfirmNewBatsman = (name: string) => {
    setNewBatsmanOpen(false)
    submitBall(pendingBall, name)
    setPendingBall(null)
    ensureRegistered(name, 'batsman', activeBattingTeam)
  }

  const handleConfirmBowlerChange = (name: string) => {
    setBowlerName(name)
    setOverChangeOpen(false)
    ensureRegistered(name, 'bowler', activeBowlingTeam)
  }

  const handleUndo = async () => {
    try {
      setLoading(true)
      const token    = await getToken()
      const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
      const res      = await fetch(apiUrl(`/api/matches/${id}/undo`), {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(token ? {} : { deviceId }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setMatch(updated)

      // Re-sync local striker/non-striker/bowler from the server's
      // post-undo state. Without this, undoing a wicket or an over-change
      // leaves the scoring UI showing the player who was set BEFORE the
      // undo (now stale), which then corrupts every subsequent ball if the
      // person keeps undoing or keeps scoring without manually re-picking.
      const inningsKey: 'innings1' | 'innings2' = updated.status === 'innings1' ? 'innings1' : 'innings2'
      const inn = updated[inningsKey]
      if (inn) {
        const explicitStriker    = inn.currentStriker ?? inn.striker ?? updated.currentStriker
        const explicitNonStriker = inn.currentNonStriker ?? inn.nonStriker ?? inn.nonStrikerName ?? updated.currentNonStriker
        const explicitBowler     = inn.currentBowler ?? updated.currentBowler

        if (explicitStriker)    setStriker(explicitStriker)
        if (explicitNonStriker) setNonStriker(explicitNonStriker)
        if (explicitBowler)     setBowlerName(explicitBowler)

        // No explicit fields available (older match / backend doesn't
        // persist them yet) — fall back to last-resort reconstruction
        // rather than leaving stale names on screen.
        if (!explicitStriker || !explicitNonStriker) {
          const activeBatters = (inn.battingStats ?? []).filter((p: any) => !p.isOut).map((p: any) => p.name)
          if (!explicitStriker && activeBatters[0])    setStriker(activeBatters[0])
          if (!explicitNonStriker && activeBatters[1]) setNonStriker(activeBatters[1])
        }
        if (!explicitBowler) {
          const lastBowler = inn.bowlingStats?.length ? inn.bowlingStats[inn.bowlingStats.length - 1].name : ''
          if (lastBowler) setBowlerName(lastBowler)
        }
      }

      // If the undo reverted the match OUT of "completed" (the common
      // case — the winning/losing ball was undone), make sure the result
      // popup isn't still showing stale state. isCompleted is derived
      // fresh from match.status on the next render, so the Scoring tab
      // and full input controls re-enable automatically — no extra state
      // to manage here.
      if (updated.status !== 'completed') setShowResultPopup(false)
    } catch { Alert.alert('Undo', 'Nothing to undo') }
    finally { setLoading(false) }
  }

  // Wraps handleUndo with an extra confirmation when the match is already
  // completed — reverting a finished result is more consequential than
  // undoing mid-innings, so this guards against an accidental tap quietly
  // erasing a "Completed" badge the person actually meant to keep.
  const handleUndoTapped = () => {
    if (!isCompleted) { handleUndo(); return }
    Alert.alert(
      'Undo Last Ball?',
      'This match is marked Completed. Undoing the last ball may change the result and reopen scoring. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo', style: 'destructive', onPress: handleUndo },
      ]
    )
  }

  // Redo — re-applies the most recently undone ball via the server's
  // /redo endpoint, which replays it through the same totals/stats logic
  // as a fresh ball post. Re-syncs local striker/non-striker/bowler the
  // same way handleUndo does, since redo can also cross a wicket,
  // over-change, or innings/match completion boundary.
  const handleRedo = async () => {
    try {
      setLoading(true)
      const token    = await getToken()
      const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
      const res      = await fetch(apiUrl(`/api/matches/${id}/redo`), {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(token ? {} : { deviceId }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setMatch(updated)

      const inningsKey: 'innings1' | 'innings2' = updated.status === 'innings1' ? 'innings1' : 'innings2'
      const inn = updated[inningsKey]
      if (inn) {
        if (inn.currentStriker)    setStriker(inn.currentStriker)
        if (inn.currentNonStriker) setNonStriker(inn.currentNonStriker)
        if (inn.currentBowler)     setBowlerName(inn.currentBowler)
      }
      if (updated.status === 'completed') setShowResultPopup(true)
    } catch { Alert.alert('Redo', 'Nothing to redo') }
    finally { setLoading(false) }
  }

  // Whether there's anything to redo — checked from the SERVER's undoStack
  // length on the relevant innings, so the button only shows/enables when
  // a redo would actually do something.
  const redoAvailable =
    (match?.innings2?.undoStack?.length ?? 0) > 0 ||
    (match?.innings1?.undoStack?.length ?? 0) > 0

  const handleUpdateOvers = async (newOvers: number) => {
    try {
      setLoading(true)
      const token    = await getToken()
      const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
      const body     = token ? { overs: newOvers } : { overs: newOvers, deviceId }
      const res      = await fetch(apiUrl(`/api/matches/${id}/overs`), {
        method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setMatch(await res.json())
      setUpdateOversOpen(false)
      Alert.alert('✅ Updated', `Match overs updated to ${newOvers}`)
    } catch { Alert.alert('Error', 'Failed to update overs') }
    finally { setLoading(false) }
  }

  const handleEndInnings = () => {
    Alert.alert('End Innings', 'Are you sure you want to end this innings?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Innings', style: 'destructive', onPress: async () => {
          try {
            setLoading(true)
            const token    = await getToken()
            const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
            const newStatus = match.status === 'innings1' ? 'innings2' : 'completed'
            const body      = token ? { ...match, status: newStatus } : { ...match, status: newStatus, deviceId }
            const res = await fetch(apiUrl(`/api/matches/${id}`), {
              method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify(body),
            })
            if (!res.ok) throw new Error()
            const updated = await res.json()
            setMatch(updated)
            if (newStatus === 'innings2') setShowInn2Dialog(true)
            else if (newStatus === 'completed') setShowResultPopup(true)
          } catch { await fetchMatch() }
          finally { setLoading(false) }
        },
      },
    ])
  }

  const handleStartInn2 = () => {
    setShowInn2Dialog(false)
    setStriker(''); setNonStriker(''); setBowlerName('')
    setTab('scoring')
  }

  const ALL_TABS = [
    { key: 'scoring', icon: '🏏', label: 'Scoring' },
    { key: 'scorecard', icon: '📋', label: 'Scorecard' },
    { key: 'ballbyball', icon: '🎯', label: 'Ball×Ball' },
  ] as const
  const TABS = isCompleted ? ALL_TABS.filter(t => t.key !== 'scoring') : ALL_TABS
  const activeTab = isCompleted && tab === 'scoring' ? 'scorecard' : tab

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      <View style={S.header}>
        <Pressable onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={{ color: T.text2, fontSize: 18, fontWeight: '600' }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>{match.team1} vs {match.team2}</Text>
          <Text style={S.headerSub}>
            {match.overs} overs · {isCompleted ? '✅ Completed' : match.status === 'innings1' ? '🔴 1st Innings' : '🔴 2nd Innings'}
          </Text>
        </View>
        {/* Undo stays available even on a completed match — if the last
            ball wrongly ended the match (wrong wicket, wrong run count),
            this is the only way back in. handleUndoTapped below adds an
            extra confirmation step specifically for this case since
            reverting a completed result is a bigger action than undoing
            mid-innings. */}
        <Pressable onPress={handleUndoTapped} disabled={loading} style={S.undoBtn}>
          <Text style={S.undoBtnTxt}>UNDO</Text>
        </Pressable>
        {/* Redo — only shown enabled when the server actually has
            something stashed to redo (redoAvailable), so it's not just a
            dead button when there's nothing to bring back. */}
        <Pressable onPress={handleRedo} disabled={loading || !redoAvailable} style={[S.undoBtn, !redoAvailable && { opacity: 0.4 }]}>
          <Text style={S.undoBtnTxt}>REDO</Text>
        </Pressable>
      </View>

      {isCompleted && (
        <View style={{ backgroundColor: '#14532d', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#22c55e33', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16 }}>🏆</Text>
          <Text style={{ color: '#22c55e', fontWeight: '700', fontSize: 13, flex: 1 }} numberOfLines={2}>{match.result || 'Match completed'}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {activeTab === 'scoring' && !isCompleted && innings && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <View style={S.scoreCard}>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
                <Text style={{ fontSize: 11, color: T.text2, fontWeight: '800' }}>🏏 {activeBattingTeam}</Text>
                <Text style={{ fontSize: 11, color: T.subtext, fontWeight: '700' }}>🎯 {activeBowlingTeam}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={S.scoreSub}>{isInnings2 ? '2nd Innings' : '1st Innings'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={S.scoreMain}>{innings.runs ?? 0}</Text>
                    <Text style={S.scoreWkt}>/{innings.wickets ?? 0}</Text>
                  </View>
                  <Text style={S.scoreOv}>
                    ({fmtOv(innings.balls ?? 0)} ov)
                    {isInnings2 && target ? `  ·  Need ${Math.max(0, target - (innings.runs ?? 0))} off ${match.overs * 6 - (innings.balls ?? 0)} balls` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={S.rateLabel}>CRR</Text>
                  <Text style={S.rateVal}>{calcCRR(innings.runs ?? 0, innings.balls ?? 0)}</Text>
                  {isInnings2 && target && (
                    <>
                      <Text style={[S.rateLabel, { color: T.gold }]}>RRR</Text>
                      <Text style={[S.rateVal, { color: T.gold, fontSize: 18 }]}>{calcRRR(target, innings.runs ?? 0, innings.balls ?? 0, match.overs)}</Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            {/* Player cards — color-coded with the app's own theme accents */}
            <View style={{ marginHorizontal: 12, marginTop: 10 }}>
              <PlayerCardRow
                role="striker" label="STRIKER" name={striker}
                placeholder="Tap to select striker"
                stats={[strikerStats?.runs ?? 0, strikerStats?.balls ?? 0,
                  (strikerStats?.balls ?? 0) > 0 ? Math.round((strikerStats.runs / strikerStats.balls) * 100) : '—']}
                statLabels={['R', 'B', 'SR']}
                accent={ROLE_COLORS.striker}
                onPress={() => openPicker('striker')}
              />
              <PlayerCardRow
                role="nonStriker" label="NON-STRIKER" name={nonStriker}
                placeholder="Tap to select non-striker"
                stats={[nonStrikerStats?.runs ?? 0, nonStrikerStats?.balls ?? 0,
                  (nonStrikerStats?.balls ?? 0) > 0 ? Math.round((nonStrikerStats.runs / nonStrikerStats.balls) * 100) : '—']}
                statLabels={['R', 'B', 'SR']}
                accent={ROLE_COLORS.nonStriker}
                onPress={() => openPicker('nonStriker')}
              />
              <PlayerCardRow
                role="bowler" label="BOWLER" name={bowlerName}
                placeholder="Tap to select bowler"
                stats={[fmtOv(bowlerStats?.balls ?? 0), bowlerStats?.runs ?? 0, `${bowlerStats?.wickets ?? 0}W`]}
                statLabels={['O', 'R', 'W']}
                accent={ROLE_COLORS.bowler}
                onPress={() => openPicker('bowler')}
              />
            </View>

            <View style={S.overCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 10, color: T.muted, fontWeight: '800', letterSpacing: 1 }}>THIS OVER · {fmtOv(innings.balls ?? 0)}</Text>
                {currentOverBalls.length > 0 && (
                  <Text style={{ fontSize: 11, color: T.subtext, fontWeight: '700' }}>{overRuns}R{overWkts > 0 ? ` · ${overWkts}W` : ''}</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 30 }}>
                {currentOverBalls.length === 0
                  ? <Text style={{ color: T.muted, fontSize: 12 }}>No balls yet this over</Text>
                  : currentOverBalls.map((b: Ball, i: number) => {
                      let bg = T.faint, color = T.muted, label = String(b.runs ?? 0)
                      if      (b.isWicket)   { bg = T.accentDim;  color = T.accent;  label = 'W' }
                      else if (b.isWide)     { bg = '#1e3a5f';    color = T.sky;     label = b.runs > 1 ? `+${b.runs}` : 'Wd' }
                      else if (b.isNoBall)   { bg = T.orangeDim;  color = T.orange;  label = b.runs > 0 ? `+${b.runs}` : 'NB' }
                      else if (b.runs === 4) { bg = T.greenDim;   color = T.green;   label = '4' }
                      else if (b.runs === 6) { bg = T.purpleDim;  color = T.purple;  label = '6' }
                      else if (b.runs === 0) { bg = T.border2;    color = T.muted;   label = '·' }
                      return (
                        <View key={i} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: bg, borderWidth: 1, borderColor: color + '44', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{label}</Text>
                        </View>
                      )
                    })}
              </View>
            </View>

            <View style={S.extrasRow}>
              {[
                { key: 'wide', label: 'Wide', active: wide, toggle: () => setWide(v => !v), color: T.sky },
                { key: 'noBall', label: 'No Ball', active: noBall, toggle: () => setNoBall(v => !v), color: T.orange },
              ].map(e => (
                <Pressable key={e.key} onPress={e.toggle} style={[S.extraBtn, e.active && { backgroundColor: e.color + '18' }]}>
                  <View style={[S.extraCheck, { borderColor: e.active ? e.color : T.muted }, e.active && { backgroundColor: e.color + '33' }]}>
                    {e.active && <Text style={{ fontSize: 13, color: e.color }}>✓</Text>}
                  </View>
                  <Text style={[S.extraLabel, { color: e.active ? e.color : T.subtext }]}>{e.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={S.runRow}>
              {[0, 1, 2, 3, 4, 5, 6].map(r => {
                const sel = runs === r
                const clr = r === 4 ? T.green : r === 6 ? T.purple : T.accent
                const dim = r === 4 ? T.greenDim : r === 6 ? T.purpleDim : T.accentDim
                return (
                  <Pressable key={r} onPress={() => setRuns(r)} style={[S.runBtn, sel && { backgroundColor: dim, borderColor: clr }]}>
                    <Text style={[S.runBtnTxt, { color: sel ? clr : T.subtext }]}>{r}</Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 8 }}>
              <Pressable onPress={() => { setWicket(w => !w); if (!wicket && runs === null) setRuns(0) }}
                style={[S.wicketBtn, wicket && { backgroundColor: 'rgba(100,0,0,0.7)', borderColor: T.accent }]}>
                <Text style={{ fontSize: 18 }}>{wicket ? '💀' : '🏏'}</Text>
                <Text style={[S.wicketBtnTxt, wicket && { color: T.accent }]}>{wicket ? 'W ON' : 'WICKET'}</Text>
              </Pressable>
              <Pressable onPress={() => { if (wicket) setShowWktMenu(v => !v) }}
                style={[S.wicketTypeBtn, wicket && { backgroundColor: 'rgba(100,0,0,0.25)', borderColor: T.accent + '44' }]}>
                <Text style={{ color: wicket ? T.accent : T.text2, fontWeight: '700', fontSize: 14 }}>{wicketType}</Text>
                {wicket && <Text style={{ color: T.accent, fontSize: 10 }}>▼</Text>}
              </Pressable>
              <Pressable onPress={handleOK} disabled={!okEnabled} style={[S.okBtn, okEnabled && { backgroundColor: T.accent }]}>
                {loading ? <ActivityIndicator color={T.text} size="small" /> : <Text style={[S.okBtnTxt, { color: okEnabled ? T.text : T.muted }]}>OK</Text>}
              </Pressable>
            </View>

            {showWktMenu && wicket && (
              <View style={S.wktDropdown}>
                {WICKET_TYPES.map(type => (
                  <Pressable key={type} onPress={() => { setWicketType(type); setAssistName(''); setShowWktMenu(false) }}
                    style={[S.wktItem, wicketType === type && { backgroundColor: 'rgba(204,0,0,0.15)' }]}>
                    <Text style={{ color: wicketType === type ? T.accent : T.text2, fontWeight: '700', fontSize: 15 }}>{type}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {wicket && ASSIST_TYPES.includes(wicketType) && (
              <View style={{ marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(100,0,0,0.12)', borderRadius: 11, padding: 10, borderWidth: 1, borderColor: 'rgba(204,0,0,0.15)' }}>
                <Text style={{ fontSize: 10, color: T.accent, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }}>
                  {wicketType.startsWith('RunOut') ? '⚡ RUN OUT BY' : wicketType === 'Stumped' ? '🧤 STUMPED BY' : '🙌 CAUGHT BY'}
                </Text>
                <TextInput value={assistName} onChangeText={setAssistName} placeholder="Fielder / keeper name…" placeholderTextColor={T.muted}
                  style={{ backgroundColor: T.surface, borderRadius: 9, padding: 8, paddingHorizontal: 12, color: T.text, fontSize: 13, borderWidth: 1, borderColor: 'rgba(204,0,0,0.25)' }} />
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 8 }}>
              <Pressable onPress={() => { setStriker(nonStriker); setNonStriker(striker) }} style={S.actionBtn}>
                <Text style={S.actionBtnTxt}>⇄ SWITCH</Text>
              </Pressable>
              <Pressable onPress={() => setUpdateOversOpen(true)} style={[S.actionBtn, { borderColor: T.gold + '44' }]}>
                <Text style={[S.actionBtnTxt, { color: T.gold }]}>⏱ OVERS</Text>
              </Pressable>
              <Pressable onPress={handleEndInnings} style={[S.actionBtn, { borderColor: T.accent + '44' }]}>
                <Text style={[S.actionBtnTxt, { color: T.accent }]}>END INN</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {activeTab === 'scorecard' && (
          <ScorecardTab match={match} onUndo={handleUndoTapped} undoDisabled={(legalBalls.length === 0 && allBalls.length === 0) || loading} onRedo={handleRedo} redoAvailable={redoAvailable && !loading} />
        )}
        {activeTab === 'ballbyball' && (
          <BallByBallTab match={match} onUndo={handleUndoTapped} undoDisabled={(legalBalls.length === 0 && allBalls.length === 0) || loading} onRedo={handleRedo} redoAvailable={redoAvailable && !loading} />
        )}
      </View>

      <View style={S.bottomTabs}>
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key as any)} style={S.bottomTab}>
            {activeTab === t.key && <View style={S.bottomTabIndicator} />}
            <Text style={{ fontSize: 20 }}>{t.icon}</Text>
            <Text style={[S.bottomTabLabel, activeTab === t.key && { color: T.accent }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Players Not Set dialog — matches reference screenshot ──────────── */}
      <PlayersNotSetDialog
        visible={showPlayersNotSet && !isCompleted}
        onClose={() => setShowPlayersNotSet(false)}
        onTapStriker={openStrikerFromDialog}
        onTapNonStriker={openNonStrikerFromDialog}
        onTapBowler={openBowlerFromDialog}
        needStriker={!striker}
        needNonStriker={!nonStriker}
        needBowler={!bowlerName}
      />

      {/* ── Second Innings Dialog ───────────────────────────────────────────── */}
      <SecondInningsDialog visible={showInn2Dialog} match={match} onStartInnings={handleStartInn2} />

      {/* ── Match Result Popup ──────────────────────────────────────────────── */}
      <MatchResultPopup
        visible={showResultPopup}
        match={match}
        onViewScorecard={() => { setShowResultPopup(false); setTab('scorecard') }}
        onMatchSummary={() => {
          setShowResultPopup(false)
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MatchReport', params: { id } }] }))
        }}
        onDone={() => setShowResultPopup(false)}
      />

      {/* ── Player Pickers — wired to handlers with auto-sync ──────────────── */}
      <PlayerPicker
        visible={picker === 'striker'} onClose={() => setPicker(null)}
        onSelect={handleSelectStriker} title="SET STRIKER" accentColor={ROLE_COLORS.striker.main}
        players={knownBatters} allPlayerInfo={allPlayers} />
      <PlayerPicker
        visible={picker === 'nonStriker'} onClose={() => setPicker(null)}
        onSelect={handleSelectNonStriker} title="SET NON-STRIKER" accentColor={ROLE_COLORS.nonStriker.main}
        players={knownBatters} allPlayerInfo={allPlayers} />
      <PlayerPicker
        visible={picker === 'bowler'} onClose={() => setPicker(null)}
        onSelect={handleSelectBowler} title="SET BOWLER" accentColor={ROLE_COLORS.bowler.main}
        players={knownBowlers} allPlayerInfo={allPlayers} />

      <NewBatsmanModal
        visible={newBatsmanOpen} outName={striker} wicketType={pendingBall?.wicketType}
        players={knownBatters.filter(n => n !== striker && n !== nonStriker)}
        onConfirm={handleConfirmNewBatsman} />

      <BowlerChangeModal
        visible={overChangeOpen}
        players={recordedBowlers.length > 0 ? recordedBowlers : knownBowlers}
        lastBowler={bowlerName}
        onConfirm={handleConfirmBowlerChange}
        onSkip={() => setOverChangeOpen(false)} />

      <UpdateOversModal
        visible={updateOversOpen} currentOvers={match.overs}
        onConfirm={handleUpdateOvers} onClose={() => setUpdateOversOpen(false)} />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 36, paddingBottom: 12, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: T.text, fontWeight: '700', fontSize: 16, letterSpacing: 0.5 },
  headerSub: { color: T.subtext, fontSize: 10, fontWeight: '700' },
  undoBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border },
  undoBtnTxt: { color: T.text2, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  scoreCard: { margin: 10, marginBottom: 0, backgroundColor: '#120000', borderWidth: 1, borderColor: T.accentDim, borderRadius: 14, padding: 12 },
  scoreSub: { fontSize: 11, color: T.subtext, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  scoreMain: { fontSize: 42, fontWeight: '700', color: T.text, lineHeight: 44, fontVariant: ['tabular-nums'] },
  scoreWkt: { fontSize: 26, color: T.subtext, fontVariant: ['tabular-nums'] },
  scoreOv: { fontSize: 11, color: T.subtext, marginTop: 3 },
  rateLabel: { fontSize: 10, color: T.accent, fontWeight: '800', letterSpacing: 1, textAlign: 'right' },
  rateVal: { fontSize: 28, fontWeight: '700', color: T.text, textAlign: 'right', fontVariant: ['tabular-nums'] },
  overCard: { marginHorizontal: 12, marginTop: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.border2, borderRadius: 12, padding: 10, paddingHorizontal: 14 },
  extrasRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.border2, borderRadius: 12, overflow: 'hidden', justifyContent: 'space-around' },
  extraBtn: { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 5, padding: 10 },
  extraCheck: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  extraLabel: { fontSize: 11, fontWeight: '800' },
  runRow: { flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 8 },
  runBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, alignItems: 'center', justifyContent: 'center' },
  runBtnTxt: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  wicketBtn: { width: 82, borderRadius: 11, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 2 },
  wicketBtnTxt: { color: T.subtext, fontSize: 13, fontWeight: '700' },
  wicketTypeBtn: { flex: 1, minHeight: 58, borderRadius: 11, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  okBtn: { width: 64, borderRadius: 11, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, alignItems: 'center', justifyContent: 'center' },
  okBtnTxt: { fontSize: 22, fontWeight: '800' },
  wktDropdown: { marginHorizontal: 12, marginTop: 4, backgroundColor: T.surface, borderWidth: 1, borderColor: 'rgba(204,0,0,0.3)', borderRadius: 12, overflow: 'hidden', zIndex: 300 },
  wktItem: { paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.border2 },
  actionBtn: { flex: 1, height: 40, borderRadius: 10, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  actionBtnTxt: { color: T.subtext, fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },
  bottomTabs: { flexDirection: 'row', backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border },
  bottomTab: { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 3, position: 'relative' },
  bottomTabIndicator: { position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, backgroundColor: T.accent, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  bottomTabLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: T.muted },
})