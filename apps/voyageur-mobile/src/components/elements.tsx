import { Children, isValidElement, type ReactNode } from "react"
import { Pressable, Switch, View, type ViewStyle } from "react-native"
import { ChevronRight, CircleCheck, CircleX, ClockAlert, Timer, TrainFront } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { Logo } from "@workspace/mobile-ui/marque"
import { brand, colors, fonts, surEncre } from "@workspace/mobile-ui/tokens"

import { typo } from "./typo"

export type TonPastille = "ok" | "retard" | "annule" | "info" | "neutre" | "accent" | "marque"

const ICONES: Partial<Record<TonPastille, typeof CircleCheck>> = {
  ok: CircleCheck,
  retard: ClockAlert,
  annule: CircleX,
}

/**
 * Pastille (`.tag`) : un mot, et souvent une icône — jamais la couleur seule.
 * `surEncre` pour les pastilles posées sur le billet.
 */
export function Pastille({
  libelle,
  ton = "neutre",
  icone,
  train,
  surEncre: encre,
  petite,
}: {
  libelle: string
  ton?: TonPastille
  /** Icône d'état par défaut (ok, retard, annulé) ; `false` pour l'ôter. */
  icone?: boolean
  /** Icône de train, devant un numéro. */
  train?: boolean
  surEncre?: boolean
  petite?: boolean
}) {
  const theme = useTheme()
  const c = theme.colors
  const teintes: Record<TonPastille, { fond: string; texte: string }> = encre
    ? {
        ok: { fond: surEncre.okFond, texte: surEncre.okTexte },
        retard: { fond: surEncre.retardFond, texte: surEncre.retardTexte },
        annule: { fond: c.dangerSoft, texte: c.dangerInk },
        info: { fond: surEncre.neutreFond, texte: surEncre.texte2 },
        neutre: { fond: surEncre.neutreFond, texte: surEncre.texte2 },
        accent: { fond: surEncre.neutreFond, texte: c.accentOnInk },
        marque: { fond: brand.jaune, texte: brand.bleu },
      }
    : {
        ok: { fond: c.successSoft, texte: c.successInk },
        retard: { fond: c.warningSoft, texte: c.warningInk },
        annule: { fond: c.dangerSoft, texte: c.dangerInk },
        info: { fond: c.infoSoft, texte: c.infoInk },
        neutre: { fond: c.surfaceSunk, texte: c.inkMuted },
        accent: { fond: c.accentSoft, texte: c.accentInk },
        marque: { fond: brand.jaune, texte: brand.bleu },
      }
  const { fond, texte } = teintes[ton]
  const Icone = train ? TrainFront : icone === false ? undefined : ICONES[ton]

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: petite ? 22 : 26,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: fond,
        alignSelf: "flex-start",
      }}
    >
      {Icone ? <Icone size={14} strokeWidth={2.2} color={texte} /> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: petite ? 11.5 : 12.5, lineHeight: 16, color: texte }}>{libelle}</Text>
    </View>
  )
}

