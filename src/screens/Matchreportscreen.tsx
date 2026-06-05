// src/screens/MatchReportScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Match Report + Rich Share (Image + Text + WhatsApp/Telegram/etc.)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, Share,
  StyleSheet, ActivityIndicator, StatusBar, Platform,
  Alert, Modal, Linking, Dimensions,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl } from '../services/api'
import type { RootStackParamList } from '../types'

// ── ViewShot for image capture ────────────────────────────────────────────────
// Install: npm install react-native-view-shot
// (falls back gracefully if not installed – image share will show an error)
let ViewShot: any = null
let captureRef: any = null
try {
  const vs = require('react-native-view-shot')
  ViewShot = vs.default
  captureRef = vs.captureRef
} catch (_) {}

type Route = RouteProp<RootStackParamList, 'MatchReport'>
type Nav = NativeStackNavigationProp<RootStackParamList>

// ── Types ─────────────────────────────────────────────────────────────────────
interface BatStat {
  name: string; runs: number; balls: number; fours: number; sixes: number
  isOut: boolean; wicketType?: string; bowlerName?: string
}
interface BowlStat {
  name: string; overs?: number; balls: number; runs: number
  wickets: number; wides?: number; noBalls?: number
}
interface FallOfWicket { wicketNum: number; runs: number; balls: number; batsmanName: string }
interface Innings {
  battingTeam: string; runs: number; wickets: number; balls: number
  battingStats: BatStat[]; bowlingStats: BowlStat[]
  extras?: { wides?: number; noBalls?: number; byes?: number; legByes?: number; total?: number }
  fallOfWickets?: FallOfWicket[]
}
interface MatchData {
  _id: string; team1: string; team2: string; overs: number
  tossWinner?: string; battingFirst?: string; result?: string
  innings1: Innings; innings2: Innings; status: string
  createdAt?: string; venue?: string; matchType?: string
  manOfTheMatch?: string
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: '#060d18', surface: '#0d1526', card: '#111d30',
  card2: '#0f1a2a', border: '#1a2d45', border2: '#152238',
  accent: '#10b981', accentDim: '#064e3b',
  gold: '#f59e0b', goldDim: '#451a03',
  red: '#ef4444', redDim: '#450a0a',
  orange: '#fb923c', sky: '#38bdf8',
  purple: '#a78bfa', purpleDim: '#2e1065',
  teal: '#2dd4bf', pink: '#f472b6',
  text: '#f1f5f9', text2: '#cbd5e1', sub: '#94a3b8', muted: '#475569',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtOv  = (b: number) => `${Math.floor(b / 6)}.${b % 6}`
const getSR  = (r: number, b: number) => b === 0 ? '—' : (r / b * 100).toFixed(1)
const getEco = (r: number, b: number) => b === 0 ? '—' : (r / (b / 6)).toFixed(2)
const fmtDate = (d?: string) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Build text report ─────────────────────────────────────────────────────────
function buildTextReport(match: MatchData): string {
  const inn1 = match.innings1
  const inn2 = match.innings2
  const pad  = (s: string, n: number) => s.slice(0, n).padEnd(n)
  const div  = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  const thin = '────────────────────────────────────'

  const batSection = (inn: Innings) => {
    const lines: string[] = []
    lines.push(`  ${'BATTER'.padEnd(18)} ${'R'.padStart(4)} ${'B'.padStart(4)} ${'4s'.padStart(3)} ${'6s'.padStart(3)} ${'SR'.padStart(6)}`)
    lines.push(`  ${thin.slice(0, 42)}`)
    ;(inn.battingStats || []).forEach(p => {
      const sr = p.balls > 0 ? (p.runs / p.balls * 100).toFixed(0) : '0'
      lines.push(`  ${pad(p.name + (p.isOut ? '' : '*'), 18)} ${String(p.runs).padStart(4)} ${String(p.balls).padStart(4)} ${String(p.fours).padStart(3)} ${String(p.sixes).padStart(3)} ${sr.padStart(6)}`)
      if (p.isOut && p.wicketType) {
        const desc = p.bowlerName ? `    ${p.wicketType} b ${p.bowlerName}` : `    ${p.wicketType}`
        lines.push(desc.slice(0, 44))
      }
    })
    const ex = inn.extras
    if (ex) {
      const total = ex.total ?? ((ex.wides || 0) + (ex.noBalls || 0) + (ex.byes || 0) + (ex.legByes || 0))
      lines.push(`  ${thin.slice(0, 42)}`)
      lines.push(`  ${'Extras'.padEnd(18)} ${String(total).padStart(4)}  (W:${ex.wides||0} NB:${ex.noBalls||0} B:${ex.byes||0} LB:${ex.legByes||0})`)
    }
    lines.push(`  ${thin.slice(0, 42)}`)
    lines.push(`  ${'TOTAL'.padEnd(18)} ${String(inn.runs).padStart(4)}/${inn.wickets}  (${fmtOv(inn.balls)} ov)`)
    if (inn.fallOfWickets?.length) {
      lines.push(``)
      lines.push(`  Fall of Wickets:`)
      const fow = inn.fallOfWickets.map(f => `${f.wicketNum}-${f.runs}(${f.batsmanName})`).join('  ')
      lines.push(`  ${fow}`)
    }
    return lines.join('\n')
  }

  const bowlSection = (inn: Innings) => {
    const lines: string[] = []
    lines.push(`  ${'BOWLER'.padEnd(18)} ${'O'.padStart(5)} ${'R'.padStart(4)} ${'W'.padStart(3)} ${'ECO'.padStart(6)}`)
    lines.push(`  ${thin.slice(0, 40)}`)
    ;(inn.bowlingStats || []).forEach(b => {
      const eco = b.balls > 0 ? (b.runs / (b.balls / 6)).toFixed(1) : '0.0'
      lines.push(`  ${pad(b.name, 18)} ${fmtOv(b.balls).padStart(5)} ${String(b.runs).padStart(4)} ${String(b.wickets).padStart(3)} ${eco.padStart(6)}`)
    })
    return lines.join('\n')
  }

  const lines = [
    `🏏 CrickyWorld — Official Match Report`,
    div,
    ``,
    `  📍 ${match.team1.toUpperCase()} vs ${match.team2.toUpperCase()}`,
    `  🗓  ${fmtDate(match.createdAt)}  |  ${match.overs} Overs${match.venue ? `  |  ${match.venue}` : ''}`,
    ``,
    div,
    ``,
    `  1st Innings: ${inn1.battingTeam}   ${inn1.runs}/${inn1.wickets}  (${fmtOv(inn1.balls)} ov)`,
    `  2nd Innings: ${inn2.battingTeam}   ${inn2.runs}/${inn2.wickets}  (${fmtOv(inn2.balls)} ov)`,
    ``,
    match.result ? `  🏆  ${match.result}` : '',
    match.manOfTheMatch ? `  ⭐  Man of the Match: ${match.manOfTheMatch}` : '',
    ``,
    div,
    ``,
    `📋  ${inn1.battingTeam.toUpperCase()} — BATTING`,
    ``,
    batSection(inn1),
    ``,
    `🎳  BOWLING vs ${inn1.battingTeam.toUpperCase()}`,
    ``,
    bowlSection(inn2),
    ``,
    div,
    ``,
    `📋  ${inn2.battingTeam?.toUpperCase() || ''} — BATTING`,
    ``,
    batSection(inn2),
    ``,
    `🎳  BOWLING vs ${inn2.battingTeam?.toUpperCase() || ''}`,
    ``,
    bowlSection(inn1),
    ``,
    div,
    `Shared via CrickyWorld 🏏  |  Score. Share. Celebrate.`,
  ]
  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORECARD IMAGE TEMPLATE (rendered via ViewShot)
// ─────────────────────────────────────────────────────────────────────────────
function ScorecardImage({ match, forwardRef }: { match: MatchData; forwardRef?: any }) {
  const inn1 = match.innings1
  const inn2 = match.innings2
  const w = Math.min(Dimensions.get('window').width - 32, 400)

  const BatRow = ({ p }: { p: BatStat }) => (
    <View style={[IMG.row, { borderBottomColor: 'rgba(255,255,255,0.05)' }]}>
      <View style={{ flex: 2.2 }}>
        <Text style={IMG.playerName} numberOfLines={1}>{p.name}{p.isOut ? '' : '*'}</Text>
        {p.isOut && p.wicketType
          ? <Text style={IMG.dismissal} numberOfLines={1}>{p.wicketType}{p.bowlerName ? ` b ${p.bowlerName}` : ''}</Text>
          : !p.isOut ? <Text style={[IMG.dismissal, { color: T.accent }]}>not out</Text> : null}
      </View>
      <Text style={[IMG.stat, { color: p.runs >= 50 ? T.gold : T.text2, fontWeight: '700' }]}>{p.runs}</Text>
      <Text style={IMG.stat}>{p.balls}</Text>
      <Text style={[IMG.stat, { color: T.accent }]}>{p.fours}</Text>
      <Text style={[IMG.stat, { color: T.purple }]}>{p.sixes}</Text>
      <Text style={IMG.stat}>{p.balls > 0 ? (p.runs / p.balls * 100).toFixed(0) : '—'}</Text>
    </View>
  )

  const BowlRow = ({ b }: { b: BowlStat }) => (
    <View style={[IMG.row, { borderBottomColor: 'rgba(255,255,255,0.05)' }]}>
      <Text style={[IMG.playerName, { flex: 2.2, color: b.wickets >= 3 ? T.purple : T.text2 }]} numberOfLines={1}>{b.name}</Text>
      <Text style={IMG.stat}>{fmtOv(b.balls)}</Text>
      <Text style={IMG.stat}>{b.runs}</Text>
      <Text style={[IMG.stat, { color: b.wickets > 0 ? T.purple : T.muted, fontWeight: '700' }]}>{b.wickets}</Text>
      <Text style={[IMG.stat, { color: b.balls > 0 && b.runs / (b.balls / 6) <= 6 ? T.accent : T.sub }]}>
        {b.balls > 0 ? (b.runs / (b.balls / 6)).toFixed(1) : '—'}
      </Text>
    </View>
  )

  const InningsSection = ({ inn, bowlingInn, label }: { inn: Innings; bowlingInn: Innings; label: string }) => {
    const ex = inn.extras
    const extTotal = ex ? (ex.total ?? ((ex.wides || 0) + (ex.noBalls || 0) + (ex.byes || 0) + (ex.legByes || 0))) : 0

    return (
      <View style={{ marginBottom: 12 }}>
        {/* Innings header */}
        <View style={IMG.innHeader}>
          <Text style={IMG.innLabel}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={IMG.innScore}>{inn.runs}/{inn.wickets}</Text>
            <Text style={IMG.innOvers}>({fmtOv(inn.balls)} ov)</Text>
          </View>
        </View>

        {/* Batting */}
        <View style={IMG.tableSection}>
          <View style={IMG.tableHead}>
            {['BATTER', 'R', 'B', '4s', '6s', 'SR'].map((h, i) => (
              <Text key={h} style={[IMG.th, i === 0 && { flex: 2.2, textAlign: 'left', color: T.gold }]}>{h}</Text>
            ))}
          </View>
          {(inn.battingStats || []).map((p, i) => <BatRow key={i} p={p} />)}
          {extTotal > 0 && (
            <View style={IMG.row}>
              <Text style={[IMG.playerName, { flex: 2.2 }]}>Extras</Text>
              <Text style={[IMG.stat, { flex: 4, textAlign: 'left', color: T.sub, fontSize: 10 }]}>
                {extTotal} (W:{ex?.wides||0} NB:{ex?.noBalls||0} B:{ex?.byes||0} LB:{ex?.legByes||0})
              </Text>
            </View>
          )}
          <View style={[IMG.row, { backgroundColor: 'rgba(245,158,11,0.07)', borderTopWidth: 0.5, borderTopColor: 'rgba(245,158,11,0.3)' }]}>
            <Text style={[IMG.playerName, { flex: 2.2, color: T.gold, fontWeight: '700' }]}>TOTAL</Text>
            <Text style={[IMG.stat, { flex: 4, textAlign: 'left', color: T.gold, fontWeight: '700', fontSize: 12 }]}>
              {inn.runs}/{inn.wickets}  ({fmtOv(inn.balls)} ov)
            </Text>
          </View>
        </View>

        {/* Fall of Wickets */}
        {inn.fallOfWickets && inn.fallOfWickets.length > 0 && (
          <View style={[IMG.tableSection, { padding: 10, backgroundColor: 'rgba(255,255,255,0.02)' }]}>
            <Text style={{ fontSize: 9, color: T.muted, fontWeight: '800', letterSpacing: 1, marginBottom: 6 }}>FALL OF WICKETS</Text>
            <Text style={{ fontSize: 10, color: T.sub, lineHeight: 16 }}>
              {inn.fallOfWickets.map(f => `${f.wicketNum}-${f.runs}(${f.batsmanName})`).join('  ')}
            </Text>
          </View>
        )}

        {/* Bowling */}
        <View style={[IMG.tableSection, { marginTop: 4 }]}>
          <View style={[IMG.tableHead, { backgroundColor: '#0d1826' }]}>
            {['BOWLER', 'O', 'R', 'W', 'ECO'].map((h, i) => (
              <Text key={h} style={[IMG.th, { color: T.purple }, i === 0 && { flex: 2.2, textAlign: 'left' }]}>{h}</Text>
            ))}
          </View>
          {(bowlingInn.bowlingStats || []).map((b, i) => <BowlRow key={i} b={b} />)}
        </View>
      </View>
    )
  }

  const inner = (
    <View style={{ width: w, backgroundColor: T.bg, padding: 14, borderRadius: 16 }}>
      {/* Header band */}
      <View style={{ backgroundColor: '#0b1628', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: T.border }}>
        {/* Logo row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 18 }}>🏏</Text>
            <Text style={{ color: T.accent, fontWeight: '800', fontSize: 13, letterSpacing: 1 }}>CRICKYWORLD</Text>
          </View>
          {match.createdAt && <Text style={{ color: T.muted, fontSize: 10 }}>{fmtDate(match.createdAt)}</Text>}
        </View>

        {/* Teams */}
        <Text style={{ color: T.text, fontWeight: '800', fontSize: 18, textAlign: 'center', letterSpacing: 0.5, marginBottom: 2 }}>
          {match.team1} vs {match.team2}
        </Text>
        <Text style={{ color: T.sub, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
          {match.overs} Overs{match.venue ? `  ·  ${match.venue}` : ''}
          {match.matchType ? `  ·  ${match.matchType}` : ''}
        </Text>

        {/* Scores */}
        {[inn1, inn2].map((inn, i) => (
          <View key={i} style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 7,
            borderTopWidth: i === 0 ? 0.5 : 0.5,
            borderTopColor: i === 0 ? T.border : T.border,
            borderBottomWidth: i === 1 ? 0 : 0,
          }}>
            <Text style={{ color: T.text2, fontWeight: '700', fontSize: 13 }}>{inn.battingTeam}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ color: T.text, fontWeight: '800', fontSize: 20 }}>{inn.runs}/{inn.wickets}</Text>
              <Text style={{ color: T.sub, fontSize: 11 }}>({fmtOv(inn.balls)})</Text>
            </View>
          </View>
        ))}

        {/* Result */}
        {match.result && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ color: T.gold, fontWeight: '800', fontSize: 13, textAlign: 'center' }}>🏆 {match.result}</Text>
          </View>
        )}
        {match.manOfTheMatch && (
          <Text style={{ color: T.sky, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            ⭐ Man of the Match: {match.manOfTheMatch}
          </Text>
        )}
      </View>

      {/* Innings scorecards */}
      <InningsSection inn={inn1} bowlingInn={inn2} label={`1st Innings · ${inn1.battingTeam}`} />
      {inn2.battingTeam ? (
        <InningsSection inn={inn2} bowlingInn={inn1} label={`2nd Innings · ${inn2.battingTeam}`} />
      ) : null}

      {/* Footer */}
      <Text style={{ color: T.muted, fontSize: 9, textAlign: 'center', marginTop: 6, letterSpacing: 0.5 }}>
        Score. Share. Celebrate.  ·  CrickyWorld
      </Text>
    </View>
  )

  if (ViewShot && forwardRef) {
    return (
      <ViewShot ref={forwardRef} options={{ format: 'png', quality: 0.95 }}>
        {inner}
      </ViewShot>
    )
  }
  return inner
}

