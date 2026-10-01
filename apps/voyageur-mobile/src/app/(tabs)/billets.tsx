import { Fragment, useMemo, useState } from "react"
import { View } from "react-native"
import { router } from "expo-router"
import { useConvex, useConvexAuth, useQuery } from "convex/react"
import { useNetworkState } from "expo-network"
import { CircleCheck, Search, WifiOff } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Field, Input, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { BilletMini } from "@/components/billet"
import { BarreTitre, Corps, Ecran, Erreur, Etiquette } from "@/components/ecran"
import { BandeauTenue, Carte, EtatVide, Liste, Ligne } from "@/components/elements"
import { Feuille } from "@/components/feuille"
import { Segment } from "@/components/segment"
import { placeEnClair, statutBillet, type BilletDuDossier } from "@/lib/billets"
import { useBookings, type Booking } from "@/lib/bookings-cache"
import { heure, jourCourt, jourDe, jourSansSemaine, messageErreur, mois, normaliserTelephone, rebours, xaf } from "@/lib/format"
import { useJourney } from "@/lib/journey"
import { nomTrain, useMaintenant, type Classe } from "@/lib/voyage"

type Onglet = "avenir" | "passes"
type Entree = { dossier: Booking; billet: BilletDuDossier; passe: boolean }

export default function Billets() {
  const theme = useTheme()
  const { isAuthenticated } = useConvexAuth()
  const reseau = useNetworkState()
  const horsReseau = reseau.isConnected === false || reseau.isInternetReachable === false
  const { bookings, savedAt } = useBookings()
  const profil = useQuery(api.functions.customers.me, isAuthenticated ? {} : "skip")
  const { setTenue } = useJourney()
  const maintenant = useMaintenant(30_000)
  const [onglet, setOnglet] = useState<Onglet>("avenir")
  const [retrouver, setRetrouver] = useState(false)

  const { avenir, passes, enAttente } = useMemo(() => {
    const avenir: Entree[] = []
    const passes: Entree[] = []
    const enAttente: Booking[] = []
    for (const dossier of bookings) {
      if (dossier.sale.status === "en_attente_paiement") {
        if ((dossier.sale.priceLockedUntil ?? 0) > maintenant) enAttente.push(dossier)
        continue
      }
      const arrivee = dossier.segment?.arrivalAt ?? dossier.trip?.arrivalAt ?? 0
      for (const billet of dossier.tickets) {
        // Un billet déjà contrôlé reste « à venir » jusqu'à l'arrivée : il peut l'être encore.
        const passe = arrivee < maintenant || dossier.sale.status !== "confirmee" || (billet.status !== "valide" && billet.status !== "utilise")
        ;(passe ? passes : avenir).push({ dossier, billet, passe })
      }
    }
    const depart = (entree: Entree) => entree.dossier.segment?.departureAt ?? entree.dossier.trip?.departureAt ?? 0
    avenir.sort((a, b) => depart(a) - depart(b))
    passes.sort((a, b) => depart(b) - depart(a))
    return { avenir, passes, enAttente }
  }, [bookings, maintenant])

  const liste = onglet === "avenir" ? avenir : passes
  const prenom = profil?.user.firstName
  const nom = profil?.user.lastName

  function qui(billet: BilletDuDossier) {
    if (prenom && billet.passenger.firstName === prenom && billet.passenger.lastName === nom) return "Vous"
    return billet.passenger.firstName
  }

  return (
    <Ecran>
      <BarreTitre titre="Billets" />
      <Corps>
        <Segment
          options={[
            { id: "avenir", libelle: avenir.length ? `À venir · ${avenir.length}` : "À venir" },
            { id: "passes", libelle: "Passés" },
          ]}
          valeur={onglet}
          onChange={setOnglet}
        />
        {savedAt && (horsReseau || onglet === "avenir") ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {horsReseau ? <WifiOff size={15} color={theme.colors.inkMuted} /> : <CircleCheck size={15} color={theme.colors.successInk} />}
            <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: theme.colors.inkMuted }}>
              {horsReseau ? "Sans réseau · " : "Lisibles sans réseau · "}à jour du {jourSansSemaine(jourDe(savedAt))} à {heure(savedAt)}
            </Text>
          </View>
        ) : null}

        {onglet === "avenir"
          ? enAttente.map((dossier) => (
              <Carte key={dossier.sale.number} style={{ padding: 16, gap: 12 }}>
                <View style={{ gap: 2 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.colors.ink }}>
                    {dossier.origin?.name} → {dossier.destination?.name}
                  </Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.colors.inkMuted }}>
                    {dossier.trip ? `${nomTrain(dossier.trip.trainType, dossier.trip.trainNumber)} · ${jourCourt(dossier.trip.serviceDate)} · ` : ""}non payé, {xaf(dossier.sale.amounts.ttc)}
                  </Text>
                </View>
                <BandeauTenue libelle="Places tenues encore" reste={rebours((dossier.sale.priceLockedUntil ?? 0) - maintenant)} />
                <Button
                  title="Reprendre le paiement"
                  variant="secondary"
                  block
                  onPress={() => {
                    setTenue({
                      reference: dossier.sale.number,
                      telephoneContact: dossier.sale.contactPhone ?? "",
                      expireAt: dossier.sale.priceLockedUntil ?? 0,
                      totalTtc: dossier.sale.amounts.ttc,
                      billets: dossier.tickets.length,
                      classe: (dossier.tickets[0]?.serviceClass ?? "DEUXIEME") as Classe,
                    })
                    router.push("/paiement")
                  }}
                />
              </Carte>
            ))
          : null}

        {liste.length === 0 && (onglet === "passes" || enAttente.length === 0) ? (
          <EtatVide
            titre={onglet === "avenir" ? "Aucun billet à venir" : "Aucun billet passé"}
            texte={onglet === "avenir" ? "Vos billets apparaîtront ici, et resteront lisibles sans réseau." : "Vos voyages terminés resteront consultables ici."}
            action={onglet === "avenir" ? <Button title="Chercher un train" onPress={() => router.navigate("/")} /> : undefined}
          />
        ) : (
          liste.map((entree, index) => {
            const { dossier, billet, passe } = entree
            const trip = dossier.trip
            const departAt = dossier.segment?.departureAt ?? trip?.departureAt ?? 0
            const arriveeAt = dossier.segment?.arrivalAt ?? trip?.arrivalAt ?? 0
            const moisCourant = trip ? mois(trip.serviceDate) : ""
            const precedent = liste[index - 1]?.dossier.trip
            const intertitre = passe && trip && (!precedent || mois(precedent.serviceDate) !== moisCourant)
            const statut = statutBillet(billet.status)
            return (
              <Fragment key={billet._id}>
                {intertitre ? <Etiquette style={{ marginTop: index ? 8 : 0 }}>{moisCourant}</Etiquette> : null}
                <BilletMini
                  departAt={departAt}
                  arriveeAt={arriveeAt}
                  gareDepart={dossier.origin?.name ?? "Départ"}
                  gareArrivee={dossier.destination?.name ?? "Arrivée"}
                  date={trip ? (passe ? jourSansSemaine(trip.serviceDate) : jourCourt(trip.serviceDate)) : ""}
                  train={trip ? nomTrain(trip.trainType, trip.trainNumber) : ""}
                  qui={qui(billet)}
                  detail={passe ? (billet.status === "valide" || billet.status === "utilise" ? (billet.status === "utilise" ? "utilisé" : "voyage terminé") : statut.libelle.toLowerCase()) : placeEnClair(billet)}
                  passe={passe}
                  onPress={() => router.push({ pathname: "/billets/[reference]", params: { reference: dossier.sale.number, billet: billet._id } })}
                />
              </Fragment>
            )
          })
        )}

        {!isAuthenticated ? (
          <View style={{ marginTop: 8 }}>
            <Liste>
              <Ligne icone={Search} libelle="Retrouver une réservation" precision="Avec sa référence et le téléphone du dossier" onPress={() => setRetrouver(true)} />
            </Liste>
          </View>
        ) : null}
      </Corps>
      {retrouver ? <FeuilleRetrouver onFermer={() => setRetrouver(false)} /> : null}
    </Ecran>
  )
}

