// App.tsx — root entry point
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider }    from 'react-native-safe-area-context'
import { AuthProvider }        from './src/context/AuthContext'
import { RootNavigator }       from './src/navigation/RootNavigator'

const DarkTheme = {
  dark: true,
  colors: {
    primary: '#ff4444', background: '#080808', card: '#0c0c0c',
    text: '#f0f0f0', border: 'rgba(255,255,255,0.06)', notification: '#ff4444',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium:  { fontFamily: 'System', fontWeight: '500' as const },
    bold:    { fontFamily: 'System', fontWeight: '700' as const },
    heavy:   { fontFamily: 'System', fontWeight: '900' as const },
  },
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={DarkTheme}>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  )
}