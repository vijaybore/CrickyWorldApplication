// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Players Screen
// src/screens/PlayersScreen.tsx
// Converted from Players.jsx → React Native TypeScript
// Includes: player list, search, role filter, sort, add form, profile sheet
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput , Pressable, FlatList,
  ScrollView, Modal, StyleSheet, ActivityIndicator,
  Alert, Image, StatusBar, Platform} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl } from '../services/api'
import type { Player, PlayerRole, RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES: PlayerRole[] = ['batsman', 'bowler', 'allrounder', 'wk-batsman']
const ROLE_ICON:  Record<string, string> = { batsman:'🏏', bowler:'🎳', allrounder:'⭐', 'wk-batsman':'🧤' }
const ROLE_COLOR: Record<string, string> = { batsman:'#60a5fa', bowler:'#f87171', allrounder:'#facc15', 'wk-batsman':'#a78bfa' }
const ROLE_LABEL: Record<string, string> = { batsman:'Batsman', bowler:'Bowler', allrounder:'All-Rounder', 'wk-batsman':'WK-Batsman' }
const BG_COLORS = ['#7f1d1d','#1e3a5f','#064e3b','#78350f','#3b0764','#134e4a']

const SORT_OPTIONS = [
  { key:'runs',    label:'Runs',    fn:(a:Player,b:Player)=>(b.totalRuns??0)-(a.totalRuns??0) },
  { key:'wickets', label:'Wickets', fn:(a:Player,b:Player)=>(b.totalWickets??0)-(a.totalWickets??0) },
  { key:'matches', label:'Matches', fn:(a:Player,b:Player)=>(b.totalMatches??0)-(a.totalMatches??0) },
  { key:'name',    label:'A–Z',     fn:(a:Player,b:Player)=>a.name.localeCompare(b.name) },
]

async function getToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem('token') } catch { return null }
}

function fmtOv(b: number): string { return `${Math.floor(b/6)}.${b%6}` }

function derive(p: Player) {
  const to = p.timesOut ?? 0, tr = p.totalRuns ?? 0, bf = p.totalBallsFaced ?? 0
  const wk = p.totalWickets ?? 0, bb = p.totalBallsBowled ?? 0, rc = p.totalRunsConceded ?? 0
  return {
    batAvg:  to > 0 ? (tr/to).toFixed(1) : tr > 0 ? `${tr}*` : '—',
    batSR:   bf > 0 ? (tr/bf*100).toFixed(1) : '—',
    eco:     bb > 0 ? (rc/(bb/6)).toFixed(2) : '—',
    bowlAvg: wk > 0 ? (rc/wk).toFixed(1) : '—',
    bowlSR:  wk > 0 ? (bb/wk).toFixed(1) : '—',
    bestFig: (p.bestBowlingW ?? 0) > 0 ? `${p.bestBowlingW}/${p.bestBowlingR}` : '—',
    overs:   fmtOv(bb)}
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ player, size=48 }: { player: Player; size?: number }) {
  const ini = (player.name||'?').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)
  const bg  = BG_COLORS[(player.name?.charCodeAt(0)??0) % BG_COLORS.length]
  const rc  = ROLE_COLOR[player.role] || '#555'
  return (
    <View style={{ width:size, height:size, borderRadius:size/2, overflow:'hidden', borderWidth:2, borderColor:rc, flexShrink:0 }}>
      {player.photoUrl
        ? <Image source={{ uri: player.photoUrl }} style={{ width:'100%', height:'100%' }} resizeMode="cover" />
        : <View style={{ width:'100%', height:'100%', backgroundColor:bg, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ color:'#e0e0e0', fontSize:size*0.34, fontWeight:'700' }}>{ini}</Text>
          </View>
      }
    </View>
  )
}

// ── Stat Row ──────────────────────────────────────────────────────────────────
function StatRow({ label, value, color='#f0f0f0', isAlt=false }: { label:string; value:unknown; color?:string; isAlt?:boolean }) {
  return (
    <View style={[srStyles.row, isAlt && { backgroundColor:'#161616' }]}>
      <Text style={srStyles.label}>{label}</Text>
      <Text style={[srStyles.value, { color }]}>{String(value ?? '—')}</Text>
    </View>
  )
}
const srStyles = StyleSheet.create({
  row: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:11, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.04)' },
  label: { fontSize:12, color:'#888', fontWeight:'700' },
  value: { fontSize:17, fontWeight:'700', fontVariant:['tabular-nums'] }})

