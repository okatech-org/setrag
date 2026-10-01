import { useMemo, useRef, useState } from "react"
import { Animated, Easing, Pressable, ScrollView, TextInput, View } from "react-native"
import { ArrowUpDown, Minus, Plus, Search } from "lucide-react-native"

import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { useMouvementReduit, VoieVerticale } from "@workspace/mobile-ui/marque"
import { fonts, motion } from "@workspace/mobile-ui/tokens"

import { ajouterJours, aujourdhui, jourEnTete, jourLong, mois } from "@/lib/format"
import type { Gare } from "@/lib/journey"
import { GARES_MAJEURES, simplifier } from "@/lib/voyage"
import { Etiquette } from "./ecran"
import { Pastille } from "./elements"
import { Feuille } from "./feuille"
import { typo } from "./typo"

/** Champ du bloc de recherche (`.bloc-champ`) : libellé au-dessus, valeur en gras. */
function BlocChamp({ libelle, valeur, onPress, coins, droite }: { libelle: string; valeur: string; onPress: () => void; coins?: boolean; droite?: number }) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle} : ${valeur}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        justifyContent: "center",
        paddingVertical: 6,
        paddingLeft: 16,
        paddingRight: droite ?? 16,
        backgroundColor: pressed ? theme.colors.line : theme.colors.surfaceSunk,
        borderRadius: coins ? theme.radius.md : 0,
        flex: coins ? 1 : undefined,
      })}
    >
      <Text style={[typo.legende, { color: theme.colors.inkMuted }]}>{libelle}</Text>
      <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, color: theme.colors.ink }}>
        {valeur}
      </Text>
    </Pressable>
  )
}

/**
 * Bloc de recherche (`.recherche.m-recherche`) : départ et arrivée reliés,
 * inversion au milieu ; date et voyageurs dessous.
 */
export function BlocRecherche({
  depart,
  arrivee,
  date,
  voyageurs,
  onDepart,
  onArrivee,
  onDate,
  onVoyageurs,
  onInverser,
}: {
  depart: string
  arrivee: string
  date: string
  voyageurs: number
  onDepart: () => void
  onArrivee: () => void
  onDate: () => void
  onVoyageurs: () => void
  onInverser: () => void
}) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [rotation] = useState(() => new Animated.Value(0))
  const tours = useRef(0)

  function inverser() {
    tours.current += 1
    Animated.timing(rotation, {
      toValue: tours.current,
      duration: reduit ? 0 : motion.durationSlow,
      easing: Easing.bezier(...motion.easing.glisse),
      useNativeDriver: true,
    }).start()
    onInverser()
  }

  return (
    <View
      style={{
        gap: 6,
        padding: 8,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: theme.radius.lg,
        ...theme.shadows.sm,
      }}
    >
      <View style={{ gap: 2, borderRadius: theme.radius.md, overflow: "hidden" }}>
        <BlocChamp libelle="Départ" valeur={depart} onPress={onDepart} droite={64} />
        <BlocChamp libelle="Arrivée" valeur={arrivee} onPress={onArrivee} droite={64} />
        <View style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Inverser départ et arrivée"
            onPress={inverser}
            hitSlop={2}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Animated.View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.lineStrong,
                transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"], extrapolate: "extend" }) }],
              }}
            >
              <ArrowUpDown size={18} color={theme.colors.accentInk} />
            </Animated.View>
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ flex: 1.1, flexDirection: "row" }}>
          <BlocChamp libelle="Aller" valeur={date} onPress={onDate} coins />
        </View>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <BlocChamp libelle="Voyageurs" valeur={String(voyageurs)} onPress={onVoyageurs} coins />
        </View>
      </View>
    </View>
  )
}

/**
 * Choisir une gare : la liste suit la ligne, dans l'ordre où le train les
 * dessert ; la saisie filtre sans quitter la voie.
 */
