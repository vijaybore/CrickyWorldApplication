// src/screens/MatchReportScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Match Report
// FIX: Guard against undefined innings1/innings2 (old matches before server fix)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, Share,
  StyleSheet, ActivityIndicator, StatusBar, Platform,
  Modal, Dimensions,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl } from '../services/api'
import type { RootStackParamList } from '../types'

let ViewShot: any = null
let captureRef: any = null
try {
  const vs = require('react-native-view-shot')
  ViewShot = vs.default
  captureRef = vs.captureRef
} catch (_) {}

let RNHTMLtoPDF: any = null
try {
  RNHTMLtoPDF = require('react-native-html-to-pdf').default
} catch (_) {}

type Route = RouteProp<RootStackParamList, 'MatchReport'>
type Nav = NativeStackNavigationProp<RootStackParamList>

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
  battingTeam?: string; runs: number; wickets: number; balls: number
  battingStats: BatStat[]; bowlingStats: BowlStat[]
  extras?: { wides?: number; noBalls?: number; byes?: number; legByes?: number; total?: number }
  fallOfWickets?: FallOfWicket[]
}
interface MatchData {
  _id: string; team1: string; team2: string; overs: number
  tossWinner?: string; battingFirst?: string; result?: string
  innings1?: Innings; innings2?: Innings; status: string
  createdAt?: string; venue?: string; matchType?: string
  manOfTheMatch?: string
}

// ── FIX: Safe empty innings factory ──────────────────────────────────────────
function emptyInnings(battingTeam = ''): Innings {
  return { battingTeam, runs: 0, wickets: 0, balls: 0, battingStats: [], bowlingStats: [] }
}

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

const fmtOv  = (b: number) => `${Math.floor(b / 6)}.${b % 6}`
const getSR  = (r: number, b: number) => b === 0 ? '—' : (r / b * 100).toFixed(1)
const getEco = (r: number, b: number) => b === 0 ? '—' : (r / (b / 6)).toFixed(2)
const fmtDate = (d?: string) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}


function buildTextReport(match: MatchData, inn1: Innings, inn2: Innings): string {
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
    lines.push(`  ${thin.slice(0, 42)}`)
    lines.push(`  ${'TOTAL'.padEnd(18)} ${String(inn.runs).padStart(4)}/${inn.wickets}  (${fmtOv(inn.balls)} ov)`)
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
    `  📍 ${match.team1.toUpperCase()} vs ${match.team2.toUpperCase()}`,
    `  🗓  ${fmtDate(match.createdAt)}  |  ${match.overs} Overs`,
    ``,
    div,
    `  1st Innings: ${inn1.battingTeam || match.team1}   ${inn1.runs}/${inn1.wickets}  (${fmtOv(inn1.balls)} ov)`,
    `  2nd Innings: ${inn2.battingTeam || match.team2}   ${inn2.runs}/${inn2.wickets}  (${fmtOv(inn2.balls)} ov)`,
    ``,
    match.result ? `  🏆  ${match.result}` : '',
    ``,
    div,
    `📋  ${(inn1.battingTeam || match.team1).toUpperCase()} — BATTING`,
    ``,
    batSection(inn1),
    ``,
    `🎳  BOWLING vs ${(inn1.battingTeam || match.team1).toUpperCase()}`,
    ``,
    bowlSection(inn2),
    ``,
    div,
    `📋  ${(inn2.battingTeam || match.team2).toUpperCase()} — BATTING`,
    ``,
    batSection(inn2),
    ``,
    `🎳  BOWLING vs ${(inn2.battingTeam || match.team2).toUpperCase()}`,
    ``,
    bowlSection(inn1),
    ``,
    div,
    `Shared via CrickyWorld 🏏  |  Score. Share. Celebrate.`,
  ]
  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

