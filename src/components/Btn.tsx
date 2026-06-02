// src/components/Btn.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared responsive button — uses Pressable so Android ripple + iOS fade both
// work, scales on press, respects disabled state and loading state.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useRef, useCallback } from 'react'
import {
  Pressable, Animated, Text, ActivityIndicator,
  StyleSheet, type ViewStyle, type TextStyle,
} from 'react-native'

export type BtnVariant =
  | 'primary'   // red gradient bg
  | 'secondary' // dark card bg
  | 'danger'    // transparent red border
  | 'gold'      // gold bg
  | 'ghost'     // transparent border
  | 'green'     // emerald bg
  | 'success'   // same as green alias

interface BtnProps {
  onPress:     () => void
  children:    React.ReactNode
  variant?:    BtnVariant
  loading?:    boolean
  disabled?:   boolean
  style?:      ViewStyle
  textStyle?:  TextStyle
  fullWidth?:  boolean
  small?:      boolean
}

const VARIANTS: Record<BtnVariant, { bg: string; border?: string; text: string }> = {
  primary:   { bg: '#cc0000',                    text: '#ffffff' },
  secondary: { bg: 'rgba(255,255,255,0.06)',      border: 'rgba(255,255,255,0.1)', text: '#c0c0c0' },
  danger:    { bg: 'rgba(255,68,68,0.12)',         border: 'rgba(255,68,68,0.35)',  text: '#ff4444' },
  gold:      { bg: '#f59e0b',                     text: '#000000' },
  ghost:     { bg: 'transparent',                  border: 'rgba(255,255,255,0.15)', text: '#888888' },
  green:     { bg: '#10b981',                     text: '#ffffff' },
  success:   { bg: '#10b981',                     text: '#ffffff' },
}

export function Btn({
  onPress, children, variant = 'primary',
  loading = false, disabled = false,
  style, textStyle, fullWidth = false, small = false,
}: BtnProps) {
  const scale = useRef(new Animated.Value(1)).current
  const v = VARIANTS[variant]
  const isDisabled = disabled || loading

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 4 }).start()
  }, [scale])

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start()
  }, [scale])

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={isDisabled ? undefined : handlePressIn}
      onPressOut={isDisabled ? undefined : handlePressOut}
      android_ripple={isDisabled ? undefined : { color: 'rgba(255,255,255,0.15)', borderless: false }}
      style={({ pressed }) => [
        { opacity: isDisabled ? 0.45 : pressed ? 0.88 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      <Animated.View style={[
        styles.base,
        small ? styles.small : styles.normal,
        fullWidth && styles.fullWidth,
        { backgroundColor: v.bg },
        v.border && { borderWidth: 1.5, borderColor: v.border },
        { transform: [{ scale }] },
        style,
      ]}>
        {loading
          ? <ActivityIndicator color={v.text} size="small" />
          : typeof children === 'string'
            ? <Text style={[styles.text, small && styles.textSmall, { color: v.text }, textStyle]}>{children}</Text>
            : children}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
  },
  normal: { paddingVertical: 14, paddingHorizontal: 20, minHeight: 48 },
  small:  { paddingVertical: 8,  paddingHorizontal: 14, minHeight: 36, borderRadius: 9 },
  fullWidth: { width: '100%' },
  text: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  textSmall: { fontSize: 12 },
})

export default Btn