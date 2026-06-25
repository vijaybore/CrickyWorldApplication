// src/navigation/RootNavigator.tsx

import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs'
import { Text }                       from 'react-native'
import type { RootStackParamList }    from '../types'
import { useAuth }                    from '../context/AuthContext'

import HomeScreen          from '../screens/HomeScreen'
import LoginScreen         from '../screens/Loginscreen'
import RegisterScreen      from '../screens/Registerscreen'
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen'
import NewMatchScreen      from '../screens/NewMatchScreen'
import OpenMatchScreen     from '../screens/OpenMatchScreen'
import PlayersScreen       from '../screens/PlayersScreen'
import ManagePlayersScreen from '../screens/Manageplayersscreen'
import MatchDetailsScreen  from '../screens/MatchDetailsScreen'
import MatchreportScreen   from '../screens/Matchreportscreen'
import RecordsScreen       from '../screens/RecordsScreen'
import SettingsScreen      from '../screens/Settingsscreen'
import ScoringScreen       from '../screens/ScoringScreen'
import TournamentsScreen   from '../screens/Tournamentsscreen'
import PlayerProfileScreen from '../screens/PlayerProfileScreen'
import WaitingForVerificationScreen from '../screens/WaitingForVerificationScreen'

type TabList = {
  HomeTab:     undefined
  MatchesTab:  undefined
  RecordsTab:  undefined
  SettingsTab: undefined
}

const Tab   = createBottomTabNavigator<TabList>()
const Stack = createNativeStackNavigator<RootStackParamList>()

function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopColor:  'rgba(255,255,255,0.06)',
          borderTopWidth:  1,
          height:          64,
          paddingBottom:   8,
        },
        tabBarActiveTintColor:   '#ff4444',
        tabBarInactiveTintColor: '#333333',
        tabBarLabelStyle: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
      }}
    >
      <Tab.Screen name="HomeTab"     component={HomeScreen}
        options={{ tabBarLabel: 'Home',     tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🏠</Text> }} />
      <Tab.Screen name="MatchesTab"  component={OpenMatchScreen}
        options={{ tabBarLabel: 'Matches',  tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🏏</Text> }} />
      <Tab.Screen name="RecordsTab"  component={RecordsScreen}
        options={{ tabBarLabel: 'Records',  tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📊</Text> }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>⚙️</Text> }} />
    </Tab.Navigator>
  )
}

// ── Auth stack (shown when logged OUT) ────────────────────────────────────────
function AuthStack() {
  console.log('[RootNavigator] rendering AuthStack')
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_bottom' }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="WaitingForVerification" component={WaitingForVerificationScreen} />
    </Stack.Navigator>
  )
}

// ── App stack (shown when logged IN) ─────────────────────────────────────────
function AppStack() {
  console.log('[RootNavigator] rendering AppStack')
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown:  false,
        animation:    'slide_from_right',
        contentStyle: { backgroundColor: '#080808' },
      }}
    >
      <Stack.Screen name="Home"          component={BottomTabs} />
      <Stack.Screen name="NewMatch"      component={NewMatchScreen} />
      <Stack.Screen name="OpenMatch"     component={OpenMatchScreen} />
      <Stack.Screen name="Scoring"       component={ScoringScreen}
        options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="MatchDetails"  component={MatchDetailsScreen}
        options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="MatchReport"   component={MatchreportScreen} />
      <Stack.Screen name="Players"       component={PlayersScreen} />
      <Stack.Screen name="ManagePlayers" component={ManagePlayersScreen} />
      <Stack.Screen name="PlayerProfile" component={PlayerProfileScreen}
        options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Tournaments"   component={TournamentsScreen} />
      <Stack.Screen name="Records"       component={RecordsScreen} />
      <Stack.Screen name="Settings"      component={SettingsScreen} />
      <Stack.Screen name="Login"         component={LoginScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="Register"      component={RegisterScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="WaitingForVerification" component={WaitingForVerificationScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
    </Stack.Navigator>
  )
}

export function RootNavigator() {
  const { user, loading } = useAuth()

  console.log(`[RootNavigator] render: user=${user ? JSON.stringify(user) : 'null'}, loading=${loading}`)

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 48, marginBottom: 20 }}>🏏</Text>
        <ActivityIndicator color="#ff4444" size="large" />
        <Text style={{ color: '#333', fontSize: 12, marginTop: 16, fontWeight: '600', letterSpacing: 1 }}>
          CRICKYWORLD
        </Text>
      </View>
    )
  }

  return user ? <AppStack /> : <AuthStack />
}

export default RootNavigator