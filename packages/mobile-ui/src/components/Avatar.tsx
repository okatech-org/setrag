import { Image, View, type ViewProps } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export interface AvatarProps extends ViewProps {
  name: string
  size?: "sm" | "md" | "lg"
  uri?: string
}

/** Initiales sur pastille acier, ou photo si `uri` est fourni. */
export function Avatar({ name, size = "md", uri, style, ...props }: AvatarProps) {
  const theme = useTheme()
  const dimension = { sm: 28, md: 34, lg: 44 }[size]
  const fontSize = { sm: 11, md: 13, lg: 15 }[size]

  const initials = name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "").join("")

  return (
    <View
      accessibilityLabel={name}
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: theme.colors.secondSoft,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
      {...props}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} />
      ) : (
        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontSize, lineHeight: fontSize, color: theme.colors.secondInk }}>
          {initials}
        </Text>
      )}
    </View>
  )
}
