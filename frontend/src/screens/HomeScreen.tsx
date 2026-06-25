// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Home Screen
// src/screens/HomeScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView, Pressable,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../types'
import { apiUrl } from '../services/api'
import { C } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// ── Cricket Ball SVG ─────────────────────────────────────────────────────────
// (React Native SVG requires react-native-svg)
// Using a styled View as fallback — install react-native-svg for full ball
function CricketBall({ size = 72 }: { size?: number }) {
  const spin = React.useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 5000,
        useNativeDriver: true}),
    ).start()
  }, [spin])

  const rotate = spin.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '360deg']})

  return (
    <Animated.View
      style={[
        styles.ballOuter,
        { width: size, height: size, borderRadius: size / 2 },
        { transform: [{ rotate }] },
      ]}
    >
      {/* Seam lines */}
      <View style={[styles.ballSeamH, { top: size * 0.46 }]} />
      <View style={[styles.ballSeamV, { left: size * 0.46 }]} />
      {/* Shine */}
      <View
        style={[
          styles.ballShine,
          {
            width: size * 0.3,
            height: size * 0.22,
            top: size * 0.12,
            left: size * 0.16},
        ]}
      />
    </Animated.View>
  )
}

// ── Live Clock ───────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const h  = now.getHours() % 12 || 12
  const m  = String(now.getMinutes()).padStart(2, '0')
  const ap = now.getHours() >= 12 ? 'PM' : 'AM'

  return (
    <View style={styles.clockRow}>
      <View style={styles.clockDateCard}>
        <Text style={styles.clockLabel}>📅 DATE</Text>
        <Text style={styles.clockValue}>
          {days[now.getDay()]}, {now.getDate()} {months[now.getMonth()]} {now.getFullYear()}
        </Text>
      </View>
      <View style={styles.clockTimeCard}>
        <Text style={styles.clockLabel}>🕐 TIME</Text>
        <Text style={[styles.clockValue, { color: '#ff5555' }]}>
          {h}:{m} {ap}
        </Text>
      </View>
    </View>
  )
}

// ── Menu Item ────────────────────────────────────────────────────────────────
interface MenuItem {
  icon:     string
  label:    string
  sub:      string
  screen:   keyof RootStackParamList
  color:    string
  featured?: boolean
}