export function FeuilleGares({
  visible,
  sens,
  gares,
  choisie,
  autre,
  onChoisir,
  onFermer,
}: {
  visible: boolean
  sens: "depart" | "arrivee"
  gares: Gare[]
  choisie: Gare | null
  /** La gare de l'autre extrémité, marquée sur la voie. */
  autre: Gare | null
  onChoisir: (gare: Gare) => void
  onFermer: () => void
}) {
  const theme = useTheme()
  const [saisie, setSaisie] = useState("")
  const [focus, setFocus] = useState(false)
  const filtre = simplifier(saisie.trim())
  const visibles = useMemo(() => (filtre ? gares.filter((gare) => simplifier(gare.name).includes(filtre)) : gares), [gares, filtre])

  function fermer() {
    setSaisie("")
    onFermer()
  }

  return (
    <Feuille visible={visible} titre={sens === "depart" ? "Départ" : "Arrivée"} onFermer={fermer}>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            minHeight: 48,
            paddingHorizontal: 14,
            borderRadius: theme.radius.md,
            borderWidth: focus ? 2 : 1,
            borderColor: focus ? theme.colors.accent : theme.colors.lineStrong,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Search size={18} color={theme.colors.inkMuted} />
          <TextInput
            value={saisie}
            onChangeText={setSaisie}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Rechercher une gare"
            placeholderTextColor={theme.colors.inkFaint}
            accessibilityLabel="Rechercher une gare"
            autoCorrect={false}
            style={{ flex: 1, minHeight: 44, fontFamily: fonts.medium, fontSize: 16, color: theme.colors.ink }}
          />
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: theme.colors.inkMuted }}>
            {visibles.length} gare{visibles.length > 1 ? "s" : ""}
          </Text>
        </View>
        <Etiquette>{filtre ? "Gares trouvées" : `Sur la ligne, depuis ${gares[0]?.name ?? "Owendo"}`}</Etiquette>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View>
          {visibles.length > 1 ? <VoieVerticale style={{ left: 23, top: 22, bottom: 22 }} /> : null}
          {visibles.map((gare) => {
            const majeure = GARES_MAJEURES.has(gare.code)
            const estChoisie = choisie?._id === gare._id
            const estAutre = autre?._id === gare._id
            const taille = majeure ? 16 : 12
            return (
              <Pressable
                key={gare._id}
                accessibilityRole="button"
                accessibilityState={{ selected: estChoisie, disabled: estAutre }}
                accessibilityLabel={`${gare.name}, point kilométrique ${gare.kilometerPoint}${estAutre ? `, gare ${sens === "depart" ? "d'arrivée" : "de départ"}` : ""}`}
                disabled={estAutre}
                onPress={() => {
                  setSaisie("")
                  onChoisir(gare)
                }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 46,
                  borderRadius: theme.radius.md,
                  backgroundColor: estChoisie ? theme.colors.accentSoft : pressed ? theme.colors.surfaceSunk : "transparent",
                })}
              >
                <View style={{ width: 60, alignItems: "center" }}>
                  <View
                    style={{
                      width: taille,
                      height: taille,
                      borderRadius: taille / 2,
                      borderWidth: 3,
                      borderColor: estAutre || estChoisie ? theme.colors.accent : majeure ? theme.colors.inkMuted : theme.colors.lineStrong,
                      backgroundColor: estAutre ? theme.colors.accent : theme.colors.surface,
                    }}
                  />
                </View>
                <Text style={{ flex: 1, fontFamily: majeure ? fonts.bold : fonts.medium, fontSize: 15, color: theme.colors.ink }}>{gare.name}</Text>
                {estAutre ? (
                  <View style={{ paddingRight: 8 }}>
                    <Pastille libelle={sens === "depart" ? "Arrivée" : "Départ"} ton="accent" icone={false} petite />
                  </View>
                ) : (
                  <Text style={[typo.mono12, { color: theme.colors.inkFaint, paddingRight: 12 }]}>PK {gare.kilometerPoint}</Text>
                )}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </Feuille>
  )
}

