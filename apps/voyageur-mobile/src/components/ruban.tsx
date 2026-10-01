import type { ReactNode } from "react"
import { Pressable, View } from "react-native"
import { router } from "expo-router"
import { X } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { SigneRuban } from "@workspace/mobile-ui/marque"
import { brand, fonts, surEncre } from "@workspace/mobile-ui/tokens"

import { useReglages } from "@/lib/reglages"

/** Rond encre qui porte le signe : bouton flottant, avatar, envoi. */
export function RondEncre({ taille, children }: { taille: number; children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: taille,
        height: taille,
        borderRadius: taille / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.isDark ? surEncre.fabSombre : brand.encre,
      }}
    >
      {children}
    </View>
  )
}

/**
 * Bouton de Ruban (`.r-fab.m`) : au-dessus des onglets, à droite. La bulle
 * d'accueil ne s'affiche qu'une fois.
 */
export function BoutonRuban() {
  const theme = useTheme()
  const { pret, bulleRubanVue, marquerBulleRubanVue } = useReglages()
  const ouvrir = () => {
    if (!bulleRubanVue) void marquerBulleRubanVue()
    router.push("/assistant")
  }

  return (
    <>
      {pret && !bulleRubanVue ? (
        <View
          style={{
            position: "absolute",
            right: 16,
            left: 64,
            bottom: 82,
            paddingVertical: 12,
            paddingLeft: 14,
            paddingRight: 36,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 4,
            ...theme.shadows.lg,
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: theme.colors.ink }}>Bonjour, je suis Ruban.</Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: theme.colors.ink }}>
            Posez-moi une question, ou demandez-moi de réserver.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer le message de Ruban"
            onPress={() => void marquerBulleRubanVue()}
            style={{ position: "absolute", right: 0, top: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <X size={15} color={theme.colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ouvrir Ruban, l'assistant"
        onPress={ouvrir}
        style={({ pressed }) => ({
          position: "absolute",
          right: 16,
          bottom: 16,
          borderRadius: 28,
          transform: [{ scale: pressed ? 0.96 : 1 }],
          ...theme.shadows.lg,
        })}
      >
        <RondEncre taille={56}>
          <SigneRuban hauteur={35} />
        </RondEncre>
      </Pressable>
    </>
  )
}
