/**
 * Cadence — design system voyage · tokens React Native · v1.0.0
 *
 * Portage exact de `packages/ui/src/styles/tokens.css`. React Native ne lit pas
 * `oklch()` : les couleurs sont converties en sRGB hexadécimal depuis les
 * valeurs oklch de référence. Toute évolution part du CSS, jamais d'ici.
 */

export const colors = {
  light: {
    canvas: "#FAF8F3",
    surface: "#FFFFFF",
    surfaceSunk: "#F3F2EC",
    line: "#D9E0DE",
    lineStrong: "#BEC6C4",
    ink: "#101E1A",
    inkMuted: "#55615D",
    inkFaint: "#7F8986",
    inkInverse: "#FAF8F3",

    accent: "#008963",
    accentHover: "#00744F",
    accentActive: "#006040",
    accentSoft: "#DCF5EB",
    accentLine: "#A5D8C3",
    accentInk: "#005536",

    second: "#AE5528",
    secondSoft: "#FFE9DE",
    secondInk: "#7D2800",

    success: "#22864A",
    successSoft: "#E0F5E5",
    successInk: "#00531E",
    warning: "#D79628",
    warningSoft: "#FFEECD",
    warningInk: "#6C4300",
    danger: "#BD413F",
    dangerHover: "#A12628",
    dangerSoft: "#FFEBE8",
    dangerInk: "#9B1E22",
    info: "#3077AD",
    infoSoft: "#DFF1FF",
    infoInk: "#003E66",
  },
  dark: {
    canvas: "#0F141A",
    surface: "#1A2026",
    surfaceSunk: "#0A1016",
    line: "#30363D",
    lineStrong: "#474E55",
    ink: "#EFF2F5",
    inkMuted: "#ACB2B9",
    inkFaint: "#81878D",
    inkInverse: "#0F141A",

    accent: "#44C89E",
    accentHover: "#6BDDB5",
    accentActive: "#23B189",
    accentSoft: "#0E3629",
    accentLine: "#1D5946",
    accentInk: "#6BDDB5",

    second: "#F19266",
    secondSoft: "#422518",
    secondInk: "#FFAB82",

    success: "#68C584",
    successSoft: "#193521",
    successInk: "#86DB9D",
    warning: "#EEB154",
    warningSoft: "#442E09",
    warningInk: "#FFC573",
    danger: "#ED756E",
    dangerHover: "#FF9189",
    dangerSoft: "#47211E",
    dangerInk: "#FF9B93",
    info: "#6FB5EF",
    infoSoft: "#163045",
    infoInk: "#92D2FF",
  },
} as const

export type ColorScheme = keyof typeof colors
/** Palette d'un thème : mêmes clés en clair et en sombre, valeurs libres. */
export type ThemeColors = Record<keyof (typeof colors)["light"], string>

/** Familles chargées par `useCadenceFonts()`. */
export const fonts = {
  regular: "SchibstedGrotesk_400Regular",
  medium: "SchibstedGrotesk_500Medium",
  semibold: "SchibstedGrotesk_600SemiBold",
  bold: "SchibstedGrotesk_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoSemibold: "IBMPlexMono_600SemiBold",
} as const

/**
 * Échelle typographique Cadence. Les `lineHeight` sont calculés depuis les
 * ratios du CSS (1.05 / 1.2 / 1.55) et arrondis au pixel.
 */
export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 49, lineHeight: 51, letterSpacing: -1 },
  h1: { fontFamily: fonts.bold, fontSize: 39, lineHeight: 43, letterSpacing: -0.8 },
  h2: { fontFamily: fonts.bold, fontSize: 31, lineHeight: 36, letterSpacing: -0.6 },
  h3: { fontFamily: fonts.semibold, fontSize: 25, lineHeight: 30 },
  h4: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  bodyLg: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 25 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  /** Heures et durées — mono, pour aligner les chiffres d'une ligne à l'autre. */
  time: { fontFamily: fonts.monoSemibold, fontSize: 25, lineHeight: 25, letterSpacing: -0.5 },
  timeSm: { fontFamily: fonts.monoSemibold, fontSize: 20, lineHeight: 20 },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 18 },
  monoLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
} as const

/** Espacement, base 4. */
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const

/** Hauteurs d'action — la cible tactile ne descend jamais sous 44. */
export const controlHeight = {
  sm: 36,
  md: 44,
  lg: 52,
  field: 52,
} as const

export const targetMin = 44

export const shadows = {
  sm: {
    shadowColor: "#101E1A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#101E1A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: "#101E1A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 8,
  },
} as const

export const motion = {
  durationFast: 120,
  durationBase: 200,
  durationSlow: 320,
} as const
