// src/screens/TournamentsScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Tournament System (Enhanced v2)
// New features:
//   • Edit tournament (rename, change format/overs/settings at any time)
//   • Delete tournament (with confirmation)
//   • Add/remove teams even after fixture generation
//   • Tournament Stats tab — most runs, wickets, sixes, fours, balls faced,
//     overs bowled, economy, strike rate, 50s, 100s, 5-fers, hat-tricks
//   • Most Valuable Player (MVP) award with composite score
//   • Player Profile modal — career stats inside this tournament
//   • Records section — highest score, best bowling, best partnership, etc.
//   • Improved home screen with tournament status badges
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState, useCallback, useEffect, useReducer, useMemo,
} from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  StyleSheet, ActivityIndicator, Alert, StatusBar, Platform, Pressable,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl, jsonHeaders, authHeaders } from '../services/api'
import type { RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: '#0a0a0a', surface: '#111', card: '#181818', border: '#2a2a2a',
  accent: '#e53e3e', accentDim: '#3a0a0a',
  gold: '#f59e0b', goldDim: '#78350f',
  green: '#22c55e', greenDim: '#14532d',
  red: '#e53e3e', redDim: '#3a0a0a',
  orange: '#f97316', sky: '#60a5fa', purple: '#a78bfa',
  text: '#f5f5f5', textMid: '#a3a3a3', textDim: '#525252',
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10)
const fmt2 = (n: number) => (!isFinite(n) || isNaN(n) ? '0.00' : n.toFixed(2))
const ovsDisp = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
const sr    = (r: number, b: number) => b > 0 ? fmt2((r / b) * 100) : '—'
const econ  = (r: number, b: number) => b > 0 ? fmt2((r / b) * 6) : '—'
const pct   = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

// ── Storage ───────────────────────────────────────────────────────────────────
const SK = 'cw_tournaments_v4'
async function loadState(): Promise<any | null> {
  try { const s = await AsyncStorage.getItem(SK); return s ? JSON.parse(s) : null } catch { return null }
}
async function persistState(s: any): Promise<void> {
  try { await AsyncStorage.setItem(SK, JSON.stringify(s)) } catch {}
}
async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('token').catch(() => null)
}

// ── Formats ───────────────────────────────────────────────────────────────────
const FORMATS = [
  { key: 'round_robin',   label: 'Round Robin',       icon: '⟳',   desc: 'Every team plays every other once.',      minTeams: 2 },
  { key: 'double_rr',    label: 'Double Round Robin', icon: '⟳⟳',  desc: 'Every team plays every other twice.',    minTeams: 2 },
  { key: 'knockout',     label: 'Knockout',           icon: '⚡',   desc: 'Lose = out. Winner advances.',           minTeams: 2 },
  { key: 'top2_final',   label: 'Top 2 Final',        icon: '🥇',   desc: 'League stage then top-2 final.',         minTeams: 3 },
  { key: 'ipl_playoffs', label: 'IPL Playoffs',       icon: '🏆',   desc: 'Top 4 → Qual 1, Elim, Qual 2, Final.',  minTeams: 4 },
  { key: 'semi_final',   label: 'Semi Final Format',  icon: '🎯',   desc: 'Top 4 → Semis → Final.',                minTeams: 4 },
]

// ── Fixture generation ────────────────────────────────────────────────────────
function balancedRR(teams: string[]): [string, string][][] {
  const ts = [...teams]
  if (ts.length % 2 !== 0) ts.push('__BYE__')
  const n = ts.length, rounds = n - 1, perRound = n / 2
  const schedule: [string, string][][] = []
  const arr = [...ts]
  for (let r = 0; r < rounds; r++) {
    const round: [string, string][] = []
    for (let i = 0; i < perRound; i++) {
      const t1 = arr[i], t2 = arr[n - 1 - i]
      if (t1 !== '__BYE__' && t2 !== '__BYE__') round.push([t1, t2])
    }
    schedule.push(round)
    const last = arr.pop()!; arr.splice(1, 0, last)
  }
  return schedule
}

function makeFixtures(teams: string[], fmt: string): any[] {
  const out: any[] = []; let n = 1
  const mk = (t1: string, t2: string, stage: string) => ({
    id: uid(), team1: t1, team2: t2, stage, status: 'scheduled',
    matchNo: n++, date: '', time: '', overs: null,
  })
  const league = (ts: string[], stage: string) =>
    balancedRR(ts).forEach(round => round.forEach(([t1, t2]) => out.push(mk(t1, t2, stage))))

  if (fmt === 'round_robin')    { league(teams, 'League') }
  else if (fmt === 'double_rr') { league(teams, 'League'); balancedRR(teams).forEach(round => round.forEach(([t1, t2]) => out.push(mk(t2, t1, 'League (Leg 2)')))) }
  else if (fmt === 'knockout')  { const sh = [...teams].sort(() => Math.random() - 0.5); const rNames = ['Final','Semi Final','Quarter Final','Round of 16']; const rounds = Math.ceil(Math.log2(sh.length)); let rt = [...sh]; for (let r = 0; r < rounds; r++) { const label = rNames[rounds-1-r] || `Round ${r+1}`; for (let i = 0; i < Math.floor(rt.length/2); i++) out.push(mk(rt[i*2]||'TBD', rt[i*2+1]||'TBD', label)); rt = Array(Math.ceil(rt.length/2)).fill('TBD') } }
  else if (fmt === 'top2_final'){ league(teams, 'League'); out.push(mk('1st Place','2nd Place','Final')) }
  else if (fmt === 'ipl_playoffs'){ league(teams, 'League'); out.push(mk('1st','2nd','Qualifier 1')); out.push(mk('3rd','4th','Eliminator')); out.push(mk('Q1 Loser','Elim Winner','Qualifier 2')); out.push(mk('Q1 Winner','Q2 Winner','Final')) }
  else if (fmt === 'semi_final') { if (teams.length > 4) league(teams, 'League'); const sf = teams.length <= 4; out.push(mk(sf?teams[0]||'T1':'1st', sf?teams[3]||'T4':'4th', 'Semi Final 1')); out.push(mk(sf?teams[1]||'T2':'2nd', sf?teams[2]||'T3':'3rd', 'Semi Final 2')); out.push(mk('SF1 Winner','SF2 Winner','Final')) }
  return out
}

// ── Points table calc ─────────────────────────────────────────────────────────
function calcTable(teams: string[], fixtures: any[], liveMatches: any[]) {
  const tbl: Record<string, any> = {}
  teams.forEach(t => { tbl[t] = { team: t, p:0, w:0, l:0, nr:0, pts:0, rf:0, of:0, ra:0, oa:0 } })
  fixtures.forEach(f => {
    if (f.status !== 'completed') return
    const mid = f.realMatchId || f.matchId; if (!mid) return
    const m = liveMatches.find((x: any) => (x._id || x.id) === mid)
    if (!m) {
      if (f.result && tbl[f.team1] && tbl[f.team2]) {
        tbl[f.team1].p++; tbl[f.team2].p++
        if (f.result.includes(f.team1+' won')){ tbl[f.team1].w++; tbl[f.team1].pts+=2; tbl[f.team2].l++ }
        else if(f.result.includes(f.team2+' won')){ tbl[f.team2].w++; tbl[f.team2].pts+=2; tbl[f.team1].l++ }
        else { tbl[f.team1].pts++; tbl[f.team2].pts++; tbl[f.team1].nr++; tbl[f.team2].nr++ }
      }
      return
    }
    if (!tbl[f.team1] || !tbl[f.team2]) return
    tbl[f.team1].p++; tbl[f.team2].p++
    const result = m.result || ''
    if (!result || result.includes('Tied')) { tbl[f.team1].pts++; tbl[f.team2].pts++; tbl[f.team1].nr++; tbl[f.team2].nr++ }
    else if (result.includes(f.team1+' won')) { tbl[f.team1].w++; tbl[f.team1].pts+=2; tbl[f.team2].l++ }
    else if (result.includes(f.team2+' won')) { tbl[f.team2].w++; tbl[f.team2].pts+=2; tbl[f.team1].l++ }
  })
  return Object.values(tbl)
    .map(r => ({ ...r, nrr: parseFloat((r.of>0&&r.oa>0?(r.rf/r.of)-(r.ra/r.oa):0).toFixed(3)) }))
    .sort((a, b) => b.pts-a.pts || b.nrr-a.nrr)
}

// ── Tournament Stats aggregation ──────────────────────────────────────────────
// Handles every common CrickyWorld API shape:
//   • m.innings1 / m.innings2  (nested innings objects)
//   • m.scorecard[]            (array of innings)
//   • m.score / m.batting[]    (flat)
//   • m.innings[]              (generic innings array)
//   • m.firstInnings / m.secondInnings
//   • m.team1Score, m.team2Score with m.team1Players, m.team2Players
//   • Batsman fields: name/playerName/batsman, runs/runsScored, balls/ballsFaced,
//                     fours/boundaries, sixes, dismissed/isOut/wicket/out,
//                     notOut, status
//   • Bowler  fields: name/playerName/bowler, wickets/wkts, runs/runsConceded,
//                     overs/ballsBowled, maidens/maidenOvers, economy
// ─────────────────────────────────────────────────────────────────────────────

