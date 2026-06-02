// src/screens/TournamentsScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Tournament System
// Converted from Tournaments.jsx → React Native TypeScript
// Features: Create/manage tournaments, schedule formats, fixtures,
//           points table, stats, match setup → navigates to ScoringScreen
// State is persisted to AsyncStorage (replaces sessionStorage)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useReducer } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, FlatList,
  Modal, StyleSheet, ActivityIndicator, Alert, StatusBar, Platform,
} from 'react-native'
import { useNavigation, CommonActions } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl, jsonHeaders, authHeaders } from '../services/api'
import type { RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: '#0a0a0a', surface: '#111', card: '#181818', border: '#2a2a2a',
  accent: '#e53e3e', accentDim: '#3a0a0a', gold: '#f59e0b', goldDim: '#78350f',
  red: '#e53e3e', redDim: '#3a0a0a', orange: '#f97316',
  sky: '#60a5fa', purple: '#a78bfa',
  text: '#f5f5f5', textMid: '#a3a3a3', textDim: '#525252', textFaint: '#1c1c1c',
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10)
const fmt2 = (n: number) => (!isFinite(n) || isNaN(n) ? '0.00' : n.toFixed(2))
const ovsDisp = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
const sr   = (r: number, b: number) => b > 0 ? fmt2((r / b) * 100) : '—'
const econ = (r: number, b: number) => b > 0 ? fmt2((r / b) * 6) : '—'

// ── Storage key ───────────────────────────────────────────────────────────────
const SK = 'cw_tournaments_v3'

async function loadState(): Promise<any | null> {
  try { const s = await AsyncStorage.getItem(SK); return s ? JSON.parse(s) : null } catch { return null }
}
async function persistState(s: any): Promise<void> {
  try { await AsyncStorage.setItem(SK, JSON.stringify(s)) } catch {}
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('token').catch(() => null)
}

// ── Format definitions ────────────────────────────────────────────────────────
const FORMATS = [
  { key: 'round_robin',  label: 'Round Robin',        icon: '⟳',  desc: 'Every team plays every other once.',       minTeams: 2 },
  { key: 'double_rr',   label: 'Double Round Robin',  icon: '⟳⟳', desc: 'Every team plays every other twice.',     minTeams: 2 },
  { key: 'knockout',    label: 'Knockout',            icon: '⚡',  desc: 'Lose = out. Winner advances.',            minTeams: 2 },
  { key: 'top2_final',  label: 'Top 2 Final',         icon: '🥇',  desc: 'League stage then top-2 final.',          minTeams: 3 },
  { key: 'ipl_playoffs',label: 'IPL Playoffs',        icon: '🏆',  desc: 'Top 4 → Qual 1, Elim, Qual 2, Final.',   minTeams: 4 },
  { key: 'semi_final',  label: 'Semi Final Format',   icon: '🎯',  desc: 'Top 4 → Semis → Final.',                 minTeams: 4 },
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
  const league = (ts: string[], stage: string) => balancedRR(ts).forEach(round => round.forEach(([t1, t2]) => out.push(mk(t1, t2, stage))))

  if (fmt === 'round_robin')   { league(teams, 'League') }
  else if (fmt === 'double_rr'){ league(teams, 'League'); balancedRR(teams).forEach(round => round.forEach(([t1, t2]) => out.push(mk(t2, t1, 'League (Leg 2)')))) }
  else if (fmt === 'knockout')  { const sh = [...teams].sort(() => Math.random() - 0.5); const rNames = ['Final','Semi Final','Quarter Final','Round of 16']; const rounds = Math.ceil(Math.log2(sh.length)); let rt = [...sh]; for (let r = 0; r < rounds; r++) { const label = rNames[rounds-1-r] || `Round ${r+1}`; for (let i = 0; i < Math.floor(rt.length/2); i++) out.push(mk(rt[i*2]||'TBD', rt[i*2+1]||'TBD', label)); rt = Array(Math.ceil(rt.length/2)).fill('TBD') } }
  else if (fmt === 'top2_final'){ league(teams, 'League'); out.push(mk('1st Place','2nd Place','Final')) }
  else if (fmt === 'ipl_playoffs'){ league(teams, 'League'); out.push(mk('1st','2nd','Qualifier 1')); out.push(mk('3rd','4th','Eliminator')); out.push(mk('Q1 Loser','Elim Winner','Qualifier 2')); out.push(mk('Q1 Winner','Q2 Winner','Final')) }
  else if (fmt === 'semi_final') { if (teams.length > 4) league(teams, 'League'); const sf = teams.length <= 4; out.push(mk(sf?teams[0]||'T1':'1st', sf?teams[3]||'T4':'4th', 'Semi Final 1')); out.push(mk(sf?teams[1]||'T2':'2nd', sf?teams[2]||'T3':'3rd', 'Semi Final 2')); out.push(mk('SF1 Winner','SF2 Winner','Final')) }
  return out
}

