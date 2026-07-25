import { Fragment } from "react"
import { View, type ViewStyle } from "react-native"

import { useTheme } from "./useTheme"
import { Text } from "./Text"

export interface StepperStep {
  label: string
}

export interface StepperProps {
  steps: StepperStep[]
  /** Index de l'étape courante (0-based). Les précédentes sont validées. */
  current: number
  style?: ViewStyle
}

/** Progression — pastilles 26 px reliées par un filet de 2 px. */
export function Stepper({ steps, current, style }: StepperProps) {
  const theme = useTheme()

  return (
    <View
      accessibilityLabel={`Étape ${current + 1} sur ${steps.length}`}
      style={[{ gap: theme.spacing[3] }, style]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] + 2 }}>
        {steps.map((step, index) => {
          const done = index < current
          const active = index === current
          return (
            <Fragment key={step.label}>
              {index > 0 && (
                <View
                  style={{
                    height: 2,
                    flex: 1,
                    backgroundColor: index <= current ? theme.colors.accent : theme.colors.line,
                  }}
                />
              )}
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: done || active ? theme.colors.accent : theme.colors.line,
                  backgroundColor: done ? theme.colors.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.typography.h4.fontFamily,
                    fontSize: 13,
                    lineHeight: 13,
                    color: done
                      ? theme.colors.inkInverse
                      : active
                        ? theme.colors.accentInk
                        : theme.colors.inkMuted,
                  }}
                >
                  {done ? "✓" : String(index + 1)}
                </Text>
              </View>
            </Fragment>
          )
        })}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {steps.map((step) => (
          <Text key={step.label} variant="caption" tone="muted">
            {step.label}
          </Text>
        ))}
      </View>
    </View>
  )
}
