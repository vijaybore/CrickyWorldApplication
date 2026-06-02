// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Match Details Screen
// src/screens/MatchDetailsScreen.tsx
// Tabs: Summary | Scorecard | Commentary
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView ,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Pressable ,
  RefreshControl,
  StatusBar} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useLiveScores }   from '../hooks/useLiveScores'
import { FavoriteToggle }  from '../components/FavoriteToggle'
import type {
  RootStackParamList,
  BattingStats,
  BowlingStats,
  Innings,
  Ball,
  Match} from '../types'

type Route = RouteProp<RootStackParamList, 'MatchDetails'>
type Nav   = NativeStackNavigationProp<RootStackParamList>

// ── Helpers ───────────────────────────────────────────────────────────────────
const T = {
  bg: '#08090d', surface: '#0e1016', card: '#13161f',
  gold: '#f5c842', red: '#ff4444', green: '#22d983',
  purple: '#b48aff', sky: '#38c9f8', orange: '#ff8f3c',
  text: '#f0ece0', text2: '#a0998c', muted: '#404040',
  border: 'rgba(255,255,255,0.07)'}

const strikeRate = (runs: number, balls: number): string =>
  balls > 0 ? ((runs / balls) * 100).toFixed(1) : '-'

const economy = (runs: number, balls: number): string =>
  balls > 0 ? (runs / (balls / 6)).toFixed(2) : '-'

const fmtOvers = (balls: number): string =>
  `${Math.floor(balls / 6)}.${balls % 6}`

// ── BallDot ───────────────────────────────────────────────────────────────────
function BallDot({ ball, size = 28 }: { ball: Ball; size?: number }) {
  let bg = T.card, color = T.muted, label = String(ball.runs ?? 0)
  if      (ball.isWicket) { bg = '#3d0a0a'; color = T.red;    label = 'W' }
  else if (ball.isWide)   { bg = '#0a2040'; color = T.sky;    label = ball.runs > 1 ? `+${ball.runs}` : 'Wd' }
  else if (ball.isNoBall) { bg = '#2a1400'; color = T.orange; label = ball.runs > 0 ? `+${ball.runs}` : 'NB' }
  else if (ball.runs === 6) { bg = '#1a0a40'; color = T.purple; label = '6' }
  else if (ball.runs === 4) { bg = '#0a3020'; color = T.green;  label = '4' }
  else if (ball.runs === 0) { bg = '#111';    color = T.muted;  label = '·' }

  return (
    <View style={[dotStyles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderColor: color + '44' }]}>
      <Text style={[dotStyles.label, { color, fontSize: size < 30 ? 10 : 11 }]}>{label}</Text>
    </View>
  )
}
const dotStyles = StyleSheet.create({
  dot: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '800' }})