interface PlayerStat {
  name: string; team: string
  innings: number; runs: number; balls: number; hs: number
  fours: number; sixes: number; fifties: number; hundreds: number; notOuts: number
  wickets: number; overs: number; runsConceded: number; maidens: number
  fifers: number; bestBowlRuns: number; bestBowlWkts: number
  catches: number; runouts: number; stumpings: number
}

// Pull a string/number field from an object trying multiple key names
function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  return undefined
}

// Normalise overs: could be 3.4 (3 overs 4 balls) or integer ball count
function normOvers(raw: any): number {
  if (raw === undefined || raw === null) return 0
  const n = typeof raw === 'string' ? parseFloat(raw) : raw
  if (!isFinite(n)) return 0
  // If stored as balls (e.g. 24 balls = 4.0 overs)
  if (Number.isInteger(n) && n > 50) return n / 6
  // Standard x.y notation where y is extra balls
  const whole = Math.floor(n), frac = Math.round((n - whole) * 10)
  return whole + frac / 6
}

function aggregateStats(liveMatches: any[]): { players: PlayerStat[], records: any } {
  const map: Record<string, PlayerStat> = {}
  const ensure = (name: string, team: string): PlayerStat => {
    const key = name.trim()
    if (!map[key]) map[key] = {
      name: key, team,
      innings: 0, runs: 0, balls: 0, hs: 0, fours: 0, sixes: 0,
      fifties: 0, hundreds: 0, notOuts: 0,
      wickets: 0, overs: 0, runsConceded: 0, maidens: 0,
      fifers: 0, bestBowlRuns: 9999, bestBowlWkts: 0,
      catches: 0, runouts: 0, stumpings: 0,
    }
    return map[key]
  }

  let highestScore = { name: '', team: '', score: 0, notOut: false, match: '' }
  let bestBowling  = { name: '', team: '', wkts: 0, runs: 9999, match: '' }
  let highestTotal = { team: '', score: 0, overs: '', match: '' }
  let lowestTotal  = { team: '', score: 9999, overs: '', match: '' }

  // ── Parse one innings block ─────────────────────────────────────────────────
  const parseInnings = (inn: any, battingTeam: string, bowlingTeam: string, matchLabel: string) => {
    if (!inn || typeof inn !== 'object') return

    // ── Team total ──────────────────────────────────────────────────────────
    const total = pick(inn, 'totalRuns','runs','score','total','runsScored') ?? 0
    const ballsPlayed = pick(inn, 'totalBalls','balls','ballsPlayed','deliveries') ?? 0
    const oversStr = ovsDisp(typeof ballsPlayed === 'number' ? ballsPlayed : parseInt(ballsPlayed) || 0)
    if (total > highestTotal.score) highestTotal = { team: battingTeam, score: total, overs: oversStr, match: matchLabel }
    if (total > 0 && total < lowestTotal.score) lowestTotal = { team: battingTeam, score: total, overs: oversStr, match: matchLabel }

    // ── Batting ─────────────────────────────────────────────────────────────
    const batArr: any[] = (
      pick(inn, 'batting','batsmen','batters','players','scorecard','battingCard') || []
    )
    if (Array.isArray(batArr)) {
      batArr.forEach((b: any) => {
        if (!b || typeof b !== 'object') return
        const name = pick(b, 'name','playerName','batsman','player','batsmanName')
        if (!name || typeof name !== 'string' || !name.trim()) return
        const runs  = parseInt(pick(b,'runs','runsScored','r','score') ?? 0)
        const balls = parseInt(pick(b,'balls','ballsFaced','bf','b') ?? 0)
        if (runs === 0 && balls === 0) return   // DNB / never faced
        const fours = parseInt(pick(b,'fours','boundaries','4s','four') ?? 0)
        const sixes = parseInt(pick(b,'sixes','6s','six') ?? 0)
        const team  = pick(b,'team','teamName') || battingTeam

        // dismissed check — various shapes
        const dismissed = (() => {
          const d = pick(b,'dismissed','isOut','out','wicket','status','howOut')
          if (d === undefined || d === null) return false
          if (typeof d === 'boolean') return d
          if (typeof d === 'number') return d === 1
          const ds = String(d).toLowerCase()
          return ds === 'true' || ds === '1' || ds === 'out' ||
            ds.includes('bowled') || ds.includes('caught') || ds.includes('lbw') ||
            ds.includes('run out') || ds.includes('stumped') || ds.includes('hit')
        })()
        const notOut = pick(b,'notOut','not_out') === true || !dismissed

        const p = ensure(name, team)
        p.innings++
        p.runs  += runs
        p.balls += balls
        p.fours += fours
        p.sixes += sixes
        if (notOut) p.notOuts++
        if (runs >= 100) p.hundreds++
        else if (runs >= 50) p.fifties++
        if (runs > p.hs) p.hs = runs
        if (runs > highestScore.score) highestScore = { name, team, score: runs, notOut, match: matchLabel }
      })
    }

    // ── Bowling ─────────────────────────────────────────────────────────────
    const bowlArr: any[] = (
      pick(inn, 'bowling','bowlers','bowlingCard') || []
    )
    if (Array.isArray(bowlArr)) {
      bowlArr.forEach((bw: any) => {
        if (!bw || typeof bw !== 'object') return
        const name = pick(bw,'name','playerName','bowler','player','bowlerName')
        if (!name || typeof name !== 'string' || !name.trim()) return
        const wkts = parseInt(pick(bw,'wickets','wkts','w','wicket') ?? 0)
        const rc   = parseInt(pick(bw,'runs','runsConceded','runsGiven','runsAllowed','r') ?? 0)
        const ovRaw = pick(bw,'overs','ballsBowled','ov','o')
        const ovs  = normOvers(ovRaw)
        const mdn  = parseInt(pick(bw,'maidens','maidenOvers','maiden','m') ?? 0)
        const team = pick(bw,'team','teamName') || bowlingTeam

        const p = ensure(name, team)
        p.wickets      += wkts
        p.runsConceded += rc
        p.overs        += ovs
        p.maidens      += mdn
        if (wkts >= 5) p.fifers++
        if (wkts > p.bestBowlWkts || (wkts === p.bestBowlWkts && rc < p.bestBowlRuns)) {
          p.bestBowlWkts = wkts; p.bestBowlRuns = rc
        }
        if (wkts > bestBowling.wkts || (wkts === bestBowling.wkts && rc < bestBowling.runs)) {
          bestBowling = { name, team, wkts, runs: rc, match: matchLabel }
        }
      })
    }

    // ── Fielding (optional) ──────────────────────────────────────────────────
    const fieldArr: any[] = (pick(inn,'fielding','fieldingCard') || [])
    if (Array.isArray(fieldArr)) {
      fieldArr.forEach((f: any) => {
        if (!f || typeof f !== 'object') return
        const name = pick(f,'name','playerName','player')
        if (!name || typeof name !== 'string') return
        const team = pick(f,'team') || bowlingTeam
        const p = ensure(name, team)
        p.catches   += parseInt(pick(f,'catches','catch') ?? 0)
        p.runouts   += parseInt(pick(f,'runouts','runOut','run_out') ?? 0)
        p.stumpings += parseInt(pick(f,'stumpings','stumping') ?? 0)
      })
    }

    // ── Extract catches from dismissal info in batting (if no fielding array) ─
    if (!Array.isArray(fieldArr) || fieldArr.length === 0) {
      if (Array.isArray(batArr)) {
        batArr.forEach((b: any) => {
          if (!b) return
          const howOut = String(pick(b,'howOut','dismissal','dismissalType','wicketType') || '').toLowerCase()
          const fielder = pick(b,'caughtBy','fielder','fieldedBy','fieldedByName','catcherName')
          if (fielder && typeof fielder === 'string' && fielder.trim()) {
            const fp = ensure(fielder.trim(), bowlingTeam)
            if (howOut.includes('caught')) fp.catches++
            else if (howOut.includes('run out')) fp.runouts++
            else if (howOut.includes('stump')) fp.stumpings++
          }
        })
      }
    }
  }

  // ── Process each match ──────────────────────────────────────────────────────
  liveMatches.forEach((m: any) => {
    if (!m || typeof m !== 'object') return
    // Accept both completed and live (partial stats) matches
    if (m.status === 'abandoned' || m.status === 'cancelled') return

    const t1 = m.team1 || m.teamA || ''
    const t2 = m.team2 || m.teamB || ''
    const matchLabel = `${t1} vs ${t2}`
    const battingFirst: string = m.battingFirst || m.battingTeam || t1

    // ── Shape A: m.innings1 / m.innings2 ──────────────────────────────────
    if (m.innings1 || m.innings2) {
      const i1Team = battingFirst || t1
      const i2Team = i1Team === t1 ? t2 : t1
      if (m.innings1) parseInnings(m.innings1, i1Team, i1Team===t1?t2:t1, matchLabel)
      if (m.innings2) parseInnings(m.innings2, i2Team, i2Team===t1?t2:t1, matchLabel)
      return
    }

    // ── Shape B: m.firstInnings / m.secondInnings ─────────────────────────
    if (m.firstInnings || m.secondInnings) {
      const i1Team = battingFirst || t1
      const i2Team = i1Team === t1 ? t2 : t1
      if (m.firstInnings)  parseInnings(m.firstInnings,  i1Team, i1Team===t1?t2:t1, matchLabel)
      if (m.secondInnings) parseInnings(m.secondInnings, i2Team, i2Team===t1?t2:t1, matchLabel)
      return
    }

    // ── Shape C: m.scorecard[] array of innings ────────────────────────────
    if (Array.isArray(m.scorecard) && m.scorecard.length > 0) {
      m.scorecard.forEach((inn: any, idx: number) => {
        const batTeam = pick(inn,'team','battingTeam') || (idx===0 ? battingFirst||t1 : idx===0?t1:t2)
        const bowlTeam = batTeam === t1 ? t2 : t1
        parseInnings(inn, batTeam, bowlTeam, matchLabel)
      })
      return
    }

    // ── Shape D: m.innings[] array ─────────────────────────────────────────
    if (Array.isArray(m.innings) && m.innings.length > 0) {
      m.innings.forEach((inn: any, idx: number) => {
        const batTeam = pick(inn,'team','battingTeam') || (idx===0 ? battingFirst||t1 : idx===0?t1:t2)
        const bowlTeam = batTeam === t1 ? t2 : t1
        parseInnings(inn, batTeam, bowlTeam, matchLabel)
      })
      return
    }

    // ── Shape E: flat match object with batting/bowling directly on m ──────
    if (Array.isArray(m.batting) || Array.isArray(m.batsmen) || Array.isArray(m.batters)) {
      parseInnings(m, battingFirst||t1, battingFirst===t1?t2:t1, matchLabel)
      return
    }

    // ── Shape F: m.team1Score / m.team2Score with players nested ──────────
    // e.g. { team1Score: { runs, batting:[], bowling:[] }, team2Score: {...} }
    if (m.team1Score || m.team2Score) {
      if (m.team1Score) parseInnings(m.team1Score, t1, t2, matchLabel)
      if (m.team2Score) parseInnings(m.team2Score, t2, t1, matchLabel)
    }
  })

  // ── Finalise ───────────────────────────────────────────────────────────────
  if (lowestTotal.score === 9999) lowestTotal = { team: '', score: 0, overs: '', match: '' }
  if (bestBowling.runs === 9999) bestBowling = { ...bestBowling, runs: 0 }

  const players = Object.values(map).map(p => ({
    ...p,
    // Fix bestBowlRuns sentinel if no bowling done
    bestBowlRuns: p.bestBowlRuns === 9999 ? 0 : p.bestBowlRuns,
    // MVP composite: runs÷10 + wkts×15 + (catches+stumpings)×5 + runouts×3
    mvpScore: (p.runs / 10) + (p.wickets * 15) + ((p.catches + p.stumpings) * 5) + (p.runouts * 3),
  })).sort((a: any, b: any) => b.mvpScore - a.mvpScore)

  return { players, records: { highestScore, bestBowling, highestTotal, lowestTotal } }
}

