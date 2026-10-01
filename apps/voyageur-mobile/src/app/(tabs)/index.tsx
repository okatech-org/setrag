import { useMemo, useState } from "react"
import { Pressable, View } from "react-native"
import { router } from "expo-router"
import { useQuery } from "convex/react"
import { Bell, TriangleAlert } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { brand, fonts } from "@workspace/mobile-ui/tokens"

import { BarreApp, Corps, Ecran, GrandTitre, TitreSection } from "@/components/ecran"
import { Pastille } from "@/components/elements"
import { BlocRecherche, FeuilleDate, FeuilleGares, FeuilleVoyageurs } from "@/components/recherche"
import { BoutonRuban } from "@/components/ruban"
import { TrajetHeures } from "@/components/trajet"
import { useBookings } from "@/lib/bookings-cache"
import { duree, JourCourt, jourCourt } from "@/lib/format"
import { useJourney, type Gare } from "@/lib/journey"
import { ARRIVEE_PAR_DEFAUT, DEPART_PAR_DEFAUT, nomTrain, statutDesserte, useMaintenant } from "@/lib/voyage"
import { useCompte } from "@/lib/compte"

type Feuille = "depart" | "arrivee" | "date" | "voyageurs" | null

export default function Accueil() {
  const theme = useTheme()
  const { actif } = useCompte()
  const { recherche, setRecherche } = useJourney()
  const { bookings } = useBookings()
  const gares = useQuery(api.functions.referential.listStations, {})
  const nonLues = useQuery(api.functions.notificationCenter.unreadCount, actif ? {} : "skip")
  const [feuille, setFeuille] = useState<Feuille>(null)
  const maintenant = useMaintenant(60_000)

  const depart = recherche.depart ?? gares?.find((gare) => gare.code === DEPART_PAR_DEFAUT) ?? gares?.[0] ?? null
  const arrivee = recherche.arrivee ?? gares?.find((gare) => gare.code === ARRIVEE_PAR_DEFAUT) ?? gares?.at(-1) ?? null

  // Prochain voyage : le premier dossier payé dont le train n'est pas encore arrivé.
  const prochain = useMemo(
    () =>
      bookings
        .filter((item) => item.sale.status === "confirmee" && item.trip && (item.segment?.arrivalAt ?? item.trip.arrivalAt) > maintenant)
        .sort((a, b) => (a.segment?.departureAt ?? a.trip!.departureAt) - (b.segment?.departureAt ?? b.trip!.departureAt))[0],
    [bookings, maintenant],
  )

  function choisirGare(gare: Gare) {
    const suivante = { ...recherche, depart, arrivee, [feuille === "depart" ? "depart" : "arrivee"]: gare }
    setRecherche(suivante)
    setFeuille(null)
  }

  return (
    <Ecran>
      <BarreApp
        logo
        actions={[
          {
            libelle: "Notifications",
            icone: <Bell size={20} color={theme.colors.ink} />,
            pastille: Boolean(nonLues),
            onPress: () => router.push("/notifications"),
          },
        ]}
      />
      <Corps contentContainerStyle={{ paddingBottom: 96 }}>
        <GrandTitre>Où allez-vous ?</GrandTitre>
        <BlocRecherche
          depart={depart?.name ?? "…"}
          arrivee={arrivee?.name ?? "…"}
          date={JourCourt(recherche.jour)}
          voyageurs={recherche.voyageurs}
          onDepart={() => setFeuille("depart")}
          onArrivee={() => setFeuille("arrivee")}
          onDate={() => setFeuille("date")}
          onVoyageurs={() => setFeuille("voyageurs")}
          onInverser={() => setRecherche({ ...recherche, depart: arrivee, arrivee: depart })}
        />
        <Button
          title="Rechercher"
          size="lg"
          block
          disabled={!depart || !arrivee || depart._id === arrivee._id}
          onPress={() => {
            setRecherche({ ...recherche, depart, arrivee })
            router.push("/resultats")
          }}
        />

        {prochain?.trip ? (
          <>
            <TitreSection titre="Prochain voyage" lien="Tout voir" onLien={() => router.navigate("/billets")} />
            <ProchainVoyage
              train={nomTrain(prochain.trip.trainType, prochain.trip.trainNumber)}
              jour={prochain.trip.serviceDate}
              trip={prochain.trip}
              departAt={prochain.segment?.departureAt ?? prochain.trip.departureAt}
              arriveeAt={prochain.segment?.arrivalAt ?? prochain.trip.arrivalAt}
              gareDepart={prochain.origin?.name ?? "Départ"}
              gareArrivee={prochain.destination?.name ?? "Arrivée"}
              onPress={() =>
                router.push({ pathname: "/suivi", params: { tripId: prochain.trip!._id, depart: prochain.origin?._id, arrivee: prochain.destination?._id } })
              }
            />
            {prochain.trip.status === "annule" ? (
              <BandeauTrafic>
                <Text style={{ fontFamily: fonts.bold, color: brand.jaune }}>{nomTrain(prochain.trip.trainType, prochain.trip.trainNumber)} supprimé</Text> le{" "}
                {jourCourt(prochain.trip.serviceDate)}. Adressez-vous au guichet avec votre billet.
              </BandeauTrafic>
            ) : null}
          </>
        ) : null}
      </Corps>
      <BoutonRuban />

      <FeuilleGares
        visible={feuille === "depart" || feuille === "arrivee"}
        sens={feuille === "arrivee" ? "arrivee" : "depart"}
        gares={gares ?? []}
        choisie={feuille === "arrivee" ? arrivee : depart}
        autre={feuille === "arrivee" ? depart : arrivee}
        onChoisir={choisirGare}
        onFermer={() => setFeuille(null)}
      />
      <FeuilleDate
        visible={feuille === "date"}
        choisi={recherche.jour}
        onChoisir={(jour) => {
          setRecherche({ ...recherche, depart, arrivee, jour })
          setFeuille(null)
        }}
        onFermer={() => setFeuille(null)}
      />
      <FeuilleVoyageurs
        key={feuille === "voyageurs" ? "ouverte" : "fermee"}
        visible={feuille === "voyageurs"}
        nombre={recherche.voyageurs}
        onValider={(voyageurs) => {
          setRecherche({ ...recherche, depart, arrivee, voyageurs })
          setFeuille(null)
        }}
        onFermer={() => setFeuille(null)}
      />
    </Ecran>
  )
}

