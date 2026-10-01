import { useCallback, useMemo, useRef, useState } from "react"
import { ScrollView, View } from "react-native"
import { router, useFocusEffect } from "expo-router"
import { useQuery } from "convex/react"
import { SlidersHorizontal } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { motion } from "@workspace/mobile-ui/tokens"

import { BandeJours, PuceFiltre, type Jour } from "@/components/achat"
import { BarreApp, Corps, Ecran } from "@/components/ecran"
import { EtatVide, Pastille } from "@/components/elements"
import { Apparition, CarteTrajet } from "@/components/trajet"
import { typo } from "@/components/typo"
import { ajouterJours, aujourdhui, duree, jourEnTete, montant } from "@/lib/format"
import { useJourney } from "@/lib/journey"
import { CLASSES, classeCourte, nomTrain, statutDesserte, type Classe } from "@/lib/voyage"

type Filtre = "tous" | "matin" | "soir" | "premiere"

const FILTRES: { id: Filtre; libelle: string }[] = [
  { id: "tous", libelle: "Tous" },
  { id: "matin", libelle: "Matin" },
  { id: "soir", libelle: "Soir" },
  { id: "premiere", libelle: "1re classe" },
]

/** Heure de Libreville d'un horodatage, en heures entières. */
const heureLocale = (timestamp: number) => Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Africa/Libreville" }).format(timestamp))

