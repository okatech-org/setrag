import { View, type ViewProps } from "react-native"

import { useTheme } from "./useTheme"

export interface SeparatorProps extends ViewProps {
  orientation?: "horizontal" | "vertical"
}

export function Separator({ orientation = "horizontal", style, ...props }: SeparatorProps) {
  const theme = useTheme()

  return (
    <View
      accessibilityRole="none"
      style={[
        orientation === "horizontal"
          ? { height: 1, alignSelf: "stretch" }
          : { width: 1, alignSelf: "stretch" },
        { backgroundColor: theme.colors.line },
        style,
      ]}
      {...props}
    />
  )
}
