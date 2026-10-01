import { useEffect, useState } from "react"
import { Animated, Easing, View } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useQuery } from "convex/react"
import { useNetworkState } from "expo-network"
import type { GenericId } from "convex/values"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { Ruban, useMouvementReduit, VoieVerticale } from "@workspace/mobile-ui/marque"
import { fonts, motion } from "@workspace/mobile-ui/tokens"
import { spellTime } from "@workspace/shared/utils/format"

import { BarreApp, Corps, Ecran, NoteM } from "@/components/ecran"
import { Carte, EtatVide, Pastille } from "@/components/elements"
import { typo } from "@/components/typo"
import { heure } from "@/lib/format"
import { GARES_MAJEURES, nomTrain, statutDesserte, useMaintenant } from "@/lib/voyage"

const HAUTEUR_ARRET = 46
const COLONNE_HEURE = 50

/**
 * Suivi du voyage : le statut de la desserte, pas un GPS. La position est
 * estimée d'après l'horaire et le retard annoncé, et l'écran le dit.
 */
export default function Suivi() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ tripId?: string; depart?: string; arrivee?: string }>()
  const detail = useQuery(api.functions.trips.get, params.tripId ? { tripId: params.tripId as GenericId<"trips"> } : "skip")
  const maintenant = useMaintenant(30_000)
  const reseau = useNetworkState()
  const horsReseau = reseau.isConnected === false || reseau.isInternetReachable === false

  if (!params.tripId) {
    return (
      <Ecran>
        <BarreApp titre="Suivi du voyage" />
        <EtatVide titre="Aucun train à suivre" texte="Ouvrez un billet à venir pour suivre son train." action={<Button title="Mes billets" onPress={() => router.replace("/billets")} />} />
      </Ecran>
    )
  }
  if (!detail && horsReseau) {
    return (
      <Ecran>
        <BarreApp titre="Suivi du voyage" />
        <EtatVide titre="Suivi indisponible sans réseau" texte="Le suivi montre l’horaire et le retard annoncés en direct. Votre billet, lui, reste lisible dans l’onglet Billets." />
      </Ecran>
    )
  }
  if (!detail) {
    return (
      <Ecran>
        <BarreApp titre="Suivi du voyage" />
        <Corps>
          <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>Chargement de la desserte…</Text>
        </Corps>
      </Ecran>
    )
  }

  const { trip } = detail
  const annule = trip.status === "annule"
  const retard = annule ? 0 : trip.delayMinutes * 60_000
  // Les arrêts du voyageur : de sa gare de départ à sa gare d'arrivée.
  const debut = Math.max(0, detail.stops.findIndex((stop) => stop.stationId === params.depart))
  const finTrouvee = detail.stops.findIndex((stop) => stop.stationId === params.arrivee)
  const fin = finTrouvee > debut ? finTrouvee : detail.stops.length - 1
  const arrets = detail.stops.slice(debut, fin + 1)
  const premier = arrets[0]
  const dernier = arrets.at(-1)
  const horaire = (stop: (typeof arrets)[number], sens: "depart" | "arrivee" = "depart") =>
    (sens === "arrivee" ? (stop.arrivalAt ?? stop.departureAt) : (stop.departureAt ?? stop.arrivalAt)) ?? 0

  const departPrevu = premier ? horaire(premier) : trip.departureAt
  const arriveePrevue = dernier ? horaire(dernier, "arrivee") : trip.arrivalAt
  const enRoute = !annule && maintenant >= departPrevu + retard && maintenant <= arriveePrevue + retard
  const arrive = !annule && maintenant > arriveePrevue + retard
  // Le prochain arrêt : le premier dont l'heure réelle n'est pas encore passée.
  const prochain = enRoute ? arrets.findIndex((stop) => horaire(stop, "arrivee") + retard > maintenant) : -1
  const statut = statutDesserte(trip)

  // Position de la rame, interpolée entre deux arrêts d'après l'heure réelle.
  let position: number | null = null
  if (enRoute && arrets.length > 1) {
    for (let index = 0; index < arrets.length - 1; index += 1) {
      const a = horaire(arrets[index]!) + retard
      const b = horaire(arrets[index + 1]!, "arrivee") + retard
      if (maintenant >= a && maintenant <= b) {
        position = (index + (b > a ? (maintenant - a) / (b - a) : 0)) * HAUTEUR_ARRET
        break
      }
      if (maintenant > b && maintenant < horaire(arrets[index + 1]!) + retard) position = (index + 1) * HAUTEUR_ARRET
    }
  }

  const parcouru = position ?? (arrive ? (arrets.length - 1) * HAUTEUR_ARRET : 0)

  let phrase: string
  if (annule) phrase = "Ce train est supprimé. Adressez-vous au guichet avec votre billet."
  else if (arrive) phrase = `Le train est arrivé à ${dernier?.station?.name ?? "destination"}.`
  else if (!enRoute) phrase = `Départ prévu de ${premier?.station?.name ?? "la gare"} à ${heure(departPrevu + retard)}.${retard ? ` Retard annoncé : ${trip.delayMinutes} min.` : ""}`
  else if (retard) phrase = `Le train roule avec ${trip.delayMinutes} min de retard. Votre place est conservée.`
  else phrase = "Le train roule à l'heure."

  return (
    <Ecran>
      <BarreApp
        titre={nomTrain(trip.trainType, trip.trainNumber)}
        sousTitre={`${premier?.station?.name ?? ""} → ${dernier?.station?.name ?? ""}`}
        droite={enRoute ? <EnDirect /> : null}
      />
      <Corps>
        <Carte style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View accessible accessibilityLabel={`Arrivée prévue à ${dernier?.station?.name} à ${spellTime(arriveePrevue + retard, "fr-FR")}`}>
              <Text style={[typo.legende, { color: theme.colors.inkMuted }]}>Arrivée prévue à {dernier?.station?.name}</Text>
              <Text
                style={{
                  fontFamily: fonts.monoSemibold,
                  fontSize: 30,
                  lineHeight: 34,
                  color: theme.colors.ink,
                  fontVariant: ["tabular-nums"],
                  textDecorationLine: annule ? "line-through" : "none",
                }}
              >
                {heure(arriveePrevue + retard)}
              </Text>
            </View>
            <Pastille libelle={statut.libelle} ton={statut.ton} />
          </View>
          <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>{phrase}</Text>
        </Carte>

        <View style={{ height: arrets.length * HAUTEUR_ARRET }}>
          {arrets.length > 1 ? (
            <>
              <VoieVerticale
                passee
                style={{ left: COLONNE_HEURE + 6, top: HAUTEUR_ARRET / 2, height: parcouru }}
              />
              <VoieVerticale
                passee={annule}
                style={{ left: COLONNE_HEURE + 6, top: HAUTEUR_ARRET / 2 + parcouru, bottom: HAUTEUR_ARRET / 2 }}
              />
            </>
          ) : null}
          {position !== null ? <Rame y={position + HAUTEUR_ARRET / 2 - 11} /> : null}
          {arrets.map((stop, index) => {
            const passe = arrive || (enRoute && (prochain === -1 || index < prochain))
            const majeure = GARES_MAJEURES.has(stop.station?.code ?? "") || index === 0 || index === arrets.length - 1
            const prevue = horaire(stop, "arrivee")
            const taille = majeure ? 18 : 14
            return (
              <View
                key={stop._id}
                accessible
                accessibilityLabel={`${stop.station?.name}, ${spellTime(prevue + retard, "fr-FR")}${retard ? `, prévu ${spellTime(prevue, "fr-FR")}` : ""}${index === prochain ? ", prochain arrêt" : passe ? ", desservi" : ""}`}
                style={{ height: HAUTEUR_ARRET, flexDirection: "row", alignItems: "center" }}
              >
                <View style={{ width: COLONNE_HEURE }}>
                  <Text style={[typo.heureMono, { color: passe ? theme.colors.inkFaint : theme.colors.ink }]}>{heure(prevue + retard)}</Text>
                  {retard ? (
                    <Text style={{ fontFamily: fonts.mono, fontSize: 11, lineHeight: 13, color: theme.colors.inkFaint, textDecorationLine: "line-through" }}>{heure(prevue)}</Text>
                  ) : null}
                </View>
                <View style={{ width: 26, alignItems: "center" }}>
                  <View
                    style={{
                      width: taille,
                      height: taille,
                      borderRadius: taille / 2,
                      borderWidth: 3,
                      borderColor: passe || annule ? theme.colors.lineStrong : theme.colors.accent,
                      backgroundColor: theme.colors.surface,
                    }}
                  />
                </View>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8, paddingLeft: 4 }}>
                  <Text style={{ fontFamily: majeure ? fonts.bold : fonts.medium, fontSize: 14, color: passe ? theme.colors.inkFaint : theme.colors.ink }} numberOfLines={1}>
                    {stop.station?.name}
                  </Text>
                  {majeure ? <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: theme.colors.inkFaint }}>PK {stop.kilometerPoint}</Text> : null}
                </View>
                {index === prochain ? <Pastille libelle="Prochain" ton="accent" icone={false} /> : null}
              </View>
            )
          })}
        </View>
        <NoteM>Position estimée d’après l’horaire et le retard annoncé. Aucun suivi GPS.</NoteM>
      </Corps>
    </Ecran>
  )
}

