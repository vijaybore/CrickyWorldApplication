// src/screens/ScoringScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Ball-by-ball Live Scoring Screen
// Converted from Scoring.jsx → React Native TypeScript
// Tabs: Scoring | Scorecard | Ball×Ball
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text , Pressable, ScrollView, TextInput,
  Modal, FlatList, StyleSheet, ActivityIndicator,
  Alert, StatusBar, Platform} from 'react-native'
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl, authHeaders, jsonHeaders } from '../services/api'
import type { RootStackParamList, Ball, BattingStats, BowlingStats } from '../types'

type Route = RouteProp<RootStackParamList, 'Scoring'>
type Nav   = NativeStackNavigationProp<RootStackParamList>

// ── Player info type ──────────────────────────────────────────────────────────
type PlayerInfo = {
  name: string
  role?: string
  jerseyNumber?: string | number
  battingStyle?: string
  bowlingStyle?: string
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: '#0b0f1a', surface: '#111827', card: '#151e2e', card2: '#1a2540',
  border: '#1f2d42', border2: '#162032',
  accent: '#10b981', accentDim: '#064e3b',
  gold: '#f59e0b', goldDim: '#78350f',
  red: '#ef4444', redDim: '#7f1d1d',
  orange: '#fb923c', orangeDim: '#431407',
  sky: '#38bdf8', purple: '#c084fc', purpleDim: '#3b0764',
  text: '#f1f5f9', text2: '#cbd5e1', subtext: '#94a3b8', muted: '#475569',
  faint: '#1e293b'}

// ── Role display helpers ──────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  batsman: '#60a5fa', bowler: '#f87171',
  allrounder: '#facc15', 'wk-batsman': '#a78bfa',
}
const ROLE_LABEL: Record<string, string> = {
  batsman: 'BAT', bowler: 'BOWL',
  allrounder: 'ALL', 'wk-batsman': 'WK',
}

const fmtOv  = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
const calcCRR = (runs: number, balls: number) => balls === 0 ? '0.0' : (runs / (balls / 6)).toFixed(1)
const calcRRR = (target: number, runs: number, balls: number, totalOvers: number) => {
  const rem = totalOvers * 6 - balls
  return rem <= 0 ? '—' : ((target - runs) / (rem / 6)).toFixed(1)
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('token').catch(() => null)
}

// ── BallDot ───────────────────────────────────────────────────────────────────
function BallDot({ ball, size = 30 }: { ball: Ball; size?: number }) {
  let bg = T.faint, color = T.muted, label = String(ball.runs ?? 0)
  if      (ball.isWicket) { bg = T.redDim;    color = T.red;    label = 'W' }
  else if (ball.isWide)   { bg = '#1e3a5f';   color = T.sky;    label = ball.runs > 1 ? `+${ball.runs}` : 'Wd' }
  else if (ball.isNoBall) { bg = T.orangeDim; color = T.orange; label = ball.runs > 0 ? `+${ball.runs}` : 'NB' }
  else if (ball.runs === 4) { bg = T.accentDim; color = T.accent; label = '4' }
  else if (ball.runs === 6) { bg = T.purpleDim; color = T.purple; label = '6' }
  else if (ball.runs === 0) { bg = T.border2;   color = T.muted;  label = '·' }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: 1, borderColor: color + '44', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: size < 30 ? 10 : 11, fontWeight: '800' }}>{label}</Text>
    </View>
  )
}