// ── HTML report (opened in browser → user can Print > Save as PDF) ────────────
function buildHtmlReport(match: MatchData, inn1: Innings, inn2: Innings): string {
  const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
  ))

  const batRows = (inn: Innings) => (inn.battingStats || []).map(p => `
    <tr>
      <td>${esc(p.name)}${p.isOut ? '' : '*'}${p.isOut && p.wicketType
        ? `<div class="sub">${esc(p.wicketType)}${p.bowlerName ? ` b ${esc(p.bowlerName)}` : ''}</div>`
        : !p.isOut ? `<div class="sub notout">not out</div>` : ''}</td>
      <td class="num">${p.runs}</td>
      <td class="num">${p.balls}</td>
      <td class="num">${p.fours}</td>
      <td class="num">${p.sixes}</td>
      <td class="num">${getSR(p.runs, p.balls)}</td>
    </tr>`).join('')

  const bowlRows = (inn: Innings) => (inn.bowlingStats || []).map(b => `
    <tr>
      <td>${esc(b.name)}</td>
      <td class="num">${fmtOv(b.balls)}</td>
      <td class="num">${b.runs}</td>
      <td class="num">${b.wickets}</td>
      <td class="num">${getEco(b.runs, b.balls)}</td>
    </tr>`).join('')

  const inningsBlock = (inn: Innings, bowlingInn: Innings, label: string) => `
    <div class="inn-card">
      <div class="inn-head">
        <span class="inn-label">${esc(label)}</span>
        <span class="inn-score">${inn.runs}/${inn.wickets} <span class="ov">(${fmtOv(inn.balls)} ov)</span></span>
      </div>
      <table>
        <thead><tr><th>Batter</th><th class="num">R</th><th class="num">B</th><th class="num">4s</th><th class="num">6s</th><th class="num">SR</th></tr></thead>
        <tbody>${batRows(inn)}
          <tr class="total"><td>TOTAL</td><td class="num" colspan="5">${inn.runs}/${inn.wickets} (${fmtOv(inn.balls)} ov)</td></tr>
        </tbody>
      </table>
      <table class="bowl-table">
        <thead><tr><th>Bowler</th><th class="num">O</th><th class="num">R</th><th class="num">W</th><th class="num">Eco</th></tr></thead>
        <tbody>${bowlRows(bowlingInn)}</tbody>
      </table>
    </div>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(match.team1)} vs ${esc(match.team2)} — CrickyWorld Match Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Arial, sans-serif; margin: 0; padding: 24px; background: #060d18; color: #f1f5f9; }
  .container { max-width: 640px; margin: 0 auto; }
  .brand { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .brand-name { color: #10b981; font-weight: 800; letter-spacing: 1px; font-size: 14px; }
  .date { color: #475569; font-size: 12px; }
  h1 { text-align: center; font-size: 22px; margin: 8px 0 2px; }
  .overs { text-align: center; color: #94a3b8; font-size: 13px; margin-bottom: 12px; }
  .summary { background: #0b1628; border: 1px solid #1a2d45; border-radius: 12px; padding: 12px; margin-bottom: 16px; }
  .score-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 4px; border-top: 1px solid #1a2d45; }
  .score-row:first-child { border-top: none; }
  .team { font-weight: 700; font-size: 14px; color: #cbd5e1; }
  .score { font-weight: 800; font-size: 20px; }
  .ov { color: #94a3b8; font-size: 12px; font-weight: 400; }
  .result { text-align: center; color: #f59e0b; font-weight: 800; font-size: 14px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(245,158,11,0.3); }
  .inn-card { margin-bottom: 16px; }
  .inn-head { display: flex; justify-content: space-between; align-items: center; background: #0b1628; border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; }
  .inn-label { color: #94a3b8; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .inn-score { font-weight: 800; font-size: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 12px; border: 1px solid #1a2d45; border-radius: 8px; overflow: hidden; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
  th { background: #0f1a28; color: #94a3b8; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
  .bowl-table th { color: #a78bfa; }
  .num { text-align: right; font-family: monospace; }
  .sub { font-size: 10px; color: #475569; }
  .notout { color: #10b981; }
  .total td { background: rgba(245,158,11,0.07); color: #f59e0b; font-weight: 800; }
  .footer { text-align: center; color: #475569; font-size: 11px; margin-top: 20px; }
  @media print {
    body { background: #fff; color: #111; }
    .summary, .inn-head, table, th, td { border-color: #ccc !important; }
    th { background: #f3f3f3 !important; color: #555 !important; }
    .total td { background: #fdf3e0 !important; color: #b8860b !important; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <span class="brand-name">🏏 CRICKYWORLD</span>
      <span class="date">${esc(fmtDate(match.createdAt))}</span>
    </div>
    <h1>${esc(match.team1)} vs ${esc(match.team2)}</h1>
    <div class="overs">${match.overs} Overs</div>
    <div class="summary">
      <div class="score-row">
        <span class="team">${esc(inn1.battingTeam || match.team1)}</span>
        <span class="score">${inn1.runs}/${inn1.wickets} <span class="ov">(${fmtOv(inn1.balls)})</span></span>
      </div>
      <div class="score-row">
        <span class="team">${esc(inn2.battingTeam || match.team2)}</span>
        <span class="score">${inn2.runs}/${inn2.wickets} <span class="ov">(${fmtOv(inn2.balls)})</span></span>
      </div>
      ${match.result ? `<div class="result">🏆 ${esc(match.result)}</div>` : ''}
    </div>
    ${inningsBlock(inn1, inn2, `1st Innings · ${inn1.battingTeam || match.team1}`)}
    ${inningsBlock(inn2, inn1, `2nd Innings · ${inn2.battingTeam || match.team2}`)}
    <div class="footer">Score. Share. Celebrate. · CrickyWorld<br/>Use your browser's Share/Print menu → Save as PDF</div>
  </div>
</body>
</html>`
}


