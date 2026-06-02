// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Records Screen
// src/screens/RecordsScreen.tsx
// Converted from Records.jsx → React Native TypeScript
// Features: batting/bowling/fielding leaderboards, player stat detail, filters
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react'
import {
  View, Text, FlatList , Pressable, Modal,
  ScrollView, StyleSheet, ActivityIndicator,
  StatusBar, Platform, Image} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiUrl } from '../services/api'
import type { RootStackParamList } from '../types'

type Nav = NativeStackNavigationProp<RootStackParamList>

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawMatch { _id:string; team1:string; team2:string; innings1?:any; innings2?:any; createdAt?:string }
interface PlayerStat {
  name:string; photoUrl?:string; matches:number
  runs:number; balls:number; fours:number; sixes:number
  highScore:number; highScoreNO:boolean; timesOut:number; notOuts:number
  fifties:number; hundreds:number; nineties:number; ducks:number
  wkts:number; ballsBowled:number; runsConceded:number
  wides:number; noBalls:number; fiveWickets:number; threeWickets:number
  bestW:number; bestR:number; catches:number; stumpings:number; runOuts:number
  totalDis:number
  batAvg:number|null; batAvgD:string; batSR:number|null; batSRD:string
  eco:number|null; ecoD:string; bowlAvg:number|null; bowlAvgD:string
  bowlSR:number|null; bowlSRD:string; bestFig:string; hsD:string; overs:string
}

const BG_COLORS = ['#7f1d1d','#1e3a5f','#064e3b','#78350f','#3b0764','#134e4a','#422006','#0c4a6e']

async function getToken(): Promise<string|null> {
  try { return await AsyncStorage.getItem('token') } catch { return null }
}

function fmtOv(b:number) { return `${Math.floor(b/6)}.${b%6}` }