function calcTable(teams: string[], fixtures: any[], liveMatches: any[]) {
  const tbl: Record<string, any> = {}
  teams.forEach(t => { tbl[t] = { team: t, p:0, w:0, l:0, nr:0, pts:0, rf:0, of:0, ra:0, oa:0 } })
  fixtures.forEach(f => {
    if (f.status !== 'completed') return
    const mid = f.realMatchId || f.matchId; if (!mid) return
    const m = liveMatches.find((x: any) => (x._id || x.id) === mid)
    if (!m) { if (f.result && tbl[f.team1] && tbl[f.team2]) { tbl[f.team1].p++; tbl[f.team2].p++; if (f.result.includes(f.team1+' won')){ tbl[f.team1].w++; tbl[f.team1].pts+=2; tbl[f.team2].l++ } else if(f.result.includes(f.team2+' won')){ tbl[f.team2].w++; tbl[f.team2].pts+=2; tbl[f.team1].l++ } else { tbl[f.team1].pts++; tbl[f.team2].pts++; tbl[f.team1].nr++; tbl[f.team2].nr++ } } return }
    if (!tbl[f.team1] || !tbl[f.team2]) return
    tbl[f.team1].p++; tbl[f.team2].p++
    const result = m.result || ''
    if (!result || result.includes('Tied')) { tbl[f.team1].pts++; tbl[f.team2].pts++; tbl[f.team1].nr++; tbl[f.team2].nr++ }
    else if (result.includes(f.team1+' won')) { tbl[f.team1].w++; tbl[f.team1].pts+=2; tbl[f.team2].l++ }
    else if (result.includes(f.team2+' won')) { tbl[f.team2].w++; tbl[f.team2].pts+=2; tbl[f.team1].l++ }
  })
  return Object.values(tbl).map(r => ({ ...r, nrr: parseFloat((r.of>0&&r.oa>0?(r.rf/r.of)-(r.ra/r.oa):0).toFixed(3)) })).sort((a,b) => b.pts-a.pts || b.nrr-a.nrr)
}

// ── REDUCER ───────────────────────────────────────────────────────────────────
const INIT = { tournaments: [], activeTid: null, view: 'home', activeFid: null }

