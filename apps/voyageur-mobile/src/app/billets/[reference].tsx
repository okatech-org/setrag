import { useCallback, useEffect, useMemo, useState } from "react"
import { ActionSheetIOS, Alert, AppState, FlatList, Platform, useWindowDimensions, View } from "react-native"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"
import * as Brightness from "expo-brightness"
import { StatusBar } from "expo-status-bar"
import { useQuery } from "convex/react"
import { Share2, Sun } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Text } from "@workspace/mobile-ui/components"
import { brand, colors, fonts, surEncre } from "@workspace/mobile-ui/tokens"

import { Billet, CadreCode, GrilleBillet, TrajetBillet } from "@/components/billet"
import { BarreApp, Ecran } from "@/components/ecran"
import { EtatVide } from "@/components/elements"
import { nomWallet, useActionsBillet } from "@/lib/actions-billet"
import { billetPresentable, casesBillet, statutBillet } from "@/lib/billets"
import { useBookings } from "@/lib/bookings-cache"
import { heure, jourCourt, messageErreur, rebours } from "@/lib/format"
import { nomTrain, useMaintenant } from "@/lib/voyage"

/** Billet plein écran : le code au plus grand, lisible par le contrôleur hors réseau. */
export default function BilletPleinEcran() {
  const { reference, billet: billetDemande } = useLocalSearchParams<{ reference: string; billet?: string }>()
  const { width } = useWindowDimensions()
  const { bookings, save } = useBookings()
  const actions = useActionsBillet()
  const maintenant = useMaintenant()
  const copie = bookings.find((item) => item.sale.number === reference)
  // En ligne, la réponse du serveur prime ; la copie locale ne la recouvre jamais.
  const serveur = useQuery(api.functions.bookings.getByReference, reference && copie ? { reference, contactPhone: copie.sale.contactPhone } : "skip")
  const dossier = serveur ?? copie
  const billets = useMemo(() => dossier?.tickets ?? [], [dossier])
  const depart = Math.max(0, billets.findIndex((item) => item._id === billetDemande))
  const [page, setPage] = useState(depart)

  useEffect(() => {
    if (serveur && copie && JSON.stringify(serveur.tickets.map((t) => t.status)) !== JSON.stringify(copie.tickets.map((t) => t.status))) void save(serveur)
  }, [serveur, copie, save])

  // Luminosité au maximum pendant l'affichage ; rendue en sortant de l'écran
  // ou de l'app, relevée au retour.
  useFocusEffect(
    useCallback(() => {
      let avant: number | null = null
      let actif = true
      const relever = async () => {
        if (avant === null) avant = await Brightness.getBrightnessAsync()
        if (actif) await Brightness.setBrightnessAsync(1)
      }
      const rendre = () => {
        if (avant !== null) void Brightness.setBrightnessAsync(avant).catch(() => undefined)
      }
      void relever().catch(() => undefined)
      const abonnement = AppState.addEventListener("change", (etat) => {
        if (etat === "active") void relever().catch(() => undefined)
        else rendre()
      })
      return () => {
        actif = false
        abonnement.remove()
        rendre()
      }
    }, []),
  )

  if (!dossier || billets.length === 0) {
    return (
      <Ecran fond={brand.encre}>
        <StatusBar style="light" />
        <BarreApp titre="Billet" couleurRetour={colors.light.accentOnInk} couleurTitre={surEncre.texte} />
        <EtatVide titre="Billet introuvable" texte="Il n'est pas sur ce téléphone. Retrouvez-le depuis l'onglet Billets." action={<Button title="Mes billets" onPress={() => router.back()} />} />
      </Ecran>
    )
  }

  const { trip, origin, destination, segment, sale } = dossier
  const departAt = segment?.departureAt ?? trip?.departureAt ?? 0
  const arriveeAt = segment?.arrivalAt ?? trip?.arrivalAt ?? 0
  const courant = billets[page] ?? billets[0]!
  const telephoneContact = sale.contactPhone

  function partager() {
    const choix: { libelle: string; action: () => Promise<void> | void }[] = [
      ...(billetPresentable(courant) && courant.status === "valide" ? [{ libelle: `Ajouter à ${nomWallet}`, action: () => actions.ajouterAuWallet(courant._id, telephoneContact) }] : []),
      { libelle: "Ouvrir le PDF du billet", action: () => actions.ouvrirPdf(courant._id, telephoneContact) },
      ...(trip && arriveeAt > maintenant ? [{ libelle: "Ajouter au calendrier", action: () => actions.ajouterAuCalendrier(dossier!) }] : []),
      ...(trip && arriveeAt > maintenant
        ? [{ libelle: "Suivre le train", action: () => router.push({ pathname: "/suivi", params: { tripId: trip._id, depart: origin?._id, arrivee: destination?._id } }) }]
        : []),
    ]
    const lancer = (index: number) => {
      const element = choix[index]
      if (!element) return
      Promise.resolve(element.action()).catch((cause) => Alert.alert("Action impossible", messageErreur(cause)))
    }
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...choix.map((item) => item.libelle), "Annuler"], cancelButtonIndex: choix.length }, lancer)
    } else {
      Alert.alert("Ce billet", undefined, [...choix.map((item, index) => ({ text: item.libelle, onPress: () => lancer(index) })), { text: "Annuler", style: "cancel" as const }])
    }
  }

  return (
    <Ecran fond={brand.encre}>
      <StatusBar style="light" />
      <BarreApp
        titre={billets.length > 1 ? `Billet ${page + 1} sur ${billets.length}` : "Billet"}
        couleurRetour={colors.light.accentOnInk}
        couleurTitre={surEncre.texte}
        actions={[{ libelle: "Partager ou enregistrer le billet", icone: <Share2 size={20} color={surEncre.texte} />, onPress: partager }]}
      />
      <FlatList
        data={billets}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={depart}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        keyExtractor={(item) => item._id}
        onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index }) => (
          <View style={{ width, paddingHorizontal: 16, paddingTop: 4, gap: 12 }}>
            <Billet transparent statut={statutBillet(item.status)}>
              <TrajetBillet
                departAt={departAt}
                arriveeAt={arriveeAt}
                gareDepart={origin?.name ?? "Départ"}
                gareArrivee={destination?.name ?? "Arrivée"}
                dessus={trip ? jourCourt(trip.serviceDate) : undefined}
                dessous={trip ? nomTrain(trip.trainType, trip.trainNumber) : undefined}
              />
              <GrilleBillet cases={casesBillet([item])} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: surEncre.texte }}>
                {item.passenger.firstName} {item.passenger.lastName}
              </Text>
              {billetPresentable(item) ? (
                <CadreCode valeur={item.barcodePayload!} legende={`${sale.number} · ${index + 1}/${billets.length}`} taille={196} />
              ) : (
                <View style={{ borderRadius: 12, padding: 16, backgroundColor: surEncre.encart }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: surEncre.encartTexte }}>
                    {item.status === "en_attente" ? "Ce billet n'est pas encore payé : il n'a pas de code." : "Ce billet n'est plus valable : il n'a plus de code à présenter."}
                  </Text>
                </View>
              )}
            </Billet>
          </View>
        )}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
        {departAt > maintenant && billetPresentable(courant) ? (
          <View
            accessible
            accessibilityLabel={departAt - maintenant < 86_400_000 ? `Départ dans ${rebours(departAt - maintenant)}` : `Départ le ${trip ? jourCourt(trip.serviceDate) : ""} à ${heure(departAt)}`}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: surEncre.encart }}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: surEncre.encartTexte }}>{departAt - maintenant < 86_400_000 ? "Départ dans" : "Départ le"}</Text>
            <Text style={{ fontFamily: fonts.monoSemibold, fontSize: 20, color: surEncre.texte, fontVariant: ["tabular-nums"] }}>
              {departAt - maintenant < 86_400_000 ? rebours(departAt - maintenant) : `${trip ? jourCourt(trip.serviceDate) : ""} · ${heure(departAt)}`}
            </Text>
          </View>
        ) : null}
        {billets.length > 1 ? (
          <View style={{ flexDirection: "row", gap: 6, justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {billets.map((item, index) => (
              <View key={item._id} style={{ width: index === page ? 20 : 7, height: 7, borderRadius: 4, backgroundColor: index === page ? surEncre.texte : surEncre.pageEteinte }} />
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Sun size={15} color={surEncre.note} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: surEncre.note }}>Luminosité au maximum pendant l’affichage</Text>
        </View>
      </View>
    </Ecran>
  )
}
