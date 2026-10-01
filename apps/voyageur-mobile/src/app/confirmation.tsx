import { useEffect, useRef, useState } from "react"
import { Alert, Pressable, View } from "react-native"
import { router } from "expo-router"
import * as Haptics from "expo-haptics"
import { useQuery } from "convex/react"
import { Check, Wallet, X } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts, surEncre, wallet } from "@workspace/mobile-ui/tokens"

import { Billet, DecoupeBillet, GrilleBillet, TrajetBillet } from "@/components/billet"
import { Bas, BarreApp, Corps, Ecran, Erreur, LienM } from "@/components/ecran"
import { EtatVide, Medaillon } from "@/components/elements"
import { typo } from "@/components/typo"
import { nomWallet, useActionsBillet } from "@/lib/actions-billet"
import { billetPresentable, casesBillet, statutBillet } from "@/lib/billets"
import { useBookings } from "@/lib/bookings-cache"
import { duree, heure, JourCourt, messageErreur } from "@/lib/format"
import { useJourney } from "@/lib/journey"
import { nomTrain } from "@/lib/voyage"

/** Billets émis : la preuve d'abord, la suite ensuite. */
export default function Confirmation() {
  const theme = useTheme()
  const { tenue, setTenue, setPaiement } = useJourney()
  const { save } = useBookings()
  const { ajouterAuWallet } = useActionsBillet()
  const dossier = useQuery(api.functions.bookings.getByReference, tenue ? { reference: tenue.reference, contactPhone: tenue.telephoneContact } : "skip")
  const [emis, setEmis] = useState(false)
  const [walletEnCours, setWalletEnCours] = useState(false)
  const [erreur, setErreur] = useState("")
  const enregistre = useRef("")

  const confirme = dossier?.sale.status === "confirmee"

  useEffect(() => {
    if (!dossier || !confirme || enregistre.current === dossier.sale.number) return
    enregistre.current = dossier.sale.number
    void save(dossier)
  }, [dossier, confirme, save])

  // Le ruban traverse la découpe, une fois ; vibration légère.
  useEffect(() => {
    if (!confirme) return
    const minuterie = setTimeout(() => {
      setEmis(true)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
    }, 120)
    return () => clearTimeout(minuterie)
  }, [confirme])

  function terminer(chemin: "/" | "/billets") {
    setTenue(null)
    setPaiement(null)
    router.dismissAll()
    router.replace(chemin)
  }

  if (!tenue) {
    return (
      <Ecran>
        <BarreApp titre="Billets émis" retour={false} />
        <EtatVide titre="Aucune réservation en cours" texte="Vos billets sont dans l'onglet Billets." action={<Button title="Mes billets" onPress={() => router.replace("/billets")} />} />
      </Ecran>
    )
  }

  const trip = dossier?.trip
  const telephoneContact = tenue.telephoneContact
  const billets = dossier?.tickets ?? []
  const presentables = billets.filter(billetPresentable)
  const departAt = dossier?.segment?.departureAt ?? trip?.departureAt
  const arriveeAt = dossier?.segment?.arrivalAt ?? trip?.arrivalAt

  function ajouterWallet() {
    if (!dossier) return
    const lancer = async (ticketId: (typeof billets)[number]["_id"]) => {
      setWalletEnCours(true)
      setErreur("")
      try {
        await ajouterAuWallet(ticketId, telephoneContact)
      } catch (cause) {
        setErreur(messageErreur(cause))
      } finally {
        setWalletEnCours(false)
      }
    }
    if (presentables.length === 1) return void lancer(presentables[0]!._id)
    // Un pass par billet : on demande lequel.
    Alert.alert(`Ajouter à ${nomWallet}`, "Un billet par voyageur.", [
      ...presentables.map((billet) => ({ text: `${billet.passenger.firstName} ${billet.passenger.lastName}`, onPress: () => void lancer(billet._id) })),
      { text: "Annuler", style: "cancel" as const },
    ])
  }

  return (
    <Ecran>
      <BarreApp
        titre="Billets émis"
        retour={false}
        actions={[{ libelle: "Fermer", icone: <X size={22} color={theme.colors.ink} />, onPress: () => terminer("/") }]}
      />
      <Corps>
        <View style={{ alignItems: "center", gap: 6, paddingTop: 8, paddingBottom: 4 }} accessibilityLiveRegion="polite">
          <Medaillon taille={52} fond={theme.colors.successSoft}>
            <Check size={28} strokeWidth={2.4} color={theme.colors.successInk} />
          </Medaillon>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: theme.colors.ink }}>
            {dossier?.sale.status === "confirmee" ? "C'est réservé" : "Émission des billets…"}
          </Text>
          <Text style={[typo.sous, { color: theme.colors.inkMuted, textAlign: "center" }]}>
            {tenue.billets} billet{tenue.billets > 1 ? "s" : ""} · réf. <Text style={{ fontFamily: fonts.monoMedium }}>{tenue.reference}</Text>
          </Text>
        </View>

        {trip && departAt && arriveeAt && billets.length ? (
          <Billet compact statut={statutBillet(billets[0]!.status)}>
            <TrajetBillet
              departAt={departAt}
              arriveeAt={arriveeAt}
              gareDepart={dossier.origin?.name ?? "Départ"}
              gareArrivee={dossier.destination?.name ?? "Arrivée"}
              dessus={duree((arriveeAt - departAt) / 60_000)}
              dessous={nomTrain(trip.trainType, trip.trainNumber)}
              taille={22}
            />
            <DecoupeBillet fond={theme.colors.canvas} progression={emis ? 1 : 0} duree={720} />
            <GrilleBillet cases={casesBillet(billets)} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: surEncre.texte2 }}>
              {JourCourt(trip.serviceDate)} · départ <Text style={{ fontFamily: fonts.semibold, color: surEncre.texte }}>{heure(departAt)}</Text>
            </Text>
          </Billet>
        ) : null}
        <Erreur>{erreur}</Erreur>
      </Corps>
      <Bas sansBord>
        {presentables.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: walletEnCours }}
            disabled={walletEnCours}
            onPress={ajouterWallet}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: wallet.fond,
              opacity: pressed || walletEnCours ? 0.85 : 1,
            })}
          >
            <Wallet size={20} color={wallet.texte} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: wallet.texte }}>Ajouter à {nomWallet}</Text>
          </Pressable>
        ) : null}
        <LienM titre="Voir mes billets" onPress={() => terminer("/billets")} />
      </Bas>
    </Ecran>
  )
}