function reducer(state: any, action: any): any {
  const upT = (tid: string, fn: (t: any) => any) => ({ ...state, tournaments: state.tournaments.map((t: any) => t.id === tid ? fn(t) : t) })
  switch (action.type) {
    case 'LOAD':    return { ...action.state }
    case 'CREATE_T': { const t = { id: uid(), name: action.name, format: 'round_robin', defaultOvers: 10, wideRuns: 1, noBallRuns: 1, teamCount: 2, teams: ['',''], fixtures: [], createdAt: Date.now() }; return { ...state, tournaments: [...state.tournaments, t], activeTid: t.id, view: 'setup' } }
    case 'OPEN_T':   return { ...state, activeTid: action.id, view: 'fixtures' }
    case 'SET_VIEW': return { ...state, view: action.view }
    case 'SET_COUNT':return upT(action.tid, t => { const c = Math.max(2,Math.min(16,action.c)); return { ...t, teamCount:c, teams:Array.from({length:c},(_,i)=>t.teams[i]||'') } })
    case 'SET_NAME': return upT(action.tid, t => { const teams=[...t.teams]; teams[action.i]=action.v; return { ...t, teams } })
    case 'SAVE_SETTINGS': return upT(action.tid, t => ({ ...t, format:action.fmt, defaultOvers:action.overs, wideRuns:action.wide, noBallRuns:action.nb }))
    case 'GEN':      return upT(action.tid, t => { const valid=(t.teams||[]).filter((x: string)=>x.trim()); return { ...t, fixtures:makeFixtures(valid,t.format) } })
    case 'ADD_FIX':  return upT(action.tid, t => ({ ...t, fixtures:[...(t.fixtures||[]), { id:uid(), team1:action.t1, team2:action.t2, stage:action.stage, status:'scheduled', matchNo:(t.fixtures?.length||0)+1, date:'', time:'', overs:null }] }))
    case 'DEL_FIX':  return upT(action.tid, t => ({ ...t, fixtures:t.fixtures.filter((f: any)=>f.id!==action.fid) }))
    case 'SET_FIXTURE_MATCH': return upT(action.tid, t => ({ ...t, fixtures:t.fixtures.map((fx: any) => fx.id===action.fid ? { ...fx, status:'live', realMatchId:action.matchId, overs:action.overs } : fx) }))
    case 'MARK_FIXTURE_COMPLETE': return upT(action.tid, t => ({ ...t, fixtures:t.fixtures.map((fx: any) => fx.realMatchId===action.matchId ? { ...fx, status:'completed', result:action.result } : fx) }))
    case 'START_MATCH': return { ...state, activeFid: action.fid, view: 'matchSetup' }
    default: return state
  }
}

// ── Shared primitives ─────────────────────────────────────────────────────────
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

