import { useColorScheme } from "react-native"

import {
  colors,
  controlHeight,
  motion,
  radius,
  shadows,
  spacing,
  targetMin,
  typography,
} from "../tokens"
import type { ThemeColors } from "../tokens"

export interface Theme {
  colors: ThemeColors
  spacing: typeof spacing
  radius: typeof radius
  typography: typeof typography
  shadows: typeof shadows
  controlHeight: typeof controlHeight
  motion: typeof motion
  targetMin: number
  isDark: boolean
}

/** Thème SETRAG actif, selon l'apparence système. */
export function useTheme(): Theme {
  const scheme = useColorScheme()
  const isDark = scheme === "dark"

  return {
    colors: isDark ? colors.dark : colors.light,
    spacing,
    radius,
    typography,
    shadows,
    controlHeight,
    motion,
    targetMin,
    isDark,
  }
}