/** Choisir le jour : quatre semaines, à partir d'aujourd'hui. */
export function FeuilleDate({ visible, choisi, onChoisir, onFermer }: { visible: boolean; choisi: string; onChoisir: (jour: string) => void; onFermer: () => void }) {
  const theme = useTheme()
  const debut = aujourdhui()
  // Grille du lundi au dimanche : on recule jusqu'au lundi de la semaine en cours.
  const decalage = (new Date(`${debut}T12:00:00Z`).getUTCDay() + 6) % 7
  const cases = Array.from({ length: 35 }, (_, index) => ajouterJours(debut, index - decalage))

  return (
    <Feuille visible={visible} titre="Date du voyage" onFermer={onFermer} hauteur="auto">
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <Etiquette>{mois(debut) === mois(cases[34]!) ? mois(debut) : `${mois(debut)} – ${mois(cases[34]!)}`}</Etiquette>
        <View style={{ flexDirection: "row" }}>
          {["L", "M", "M", "J", "V", "S", "D"].map((lettre, index) => (
            <Text key={index} style={{ flex: 1, textAlign: "center", fontFamily: fonts.semibold, fontSize: 12, color: theme.colors.inkMuted }}>
              {lettre}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cases.map((jour) => {
            const passe = jour < debut
            const actif = jour === choisi
            return (
              <View key={jour} style={{ width: `${100 / 7}%`, padding: 2 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: actif, disabled: passe }}
                  accessibilityLabel={jourLong(jour)}
                  disabled={passe}
                  onPress={() => onChoisir(jour)}
                  style={{
                    minHeight: 44,
                    borderRadius: theme.radius.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: actif ? theme.colors.accent : "transparent",
                    borderWidth: jour === debut && !actif ? 1 : 0,
                    borderColor: theme.colors.accentLine,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.semibold,
                      fontSize: 15,
                      color: actif ? theme.colors.inkInverse : passe ? theme.colors.inkFaint : theme.colors.ink,
                      opacity: passe ? 0.5 : 1,
                    }}
                  >
                    {jourEnTete(jour).quantieme}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>
    </Feuille>
  )
}

/** Nombre de voyageurs : jusqu'à neuf dans la même réservation. */
export function FeuilleVoyageurs({ visible, nombre, onValider, onFermer }: { visible: boolean; nombre: number; onValider: (nombre: number) => void; onFermer: () => void }) {
  const theme = useTheme()
  const [valeur, setValeur] = useState(nombre)
  const bouton = (Icone: typeof Plus, libelle: string, desactive: boolean, pas: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      disabled={desactive}
      onPress={() => setValeur((courante) => courante + pas)}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: desactive ? theme.colors.line : theme.colors.lineStrong,
          backgroundColor: theme.colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icone size={16} color={desactive ? theme.colors.inkFaint : theme.colors.accentInk} />
      </View>
    </Pressable>
  )

  return (
    <Feuille visible={visible} titre="Voyageurs" onFermer={onFermer} hauteur="auto">
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: theme.radius.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[typo.gras15, { color: theme.colors.ink }]}>Voyageurs</Text>
            <Text style={[typo.petit, { color: theme.colors.inkMuted }]}>Jusqu’à 9 dans la même réservation. Les réductions se choisissent ensuite.</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }} accessible accessibilityLabel={`${valeur} voyageur${valeur > 1 ? "s" : ""}`}>
            {bouton(Minus, "Un voyageur de moins", valeur <= 1, -1)}
            <Text style={{ minWidth: 26, textAlign: "center", fontFamily: fonts.monoSemibold, fontSize: 16, color: theme.colors.ink }}>{valeur}</Text>
            {bouton(Plus, "Un voyageur de plus", valeur >= 9, 1)}
          </View>
        </View>
        <Button title="Valider" size="lg" block onPress={() => onValider(valeur)} />
      </View>
    </Feuille>
  )
}