// ── HOME view ─────────────────────────────────────────────────────────────────
function HomeView({ state, dispatch }: { state: any; dispatch: (a: any) => void }) {
  const [name, setName] = useState('')
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
          returnKeyType="done" onSubmitEditing={() => { if (name.trim()) { dispatch({ type: 'CREATE_T', name: name.trim() }); setName('') } }} />
        <TouchableOpacity onPress={() => { if (name.trim()) { dispatch({ type: 'CREATE_T', name: name.trim() }); setName('') } }}
          disabled={!name.trim()} style={[S.btn, !name.trim() && { opacity: 0.4 }]}>
          <Text style={S.btnTxt}>Create →</Text>
        </TouchableOpacity>
      </View>

      {/* Existing */}
      {state.tournaments.length > 0 && (
        <>
          <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 }}>YOUR TOURNAMENTS</Text>
          {[...state.tournaments].reverse().map((t: any) => {
            const done = (t.fixtures||[]).filter((f: any)=>f.status==='completed').length
            const live = (t.fixtures||[]).filter((f: any)=>f.status==='live').length
            const total = (t.fixtures||[]).length
            const fmt = FORMATS.find(f => f.key === t.format)
            return (
              <TouchableOpacity key={t.id} onPress={() => dispatch({ type: 'OPEN_T', id: t.id })} activeOpacity={0.8}
                style={{ backgroundColor: T.card, borderRadius: 10, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: T.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: T.text, fontWeight: '700', fontSize: 14 }}>{t.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                      <Text style={{ color: T.textDim, fontSize: 12 }}>{(t.teams||[]).filter((x: string)=>x).length} teams</Text>
                      <Text style={{ color: T.textDim, fontSize: 12 }}>{done}/{total} played</Text>
                      {live > 0 ? <Text style={{ color: T.accent, fontSize: 12 }}>● {live} live</Text> : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {fmt ? <StagePill stage={fmt.label} /> : null}
                    <Text style={{ color: T.textDim, fontSize: 20 }}>›</Text>
                  </View>
                </View>
              </TouchableOpacity>
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
  const valid  = (t.teams||[]).filter((x: string)=>x.trim())
  const canGen = valid.length >= (curFmt?.minTeams || 2)

  const gen = () => {
    dispatch({ type: 'SAVE_SETTINGS', tid: t.id, fmt, overs: parseInt(overs)||10, wide: parseInt(wide)||1, nb: parseInt(nb)||1 })
    dispatch({ type: 'GEN', tid: t.id })
    dispatch({ type: 'SET_VIEW', view: 'fixtures' })
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      {/* Format cards */}
      <Text style={S.sectionLabel}>SCHEDULE FORMAT</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {FORMATS.map(f => (
          <TouchableOpacity key={f.key} onPress={() => setFmt(f.key)} activeOpacity={0.8}
            style={[{ width: '47%', backgroundColor: fmt===f.key ? T.accentDim : T.card, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: fmt===f.key ? T.accent : T.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <Text style={{ fontSize: 18 }}>{f.icon}</Text>
              <Text style={{ color: fmt===f.key ? T.accent : T.text, fontWeight: '700', fontSize: 13, flex: 1 }}>{f.label}</Text>
            </View>
            <Text style={{ color: T.textDim, fontSize: 11, lineHeight: 16 }}>{f.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Match settings */}
      <Text style={S.sectionLabel}>MATCH SETTINGS</Text>
      <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 }}>
        {[['Default Overs', overs, setOvers], ['Wide Runs', wide, setWide], ['No-Ball Runs', nb, setNb]].map(([lbl, val, setter]) => (
          <View key={String(lbl)} style={{ marginBottom: 12 }}>
            <Text style={S.fieldLabel}>{String(lbl)}</Text>
            <TextInput style={S.input} value={String(val)} onChangeText={setter as any}
              keyboardType="number-pad" placeholderTextColor={T.textDim} />
          </View>
        ))}
      </View>

      {/* Teams */}
      <Text style={S.sectionLabel}>TEAMS</Text>
      <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 }}>
        <Text style={S.fieldLabel}>NUMBER OF TEAMS</Text>
        <TextInput style={[S.input, { marginBottom: 14 }]} value={count}
          onChangeText={v => { setCount(v); const n=parseInt(v); if(n>=2&&n<=16) dispatch({ type:'SET_COUNT', tid:t.id, c:n }) }}
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

      {/* Generate */}
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
  const sorted = [...stages].sort((a,b) => { const ia=ORDER.findIndex(s=>a.includes(s)), ib=ORDER.findIndex(s=>b.includes(s)); return (ia<0?99:ia)-(ib<0?99:ib) })
  const done = all.filter((f: any)=>f.status==='completed').length
  const pct  = all.length > 0 ? Math.round((done/all.length)*100) : 0

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      {/* Stats bar */}
      {all.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[['Total', all.length, T.textMid], ['Played', done, T.accent], ['Live', all.filter((f: any)=>f.status==='live').length, T.gold], ['Left', all.length-done, T.textDim]].map(([l, v, c]) => (
            <View key={String(l)} style={{ flex: 1, backgroundColor: T.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center' }}>
              <Text style={{ color: String(c), fontSize: 20, fontWeight: '900' }}>{String(v)}</Text>
              <Text style={{ color: T.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1 }}>{String(l).toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Progress */}
      {all.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={{ color: T.textDim, fontSize: 11 }}>Tournament Progress</Text>
            <Text style={{ color: T.accent, fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
          </View>
          <View style={{ height: 4, backgroundColor: T.border, borderRadius: 4 }}>
            <View style={{ height: 4, width: `${pct}%` as any, backgroundColor: T.accent, borderRadius: 4 }} />
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <View>
          <Text style={{ color: T.text, fontWeight: '800', fontSize: 15 }}>📅 Match Schedule</Text>
          <Text style={{ color: T.textDim, fontSize: 12, marginTop: 2 }}>{all.length === 0 ? 'Go to Setup to generate fixtures' : `${all.length} matches · ${(t.teams||[]).filter((x: string)=>x).length} teams`}</Text>
        </View>
        <TouchableOpacity onPress={() => dispatch({ type: 'SET_VIEW', view: 'setup' })}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface }}>
          <Text style={{ color: T.textMid, fontSize: 12, fontWeight: '700' }}>⚙ Setup</Text>
        </TouchableOpacity>
      </View>

      {/* Empty */}
      {all.length === 0 && (
        <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: T.border }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
          <Text style={{ color: T.textMid, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>No fixtures generated yet</Text>
          <TouchableOpacity onPress={() => dispatch({ type: 'SET_VIEW', view: 'setup' })} style={[S.btnSmall, { marginTop: 8 }]}>
            <Text style={S.btnSmallTxt}>← Go to Setup</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Fixtures by stage */}
      {sorted.map(stage => {
        const stageFix = all.filter((f: any) => f.stage === stage)
        return (
          <View key={stage} style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: T.border }}>
              <StagePill stage={stage} />
              <Text style={{ color: T.textDim, fontSize: 11 }}>{stageFix.filter((f: any)=>f.status==='completed').length}/{stageFix.length} played</Text>
            </View>

            {stageFix.map((f: any) => (
              <View key={f.id} style={{ backgroundColor: T.card, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: f.status==='live' ? T.gold+'55' : f.status==='completed' ? T.accent+'22' : T.border, overflow: 'hidden' }}>
                {/* Accent bar */}
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ width: 3, backgroundColor: f.status==='live' ? T.gold : f.status==='completed' ? T.accent : T.border }} />
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
                      {f.status === 'completed' && f.result ? <Text style={{ color: T.accent, fontSize: 11, fontWeight: '700' }}>✓ {f.result}</Text> : null}
                      {f.status === 'live' ? <Text style={{ color: T.gold, fontSize: 11, fontWeight: '700' }}>● LIVE</Text> : null}
                    </View>
                    {/* Actions */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {f.status === 'completed' ? (
                        <View style={{ paddingHorizontal: 12, paddingVertical: 5, backgroundColor: T.accent+'18', borderRadius: 8, borderWidth: 1, borderColor: T.accent+'33' }}>
                          <Text style={{ color: T.accent, fontSize: 12, fontWeight: '700' }}>Done ✓</Text>
                        </View>
                      ) : f.status === 'live' && f.realMatchId ? (
                        <TouchableOpacity onPress={() => navigation.navigate('Scoring', { id: f.realMatchId })}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: T.gold, borderRadius: 9 }}>
                          <Text style={{ color: '#000', fontWeight: '800', fontSize: 13 }}>▶ Resume</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity onPress={() => dispatch({ type: 'START_MATCH', fid: f.id })}
                            style={S.btn}>
                            <Text style={S.btnTxt}>▶ Start</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => Alert.alert('Delete', 'Delete this fixture?', [{ text:'Cancel', style:'cancel' }, { text:'Delete', style:'destructive', onPress:()=>dispatch({ type:'DEL_FIX', tid:t.id, fid:f.id }) }])}
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
      const realIds = (t.fixtures||[]).map((f: any)=>f.realMatchId).filter(Boolean)
      if (!realIds.length) return
      const results = await Promise.all(realIds.map((id: string) =>
        fetch(apiUrl(`/api/matches/${id}`), { headers: authHeaders(token) }).then(r=>r.json()).catch(()=>null)
      ))
      const valid = results.filter(Boolean)
      setLiveMatches(valid)
      valid.forEach((m: any) => {
        if (m.status === 'completed' && m.result) dispatch({ type: 'MARK_FIXTURE_COMPLETE', tid: t.id, matchId: m._id, result: m.result })
      })
    }
    load()
  }, [t.id])

  const table = calcTable((t.teams||[]).filter((x: string)=>x.trim()), t.fixtures||[], liveMatches)
  const headers = ['#','Team','P','W','L','NR','Pts','NRR']

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: T.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>📊 Points Table</Text>
      <Text style={{ color: T.textDim, fontSize: 12, marginBottom: 16 }}>Auto-updates after each completed match</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 8, marginBottom: 4 }}>
            {headers.map(h => (
              <Text key={h} style={{ width: h==='Team'?120:44, textAlign: h==='Team'?'left':'center', color: T.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>{h}</Text>
            ))}
          </View>
          {table.length === 0 ? (
            <Text style={{ color: T.textDim, padding: 20, textAlign: 'center' }}>No completed matches yet</Text>
          ) : table.map((r: any, i: number) => (
            <View key={r.team} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: i<2?'#0a2118':'transparent' }}>
              <Text style={{ width: 44, textAlign: 'center', color: i<2?T.accent:T.textDim, fontWeight: '700', fontSize: 13 }}>{i+1}</Text>
              <Text style={{ width: 120, color: T.text, fontWeight: '700', fontSize: 13 }}>{i===0?'🥇 ':i===1?'🥈 ':''}{r.team}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{r.p}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.accent, fontWeight: '700', fontSize: 13 }}>{r.w}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{r.l}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.textMid, fontSize: 13 }}>{r.nr}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: T.gold, fontWeight: '900', fontSize: 15 }}>{r.pts}</Text>
              <Text style={{ width: 44, textAlign: 'center', color: r.nrr>=0?T.accent:T.red, fontWeight: '600', fontSize: 12 }}>{r.nrr>=0?'+':''}{r.nrr}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  )
}

// ── MATCH SETUP view ──────────────────────────────────────────────────────────
function MatchSetupView({ t, f, dispatch }: { t: any; f: any; dispatch: (a: any) => void }) {
  const navigation = useNavigation<Nav>()
  const [toss,     setToss]     = useState(f.team1)
  const [batFirst, setBatFirst] = useState(f.team1)
  const [overs,    setOvers]    = useState(String(f.overs || t.defaultOvers || 10))
  const [t1p,      setT1p]      = useState('')
  const [t2p,      setT2p]      = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const parse = (s: string) => s.split(',').map(x=>x.trim()).filter(Boolean)

  const handleStart = async () => {
    setLoading(true); setError('')
    try {
      const token = await getToken()
      const ovNum = parseInt(overs) || 10
      const res = await fetch(apiUrl('/api/matches'), {
        method: 'POST', headers: jsonHeaders(token),
        body: JSON.stringify({
          team1: f.team1, team2: f.team2, overs: ovNum,
          tossWinner: toss, battingFirst: batFirst,
          wideRuns: t.wideRuns ?? 1, noBallRuns: t.noBallRuns ?? 1,
          team1Players: parse(t1p), team2Players: parse(t2p),
          tournamentId: t.id, tournamentName: t.name, fixtureId: f.id,
        }),
      })
      if (!res.ok) throw new Error('Failed to create match')
      const match = await res.json() as { _id: string }
      dispatch({ type: 'SET_FIXTURE_MATCH', tid: t.id, fid: f.id, matchId: match._id, overs: ovNum })
      navigation.navigate('Scoring', { id: match._id })
    } catch { setError('Failed to start match. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={{ color: T.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 8 }}>MATCH SETUP</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Text style={{ color: T.sky, fontWeight: '900', fontSize: 20 }}>{f.team1}</Text>
        <Text style={{ color: T.textDim, fontSize: 15 }}>vs</Text>
        <Text style={{ color: T.purple, fontWeight: '900', fontSize: 20 }}>{f.team2}</Text>
      </View>

      {/* Toss & bat */}
      <View style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 14 }}>
        {[['TOSS WINNER', toss, setToss], ['BATTING FIRST', batFirst, setBatFirst]].map(([lbl, val, setter]) => (
          <View key={String(lbl)} style={{ marginBottom: 14 }}>
            <Text style={S.fieldLabel}>{String(lbl)}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[f.team1, f.team2].map((team: string) => (
                <TouchableOpacity key={team} onPress={() => (setter as any)(team)}
                  style={[{ flex: 1, paddingVertical: 10, borderRadius: 9, borderWidth: 1.5, alignItems: 'center' }, val===team ? { borderColor: T.accent, backgroundColor: T.accentDim } : { borderColor: T.border, backgroundColor: T.bg }]}>
                  <Text style={{ color: val===team ? T.accent : T.textMid, fontWeight: '700', fontSize: 13 }}>{team}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        <Text style={S.fieldLabel}>OVERS</Text>
        <TextInput style={S.input} value={overs} onChangeText={setOvers} keyboardType="number-pad" placeholderTextColor={T.textDim} />
      </View>

      {/* Players */}
      {[{ team: f.team1, val: t1p, setter: setT1p, color: T.sky }, { team: f.team2, val: t2p, setter: setT2p, color: T.purple }].map(({ team, val, setter, color }) => (
        <View key={team} style={{ backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 14 }}>
          <Text style={[S.fieldLabel, { color }]}>{team} PLAYERS</Text>
          <TextInput style={[S.input, { minHeight: 80 }]} value={val} onChangeText={setter as any}
            placeholder="Player1, Player2, Player3…" placeholderTextColor={T.textDim} multiline />
        </View>
      ))}

      {error !== '' ? (
        <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', marginBottom: 14 }}>
          <Text style={{ color: T.red, fontSize: 13 }}>⚠ {error}</Text>
        </View>
      ) : null}

      <TouchableOpacity onPress={handleStart} disabled={loading} style={[S.btn, loading && { opacity: 0.6 }]}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.btnTxt}>▶ Start Match</Text>}
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

  // Load persisted state on mount
  useEffect(() => {
    loadState().then(saved => {
      if (saved) rawDispatch({ type: 'LOAD', state: saved })
      setReady(true)
    })
  }, [])

  const dispatch = useCallback((action: any) => {
    rawDispatch(action)
  }, [])

  // Persist whenever state changes
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
    { key: 'setup',     icon: '⚙',  label: 'Setup' },
    { key: 'fixtures',  icon: '📅',  label: 'Fixtures' },
    { key: 'standings', icon: '📊',  label: 'Table' },
  ] as const

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => {
          if (state.view === 'home') navigation.goBack()
          else if (state.view === 'matchSetup') dispatch({ type: 'SET_VIEW', view: 'fixtures' })
          else dispatch({ type: 'SET_VIEW', view: 'home' })
        }} style={S.backBtn}>
          <Text style={{ color: T.textMid, fontSize: 18, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>
            {state.view === 'home' ? '🏆 Tournaments' : t?.name ?? '🏆 Tournaments'}
          </Text>
          {t && state.view !== 'home' ? (
            <Text style={S.headerSub}>{FORMATS.find(f => f.key === t.format)?.label} · {(t.teams||[]).filter((x: string)=>x).length} teams</Text>
          ) : null}
        </View>
      </View>

      {/* Tab bar (only when inside a tournament) */}
      {t && state.view !== 'home' && state.view !== 'matchSetup' && (
        <View style={S.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity key={tab.key} onPress={() => dispatch({ type: 'SET_VIEW', view: tab.key })}
              style={[S.tabBtn, state.view === tab.key && S.tabBtnActive]}>
              <Text style={{ fontSize: 14 }}>{tab.icon}</Text>
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
  tabBtnTxt: { fontSize: 11, fontWeight: '700', color: T.textDim },

  sectionLabel: { fontSize: 10, color: T.textDim, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10, marginTop: 4 },
  fieldLabel: { fontSize: 10, color: T.textDim, fontWeight: '700', letterSpacing: 1.5, marginBottom: 5 },

  input: { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 8, color: T.text, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },

  btn: { backgroundColor: T.accent, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSmall: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, alignItems: 'center' },
  btnSmallTxt: { color: T.textMid, fontWeight: '700', fontSize: 12 },
})