export default function Resultats() {
  const theme = useTheme()
  const { recherche, setRecherche, setChoix, setClasse } = useJourney()
  const { depart, arrivee, jour, voyageurs } = recherche
  const [filtre, setFiltre] = useState<Filtre>("tous")
  const [choisi, setChoisi] = useState<string | null>(null)
  const delai = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Au retour sur l'écran, aucun trajet n'est plus « en cours de choix ».
  useFocusEffect(
    useCallback(() => {
      setChoisi(null)
      return () => clearTimeout(delai.current)
    }, []),
  )

  // Cinq jours autour du jour choisi, sans remonter avant aujourd'hui.
  const premierJour = useMemo(() => {
    const debut = ajouterJours(jour, -1)
    return debut < aujourdhui() ? aujourdhui() : debut
  }, [jour])
  const calendrier = useQuery(
    api.functions.trips.fareCalendar,
    depart && arrivee ? { originStationId: depart._id, destinationStationId: arrivee._id, from: premierJour, days: 5, passengers: voyageurs } : "skip",
  )
  const resultats = useQuery(
    api.functions.trips.search,
    depart && arrivee ? { originStationId: depart._id, destinationStationId: arrivee._id, serviceDate: jour, passengers: voyageurs } : "skip",
  )

  const jours: Jour[] = useMemo(() => {
    const liste = calendrier ?? Array.from({ length: 5 }, (_, index) => ({ serviceDate: ajouterJours(premierJour, index), prixMinTtc: null, complet: false }))
    const prix = liste.flatMap((item) => (item.prixMinTtc === null ? [] : [item.prixMinTtc]))
    const minimum = prix.length > 1 ? Math.min(...prix) : null
    return liste.map((item) => ({
      jour: item.serviceDate,
      ...jourEnTete(item.serviceDate),
      // Le calendrier chiffre le groupe : la bande affiche le prix d'une place.
      prix: item.prixMinTtc === null ? "" : montant(Math.round(item.prixMinTtc / voyageurs)),
      meilleur: minimum !== null && item.prixMinTtc === minimum && prix.some((valeur) => valeur !== minimum),
      complet: item.complet,
    }))
  }, [calendrier, premierJour, voyageurs])

  const visibles = useMemo(
    () =>
      (resultats ?? []).filter((item) => {
        if (filtre === "matin") return heureLocale(item.departureAt) < 12
        if (filtre === "soir") return heureLocale(item.departureAt) >= 17
        if (filtre === "premiere") return item.prixParClasse.PREMIERE !== undefined
        return true
      }),
    [resultats, filtre],
  )

  // Le moins cher du jour porte « Meilleur prix », s'il se distingue.
  const unitaires = (resultats ?? []).map((item) => minimumUnitaire(item.prixParClasse)).filter((valeur): valeur is number => valeur !== null)
  const moinsCher = unitaires.length > 1 && new Set(unitaires).size > 1 ? Math.min(...unitaires) : null

  if (!depart || !arrivee) {
    return (
      <Ecran>
        <BarreApp titre="Recherche" />
        <EtatVide titre="Recherche incomplète" texte="Choisissez une gare de départ et une gare d'arrivée." action={<Button title="Chercher un train" onPress={() => router.replace("/")} />} />
      </Ecran>
    )
  }

  function choisir(item: NonNullable<typeof resultats>[number]) {
    const unitaires: Partial<Record<Classe, number>> = {}
    for (const classe of CLASSES) {
      const prix = item.prixParClasse[classe]
      if (prix) unitaires[classe] = prix.unitaireTtc
    }
    if (choisi) return
    const premiere = CLASSES.find((classe) => unitaires[classe] !== undefined && (item.availableByClass[classe] ?? 0) >= voyageurs)
    if (!premiere) return
    setChoisi(item.trip._id)
    setClasse(premiere)
    setChoix({
      tripId: item.trip._id,
      departAt: item.departureAt,
      arriveeAt: item.arrivalAt,
      trainType: item.trip.trainType,
      trainNumber: item.trip.trainNumber,
      unitaires,
      disponibles: item.availableByClass,
    })
    // Le ruban remplit la voie du trajet choisi, puis on passe à l'étape suivante.
    delai.current = setTimeout(() => router.push("/reservation"), motion.durationGlisse)
  }

  return (
    <Ecran>
      <BarreApp titre={`${depart.name} → ${arrivee.name}`} sousTitre={`${voyageurs} voyageur${voyageurs > 1 ? "s" : ""} · aller simple`} />
      <Corps>
        <BandeJours jours={jours} choisi={jour} onChoisir={(suivant) => setRecherche({ ...recherche, jour: suivant })} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }}>
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }}>
            {FILTRES.map((item) => (
              <PuceFiltre
                key={item.id}
                libelle={item.libelle}
                actif={filtre === item.id}
                icone={item.id === "tous" ? <SlidersHorizontal size={15} color={filtre === item.id ? theme.colors.accentInk : theme.colors.ink} /> : undefined}
                onPress={() => setFiltre(item.id)}
              />
            ))}
          </View>
        </ScrollView>

        {resultats === undefined ? (
          <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>Recherche des trains…</Text>
        ) : visibles.length === 0 ? (
          <EtatVide
            titre={resultats.length === 0 ? "Aucun train ce jour-là" : "Aucun train pour ce filtre"}
            texte={resultats.length === 0 ? "Choisissez un autre jour dans la bande ci-dessus." : "Retirez le filtre pour voir tous les trains du jour."}
          />
        ) : (
          visibles.map((item, index) => {
            const statut = statutDesserte(item.trip)
            const annule = item.trip.status === "annule"
            const classes = CLASSES.filter((classe) => item.prixParClasse[classe] !== undefined)
            const unitaire = minimumUnitaire(item.prixParClasse)
            const arrets = item.intermediateStops
            const complet = !annule && !item.hasAvailability
            return (
              <Apparition key={`${jour}-${item.trip._id}`} index={index}>
                <CarteTrajet
                  departAt={item.departureAt}
                  arriveeAt={item.arrivalAt}
                  gareDepart={depart.name}
                  gareArrivee={arrivee.name}
                  milieu={annule ? duree((item.arrivalAt - item.departureAt) / 60_000) : `${duree((item.arrivalAt - item.departureAt) / 60_000)} · ${arrets ? `${arrets} arrêt${arrets > 1 ? "s" : ""}` : "direct"}`}
                  annule={annule}
                  choisi={choisi === item.trip._id}
                  classes={classes.map(classeCourte).join(" · ")}
                  prix={complet ? "Complet" : unitaire !== null ? `dès ${montant(unitaire)} XAF` : undefined}
                  onPress={complet ? undefined : () => choisir(item)}
                  pastilles={
                    annule ? (
                      <Pastille libelle="Supprimé" ton="annule" />
                    ) : (
                      <>
                        <Pastille libelle={nomTrain(item.trip.trainType, item.trip.trainNumber)} ton="neutre" train />
                        {statut.ton === "retard" ? <Pastille libelle={statut.libelle} ton="retard" /> : null}
                        {unitaire !== null && unitaire === moinsCher ? <Pastille libelle="Meilleur prix" ton="marque" /> : statut.ton === "ok" ? <Pastille libelle={statut.libelle} ton="ok" /> : null}
                      </>
                    )
                  }
                />
              </Apparition>
            )
          })
        )}
      </Corps>
    </Ecran>
  )
}

function minimumUnitaire(prix: Partial<Record<Classe, { unitaireTtc: number }>>) {
  const valeurs = CLASSES.flatMap((classe) => (prix[classe] ? [prix[classe]!.unitaireTtc] : []))
  return valeurs.length ? Math.min(...valeurs) : null
}

