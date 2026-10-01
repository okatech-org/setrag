import { useMemo, type ReactNode } from "react"
import { Pressable, View, type ViewStyle } from "react-native"
import { SvgXml } from "react-native-svg"
import { toSVG } from "bwip-js/generic"
import { QrCode, Receipt } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { Logo, Voie } from "@workspace/mobile-ui/marque"
import { brand, colors, fonts, surEncre } from "@workspace/mobile-ui/tokens"
import { formatTime, spellTime } from "@workspace/shared/utils/format"

import { joursDecales } from "@/lib/format"
import { Pastille, type TonPastille } from "./elements"
import { typo } from "./typo"

/**
 * Code Aztec du billet : la charge signée (`SETRAG1:…`) que lit le contrôleur,
 * hors réseau. Même encodeur que le PDF et la billetterie web (bwip-js).
 */
export function CodeAztec({ valeur, taille }: { valeur: string; taille: number }) {
  const xml = useMemo(() => {
    try {
      return toSVG({ bcid: "azteccode", text: valeur, scale: 1, barcolor: brand.encre.slice(1) })
    } catch {
      return null
    }
  }, [valeur])

  if (!xml) return <View style={{ width: taille, height: taille }} />
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Code du billet, à présenter au contrôleur">
      <SvgXml xml={xml} width={taille} height={taille} />
    </View>
  )
}

export type Case = { libelle: string; valeur: string }

