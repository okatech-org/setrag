import type { ReactNode } from "react"
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewProps, type ViewStyle } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { router } from "expo-router"
import { ChevronLeft, Info } from "lucide-react-native"

import { Text, useTheme } from "@workspace/mobile-ui/components"
import { Logo } from "@workspace/mobile-ui/marque"

import { typo } from "./typo"

/**
 * Écran plein : zone sûre du haut, fond canvas. Le pied gère la zone du bas
 * et remonte au-dessus du clavier : le bouton principal reste à portée.
 */
export function Ecran({ children, fond, style }: { children: ReactNode; fond?: string; style?: ViewStyle }) {
  const theme = useTheme()
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[{ flex: 1, backgroundColor: fond ?? theme.colors.canvas }, style]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

type Action = { icone: ReactNode; libelle: string; onPress: () => void; pastille?: boolean }

/**
 * Barre d'app (`.m-barre`) : retour, titre sur deux lignes, actions à droite.
 * `logo` remplace retour et titre par le logo compact, à l'accueil.
 */
export function BarreApp({
  titre,
  sousTitre,
  retour = true,
  onRetour,
  actions,
  logo,
  droite,
  couleurRetour,
  couleurTitre,
}: {
  titre?: string
  sousTitre?: string
  retour?: boolean
  onRetour?: () => void
  actions?: Action[]
  logo?: boolean
  /** Contenu libre à droite, après les actions (« En direct »). */
  droite?: ReactNode
  couleurRetour?: string
  couleurTitre?: string
}) {
  const theme = useTheme()
  return (
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: logo ? 16 : retour ? 8 : 12, paddingRight: 12 }}>
      {logo ? (
        <Logo variante={theme.isDark ? "compact-negatif" : "compact"} hauteur={30} />
      ) : (
        retour && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={4}
            onPress={onRetour ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={24} color={couleurRetour ?? theme.colors.accentInk} />
          </Pressable>
        )
      )}
      {titre ? (
        <View style={{ flexShrink: 1 }} accessibilityRole="header">
          <Text style={[typo.titreBarre, { color: couleurTitre ?? theme.colors.ink }]} numberOfLines={1}>
            {titre}
          </Text>
          {sousTitre ? (
            <Text style={[typo.sousTitreBarre, { color: theme.colors.inkMuted }]} numberOfLines={1}>
              {sousTitre}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2 }}>
        {actions?.map((action) => (
          <Pressable
            key={action.libelle}
            accessibilityRole="button"
            accessibilityLabel={action.pastille ? `${action.libelle}, nouveautés` : action.libelle}
            onPress={action.onPress}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
          >
            {action.icone}
            {action.pastille ? (
              <View
                style={{
                  position: "absolute",
                  top: 8,
                  right: 9,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: theme.colors.danger,
                  borderWidth: 2,
                  borderColor: theme.colors.canvas,
                }}
              />
            ) : null}
          </Pressable>
        ))}
        {droite}
      </View>
    </View>
  )
}

/** Titre d'onglet, en tête d'écran (« Billets », « Compte »). */
export function BarreTitre({ titre }: { titre: string }) {
  const theme = useTheme()
  return (
    <View style={{ minHeight: 52, justifyContent: "center", paddingHorizontal: 16 }}>
      <Text accessibilityRole="header" style={[typo.grandTitre, { fontSize: 24, lineHeight: 28, color: theme.colors.ink }]}>
        {titre}
      </Text>
    </View>
  )
}

/** Corps d'écran (`.m-corps`) : défile, 16 pt de marge, 12 pt entre les blocs. */
export function Corps({ children, style, centre, contentContainerStyle, ...props }: ScrollViewProps & { centre?: boolean; style?: ViewStyle }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      {...props}
      contentContainerStyle={[
        { paddingTop: 4, paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
        centre && { flexGrow: 1, justifyContent: "center", alignItems: "center" },
        style,
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  )
}

/** Pied d'action (`.m-bas`) : total et bouton principal, au-dessus de la barre d'accueil. */
export function Bas({ children, sansBord, fond }: { children: ReactNode; sansBord?: boolean; fond?: string }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        gap: 8,
        paddingTop: 12,
        paddingHorizontal: 16,
        paddingBottom: Math.max(insets.bottom, 12) + 4,
        backgroundColor: sansBord ? (fond ?? "transparent") : theme.colors.surface,
        borderTopWidth: sansBord ? 0 : 1,
        borderTopColor: theme.colors.line,
      }}
    >
      {children}
    </View>
  )
}

export function GrandTitre({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <Text accessibilityRole="header" style={[typo.grandTitre, { color: theme.colors.ink }]}>
      {children}
    </Text>
  )
}

export function SousTitre({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>{children}</Text>
}

/** Intertitre en capitales (`.m-etiquette`). */
export function Etiquette({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme()
  return (
    <View style={style}>
      <Text accessibilityRole="header" style={[typo.etiquette, { color: theme.colors.inkMuted }]}>
        {children}
      </Text>
    </View>
  )
}

/** Titre de section avec lien à droite (`.titre-section`). */
export function TitreSection({ titre, lien, onLien }: { titre: string; lien?: string; onLien?: () => void }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
      <Text accessibilityRole="header" style={[typo.titreSection, { color: theme.colors.ink }]}>
        {titre}
      </Text>
      {lien && onLien ? (
        <Pressable accessibilityRole="link" onPress={onLien} style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "flex-end" }}>
          <Text style={[typo.lienSection, { color: theme.colors.accentInk }]}>{lien}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** Lien centré sous un bouton (`.m-lien`), cible de 44 pt. */
export function LienM({ titre, onPress, couleur }: { titre: string; onPress: () => void; couleur?: string }) {
  const theme = useTheme()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
      <Text style={[typo.lien, { color: couleur ?? theme.colors.accentInk }]}>{titre}</Text>
    </Pressable>
  )
}

/** Ligne de total au-dessus du bouton de paiement (`.m-total`). */
export function Total({ libelle, valeur }: { libelle: string; valeur: string }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
      <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>{libelle}</Text>
      <Text style={[typo.total, { color: theme.colors.ink }]}>{valeur}</Text>
    </View>
  )
}

/** Note discrète, icône d'information (`.m-note`). */
export function NoteM({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
      <Info size={14} color={theme.colors.inkFaint} style={{ marginTop: 2 }} />
      <Text style={[typo.legende, { color: theme.colors.inkFaint, flex: 1 }]}>{children}</Text>
    </View>
  )
}

/** Message d'erreur sous un formulaire : annoncé aux lecteurs d'écran. */
export function Erreur({ children }: { children: ReactNode }) {
  const theme = useTheme()
  if (!children) return null
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={[typo.sous, { color: theme.colors.dangerInk }]}>{children}</Text>
    </View>
  )
}