// ── REDUCER ───────────────────────────────────────────────────────────────────
const INIT = { tournaments: [], activeTid: null, view: 'home', activeFid: null }

function reducer(state: any, action: any): any {
  const upT = (tid: string, fn: (t: any) => any) => ({
    ...state,
    tournaments: state.tournaments.map((t: any) => t.id === tid ? fn(t) : t),
  })
  switch (action.type) {
    case 'LOAD':    return { ...action.state }
    case 'CREATE_T': {
      const t = {
        id: uid(), name: action.name, format: 'round_robin',
        defaultOvers: 10, wideRuns: 1, noBallRuns: 1,
        teamCount: 2, teams: ['',''], fixtures: [], createdAt: Date.now(),
      }
      return { ...state, tournaments: [...state.tournaments, t], activeTid: t.id, view: 'setup' }
    }
    case 'OPEN_T':   return { ...state, activeTid: action.id, view: 'fixtures' }
    case 'SET_VIEW': return { ...state, view: action.view }
    case 'DELETE_T': return { ...state, tournaments: state.tournaments.filter((t: any) => t.id !== action.tid), activeTid: null, view: 'home' }
    case 'RENAME_T': return upT(action.tid, t => ({ ...t, name: action.name }))
    case 'SET_COUNT': return upT(action.tid, t => {
      const c = Math.max(2, Math.min(16, action.c))
      return { ...t, teamCount: c, teams: Array.from({ length: c }, (_: any, i: number) => t.teams[i] || '') }
    })
    case 'SET_NAME': return upT(action.tid, t => {
      const teams = [...t.teams]; teams[action.i] = action.v; return { ...t, teams }
    })
    case 'SAVE_SETTINGS': return upT(action.tid, t => ({
      ...t, format: action.fmt, defaultOvers: action.overs,
      wideRuns: action.wide, noBallRuns: action.nb,
    }))
    case 'GEN':      return upT(action.tid, t => {
      const valid = (t.teams||[]).filter((x: string) => x.trim())
      return { ...t, fixtures: makeFixtures(valid, t.format) }
    })
    case 'ADD_FIX':  return upT(action.tid, t => ({
      ...t, fixtures: [...(t.fixtures||[]), {
        id: uid(), team1: action.t1, team2: action.t2, stage: action.stage,
        status: 'scheduled', matchNo: (t.fixtures?.length||0)+1, date: '', time: '', overs: null,
      }],
    }))
    case 'DEL_FIX':  return upT(action.tid, t => ({ ...t, fixtures: t.fixtures.filter((f: any) => f.id !== action.fid) }))
    case 'SET_FIXTURE_MATCH': return upT(action.tid, t => ({
      ...t, fixtures: t.fixtures.map((fx: any) =>
        fx.id === action.fid ? { ...fx, status: 'live', realMatchId: action.matchId, overs: action.overs } : fx
      ),
    }))
    case 'MARK_FIXTURE_COMPLETE': return upT(action.tid, t => ({
      ...t, fixtures: t.fixtures.map((fx: any) =>
        fx.realMatchId === action.matchId ? { ...fx, status: 'completed', result: action.result } : fx
      ),
    }))
    case 'START_MATCH': return { ...state, activeFid: action.fid, view: 'matchSetup' }
    default: return state
  }
}

