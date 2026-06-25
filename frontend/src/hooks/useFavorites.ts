// src/hooks/useFavorites.ts
import { useState, useCallback, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'cw-favorite-teams'

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(raw => { if (raw) setFavorites(JSON.parse(raw) as string[]) })
      .catch(() => {})
  }, [])

  const isFavorite = useCallback((team: string) => favorites.includes(team), [favorites])

  const toggleFavorite = useCallback((team: string) => {
    setFavorites(prev => {
      const next = prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  const clearFavorites = useCallback(() => {
    AsyncStorage.setItem(KEY, '[]').catch(() => {})
    setFavorites([])
  }, [])

  return { favorites, isFavorite, toggleFavorite, clearFavorites }
}