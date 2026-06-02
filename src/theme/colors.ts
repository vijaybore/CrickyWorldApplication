// ─────────────────────────────────────────────────────────────────────────────
// CrickyWorld — Design System Colors
// src/theme/colors.ts
//
// NOTE: React Native does NOT support:
//   • CSS gradient strings (use expo-linear-gradient or react-native-linear-gradient)
//   • rgba() border values as strings in border colors (use opacity instead)
//   • box-shadow (use elevation on Android, shadow* props on iOS)
// All values here are plain hex or rgba strings valid in RN StyleSheet.
// ─────────────────────────────────────────────────────────────────────────────

// ── Core Brand ───────────────────────────────────────────────────────────────
export const brand = {
  primaryGold:     '#f59e0b',
  primaryGoldDim:  '#78350f',
  crimsonRed:      '#ff4444',
  crimsonRedDark:  '#cc0000',
  crimsonRedDim:   '#7f1d1d',
  emeraldGreen:    '#10b981',
  emeraldGreenDim: '#064e3b',
  royalBlue:       '#3b82f6',
  royalBlueDim:    '#1e3a8a',
  violet:          '#c084fc',
  violetDim:       '#3b0764',
  orange:          '#fb923c',
  orangeDim:       '#431407',
  sky:             '#38bdf8',
}

// ── Backgrounds ──────────────────────────────────────────────────────────────
export const background = {
  base:    '#080808',
  surface: '#0c0c0c',
  card:    '#141414',
  card2:   '#1a1a1a',
  header:  '#101010',
}

// ── Text ─────────────────────────────────────────────────────────────────────
export const text = {
  primary:   '#f0f0f0',
  secondary: '#c0c0c0',
  muted:     '#777777',
  faint:     '#3a3a3a',
  inverse:   '#0a0a0a',
}

// ── Borders ──────────────────────────────────────────────────────────────────
export const border = {
  subtle:  'rgba(255,255,255,0.06)',
  default: 'rgba(255,255,255,0.09)',
  strong:  'rgba(255,255,255,0.15)',
  accent:  'rgba(255,68,68,0.25)',
  gold:    'rgba(245,158,11,0.3)',
  green:   'rgba(16,185,129,0.3)',
}

// ── Semantic ─────────────────────────────────────────────────────────────────
export const semantic = {
  success:   '#4ade80',
  warning:   '#facc15',
  error:     '#f87171',
  info:      '#60a5fa',
  live:      '#4ade80',
  completed: '#6b7280',
}

// ── Avatar backgrounds (deterministic by char code) ──────────────────────────
export const avatarBgs: string[] = [
  '#7f1d1d', '#1e3a5f', '#064e3b', '#78350f',
  '#3b0764', '#134e4a', '#422006', '#0c4a6e',
]

// ── Overlay ──────────────────────────────────────────────────────────────────
export const overlay = {
  modal:   'rgba(0,0,0,0.82)',
  sheet:   'rgba(0,0,0,0.75)',
  tooltip: 'rgba(0,0,0,0.90)',
}

// ── Gradient color pairs (use with LinearGradient) ───────────────────────────
export const gradientColors = {
  crimsonBrand:  ['#cc0000', '#ff5555'] as [string, string],
  goldBrand:     ['#b45309', '#f59e0b'] as [string, string],
  emeraldBrand:  ['#065f46', '#10b981'] as [string, string],
  blueBrand:     ['#1e3a8a', '#3b82f6'] as [string, string],
  slateBrand:    ['#374151', '#6b7280'] as [string, string],
  headerBg:      ['#1a0000', '#0e0e0e'] as [string, string],
}

// ── Shadow presets (iOS) ─────────────────────────────────────────────────────
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  red: {
    shadowColor: '#cc0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  gold: {
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
}

// ── C — flat shorthand ────────────────────────────────────────────────────────
export const C = {
  bg:         background.base,
  surface:    background.surface,
  card:       background.card,
  card2:      background.card2,
  header:     background.header,
  accent:     brand.crimsonRed,
  accentDark: brand.crimsonRedDark,
  gold:       brand.primaryGold,
  green:      brand.emeraldGreen,
  blue:       brand.royalBlue,
  violet:     brand.violet,
  orange:     brand.orange,
  sky:        brand.sky,
  text:       text.primary,
  text2:      text.secondary,
  muted:      text.muted,
  live:       semantic.live,
  success:    semantic.success,
  warning:    semantic.warning,
  error:      semantic.error,
}

export default C