const IMG = StyleSheet.create({
  innHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#0b1628', borderRadius: 8, marginBottom: 4 },
  innLabel:     { color: T.sub, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  innScore:     { color: T.text, fontSize: 18, fontWeight: '800' },
  innOvers:     { color: T.sub, fontSize: 10 },
  tableSection: { borderRadius: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: T.border, marginBottom: 4 },
  tableHead:    { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#0f1a28', borderBottomWidth: 0.5, borderBottomColor: T.border },
  th:           { flex: 1, textAlign: 'right', fontSize: 9, color: T.muted, fontWeight: '800', letterSpacing: 0.6 },
  row:          { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: 0.5, alignItems: 'center' },
  playerName:   { color: T.text, fontWeight: '600', fontSize: 11, flex: 1 },
  dismissal:    { color: T.muted, fontSize: 9, marginTop: 1 },
  stat:         { flex: 1, textAlign: 'right', fontSize: 11, color: T.sub, fontFamily: 'monospace' },
})

// ─────────────────────────────────────────────────────────────────────────────
// SHARE OPTIONS MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ShareModal({
  visible, onClose, onShareText, onShareImage, isCapturing,
}: {
  visible: boolean; onClose: () => void
  onShareText: () => void; onShareImage: () => void
  isCapturing: boolean
}) {
  const APPS = [
    { icon: '💬', label: 'WhatsApp', action: 'whatsapp' },
    { icon: '✈️', label: 'Telegram', action: 'telegram' },
    { icon: '📧', label: 'Email', action: 'email' },
    { icon: '📤', label: 'Others', action: 'other' },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={SM.backdrop} onPress={onClose} />
      <View style={SM.sheet}>
        <View style={SM.handle} />
        <Text style={SM.title}>SHARE MATCH REPORT</Text>

        {/* Share format */}
        <View style={SM.formatRow}>
          {/* Image */}
          <Pressable onPress={onShareImage} disabled={isCapturing} style={[SM.formatBtn, { borderColor: T.accent + '66', backgroundColor: T.accentDim + '44' }]}>
            {isCapturing
              ? <ActivityIndicator color={T.accent} size="small" />
              : <Text style={{ fontSize: 28 }}>🖼️</Text>}
            <Text style={[SM.fmtLabel, { color: T.accent }]}>Image</Text>
            <Text style={SM.fmtSub}>Best for social</Text>
          </Pressable>

          {/* Text */}
          <Pressable onPress={onShareText} style={[SM.formatBtn, { borderColor: T.sky + '66', backgroundColor: '#0e2740' }]}>
            <Text style={{ fontSize: 28 }}>📄</Text>
            <Text style={[SM.fmtLabel, { color: T.sky }]}>Text</Text>
            <Text style={SM.fmtSub}>Quick & universal</Text>
          </Pressable>
        </View>

        {/* App shortcuts */}
        <Text style={SM.sectionHdr}>SHARE VIA</Text>
        <View style={SM.appRow}>
          {APPS.map(app => (
            <Pressable key={app.action} onPress={() => onShareText()} style={SM.appBtn}>
              <Text style={{ fontSize: 24 }}>{app.icon}</Text>
              <Text style={SM.appLabel}>{app.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={onClose} style={SM.cancelBtn}>
          <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const SM = StyleSheet.create({
  backdrop:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: T.border },
  handle:     { width: 40, height: 4, backgroundColor: T.muted, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  title:      { color: T.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center', marginBottom: 16 },
  formatRow:  { flexDirection: 'row', gap: 12, marginBottom: 20 },
  formatBtn:  { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 16, alignItems: 'center', gap: 6 },
  fmtLabel:   { fontWeight: '800', fontSize: 15 },
  fmtSub:     { color: T.muted, fontSize: 11 },
  sectionHdr: { color: T.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
  appRow:     { flexDirection: 'row', gap: 8, marginBottom: 20 },
  appBtn:     { flex: 1, borderRadius: 12, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, padding: 12, alignItems: 'center', gap: 5 },
  appLabel:   { color: T.text2, fontSize: 11, fontWeight: '700' },
  cancelBtn:  { padding: 13, borderRadius: 12, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
})

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function MatchReportScreen() {
  const route      = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const { id }     = route.params

  const [match,       setMatch]       = useState<MatchData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [shareOpen,   setShareOpen]   = useState(false)
  const [capturing,   setCapturing]   = useState(false)
  const [activeInn,   setActiveInn]   = useState<'innings1' | 'innings2'>('innings1')

  const shotRef = useRef<any>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const token = await AsyncStorage.getItem('token').catch(() => null)
        const res   = await fetch(apiUrl(`/api/matches/${id}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        setMatch(await res.json() as MatchData)
      } catch { /* handled by !match check */ }
      finally   { setLoading(false) }
    }
    load()
  }, [id])

  // ── Capture image ─────────────────────────────────────────────────────────
  const handleShareImage = async () => {
    if (!match) return
    if (!captureRef || !shotRef.current) {
      Alert.alert('Image Share Unavailable', 'Install react-native-view-shot to enable image sharing.\n\nnpm install react-native-view-shot', [
        { text: 'Share as Text', onPress: handleShareText },
        { text: 'OK', style: 'cancel' },
      ])
      return
    }
    try {
      setCapturing(true)
      const uri = await captureRef(shotRef.current, { format: 'png', quality: 0.95 })
      await Share.share({
        url: uri,
        message: `${match.team1} vs ${match.team2} — ${match.result || 'Match Report'}\nGenerated by CrickyWorld 🏏`,
        title: `${match.team1} vs ${match.team2} — CrickyWorld`,
      })
    } catch (e: any) {
      if (!e?.message?.includes('cancel')) {
        Alert.alert('Error', 'Failed to generate image. Sharing as text instead.')
        handleShareText()
      }
    } finally {
      setCapturing(false)
      setShareOpen(false)
    }
  }

  // ── Share text ────────────────────────────────────────────────────────────
  const handleShareText = async () => {
    if (!match) return
    try {
      await Share.share({
        message: buildTextReport(match),
        title: `${match.team1} vs ${match.team2} — CrickyWorld`,
      })
    } catch { /* user cancelled */ }
    setShareOpen(false)
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={T.accent} size="large" />
    </View>
  )
  if (!match) return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center', padding: 40 }]}>
      <Text style={{ fontSize: 40, marginBottom: 16 }}>⚠️</Text>
      <Text style={{ color: T.red, fontWeight: '700', fontSize: 15 }}>Match not found</Text>
      <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => navigation.goBack()}
        style={{ marginTop: 20, padding: 13, borderRadius: 11, backgroundColor: T.card, borderWidth: 1, borderColor: T.border }}>
        <Text style={{ color: T.text, fontWeight: '700' }}>← Go back</Text>
      </Pressable>
    </View>
  )

  const inn1 = match.innings1
  const inn2 = match.innings2
  const activeInnings = match[activeInn]

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-components
  // ─────────────────────────────────────────────────────────────────────────
  const BatTable = ({ inn }: { inn: Innings }) => {
    const ex = inn.extras
    const extTotal = ex ? (ex.total ?? ((ex.wides || 0) + (ex.noBalls || 0) + (ex.byes || 0) + (ex.legByes || 0))) : 0
    const hs = Math.max(...(inn.battingStats || []).map(p => p.runs), 0)
    return (
      <View style={S.table}>
        <View style={S.tableHead}>
          {['BATTER', 'R', 'B', '4s', '6s', 'SR'].map((h, i) => (
            <Text key={h} style={[S.th, i === 0 && { flex: 2.5, textAlign: 'left', color: T.gold }]}>{h}</Text>
          ))}
        </View>
        {(inn.battingStats || []).map((p, i) => {
          const isHS = p.runs === hs && p.runs > 0
          return (
            <View key={i} style={[S.tableRow, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.015)' }]}>
              <View style={{ flex: 2.5 }}>
                <Text style={[S.playerName, isHS && { color: T.gold }]} numberOfLines={1}>
                  {p.name}{p.isOut ? '' : '*'}
                </Text>
                {p.isOut && p.wicketType
                  ? <Text style={S.dismissal} numberOfLines={1}>{p.wicketType}{p.bowlerName ? ` b ${p.bowlerName}` : ''}</Text>
                  : !p.isOut ? <Text style={[S.dismissal, { color: T.accent }]}>not out</Text> : null}
              </View>
              <Text style={[S.statCell, { color: p.runs >= 50 ? T.gold : T.text2, fontWeight: '700' }]}>{p.runs}</Text>
              <Text style={S.statCell}>{p.balls}</Text>
              <Text style={[S.statCell, { color: T.accent }]}>{p.fours}</Text>
              <Text style={[S.statCell, { color: T.purple }]}>{p.sixes}</Text>
              <Text style={S.statCell}>{getSR(p.runs, p.balls)}</Text>
            </View>
          )
        })}
        {extTotal > 0 && (
          <View style={[S.tableRow, { backgroundColor: 'rgba(255,255,255,0.015)' }]}>
            <Text style={[S.playerName, { flex: 2.5 }]}>Extras</Text>
            <Text style={[S.statCell, { flex: 5, textAlign: 'left', color: T.sub, fontSize: 11 }]}>
              {extTotal} (W:{ex?.wides||0} NB:{ex?.noBalls||0} B:{ex?.byes||0} LB:{ex?.legByes||0})
            </Text>
          </View>
        )}
        <View style={[S.tableRow, { backgroundColor: 'rgba(245,158,11,0.06)', borderTopWidth: 0.5, borderTopColor: 'rgba(245,158,11,0.3)' }]}>
          <Text style={[S.playerName, { flex: 2.5, color: T.gold, fontWeight: '800' }]}>TOTAL</Text>
          <Text style={[S.statCell, { flex: 5, textAlign: 'left', color: T.gold, fontWeight: '800', fontSize: 13 }]}>
            {inn.runs}/{inn.wickets}  ({fmtOv(inn.balls)} ov)
          </Text>
        </View>
      </View>
    )
  }

  const BowlTable = ({ inn }: { inn: Innings }) => (
    <View style={[S.table, { marginTop: 6 }]}>
      <View style={[S.tableHead, { backgroundColor: '#0d1826' }]}>
        {['BOWLER', 'O', 'R', 'W', 'ECO'].map((h, i) => (
          <Text key={h} style={[S.th, { color: T.purple }, i === 0 && { flex: 2.5, textAlign: 'left' }]}>{h}</Text>
        ))}
      </View>
      {(inn.bowlingStats || []).map((b, i) => (
        <View key={i} style={[S.tableRow, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.015)' }]}>
          <Text style={[S.playerName, { flex: 2.5, color: b.wickets >= 3 ? T.purple : T.text2 }]} numberOfLines={1}>{b.name}</Text>
          <Text style={S.statCell}>{fmtOv(b.balls)}</Text>
          <Text style={S.statCell}>{b.runs}</Text>
          <Text style={[S.statCell, { color: b.wickets > 0 ? T.purple : T.muted, fontWeight: '700' }]}>{b.wickets}</Text>
          <Text style={[S.statCell, { color: b.balls > 0 && b.runs / (b.balls / 6) <= 6 ? T.accent : T.sub }]}>
            {getEco(b.runs, b.balls)}
          </Text>
        </View>
      ))}
    </View>
  )

  const FowRow = ({ inn }: { inn: Innings }) => {
    if (!inn.fallOfWickets?.length) return null
    return (
      <View style={S.fowCard}>
        <Text style={S.sectionLabel}>FALL OF WICKETS</Text>
        <Text style={{ color: T.sub, fontSize: 11, lineHeight: 18 }}>
          {inn.fallOfWickets.map(f => `${f.wicketNum}-${f.runs} (${f.batsmanName})`).join('  ·  ')}
        </Text>
      </View>
    )
  }

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* ── HEADER ── */}
      <View style={S.header}>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={() => navigation.goBack()} style={S.backBtn}>
          <Text style={{ color: T.sub, fontSize: 18 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle} numberOfLines={1}>{match.team1} vs {match.team2}</Text>
          <Text style={S.headerSub}>{match.overs} Overs · {fmtDate(match.createdAt)}</Text>
        </View>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={() => setShareOpen(true)} style={S.shareBtn}>
          <Text style={{ fontSize: 14 }}>📤</Text>
          <Text style={S.shareBtnTxt}>Share</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── SUMMARY CARD ── */}
        <View style={S.summaryCard}>
          {/* Teams + scores */}
          {[inn1, inn2].map((inn, i) => (
            <View key={i} style={[S.scoreRow, i === 0 && { borderBottomWidth: 0.5, borderBottomColor: T.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={S.teamName}>{inn.battingTeam}</Text>
                <Text style={{ color: T.muted, fontSize: 10 }}>{i === 0 ? '1st Innings' : '2nd Innings'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={S.teamScore}>{inn.runs}/{inn.wickets}</Text>
                <Text style={{ color: T.sub, fontSize: 11 }}>({fmtOv(inn.balls)} ov)</Text>
              </View>
            </View>
          ))}

          {/* Result */}
          {match.result && (
            <View style={S.resultBand}>
              <Text style={S.resultText}>🏆  {match.result}</Text>
            </View>
          )}

          {/* MOTM + meta row */}
          <View style={S.metaRow}>
            {match.manOfTheMatch && (
              <View style={S.motmBadge}>
                <Text style={{ fontSize: 14 }}>⭐</Text>
                <View>
                  <Text style={{ color: T.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }}>MAN OF THE MATCH</Text>
                  <Text style={{ color: T.sky, fontWeight: '700', fontSize: 13 }}>{match.manOfTheMatch}</Text>
                </View>
              </View>
            )}
            {match.tossWinner && (
              <Text style={{ color: T.muted, fontSize: 10 }}>🪙 {match.tossWinner} won toss</Text>
            )}
          </View>
        </View>

        {/* ── INNINGS TABS ── */}
        <View style={S.innTabs}>
          {(['innings1', 'innings2'] as const).map(k => {
            const inn = match[k]
            const active = activeInn === k
            return (
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.1)' }} key={k}
                onPress={() => setActiveInn(k)}
                style={[S.innTab, active && { borderBottomColor: T.accent, borderBottomWidth: 2 }]}>
                <Text style={[S.innTabTxt, active && { color: T.accent }]} numberOfLines={1}>
                  {inn.battingTeam || (k === 'innings1' ? match.team1 : match.team2)}
                </Text>
                <Text style={{ color: active ? T.accent : T.muted, fontSize: 12, fontWeight: '700' }}>
                  {inn.runs}/{inn.wickets}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* ── ACTIVE INNINGS DETAIL ── */}
        <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
          {/* Batting */}
          <Text style={S.sectionLabel}>🏏 {activeInnings.battingTeam} — BATTING</Text>
          <BatTable inn={activeInnings} />

          {/* Fall of wickets */}
          <FowRow inn={activeInnings} />

          {/* Bowling */}
          <Text style={[S.sectionLabel, { color: T.purple, marginTop: 14 }]}>
            🎳 BOWLING vs {activeInnings.battingTeam}
          </Text>
          <BowlTable inn={activeInn === 'innings1' ? inn2 : inn1} />
        </View>

        {/* ── OFF-SCREEN IMAGE TEMPLATE ── */}
        {/* Positioned off-screen so ViewShot can capture it */}
        <View style={{ position: 'absolute', left: -9999, top: 0 }}>
          <ScorecardImage match={match} forwardRef={shotRef} />
        </View>

      </ScrollView>

      {/* ── SHARE FAB ── */}
      <Pressable
        android_ripple={{ color: 'rgba(0,0,0,0.2)', radius: 28 }}
        onPress={() => setShareOpen(true)}
        style={S.fab}>
        <Text style={{ fontSize: 20 }}>📤</Text>
      </Pressable>

      {/* ── SHARE MODAL ── */}
      <ShareModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onShareText={handleShareText}
        onShareImage={handleShareImage}
        isCapturing={capturing}
      />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 50 : 36,
    paddingBottom: 12,
    backgroundColor: T.card,
    borderBottomWidth: 0.5, borderBottomColor: T.border,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: T.border2, borderWidth: 0.5, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: T.text, fontWeight: '700', fontSize: 16 },
  headerSub:   { color: T.sub, fontSize: 10, fontWeight: '600', marginTop: 1 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 9, backgroundColor: T.accentDim + '55',
    borderWidth: 1, borderColor: T.accent + '44',
  },
  shareBtnTxt: { color: T.accent, fontSize: 13, fontWeight: '800' },

  // Summary
  summaryCard: {
    margin: 12, backgroundColor: T.card,
    borderRadius: 16, borderWidth: 0.5, borderColor: T.border, overflow: 'hidden',
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  teamName: { color: T.text, fontWeight: '700', fontSize: 15 },
  teamScore: { color: T.text, fontWeight: '800', fontSize: 22, letterSpacing: -0.5 },
  resultBand: {
    backgroundColor: 'rgba(245,158,11,0.07)',
    borderTopWidth: 0.5, borderTopColor: 'rgba(245,158,11,0.25)',
    paddingVertical: 10, alignItems: 'center',
  },
  resultText: { color: T.gold, fontWeight: '800', fontSize: 14 },
  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 0.5, borderTopColor: T.border,
  },
  motmBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Innings tabs
  innTabs: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: T.border, backgroundColor: T.card },
  innTab: {
    flex: 1, paddingVertical: 11, paddingHorizontal: 14,
    alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  innTabTxt: { color: T.muted, fontWeight: '700', fontSize: 12, marginBottom: 2 },

  sectionLabel: { color: T.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },

  // Table
  table: { borderRadius: 10, overflow: 'hidden', borderWidth: 0.5, borderColor: T.border, marginBottom: 4 },
  tableHead: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: T.card2, borderBottomWidth: 0.5, borderBottomColor: T.border },
  th:        { flex: 1, textAlign: 'right', fontSize: 9, color: T.muted, fontWeight: '800', letterSpacing: 0.8 },
  tableRow:  { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
  playerName: { color: T.text, fontWeight: '600', fontSize: 12, flex: 1 },
  dismissal:  { color: T.muted, fontSize: 10, marginTop: 1 },
  statCell:   { flex: 1, textAlign: 'right', fontSize: 12, color: T.sub, fontFamily: 'monospace' },

  // Fall of wickets
  fowCard: {
    marginTop: 4, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10,
    borderWidth: 0.5, borderColor: T.border, padding: 10, marginBottom: 4,
  },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: T.accent, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
  },
})