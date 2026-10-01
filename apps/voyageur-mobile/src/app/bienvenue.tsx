import type { ReactNode } from "react"
import { View } from "react-native"
import { router } from "expo-router"
import { Bell, Smartphone, WifiOff } from "lucide-react-native"

import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { Logo } from "@workspace/mobile-ui/marque"
import { fonts } from "@workspace/mobile-ui/tokens"

import { Bas, Ecran, LienM } from "@/components/ecran"

/** Bienvenue : trois promesses, un seul bouton. */
export default function Bienvenue() {
  const theme = useTheme()

  return (
    <Ecran>
      <View style={{ flex: 1, paddingTop: 16, paddingHorizontal: 20, gap: 20 }}>
        <Logo variante={theme.isDark ? "compact-negatif" : "compact"} hauteur={190 / (245 / 110)} />
        <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: theme.colors.ink }}>
          Vos billets du Transgabonais, dans votre poche.
        </Text>
        <View style={{ gap: 16 }}>
          <Atout icone={<Smartphone size={20} color={theme.colors.accentInk} />} titre="Payez en Mobile Money" texte="Airtel Money, Moov Money ou carte." />
          <Atout icone={<WifiOff size={20} color={theme.colors.accentInk} />} titre="Billets lisibles sans réseau" texte="Le code s'affiche même en pleine forêt." />
          <Atout icone={<Bell size={20} color={theme.colors.accentInk} />} titre="Prévenu en cas de retard" texte="Une alerte dès que l'horaire change." />
        </View>
      </View>
      <Bas sansBord>
        <Button title="Continuer avec mon numéro" size="lg" block onPress={() => router.push("/connexion")} />
        <LienM titre="J'ai une adresse e-mail" onPress={() => router.push({ pathname: "/connexion", params: { canal: "email" } })} />
      </Bas>
    </Ecran>
  )
}

function Atout({ icone, titre, texte }: { icone: ReactNode; titre: string; texte: string }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accentSoft }}>{icone}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: theme.colors.ink }}>{titre}</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: theme.colors.inkMuted }}>{texte}</Text>
      </View>
    </View>
  )
}