/** En-tête du trajet sur l'encre : heures, gares, voie pleine, légendes. */
export function TrajetBillet({
  departAt,
  arriveeAt,
  gareDepart,
  gareArrivee,
  dessus,
  dessous,
  taille = 26,
  passe,
}: {
  departAt: number
  arriveeAt: number
  gareDepart: string
  gareArrivee: string
  dessus?: string
  dessous?: string
  taille?: number
  /** Billet passé : sur surface claire, sans ruban. */
  passe?: boolean
}) {
  const theme = useTheme()
  const heureCouleur = passe ? theme.colors.inkMuted : surEncre.texte
  const secondaire = passe ? theme.colors.inkMuted : surEncre.texte2
  const decalage = joursDecales(departAt, arriveeAt)
  const heure = (ts: number, plus = 0) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <Text style={{ fontFamily: fonts.monoSemibold, fontSize: taille, lineHeight: taille + 2, color: heureCouleur, fontVariant: ["tabular-nums"] }}>
        {formatTime(ts, "fr-FR")}
      </Text>
      {plus > 0 ? <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 11, color: secondaire, marginLeft: 2 }}>+{plus}</Text> : null}
    </View>
  )

  return (
    <View
      accessible
      accessibilityLabel={`${gareDepart} ${spellTime(departAt, "fr-FR")}, ${gareArrivee} ${spellTime(arriveeAt, "fr-FR")}${dessus ? `, ${dessus}` : ""}${dessous ? `, ${dessous}` : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ maxWidth: "36%" }}>
        {heure(departAt)}
        <Text style={[typo.gare, { color: secondaire, marginTop: 6 }]} numberOfLines={1}>
          {gareDepart}
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: "center", gap: 4 }}>
        {dessus ? <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, lineHeight: 15, color: secondaire }} numberOfLines={1}>{dessus}</Text> : null}
        <Voie progression={passe ? 0 : 1} surEncre={!passe} duree={0} style={{ alignSelf: "stretch" }} />
        {dessous ? <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, lineHeight: 15, color: secondaire }} numberOfLines={1}>{dessous}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: "36%" }}>
        {heure(arriveeAt, decalage)}
        <Text style={[typo.gare, { color: secondaire, marginTop: 6 }]} numberOfLines={1}>
          {gareArrivee}
        </Text>
      </View>
    </View>
  )
}

/** Cases du bas du billet : voiture, place, classe… */
export function GrilleBillet({ cases }: { cases: Case[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {cases.map((item) => (
        <View key={item.libelle} style={{ flex: 1 }} accessible accessibilityLabel={`${item.libelle} ${item.valeur}`}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, color: surEncre.texte2 }}>{item.libelle}</Text>
          <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 18, lineHeight: 24, color: surEncre.texte, fontVariant: ["tabular-nums"] }}>{item.valeur}</Text>
        </View>
      ))}
    </View>
  )
}

/** Ligne de découpe : deux encoches couleur du fond, la voie entre elles. */
export function DecoupeBillet({ fond, progression, duree }: { fond: string; progression: number; duree: number }) {
  return (
    <View style={{ marginHorizontal: -20, paddingHorizontal: 16, justifyContent: "center", marginVertical: 2 }}>
      <View style={{ position: "absolute", left: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: fond }} />
      <View style={{ position: "absolute", right: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: fond }} />
      <Voie surEncre progression={progression} duree={duree} />
    </View>
  )
}

/** Le billet : un objet, fond encre dans les deux thèmes (`.billet`). */
export function Billet({
  statut,
  children,
  compact,
  transparent,
  style,
}: {
  statut?: { libelle: string; ton: TonPastille }
  children: ReactNode
  /** Billet émis, dans le fil de l'écran (`.billet-m`). */
  compact?: boolean
  /** Billet plein écran : déjà posé sur l'encre. */
  transparent?: boolean
  style?: ViewStyle
}) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: transparent ? "transparent" : brand.encre,
          borderRadius: theme.radius.lg,
          paddingVertical: compact ? 16 : 16,
          paddingHorizontal: compact ? 16 : 20,
          gap: 12,
        },
        !transparent && theme.shadows.md,
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Logo variante="compact-negatif" hauteur={26} />
        {statut ? (
          <View style={{ marginLeft: "auto" }}>
            <Pastille libelle={statut.libelle} ton={statut.ton} surEncre />
          </View>
        ) : null}
      </View>
      {children}
    </View>
  )
}

/** Code sur fond blanc, et sa légende : référence et rang du billet. */
export function CadreCode({ valeur, legende, taille = 150 }: { valeur: string; legende: string; taille?: number }) {
  const theme = useTheme()
  return (
    <View style={{ backgroundColor: colors.light.surface, borderRadius: theme.radius.md, padding: 12, alignItems: "center", gap: 6 }}>
      <CodeAztec valeur={valeur} taille={taille} />
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, lineHeight: 15, letterSpacing: 0.9, color: surEncre.legendeCode }}>{legende}</Text>
    </View>
  )
}

/**
 * Billet réduit de l'onglet Billets (`.billet-mini`) : trajet, voyageur et
 * place, bouton du code. Passé, il quitte l'encre pour la surface.
 */
export function BilletMini({
  departAt,
  arriveeAt,
  gareDepart,
  gareArrivee,
  date,
  train,
  qui,
  detail,
  passe,
  onPress,
}: {
  departAt: number
  arriveeAt: number
  gareDepart: string
  gareArrivee: string
  date: string
  train: string
  qui: string
  detail: string
  passe?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const Icone = passe ? Receipt : QrCode
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={passe ? "Voir le billet" : "Afficher le code du billet"}
      onPress={onPress}
      style={({ pressed }) => [
        {
          padding: 16,
          gap: 8,
          borderRadius: theme.radius.lg,
          backgroundColor: passe ? theme.colors.surface : brand.encre,
          borderWidth: passe ? 1 : 0,
          borderColor: theme.colors.line,
          opacity: pressed ? 0.92 : 1,
        },
        !passe && theme.shadows.md,
      ]}
    >
      <TrajetBillet departAt={departAt} arriveeAt={arriveeAt} gareDepart={gareDepart} gareArrivee={gareArrivee} dessus={date} dessous={train} taille={26} passe={passe} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: passe ? theme.colors.inkMuted : surEncre.texte2 }}>
          <Text style={{ fontFamily: fonts.semibold, color: passe ? theme.colors.ink : surEncre.texte }}>{qui}</Text> · {detail}
        </Text>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: passe ? theme.colors.surfaceSunk : surEncre.bouton,
          }}
        >
          <Icone size={20} color={passe ? theme.colors.inkMuted : surEncre.texte} />
        </View>
      </View>
    </Pressable>
  )
}