// ── Primitives ────────────────────────────────────────────────────────────────
function StagePill({ stage }: { stage: string }) {
  const s = stage.toLowerCase()
  const color = s.includes('final') && !s.includes('semi') && !s.includes('quali') ? T.gold
    : s.includes('semi') || s.includes('qualifier') || s.includes('elim') ? T.purple : T.accent
  return (
    <View style={{ backgroundColor: color+'18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, borderColor: color+'33' }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{stage}</Text>
    </View>
  )
}

function StatCard({ label, value, color = T.text, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 80, backgroundColor: T.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center', margin: 4 }}>
      <Text style={{ color, fontSize: 20, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: T.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 2, textAlign: 'center' }}>{label.toUpperCase()}</Text>
      {sub ? <Text style={{ color: T.textDim, fontSize: 10, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  )
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: T.border, marginVertical: 14 }} />
}

// ── HOME view ─────────────────────────────────────────────────────────────────
function HomeView({ state, dispatch }: { state: any; dispatch: (a: any) => void }) {
  const [name, setName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const startEdit = (t: any) => { setEditId(t.id); setEditName(t.name) }
  const saveEdit = () => {
    if (editName.trim() && editId) dispatch({ type: 'RENAME_T', tid: editId, name: editName.trim() })
    setEditId(null)
  }
  const deleteTournament = (t: any) => {
    Alert.alert('Delete Tournament', `Delete "${t.name}" and all its fixtures?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_T', tid: t.id }) },
    ])
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: T.accent+'44', backgroundColor: T.accent+'22', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 34 }}>🏆</Text>
        </View>
        <Text style={{ color: T.text, fontSize: 24, fontWeight: '900' }}>Tournaments</Text>
        <Text style={{ color: T.textDim, fontSize: 13, marginTop: 6, textAlign: 'center' }}>Create and manage cricket tournaments with live scoring</Text>
      </View>

      {/* New */}
      <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: T.border }}>
        <Text style={{ color: T.accent, fontWeight: '800', fontSize: 10, letterSpacing: 2, marginBottom: 14 }}>NEW TOURNAMENT</Text>
        <TextInput style={[S.input, { marginBottom: 12 }]} value={name} onChangeText={setName}
          placeholder="e.g. Office Cup 2025, IPL Season 2…" placeholderTextColor={T.textDim}
          returnKeyType="done"
          onSubmitEditing={() => { if (name.trim()) { dispatch({ type: 'CREATE_T', name: name.trim() }); setName('') } }} />
        <TouchableOpacity
          onPress={() => { if (name.trim()) { dispatch({ type: 'CREATE_T', name: name.trim() }); setName('') } }}
          disabled={!name.trim()} style={[S.btn, !name.trim() && { opacity: 0.4 }]}>
          <Text style={S.btnTxt}>+ Create Tournament</Text>
        </TouchableOpacity>
      </View>

      {/* Existing */}
      {state.tournaments.length > 0 && (
        <>
          <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 }}>YOUR TOURNAMENTS</Text>
          {[...state.tournaments].reverse().map((t: any) => {
            const done  = (t.fixtures||[]).filter((f: any) => f.status === 'completed').length
            const live  = (t.fixtures||[]).filter((f: any) => f.status === 'live').length
            const total = (t.fixtures||[]).length
            const fmt   = FORMATS.find(f => f.key === t.format)
            const isEditing = editId === t.id
            return (
              <View key={t.id} style={{ backgroundColor: T.card, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: live > 0 ? T.gold+'44' : T.border, overflow: 'hidden' }}>
                {live > 0 && <View style={{ height: 3, backgroundColor: T.gold }} />}
                <View style={{ padding: 14 }}>
                  {isEditing ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                      <TextInput style={[S.input, { flex: 1 }]} value={editName} onChangeText={setEditName}
                        autoFocus returnKeyType="done" onSubmitEditing={saveEdit} placeholderTextColor={T.textDim} />
                      <TouchableOpacity onPress={saveEdit} style={[S.btnSmall, { borderColor: T.green+'44', backgroundColor: T.greenDim }]}>
                        <Text style={{ color: T.green, fontWeight: '700' }}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditId(null)} style={S.btnSmall}>
                        <Text style={{ color: T.textMid }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: T.text, fontWeight: '800', fontSize: 15 }}>{t.name}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                          <Text style={{ color: T.textDim, fontSize: 12 }}>{(t.teams||[]).filter((x: string) => x).length} teams</Text>
                          <Text style={{ color: T.textDim, fontSize: 12 }}>{done}/{total} played</Text>
                          {live > 0 ? <Text style={{ color: T.gold, fontSize: 12 }}>● {live} LIVE</Text> : null}
                          {fmt ? <Text style={{ color: T.purple, fontSize: 12 }}>{fmt.icon} {fmt.label}</Text> : null}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Progress bar */}
                  {total > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <View style={{ height: 3, backgroundColor: T.border, borderRadius: 3 }}>
                        <View style={{ height: 3, width: `${pct(done, total)}%` as any, backgroundColor: done === total ? T.green : T.accent, borderRadius: 3 }} />
                      </View>
                    </View>
                  )}

                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => dispatch({ type: 'OPEN_T', id: t.id })}
                      style={[S.btn, { flex: 1, paddingVertical: 8 }]}>
                      <Text style={[S.btnTxt, { fontSize: 13 }]}>Open →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => startEdit(t)}
                      style={[S.btnSmall, { paddingHorizontal: 14 }]}>
                      <Text style={{ color: T.sky, fontSize: 13 }}>✏</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteTournament(t)}
                      style={[S.btnSmall, { paddingHorizontal: 14, borderColor: T.red+'33', backgroundColor: T.redDim }]}>
                      <Text style={{ color: T.red, fontSize: 13 }}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          })}
        </>
      )}
    </ScrollView>
  )
}

// ── SETUP view ────────────────────────────────────────────────────────────────
function SetupView({ t, dispatch }: { t: any; dispatch: (a: any) => void }) {
  const [fmt,   setFmt]   = useState(t.format || 'round_robin')
  const [overs, setOvers] = useState(String(t.defaultOvers || 10))
  const [wide,  setWide]  = useState(String(t.wideRuns ?? 1))
  const [nb,    setNb]    = useState(String(t.noBallRuns ?? 1))
  const [count, setCount] = useState(String(t.teamCount || 2))

  const curFmt = FORMATS.find(f => f.key === fmt)
  const valid  = (t.teams||[]).filter((x: string) => x.trim())
  const canGen = valid.length >= (curFmt?.minTeams || 2)

  const gen = () => {
    dispatch({ type: 'SAVE_SETTINGS', tid: t.id, fmt, overs: parseInt(overs)||10, wide: parseInt(wide)||1, nb: parseInt(nb)||1 })
    dispatch({ type: 'GEN', tid: t.id })
    dispatch({ type: 'SET_VIEW', view: 'fixtures' })
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <Text style={S.sectionLabel}>SCHEDULE FORMAT</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {FORMATS.map(f => (
          <TouchableOpacity key={f.key} onPress={() => setFmt(f.key)} activeOpacity={0.8}
            style={{ width: '47%', backgroundColor: fmt===f.key ? T.accentDim : T.card, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: fmt===f.key ? T.accent : T.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <Text style={{ fontSize: 18 }}>{f.icon}</Text>
              <Text style={{ color: fmt===f.key ? T.accent : T.text, fontWeight: '700', fontSize: 13, flex: 1 }}>{f.label}</Text>
            </View>
            <Text style={{ color: T.textDim, fontSize: 11, lineHeight: 16 }}>{f.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={S.sectionLabel}>MATCH SETTINGS</Text>
      <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 }}>
        {([['Default Overs', overs, setOvers], ['Wide Runs', wide, setWide], ['No-Ball Runs', nb, setNb]] as const).map(([lbl, val, setter]) => (
          <View key={lbl} style={{ marginBottom: 12 }}>
            <Text style={S.fieldLabel}>{lbl}</Text>
            <TextInput style={S.input} value={String(val)} onChangeText={setter as any}
              keyboardType="number-pad" placeholderTextColor={T.textDim} />
          </View>
        ))}
      </View>

      <Text style={S.sectionLabel}>TEAMS</Text>
      <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 }}>
        <Text style={S.fieldLabel}>NUMBER OF TEAMS</Text>
        <TextInput style={[S.input, { marginBottom: 14 }]} value={count}
          onChangeText={v => { setCount(v); const n = parseInt(v); if(n>=2&&n<=16) dispatch({ type:'SET_COUNT', tid:t.id, c:n }) }}
          keyboardType="number-pad" placeholderTextColor={T.textDim} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(t.teams||[]).map((name: string, i: number) => (
            <View key={i} style={{ width: '47%' }}>
              <Text style={S.fieldLabel}>TEAM {i+1}</Text>
              <TextInput style={S.input} value={name}
                onChangeText={v => dispatch({ type:'SET_NAME', tid:t.id, i, v })}
                placeholder={`Team ${i+1} name`} placeholderTextColor={T.textDim} />
            </View>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: canGen ? T.accentDim : T.card, borderRadius: 12, padding: 16, borderWidth: 2, borderColor: canGen ? T.accent : T.border }}>
        <Text style={{ color: canGen ? T.accent : T.textDim, fontWeight: '700', fontSize: 14, marginBottom: 4 }}>
          {canGen ? `Ready! ${valid.length} teams · ${curFmt?.label}` : `Add at least ${curFmt?.minTeams} teams`}
        </Text>
        {canGen ? <Text style={{ color: T.textDim, fontSize: 12, marginBottom: 14 }}>{curFmt?.desc}</Text> : null}
        <TouchableOpacity onPress={gen} disabled={!canGen} style={[S.btn, !canGen && { opacity: 0.4 }]}>
          <Text style={S.btnTxt}>⚡ Generate Fixtures →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

// ── FIXTURES view ─────────────────────────────────────────────────────────────
function FixturesView({ t, dispatch }: { t: any; dispatch: (a: any) => void }) {
  const navigation = useNavigation<Nav>()
  const all = t.fixtures || []
  const stages = [...new Set(all.map((f: any) => f.stage))] as string[]
  const ORDER = ['League','League (Leg 2)','Round 1','Round 2','Quarter Final','Eliminator','Semi Final','Semi Final 1','Semi Final 2','Qualifier 1','Qualifier 2','Final']
  const sorted = [...stages].sort((a, b) => {
    const ia = ORDER.findIndex(s => a.includes(s)), ib = ORDER.findIndex(s => b.includes(s))
    return (ia<0?99:ia)-(ib<0?99:ib)
  })
  const done = all.filter((f: any) => f.status === 'completed').length
  const progress = all.length > 0 ? Math.round((done/all.length)*100) : 0

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      {/* Stats bar */}
      {all.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {([['Total', all.length, T.textMid], ['Played', done, T.accent], ['Live', all.filter((f: any)=>f.status==='live').length, T.gold], ['Left', all.length-done, T.textDim]] as const).map(([l, v, c]) => (
            <View key={l} style={{ flex: 1, backgroundColor: T.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center' }}>
              <Text style={{ color: c, fontSize: 20, fontWeight: '900' }}>{v}</Text>
              <Text style={{ color: T.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1 }}>{String(l).toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}

      {all.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={{ color: T.textDim, fontSize: 11 }}>Tournament Progress</Text>
            <Text style={{ color: progress===100 ? T.green : T.accent, fontSize: 11, fontWeight: '700' }}>{progress}%{progress===100?' 🎉':''}</Text>
          </View>
          <View style={{ height: 4, backgroundColor: T.border, borderRadius: 4 }}>
            <View style={{ height: 4, width: `${progress}%` as any, backgroundColor: progress===100 ? T.green : T.accent, borderRadius: 4 }} />
          </View>
        </View>
      )}

      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <View>
          <Text style={{ color: T.text, fontWeight: '800', fontSize: 15 }}>📅 Match Schedule</Text>
          <Text style={{ color: T.textDim, fontSize: 12, marginTop: 2 }}>
            {all.length === 0 ? 'Go to Setup to generate fixtures' : `${all.length} matches · ${(t.teams||[]).filter((x: string)=>x).length} teams`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => dispatch({ type: 'SET_VIEW', view: 'setup' })}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface }}>
          <Text style={{ color: T.textMid, fontSize: 12, fontWeight: '700' }}>⚙ Setup</Text>
        </TouchableOpacity>
      </View>

      {all.length === 0 && (
        <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: T.border }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
          <Text style={{ color: T.textMid, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>No fixtures generated yet</Text>
          <TouchableOpacity onPress={() => dispatch({ type: 'SET_VIEW', view: 'setup' })} style={[S.btnSmall, { marginTop: 8 }]}>
            <Text style={S.btnSmallTxt}>← Go to Setup</Text>
          </TouchableOpacity>
        </View>
      )}

      {sorted.map(stage => {
        const stageFix = all.filter((f: any) => f.stage === stage)
        return (
          <View key={stage} style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: T.border }}>
              <StagePill stage={stage} />
              <Text style={{ color: T.textDim, fontSize: 11 }}>{stageFix.filter((f: any)=>f.status==='completed').length}/{stageFix.length} played</Text>
            </View>

            {stageFix.map((f: any) => (
              <View key={f.id} style={{ backgroundColor: T.card, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: f.status==='live' ? T.gold+'55' : f.status==='completed' ? T.green+'22' : T.border, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ width: 3, backgroundColor: f.status==='live' ? T.gold : f.status==='completed' ? T.green : T.border }} />
                  <View style={{ flex: 1, padding: 12 }}>
                    <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>MATCH {f.matchNo}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ color: T.text, fontWeight: '800', fontSize: 15 }}>{f.team1}</Text>
                      <View style={{ backgroundColor: T.surface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ color: T.textDim, fontSize: 11, fontWeight: '700' }}>VS</Text>
                      </View>
                      <Text style={{ color: T.text, fontWeight: '800', fontSize: 15 }}>{f.team2}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                      <Text style={{ color: T.textDim, fontSize: 11 }}>🎯 {f.overs || t.defaultOvers || 10} overs</Text>
                      {f.date ? <Text style={{ color: T.textDim, fontSize: 11 }}>📅 {f.date}{f.time ? ` · ${f.time}` : ''}</Text> : null}
                      {f.status === 'completed' && f.result ? <Text style={{ color: T.green, fontSize: 11, fontWeight: '700' }}>✓ {f.result}</Text> : null}
                      {f.status === 'live' ? <Text style={{ color: T.gold, fontSize: 11, fontWeight: '700' }}>● LIVE</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {f.status === 'completed' ? (
                        <View style={{ paddingHorizontal: 12, paddingVertical: 5, backgroundColor: T.green+'18', borderRadius: 8, borderWidth: 1, borderColor: T.green+'33' }}>
                          <Text style={{ color: T.green, fontSize: 12, fontWeight: '700' }}>Done ✓</Text>
                        </View>
                      ) : f.status === 'live' && f.realMatchId ? (
                        <TouchableOpacity onPress={() => navigation.navigate('Scoring', { id: f.realMatchId })}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: T.gold, borderRadius: 9 }}>
                          <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>▶ Resume</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity onPress={() => dispatch({ type: 'START_MATCH', fid: f.id })} style={S.btn}>
                            <Text style={S.btnTxt}>▶ Start</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => Alert.alert('Delete', 'Delete this fixture?', [{ text:'Cancel', style:'cancel' }, { text:'Delete', style:'destructive', onPress:()=>dispatch({ type:'DEL_FIX', tid:t.id, fid:f.id }) }])}
                            style={[S.btnSmall, { borderColor: 'rgba(255,68,68,0.3)', backgroundColor: 'rgba(255,68,68,0.1)' }]}>
                            <Text style={[S.btnSmallTxt, { color: T.red }]}>✕</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )
      })}
    </ScrollView>
  )
}

// ── POINTS TABLE view ─────────────────────────────────────────────────────────
function PointsTableView({ t, dispatch }: { t: any; dispatch: (a: any) => void }) {
  const [liveMatches, setLiveMatches] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      const realIds = (t.fixtures||[]).map((f: any) => f.realMatchId).filter(Boolean)
      if (!realIds.length) return
      const results = await Promise.all(
        realIds.map((id: string) =>
          fetch(apiUrl(`/api/matches/${id}`), { headers: authHeaders(token) }).then(r=>r.json()).catch(()=>null)
        )
      )
      const valid = results.filter(Boolean)
      setLiveMatches(valid)
      valid.forEach((m: any) => {
        if (m.status === 'completed' && m.result)
          dispatch({ type: 'MARK_FIXTURE_COMPLETE', tid: t.id, matchId: m._id, result: m.result })
      })
    }
    load()
  }, [t.id])

  const table = calcTable((t.teams||[]).filter((x: string) => x.trim()), t.fixtures||[], liveMatches)
  const headers = ['#','Team','P','W','L','NR','Pts','NRR']

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: T.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>📊 Points Table</Text>
      <Text style={{ color: T.textDim, fontSize: 12, marginBottom: 16 }}>Auto-updates after each completed match</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 8, marginBottom: 4 }}>
            {headers.map(h => (
              <Text key={h} style={{ width: h==='Team'?130:44, textAlign: h==='Team'?'left':'center', color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>{h}</Text>
            ))}
          </View>
          {table.length === 0 ? (
            <Text style={{ color: T.textDim, padding: 20, textAlign: 'center' }}>No completed matches yet</Text>
          ) : table.map((r: any, i: number) => (
            <View key={r.team} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: i<2?'#0a2118':'transparent' }}>
              <Text style={{ width: 44, textAlign: 'center', color: i<2?T.green:T.textDim, fontWeight: '700', fontSize: 13 }}>{i+1}</Text>
              <Text style={{ width: 130, color: T.text, fontWeight: '700', fontSize: 13 }}>{i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}{r.team}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{r.p}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.green, fontWeight: '700', fontSize: 13 }}>{r.w}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{r.l}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{r.nr}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.gold, fontWeight: '900', fontSize: 15 }}>{r.pts}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: r.nrr>=0?T.green:T.red, fontWeight: '600', fontSize: 12 }}>{r.nrr>=0?'+':''}{r.nrr}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  )
}

// ── PLAYER PROFILE MODAL ──────────────────────────────────────────────────────
function PlayerProfileModal({ player, visible, onClose }: { player: any | null; visible: boolean; onClose: () => void }) {
  if (!player) return null
  const avgBat = player.innings > player.notOuts ? fmt2(player.runs / (player.innings - player.notOuts)) : (player.innings > 0 ? fmt2(player.runs) : '—')
  const srBat  = sr(player.runs, player.balls)
  const econBowl = econ(player.runsConceded, player.overs * 6)
  const avgBowl  = player.wickets > 0 ? fmt2(player.runsConceded / player.wickets) : '—'

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: T.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 40, height: 4, backgroundColor: T.border, borderRadius: 4 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {/* Avatar & name */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: T.accentDim, borderWidth: 2, borderColor: T.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 32 }}>🏏</Text>
              </View>
              <Text style={{ color: T.text, fontWeight: '900', fontSize: 20 }}>{player.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
                <Text style={{ color: T.textDim, fontSize: 13 }}>{player.team}</Text>
                {(player as any).mvpScore > 0 && (
                  <View style={{ backgroundColor: T.goldDim, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: T.gold, fontSize: 11, fontWeight: '700' }}>MVP Score: {fmt2((player as any).mvpScore)}</Text>
                  </View>
                )}
              </View>
            </View>

            <Divider />

            {/* Batting */}
            <Text style={{ color: T.accent, fontWeight: '800', fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>🏏 BATTING</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              <StatCard label="Innings" value={player.innings} />
              <StatCard label="Runs"    value={player.runs}    color={T.gold} />
              <StatCard label="HS"      value={player.hs}      color={T.accent} />
              <StatCard label="Avg"     value={avgBat}         color={T.green} />
              <StatCard label="SR"      value={srBat}          color={T.sky} />
              <StatCard label="4s"      value={player.fours}   color={T.orange} />
              <StatCard label="6s"      value={player.sixes}   color={T.purple} />
              <StatCard label="50s"     value={player.fifties} />
              <StatCard label="100s"    value={player.hundreds} color={T.gold} />
            </View>

            <Divider />

            {/* Bowling */}
            <Text style={{ color: T.sky, fontWeight: '800', fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>🎳 BOWLING</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              <StatCard label="Wkts"    value={player.wickets}       color={T.accent} />
              <StatCard label="Runs"    value={player.runsConceded}  />
              <StatCard label="Overs"   value={fmt2(player.overs)}   />
              <StatCard label="Avg"     value={avgBowl}              color={T.green} />
              <StatCard label="Econ"    value={econBowl}             color={T.sky} />
              <StatCard label="Best"    value={`${player.bestBowlWkts}/${player.bestBowlRuns}`} color={T.gold} />
              <StatCard label="5-fers"  value={player.fifers}        color={T.purple} />
              <StatCard label="Maidens" value={player.maidens}       />
            </View>

            <Divider />

            {/* Fielding */}
            <Text style={{ color: T.green, fontWeight: '800', fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>🧤 FIELDING</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
              <StatCard label="Catches"   value={player.catches}   color={T.sky} />
              <StatCard label="Run Outs"  value={player.runouts}   color={T.orange} />
              <StatCard label="Stumpings" value={player.stumpings} color={T.purple} />
            </View>

            <TouchableOpacity onPress={onClose} style={[S.btn, { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border }]}>
              <Text style={[S.btnTxt, { color: T.textMid }]}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// ── STATS view ────────────────────────────────────────────────────────────────
type StatTab = 'batting' | 'bowling' | 'fielding' | 'mvp' | 'records'

function StatsView({ t }: { t: any }) {
  const [activeTab, setActiveTab] = useState<StatTab>('batting')
  const [liveMatches, setLiveMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const token = await getToken()
      const realIds = (t.fixtures||[]).map((f: any) => f.realMatchId).filter(Boolean)
      if (!realIds.length) { setLoading(false); return }
      const results = await Promise.all(
        realIds.map((id: string) =>
          fetch(apiUrl(`/api/matches/${id}`), { headers: authHeaders(token) }).then(r=>r.json()).catch(()=>null)
        )
      )
      setLiveMatches(results.filter(Boolean))
      setLoading(false)
    }
    load()
  }, [t.id])

  const { players, records } = useMemo(() => aggregateStats(liveMatches), [liveMatches])

  const STAT_TABS: { key: StatTab; icon: string; label: string }[] = [
    { key: 'batting',  icon: '🏏', label: 'Batting'  },
    { key: 'bowling',  icon: '🎳', label: 'Bowling'  },
    { key: 'fielding', icon: '🧤', label: 'Fielding' },
    { key: 'mvp',      icon: '⭐', label: 'MVP'      },
    { key: 'records',  icon: '📜', label: 'Records'  },
  ]

  const batters  = [...players].sort((a, b) => b.runs - a.runs)
  const bowlers  = [...players].filter(p => p.wickets > 0 || p.overs > 0).sort((a, b) => b.wickets - a.wickets || (a.runsConceded/Math.max(a.overs,0.1)) - (b.runsConceded/Math.max(b.overs,0.1)))
  const fielders = [...players].sort((a, b) => (b.catches+b.runouts+b.stumpings) - (a.catches+a.runouts+a.stumpings))
  const mvps     = [...players].sort((a: any, b: any) => b.mvpScore - a.mvpScore)

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={T.accent} size="large" />
      <Text style={{ color: T.textDim, marginTop: 12 }}>Loading stats…</Text>
    </View>
  )

  if (players.length === 0) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <Text style={{ fontSize: 50, marginBottom: 16 }}>📊</Text>
      <Text style={{ color: T.textMid, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>No stats yet</Text>
      <Text style={{ color: T.textDim, fontSize: 13, marginTop: 8, textAlign: 'center' }}>Stats appear after matches are completed and synced.</Text>
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 8 }}>
          {STAT_TABS.map(tab => (
            <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: activeTab===tab.key ? T.gold : 'transparent' }}>
              <Text style={{ color: activeTab===tab.key ? T.gold : T.textDim, fontWeight: '700', fontSize: 12 }}>{tab.icon} {tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* ── Batting ── */}
        {activeTab === 'batting' && (
          <>
            <Text style={{ color: T.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>🏏 Batting Rankings</Text>
            <Text style={{ color: T.textDim, fontSize: 12, marginBottom: 14 }}>Tap a player to view full profile</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {/* header */}
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 6, marginBottom: 4 }}>
                  {['#','Player','Inn','Runs','HS','Avg','SR','4s','6s','50s','100s'].map((h, i) => (
                    <Text key={h} style={{ width: i<=1?i===0?30:130:48, color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, textAlign: i===0||i>1?'center':'left' }}>{h}</Text>
                  ))}
                </View>
                {batters.map((p, i) => {
                  const avg = p.innings > p.notOuts ? fmt2(p.runs/(p.innings-p.notOuts)) : p.innings>0?fmt2(p.runs):'—'
                  return (
                    <TouchableOpacity key={p.name} onPress={() => setSelectedPlayer(p)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border }}>
                      <Text style={{ width: 30, textAlign: 'center', color: i===0?T.gold:T.textDim, fontWeight: '700', fontSize: 13 }}>{i+1}</Text>
                      <View style={{ width: 130 }}>
                        <Text style={{ color: T.text, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
                        <Text style={{ color: T.textDim, fontSize: 10 }}>{p.team}</Text>
                      </View>
                      <Text style={{ width: 48, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{p.innings}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.gold, fontWeight: '900', fontSize: 14 }}>{p.runs}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.accent, fontWeight: '700', fontSize: 13 }}>{p.hs}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.green, fontSize: 13 }}>{avg}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.sky, fontSize: 13 }}>{sr(p.runs, p.balls)}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.orange, fontSize: 13 }}>{p.fours}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.purple, fontSize: 13 }}>{p.sixes}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{p.fifties}</Text>
                      <Text style={{ width: 48, textAlign: 'center', color: T.gold, fontSize: 13 }}>{p.hundreds}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </>
        )}

        {/* ── Bowling ── */}
        {activeTab === 'bowling' && (
          <>
            <Text style={{ color: T.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>🎳 Bowling Rankings</Text>
            <Text style={{ color: T.textDim, fontSize: 12, marginBottom: 14 }}>Tap a player to view full profile</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 6, marginBottom: 4 }}>
                  {['#','Player','Wkts','Runs','Ovs','Avg','Econ','Best','5W','Mdn'].map((h, i) => (
                    <Text key={h} style={{ width: i<=1?i===0?30:130:52, color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, textAlign: i===0||i>1?'center':'left' }}>{h}</Text>
                  ))}
                </View>
                {bowlers.map((p, i) => {
                  const avgB = p.wickets>0 ? fmt2(p.runsConceded/p.wickets) : '—'
                  return (
                    <TouchableOpacity key={p.name} onPress={() => setSelectedPlayer(p)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border }}>
                      <Text style={{ width: 30, textAlign: 'center', color: i===0?T.gold:T.textDim, fontWeight: '700', fontSize: 13 }}>{i+1}</Text>
                      <View style={{ width: 130 }}>
                        <Text style={{ color: T.text, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
                        <Text style={{ color: T.textDim, fontSize: 10 }}>{p.team}</Text>
                      </View>
                      <Text style={{ width: 52, textAlign: 'center', color: T.accent, fontWeight: '900', fontSize: 14 }}>{p.wickets}</Text>
                      <Text style={{ width: 52, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{p.runsConceded}</Text>
                      <Text style={{ width: 52, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{fmt2(p.overs)}</Text>
                      <Text style={{ width: 52, textAlign: 'center', color: T.green, fontSize: 13 }}>{avgB}</Text>
                      <Text style={{ width: 52, textAlign: 'center', color: T.sky, fontSize: 13 }}>{econ(p.runsConceded, p.overs*6)}</Text>
                      <Text style={{ width: 52, textAlign: 'center', color: T.gold, fontWeight: '700', fontSize: 13 }}>{p.bestBowlWkts}/{p.bestBowlRuns}</Text>
                      <Text style={{ width: 52, textAlign: 'center', color: T.purple, fontSize: 13 }}>{p.fifers}</Text>
                      <Text style={{ width: 52, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{p.maidens}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </>
        )}

        {/* ── Fielding ── */}
        {activeTab === 'fielding' && (
          <>
            <Text style={{ color: T.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>🧤 Fielding Rankings</Text>
            <Text style={{ color: T.textDim, fontSize: 12, marginBottom: 14 }}>Tap a player to view full profile</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 6, marginBottom: 4 }}>
                  {['#','Player','Catches','Run Outs','Stumpings','Total'].map((h, i) => (
                    <Text key={h} style={{ width: i<=1?i===0?30:140:80, color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, textAlign: 'center' }}>{h}</Text>
                  ))}
                </View>
                {fielders.filter(p => p.catches+p.runouts+p.stumpings > 0).map((p, i) => (
                  <TouchableOpacity key={p.name} onPress={() => setSelectedPlayer(p)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border }}>
                    <Text style={{ width: 30, textAlign: 'center', color: i===0?T.gold:T.textDim, fontWeight: '700', fontSize: 13 }}>{i+1}</Text>
                    <View style={{ width: 140 }}>
                      <Text style={{ color: T.text, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
                      <Text style={{ color: T.textDim, fontSize: 10 }}>{p.team}</Text>
                    </View>
                    <Text style={{ width: 80, textAlign: 'center', color: T.sky, fontSize: 13 }}>{p.catches}</Text>
                    <Text style={{ width: 80, textAlign: 'center', color: T.orange, fontSize: 13 }}>{p.runouts}</Text>
                    <Text style={{ width: 80, textAlign: 'center', color: T.purple, fontSize: 13 }}>{p.stumpings}</Text>
                    <Text style={{ width: 80, textAlign: 'center', color: T.gold, fontWeight: '700', fontSize: 13 }}>{p.catches+p.runouts+p.stumpings}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* ── MVP ── */}
        {activeTab === 'mvp' && (
          <>
            <Text style={{ color: T.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>⭐ Most Valuable Players</Text>
            <Text style={{ color: T.textDim, fontSize: 12, marginBottom: 6 }}>MVP Score = Runs÷10 + Wkts×15 + (Catches+Stumpings)×5</Text>
            <Divider />

            {/* MVP #1 card */}
            {mvps[0] && (
              <TouchableOpacity onPress={() => setSelectedPlayer(mvps[0])}
                style={{ backgroundColor: T.goldDim, borderRadius: 16, padding: 20, borderWidth: 2, borderColor: T.gold, marginBottom: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>🏆</Text>
                <Text style={{ color: T.gold, fontWeight: '900', fontSize: 22 }}>{mvps[0].name}</Text>
                <Text style={{ color: T.textMid, fontSize: 13, marginTop: 2 }}>{mvps[0].team}</Text>
                <View style={{ flexDirection: 'row', gap: 20, marginTop: 14 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: T.gold, fontWeight: '900', fontSize: 20 }}>{mvps[0].runs}</Text>
                    <Text style={{ color: T.textDim, fontSize: 10 }}>RUNS</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: T.gold, fontWeight: '900', fontSize: 20 }}>{mvps[0].wickets}</Text>
                    <Text style={{ color: T.textDim, fontSize: 10 }}>WKTS</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: T.gold, fontWeight: '900', fontSize: 20 }}>{fmt2((mvps[0] as any).mvpScore)}</Text>
                    <Text style={{ color: T.textDim, fontSize: 10 }}>MVP SCORE</Text>
                  </View>
                </View>
                <Text style={{ color: T.textDim, fontSize: 11, marginTop: 10 }}>Tap to view full profile</Text>
              </TouchableOpacity>
            )}

            {/* Rest of the list */}
            {mvps.slice(1).map((p, i) => (
              <TouchableOpacity key={p.name} onPress={() => setSelectedPlayer(p)}
                style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: i===0?T.textMid+'55':T.border, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: i===0?T.surface:T.bg, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Text style={{ color: i===0?T.textMid:T.textDim, fontWeight: '900', fontSize: 14 }}>{i===0?'🥈':i===1?'🥉':String(i+2)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: T.text, fontWeight: '700', fontSize: 14 }}>{p.name}</Text>
                  <Text style={{ color: T.textDim, fontSize: 12 }}>{p.team} · {p.runs} runs · {p.wickets} wkts</Text>
                </View>
                <Text style={{ color: T.gold, fontWeight: '900', fontSize: 15 }}>{fmt2((p as any).mvpScore)}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── Records ── */}
        {activeTab === 'records' && (
          <>
            <Text style={{ color: T.text, fontWeight: '800', fontSize: 15, marginBottom: 16 }}>📜 Tournament Records</Text>

            {/* Batting records */}
            <Text style={{ color: T.accent, fontWeight: '800', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>🏏 BATTING RECORDS</Text>
            {records.highestScore.name ? (
              <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.gold+'44', marginBottom: 10 }}>
                <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>HIGHEST INDIVIDUAL SCORE</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: T.text, fontWeight: '800', fontSize: 16 }}>{records.highestScore.name}</Text>
                    <Text style={{ color: T.textDim, fontSize: 12 }}>{records.highestScore.team} · {records.highestScore.match}</Text>
                  </View>
                  <Text style={{ color: T.gold, fontWeight: '900', fontSize: 28 }}>{records.highestScore.score}{records.highestScore.notOut?'*':''}</Text>
                </View>
              </View>
            ) : <Text style={{ color: T.textDim, marginBottom: 14 }}>No batting data yet</Text>}

            {records.highestTotal.team ? (
              <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 10 }}>
                <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>HIGHEST TEAM TOTAL</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: T.text, fontWeight: '800', fontSize: 16 }}>{records.highestTotal.team}</Text>
                    <Text style={{ color: T.textDim, fontSize: 12 }}>{records.highestTotal.match}</Text>
                  </View>
                  <Text style={{ color: T.accent, fontWeight: '900', fontSize: 26 }}>{records.highestTotal.score}/{records.highestTotal.overs}</Text>
                </View>
              </View>
            ) : null}

            {records.lowestTotal.team ? (
              <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 10 }}>
                <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>LOWEST TEAM TOTAL</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: T.text, fontWeight: '800', fontSize: 16 }}>{records.lowestTotal.team}</Text>
                    <Text style={{ color: T.textDim, fontSize: 12 }}>{records.lowestTotal.match}</Text>
                  </View>
                  <Text style={{ color: T.textMid, fontWeight: '900', fontSize: 26 }}>{records.lowestTotal.score}/{records.lowestTotal.overs}</Text>
                </View>
              </View>
            ) : null}

            <Divider />

            {/* Bowling records */}
            <Text style={{ color: T.sky, fontWeight: '800', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>🎳 BOWLING RECORDS</Text>
            {records.bestBowling.name ? (
              <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.sky+'44', marginBottom: 10 }}>
                <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>BEST BOWLING FIGURES</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: T.text, fontWeight: '800', fontSize: 16 }}>{records.bestBowling.name}</Text>
                    <Text style={{ color: T.textDim, fontSize: 12 }}>{records.bestBowling.team} · {records.bestBowling.match}</Text>
                  </View>
                  <Text style={{ color: T.sky, fontWeight: '900', fontSize: 28 }}>{records.bestBowling.wkts}/{records.bestBowling.runs}</Text>
                </View>
              </View>
            ) : <Text style={{ color: T.textDim, marginBottom: 14 }}>No bowling data yet</Text>}

            <Divider />

            {/* Tournament summary */}
            <Text style={{ color: T.green, fontWeight: '800', fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>📊 TOURNAMENT SUMMARY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <StatCard label="Total Runs"    value={players.reduce((s, p) => s + p.runs, 0)}    color={T.gold} />
              <StatCard label="Total Wkts"   value={players.reduce((s, p) => s + p.wickets, 0)} color={T.accent} />
              <StatCard label="Total Sixes"  value={players.reduce((s, p) => s + p.sixes, 0)}   color={T.purple} />
              <StatCard label="Total Fours"  value={players.reduce((s, p) => s + p.fours, 0)}   color={T.orange} />
              <StatCard label="Players"      value={players.length}                               color={T.sky} />
              <StatCard label="5-Fers"       value={players.reduce((s, p) => s + p.fifers, 0)}  color={T.purple} />
              <StatCard label="100s"         value={players.reduce((s, p) => s + p.hundreds, 0)} color={T.gold} />
              <StatCard label="50s"          value={players.reduce((s, p) => s + p.fifties, 0)}  color={T.textMid} />
            </View>
          </>
        )}
      </ScrollView>

      {/* Player profile modal */}
      <PlayerProfileModal
        player={selectedPlayer}
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
      />
    </View>
  )
}

// ── MATCH SETUP view ──────────────────────────────────────────────────────────
function MatchSetupView({ t, f, dispatch }: { t: any; f: any; dispatch: (a: any) => void }) {
  const navigation = useNavigation<Nav>()
  const [toss,    setToss]    = useState(f.team1)
  const [batFirst,setBatFirst]= useState(f.team1)
  const [overs,   setOvers]   = useState(String(f.overs || t.defaultOvers || 10))
  const [t1p,     setT1p]     = useState('')
  const [t2p,     setT2p]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const parse = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

  const handleStart = async () => {
    setLoading(true); setError('')
    try {
      const token    = await getToken()
      const deviceId = await AsyncStorage.getItem('@crickyworld:deviceId').catch(() => null)
      const ovNum    = parseInt(overs) || 10

      const battingTeam  = batFirst
      const bowlingTeam  = batFirst === f.team1 ? f.team2 : f.team1

      const t1Players = parse(t1p)
      const t2Players = parse(t2p)

      // ── FIX: pass battingTeam/bowlingTeam as team1/team2 so the server
      // stores them correctly, then use fixtureTeam1/2 for reference only ──
      const res = await fetch(apiUrl('/api/matches'), {
        method: 'POST', headers: jsonHeaders(token),
        body: JSON.stringify({
          team1: battingTeam,   // batting team IS team1 on the server
          team2: bowlingTeam,   // bowling team IS team2 on the server

          battingFirst:     battingTeam,
          battingTeam:      battingTeam,
          battingFirstTeam: battingTeam,
          bowlingFirst:     bowlingTeam,
          bowlingTeam:      bowlingTeam,
          tossWinner:       toss,
          tossWon:          toss,

          status:  'innings1',
          isLive:  true,

          overs:      ovNum,
          wideRuns:   t.wideRuns   ?? 1,
          noBallRuns: t.noBallRuns ?? 1,

          // Players assigned to batting/bowling teams
          team1Players: batFirst === f.team1 ? t1Players : t2Players,
          team2Players: batFirst === f.team1 ? t2Players : t1Players,

          fixtureTeam1:   f.team1,
          fixtureTeam2:   f.team2,
          tournamentId:   t.id,
          tournamentName: t.name,
          fixtureId:      f.id,
          deviceId,
        }),
      })
      if (!res.ok) throw new Error('Failed to create match')
      const match = await res.json() as { _id: string }
      dispatch({ type: 'SET_FIXTURE_MATCH', tid: t.id, fid: f.id, matchId: match._id, overs: ovNum })
      navigation.navigate('Scoring', { id: match._id })
    } catch { setError('Failed to start match. Please try again.') }
    finally { setLoading(false) }
  }

  const bowlingTeam = batFirst === f.team1 ? f.team2 : f.team1

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 8 }}>MATCH SETUP</Text>

      {/* Match header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
        <Text style={{ color: T.accent, fontWeight: '900', fontSize: 20 }}>{f.team1}</Text>
        <View style={{ backgroundColor: T.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: T.textDim, fontSize: 13, fontWeight: '700' }}>VS</Text>
        </View>
        <Text style={{ color: T.accent, fontWeight: '900', fontSize: 20 }}>{f.team2}</Text>
      </View>

      {/* ── Match Preview — RED theme ── */}
      <View style={{ backgroundColor: '#120000', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: T.accent + '55', marginBottom: 16 }}>
        <Text style={{ color: T.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 }}>MATCH PREVIEW</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22 }}>🏏</Text>
            <Text style={{ color: T.text, fontWeight: '800', fontSize: 15 }}>{batFirst}</Text>
            <View style={{ backgroundColor: T.accent + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: T.accent + '44' }}>
              <Text style={{ color: T.accent, fontSize: 11, fontWeight: '700' }}>BATTING</Text>
            </View>
          </View>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: T.textDim, fontSize: 22 }}>⚡</Text>
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22 }}>🎳</Text>
            <Text style={{ color: T.text, fontWeight: '800', fontSize: 15 }}>{bowlingTeam}</Text>
            <View style={{ backgroundColor: T.accentDim, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: T.accent + '33' }}>
              <Text style={{ color: T.textMid, fontSize: 11, fontWeight: '700' }}>BOWLING</Text>
            </View>
          </View>
        </View>
        <Text style={{ color: T.textDim, fontSize: 11, textAlign: 'center', marginTop: 10 }}>
          🏆 Toss won by <Text style={{ color: T.gold, fontWeight: '700' }}>{toss}</Text>
        </Text>
      </View>

      {/* Toss & Batting First selectors */}
      <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 14 }}>
        <View style={{ marginBottom: 14 }}>
          <Text style={S.fieldLabel}>TOSS WINNER</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[f.team1, f.team2].map((team: string) => (
              <TouchableOpacity key={team} onPress={() => setToss(team)}
                style={[{ flex: 1, paddingVertical: 11, borderRadius: 9, borderWidth: 1.5, alignItems: 'center' },
                  toss === team
                    ? { borderColor: T.gold, backgroundColor: T.goldDim }
                    : { borderColor: T.border, backgroundColor: T.bg }]}>
                <Text style={{ color: toss === team ? T.gold : T.textMid, fontWeight: '700', fontSize: 14 }}>
                  {toss === team ? '🏆 ' : ''}{team}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 14 }}>
          <Text style={S.fieldLabel}>BATTING FIRST</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[f.team1, f.team2].map((team: string) => (
              <TouchableOpacity key={team} onPress={() => setBatFirst(team)}
                style={[{ flex: 1, paddingVertical: 11, borderRadius: 9, borderWidth: 1.5, alignItems: 'center' },
                  batFirst === team
                    ? { borderColor: T.accent, backgroundColor: T.accentDim }
                    : { borderColor: T.border, backgroundColor: T.bg }]}>
                <Text style={{ color: batFirst === team ? T.accent : T.textMid, fontWeight: '700', fontSize: 14 }}>
                  {batFirst === team ? '🏏 ' : ''}{team}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={S.fieldLabel}>OVERS</Text>
        <TextInput style={S.input} value={overs} onChangeText={setOvers} keyboardType="number-pad" placeholderTextColor={T.textDim} />
      </View>

      {/* Player inputs */}
      {[
        { team: f.team1, val: t1p, setter: setT1p, color: T.accent,
          role: batFirst === f.team1 ? '🏏 Batting' : '🎳 Bowling' },
        { team: f.team2, val: t2p, setter: setT2p, color: T.textMid,
          role: batFirst === f.team2 ? '🏏 Batting' : '🎳 Bowling' },
      ].map(({ team, val, setter, color, role }) => (
        <View key={team} style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[S.fieldLabel, { color, marginBottom: 0 }]}>{team} PLAYERS</Text>
            <Text style={{ color: T.textDim, fontSize: 11 }}>{role}</Text>
          </View>
          <TextInput style={[S.input, { minHeight: 80 }]} value={val} onChangeText={setter}
            placeholder="Player1, Player2, Player3…" placeholderTextColor={T.textDim} multiline />
        </View>
      ))}

      {error !== '' && (
        <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', marginBottom: 14 }}>
          <Text style={{ color: T.red, fontSize: 13 }}>⚠ {error}</Text>
        </View>
      )}

      <TouchableOpacity onPress={handleStart} disabled={loading} style={[S.btn, loading && { opacity: 0.6 }]}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.btnTxt}>▶ Start Match — {batFirst} bats first</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function TournamentsScreen() {
  const navigation = useNavigation<Nav>()
  const [state, rawDispatch] = useReducer(reducer, INIT)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadState().then(saved => {
      if (saved) rawDispatch({ type: 'LOAD', state: saved })
      setReady(true)
    })
  }, [])

  const dispatch = useCallback((action: any) => { rawDispatch(action) }, [])

  useEffect(() => {
    if (ready) persistState(state)
  }, [state, ready])

  if (!ready) return (
    <View style={[S.root, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={T.accent} size="large" />
    </View>
  )

  const t = state.activeTid ? state.tournaments.find((x: any) => x.id === state.activeTid) : null
  const f = t && state.activeFid ? t.fixtures?.find((x: any) => x.id === state.activeFid) : null

  const TABS = [
    { key: 'setup',     icon: '⚙',  label: 'Setup'    },
    { key: 'fixtures',  icon: '📅',  label: 'Fixtures' },
    { key: 'standings', icon: '📊',  label: 'Table'    },
    { key: 'stats',     icon: '📈',  label: 'Stats'    },
  ] as const

  const handleBack = () => {
    if (state.view === 'home')       navigation.goBack()
    else if (state.view === 'matchSetup') dispatch({ type: 'SET_VIEW', view: 'fixtures' })
    else dispatch({ type: 'SET_VIEW', view: 'home' })
  }

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={handleBack} style={S.backBtn}>
          <Text style={{ color: T.textMid, fontSize: 18, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>
            {state.view === 'home' ? '🏆 Tournaments' : t?.name ?? '🏆 Tournaments'}
          </Text>
          {t && state.view !== 'home' ? (
            <Text style={S.headerSub}>{FORMATS.find(fx => fx.key === t.format)?.label} · {(t.teams||[]).filter((x: string)=>x).length} teams</Text>
          ) : null}
        </View>
      </View>

      {/* Tab bar (only inside a tournament) */}
      {t && state.view !== 'home' && state.view !== 'matchSetup' && (
        <View style={S.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity key={tab.key} onPress={() => dispatch({ type: 'SET_VIEW', view: tab.key })}
              style={[S.tabBtn, state.view === tab.key && S.tabBtnActive]}>
              <Text style={{ fontSize: 13 }}>{tab.icon}</Text>
              <Text style={[S.tabBtnTxt, state.view === tab.key && { color: T.accent }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      <View style={{ flex: 1 }}>
        {state.view === 'home'       && <HomeView       state={state} dispatch={dispatch} />}
        {state.view === 'setup'      && t && <SetupView      t={t} dispatch={dispatch} />}
        {state.view === 'fixtures'   && t && <FixturesView   t={t} dispatch={dispatch} />}
        {state.view === 'standings'  && t && <PointsTableView t={t} dispatch={dispatch} />}
        {state.view === 'stats'      && t && <StatsView      t={t} />}
        {state.view === 'matchSetup' && t && f && <MatchSetupView t={t} f={f} dispatch={dispatch} />}
      </View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 36, paddingBottom: 12, backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: T.text, fontWeight: '700', fontSize: 18, letterSpacing: 0.3 },
  headerSub: { color: T.textDim, fontSize: 11, marginTop: 1 },

  tabBar: { flexDirection: 'row', backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', gap: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: T.accent },
  tabBtnTxt: { fontSize: 10, fontWeight: '700', color: T.textDim },

  sectionLabel: { fontSize: 10, color: T.textDim, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10, marginTop: 4 },
  fieldLabel:   { fontSize: 10, color: T.textDim, fontWeight: '700', letterSpacing: 1.5, marginBottom: 5 },

  input: { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 8, color: T.text, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },

  btn:       { backgroundColor: T.accent, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnTxt:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSmall:  { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, alignItems: 'center' },
  btnSmallTxt:{ color: T.textMid, fontWeight: '700', fontSize: 12 },
})