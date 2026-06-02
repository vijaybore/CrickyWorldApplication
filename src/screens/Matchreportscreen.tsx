// src/screens/MatchreportScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Match Report + Rich Share
// Share includes: both scores, winner, top-3 batters & bowlers per team
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, Share,
  StyleSheet, ActivityIndicator, StatusBar, Platform,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl } from '../services/api'
import type { RootStackParamList } from '../types'

type Route = RouteProp<RootStackParamList, 'MatchReport'>
type Nav   = NativeStackNavigationProp<RootStackParamList>

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtOv  = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
const getSR  = (runs: number, balls: number) => balls === 0 ? '—' : ((runs / balls) * 100).toFixed(1)
const getEco = (runs: number, balls: number) => balls === 0 ? '—' : (runs / (balls / 6)).toFixed(2)
const pad    = (s: string, n: number) => s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)

interface BatStat  { name: string; runs: number; balls: number; fours: number; sixes: number; isOut: boolean; wicketType?: string; bowlerName?: string }
interface BowlStat { name: string; overs: number; balls: number; runs: number; wickets: number; wides: number; noBalls: number }
interface Innings  { battingTeam: string; runs: number; wickets: number; balls: number; battingStats: BatStat[]; bowlingStats: BowlStat[] }
interface MatchData {
  _id: string; team1: string; team2: string; overs: number
  tossWinner?: string; battingFirst?: string; result?: string
  innings1: Innings; innings2: Innings; status: string; createdAt?: string
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ title, color = '#555' }: { title: string; color?: string }) {
  return <Text style={[R.sectionLabel, { color }]}>{title}</Text>
}