// ── Scorecard Image (for ViewShot) ────────────────────────────────────────────
function ScorecardImage({ match, inn1, inn2, forwardRef }: {
  match: MatchData; inn1: Innings; inn2: Innings; forwardRef?: any
}) {
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

  const InningsSection = ({ inn, bowlingInn, label }: { inn: Innings; bowlingInn: Innings; label: string }) => (
    <View style={{ marginBottom: 12 }}>
      <View style={IMG.innHeader}>
        <Text style={IMG.innLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={IMG.innScore}>{inn.runs}/{inn.wickets}</Text>
          <Text style={IMG.innOvers}>({fmtOv(inn.balls)} ov)</Text>
        </View>
      </View>
      <View style={IMG.tableSection}>
        <View style={IMG.tableHead}>
          {['BATTER', 'R', 'B', '4s', '6s', 'SR'].map((h, i) => (
            <Text key={h} style={[IMG.th, i === 0 && { flex: 2.2, textAlign: 'left', color: T.gold }]}>{h}</Text>
          ))}
        </View>
        {(inn.battingStats || []).map((p, i) => <BatRow key={i} p={p} />)}
        <View style={[IMG.row, { backgroundColor: 'rgba(245,158,11,0.07)' }]}>
          <Text style={[IMG.playerName, { flex: 2.2, color: T.gold, fontWeight: '700' }]}>TOTAL</Text>
          <Text style={[IMG.stat, { flex: 4, textAlign: 'left', color: T.gold, fontWeight: '700', fontSize: 12 }]}>
            {inn.runs}/{inn.wickets}  ({fmtOv(inn.balls)} ov)
          </Text>
        </View>
      </View>
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

  const inner = (
    <View style={{ width: w, backgroundColor: T.bg, padding: 14, borderRadius: 16 }}>
      <View style={{ backgroundColor: '#0b1628', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: T.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 18 }}>🏏</Text>
            <Text style={{ color: T.accent, fontWeight: '800', fontSize: 13, letterSpacing: 1 }}>CRICKYWORLD</Text>
          </View>
          {match.createdAt && <Text style={{ color: T.muted, fontSize: 10 }}>{fmtDate(match.createdAt)}</Text>}
        </View>
        <Text style={{ color: T.text, fontWeight: '800', fontSize: 18, textAlign: 'center', marginBottom: 2 }}>
          {match.team1} vs {match.team2}
        </Text>
        <Text style={{ color: T.sub, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
          {match.overs} Overs
        </Text>
        {[inn1, inn2].map((inn, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderTopWidth: 0.5, borderTopColor: T.border }}>
            <Text style={{ color: T.text2, fontWeight: '700', fontSize: 13 }}>{inn.battingTeam || (i === 0 ? match.team1 : match.team2)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ color: T.text, fontWeight: '800', fontSize: 20 }}>{inn.runs}/{inn.wickets}</Text>
              <Text style={{ color: T.sub, fontSize: 11 }}>({fmtOv(inn.balls)})</Text>
            </View>
          </View>
        ))}
        {match.result && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ color: T.gold, fontWeight: '800', fontSize: 13, textAlign: 'center' }}>🏆 {match.result}</Text>
          </View>
        )}
      </View>
      <InningsSection inn={inn1} bowlingInn={inn2} label={`1st Innings · ${inn1.battingTeam || match.team1}`} />
      <InningsSection inn={inn2} bowlingInn={inn1} label={`2nd Innings · ${inn2.battingTeam || match.team2}`} />
      <Text style={{ color: T.muted, fontSize: 9, textAlign: 'center', marginTop: 6, letterSpacing: 0.5 }}>
        Score. Share. Celebrate.  ·  CrickyWorld
      </Text>
    </View>
  )

  if (ViewShot && forwardRef) {
    return <ViewShot ref={forwardRef} options={{ format: 'png', quality: 0.95 }}>{inner}</ViewShot>
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

// ── Share Modal ───────────────────────────────────────────────────────────────
function ShareModal({ visible, onClose, onShareText, onShareImage, onSharePdf, isCapturing }: {
  visible: boolean; onClose: () => void
  onShareText: () => void; onShareImage: () => void; onSharePdf: () => void
  isCapturing: boolean
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={SM.backdrop} onPress={onClose} />
      <View style={SM.sheet}>
        <View style={SM.handle} />
        <Text style={SM.title}>SHARE MATCH REPORT</Text>
        <View style={SM.formatRow}>
          <Pressable onPress={onShareImage} disabled={isCapturing}
            style={[SM.formatBtn, { borderColor: T.accent + '66', backgroundColor: T.accentDim + '44' }]}>
            {isCapturing
              ? <ActivityIndicator color={T.accent} size="small" />
              : <Text style={{ fontSize: 28 }}>🖼️</Text>}
            <Text style={[SM.fmtLabel, { color: T.accent }]}>Image</Text>
            <Text style={SM.fmtSub}>Best for social</Text>
          </Pressable>
          <Pressable onPress={onShareText}
            style={[SM.formatBtn, { borderColor: T.sky + '66', backgroundColor: '#0e2740' }]}>
            <Text style={{ fontSize: 28 }}>📄</Text>
            <Text style={[SM.fmtLabel, { color: T.sky }]}>Text</Text>
            <Text style={SM.fmtSub}>Quick & universal</Text>
          </Pressable>
          <Pressable onPress={onSharePdf}
            style={[SM.formatBtn, { borderColor: T.red + '66', backgroundColor: '#2a0e0e' }]}>
            <Text style={{ fontSize: 28 }}>📕</Text>
            <Text style={[SM.fmtLabel, { color: T.red }]}>PDF</Text>
            <Text style={SM.fmtSub}>Print to save</Text>
          </Pressable>
        </View>
        <Pressable onPress={onClose} style={SM.cancelBtn}>
          <Text style={{ color: T.sub, fontWeight: '700', fontSize: 14 }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const SM = StyleSheet.create({
  backdrop:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: T.border },
  handle:    { width: 40, height: 4, backgroundColor: T.muted, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  title:     { color: T.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center', marginBottom: 16 },
  formatRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  formatBtn: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 6 },
  fmtLabel:  { fontWeight: '800', fontSize: 15 },
  fmtSub:    { color: T.muted, fontSize: 11 },
  cancelBtn: { padding: 13, borderRadius: 12, backgroundColor: T.border2, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
})

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function MatchReportScreen() {
  const route      = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const { id }     = route.params

  const [match,     setMatch]     = useState<MatchData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [shareOpen, setShareOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
  const [activeInn, setActiveInn] = useState<'innings1' | 'innings2'>('innings1')
  const shotRef = useRef<any>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const token    = await AsyncStorage.getItem('token').catch(() => null)
        const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
        const baseUrl  = apiUrl(`/api/matches/${id}`)
        const url      = !token && deviceId ? `${baseUrl}?deviceId=${deviceId}` : baseUrl
        const res      = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        setMatch(await res.json() as MatchData)
      } catch { /* handled below */ }
      finally { setLoading(false) }
    }
    load()
  }, [id])

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

  // ── FIX: Safe-guard innings — never undefined ─────────────────────────────
  const battingFirst = match.battingFirst || match.team1
  const inn1: Innings = match.innings1
    ? { ...match.innings1, battingTeam: match.innings1.battingTeam || battingFirst }
    : emptyInnings(battingFirst)
  const inn2: Innings = match.innings2
    ? { ...match.innings2, battingTeam: match.innings2.battingTeam || (battingFirst === match.team1 ? match.team2 : match.team1) }
    : emptyInnings(battingFirst === match.team1 ? match.team2 : match.team1)

  const activeInnings = activeInn === 'innings1' ? inn1 : inn2

  const handleShareText = async () => {
    try {
      await Share.share({
        message: buildTextReport(match, inn1, inn2),
        title: `${match.team1} vs ${match.team2} — CrickyWorld`,
      })
    } catch { /* user cancelled */ }
    setShareOpen(false)
  }

  const handleShareImage = async () => {
    if (captureRef && shotRef.current) {
      try {
        setCapturing(true)
        const uri = await captureRef(shotRef.current, { format: 'png', quality: 0.95 })
        setShareOpen(false)
        await Share.share({
          url: uri,
          message: `${match.team1} vs ${match.team2} — ${match.result || 'Match Report'}\nGenerated by CrickyWorld 🏏`,
          title: `${match.team1} vs ${match.team2} — CrickyWorld`,
        })
      } catch (e: any) {
        if (!e?.message?.includes('cancel')) {
          // Fallback: show on-screen scorecard for manual screenshot
          setImagePreviewOpen(true)
        }
      } finally {
        setCapturing(false)
        setShareOpen(false)
      }
      return
    }
    // No view-shot available — show on-screen scorecard for manual screenshot
    setShareOpen(false)
    setImagePreviewOpen(true)
  }

  const handleSharePdf = async () => {
    if (RNHTMLtoPDF) {
      try {
        setCapturing(true)
        const html = buildHtmlReport(match, inn1, inn2)
        const file = await RNHTMLtoPDF.convert({
          html,
          fileName: `MatchReport_${match.team1}_vs_${match.team2}`.replace(/\s+/g, '_'),
          base64: false,
        })
        setShareOpen(false)
        await Share.share({
          url: Platform.OS === 'android' ? `file://${file.filePath}` : file.filePath,
          title: `${match.team1} vs ${match.team2} — CrickyWorld`,
        })
      } catch (e: any) {
        if (!e?.message?.includes('cancel')) {
          handleShareText()
        }
      } finally {
        setCapturing(false)
        setShareOpen(false)
      }
      return
    }
    // PDF generation unavailable — fall back to text share
    setShareOpen(false)
    handleShareText()
  }

  // ── Sub-components ────────────────────────────────────────────────────────
  const BatTable = ({ inn }: { inn: Innings }) => {
    const hs = Math.max(...(inn.battingStats || []).map(p => p.runs), 0)
    return (
      <View style={S.table}>
        <View style={S.tableHead}>
          {['BATTER', 'R', 'B', '4s', '6s', 'SR'].map((h, i) => (
            <Text key={h} style={[S.th, i === 0 && { flex: 2.5, textAlign: 'left', color: T.gold }]}>{h}</Text>
          ))}
        </View>
        {(inn.battingStats || []).length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: T.muted, fontSize: 12 }}>No batting data yet</Text>
          </View>
        )}
        {(inn.battingStats || []).map((p, i) => (
          <View key={i} style={[S.tableRow, i % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.015)' }]}>
            <View style={{ flex: 2.5 }}>
              <Text style={[S.playerName, p.runs === hs && hs > 0 && { color: T.gold }]} numberOfLines={1}>
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
        ))}
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
      {(inn.bowlingStats || []).length === 0 && (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: T.muted, fontSize: 12 }}>No bowling data yet</Text>
        </View>
      )}
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

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Header */}
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

        {/* Summary card */}
        <View style={S.summaryCard}>
          {[inn1, inn2].map((inn, i) => (
            <View key={i} style={[S.scoreRow, i === 0 && { borderBottomWidth: 0.5, borderBottomColor: T.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={S.teamName}>{inn.battingTeam || (i === 0 ? match.team1 : match.team2)}</Text>
                <Text style={{ color: T.muted, fontSize: 10 }}>{i === 0 ? '1st Innings' : '2nd Innings'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={S.teamScore}>{inn.runs}/{inn.wickets}</Text>
                <Text style={{ color: T.sub, fontSize: 11 }}>({fmtOv(inn.balls)} ov)</Text>
              </View>
            </View>
          ))}
          {match.result && (
            <View style={S.resultBand}>
              <Text style={S.resultText}>🏆  {match.result}</Text>
            </View>
          )}
          {match.tossWinner && (
            <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: T.border }}>
              <Text style={{ color: T.muted, fontSize: 10 }}>🪙 {match.tossWinner} won toss</Text>
            </View>
          )}
        </View>

        {/* Innings tabs */}
        <View style={S.innTabs}>
          {(['innings1', 'innings2'] as const).map((k, i) => {
            const inn = k === 'innings1' ? inn1 : inn2
            const active = activeInn === k
            return (
              <Pressable android_ripple={{ color: 'rgba(255,255,255,0.1)' }} key={k}
                onPress={() => setActiveInn(k)}
                style={[S.innTab, active && { borderBottomColor: T.accent, borderBottomWidth: 2 }]}>
                <Text style={[S.innTabTxt, active && { color: T.accent }]} numberOfLines={1}>
                  {inn.battingTeam || (i === 0 ? match.team1 : match.team2)}
                </Text>
                <Text style={{ color: active ? T.accent : T.muted, fontSize: 12, fontWeight: '700' }}>
                  {inn.runs}/{inn.wickets}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Active innings detail */}
        <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
          <Text style={S.sectionLabel}>
            🏏 {activeInnings.battingTeam || (activeInn === 'innings1' ? match.team1 : match.team2)} — BATTING
          </Text>
          <BatTable inn={activeInnings} />

          <Text style={[S.sectionLabel, { color: T.purple, marginTop: 14 }]}>
            🎳 BOWLING vs {activeInnings.battingTeam || (activeInn === 'innings1' ? match.team1 : match.team2)}
          </Text>
          <BowlTable inn={activeInn === 'innings1' ? inn2 : inn1} />
        </View>

      </ScrollView>

      {/* Hidden capture target (used only if view-shot works) */}
      <View style={{ position: 'absolute', left: -9999, top: 0 }}>
        <ScorecardImage match={match} inn1={inn1} inn2={inn2} forwardRef={shotRef} />
      </View>

      {/* Full-screen image preview for manual screenshot */}
      <Modal visible={imagePreviewOpen} animationType="slide" onRequestClose={() => setImagePreviewOpen(false)}>
        <View style={{ flex: 1, backgroundColor: T.bg }}>
          <View style={[S.header, { justifyContent: 'space-between' }]}>
            <Text style={S.headerTitle}>📸 Screenshot to Share</Text>
            <Pressable android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              onPress={() => setImagePreviewOpen(false)} style={S.backBtn}>
              <Text style={{ color: T.sub, fontSize: 16 }}>✕</Text>
            </Pressable>
          </View>
          <View style={{ padding: 8, backgroundColor: T.card2 }}>
            <Text style={{ color: T.gold, fontSize: 12, textAlign: 'center', fontWeight: '700' }}>
              Take a screenshot now and share it from your gallery
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 16, paddingBottom: 40 }}>
            <ScorecardImage match={match} inn1={inn1} inn2={inn2} />
          </ScrollView>
        </View>
      </Modal>

      {/* FAB */}
      <Pressable android_ripple={{ color: 'rgba(0,0,0,0.2)', radius: 28 }}
        onPress={() => setShareOpen(true)} style={S.fab}>
        <Text style={{ fontSize: 20 }}>📤</Text>
      </Pressable>

      <ShareModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onShareText={handleShareText}
        onShareImage={handleShareImage}
        onSharePdf={handleSharePdf}
        isCapturing={capturing}
      />
    </View>
  )
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 50 : 36, paddingBottom: 12, backgroundColor: T.card, borderBottomWidth: 0.5, borderBottomColor: T.border },
  backBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: T.border2, borderWidth: 0.5, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: T.text, fontWeight: '700', fontSize: 16 },
  headerSub:   { color: T.sub, fontSize: 10, fontWeight: '600', marginTop: 1 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: T.accentDim + '55', borderWidth: 1, borderColor: T.accent + '44' },
  shareBtnTxt: { color: T.accent, fontSize: 13, fontWeight: '800' },

  summaryCard: { margin: 12, backgroundColor: T.card, borderRadius: 16, borderWidth: 0.5, borderColor: T.border, overflow: 'hidden' },
  scoreRow:    { flexDirection: 'row', alignItems: 'center', padding: 14 },
  teamName:    { color: T.text, fontWeight: '700', fontSize: 15 },
  teamScore:   { color: T.text, fontWeight: '800', fontSize: 22, letterSpacing: -0.5 },
  resultBand:  { backgroundColor: 'rgba(245,158,11,0.07)', borderTopWidth: 0.5, borderTopColor: 'rgba(245,158,11,0.25)', paddingVertical: 10, alignItems: 'center' },
  resultText:  { color: T.gold, fontWeight: '800', fontSize: 14 },

  innTabs:   { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: T.border, backgroundColor: T.card },
  innTab:    { flex: 1, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  innTabTxt: { color: T.muted, fontWeight: '700', fontSize: 12, marginBottom: 2 },

  sectionLabel: { color: T.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  table:      { borderRadius: 10, overflow: 'hidden', borderWidth: 0.5, borderColor: T.border, marginBottom: 4 },
  tableHead:  { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: T.card2, borderBottomWidth: 0.5, borderBottomColor: T.border },
  th:         { flex: 1, textAlign: 'right', fontSize: 9, color: T.muted, fontWeight: '800', letterSpacing: 0.8 },
  tableRow:   { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
  playerName: { color: T.text, fontWeight: '600', fontSize: 12, flex: 1 },
  dismissal:  { color: T.muted, fontSize: 10, marginTop: 1 },
  statCell:   { flex: 1, textAlign: 'right', fontSize: 12, color: T.sub, fontFamily: 'monospace' },

  fab: { position: 'absolute', bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: T.accent, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12 },
})