// ── Enhanced Player Picker Modal ──────────────────────────────────────────────
function PlayerPicker({
  visible, onClose, onSelect, title, accentColor = T.sky,
  players = [], allPlayerInfo = [],
}: {
  visible: boolean
  onClose: () => void
  onSelect: (name: string) => void
  title: string
  accentColor?: string
  players: string[]
  allPlayerInfo?: PlayerInfo[]
}) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (visible) setQuery('') }, [visible])

  const filtered = players.filter(n =>
    n.toLowerCase().includes(query.toLowerCase())
  )
  const canAddNew = query.trim() !== '' &&
    !players.some(n => n.toLowerCase() === query.trim().toLowerCase())

  const getInfo = (name: string): PlayerInfo | undefined =>
    allPlayerInfo.find(p => p.name.toLowerCase() === name.toLowerCase())

  const listData = canAddNew
    ? [{ name: query.trim(), isNew: true }, ...filtered.map(n => ({ name: n, isNew: false }))]
    : filtered.map(n => ({ name: n, isNew: false }))

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={PP.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </View>
      <View style={PP.sheet}>
        <View style={PP.handle} />
        <Text style={[PP.title, { color: accentColor }]}>{title}</Text>

        {/* Search input */}
        <View style={PP.inputRow}>
          <View style={[PP.inputWrap, { borderColor: accentColor + '55' }]}>
            <Text style={{ color: accentColor, fontSize: 14, marginRight: 6 }}>🔍</Text>
            <TextInput
              style={PP.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name…"
              placeholderTextColor={T.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => query.trim() && onSelect(query.trim())}
            />
            {query !== '' ? (
              <Pressable onPress={() => setQuery('')}>
                <Text style={{ color: T.muted, fontSize: 14 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          {query.trim() !== '' ? (
            <Pressable
              onPress={() => onSelect(query.trim())}
              style={[PP.setBtn, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}
            >
              <Text style={{ color: accentColor, fontWeight: '800', fontSize: 13 }}>Set</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Player list */}
        <FlatList
          data={listData}
          keyExtractor={(item, i) => item.name + i}
          style={{ maxHeight: 320 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.isNew) {
              return (
                <Pressable
                  android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
                  onPress={() => onSelect(item.name)}
                  style={[PP.playerRow, { backgroundColor: accentColor + '12', borderColor: accentColor + '44' }]}
                >
                  <Text style={{ color: accentColor, fontWeight: '800', fontSize: 14 }}>
                    ＋ Add "{item.name}"
                  </Text>
                </Pressable>
              )
            }

            const info = getInfo(item.name)
            const roleColor = info?.role ? (ROLE_COLOR[info.role] ?? T.muted) : T.muted
            const roleLabel = info?.role ? (ROLE_LABEL[info.role] ?? null) : null
            const initials  = item.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

            return (
              <Pressable
                android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
                onPress={() => onSelect(item.name)}
                style={PP.playerRow}
              >
                {/* Initials avatar */}
                <View style={[PP.avatar, { backgroundColor: roleColor + '22', borderColor: roleColor + '55' }]}>
                  <Text style={{ color: roleColor, fontSize: 12, fontWeight: '800' }}>{initials}</Text>
                </View>

                {/* Name + style */}
                <View style={{ flex: 1 }}>
                  <Text style={PP.playerName}>{item.name}</Text>
                  {info?.battingStyle || info?.bowlingStyle ? (
                    <Text style={PP.playerSub} numberOfLines={1}>
                      {[info.battingStyle, info.bowlingStyle].filter(Boolean).join('  ·  ')}
                    </Text>
                  ) : null}
                </View>

                {/* Role badge + jersey */}
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  {roleLabel ? (
                    <View style={[PP.roleBadge, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}>
                      <Text style={{ color: roleColor, fontSize: 9, fontWeight: '800' }}>{roleLabel}</Text>
                    </View>
                  ) : null}
                  {info?.jerseyNumber ? (
                    <Text style={PP.jersey}>#{info.jerseyNumber}</Text>
                  ) : null}
                </View>
              </Pressable>
            )
          }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>🔍</Text>
              <Text style={{ color: T.muted, fontSize: 13, textAlign: 'center' }}>
                No players found.{'\n'}Type a name above to add.
              </Text>
            </View>
          }
        />

        <Pressable
          android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={onClose}
          style={PP.cancelBtn}
        >
          <Text style={{ color: T.subtext, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const PP = StyleSheet.create({
  backdrop:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36, borderWidth: 1, borderColor: T.border, maxHeight: '80%' },
  handle:     { width: 36, height: 4, backgroundColor: T.muted, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:      { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
  inputRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  inputWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: T.surface, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  input:      { flex: 1, color: T.text, fontSize: 14 },
  setBtn:     { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, justifyContent: 'center' },
  playerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, marginBottom: 6 },
  avatar:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  playerName: { color: T.text, fontWeight: '700', fontSize: 14 },
  playerSub:  { color: T.muted, fontSize: 11, marginTop: 1 },
  roleBadge:  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  jersey:     { color: T.muted, fontSize: 10, fontFamily: 'monospace' },
  cancelBtn:  { marginTop: 12, padding: 11, borderRadius: 10, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
})

// ── New Batsman Modal ─────────────────────────────────────────────────────────
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
            {canAddNew ? (
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => onConfirm(query.trim())} style={[NB.row, { backgroundColor: 'rgba(255,68,68,0.1)', borderColor: 'rgba(255,68,68,0.3)' }]}>
                <Text style={{ color: T.red, fontWeight: '700', fontSize: 13 }}>＋ Add "{query.trim()}"</Text>
              </Pressable>
            ) : null}
            {filtered.map(name => (
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={name} onPress={() => onConfirm(name)} style={NB.row}>
                <Text style={{ color: T.text, fontWeight: '700', fontSize: 14 }}>{name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {query.trim() !== '' ? (
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => onConfirm(query.trim())} style={NB.confirmBtn}>
              <Text style={{ color: T.text, fontWeight: '800', fontSize: 16 }}>✓ CONFIRM</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const NB = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  box:        { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderRadius: 20, padding: 24, paddingBottom: 20, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', maxHeight: '80%' },
  title:      { color: T.red, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 1, marginBottom: 4 },
  sub:        { color: T.subtext, fontSize: 13, textAlign: 'center', marginBottom: 4 },
  sub2:       { color: T.text2, fontSize: 12, textAlign: 'center', marginBottom: 16 },
  input:      { backgroundColor: T.surface, borderWidth: 1.5, borderColor: 'rgba(255,68,68,0.35)', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, color: T.text, fontSize: 14, marginBottom: 10 },
  row:        { paddingVertical: 11, paddingHorizontal: 13, borderRadius: 9, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, marginBottom: 6 },
  confirmBtn: { backgroundColor: T.accent, borderRadius: 11, padding: 13, alignItems: 'center', marginTop: 8 },
})

// ── Bowler Change Modal ────────────────────────────────────────────────────────
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
      <View style={BC.overlay}><Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} style={{ flex: 1 }} onPress={onSkip} /></View>
      <View style={BC.sheet}>
        <View style={BC.handle} />
        <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 6 }}>🏏</Text>
        <Text style={BC.title}>OVER COMPLETE</Text>
        <Text style={BC.sub}>Select bowler for next over</Text>

        <TextInput style={BC.input} value={query} onChangeText={setQuery}
          placeholder="Search or type bowler name…" placeholderTextColor={T.muted}
          autoFocus returnKeyType="done" onSubmitEditing={() => query.trim() && onConfirm(query.trim())} />

        <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
          {canAddNew ? (
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => onConfirm(query.trim())} style={[BC.row, { backgroundColor: 'rgba(251,146,60,0.1)', borderColor: 'rgba(251,146,60,0.3)' }]}>
              <Text style={{ color: T.orange, fontWeight: '700', fontSize: 13 }}>＋ Add "{query.trim()}"</Text>
            </Pressable>
          ) : null}
          {filtered.map(name => (
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={name} onPress={() => onConfirm(name)} style={BC.row}>
              <Text style={{ color: T.text, fontWeight: '700', fontSize: 14 }}>{name}</Text>
            </Pressable>
          ))}
          {filtered.length === 0 && !canAddNew ? (
            <Text style={BC.empty}>
              {lastBowler ? `${lastBowler} cannot bowl consecutive overs.` : 'Type a bowler name above.'}
            </Text>
          ) : null}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={onSkip} style={BC.skipBtn}>
            <Text style={{ color: T.subtext, fontWeight: '700', fontSize: 14 }}>Skip</Text>
          </Pressable>
          {query.trim() !== '' ? (
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => onConfirm(query.trim())} style={BC.confirmBtn}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>✓ SET BOWLER</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const BC = StyleSheet.create({
  overlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
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

// ── Scorecard Tab ─────────────────────────────────────────────────────────────
function ScorecardTab({ match }: { match: any }) {
  const [activeInn, setActiveInn] = useState<'innings1' | 'innings2'>('innings1')
  const inn = match[activeInn]
  const hs  = Math.max(...(inn.battingStats ?? []).map((p: BattingStats) => p.runs), 0)

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border }}>
        {(['innings1', 'innings2'] as const).map(k => (
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={k} onPress={() => setActiveInn(k)}
            style={[SC.tab, activeInn === k && { borderBottomWidth: 2, borderBottomColor: T.accent }]}>
            <Text style={[SC.tabTxt, activeInn === k && { color: T.accent }]}>
              {match[k].battingTeam || (k === 'innings1' ? match.team1 : match.team2)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: T.border }}>
        <Text style={SC.scoreText}>{inn.runs}/{inn.wickets}</Text>
        <Text style={SC.oversText}>({fmtOv(inn.balls)} ov)</Text>
      </View>

      <View style={SC.tableHeader}>
        {['BATTER','R','B','4s','6s','SR'].map((h, i) => (
          <Text key={h} style={[SC.th, i === 0 && { flex: 2, textAlign: 'left' }]}>{h}</Text>
        ))}
      </View>
      {(inn.battingStats ?? []).map((p: BattingStats, i: number) => (
        <View key={i} style={[SC.row, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.02)' }]}>
          <Text style={[SC.td, { flex: 2, textAlign: 'left', color: p.runs === hs ? T.gold : T.text }]} numberOfLines={1}>{p.name}</Text>
          <Text style={[SC.td, { color: p.runs >= 50 ? T.gold : T.text, fontWeight: '700' }]}>{p.runs}{p.isOut ? '' : '*'}</Text>
          <Text style={SC.td}>{p.balls}</Text>
          <Text style={[SC.td, { color: T.accent }]}>{p.fours}</Text>
          <Text style={[SC.td, { color: T.purple }]}>{p.sixes}</Text>
          <Text style={SC.td}>{p.balls > 0 ? (p.runs / p.balls * 100).toFixed(0) : '—'}</Text>
        </View>
      ))}
      <View style={[SC.row, { backgroundColor: T.goldDim + '33', borderTopWidth: 1, borderTopColor: T.gold + '44' }]}>
        <Text style={[SC.td, { flex: 3, textAlign: 'left', color: T.gold, fontWeight: '800' }]}>TOTAL</Text>
        <Text style={[SC.td, { flex: 3, textAlign: 'right', color: T.gold, fontWeight: '800', fontSize: 14 }]}>{inn.runs}/{inn.wickets} ({fmtOv(inn.balls)})</Text>
      </View>

      <View style={[SC.tableHeader, { backgroundColor: '#181c28', marginTop: 4 }]}>
        {['BOWLER','O','R','W','ECO'].map((h, i) => (
          <Text key={h} style={[SC.th, { color: T.purple }, i === 0 && { flex: 2, textAlign: 'left' }]}>{h}</Text>
        ))}
      </View>
      {(inn.bowlingStats ?? []).map((b: BowlingStats, i: number) => (
        <View key={i} style={[SC.row, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.02)' }]}>
          <Text style={[SC.td, { flex: 2, textAlign: 'left', color: b.wickets >= 3 ? T.purple : T.text2 }]} numberOfLines={1}>{b.name}</Text>
          <Text style={SC.td}>{fmtOv(b.balls)}</Text>
          <Text style={SC.td}>{b.runs}</Text>
          <Text style={[SC.td, { color: b.wickets > 0 ? T.purple : T.muted, fontWeight: '700' }]}>{b.wickets}</Text>
          <Text style={[SC.td, { color: b.balls > 0 && b.runs / (b.balls / 6) <= 6 ? T.accent : T.text2 }]}>
            {b.balls > 0 ? (b.runs / (b.balls / 6)).toFixed(2) : '—'}
          </Text>
        </View>
      ))}
    </ScrollView>
  )
}

const SC = StyleSheet.create({
  tab:        { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabTxt:     { color: T.muted, fontWeight: '700', fontSize: 13 },
  scoreText:  { fontSize: 36, fontWeight: '700', color: T.text, fontVariant: ['tabular-nums'] },
  oversText:  { fontSize: 12, color: T.subtext },
  tableHeader:{ flexDirection: 'row', backgroundColor: T.card, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: T.border },
  th:         { flex: 1, textAlign: 'right', fontSize: 10, color: T.gold, fontWeight: '800', letterSpacing: 0.8 },
  row:        { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  td:         { flex: 1, textAlign: 'right', fontSize: 12, color: T.text2, fontVariant: ['tabular-nums'] },
})

// ── Ball by Ball Tab ───────────────────────────────────────────────────────────
function BallByBallTab({ match }: { match: any }) {
  const innings = [match.innings2, match.innings1].filter((i: any) => i?.battingTeam && (i.ballByBall?.length ?? 0) > 0)
  const [activeIdx, setActiveIdx] = useState(0)
  const current = innings[activeIdx]

  if (!current) return (
    <View style={{ alignItems: 'center', padding: 60 }}>
      <Text style={{ fontSize: 36, marginBottom: 12 }}>📻</Text>
      <Text style={{ color: T.text2, fontWeight: '700' }}>No balls bowled yet</Text>
    </View>
  )

  const overs: Ball[][] = []
  let legal = 0
  ;(current.ballByBall as Ball[]).forEach((b: Ball) => {
    const isExtra = b.isWide || b.isNoBall
    if (!isExtra) legal++
    const idx = Math.max(0, Math.floor((legal - (isExtra ? 0 : 1)) / 6))
    if (!overs[idx]) overs[idx] = []
    overs[idx].push(b)
  })

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {innings.length > 1 ? (
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border }}>
          {innings.map((inn: any, i: number) => (
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={i} onPress={() => setActiveIdx(i)}
              style={[SC.tab, activeIdx === i && { borderBottomColor: T.gold }]}>
              <Text style={[SC.tabTxt, activeIdx === i && { color: T.gold }]}>{inn.battingTeam}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {[...overs].reverse().map((balls, ri) => {
        const overNum = overs.length - 1 - ri
        const overRuns = balls.reduce((s: number, b: Ball) => s + (b.runs ?? 0), 0)
        const overWkts = balls.filter((b: Ball) => b.isWicket).length
        return (
          <View key={overNum} style={{ borderBottomWidth: 1, borderBottomColor: T.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, paddingHorizontal: 14, backgroundColor: T.card }}>
              <Text style={{ color: T.gold, fontWeight: '800', fontSize: 12 }}>Over {overNum + 1}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {balls.map((b: Ball, i: number) => <BallDot key={i} ball={b} size={24} />)}
              </View>
              <Text style={{ color: T.text2, fontSize: 11, fontVariant: ['tabular-nums'] }}>
                {overRuns}r{overWkts > 0 ? ` · ${overWkts}W` : ''}
              </Text>
            </View>
            {[...balls].reverse().map((ball: Ball, bi: number) => {
              let desc = `${ball.batsmanName ?? 'Batsman'} — ${ball.runs} run${ball.runs !== 1 ? 's' : ''}`
              if (ball.isWicket) desc = `OUT! ${ball.batsmanName} — ${ball.wicketType ?? 'dismissed'}`
              if (ball.isWide)   desc = `Wide${ball.runs > 1 ? ` (+${ball.runs})` : ''}`
              if (ball.isNoBall) desc = `No Ball${ball.runs > 0 ? ` +${ball.runs}` : ''}`
              if (ball.runs === 6 && !ball.isWide && !ball.isNoBall) desc = `SIX! ${ball.batsmanName} hits ${ball.bowlerName}`
              if (ball.runs === 4 && !ball.isWide && !ball.isNoBall) desc = `FOUR! ${ball.batsmanName}`
              return (
                <View key={bi} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' }, ball.isWicket && { backgroundColor: 'rgba(255,68,68,0.05)' }]}>
                  <BallDot ball={ball} size={26} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: ball.isWicket ? T.red : T.text, fontWeight: ball.isWicket ? '700' : '400' }}>{desc}</Text>
                    {ball.bowlerName && !ball.isWide && !ball.isNoBall ? (
                      <Text style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>b {ball.bowlerName}</Text>
                    ) : null}
                  </View>
                </View>
              )
            })}
          </View>
        )
      })}
    </ScrollView>
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
  // ✅ store full player objects for rich picker display
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([])

  // Scoring state
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

  // Modals
  const [picker,         setPicker]         = useState<'striker' | 'nonStriker' | 'bowler' | null>(null)
  const [newBatsmanOpen, setNewBatsmanOpen] = useState(false)
  const [overChangeOpen, setOverChangeOpen] = useState(false)
  const [pendingBall,    setPendingBall]    = useState<any>(null)

  const legalBallsRef = useRef(0)

  const fetchMatch = useCallback(async () => {
    try {
      const token = await getToken()
      const res = await fetch(apiUrl(`/api/matches/${id}`), { headers: authHeaders(token) })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setMatch(data)
    } catch { setError('Failed to load match') }
    finally { setFetching(false) }
  }, [id])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  // ✅ Load full player objects for rich picker
  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      const res = await fetch(apiUrl('/api/players'), { headers: authHeaders(token) })
      if (res.ok) {
        const data = await res.json() as PlayerInfo[]
        setAllPlayers(data)
      }
    }
    load().catch(() => {})
  }, [])

  // Auto-init players when match loads
  useEffect(() => {
    if (!match) return
    const inningsKey = match.status === 'innings1' ? 'innings1' : 'innings2'
    const inn = match[inningsKey]
    const active = (inn?.battingStats ?? []).filter((p: any) => !p.isOut)
    if (!striker && active[0]) setStriker(active[0].name)
    if (!nonStriker && active[1]) setNonStriker(active[1].name)
    if (!bowlerName && inn?.bowlingStats?.length) setBowlerName(inn.bowlingStats.slice(-1)[0].name)
  }, [match])

  if (fetching) return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={T.red} size="large" />
    </View>
  )
  if (error || !match) return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center', padding: 40 }]}>
      <Text style={{ color: T.red, fontSize: 16, marginBottom: 20 }}>{error || 'Match not found'}</Text>
      <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => navigation.goBack()} style={{ padding: 12, backgroundColor: T.redDim, borderRadius: 10 }}>
        <Text style={{ color: T.text, fontWeight: '700' }}>← Go Back</Text>
      </Pressable>
    </View>
  )

  const inningsKey  = match.status === 'innings1' ? 'innings1' : 'innings2'
  const innings     = match[inningsKey]
  const isInnings2  = match.status === 'innings2'
  const target      = isInnings2 ? match.innings1.runs + 1 : null

  const WICKET_TYPES = ['Wicket','Caught','Bowled','Stumped','RunOut(Striker)','RunOut(Non-Striker)','LBW','Hit-Wicket']
  const ASSIST_TYPES = ['Caught','Stumped','RunOut(Striker)','RunOut(Non-Striker)']

  const battingTeamPlayers = innings.battingTeam === match.team1 ? match.team1Players : match.team2Players
  const bowlingTeamPlayers = innings.battingTeam === match.team1 ? match.team2Players : match.team1Players

  // ✅ extract names from full player objects
  const allPlayerNames = allPlayers.map(p => p.name)
  const knownBatters = [...new Set([
    ...(battingTeamPlayers ?? []),
    ...(innings.battingStats?.map((p: any) => p.name) ?? []),
    ...allPlayerNames,
  ])].filter(Boolean) as string[]
  const knownBowlers = [...new Set([
    ...(bowlingTeamPlayers ?? []),
    ...(innings.bowlingStats?.map((p: any) => p.name) ?? []),
    ...allPlayerNames,
  ])].filter(Boolean) as string[]
  const existingBowlers = (innings.bowlingStats?.map((p: any) => p.name) ?? []) as string[]

  const legalBalls   = (innings.ballByBall ?? []).filter((b: Ball) => !b.isWide && !b.isNoBall)
  const overBallNum  = legalBalls.length % 6
  let thisBalls: Ball[] = []
  let lc = 0
  for (let i = (innings.ballByBall ?? []).length - 1; i >= 0; i--) {
    const b = innings.ballByBall[i] as Ball
    thisBalls.unshift(b)
    if (!b.isWide && !b.isNoBall) {
      lc++
      if (lc >= overBallNum && overBallNum > 0) break
      if (overBallNum === 0) break
    }
  }
  const currentOverBalls = overBallNum === 0 ? [] : thisBalls
  const overRuns  = currentOverBalls.reduce((s: number, b: Ball) => s + (b.runs ?? 0), 0)
  const overWkts  = currentOverBalls.filter((b: Ball) => b.isWicket).length

  const strikerStats    = innings.battingStats?.find((p: any) => p.name === striker)
  const nonStrikerStats = innings.battingStats?.find((p: any) => p.name === nonStriker)
  const bowlerStats     = innings.bowlingStats?.find((p: any) => p.name === bowlerName)
  const okEnabled       = runs !== null && !loading

  // ── POST ball to API ──────────────────────────────────────────────────────
  const postBall = async (ballData: any) => {
    try {
      setLoading(true)
      const token = await getToken()
      const res = await fetch(apiUrl(`/api/matches/${id}/ball`), {
        method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(ballData)})
      if (!res.ok) throw new Error('Failed to record ball')
      const data = await res.json()
      setMatch(data)
      if (data.status === 'completed') {
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MatchReport', params: { id } }] }))
      }
    } catch { Alert.alert('Error', 'Failed to record ball') }
    finally { setLoading(false) }
  }

  const submitBall = (ballData: any, nextBatsman: string | null) => {
    const beforeLegal = legalBalls.length
    const isLegal     = !ballData.isWide && !ballData.isNoBall

    postBall(ballData)

    if (isLegal && ballData.runs % 2 !== 0) {
      setStriker(nonStriker); setNonStriker(striker)
    }
    if (ballData.isWicket && nextBatsman) setStriker(nextBatsman)
    if (isLegal && (beforeLegal + 1) % 6 === 0) {
      const tmp = striker; setStriker(nonStriker); setNonStriker(tmp)
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
      extraRuns: wide || noBall ? (match.wideRuns ?? match.noBallRuns ?? 1) : 0,
      batsmanName: striker, bowlerName}
    if (wicket) { setPendingBall(ball); setNewBatsmanOpen(true) }
    else submitBall(ball, null)
  }

  const handleUndo = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const res = await fetch(apiUrl(`/api/matches/${id}/undo`), { method: 'POST', headers: jsonHeaders(token) })
      if (!res.ok) throw new Error()
      setMatch(await res.json())
    } catch { Alert.alert('Undo', 'Nothing to undo') }
    finally { setLoading(false) }
  }

  const handleEndInnings = () => {
    Alert.alert('End Innings', 'Are you sure you want to end this innings?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Innings', style: 'destructive', onPress: async () => {
        try {
          setLoading(true)
          const token = await getToken()
          const newStatus = match.status === 'innings1' ? 'innings2' : 'completed'
          const res = await fetch(apiUrl(`/api/matches/${id}`), {
            method: 'PUT', headers: jsonHeaders(token),
            body: JSON.stringify({ ...match, status: newStatus })})
          if (!res.ok) throw new Error()
          setMatch(await res.json())
        } catch { await fetchMatch() }
        finally { setLoading(false) }
      }},
    ])
  }

  const TABS = [
    { key: 'scoring',    icon: '🏏', label: 'Scoring' },
    { key: 'scorecard',  icon: '📋', label: 'Scorecard' },
    { key: 'ballbyball', icon: '🎯', label: 'Ball×Ball' },
  ] as const

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* ── HEADER ── */}
      <View style={S.header}>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={{ color: T.text2, fontSize: 18, fontWeight: '600' }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>{match.team1} vs {match.team2}</Text>
          <Text style={S.headerSub}>{match.overs} overs · {match.status === 'completed' ? '✅ Completed' : '🟢 Live'}</Text>
        </View>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={handleUndo} disabled={loading} style={S.undoBtn}>
          <Text style={S.undoBtnTxt}>UNDO</Text>
        </Pressable>
      </View>

      {/* ── CONTENT ── */}
      <View style={{ flex: 1 }}>
        {tab === 'scoring' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">

            {/* Score header */}
            <View style={S.scoreCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={S.scoreSub}>{innings.battingTeam} · Innings {isInnings2 ? 2 : 1}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={S.scoreMain}>{innings.runs}</Text>
                    <Text style={S.scoreWkt}>/{innings.wickets}</Text>
                  </View>
                  <Text style={S.scoreOv}>({fmtOv(innings.balls)} ov){isInnings2 && target ? ` · Need ${Math.max(0, target - innings.runs)} off ${match.overs * 6 - innings.balls} balls` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={S.rateLabel}>CRR</Text>
                  <Text style={S.rateVal}>{calcCRR(innings.runs, innings.balls)}</Text>
                  {isInnings2 && target ? (
                    <>
                      <Text style={[S.rateLabel, { color: T.gold }]}>RRR</Text>
                      <Text style={[S.rateVal, { color: T.gold, fontSize: 18 }]}>{calcRRR(target, innings.runs, innings.balls, match.overs)}</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Batter/Bowler card */}
            <View style={S.playerCard}>
              <View style={S.playerCardHeader}>
                <Text style={[S.colHdr, { flex: 1, textAlign: 'left' }]}>BATTER</Text>
                {['R','B','SR'].map(h => <Text key={h} style={S.colHdr}>{h}</Text>)}
              </View>
              {/* Striker */}
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => setPicker('striker')} style={S.playerRow}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent }} />
                  <Text style={[S.playerName, !striker && { color: T.muted, fontSize: 13 }]} numberOfLines={1}>
                    {striker || 'Tap to set striker ✎'}{striker ? ' *' : ''}
                  </Text>
                </View>
                <Text style={S.statCell}>{strikerStats?.runs ?? 0}</Text>
                <Text style={S.statCell}>{strikerStats?.balls ?? 0}</Text>
                <Text style={S.statCell}>{(strikerStats?.balls ?? 0) > 0 ? Math.round(strikerStats.runs / strikerStats.balls * 100) : '—'}</Text>
              </Pressable>
              {/* Non-striker */}
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => setPicker('nonStriker')} style={S.playerRow}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.muted }} />
                  <Text style={[S.playerName, { color: T.text2 }, !nonStriker && { color: T.muted, fontSize: 13 }]} numberOfLines={1}>
                    {nonStriker || 'Tap to set non-striker ✎'}
                  </Text>
                </View>
                <Text style={S.statCell}>{nonStrikerStats?.runs ?? 0}</Text>
                <Text style={S.statCell}>{nonStrikerStats?.balls ?? 0}</Text>
                <Text style={S.statCell}>{(nonStrikerStats?.balls ?? 0) > 0 ? Math.round(nonStrikerStats.runs / nonStrikerStats.balls * 100) : '—'}</Text>
              </Pressable>
              {/* Bowler */}
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => setPicker('bowler')} style={[S.playerRow, { backgroundColor: 'rgba(251,146,60,0.04)' }]}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={{ fontSize: 10, color: T.orange, fontWeight: '800' }}>BOWL</Text>
                  <Text style={[S.playerName, { color: T.orange }, !bowlerName && { color: T.muted, fontSize: 13 }]} numberOfLines={1}>
                    {bowlerName || 'Tap to set bowler ✎'}
                  </Text>
                </View>
                <Text style={S.statCell}>{fmtOv(bowlerStats?.balls ?? 0)}</Text>
                <Text style={S.statCell}>{bowlerStats?.runs ?? 0}</Text>
                <Text style={[S.statCell, { color: T.red, fontWeight: '700' }]}>{bowlerStats?.wickets ?? 0}W</Text>
              </Pressable>
            </View>

            {/* This over */}
            <View style={S.overCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 10, color: T.muted, fontWeight: '800', letterSpacing: 1 }}>THIS OVER · {fmtOv(innings.balls)}</Text>
                {currentOverBalls.length > 0 ? (
                  <Text style={{ fontSize: 11, color: T.subtext, fontWeight: '700' }}>{overRuns}R{overWkts > 0 ? ` · ${overWkts}W` : ''}</Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 30 }}>
                {currentOverBalls.length === 0
                  ? <Text style={{ color: T.muted, fontSize: 12 }}>No balls yet</Text>
                  : currentOverBalls.map((b: Ball, i: number) => <BallDot key={i} ball={b} />)}
              </View>
            </View>

            {/* Extras */}
            <View style={S.extrasRow}>
              {[{ key: 'wide', label: 'Wide', active: wide, toggle: () => setWide(v => !v), color: T.sky },
                { key: 'noBall', label: 'No Ball', active: noBall, toggle: () => setNoBall(v => !v), color: T.orange }].map(e => (
                <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={e.key} onPress={e.toggle} style={[S.extraBtn, e.active && { backgroundColor: e.color + '18' }]}>
                  <View style={[S.extraCheck, { borderColor: e.active ? e.color : T.muted }, e.active && { backgroundColor: e.color + '33' }]}>
                    {e.active ? <Text style={{ fontSize: 13, color: e.color }}>✓</Text> : null}
                  </View>
                  <Text style={[S.extraLabel, { color: e.active ? e.color : T.subtext }]}>{e.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Run buttons */}
            <View style={S.runRow}>
              {[0,1,2,3,4,5,6].map(r => {
                const sel = runs === r
                const clr = r === 4 ? T.accent : r === 6 ? T.purple : T.red
                const dim = r === 4 ? T.accentDim : r === 6 ? T.purpleDim : T.redDim
                return (
                  <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={r} onPress={() => setRuns(r)}
                    style={[S.runBtn, sel && { backgroundColor: dim, borderColor: clr }]}>
                    <Text style={[S.runBtnTxt, { color: sel ? clr : T.subtext }]}>{r}</Text>
                  </Pressable>
                )
              })}
            </View>

            {/* Wicket + OK */}
            <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 8 }}>
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => { setWicket(w => !w); if (!wicket && runs === null) setRuns(0) }}
                style={[S.wicketBtn, wicket && { backgroundColor: 'rgba(127,29,29,0.7)', borderColor: T.red }]}>
                <Text style={{ fontSize: 18 }}>{wicket ? '💀' : '🏏'}</Text>
                <Text style={[S.wicketBtnTxt, wicket && { color: T.red }]}>{wicket ? 'W ON' : 'WICKET'}</Text>
              </Pressable>

              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => { if (wicket) setShowWktMenu(v => !v) }} style={[S.wicketTypeBtn, wicket && { backgroundColor: 'rgba(127,29,29,0.25)', borderColor: T.red + '44' }]}>
                <Text style={{ color: wicket ? T.red : T.text2, fontWeight: '700', fontSize: 14 }}>{wicketType}</Text>
                {wicket ? <Text style={{ color: T.red, fontSize: 10 }}>▼</Text> : null}
              </Pressable>

              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={handleOK} disabled={!okEnabled}
                style={[S.okBtn, okEnabled && { backgroundColor: T.accent, borderColor: T.red, shadowColor: '#cc0000', shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 6 }]}>
                {loading ? <ActivityIndicator color={T.text} size="small" /> : <Text style={[S.okBtnTxt, { color: okEnabled ? T.text : T.muted }]}>OK</Text>}
              </Pressable>
            </View>

            {/* Wicket type dropdown */}
            {showWktMenu && wicket ? (
              <View style={S.wktDropdown}>
                {WICKET_TYPES.map(type => (
                  <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={type} onPress={() => { setWicketType(type); setAssistName(''); setShowWktMenu(false) }}
                    style={[S.wktItem, wicketType === type && { backgroundColor: 'rgba(255,68,68,0.15)' }]}>
                    <Text style={{ color: wicketType === type ? T.red : T.text2, fontWeight: '700', fontSize: 15 }}>{type}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Assist field */}
            {wicket && ASSIST_TYPES.includes(wicketType) ? (
              <View style={{ marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(127,29,29,0.12)', borderRadius: 11, padding: 10, borderWidth: 1, borderColor: 'rgba(255,68,68,0.15)' }}>
                <Text style={{ fontSize: 10, color: T.red, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }}>
                  {wicketType.startsWith('RunOut') ? '⚡ RUN OUT BY' : wicketType === 'Stumped' ? '🧤 STUMPED BY' : '🙌 CAUGHT BY'}
                </Text>
                <TextInput value={assistName} onChangeText={setAssistName}
                  placeholder="Fielder / keeper name…" placeholderTextColor={T.muted}
                  style={{ backgroundColor: T.surface, borderRadius: 9, padding: 8, paddingHorizontal: 12, color: T.text, fontSize: 13, borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)' }} />
                {innings.bowlingStats?.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {innings.bowlingStats.map((p: any) => (
                      <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={p.name} onPress={() => setAssistName(p.name)}
                        style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1 }, assistName === p.name ? { backgroundColor: 'rgba(255,68,68,0.25)', borderColor: T.accent + '55' } : { backgroundColor: T.border2, borderColor: T.border }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: assistName === p.name ? T.red : T.subtext }}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 8 }}>
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => { setStriker(nonStriker); setNonStriker(striker) }} style={S.actionBtn}>
                <Text style={S.actionBtnTxt}>⇄ SWITCH BAT</Text>
              </Pressable>
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={handleEndInnings} style={S.actionBtn}>
                <Text style={S.actionBtnTxt}>END INNINGS</Text>
              </Pressable>
            </View>

          </ScrollView>
        )}

        {tab === 'scorecard'  && <ScorecardTab  match={match} />}
        {tab === 'ballbyball' && <BallByBallTab match={match} />}
      </View>

      {/* ── BOTTOM TABS ── */}
      <View style={S.bottomTabs}>
        {TABS.map(t => (
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={t.key} onPress={() => setTab(t.key)} style={S.bottomTab}>
            {tab === t.key ? <View style={S.bottomTabIndicator} /> : null}
            <Text style={{ fontSize: 20 }}>{t.icon}</Text>
            <Text style={[S.bottomTabLabel, tab === t.key && { color: T.accent }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── MODALS ── */}
      {/* ✅ all 3 pickers now pass allPlayerInfo for rich display */}
      <PlayerPicker
        visible={picker === 'striker'} onClose={() => setPicker(null)}
        onSelect={n => { setStriker(n); setPicker(null) }}
        title="SET STRIKER" accentColor={T.accent}
        players={knownBatters} allPlayerInfo={allPlayers}
      />
      <PlayerPicker
        visible={picker === 'nonStriker'} onClose={() => setPicker(null)}
        onSelect={n => { setNonStriker(n); setPicker(null) }}
        title="SET NON-STRIKER" accentColor={T.sky}
        players={knownBatters} allPlayerInfo={allPlayers}
      />
      <PlayerPicker
        visible={picker === 'bowler'} onClose={() => setPicker(null)}
        onSelect={n => { setBowlerName(n); setPicker(null) }}
        title="SET BOWLER" accentColor={T.orange}
        players={knownBowlers} allPlayerInfo={allPlayers}
      />

      <NewBatsmanModal
        visible={newBatsmanOpen} outName={striker} wicketType={pendingBall?.wicketType}
        players={knownBatters.filter(n => n !== striker && n !== nonStriker)}
        onConfirm={name => { setNewBatsmanOpen(false); submitBall(pendingBall, name); setPendingBall(null) }}
      />

      <BowlerChangeModal
        visible={overChangeOpen}
        players={existingBowlers.length > 0 ? existingBowlers : knownBowlers}
        lastBowler={bowlerName}
        onConfirm={name => { setBowlerName(name); setOverChangeOpen(false) }}
        onSkip={() => setOverChangeOpen(false)}
      />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 36, paddingBottom: 12, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn:     { width: 34, height: 34, borderRadius: 9, backgroundColor: T.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: T.text, fontWeight: '700', fontSize: 16, letterSpacing: 0.5 },
  headerSub:   { color: T.subtext, fontSize: 10, fontWeight: '700' },
  undoBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border },
  undoBtnTxt:  { color: T.text2, fontWeight: '700', fontSize: 13, letterSpacing: 1 },

  scoreCard:  { margin: 10, marginBottom: 0, backgroundColor: '#0f1929', borderWidth: 1, borderColor: T.border, borderRadius: 14, padding: 12 },
  scoreSub:   { fontSize: 11, color: T.subtext, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  scoreMain:  { fontSize: 38, fontWeight: '700', color: T.text, lineHeight: 40, fontVariant: ['tabular-nums'] },
  scoreWkt:   { fontSize: 24, color: T.subtext, fontVariant: ['tabular-nums'] },
  scoreOv:    { fontSize: 11, color: T.subtext, marginTop: 3 },
  rateLabel:  { fontSize: 10, color: T.red, fontWeight: '800', letterSpacing: 1, textAlign: 'right' },
  rateVal:    { fontSize: 26, fontWeight: '700', color: T.text, textAlign: 'right', fontVariant: ['tabular-nums'] },

  playerCard:       { marginHorizontal: 12, marginTop: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 12, overflow: 'hidden' },
  playerCardHeader: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 4, backgroundColor: T.border2, borderBottomWidth: 1, borderBottomColor: T.border2 },
  colHdr:           { width: 44, textAlign: 'center', fontSize: 10, color: T.muted, fontWeight: '800' },
  playerRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border2 },
  playerName:       { color: T.text, fontWeight: '800', fontSize: 14, flex: 1 },
  statCell:         { width: 44, textAlign: 'center', fontSize: 13, color: T.subtext, fontVariant: ['tabular-nums'] },

  overCard: { marginHorizontal: 12, marginTop: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.border2, borderRadius: 12, padding: 10, paddingHorizontal: 14 },

  extrasRow:  { flexDirection: 'row', marginHorizontal: 12, marginTop: 8, backgroundColor: T.card, borderWidth: 1, borderColor: T.border2, borderRadius: 12, overflow: 'hidden', justifyContent: 'space-around' },
  extraBtn:   { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 5, padding: 10 },
  extraCheck: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  extraLabel: { fontSize: 11, fontWeight: '800' },

  runRow:    { flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 8 },
  runBtn:    { flex: 1, height: 46, borderRadius: 12, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, alignItems: 'center', justifyContent: 'center' },
  runBtnTxt: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },

  wicketBtn:     { width: 82, borderRadius: 11, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 2 },
  wicketBtnTxt:  { color: T.subtext, fontSize: 13, fontWeight: '700' },
  wicketTypeBtn: { flex: 1, minHeight: 58, borderRadius: 11, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  okBtn:         { width: 64, borderRadius: 11, backgroundColor: T.card, borderWidth: 2, borderColor: T.muted, alignItems: 'center', justifyContent: 'center' },
  okBtnTxt:      { fontSize: 20, fontWeight: '800' },
  wktDropdown:   { marginHorizontal: 12, marginTop: 4, backgroundColor: T.surface, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: 12, overflow: 'hidden', zIndex: 300 },
  wktItem:       { paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.border2 },

  actionBtn:    { flex: 1, height: 40, borderRadius: 10, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  actionBtnTxt: { color: T.subtext, fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },

  bottomTabs:         { flexDirection: 'row', backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border },
  bottomTab:          { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 3, position: 'relative' },
  bottomTabIndicator: { position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, backgroundColor: T.accent, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  bottomTabLabel:     { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: T.muted },
})