/** La rame : le ruban sur la voie, qui avance d'un cran à chaque mise à jour (1,2 s). */
function Rame({ y }: { y: number }) {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [haut] = useState(() => new Animated.Value(y))

  useEffect(() => {
    const animation = Animated.timing(haut, { toValue: y, duration: reduit ? 0 : 1200, easing: Easing.bezier(...motion.easing.glisse), useNativeDriver: false })
    animation.start()
    return () => animation.stop()
  }, [haut, y, reduit])

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        zIndex: 2,
        // Le liseré couleur du fond détache la rame des rails.
        left: COLONNE_HEURE + 6,
        top: haut,
        width: 14,
        height: 22,
        padding: 3,
        borderRadius: 7,
        backgroundColor: theme.colors.canvas,
      }}
    >
      <Ruban teinte={theme.isDark ? "sombre" : "clair"} vertical style={{ flex: 1 }} />
    </Animated.View>
  )
}

/** « En direct » : le point vert veille, doucement. */
function EnDirect() {
  const theme = useTheme()
  const reduit = useMouvementReduit()
  const [veille] = useState(() => new Animated.Value(1))

  useEffect(() => {
    if (reduit) return
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(veille, { toValue: 0.35, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(veille, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    boucle.start()
    return () => boucle.stop()
  }, [veille, reduit])

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 8 }}>
      <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success, opacity: veille }} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.colors.successInk }}>En direct</Text>
    </View>
  )
}