// ── Summary Tab ───────────────────────────────────────────────────────────────
function SummaryTab({ match }: { match: Match }) {
  const { innings1: i1, innings2: i2, tossWinner, battingFirst, overs, result, status } = match
  const isLive = status === 'innings1' || status === 'innings2'
  const target = i1.runs + 1

  const quickStats = [
    { label: 'Format',        value: `${overs} Overs` },
    { label: 'Toss',          value: tossWinner ? `${tossWinner} won` : '—' },
    { label: 'Batting First', value: battingFirst || '—' },
    ...(status === 'innings2' || status === 'completed' ? [{ label: 'Target', value: String(target) }] : []),
    ...(result ? [{ label: 'Result', value: result, highlight: true }] : []),
  ]

  const allBat = [...(i1.battingStats ?? []), ...(i2.battingStats ?? [])]
    .filter(p => p.runs > 0).sort((a, b) => b.runs - a.runs)
  const topBatter = allBat[0]
  const allBowl = [...(i1.bowlingStats ?? []), ...(i2.bowlingStats ?? [])]
    .filter(p => p.wickets > 0).sort((a, b) => b.wickets - a.wickets)
  const topBowler = allBowl[0]

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Score boxes */}
      {[i1, i2].map((inn, idx) => {
        if (!inn.battingTeam) return null
        const isCurrent = isLive && ((status === 'innings1' && idx === 0) || (status === 'innings2' && idx === 1))
        return (
          <View key={idx} style={[tabStyles.scoreRow, idx === 0 && { borderBottomWidth: 1, borderBottomColor: T.border }]}>
            <Text style={[tabStyles.scoreTeam, isCurrent && { color: T.text }]}>{inn.battingTeam}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[tabStyles.scoreRuns, isCurrent && { color: T.gold, fontSize: 28 }]}>
                {inn.runs}/{inn.wickets}
              </Text>
              <Text style={tabStyles.scoreOvers}>({fmtOvers(inn.balls)})</Text>
            </View>
          </View>
        )
      })}

      {/* Result */}
      {result ? (
        <Text style={tabStyles.resultText}>{result}</Text>
      ) : (
        <Text style={tabStyles.tossText}>Toss: {tossWinner} elected to bat first</Text>
      )}

      {/* Quick stats */}
      {quickStats.map(s => (
        <View key={s.label} style={tabStyles.statRow}>
          <Text style={tabStyles.statLabel}>{s.label}</Text>
          <Text style={[tabStyles.statValue, s.highlight && { color: T.gold }]}>{s.value}</Text>
        </View>
      ))}

      {/* Top performers */}
      {topBatter && (
        <View style={tabStyles.perfCard}>
          <Text style={tabStyles.perfRole}>🏏 TOP SCORER</Text>
          <Text style={tabStyles.perfName}>{topBatter.name}</Text>
          <Text style={tabStyles.perfValue}>
            {topBatter.runs}{topBatter.isOut ? '' : '*'} ({topBatter.balls}b) — SR: {strikeRate(topBatter.runs, topBatter.balls)}
          </Text>
        </View>
      )}
      {topBowler && (
        <View style={[tabStyles.perfCard, { borderColor: T.purple + '44' }]}>
          <Text style={[tabStyles.perfRole, { color: T.purple }]}>🎳 TOP BOWLER</Text>
          <Text style={tabStyles.perfName}>{topBowler.name}</Text>
          <Text style={tabStyles.perfValue}>
            {topBowler.wickets}/{topBowler.runs} — Eco: {economy(topBowler.runs, topBowler.balls)}
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

// ── Scorecard Tab ─────────────────────────────────────────────────────────────
function InningsCard({ inn, idx }: { inn: Innings; idx: number }) {
  const [expanded, setExpanded] = useState(true)
  const highScore = Math.max(...(inn.battingStats ?? []).map(p => p.runs), 0)

  return (
    <View style={scStyles.container}>
      <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => setExpanded(e => !e)} style={scStyles.header}>
        <View>
          <Text style={scStyles.innLabel}>{idx === 0 ? '1ST INNINGS' : '2ND INNINGS'}</Text>
          <Text style={scStyles.teamName}>{inn.battingTeam}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={scStyles.totalScore}>{inn.runs}/{inn.wickets}</Text>
          <Text style={scStyles.totalOvers}>({fmtOvers(inn.balls)} ov)</Text>
        </View>
      </Pressable>

      {expanded && (
        <>
          {/* Batting */}
          <View style={scStyles.tableHeader}>
            {['BATTER','R','B','4s','6s','SR'].map((h, i) => (
              <Text key={h} style={[scStyles.th, i === 0 && { flex: 2, textAlign: 'left' }]}>{h}</Text>
            ))}
          </View>
          {(inn.battingStats ?? []).map((p, i) => (
            <View key={i} style={[scStyles.row, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.018)' }]}>
              <Text style={[scStyles.td, { flex: 2, textAlign: 'left', color: p.runs === highScore ? T.gold : T.text, fontWeight: p.runs === highScore ? '700' : '400' }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[scStyles.td, { color: p.runs >= 50 ? T.gold : T.text, fontWeight: '700' }]}>{p.runs}{p.isOut ? '' : '*'}</Text>
              <Text style={scStyles.td}>{p.balls}</Text>
              <Text style={[scStyles.td, { color: T.green }]}>{p.fours}</Text>
              <Text style={[scStyles.td, { color: T.purple }]}>{p.sixes}</Text>
              <Text style={[scStyles.td, { color: parseFloat(strikeRate(p.runs, p.balls)) >= 150 ? T.green : T.text2 }]}>
                {strikeRate(p.runs, p.balls)}
              </Text>
            </View>
          ))}
          <View style={scStyles.totalRow}>
            <Text style={[scStyles.td, { flex: 3, textAlign: 'left', color: T.gold, fontWeight: '800' }]}>TOTAL</Text>
            <Text style={[scStyles.td, { flex: 3, textAlign: 'right', color: T.gold, fontSize: 15, fontWeight: '800' }]}>
              {inn.runs}/{inn.wickets} ({fmtOvers(inn.balls)})
            </Text>
          </View>

          {/* Bowling */}
          <View style={[scStyles.tableHeader, { backgroundColor: '#181c28' }]}>
            {['BOWLER','O','R','W','ECO'].map((h, i) => (
              <Text key={h} style={[scStyles.th, i === 0 && { flex: 2, textAlign: 'left', color: T.purple }]}>{h}</Text>
            ))}
          </View>
          {(inn.bowlingStats ?? []).map((b, i) => (
            <View key={i} style={[scStyles.row, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.018)' }]}>
              <Text style={[scStyles.td, { flex: 2, textAlign: 'left', color: b.wickets >= 3 ? T.purple : T.text }]} numberOfLines={1}>{b.name}</Text>
              <Text style={scStyles.td}>{fmtOvers(b.balls)}</Text>
              <Text style={scStyles.td}>{b.runs}</Text>
              <Text style={[scStyles.td, { color: b.wickets > 0 ? T.purple : T.muted, fontWeight: '700' }]}>{b.wickets}</Text>
              <Text style={[scStyles.td, { color: parseFloat(economy(b.runs, b.balls)) <= 6 ? T.green : T.text2 }]}>
                {economy(b.runs, b.balls)}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

function ScorecardTab({ match }: { match: Match }) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {[match.innings1, match.innings2]
        .filter(i => i.battingTeam)
        .map((inn, idx) => <InningsCard key={idx} inn={inn} idx={idx} />)}
    </ScrollView>
  )
}

// ── Commentary Tab ────────────────────────────────────────────────────────────
function CommentaryTab({ match }: { match: Match }) {
  const innings = [match.innings2, match.innings1].filter(i => i.battingTeam && (i.ballByBall?.length ?? 0) > 0)
  const [activeInn, setActiveInn] = useState(0)
  const current = innings[activeInn]

  if (!current) {
    return (
      <View style={{ alignItems: 'center', padding: 60 }}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>📻</Text>
        <Text style={{ color: T.text2, fontWeight: '700', fontSize: 14 }}>No commentary yet</Text>
      </View>
    )
  }

  // Group balls by over
  const overs: Ball[][] = []
  const balls = current.ballByBall ?? []
  let legalCount = 0
  balls.forEach(ball => {
    const isExtra = ball.isWide || ball.isNoBall
    if (!isExtra) legalCount++
    const overIdx = Math.max(0, Math.floor((legalCount - (isExtra ? 0 : 1)) / 6))
    if (!overs[overIdx]) overs[overIdx] = []
    overs[overIdx].push(ball)
  })

  const data = [...overs].reverse().map((overBalls, ri) => ({
    overNum: overs.length - 1 - ri,
    balls: overBalls}))

  return (
    <>
      {innings.length > 1 && (
        <View style={comStyles.innSwitcher}>
          {innings.map((inn, i) => (
            <Pressable

              android_ripple={{ color: "rgba(255,255,255,0.12)" }}              key={i} onPress={() => setActiveInn(i)}
              style={[comStyles.innTab, activeInn === i && comStyles.innTabActive]}
            >
              <Text style={[comStyles.innTabText, activeInn === i && { color: T.gold }]}>{inn.battingTeam}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={data}
        keyExtractor={item => String(item.overNum)}
        renderItem={({ item }) => {
          const overRuns = item.balls.reduce((s, b) => s + (b.runs ?? 0), 0)
          const overWkts = item.balls.filter(b => b.isWicket).length
          return (
            <View style={comStyles.overBlock}>
              <View style={comStyles.overHeader}>
                <Text style={comStyles.overLabel}>Over {item.overNum + 1}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {item.balls.map((b, bi) => <BallDot key={bi} ball={b} size={24} />)}
                </View>
                <Text style={comStyles.overSummary}>{overRuns}r{overWkts > 0 ? ` ${overWkts}W` : ''}</Text>
              </View>
              {[...item.balls].reverse().map((ball, bi) => {
                let desc = `${ball.batsmanName ?? 'Batsman'} — ${ball.runs} run${ball.runs !== 1 ? 's' : ''}`
                if (ball.isWicket) desc = `OUT! ${ball.batsmanName} — ${ball.wicketType ?? 'dismissed'}`
                if (ball.isWide)   desc = `Wide${ball.runs > 1 ? ` (+${ball.runs})` : ''}`
                if (ball.isNoBall) desc = `No Ball${ball.runs > 0 ? ` +${ball.runs}` : ''}`
                if (ball.runs === 6 && !ball.isWide && !ball.isNoBall)
                  desc = `SIX! ${ball.batsmanName} hits ${ball.bowlerName ?? 'bowler'}`
                if (ball.runs === 4 && !ball.isWide && !ball.isNoBall)
                  desc = `FOUR! ${ball.batsmanName} drives ${ball.bowlerName ?? 'bowler'}`
                return (
                  <View key={bi} style={[comStyles.ballRow, ball.isWicket && { backgroundColor: 'rgba(255,68,68,0.05)' }]}>
                    <BallDot ball={ball} size={26} />
                    <View style={{ flex: 1 }}>
                      <Text style={[comStyles.ballDesc, ball.isWicket && { color: T.red, fontWeight: '700' }]}>{desc}</Text>
                      {ball.bowlerName && !ball.isWide && !ball.isNoBall && (
                        <Text style={comStyles.bowlerName}>b {ball.bowlerName}</Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          )
        }}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </>
  )
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
type TabType = 'Summary' | 'Scorecard' | 'Commentary'

export default function MatchDetailsScreen() {
  const route     = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const { id } = route.params
  const [activeTab, setActiveTab] = useState<TabType>('Summary')

  const { match, loading, error, refresh, refreshing } = useLiveScores({
    matchId: id, pollInterval: 15000})

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Top Nav */}
      <View style={styles.topNav}>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>
          {match ? `${match.team1} vs ${match.team2}` : 'Match Details'}
        </Text>
        {match && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <FavoriteToggle team={match.team1} size={16} />
            <FavoriteToggle team={match.team2} size={16} />
          </View>
        )}
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={refresh} disabled={refreshing} style={styles.refreshBtn}>
          <Text style={[styles.refreshBtnText, refreshing && { color: '#444' }]}>↻</Text>
        </Pressable>
      </View>

      {loading && !match ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.gold} />
        </View>
      ) : error && !match ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ color: T.text2, fontWeight: '700', fontSize: 15 }}>⚠️ {error}</Text>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={refresh} style={styles.retryBtn}>
            <Text style={{ color: T.gold, fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      ) : match ? (
        <>
          {/* Score header */}
          <View style={styles.scoreHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <View style={match.isLive ? styles.liveBadge : styles.completedBadge}>
                {match.isLive && <View style={styles.liveDot} />}
                <Text style={[styles.badgeText, { color: match.isLive ? T.green : T.text2 }]}>
                  {match.isLive ? 'LIVE' : 'COMPLETED'}
                </Text>
              </View>
              <Text style={styles.overText}>{match.overs} ov</Text>
            </View>
            {[match.innings1, match.innings2].map((inn, idx) => {
              if (!inn.battingTeam) return null
              const isCurrent = match.isLive && ((match.status === 'innings1' && idx === 0) || (match.status === 'innings2' && idx === 1))
              return (
                <View key={idx} style={styles.innRow}>
                  <Text style={[styles.innTeam, isCurrent && { color: T.text }]}>{inn.battingTeam}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={[styles.innScore, isCurrent && { color: T.gold, fontSize: 28 }]}>
                      {inn.runs}/{inn.wickets}
                    </Text>
                    <Text style={styles.innOvers}>({fmtOvers(inn.balls)})</Text>
                  </View>
                </View>
              )
            })}
            {match.result ? (
              <Text style={{ fontSize: 12, color: T.gold, fontWeight: '600', marginTop: 8 }}>{match.result}</Text>
            ) : null}
          </View>

          {/* Tab bar */}
          <View style={styles.tabBar}>
            {(['Summary', 'Scorecard', 'Commentary'] as TabType[]).map(tab => (
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={tab} onPress={() => setActiveTab(tab)} style={styles.tabBtn}>
                <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnActive]}>{tab}</Text>
                {activeTab === tab && <View style={styles.tabIndicator} />}
              </Pressable>
            ))}
          </View>

          {/* Tab content */}
          <View style={{ flex: 1 }}>
            {activeTab === 'Summary'    && <SummaryTab    match={match} />}
            {activeTab === 'Scorecard'  && <ScorecardTab  match={match} />}
            {activeTab === 'Commentary' && <CommentaryTab match={match} />}
          </View>
        </>
      ) : null}
    </View>
  )
}

// ── Main styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  topNav: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 50, paddingBottom: 12,
    backgroundColor: T.bg, borderBottomWidth: 1, borderBottomColor: T.border},
  backBtn: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: T.card, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center'},
  backBtnText: { color: T.text2, fontSize: 18, fontWeight: '600' },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: T.text, letterSpacing: 0.5 },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: T.card, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center'},
  refreshBtnText: { color: T.gold, fontSize: 18, fontWeight: '700' },
  retryBtn: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
    backgroundColor: T.card, borderWidth: 1, borderColor: T.border},
  // Score header
  scoreHeader: {
    backgroundColor: '#1a1000',
    padding: 16, borderBottomWidth: 1, borderBottomColor: T.border},
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,217,131,0.12)', borderWidth: 1,
    borderColor: 'rgba(34,217,131,0.25)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3},
  completedBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3},
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.green },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  overText: { fontSize: 11, color: T.text2 },
  innRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  innTeam: { fontSize: 14, fontWeight: '700', color: T.text2 },
  innScore: { fontSize: 22, fontWeight: '800', color: T.text2, fontFamily: 'monospace' },
  innOvers: { fontSize: 11, color: T.muted },
  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', position: 'relative' },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: T.muted, letterSpacing: 0.8 },
  tabBtnActive: { color: T.gold },
  tabIndicator: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: T.gold, borderRadius: 1 }})

// Tab sub-styles
const tabStyles = StyleSheet.create({
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  scoreTeam: { fontSize: 14, fontWeight: '700', color: T.text2 },
  scoreRuns: { fontSize: 22, fontWeight: '800', color: T.text2, fontFamily: 'monospace' },
  scoreOvers: { fontSize: 11, color: T.muted, textAlign: 'right' },
  resultText: { fontSize: 12, color: T.gold, fontWeight: '600', padding: 14, paddingTop: 0 },
  tossText:   { fontSize: 12, color: T.text2, padding: 14, paddingTop: 0 },
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  statLabel: { fontSize: 12, color: T.text2, fontWeight: '600' },
  statValue: { fontSize: 13, fontWeight: '700', color: T.text, fontFamily: 'monospace' },
  perfCard: {
    margin: 14, padding: 14, borderRadius: 12,
    backgroundColor: T.card, borderWidth: 1, borderColor: T.gold + '33'},
  perfRole: { fontSize: 10, color: T.gold, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  perfName: { fontSize: 14, fontWeight: '700', color: T.text, marginBottom: 2 },
  perfValue: { fontSize: 12, color: T.text2 }})

const scStyles = StyleSheet.create({
  container: { marginBottom: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, backgroundColor: '#1a1000',
    borderBottomWidth: 1, borderBottomColor: T.border},
  innLabel: { fontSize: 10, color: T.gold, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  teamName: { fontSize: 16, fontWeight: '700', color: T.text, letterSpacing: 0.5 },
  totalScore: { fontSize: 24, fontWeight: '800', color: T.gold, fontFamily: 'monospace' },
  totalOvers: { fontSize: 11, color: T.text2 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: T.card,
    paddingHorizontal: 10, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: T.border},
  th: { flex: 1, textAlign: 'right', fontSize: 10, color: T.gold, fontWeight: '800', letterSpacing: 0.8 },
  row: {
    flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)'},
  td: { flex: 1, textAlign: 'right', fontSize: 12, color: T.text2, fontFamily: 'monospace' },
  totalRow: {
    flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9,
    backgroundColor: 'rgba(245,200,66,0.08)',
    borderTopWidth: 1, borderTopColor: T.gold + '33'}})

const comStyles = StyleSheet.create({
  innSwitcher: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border },
  innTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  innTabActive: { borderBottomColor: T.gold },
  innTabText: { fontSize: 12, fontWeight: '700', color: T.muted },
  overBlock: { borderBottomWidth: 1, borderBottomColor: T.border },
  overHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 8, paddingHorizontal: 14, backgroundColor: T.card},
  overLabel: { fontSize: 12, color: T.gold, fontWeight: '800' },
  overSummary: { fontSize: 11, color: T.text2, fontFamily: 'monospace' },
  ballRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)'},
  ballDesc: { fontSize: 12, color: T.text, lineHeight: 18 },
  bowlerName: { fontSize: 11, color: T.muted, marginTop: 1 }})