/** Carte neutre (`.carte`) : surface, filet, rayon moyen. */
export function Carte({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme()
  return (
    <View
      style={[
        { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.md, overflow: "hidden" },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** Liste groupée (`.liste`) : les lignes sont séparées par un filet. */
export function Liste({ children }: { children: ReactNode }) {
  const lignes = Children.toArray(children).filter(isValidElement)
  return (
    <Carte>
      {lignes.map((ligne, index) => (
        <Separee key={ligne.key ?? index} premiere={index === 0}>
          {ligne}
        </Separee>
      ))}
    </Carte>
  )
}

function Separee({ premiere, children }: { premiere: boolean; children: ReactNode }) {
  const theme = useTheme()
  return <View style={{ borderTopWidth: premiere ? 0 : 1, borderTopColor: theme.colors.line }}>{children}</View>
}

/**
 * Ligne de liste (`.ligne`) : icône, libellé et précision, valeur à droite,
 * chevron si elle mène ailleurs, interrupteur si elle règle quelque chose.
 */
export function Ligne({
  icone: Icone,
  libelle,
  precision,
  valeur,
  onPress,
  interrupteur,
  danger,
}: {
  icone?: typeof ChevronRight
  libelle: string
  precision?: string
  valeur?: string
  onPress?: () => void
  interrupteur?: { valeur: boolean; onChange: (valeur: boolean) => void; desactive?: boolean }
  danger?: boolean
}) {
  const theme = useTheme()
  const contenu = (
    <>
      {Icone ? <Icone size={20} color={danger ? theme.colors.dangerInk : theme.colors.inkMuted} /> : null}
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <Text style={[typo.ligne, { color: danger ? theme.colors.dangerInk : theme.colors.ink }]}>{libelle}</Text>
        {precision ? <Text style={[typo.petit, { color: theme.colors.inkMuted }]}>{precision}</Text> : null}
      </View>
      {valeur ? <Text style={[typo.ligneFin, { color: theme.colors.inkMuted }]}>{valeur}</Text> : null}
      {interrupteur ? (
        <Switch
          value={interrupteur.valeur}
          onValueChange={interrupteur.onChange}
          disabled={interrupteur.desactive}
          trackColor={{ false: theme.colors.lineStrong, true: theme.colors.accent }}
          thumbColor={colors.light.surface}
          ios_backgroundColor={theme.colors.lineStrong}
          accessibilityLabel={libelle}
        />
      ) : onPress ? (
        <ChevronRight size={18} color={theme.colors.inkMuted} />
      ) : null}
    </>
  )
  const style: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50, paddingHorizontal: 16 }

  if (onPress && !interrupteur) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[libelle, valeur].filter(Boolean).join(", ")}
        onPress={onPress}
        style={({ pressed }) => [style, pressed && { backgroundColor: theme.colors.surfaceSunk }]}
      >
        {contenu}
      </Pressable>
    )
  }
  return <View style={style}>{contenu}</View>
}

/** Avatar à initiales (`.avatar`). */
export function Avatar({ children, taille = 38 }: { children: ReactNode; taille?: number }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: taille,
        height: taille,
        borderRadius: taille / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.secondSoft,
      }}
    >
      {typeof children === "string" ? (
        <Text style={{ fontFamily: fonts.bold, fontSize: taille > 44 ? 17 : 13, color: theme.colors.secondInk }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  )
}

/** Pastille ronde de radio (`.radio`) : anneau épais quand elle est choisie. */
export function Rond({ coche }: { coche: boolean }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: coche ? 7 : 2,
        borderColor: coche ? theme.colors.accent : theme.colors.lineStrong,
        backgroundColor: theme.colors.surface,
      }}
    />
  )
}

/** Places tenues : le compte à rebours défile, sans clignoter (`.tenue`). */
export function BandeauTenue({ libelle, reste, style }: { libelle: string; reste: string; style?: ViewStyle }) {
  const theme = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={`${libelle} ${reste.replace(":", " minutes ")} secondes`}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.warningSoft,
        },
        style,
      ]}
    >
      <Timer size={16} color={theme.colors.warningInk} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: theme.colors.warningInk }}>{libelle}</Text>
      <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 14, color: theme.colors.warningInk, fontVariant: ["tabular-nums"] }}>{reste}</Text>
    </View>
  )
}

/** État vide : le S en gris, la rame à quai. Rien ne roule encore. */
export function EtatVide({ titre, texte, action }: { titre: string; texte: string; action?: ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 24, paddingHorizontal: 16 }}>
      <View style={{ opacity: theme.isDark ? 0.5 : 0.35, marginBottom: 4 }}>
        <Logo variante={theme.isDark ? "symbole-blanc" : "symbole-encre"} hauteur={92 / (76 / 98)} decoratif />
      </View>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: theme.colors.ink, textAlign: "center" }}>{titre}</Text>
      <Text style={[typo.sous, { color: theme.colors.inkMuted, textAlign: "center", maxWidth: 260 }]}>{texte}</Text>
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  )
}

/** Rond d'illustration d'un état (attente, succès). */
export function Medaillon({ children, taille, fond }: { children: ReactNode; taille: number; fond: string }) {
  return <View style={{ width: taille, height: taille, borderRadius: taille / 2, alignItems: "center", justifyContent: "center", backgroundColor: fond }}>{children}</View>
}