/** Sans compte, la référence seule ne suffit pas : le téléphone du dossier la double. */
function FeuilleRetrouver({ onFermer }: { onFermer: () => void }) {
  const convex = useConvex()
  const { save } = useBookings()
  const [reference, setReference] = useState("")
  const [telephone, setTelephone] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")

  async function chercher() {
    const contact = normaliserTelephone(telephone)
    if (!reference.trim() || !contact) return setErreur("Indiquez la référence et le téléphone du dossier.")
    setEnCours(true)
    setErreur("")
    try {
      const dossier = await convex.query(api.functions.bookings.getByReference, { reference: reference.trim().toUpperCase(), contactPhone: contact })
      if (!dossier) return setErreur("Référence ou téléphone incorrect.")
      await save(dossier)
      onFermer()
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Feuille visible titre="Retrouver une réservation" onFermer={onFermer} hauteur="auto">
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        <Field label="Référence">
          <Input value={reference} onChangeText={setReference} autoCapitalize="characters" autoCorrect={false} placeholder="STG-7K4Q2P" />
        </Field>
        <Field label="Téléphone du dossier">
          <Input value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" autoComplete="tel" placeholder="077 12 34 56" />
        </Field>
        <Erreur>{erreur}</Erreur>
        <Button title="Retrouver" size="lg" block loading={enCours} onPress={() => void chercher()} />
      </View>
    </Feuille>
  )
}