// ── Add Player Form ───────────────────────────────────────────────────────────
function AddForm({ onCreated, onCancel }: { onCreated:(p:Player)=>void; onCancel:()=>void }) {
  const [form, setForm] = useState({ name:'', role:'allrounder' as PlayerRole, jerseyNumber:'', battingStyle:'', bowlingStyle:'' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch(apiUrl('/api/players'), {
        method:'POST', headers:{ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) },
        body: JSON.stringify(form)})
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as Player
      onCreated(data)
    } catch { Alert.alert('Error','Failed to create player') }
    finally { setSaving(false) }
  }

  return (
    <View style={addStyles.wrap}>
      <Text style={addStyles.title}>New Player</Text>

      <Text style={addStyles.lbl}>NAME *</Text>
      <TextInput style={addStyles.input} value={form.name} onChangeText={v=>setForm(f=>({...f,name:v}))}
        placeholder="Player name" placeholderTextColor="#444" autoFocus />

      <Text style={addStyles.lbl}>JERSEY #</Text>
      <TextInput style={addStyles.input} value={form.jerseyNumber} onChangeText={v=>setForm(f=>({...f,jerseyNumber:v}))}
        placeholder="Optional" placeholderTextColor="#444" keyboardType="number-pad" />

      <Text style={addStyles.lbl}>ROLE</Text>
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:12 }}>
        {ROLES.map(r=>(
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={r} onPress={()=>setForm(f=>({...f,role:r}))} style={[addStyles.roleBtn, form.role===r && { borderColor:ROLE_COLOR[r], backgroundColor:ROLE_COLOR[r]+'22' }]}>
            <Text style={[addStyles.roleTxt, form.role===r && { color:ROLE_COLOR[r] }]}>{ROLE_ICON[r]} {ROLE_LABEL[r]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={addStyles.lbl}>BATTING STYLE</Text>
      <TextInput style={addStyles.input} value={form.battingStyle} onChangeText={v=>setForm(f=>({...f,battingStyle:v}))}
        placeholder="e.g. Right-hand bat" placeholderTextColor="#444" />

      <Text style={addStyles.lbl}>BOWLING STYLE</Text>
      <TextInput style={addStyles.input} value={form.bowlingStyle} onChangeText={v=>setForm(f=>({...f,bowlingStyle:v}))}
        placeholder="e.g. Right-arm medium" placeholderTextColor="#444" />

      <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={onCancel} style={[addStyles.btn, addStyles.cancelBtn]}>
          <Text style={{ color:'#888', fontWeight:'700', fontSize:13 }}>Cancel</Text>
        </Pressable>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={save} disabled={!form.name.trim()||saving} style={[addStyles.btn, addStyles.saveBtn, (!form.name.trim()||saving)&&{backgroundColor:'#222'}]}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color:'#fff', fontWeight:'800', fontSize:13 }}>+ Add Player</Text>}
        </Pressable>
      </View>
    </View>
  )
}
const addStyles = StyleSheet.create({
  wrap: { backgroundColor:'#141414', borderRadius:14, padding:16, marginBottom:12, borderWidth:1, borderColor:'rgba(255,68,68,0.2)' },
  title: { color:'#f0f0f0', fontWeight:'700', fontSize:16, marginBottom:14 },
  lbl: { color:'#555', fontSize:10, fontWeight:'800', letterSpacing:1, marginBottom:5 },
  input: { backgroundColor:'#0d0d0d', borderRadius:9, borderWidth:1, borderColor:'#2a2a2a', color:'#f0f0f0', fontSize:13, padding:10, marginBottom:12 },
  roleBtn: { paddingHorizontal:12, paddingVertical:7, borderRadius:9, borderWidth:1, borderColor:'#2a2a2a' },
  roleTxt: { color:'#666', fontSize:11, fontWeight:'800' },
  btn: { flex:1, padding:12, borderRadius:10, alignItems:'center', justifyContent:'center' },
  cancelBtn: { backgroundColor:'#1a1a1a', borderWidth:1, borderColor:'#2a2a2a' },
  saveBtn: { flex:2, backgroundColor:'#cc0000' }})

