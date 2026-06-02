// src/services/deviceId.ts
// Generates and stores a stable UUID per device install (survives restarts, not uninstalls).

import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = '@crickyworld:deviceId'
let _cached: string | null = null

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export async function getDeviceId(): Promise<string> {
  if (_cached) return _cached
  try {
    const stored = await AsyncStorage.getItem(KEY)
    if (stored) { _cached = stored; return stored }
    const fresh = generateUUID()
    await AsyncStorage.setItem(KEY, fresh)
    _cached = fresh
    return fresh
  } catch {
    if (!_cached) _cached = generateUUID()
    return _cached
  }
}
