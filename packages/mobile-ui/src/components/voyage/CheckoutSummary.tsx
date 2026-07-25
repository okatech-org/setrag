import { Pressable, View, type ViewStyle } from "react-native"

import { formatXaf } from "@workspace/shared/utils/format"

import { useTheme } from "../useTheme"
import { Text } from "../Text"
import { Button } from "../Button"

export interface CheckoutLine {
  label: string
  amountXaf: number
  discount?: boolean
}

export interface PaymentOption {
  id: string
  label: string
  note?: string
  noteMono?: boolean
}

export interface CheckoutSummaryProps {
  lines: CheckoutLine[]
  options: PaymentOption[]
  selectedOption?: string
  onSelectOption?: (id: string) => void
  onSubmit?: () => void
  submitting?: boolean
  footnote?: string
  style?: ViewStyle
}

/** Tunnel de paiement — le total est le seul chiffre en 31 px. */
export function CheckoutSummary({
  lines, options, selectedOption, onSelectOption, onSubmit,
  submitting = false, footnote, style,
}: CheckoutSummaryProps) {
  const theme = useTheme()
  const total = lines.reduce((s, l) => s + (l.discount ? -l.amountXaf : l.amountXaf), 0)

  return (
    <View
      style={[
        {
          gap: theme.spacing[5],
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
          padding: theme.spacing[6],
        },
        style,
      ]}
    >
      <View style={{ gap: theme.spacing[3] }}>
        {lines.map((line) => (
          <View key={line.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing[4] }}>
            <Text variant="small" style={{ flex: 1, fontSize: 15, color: line.discount ? theme.colors.accentInk : theme.colors.inkMuted }}>
              {line.label}
            </Text>
            <Text variant="mono" style={{ color: line.discount ? theme.colors.accentInk : theme.colors.inkMuted }}>
              {line.discount ? "−" : ""}{formatXaf(line.amountXaf)}
            </Text>
          </View>
        ))}

        <View
          style={{
            flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
            borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: theme.spacing[3],
          }}
        >
          <Text variant="h4" style={{ fontSize: 18 }}>Total</Text>
          <Text variant="h2">{formatXaf(total)}</Text>
        </View>
      </View>

      <View style={{ gap: theme.spacing[2] + 2 }}>
        {options.map((option) => {
          const checked = option.id === selectedOption
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              onPress={() => onSelectOption?.(option.id)}
              style={{
                minHeight: theme.targetMin,
                flexDirection: "row", alignItems: "center", gap: theme.spacing[3],
                borderRadius: theme.radius.md,
                borderWidth: checked ? 1.5 : 1,
                borderColor: checked ? theme.colors.accent : theme.colors.line,
                backgroundColor: checked ? theme.colors.accentSoft : "transparent",
                padding: theme.spacing[4],
              }}
            >
              <View
                style={{
                  width: 20, height: 20, borderRadius: 999, borderWidth: 1.5,
                  borderColor: checked ? theme.colors.accent : theme.colors.lineStrong,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                {checked && <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: theme.colors.accent }} />}
              </View>
              <Text variant="body" style={{ flex: 1, fontSize: 15 }}>{option.label}</Text>
              {option.note && (
                <Text
                  variant={option.noteMono ? "mono" : "caption"}
                  tone="muted"
                  style={{ fontSize: option.noteMono ? 14 : 13 }}
                >
                  {option.note}
                </Text>
              )}
            </Pressable>
          )
        })}
      </View>

      <Button
        title={`Payer ${formatXaf(total)}`}
        size="lg"
        block
        onPress={onSubmit}
        loading={submitting}
        loadingLabel="Paiement en cours…"
      />

      {footnote && (
        <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
          {footnote}
        </Text>
      )}
    </View>
  )
}