// ── Profile Sheet ─────────────────────────────────────────────────────────────
function ProfileSheet({ player, onClose, onUpdated, onDeleted }: { player:Player; onClose:()=>void; onUpdated:(p:Player)=>void; onDeleted:(id:string)=>void }) {
  const [tab, setTab] = useState<'batting'|'bowling'>('batting')
  const [syncing, setSyncing] = useState(false)
  const d  = derive(player)
  const rc = ROLE_COLOR[player.role] || '#888'

  const sync = async () => {
    setSyncing(true)
    try {
      const token = await getToken()
      const res = await fetch(apiUrl(`/api/players/${player._id}/sync`), {
        method:'POST', headers:token?{Authorization:`Bearer ${token}`}:{}})
      if (!res.ok) throw new Error()
      const data = await res.json() as Player
      onUpdated(data)
    } catch { Alert.alert('Error','Sync failed') }
    finally { setSyncing(false) }
  }

  const del = () => {
    Alert.alert('Delete Player', `Delete ${player.name}?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
        const token = await getToken()
        await fetch(apiUrl(`/api/players/${player._id}`), { method:'DELETE', headers:token?{Authorization:`Bearer ${token}`}:{} })
        onDeleted(player._id)
      }},
    ])
  }

  const batRows = [
    { label:'Matches',       value:player.totalMatches,      color:'#f0f0f0' },
    { label:'Runs',          value:player.totalRuns,         color:'#ff4444' },
    { label:'Highest Score', value:player.highestScore,      color:'#ff4444' },
    { label:'Average',       value:d.batAvg,                 color:'#60a5fa' },
    { label:'Strike Rate',   value:d.batSR,                  color:'#facc15' },
    { label:'Balls Faced',   value:player.totalBallsFaced,   color:'#888' },
    { label:'Fours (4s)',    value:player.totalFours,        color:'#4ade80' },
    { label:'Sixes (6s)',    value:player.totalSixes,        color:'#c084fc' },
    { label:'Half Centuries',value:player.totalFifties,      color:'#fb923c' },
    { label:'Centuries',     value:player.totalHundreds,     color:'#facc15' },
  ]
  const bowlRows = [
    { label:'Wickets',       value:player.totalWickets,      color:'#c084fc' },
    { label:'Best Figures',  value:d.bestFig,                color:'#ff4444' },
    { label:'Economy',       value:d.eco,                    color:'#4ade80' },
    { label:'Average',       value:d.bowlAvg,                color:'#60a5fa' },
    { label:'Strike Rate',   value:d.bowlSR,                 color:'#38bdf8' },
    { label:'Overs Bowled',  value:d.overs,                  color:'#888' },
    { label:'Runs Conceded', value:player.totalRunsConceded, color:'#f87171' },
    { label:'Wides',         value:player.totalWides,        color:'#fb923c' },
    { label:'5-Wicket Hauls',value:player.fiveWickets,       color:'#ff4444' },
  ]
  const rows = tab === 'batting' ? batRows : bowlRows

  return (
    <View style={ps.container}>
      <View style={ps.handle} />

      {/* Top bar */}
      <View style={ps.topBar}>
        <Text style={ps.topBarTitle}>Player Profile</Text>
        <View style={{ flexDirection:'row', gap:8 }}>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={sync} disabled={syncing} style={ps.syncBtn}>
            <Text style={ps.syncTxt}>{syncing ? '…' : '↻ Sync'}</Text>
          </Pressable>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={onClose} style={ps.closeBtn}>
            <Text style={{ color:'#888', fontSize:15, fontWeight:'700' }}>✕</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={ps.hero}>
          <Avatar player={player} size={76} />
          <View style={{ flex:1, marginLeft:16 }}>
            <Text style={ps.heroName}>{player.name}</Text>
            <View style={[ps.roleBadge, { backgroundColor:rc+'18', borderColor:rc+'33' }]}>
              <Text style={[ps.roleText, { color:rc }]}>{ROLE_ICON[player.role]} {ROLE_LABEL[player.role]}</Text>
            </View>
            {(player.battingStyle||player.bowlingStyle) && (
              <Text style={ps.styleText}>
                {[player.battingStyle, player.bowlingStyle].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        </View>

        {/* Summary strip */}
        <View style={ps.strip}>
          {[{l:'MATCHES',v:player.totalMatches,c:'#f0f0f0'},{l:'RUNS',v:player.totalRuns,c:'#ff4444'},{l:'WICKETS',v:player.totalWickets,c:'#c084fc'}].map((s,i)=>(
            <View key={s.l} style={[ps.stripCell, i<2&&{ borderRightWidth:1, borderRightColor:'rgba(255,255,255,0.05)' }]}>
              <Text style={[ps.stripVal, { color:s.c }]}>{s.v ?? 0}</Text>
              <Text style={ps.stripLbl}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <View style={ps.tabRow}>
          {(['batting','bowling'] as const).map(t=>(
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={t} onPress={()=>setTab(t)} style={[ps.tab, tab===t&&ps.tabActive]}>
              <Text style={[ps.tabTxt, tab===t&&{ color:t==='batting'?'#ff4444':'#c084fc' }]}>
                {t==='batting'?'🏏 Batting':'🎳 Bowling'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Stats */}
        <View style={{ borderRadius:12, overflow:'hidden', borderWidth:1, borderColor:'rgba(255,255,255,0.06)', margin:14 }}>
          {rows.map((r,i)=><StatRow key={r.label} label={r.label} value={r.value} color={r.color} isAlt={i%2===1}/>)}
        </View>

        <Text style={{ color:'#555', textAlign:'center', fontSize:11, fontWeight:'600', paddingBottom:8 }}>
          Tap ↻ Sync to refresh stats from all completed matches
        </Text>

        {/* Delete */}
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={del} style={ps.deleteBtn}>
          <Text style={ps.deleteTxt}>🗑 Delete Player</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}
const ps = StyleSheet.create({
  container: { backgroundColor:'#0d0d0d', borderTopLeftRadius:22, borderTopRightRadius:22, maxHeight:'92%', borderWidth:1, borderColor:'rgba(255,255,255,0.06)' },
  handle: { width:36, height:4, backgroundColor:'#2e2e2e', borderRadius:2, alignSelf:'center', marginTop:12 },
  topBar: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)' },
  topBarTitle: { color:'#888', fontWeight:'700', fontSize:16 },
  syncBtn: { paddingHorizontal:13, paddingVertical:7, borderRadius:9, backgroundColor:'rgba(74,222,128,0.08)', borderWidth:1, borderColor:'rgba(74,222,128,0.18)' },
  syncTxt: { color:'#4ade80', fontSize:12, fontWeight:'700' },
  closeBtn: { width:32, height:32, borderRadius:9, backgroundColor:'#1a1a1a', borderWidth:1, borderColor:'#2a2a2a', alignItems:'center', justifyContent:'center' },
  hero: { flexDirection:'row', alignItems:'center', padding:20, paddingBottom:16, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)', backgroundColor:'#151515' },
  heroName: { color:'#f5f5f5', fontWeight:'700', fontSize:22, marginBottom:6 },
  roleBadge: { borderRadius:20, paddingHorizontal:10, paddingVertical:4, borderWidth:1, alignSelf:'flex-start', marginBottom:4 },
  roleText: { fontSize:11, fontWeight:'800' },
  styleText: { fontSize:11, color:'#666', fontWeight:'600' },
  strip: { flexDirection:'row' },
  stripCell: { flex:1, paddingVertical:14, alignItems:'center' },
  stripVal: { fontSize:28, fontWeight:'700', lineHeight:30 },
  stripLbl: { fontSize:9, color:'#555', fontWeight:'800', letterSpacing:1, marginTop:3 },
  tabRow: { flexDirection:'row', padding:12, paddingBottom:0, gap:8 },
  tab: { paddingHorizontal:16, paddingVertical:7, borderRadius:20, backgroundColor:'#1a1a1a', borderWidth:1, borderColor:'#2a2a2a' },
  tabActive: { backgroundColor:'rgba(255,68,68,0.1)', borderColor:'rgba(255,68,68,0.3)' },
  tabTxt: { color:'#666', fontSize:12, fontWeight:'800' },
  deleteBtn: { marginHorizontal:14, marginBottom:32, padding:12, borderRadius:11, borderWidth:1, borderColor:'rgba(255,68,68,0.2)', alignItems:'center' },
  deleteTxt: { color:'#ff4444', fontWeight:'800', fontSize:13 }})

// ── Player Card ───────────────────────────────────────────────────────────────
function PlayerCard({ player, onPress }: { player:Player; onPress:()=>void }) {
  const d     = derive(player)
  const hasBat  = (player.totalRuns??0) > 0 || (player.totalBallsFaced??0) > 0
  const hasBowl = (player.totalWickets??0) > 0 || (player.totalBallsBowled??0) > 0
  const rc = ROLE_COLOR[player.role] || '#555'
  return (
    <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={onPress} style={pcStyles.card}>
      <Avatar player={player} size={48} />
      <View style={{ flex:1, marginLeft:12 }}>
        <View style={{ flexDirection:'row', alignItems:'baseline', gap:6, marginBottom:4 }}>
          <Text style={pcStyles.name} numberOfLines={1}>{player.name}</Text>
          {player.jerseyNumber && <Text style={pcStyles.jersey}>#{player.jerseyNumber}</Text>}
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
          <View style={{ paddingHorizontal:8, paddingVertical:2, borderRadius:20, backgroundColor:rc+'15' }}>
            <Text style={[pcStyles.roleTag, { color:rc }]}>{ROLE_ICON[player.role]} {ROLE_LABEL[player.role]}</Text>
          </View>
          <Text style={pcStyles.meta}>{player.totalMatches ?? 0}M</Text>
        </View>
      </View>
      <View style={{ flexDirection:'row', gap:12, alignItems:'center' }}>
        {hasBat&&<View style={{ alignItems:'center' }}><Text style={[pcStyles.stat,{color:'#ff4444'}]}>{player.totalRuns}</Text><Text style={pcStyles.statLbl}>RUNS</Text></View>}
        {hasBowl&&<View style={{ alignItems:'center' }}><Text style={[pcStyles.stat,{color:'#c084fc'}]}>{player.totalWickets}</Text><Text style={pcStyles.statLbl}>WKTS</Text></View>}
        <Text style={{ color:'#2e2e2e', fontSize:18 }}>›</Text>
      </View>
    </Pressable>
  )
}
const pcStyles = StyleSheet.create({
  card: { flexDirection:'row', alignItems:'center', backgroundColor:'#141414', borderRadius:14, padding:12, paddingHorizontal:14, marginBottom:8, borderWidth:1, borderColor:'rgba(255,255,255,0.06)' },
  name: { color:'#f0f0f0', fontWeight:'700', fontSize:16 },
  jersey: { color:'#444', fontSize:10, fontWeight:'800' },
  roleTag: { fontSize:10, fontWeight:'800' },
  meta: { fontSize:10, color:'#444' },
  stat: { fontSize:18, fontWeight:'700', lineHeight:20 },
  statLbl: { fontSize:9, color:'#444', fontWeight:'800' }})

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function PlayersScreen() {
  const navigation = useNavigation<Nav>()
  const [players,  setPlayers]  = useState<Player[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [roleF,    setRoleF]    = useState<'all'|PlayerRole>('all')
  const [sortBy,   setSortBy]   = useState('runs')
  const [adding,   setAdding]   = useState(false)
  const [selected, setSelected] = useState<Player|null>(null)

  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res   = await fetch(apiUrl('/api/players'), { headers: token?{Authorization:`Bearer ${token}`}:{} })
      const data  = await res.json() as Player[]
      setPlayers(data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPlayers() }, [fetchPlayers])

  const sortFn = SORT_OPTIONS.find(s => s.key === sortBy)?.fn ?? SORT_OPTIONS[0].fn
  const sorted = players
    .filter(p => roleF === 'all' || p.role === roleF)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort(sortFn)

  const totalRuns    = players.reduce((s, p) => s + (p.totalRuns ?? 0), 0)
  const totalWickets = players.reduce((s, p) => s + (p.totalWickets ?? 0), 0)

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>←</Text>
          </Pressable>
          <Text style={styles.title}>👤 Players</Text>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={() => setAdding(a => !a)}
            style={[styles.addBtn, adding && { backgroundColor:'#1a1a1a', borderWidth:1, borderColor:'#2a2a2a' }]}>
            <Text style={[styles.addBtnTxt, adding && { color:'#666' }]}>{adding ? '✕ Cancel' : '+ Add'}</Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View style={styles.strip}>
          {[{l:'PLAYERS',v:players.length,c:'#60a5fa'},{l:'RUNS',v:totalRuns,c:'#ff4444'},{l:'WICKETS',v:totalWickets,c:'#c084fc'}].map((s,i)=>(
            <View key={s.l} style={[styles.stripCell, i<2&&{borderRightWidth:1,borderRightColor:'rgba(255,255,255,0.05)'}]}>
              <Text style={[styles.stripVal, { color:s.c }]}>{s.v}</Text>
              <Text style={styles.stripLbl}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch}
            placeholder="🔍  Search player..." placeholderTextColor="#444" />
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal:12, paddingBottom:10 }} contentContainerStyle={{ gap:6 }}>
          {[{key:'all',label:'All'}, ...ROLES.map(r=>({key:r,label:`${ROLE_ICON[r]} ${ROLE_LABEL[r]}`}))].map(r=>(
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={r.key} onPress={()=>setRoleF(r.key as 'all'|PlayerRole)}
              style={[styles.chip, roleF===r.key&&styles.chipActive]}>
              <Text style={[styles.chipTxt, roleF===r.key&&{color:'#ff4444'}]}>{r.label}</Text>
            </Pressable>
          ))}
          <View style={{ width:1, backgroundColor:'#2a2a2a', marginHorizontal:4 }} />
          {SORT_OPTIONS.map(s=>(
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={s.key} onPress={()=>setSortBy(s.key)}
              style={[styles.chip, sortBy===s.key&&{backgroundColor:'rgba(250,204,21,0.12)',borderColor:'rgba(250,204,21,0.3)'}]}>
              <Text style={[styles.chipTxt, sortBy===s.key&&{color:'#facc15'}]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={sorted}
        keyExtractor={p => p._id}
        contentContainerStyle={{ padding:12, paddingBottom:80 }}
        ListHeaderComponent={adding ? <AddForm onCreated={p=>{setPlayers(ps=>[p,...ps]);setAdding(false)}} onCancel={()=>setAdding(false)} /> : null}
        ListEmptyComponent={
          loading
            ? <View style={{ alignItems:'center', padding:60 }}><ActivityIndicator color="#ff4444" size="large" /></View>
            : <View style={{ alignItems:'center', padding:60 }}>
                <Text style={{ fontSize:48, marginBottom:12 }}>👥</Text>
                <Text style={{ color:'#555', fontWeight:'700', fontSize:14 }}>
                  {players.length===0 ? 'No players yet' : 'No matches found'}
                </Text>
              </View>
        }
        renderItem={({ item }) => <PlayerCard player={item} onPress={()=>setSelected(item)} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Profile Modal */}
      <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} style={styles.overlay} onPress={() => setSelected(null)} />
        {selected && (
          <View style={styles.sheetOuter}>
            <ProfileSheet
              player={selected}
              onClose={() => setSelected(null)}
              onUpdated={p => { setPlayers(ps => ps.map(x => x._id===p._id?p:x)); setSelected(p) }}
              onDeleted={id => { setPlayers(ps => ps.filter(x => x._id!==id)); setSelected(null) }}
            />
          </View>
        )}
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex:1, backgroundColor:'#0a0a0a' },
  header: { backgroundColor:'#141414', borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)' },
  headerTop: { flexDirection:'row', alignItems:'center', gap:10, padding:14, paddingTop: Platform.OS==='ios'?50:36 },
  backBtn: { width:34,height:34,borderRadius:9,backgroundColor:'rgba(255,255,255,0.06)',alignItems:'center',justifyContent:'center' },
  backTxt: { color:'#aaa', fontSize:18, fontWeight:'600' },
  title: { flex:1, color:'#f0f0f0', fontWeight:'700', fontSize:20, letterSpacing:0.5 },
  addBtn: { paddingHorizontal:16, paddingVertical:8, borderRadius:10, backgroundColor:'#cc0000' },
  addBtnTxt: { color:'#fff', fontWeight:'800', fontSize:13 },
  strip: { flexDirection:'row', borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.05)' },
  stripCell: { flex:1, paddingVertical:9, alignItems:'center' },
  stripVal: { fontSize:20, fontWeight:'700' },
  stripLbl: { fontSize:9, color:'#444', fontWeight:'800', letterSpacing:0.8, marginTop:2 },
  searchWrap: { paddingHorizontal:12, paddingTop:10 },
  searchInput: { backgroundColor:'#0d0d0d', borderRadius:10, borderWidth:1, borderColor:'#252525', color:'#f0f0f0', fontSize:13, padding:10, paddingHorizontal:14, marginBottom:8 },
  chip: { paddingHorizontal:16, paddingVertical:7, borderRadius:20, backgroundColor:'#161616', borderWidth:1, borderColor:'#2a2a2a', flexShrink:0 },
  chipActive: { backgroundColor:'rgba(255,68,68,0.12)', borderColor:'rgba(255,68,68,0.3)' },
  chipTxt: { color:'#666', fontSize:12, fontWeight:'800' },
  overlay: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.7)' },
  sheetOuter: { position:'absolute', bottom:0, left:0, right:0 }})