// src/components/FavoriteToggle.tsx
import React, { useRef, useCallback } from 'react'
import { TouchableOpacity, Animated, StyleSheet } from 'react-native'
import { useFavorites } from '../hooks/useFavorites'

interface Props { team: string; size?: number }

export function FavoriteToggle({ team, size = 20 }: Props) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const scale = useRef(new Animated.Value(1)).current
  const active = isFavorite(team)

  const handlePress = useCallback(() => {
    toggleFavorite(team)
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.4, duration: 130, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.9, duration: 90,  useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,   duration: 80,  useNativeDriver: true }),
    ]).start()
  }, [team, toggleFavorite, scale])

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={active ? `Remove ${team} from favorites` : `Favourite ${team}`}
      style={styles.btn}>
      <Animated.Text style={{ fontSize: size, color: active ? '#f59e0b' : '#3a3a3a', transform: [{ scale }] }}>
        {active ? '★' : '☆'}
      </Animated.Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', padding: 4 },
})

export default FavoriteToggle