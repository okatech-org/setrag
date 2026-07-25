import { ScrollView, View, type ViewProps } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { useTheme } from "./useTheme"

export interface ScreenProps extends ViewProps {
  scroll?: boolean
  padded?: boolean
  /** `sunk` place l'écran sur le fond `canvas` plutôt que `surface`. */
  tone?: "canvas" | "surface"
}

/** Conteneur d'écran : zone sûre, fond SETRAG, défilement optionnel. */
export function Screen({
  scroll = false,
  padded = true,
  tone = "canvas",
  style,
  children,
  ...props
}: ScreenProps) {
  const theme = useTheme()
  const background =
    tone === "surface" ? theme.colors.surface : theme.colors.canvas
  const content = {
    padding: padded ? theme.spacing[5] : 0,
    gap: theme.spacing[5],
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: background }}
      edges={["top", "left", "right"]}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={[content, { paddingBottom: theme.spacing[12] }, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content, style]} {...props}>
          {children}
        </View>
      )}
    </SafeAreaView>
  )
}