/** Carte du prochain voyage (`.prochain`) : train et statut, puis les heures. */
function ProchainVoyage({
  train,
  jour,
  trip,
  departAt,
  arriveeAt,
  gareDepart,
  gareArrivee,
  onPress,
}: {
  train: string
  jour: string
  trip: { status: string; delayMinutes: number }
  departAt: number
  arriveeAt: number
  gareDepart: string
  gareArrivee: string
  onPress: () => void
}) {
  const theme = useTheme()
  const statut = statutDesserte(trip)
  const retard = trip.status === "annule" ? 0 : trip.delayMinutes * 60_000
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Suivre ce train"
      onPress={onPress}
      style={({ pressed }) => ({
        gap: 12,
        padding: 16,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: pressed ? theme.colors.lineStrong : theme.colors.line,
        borderRadius: theme.radius.md,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.colors.inkMuted }}>
          {train} · {jourCourt(jour)}
        </Text>
        <Pastille libelle={statut.libelle} ton={statut.ton} />
      </View>
      <TrajetHeures
        departAt={departAt}
        arriveeAt={arriveeAt + retard}
        gareDepart={gareDepart}
        gareArrivee={gareArrivee}
        milieu={duree((arriveeAt - departAt) / 60_000)}
        progression={1}
        barre={trip.status === "annule"}
      />
    </Pressable>
  )
}

/** Bandeau d'information trafic (`.bandeau-trafic.arrondi`) : jaune sur bleu SETRAG. */
function BandeauTrafic({ children }: { children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: theme.radius.md,
        backgroundColor: brand.bleu,
      }}
    >
      <TriangleAlert size={18} color={brand.jaune} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: brand.jaune }}>{children}</Text>
    </View>
  )
}