// ── Build career stats from match data ────────────────────────────────────────
function buildStats(matches: RawMatch[]): PlayerStat[] {
  const map: Record<string, any> = {}
  const ensure = (name:string) => {
    if (!name) return null
    if (!map[name]) map[name] = { name, matchIds:new Set(), runs:0, balls:0, fours:0, sixes:0, nineties:0, timesOut:0, highScore:0, highScoreNO:false, fifties:0, hundreds:0, ducks:0, notOuts:0, wkts:0, ballsBowled:0, runsConceded:0, wides:0, noBalls:0, fiveWickets:0, threeWickets:0, bestW:0, bestR:999, catches:0, stumpings:0, runOuts:0 }
    return map[name]
  }
  matches.forEach(m => {
    ;[m.innings1, m.innings2].forEach(inn => {
      if (!inn) return
      ;(inn.battingStats||[]).forEach((p:any) => {
        if (!p.name) return
        const s = ensure(p.name); s.matchIds.add(m._id)
        const r=p.runs||0; s.runs+=r; s.balls+=p.balls||0; s.fours+=p.fours||0; s.sixes+=p.sixes||0
        if (r>s.highScore){s.highScore=r;s.highScoreNO=!p.isOut}
        if (p.isOut){s.timesOut++;if(r===0)s.ducks++}else s.notOuts++
        if(r>=100)s.hundreds++;else if(r>=90)s.nineties++;else if(r>=50)s.fifties++
      })
      ;(inn.bowlingStats||[]).forEach((p:any) => {
        if (!p.name) return
        const s=ensure(p.name); s.matchIds.add(m._id)
        const w=p.wickets||0,r=p.runs||0; s.wkts+=w; s.ballsBowled+=p.balls||0; s.runsConceded+=r; s.wides+=p.wides||0; s.noBalls+=p.noBalls||0
        if(w>=5)s.fiveWickets++;if(w>=3)s.threeWickets++
        if(w>s.bestW||(w===s.bestW&&r<s.bestR&&w>0)){s.bestW=w;s.bestR=r}
      })
    })
  })
  return Object.values(map).map((s:any) => {
    const batAvgN=s.timesOut>0?s.runs/s.timesOut:null
    const ecoN=s.ballsBowled>0?s.runsConceded/(s.ballsBowled/6):null
    const bAvgN=s.wkts>0?s.runsConceded/s.wkts:null
    const bSRN=s.wkts>0?s.ballsBowled/s.wkts:null
    const batSRN=s.balls>0?s.runs/s.balls*100:null
    return { ...s, matches:s.matchIds.size, totalDis:s.catches+s.stumpings+s.runOuts, batAvg:batAvgN?+batAvgN.toFixed(2):null, batAvgD:batAvgN?batAvgN.toFixed(2):s.runs>0?`${s.runs}*`:'—', batSR:batSRN?+batSRN.toFixed(2):null, batSRD:batSRN?batSRN.toFixed(2):'—', eco:ecoN?+ecoN.toFixed(2):null, ecoD:ecoN?ecoN.toFixed(2):'—', bowlAvg:bAvgN?+bAvgN.toFixed(2):null, bowlAvgD:bAvgN?bAvgN.toFixed(2):'—', bowlSR:bSRN?+bSRN.toFixed(2):null, bowlSRD:bSRN?bSRN.toFixed(2):'—', bestFig:s.bestW>0?`${s.bestW}/${s.bestR}`:'—', hsD:s.highScore>0?`${s.highScore}${s.highScoreNO?'*':''}`:'0', overs:fmtOv(s.ballsBowled) }
  })
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ p, size=36 }: { p:PlayerStat; size?:number }) {
  const ini = (p.name||'?').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)
  const bg  = BG_COLORS[(p.name||'').charCodeAt(0)%BG_COLORS.length]
  return (
    <View style={{ width:size, height:size, borderRadius:size/2, overflow:'hidden', borderWidth:2, borderColor:'#2a2a2a', flexShrink:0 }}>
      {p.photoUrl
        ? <Image source={{ uri:p.photoUrl }} style={{ width:'100%', height:'100%' }} resizeMode="cover" />
        : <View style={{ flex:1, backgroundColor:bg, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ color:'#e0e0e0', fontSize:size*0.36, fontWeight:'700' }}>{ini}</Text>
          </View>}
    </View>
  )
}

