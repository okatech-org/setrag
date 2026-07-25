/**
 * SETRAG — design system voyage · tokens React Native · v1.1.0
 *
 * Portage exact de `packages/ui/src/styles/tokens.css`. React Native ne lit pas
 * `oklch()` : les couleurs sont converties en sRGB hexadécimal depuis les
 * valeurs oklch de référence. Toute évolution part du CSS, jamais d'ici.
 */

export const colors = {
  light: {
    canvas: "#F8FAFD",
    surface: "#FFFFFF",
    surfaceSunk: "#F0F4F9",
    line: "#DBE0E8",
    lineStrong: "#C5CBD4",
    ink: "#131B26",
    inkMuted: "#5C646F",
    inkFaint: "#838A93",
    inkInverse: "#F8FAFD",

    accent: "#0F50A0",
    accentHover: "#013C82",
    accentActive: "#002D69",
    accentSoft: "#E2F0FF",
    accentLine: "#B2CDF2",
    accentInk: "#013C82",

    second: "#627485",
    secondSoft: "#E9EFF5",
    secondInk: "#3E4F60",

    success: "#388842",
    successSoft: "#E2F4E3",
    successInk: "#045819",
    warning: "#D1AD32",
    warningSoft: "#FEF2CC",
    warningInk: "#695200",
    danger: "#C53637",
    dangerHover: "#A9131F",
    dangerSoft: "#FFECE9",
    dangerInk: "#9E141E",
    info: "#20909B",
    infoSoft: "#D8F5F8",
    infoInk: "#005A64",
  },
  dark: {
    canvas: "#0C121A",
    surface: "#161D27",
    surfaceSunk: "#070B13",
    line: "#2C333E",
    lineStrong: "#454E5B",
    ink: "#EEF2F7",
    inkMuted: "#ABB2BB",
    inkFaint: "#808790",
    inkInverse: "#0C121A",

    accent: "#6EA6F5",
    accentHover: "#90C0FF",
    accentActive: "#5990DD",
    accentSoft: "#1B2E49",
    accentLine: "#324E76",
    accentInk: "#90C0FF",

    second: "#94A7BA",
    secondSoft: "#282F35",
    secondInk: "#ADC0D4",

    success: "#71C178",
    successSoft: "#1C341E",
    successInk: "#90D995",
    warning: "#E2C157",
    warningSoft: "#3E3207",
    warningInk: "#F4D576",
    danger: "#F2716A",
    dangerHover: "#FF8E86",
    dangerSoft: "#47211E",
    dangerInk: "#FF9890",
    info: "#57BCC7",
    infoSoft: "#0A3438",
    infoInk: "#7FDCE6",
  },
} as const

export type ColorScheme = keyof typeof colors
/** Palette d'un thème : mêmes clés en clair et en sombre, valeurs libres. */
export type ThemeColors = Record<keyof (typeof colors)["light"], string>

/** Familles chargées par `useSetragFonts()`. */
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
 * Échelle typographique SETRAG. Les `lineHeight` sont calculés depuis les
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
    shadowColor: "#131B26",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#131B26",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: "#131B26",
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