// ── Batting table ─────────────────────────────────────────────────────────────
function BattingCard({ inn }: { inn: Innings }) {
  const rows = inn.battingStats || []
  const hs   = Math.max(...rows.map(p => p.runs), 0)
  return (
    <View style={R.tableWrap}>
      <View style={[R.tableRow, R.tableHeader]}>
        {['BATTER', 'R', 'B', '4s', '6s', 'SR'].map((h, i) => (
          <Text key={h} style={[R.th, i === 0 && { flex: 2, textAlign: 'left' }]}>{h}</Text>
        ))}
      </View>
      {rows.map((p, i) => {
        const sr = getSR(p.runs, p.balls)
        return (
          <View key={i} style={[R.tableRow, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.018)' }]}>
            <View style={{ flex: 2 }}>
              <Text style={[R.td, { textAlign: 'left', color: p.runs === hs ? '#f5c842' : '#f0f0f0', fontWeight: p.runs === hs ? '700' : '400' }]} numberOfLines={1}>{p.name}</Text>
              {p.isOut && p.wicketType ? (
                <Text style={{ fontSize: 9, color: '#444', textAlign: 'left' }} numberOfLines={1}>
                  {p.wicketType}{p.bowlerName ? ` b ${p.bowlerName}` : ''}
                </Text>
              ) : !p.isOut ? (
                <Text style={{ fontSize: 9, color: '#22c55e', textAlign: 'left' }}>not out</Text>
              ) : null}
            </View>
            <Text style={[R.td, { color: p.runs >= 50 ? '#f5c842' : '#e0e0e0', fontWeight: '700' }]}>{p.runs}{p.isOut ? '' : '*'}</Text>
            <Text style={R.td}>{p.balls}</Text>
            <Text style={[R.td, { color: '#4ade80' }]}>{p.fours}</Text>
            <Text style={[R.td, { color: '#c084fc' }]}>{p.sixes}</Text>
            <Text style={[R.td, { color: parseFloat(sr) >= 150 ? '#4ade80' : '#888' }]}>{sr}</Text>
          </View>
        )
      })}
      <View style={[R.tableRow, { backgroundColor: 'rgba(245,200,66,0.08)', borderTopWidth: 1, borderTopColor: 'rgba(245,200,66,0.3)' }]}>
        <Text style={[R.td, { flex: 3, textAlign: 'left', color: '#f5c842', fontWeight: '800' }]}>TOTAL</Text>
        <Text style={[R.td, { flex: 3, textAlign: 'right', color: '#f5c842', fontSize: 15, fontWeight: '800' }]}>{inn.runs}/{inn.wickets} ({fmtOv(inn.balls)})</Text>
      </View>
    </View>
  )
}

// ── Bowling table ─────────────────────────────────────────────────────────────
function BowlingCard({ inn }: { inn: Innings }) {
  const rows = inn.bowlingStats || []
  return (
    <View style={R.tableWrap}>
      <View style={[R.tableRow, R.tableHeader, { backgroundColor: '#181c28' }]}>
        {['BOWLER', 'O', 'R', 'W', 'ECO'].map((h, i) => (
          <Text key={h} style={[R.th, { color: '#b48aff' }, i === 0 && { flex: 2, textAlign: 'left' }]}>{h}</Text>
        ))}
      </View>
      {rows.map((b, i) => {
        const eco = getEco(b.runs, b.balls)
        return (
          <View key={i} style={[R.tableRow, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.018)' }]}>
            <Text style={[R.td, { flex: 2, textAlign: 'left', color: b.wickets >= 3 ? '#c084fc' : '#e0e0e0', fontWeight: b.wickets >= 3 ? '700' : '400' }]} numberOfLines={1}>{b.name}</Text>
            <Text style={R.td}>{fmtOv(b.balls)}</Text>
            <Text style={R.td}>{b.runs}</Text>
            <Text style={[R.td, { color: b.wickets > 0 ? '#c084fc' : '#555', fontWeight: '700' }]}>{b.wickets}</Text>
            <Text style={[R.td, { color: parseFloat(eco) <= 6 ? '#4ade80' : parseFloat(eco) >= 12 ? '#f87171' : '#888' }]}>{eco}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ── Build the rich share text ─────────────────────────────────────────────────
function buildShareText(match: MatchData): string {
  const inn1 = match.innings1
  const inn2 = match.innings2
  const div  = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  const thin = '──────────────────────────────'

  // Top-3 batters by runs
  const topBat = (inn: Innings) =>
    [...(inn.battingStats || [])]
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 3)

  // Top-3 bowlers by wickets (tie-break: fewer runs)
  const topBowl = (inn: Innings) =>
    [...(inn.bowlingStats || [])]
      .sort((a, b) => b.wickets !== a.wickets ? b.wickets - a.wickets : a.runs - b.runs)
      .slice(0, 3)

  const batLine = (p: BatStat) =>
    `  🏏 ${pad(p.name, 14)} ${String(p.runs).padStart(3)}${p.isOut ? '' : '*'} (${p.balls}b) ${p.fours > 0 ? `${p.fours}×4` : '   '} ${p.sixes > 0 ? `${p.sixes}×6` : ''}`

  const bowlLine = (b: BowlStat) =>
    `  🎳 ${pad(b.name, 14)} ${b.wickets}/${b.runs} (${fmtOv(b.balls)} ov)`

  const lines: string[] = [
    `🏏 CrickyWorld — Match Summary`,
    div,
    ``,
    `  ${match.team1.toUpperCase()} vs ${match.team2.toUpperCase()}`,
    `  ${match.overs} Overs`,
    ``,
    div,
    ``,
    // Inn1 score
    `  ${inn1.battingTeam}  →  ${inn1.runs}/${inn1.wickets}  (${fmtOv(inn1.balls)} ov)`,
    `  ${inn2.battingTeam}  →  ${inn2.runs}/${inn2.wickets}  (${fmtOv(inn2.balls)} ov)`,
    ``,
  ]

  if (match.result) {
    lines.push(`  🏆  ${match.result}`)
    lines.push(``)
  }

  lines.push(div)
  lines.push(``)

  // ── Team 1 highlights ──────────────────────────────────────────────────────
  lines.push(`📌 ${inn1.battingTeam.toUpperCase()} — BATTING`)
  topBat(inn1).forEach(p => lines.push(batLine(p)))
  lines.push(``)
  lines.push(`📌 ${inn1.battingTeam.toUpperCase()} — BOWLING (vs ${inn2.battingTeam})`)
  // Bowling stats are in inn2 (bowlers bowling against inn1's batting)
  topBowl(inn2).forEach(b => lines.push(bowlLine(b)))
  lines.push(``)
  lines.push(thin)
  lines.push(``)

  // ── Team 2 highlights ──────────────────────────────────────────────────────
  if (inn2.battingTeam) {
    lines.push(`📌 ${inn2.battingTeam.toUpperCase()} — BATTING`)
    topBat(inn2).forEach(p => lines.push(batLine(p)))
    lines.push(``)
    lines.push(`📌 ${inn2.battingTeam.toUpperCase()} — BOWLING (vs ${inn1.battingTeam})`)
    topBowl(inn1).forEach(b => lines.push(bowlLine(b)))
    lines.push(``)
  }

  lines.push(div)
  lines.push(`Shared via CrickyWorld 🏏`)

  return lines.join('\n')
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function MatchReportScreen() {
  const route      = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const { id }     = route.params

  const [match,   setMatch]   = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const token = await AsyncStorage.getItem('token').catch(() => null)
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
        const res  = await fetch(apiUrl(`/api/matches/${id}`), { headers })
        const data = await res.json()
        setMatch(data as MatchData)
      } catch { /* show error state */ }
      finally   { setLoading(false) }
    }
    load()
  }, [id])

  const handleShare = async () => {
    if (!match) return
    try {
      await Share.share({
        message: buildShareText(match),
        title:   `${match.team1} vs ${match.team2} — CrickyWorld`,
      })
    } catch { /* user cancelled */ }
  }

  if (loading) return (
    <View style={[R.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color="#ff4444" size="large" />
    </View>
  )

  if (!match) return (
    <View style={[R.root, { alignItems: 'center', justifyContent: 'center', padding: 40 }]}>
      <Text style={{ fontSize: 36, marginBottom: 12 }}>⚠️</Text>
      <Text style={{ color: '#f87171', fontWeight: '700', fontSize: 15 }}>Match not found</Text>
      <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }} onPress={() => navigation.goBack()}
        style={{ marginTop: 20, padding: 12, borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' }}>
        <Text style={{ color: '#f0f0f0', fontWeight: '700' }}>← Go back</Text>
      </Pressable>
    </View>
  )

  const inn1 = match.innings1
  const inn2 = match.innings2

  return (
    <View style={R.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f1a" />

      {/* Header */}
      <View style={R.header}>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={() => navigation.goBack()} style={R.backBtn}>
          <Text style={R.backTxt}>←</Text>
        </Pressable>
        <Text style={R.headerTitle} numberOfLines={1}>{match.team1} vs {match.team2}</Text>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={handleShare} style={R.shareBtn}>
          <Text style={R.shareTxt}>📤 Share</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={R.content} showsVerticalScrollIndicator={false}>

        {/* ── Summary card ──────────────────────────────────────────────── */}
        <View style={R.summaryCard}>
          <Text style={R.matchTitle}>{match.team1} vs {match.team2}</Text>
          <Text style={R.matchMeta}>{match.overs} Overs{match.tossWinner ? ` · ${match.tossWinner} won toss` : ''}</Text>

          {[inn1, inn2].map((inn, i) => (
            <View key={i} style={[R.scoreRow, i === 0 && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
              <Text style={R.scoreTeam}>{inn.battingTeam}</Text>
              <Text style={R.scoreRuns}>
                {inn.runs}/{inn.wickets}{' '}
                <Text style={R.scoreOvers}>({fmtOv(inn.balls)})</Text>
              </Text>
            </View>
          ))}

          {match.result ? (
            <View style={R.resultBox}>
              <Text style={R.resultText}>🏆 {match.result}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Share preview panel ──────────────────────────────────────────── */}
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
          onPress={handleShare} style={R.sharePanel}>
          <View style={R.sharePanelTop}>
            <Text style={R.sharePanelIcon}>📤</Text>
            <View style={{ flex: 1 }}>
              <Text style={R.sharePanelTitle}>Share Match Summary</Text>
              <Text style={R.sharePanelSub}>Scores · Winner · Top-3 Batters & Bowlers for each team</Text>
            </View>
            <View style={R.sharePanelBtn}>
              <Text style={R.sharePanelBtnTxt}>Share</Text>
            </View>
          </View>
          {/* Preview snippet */}
          <View style={R.sharePreview}>
            <Text style={R.sharePreviewTxt} numberOfLines={6}>
              {buildShareText(match)}
            </Text>
          </View>
        </Pressable>

        {/* ── 1st Innings ──────────────────────────────────────────────────── */}
        <SectionLabel title={`🏏 ${inn1.battingTeam} — Batting`} color="#ff4444" />
        <BattingCard inn={inn1} />
        <SectionLabel title={`🎳 Bowling vs ${inn1.battingTeam}`} color="#c084fc" />
        <BowlingCard inn={inn2} />

        {/* ── 2nd Innings ──────────────────────────────────────────────────── */}
        {inn2.battingTeam ? (
          <>
            <SectionLabel title={`🏏 ${inn2.battingTeam} — Batting`} color="#ff4444" />
            <BattingCard inn={inn2} />
            <SectionLabel title={`🎳 Bowling vs ${inn2.battingTeam}`} color="#c084fc" />
            <BowlingCard inn={inn1} />
          </>
        ) : null}

      </ScrollView>
    </View>
  )
}

const R = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f1a' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 50 : 36, paddingBottom: 14, backgroundColor: '#0b0f1a', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  backBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#151e2e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#94a3b8', fontSize: 18, fontWeight: '600' },
  headerTitle: { flex: 1, color: '#f1f5f9', fontWeight: '700', fontSize: 16 },
  shareBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(99,179,237,0.1)', borderWidth: 1, borderColor: 'rgba(99,179,237,0.25)' },
  shareTxt: { color: '#60a5fa', fontSize: 13, fontWeight: '800' },

  content: { padding: 14, paddingBottom: 60, gap: 0 },

  summaryCard: { backgroundColor: '#151e2e', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  matchTitle:  { color: '#f1f5f9', fontWeight: '700', fontSize: 18, marginBottom: 4 },
  matchMeta:   { color: '#94a3b8', fontSize: 12, marginBottom: 14 },
  scoreRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  scoreTeam:   { color: '#cbd5e1', fontWeight: '700', fontSize: 14 },
  scoreRuns:   { fontFamily: 'monospace', fontWeight: '700', fontSize: 20, color: '#f1f5f9' },
  scoreOvers:  { fontSize: 12, color: '#94a3b8', fontWeight: '400' },
  resultBox:   { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(245,158,11,0.25)' },
  resultText:  { color: '#f59e0b', fontWeight: '700', fontSize: 14 },

  // Share panel
  sharePanel: { backgroundColor: '#0f1a10', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)', marginBottom: 18, overflow: 'hidden' },
  sharePanelTop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  sharePanelIcon: { fontSize: 26 },
  sharePanelTitle: { color: '#f0f0f0', fontWeight: '700', fontSize: 14, marginBottom: 2 },
  sharePanelSub:   { color: '#555', fontSize: 11, lineHeight: 16 },
  sharePanelBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#22c55e' },
  sharePanelBtnTxt:{ color: '#fff', fontWeight: '800', fontSize: 12 },
  sharePreview:    { backgroundColor: '#050a06', padding: 12 },
  sharePreviewTxt: { color: '#3a5a3a', fontSize: 10, fontFamily: 'monospace', lineHeight: 16 },

  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 16, marginBottom: 8 },

  tableWrap: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: 8 },
  tableHeader: { backgroundColor: '#151e2e' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  th: { flex: 1, textAlign: 'right', fontSize: 10, color: '#f5c842', fontWeight: '800', letterSpacing: 0.8 },
  td: { flex: 1, textAlign: 'right', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' },
})
