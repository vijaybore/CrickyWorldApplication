// src/screens/OpenMatchScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FIX in this version:
//   Tapping the body of a match card (team names, scores — anywhere that
//   isn't an explicit action button) used to call onOpen for every match,
//   which for a completed match routed straight to the read-only
//   MatchReport screen. That meant there was no way to get back into a
//   finished match to fix a wrong last ball.
//
//   Now:
//     • Tapping the card BODY always opens the Scoring screen — even for
//       completed matches. ScoringScreen itself is read-only for normal
//       input (no run/wicket buttons) but keeps Undo available, so this is
//       exactly the "let me back in to fix the last ball" path.
//     • Tapping the explicit "Report" button is the ONLY way to reach the
//       read-only Report/Summary screen.
//     • The "Resume" button (for live matches) still opens Scoring, same
//       as before — unchanged.
//
// Also: Share button recolored from blue to the app's red accent family.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react'
import {
  View, Text, FlatList, Pressable,
  StyleSheet, RefreshControl, Alert, Share,
  ActivityIndicator, StatusBar,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLiveScores }  from '../hooks/useLiveScores'
import { useFavorites }   from '../hooks/useFavorites'
import { FavoriteToggle } from '../components/FavoriteToggle'
import { apiUrl }         from '../services/api'
import { getDeviceId } from '../services/deviceId'
import type { Match, BattingStats, BowlingStats, RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtDateTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart}, ${timePart}`
}

function fmtOvers(balls: number): string { return `${Math.floor(balls / 6)}.${balls % 6}` }
function sr(runs: number, balls: number)  { return balls > 0 ? ((runs / balls) * 100).toFixed(0) : '0' }
function eco(runs: number, balls: number) { return balls > 0 ? ((runs / balls) * 6).toFixed(1) : '0.0' }
function pad(s: string | number, n: number): string { return String(s).padEnd(n, ' ').slice(0, n) }
function rpad(s: string | number, n: number): string { return String(s).padStart(n, ' ').slice(-n) }

// ── Build rich text share card ────────────────────────────────────────────────
function buildShareText(match: Match): string {
  const inn1 = match.innings1
  const inn2 = match.innings2
  const t1   = inn1.battingTeam || match.team1
  const t2   = inn2.battingTeam || match.team2
  const divider = '─────────────────────────────'

  const lines: string[] = []
  lines.push('🏏 CrickyWorld Match Scorecard')
  lines.push(divider)
  lines.push(`  ${match.team1} vs ${match.team2}`)
  lines.push(`  ${match.overs} Overs`)
  if (match.createdAt) lines.push(`  Started: ${fmtDateTime(match.createdAt)}`)
  if (match.isCompleted) {
    const ended = match.completedAt || match.updatedAt
    if (ended) lines.push(`  Ended: ${fmtDateTime(ended)}`)
}
  lines.push(divider)

  lines.push(`\n🟥  ${t1.toUpperCase()}`)
  lines.push(`    ${inn1.runs}/${inn1.wickets}  (${inn1.overs} ov)  CRR: ${inn1.crr}`)

  const bat1 = [...(inn1.battingStats ?? [])]
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 3)
  if (bat1.length > 0) {
    lines.push(`\n  🏏 Batting`)
    lines.push(`  ${'Player'.padEnd(16)} ${'R'.padStart(4)} ${'B'.padStart(4)} ${'SR'.padStart(6)}`)
    bat1.forEach((b: BattingStats) => {
      const notOut = !b.isOut ? '*' : ' '
      lines.push(`  ${pad(b.name, 16)} ${rpad(b.runs + notOut, 4)} ${rpad(b.balls, 4)} ${rpad(sr(b.runs, b.balls), 6)}`)
    })
  }

  const bowl1 = [...(inn2.bowlingStats ?? [])]
    .sort((a, b) => b.wickets - a.wickets || (a.runs / Math.max(a.balls, 1)) - (b.runs / Math.max(b.balls, 1)))
    .slice(0, 3)
  if (bowl1.length > 0) {
    lines.push(`\n  🎳 Bowling`)
    lines.push(`  ${'Player'.padEnd(16)} ${'O'.padStart(5)} ${'W'.padStart(3)} ${'Eco'.padStart(5)}`)
    bowl1.forEach((b: BowlingStats) => {
      lines.push(`  ${pad(b.name, 16)} ${rpad(fmtOvers(b.balls), 5)} ${rpad(b.wickets, 3)} ${rpad(eco(b.runs, b.balls), 5)}`)
    })
  }

  lines.push('\n' + divider)

  lines.push(`\n🟦  ${t2.toUpperCase()}`)
  lines.push(`    ${inn2.runs}/${inn2.wickets}  (${inn2.overs} ov)  CRR: ${inn2.crr}`)

  const bat2 = [...(inn2.battingStats ?? [])]
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 3)
  if (bat2.length > 0) {
    lines.push(`\n  🏏 Batting`)
    lines.push(`  ${'Player'.padEnd(16)} ${'R'.padStart(4)} ${'B'.padStart(4)} ${'SR'.padStart(6)}`)
    bat2.forEach((b: BattingStats) => {
      const notOut = !b.isOut ? '*' : ' '
      lines.push(`  ${pad(b.name, 16)} ${rpad(b.runs + notOut, 4)} ${rpad(b.balls, 4)} ${rpad(sr(b.runs, b.balls), 6)}`)
    })
  }

  const bowl2 = [...(inn1.bowlingStats ?? [])]
    .sort((a, b) => b.wickets - a.wickets || (a.runs / Math.max(a.balls, 1)) - (b.runs / Math.max(b.balls, 1)))
    .slice(0, 3)
  if (bowl2.length > 0) {
    lines.push(`\n  🎳 Bowling`)
    lines.push(`  ${'Player'.padEnd(16)} ${'O'.padStart(5)} ${'W'.padStart(3)} ${'Eco'.padStart(5)}`)
    bowl2.forEach((b: BowlingStats) => {
      lines.push(`  ${pad(b.name, 16)} ${rpad(fmtOvers(b.balls), 5)} ${rpad(b.wickets, 3)} ${rpad(eco(b.runs, b.balls), 5)}`)
    })
  }

  if (match.result) {
    lines.push('\n' + divider)
    lines.push(`\n🏆  ${match.result.toUpperCase()}`)
    lines.push('')
  }

  lines.push(divider)
  lines.push('Shared via CrickyWorld 🏏')

  return lines.join('\n')
}

// ── Status config ─────────────────────────────────────────────────────────────
type FilterType = 'all' | 'live' | 'completed'

const STATUS_CONFIG: Record<string, { text: string; color: string; bg: string }> = {
  setup:     { text: 'Setup',     color: '#888',    bg: 'rgba(136,136,136,0.12)' },
  innings1:  { text: 'Live',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  innings2:  { text: 'Live',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  completed: { text: 'Completed', color: '#facc15', bg: 'rgba(250,204,21,0.10)'  },
}

// ── Match Card ────────────────────────────────────────────────────────────────
interface MatchCardProps {
  match:    Match
  onOpen:   (m: Match) => void
  onReport: (m: Match) => void
  onDetails:(m: Match) => void
  onDelete: (id: string) => void
  onShare:  (m: Match) => void
  deleting: string | null
}

function MatchCard({ match, onOpen, onReport, onDetails, onDelete, onShare, deleting }: MatchCardProps) {
  const st     = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.setup
  const isLive = match.status === 'innings1' || match.status === 'innings2'
  const isDone = match.status === 'completed'

  const startedAt = fmtDateTime(match.createdAt)
  const endedAt   = isDone ? fmtDateTime(match.completedAt || match.updatedAt) : ''
  return (
    <Pressable
      android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
      onPress={() => onOpen(match)}
      style={styles.card}
    >
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.teamsRow}>
            <Text style={styles.teamsText} numberOfLines={1}>
              {match.team1} <Text style={styles.vsText}>vs</Text> {match.team2}
            </Text>
            <View style={styles.favRow}>
              <FavoriteToggle team={match.team1} size={15} />
              <FavoriteToggle team={match.team2} size={15} />
            </View>
          </View>
          <Text style={styles.metaText}>
            {match.overs} overs · {match.battingFirst} batted first
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[styles.statusText, { color: st.color }]}>{st.text}</Text>
        </View>
      </View>

      {/* Scores */}
      <View style={styles.scoresRow}>
        {[match.innings1, match.innings2].map((inn, i) => (
          <View key={i} style={styles.scoreBox}>
            <Text style={styles.scoreTeam} numberOfLines={1}>
              {inn.battingTeam || (i === 0 ? match.team1 : match.team2)}
            </Text>
            <Text style={styles.scoreRuns}>{inn.runs}/{inn.wickets}</Text>
            <Text style={styles.scoreOvers}>({inn.overs} ov)</Text>
          </View>
        ))}
      </View>

      {/* Result */}
      {isDone && match.result !== '' && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>🏆 {match.result}</Text>
        </View>
      )}

      {/* Start / End timestamps */}
      {(startedAt || endedAt) && (
        <View style={styles.timeBox}>
          {startedAt && (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>▶ Started</Text>
              <Text style={styles.timeValue}>{startedAt}</Text>
            </View>
          )}
          {endedAt && (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>⏹ Ended</Text>
              <Text style={styles.timeValue}>{endedAt}</Text>
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.timeText}>{timeAgo(match.createdAt)}</Text>
        <View style={styles.actionsRow}>
          {/* Details */}
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={() => onDetails(match)} style={styles.detailsBtn}>
            <Text style={styles.detailsBtnText}>📊</Text>
          </Pressable>
          {/* Resume (live) opens Scoring directly, same as tapping the
              card body. Report (done) is now its own distinct button —
              the ONLY way to reach the read-only report — so it no
              longer overlaps with "tap the card to keep editing". */}
          {isLive ? (
            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              onPress={() => onOpen(match)}
              style={[styles.openBtn, styles.openBtnLive]}>
              <Text style={styles.openBtnText}>▶ Resume</Text>
            </Pressable>
          ) : (
            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              onPress={() => onReport(match)}
              style={[styles.openBtn, styles.openBtnDone]}>
              <Text style={styles.openBtnText}>📋 Report</Text>
            </Pressable>
          )}
          {/* Share — recolored to the app's red accent, matching theme */}
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={() => onShare(match)} style={styles.shareBtn}>
            <Text style={styles.shareBtnText}>📤 Share</Text>
          </Pressable>
          {/* Delete */}
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={() => onDelete(match.id)} disabled={deleting === match.id}
            style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>{deleting === match.id ? '⏳' : '🗑'}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function OpenMatchScreen() {
  const navigation = useNavigation<Nav>()
  const { isFavorite } = useFavorites()
  const { matches: allMatches, loading, refreshing, error, refresh } =
    useLiveScores({ pollInterval: 20000 })
  const [filter,   setFilter]   = useState<FilterType>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = allMatches.filter(m => {
    if (filter === 'live')      return m.isLive
    if (filter === 'completed') return m.isCompleted
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const af = isFavorite(a.team1) || isFavorite(a.team2)
    const bf = isFavorite(b.team1) || isFavorite(b.team2)
    if (af && !bf) return -1
    if (!af && bf) return 1
    return (
      new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
      new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()
    )
  })

  // ── FIX: tapping the card body (or "Resume") ALWAYS opens Scoring,
  // even for a completed match. ScoringScreen itself decides what's
  // editable — full input for live matches, Undo-only for completed
  // ones — so this is the single path back into a finished match to
  // fix a wrong last ball and have the result recalculate.
  const handleOpen = (match: Match) => {
    navigation.navigate('Scoring', { id: match.id })
  }

  // ── NEW: tapping the explicit "Report" button is the only way to reach
  // the read-only Report/Summary screen now — decoupled from the card tap.
  const handleReport = (match: Match) => navigation.navigate('MatchReport', { id: match.id })

  const handleDetails = (match: Match) => navigation.navigate('MatchDetails', { id: match.id })

  const handleDelete = (id: string) => {
  Alert.alert('Delete Match', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete', style: 'destructive',
      onPress: async () => {
        setDeleting(id)
        try {
          const token    = await AsyncStorage.getItem('token').catch(() => null)
          const deviceId = await getDeviceId()
          const headers: Record<string, string> = {}
          if (token) headers.Authorization = `Bearer ${token}`

          const url = !token
            ? apiUrl(`/api/matches/${id}?deviceId=${deviceId}`)
            : apiUrl(`/api/matches/${id}`)

          const res = await fetch(url, { method: 'DELETE', headers })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.message || 'Failed to delete match')
          }
          await refresh()
        } catch (e: any) {
          Alert.alert('Error', e?.message || 'Failed to delete match')
        } finally {
          setDeleting(null)
        }
      },
    },
  ])
}
  // ── Share: opens native share sheet with rich scorecard ───────────────────
  const handleShare = async (match: Match) => {
    try {
      const text = buildShareText(match)
      await Share.share({
        message: text,
        title:   `${match.team1} vs ${match.team2} — Scorecard`,
      })
    } catch { /* user dismissed */ }
  }

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all',       label: `All (${allMatches.length})`                       },
    { key: 'live',      label: `Live (${allMatches.filter(m => m.isLive).length})` },
    { key: 'completed', label: `Done (${allMatches.filter(m => m.isCompleted).length})` },
  ]

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#080808" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={() => navigation.navigate('Home')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Matches</Text>
          <Text style={styles.subtitle}>{allMatches.length} matches on this device</Text>
        </View>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={refresh} disabled={refreshing} style={styles.refreshBtn}>
          <Text style={[styles.refreshBtnText, refreshing && { color: '#444' }]}>↻</Text>
        </Pressable>
        <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          onPress={() => navigation.navigate('NewMatch')} style={styles.newBtn}>
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <Pressable key={f.key}
            android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={() => setFilter(f.key)}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#ff4444" /></View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
            onPress={refresh} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={m => m.id}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              onOpen={handleOpen}
              onReport={handleReport}
              onDetails={handleDetails}
              onDelete={handleDelete}
              onShare={handleShare}
              deleting={deleting}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh}
              tintColor="#ff4444" colors={['#ff4444']} />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🏏</Text>
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptySub}>
                {filter !== 'all' ? 'Try changing the filter' : 'Start a new match to see it here'}
              </Text>
              {filter === 'all' && (
                <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
                  onPress={() => navigation.navigate('NewMatch')} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>+ New Match</Text>
                </Pressable>
              )}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#0c0c0c' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn:        { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  backBtnText:    { color: '#aaa', fontSize: 18, fontWeight: '600' },
  title:          { fontSize: 20, fontWeight: '700', color: '#f0f0f0', letterSpacing: 0.5 },
  subtitle:       { fontSize: 11, color: '#444', fontWeight: '600', marginTop: 1 },
  refreshBtn:     { width: 34, height: 34, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  refreshBtnText: { color: '#f59e0b', fontSize: 18, fontWeight: '700' },
  newBtn:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(204,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(204,0,0,0.3)' },
  newBtnText:     { color: '#ff4444', fontSize: 13, fontWeight: '800' },

  filterRow:            { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  filterChip:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'transparent' },
  filterChipActive:     { borderColor: '#ff4444', backgroundColor: 'rgba(255,68,68,0.12)' },
  filterChipText:       { fontSize: 12, fontWeight: '700', color: '#555' },
  filterChipTextActive: { color: '#ff4444' },

  listContent: { paddingHorizontal: 14, paddingBottom: 30, paddingTop: 4, gap: 10 },

  card:      { backgroundColor: 'rgba(255,255,255,0.025)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' },
  cardTop:   { flexDirection: 'row', alignItems: 'flex-start', padding: 14, paddingBottom: 10 },
  teamsRow:  { flexDirection: 'row', alignItems: 'center', flex: 1, marginBottom: 4 },
  teamsText: { fontSize: 15, fontWeight: '700', color: '#ddd', flex: 1 },
  vsText:    { color: '#cc0000', fontWeight: '800' },
  favRow:    { flexDirection: 'row', gap: 2 },
  metaText:  { fontSize: 11, color: '#444', fontWeight: '500' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  scoresRow:  { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  scoreBox:   { flex: 1 },
  scoreTeam:  { fontSize: 11, color: '#555', fontWeight: '700', marginBottom: 2 },
  scoreRuns:  { fontSize: 22, fontWeight: '800', color: '#e0e0e0', fontFamily: 'monospace' },
  scoreOvers: { fontSize: 11, color: '#444' },

  resultRow: { paddingHorizontal: 14, paddingBottom: 8 },
  resultText: { fontSize: 12, color: '#f59e0b', fontWeight: '700' },

  timeBox:   { paddingHorizontal: 14, paddingBottom: 8, gap: 2 },
  timeRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeLabel: { fontSize: 10, color: '#555', fontWeight: '700' },
  timeValue: { fontSize: 10, color: '#777', fontWeight: '600' },

  cardFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' },
  timeText:    { fontSize: 10, color: '#2a2a2a', flex: 1 },
  actionsRow:  { flexDirection: 'row', gap: 5, alignItems: 'center' },

  detailsBtn:  { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', alignItems: 'center', justifyContent: 'center' },
  detailsBtnText: { fontSize: 14 },

  openBtn:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  openBtnLive: { backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  openBtnDone: { backgroundColor: 'rgba(250,204,21,0.12)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.25)' },
  openBtnText: { fontSize: 11, fontWeight: '800', color: '#ddd' },

  shareBtn:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(204,0,0,0.10)', borderWidth: 1, borderColor: 'rgba(204,0,0,0.3)' },
  shareBtnText: { fontSize: 11, fontWeight: '800', color: '#ff6666' },

  deleteBtn:     { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 14 },

  emptyBox:   { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#444', marginBottom: 8 },
  emptySub:   { fontSize: 13, color: '#2a2a2a', textAlign: 'center', marginBottom: 24 },
  emptyBtn:   { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: '#cc0000' },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  errorText: { color: '#f87171', fontWeight: '700', fontSize: 15, marginBottom: 16 },
  retryBtn:  { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  retryBtnText: { color: '#fff', fontWeight: '700' },
})