const MENU_ITEMS: MenuItem[] = [
  { icon:'🏏', label:'New Match',       sub:'Start a fresh cricket match',    screen:'NewMatch',     color:'#cc0000', featured:true },
  { icon:'📂', label:'Open Match',      sub:'Resume an existing match',       screen:'OpenMatch',    color:'#b45309' },
  { icon:'🏆', label:'Tournaments',     sub:'Create & manage tournaments',    screen:'Tournaments',  color:'#d97706' },
  { icon:'👥', label:'Manage Players',  sub:'Add & manage your squad',        screen:'ManagePlayers',color:'#1e3a8a' },
  { icon:'📊', label:'Records',         sub:'Career stats & leaderboards',    screen:'Records',      color:'#155e75' },
  { icon:'⚙️', label:'Settings',        sub:'Theme, profile & favourites',    screen:'Settings',     color:'#374151' },
]

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation<Nav>()
  const [liveCount, setLiveCount] = useState(0)

  useEffect(() => {
    fetch(apiUrl('/api/matches'))
      .then(r => r.json())
      .then((data: Array<{ status: string }>) => {
        setLiveCount(data.filter(m => m.status !== 'completed').length)
      })
      .catch(() => {})
  }, [])

  const handleNavigate = (screen: keyof RootStackParamList) => {
    navigation.navigate(screen as never)
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        {/* Background glow */}
        <View style={styles.headerGlow} pointerEvents="none" />

        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            {/* Live badge */}
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE CRICKET SCORER</Text>
            </View>

            <Text style={styles.brandTitle}>Cricky{'\n'}World</Text>
            <Text style={styles.brandSub}>Ball-by-ball cricket scoring</Text>

            {liveCount > 0 && (
              <View style={styles.liveMatchBadge}>
                <View style={[styles.liveDot, { backgroundColor: '#4ade80' }]} />
                <Text style={styles.liveMatchText}>
                  {liveCount} Live Match{liveCount > 1 ? 'es' : ''}
                </Text>
              </View>
            )}
          </View>

          <CricketBall size={80} />
        </View>

        <LiveClock />
      </View>

      {/* ── DIVIDER ── */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>QUICK ACTIONS</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* ── MENU ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {MENU_ITEMS.map(item => (
          <Pressable

            android_ripple={{ color: "rgba(255,255,255,0.12)" }}            key={item.label}
            onPress={() => handleNavigate(item.screen)}
            style={[
              styles.menuCard,
              item.featured && {
                borderColor: 'rgba(255,68,68,0.28)',
                backgroundColor: 'rgba(180,0,0,0.12)'},
            ]}
          >
            {/* Left color strip */}
            <View style={[styles.menuStrip, { backgroundColor: item.color }]} />

            {/* Icon */}
            <View style={[styles.menuIconBox, { backgroundColor: item.color + '33', borderColor: item.color + '44' }]}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
            </View>

            {/* Text */}
            <View style={styles.menuTextBox}>
              <Text style={[styles.menuLabel, { color: item.featured ? '#ff7777' : '#dddddd' }]}>
                {item.label}
              </Text>
              <Text style={styles.menuSub}>{item.sub}</Text>
            </View>

            {/* Arrow */}
            <View style={[styles.menuArrow, item.featured && { borderColor: 'rgba(255,68,68,0.25)', backgroundColor: 'rgba(255,68,68,0.12)' }]}>
              <Text style={[styles.menuArrowText, { color: item.featured ? '#ff4444' : '#2e2e2e' }]}>›</Text>
            </View>
          </Pressable>
        ))}

        <Text style={styles.footer}>CRICKYWORLD • v1.0.0 • MADE IN INDIA 🇮🇳</Text>
      </ScrollView>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0c0c0c'},
  // Header
  header: {
    backgroundColor: '#0e0e0e',
    padding: 20,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden'},
  headerGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(200,0,0,0.15)'},
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8},
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.2)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 8},
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff4444'},
  liveBadgeText: {
    fontSize: 9,
    color: '#ff6666',
    fontWeight: '700',
    letterSpacing: 1.5},
  brandTitle: {
    fontSize: 44,
    fontWeight: '900',
    color: '#ff4444',
    lineHeight: 46,
    letterSpacing: 2},
  brandSub: {
    fontSize: 11,
    color: '#444',
    fontWeight: '500',
    marginTop: 4},
  liveMatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 10},
  liveMatchText: {
    fontSize: 11,
    color: '#4ade80',
    fontWeight: '700'},
  // Ball
  ballOuter: {
    backgroundColor: '#cc0000',
    shadowColor: '#cc0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12},
  ballSeamH: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: 1.5,
    backgroundColor: 'rgba(255,210,210,0.4)',
    borderRadius: 1},
  ballSeamV: {
    position: 'absolute',
    top: '10%',
    bottom: '10%',
    width: 1.5,
    backgroundColor: 'rgba(255,210,210,0.4)',
    borderRadius: 1},
  ballShine: {
    position: 'absolute',
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.35)'},
  // Clock
  clockRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12},
  clockDateCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 8},
  clockTimeCard: {
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.22)',
    borderRadius: 12,
    padding: 8,
    paddingHorizontal: 14,
    justifyContent: 'center'},
  clockLabel: {
    fontSize: 9,
    color: '#555',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 2},
  clockValue: {
    fontSize: 14,
    color: '#e8e8e8',
    fontWeight: '700',
    letterSpacing: 0.5},
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10},
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)'},
  dividerText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#2d2d2d'},
  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 100,
    gap: 8},
  // Menu card
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 64},
  menuStrip: {
    width: 4,
    alignSelf: 'stretch'},
  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    margin: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'},
  menuIcon: {
    fontSize: 20},
  menuTextBox: {
    flex: 1,
    minWidth: 0},
  menuLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5},
  menuSub: {
    fontSize: 11,
    color: '#383838',
    fontWeight: '500',
    marginTop: 1},
  menuArrow: {
    width: 28,
    height: 28,
    borderRadius: 9,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center'},
  menuArrowText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22},
  // Footer
  footer: {
    textAlign: 'center',
    paddingTop: 14,
    paddingBottom: 4,
    fontSize: 10,
    color: '#191919',
    letterSpacing: 2,
    fontWeight: '700'}})