// ── Player Detail Sheet ────────────────────────────────────────────────────────
function PlayerDetail({ p, onClose }: { p:PlayerStat; onClose:()=>void }) {
  const hasBat=p.balls>0||p.runs>0, hasBowl=p.ballsBowled>0||p.wkts>0, hasFld=p.totalDis>0
  const Row = ({ label, value, color='#f0f0f0', hi=false }: any) => (
    <View style={[pdStyles.row, hi&&{ backgroundColor:'rgba(255,68,68,0.05)' }]}>
      <Text style={pdStyles.lbl}>{label}</Text>
      <Text style={[pdStyles.val, { color }]}>{String(value??'—')}</Text>
    </View>
  )
  const Sec = ({ t, c='#888' }: any) => (
    <Text style={[pdStyles.sec, { color:c }]}>{t}</Text>
  )
  return (
    <View style={pdStyles.sheet}>
      <View style={pdStyles.handle} />
      <View style={pdStyles.header}>
        <Avatar p={p} size={58} />
        <View style={{ flex:1, marginLeft:14 }}>
          <Text style={pdStyles.name}>{p.name}</Text>
          <Text style={pdStyles.meta}>{p.matches} {p.matches===1?'match':'matches'}</Text>
        </View>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={onClose} style={pdStyles.closeBtn}>
          <Text style={{ color:'#888', fontSize:16, fontWeight:'700' }}>✕</Text>
        </Pressable>
      </View>

      {/* Summary strip */}
      <View style={pdStyles.strip}>
        {[{v:p.runs,l:'RUNS',c:'#ff4444'},{v:p.wkts,l:'WICKETS',c:'#c084fc'},{v:p.totalDis,l:'DISMIS.',c:'#4ade80'}].map((s,i)=>(
          <View key={s.l} style={[pdStyles.stripCell, i<2&&{ borderRightWidth:1, borderRightColor:'rgba(255,255,255,0.05)' }]}>
            <Text style={[pdStyles.stripVal, { color:s.c }]}>{s.v}</Text>
            <Text style={pdStyles.stripLbl}>{s.l}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {hasBat&&<><Sec t="🏏 BATTING" c="#ff5555"/><Row label="Matches" value={p.matches}/><Row label="Runs" value={p.runs} color="#ff4444" hi/><Row label="Highest Score" value={p.hsD} color="#ff6666"/><Row label="Average" value={p.batAvgD} color="#60a5fa"/><Row label="Strike Rate" value={p.batSRD} color="#facc15"/><Row label="Fours (4s)" value={p.fours} color="#4ade80"/><Row label="Sixes (6s)" value={p.sixes} color="#c084fc"/><Row label="Centuries" value={p.hundreds} color="#facc15"/><Row label="Half Centuries" value={p.fifties} color="#fb923c"/><Row label="Ducks" value={p.ducks} color="#f87171"/></>}
        {hasBowl&&<><Sec t="🎳 BOWLING" c="#c084fc"/><Row label="Wickets" value={p.wkts} color="#c084fc" hi/><Row label="Best Figures" value={p.bestFig} color="#ff4444"/><Row label="Economy" value={p.ecoD} color="#4ade80"/><Row label="Average" value={p.bowlAvgD} color="#60a5fa"/><Row label="Overs Bowled" value={p.overs}/><Row label="5-Wicket Hauls" value={p.fiveWickets} color="#ff4444"/></>}
        {hasFld&&<><Sec t="🧤 FIELDING" c="#4ade80"/><Row label="Total Dismissals" value={p.totalDis} color="#4ade80" hi/><Row label="Catches" value={p.catches} color="#4ade80"/><Row label="Stumpings" value={p.stumpings} color="#a78bfa"/><Row label="Run Outs" value={p.runOuts} color="#fb923c"/></>}
        <View style={{ height:40 }} />
      </ScrollView>
    </View>
  )
}
const pdStyles = StyleSheet.create({
  sheet: { backgroundColor:'#0a0a0a', borderTopLeftRadius:22, borderTopRightRadius:22, maxHeight:'92%', borderWidth:1, borderColor:'rgba(255,255,255,0.06)' },
  handle: { width:36, height:4, backgroundColor:'#2e2e2e', borderRadius:2, alignSelf:'center', marginTop:12 },
  header: { flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)' },
  name: { color:'#f0f0f0', fontWeight:'700', fontSize:20 },
  meta: { color:'#666', fontSize:12, marginTop:2 },
  closeBtn: { width:30, height:30, borderRadius:8, backgroundColor:'#1a1a1a', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#2a2a2a' },
  strip: { flexDirection:'row', borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  stripCell: { flex:1, paddingVertical:12, alignItems:'center' },
  stripVal: { fontSize:26, fontWeight:'700', lineHeight:28 },
  stripLbl: { fontSize:9, color:'#555', fontWeight:'800', letterSpacing:1, marginTop:3 },
  sec: { fontSize:10, fontWeight:'800', letterSpacing:2, padding:12, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  row: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:9, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.04)' },
  lbl: { fontSize:12, color:'#777', fontWeight:'700' },
  val: { fontFamily:'monospace', fontSize:16, fontWeight:'700' }})

// ── Category Leaderboard ──────────────────────────────────────────────────────
function CategoryLeaderboard({ title, icon, players, valueKey, valueFn, valueLabel, asc=false, onTap, onBack }: any) {
  const MEDALS = ['🥇','🥈','🥉']
  const filtered = players.filter((p:any) => {
    const v = valueFn?valueFn(p):p[valueKey]
    return v!=null&&v!=='—'&&parseFloat(v)>=0
  }).sort((a:any,b:any) => {
    const va=parseFloat(valueFn?valueFn(a):a[valueKey])||0
    const vb=parseFloat(valueFn?valueFn(b):b[valueKey])||0
    return asc?va-vb:vb-va
  })

  return (
    <View style={{ flex:1 }}>
      <View style={lbStyles.header}>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={onBack} style={lbStyles.backBtn}>
          <Text style={{ color:'#aaa', fontSize:18, fontWeight:'600' }}>←</Text>
        </Pressable>
        <Text style={lbStyles.title}>{icon} {title}</Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(p:any)=>p.name}
        contentContainerStyle={{ paddingBottom:60 }}
        ListEmptyComponent={
          <View style={{ alignItems:'center', padding:60 }}>
            <Text style={{ fontSize:36, marginBottom:10 }}>📊</Text>
            <Text style={{ color:'#555', fontWeight:'700', fontSize:13 }}>No data yet</Text>
          </View>
        }
        renderItem={({ item:p, index:i }) => {
          const rawVal=valueFn?valueFn(p):p[valueKey]
          return (
            <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={()=>onTap(p)} style={[lbStyles.row, i===0&&{ backgroundColor:'rgba(255,68,68,0.04)' }]}>
              <Text style={[lbStyles.rank, i<3&&{ fontSize:16 }]}>{i<3?MEDALS[i]:i+1}</Text>
              <Avatar p={p} size={38} />
              <View style={{ flex:1, marginLeft:10 }}>
                <Text style={[lbStyles.name, i===0&&{ color:'#f0f0f0' }]} numberOfLines={1}>{p.name}</Text>
                <View style={lbStyles.bar}><View style={[lbStyles.barFill, i===0&&{ backgroundColor:'rgba(255,68,68,0.5)' }, { width:`${Math.round((parseFloat(rawVal)||0)/(parseFloat(valueFn?valueFn(filtered[0]):filtered[0]?.[valueKey])||1)*100)}%` }]}/></View>
              </View>
              <View style={{ alignItems:'flex-end', minWidth:60 }}>
                <Text style={[lbStyles.val, i===0&&{ color:'#ff4444', fontSize:22 }]}>{rawVal??'—'}</Text>
                <Text style={lbStyles.valLbl}>{valueLabel}</Text>
              </View>
            </Pressable>
          )
        }}
      />
    </View>
  )
}
const lbStyles = StyleSheet.create({
  header: { flexDirection:'row', alignItems:'center', gap:10, padding:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)', backgroundColor:'#111' },
  backBtn: { width:30, height:30, borderRadius:8, backgroundColor:'#1a1a1a', borderWidth:1, borderColor:'#2a2a2a', alignItems:'center', justifyContent:'center' },
  title: { color:'#f0f0f0', fontWeight:'700', fontSize:18 },
  row: { flexDirection:'row', alignItems:'center', padding:11, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.04)', gap:10 },
  rank: { width:26, textAlign:'center', fontWeight:'800', color:'#555', fontSize:12 },
  name: { fontSize:14, fontWeight:'700', color:'#c0c0c0', marginBottom:4 },
  bar: { height:3, backgroundColor:'#2a2a2a', borderRadius:2, overflow:'hidden' },
  barFill: { height:'100%', backgroundColor:'rgba(255,68,68,0.35)', borderRadius:2 },
  val: { fontFamily:'monospace', fontSize:17, fontWeight:'700', color:'#888' },
  valLbl: { fontSize:9, color:'#444', fontWeight:'800', letterSpacing:0.5 }})

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function RecordsScreen() {
  const navigation = useNavigation<Nav>()
  const [matches,  setMatches]  = useState<RawMatch[]>([])
  const [photoMap, setPhotoMap] = useState<Record<string,string>>({})
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<PlayerStat|null>(null)
  const [category, setCategory] = useState<string|null>(null)

  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      const h: Record<string, string> = token ? { Authorization:`Bearer ${token}` } : {}
      const [mr, pr] = await Promise.all([
        fetch(apiUrl('/api/matches'), { headers:h }).then(r=>r.json()),
        fetch(apiUrl('/api/players'), { headers:h }).then(r=>r.json()).catch(()=>({data:[]})),
      ])
      setMatches(mr as RawMatch[])
      const pm: Record<string,string> = {}
      ;(Array.isArray(pr)?pr:pr.data||[]).forEach((p:any) => { pm[p.name]=p.photoUrl||'' })
      setPhotoMap(pm)
      setLoading(false)
    }
    load().catch(()=>setLoading(false))
  }, [])

  const stats = useMemo(() => buildStats(matches).map(s=>({...s, photoUrl:photoMap[s.name]||''})), [matches, photoMap])
  const batPlayers  = stats.filter(p=>p.balls>0||p.runs>0)
  const bowlPlayers = stats.filter(p=>p.ballsBowled>0||p.wkts>0)
  const fldPlayers  = stats.filter(p=>p.totalDis>0)
  const totRuns=stats.reduce((s,p)=>s+p.runs,0), totWkts=stats.reduce((s,p)=>s+p.wkts,0), totSixes=stats.reduce((s,p)=>s+p.sixes,0)

  const BATTING_CATS = [
    { icon:'🏏', label:'Most Runs',             valueKey:'runs',     valueLabel:'RUNS',  players:batPlayers },
    { icon:'📈', label:'Best Batting Average',  valueKey:'batAvg',   valueLabel:'AVG',   players:batPlayers.filter(p=>p.timesOut>0) },
    { icon:'⚡', label:'Best Strike Rate',      valueKey:'batSR',    valueLabel:'SR',    players:batPlayers.filter(p=>p.balls>=6) },
    { icon:'💯', label:'Most Hundreds',         valueKey:'hundreds', valueLabel:'100s',  players:batPlayers },
    { icon:'🔸', label:'Most Fifties',          valueKey:'fifties',  valueLabel:'50s',   players:batPlayers },
    { icon:'🟩', label:'Most Fours',            valueKey:'fours',    valueLabel:'4s',    players:batPlayers },
    { icon:'💥', label:'Most Sixes',            valueKey:'sixes',    valueLabel:'6s',    players:batPlayers },
  ]
  const BOWLING_CATS = [
    { icon:'🎳', label:'Most Wickets',          valueKey:'wkts',     valueLabel:'WKTS',  players:bowlPlayers },
    { icon:'📉', label:'Best Economy',          valueKey:'eco',      valueLabel:'ECO',   players:bowlPlayers.filter(p=>p.ballsBowled>=6), asc:true },
    { icon:'🔥', label:'5-Wicket Hauls',        valueKey:'fiveWickets', valueLabel:'5W', players:bowlPlayers },
    { icon:'⏱',  label:'Best Bowling S/R',      valueKey:'bowlSR',   valueLabel:'SR',    players:bowlPlayers.filter(p=>p.wkts>=3), asc:true },
  ]
  const FIELDING_CATS = [
    { icon:'🧤', label:'Most Dismissals',       valueKey:'totalDis', valueLabel:'DIS',   players:fldPlayers },
    { icon:'🙌', label:'Most Catches',          valueKey:'catches',  valueLabel:'CT',    players:fldPlayers },
    { icon:'🏃', label:'Most Run Outs',         valueKey:'runOuts',  valueLabel:'RO',    players:fldPlayers },
  ]
  const allCats = [...BATTING_CATS,...BOWLING_CATS,...FIELDING_CATS]

  if (loading) return (
    <View style={[styles.root, { alignItems:'center', justifyContent:'center' }]}>
      <ActivityIndicator color="#ff4444" size="large" />
    </View>
  )

  // Show leaderboard for active category
  if (category) {
    const cat = allCats.find(c=>c.label===category)
    if (cat) return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <CategoryLeaderboard title={cat.label} icon={cat.icon} players={cat.players}
          valueKey={cat.valueKey} valueFn={undefined} valueLabel={cat.valueLabel}
          asc={(cat as any).asc||false} onTap={setSelected} onBack={()=>setCategory(null)} />
        <Modal visible={selected!==null} transparent animationType="slide" onRequestClose={()=>setSelected(null)}>
          <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} style={styles.overlay} onPress={()=>setSelected(null)} />
          {selected && <View style={styles.sheetOuter}><PlayerDetail p={selected} onClose={()=>setSelected(null)} /></View>}
        </Modal>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} onPress={()=>navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <View style={{ flex:1 }}>
          <Text style={styles.title}>📊 Records</Text>
          <Text style={styles.subtitle}>{matches.length} matches · {stats.length} players</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.strip}>
        {[{l:'TOTAL RUNS',v:totRuns,c:'#ff4444'},{l:'WICKETS',v:totWkts,c:'#c084fc'},{l:'SIXES',v:totSixes,c:'#facc15'}].map((s,i)=>(
          <View key={s.l} style={[styles.stripCell, i<2&&{ borderRightWidth:1, borderRightColor:'rgba(255,255,255,0.05)' }]}>
            <Text style={[styles.stripVal, { color:s.c }]}>{s.v}</Text>
            <Text style={styles.stripLbl}>{s.l}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom:60 }} showsVerticalScrollIndicator={false}>
        {[
          { heading:'🏏 BATTING',  cats:BATTING_CATS },
          { heading:'🎳 BOWLING',  cats:BOWLING_CATS },
          { heading:'🧤 FIELDING', cats:FIELDING_CATS },
        ].map(({ heading, cats }) => (
          <View key={heading}>
            <Text style={styles.catHeading}>{heading}</Text>
            {cats.map(cat => (
              <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} key={cat.label} onPress={()=>setCategory(cat.label)} style={styles.catRow}>
                <Text style={styles.catIcon}>{cat.icon}</Text>
                <Text style={styles.catLabel}>{cat.label}</Text>
                <Text style={{ color:'#2e2e2e', fontSize:18 }}>›</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Player detail modal */}
      <Modal visible={selected!==null} transparent animationType="slide" onRequestClose={()=>setSelected(null)}>
        <Pressable android_ripple={{ color: "rgba(255,255,255,0.12)" }} style={styles.overlay} onPress={()=>setSelected(null)} />
        {selected && <View style={styles.sheetOuter}><PlayerDetail p={selected} onClose={()=>setSelected(null)} /></View>}
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex:1, backgroundColor:'#0a0a0a' },
  header: { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:14, paddingTop: Platform.OS==='ios'?50:36, paddingBottom:14, backgroundColor:'#111', borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)' },
  backBtn: { width:34, height:34, borderRadius:9, backgroundColor:'rgba(255,255,255,0.06)', alignItems:'center', justifyContent:'center' },
  backTxt: { color:'#aaa', fontSize:18, fontWeight:'600' },
  title: { color:'#f0f0f0', fontWeight:'700', fontSize:20, letterSpacing:0.5 },
  subtitle: { color:'#444', fontSize:11, marginTop:1 },
  strip: { flexDirection:'row', backgroundColor:'#111', borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)' },
  stripCell: { flex:1, paddingVertical:9, alignItems:'center' },
  stripVal: { fontSize:20, fontWeight:'700' },
  stripLbl: { fontSize:8, color:'#444', fontWeight:'800', letterSpacing:0.8, marginTop:2 },
  catHeading: { fontSize:11, fontWeight:'800', color:'#555', letterSpacing:2, padding:14, paddingBottom:6, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.05)', marginTop:8 },
  catRow: { flexDirection:'row', alignItems:'center', gap:12, padding:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.04)' },
  catIcon: { fontSize:18, flexShrink:0 },
  catLabel: { flex:1, fontSize:14, fontWeight:'700', color:'#c0c0c0' },
  overlay: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.7)' },
  sheetOuter: { position:'absolute', bottom:0, left:0, right:0 }})