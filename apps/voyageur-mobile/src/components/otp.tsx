import { useEffect, useRef, useState } from "react"
import { Pressable, TextInput, View } from "react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { useMouvementReduit } from "@workspace/mobile-ui/marque"
import { fonts } from "@workspace/mobile-ui/tokens"

const LONGUEUR = 6

/**
 * Code à 6 chiffres (`.otp`) : six cases, un seul champ caché dessous. Le
 * code se lit automatiquement quand le téléphone le permet (SMS, trousseau).
 */
export function CodeOtp({ valeur, onChange, onComplet }: { valeur: string; onChange: (valeur: string) => void; onComplet: (code: string) => void }) {
  const theme = useTheme()
  const champ = useRef<TextInput>(null)
  const [focus, setFocus] = useState(true)
  const curseur = Math.min(valeur.length, LONGUEUR - 1)

  return (
    <Pressable accessibilityRole="none" onPress={() => champ.current?.focus()}>
      <View style={{ flexDirection: "row", gap: 8 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: LONGUEUR }, (_, index) => {
          const active = focus && index === curseur && valeur.length < LONGUEUR
          return (
            <View
              key={index}
              style={{
                flex: 1,
                height: 56,
                borderRadius: theme.radius.md,
                borderWidth: active ? 2 : 1,
                borderColor: active ? theme.colors.accent : theme.colors.lineStrong,
                backgroundColor: theme.colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {valeur[index] ? (
                <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 24, color: theme.colors.ink }}>{valeur[index]}</Text>
              ) : active ? (
                <Curseur />
              ) : null}
            </View>
          )
        })}
      </View>
      <TextInput
        ref={champ}
        value={valeur}
        onChangeText={(texte) => {
          const chiffres = texte.replace(/\D/g, "").slice(0, LONGUEUR)
          onChange(chiffres)
          if (chiffres.length === LONGUEUR) onComplet(chiffres)
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={LONGUEUR}
        accessibilityLabel="Code à 6 chiffres"
        caretHidden
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: "transparent" }}
      />
    </Pressable>
  )
}

function Curseur() {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (reduit) return
    const minuterie = setInterval(() => setVisible((courant) => !courant), 550)
    return () => clearInterval(minuterie)
  }, [reduit])

  return <View style={{ width: 2, height: 26, backgroundColor: theme.colors.accent, opacity: visible ? 1 : 0 }} />
}
