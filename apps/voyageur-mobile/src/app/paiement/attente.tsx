import { useCallback, useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"
import { Smartphone } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { CURRENT_CGV_VERSION } from "@workspace/backend/cgv"
import { Button, Text, useTheme } from "@workspace/mobile-ui/components"
import { Voie } from "@workspace/mobile-ui/marque"
import { fonts } from "@workspace/mobile-ui/tokens"

import { Bas, BarreApp, Corps, Ecran, Erreur, LienM, NoteM } from "@/components/ecran"
import { BandeauTenue, EtatVide, Medaillon } from "@/components/elements"
import { typo } from "@/components/typo"
import { messageErreur, montant, rebours, telephoneCourtMasque } from "@/lib/format"
import { PAIEMENT_SIMULE, useJourney } from "@/lib/journey"
import { useMaintenant } from "@/lib/voyage"

/**
 * Validation Mobile Money : une consigne, une attente, deux portes de sortie.
 * La demande part d'ici ; l'écran attend que le dossier soit payé.
 */
export default function Attente() {
  const theme = useTheme()
  const { tenue, paiement } = useJourney()
  const dossier = useQuery(api.functions.bookings.getByReference, tenue ? { reference: tenue.reference, contactPhone: tenue.telephoneContact } : "skip")
  const confirmer = useMutation(api.functions.bookings.confirm)
  const maintenant = useMaintenant()
  const [erreur, setErreur] = useState("")
  const demandee = useRef(false)

  const demander = useCallback(async () => {
    if (!tenue || !paiement) return
    setErreur("")
    try {
      await confirmer({
        reference: tenue.reference,
        contactPhone: tenue.telephoneContact,
        method: paiement.moyen === "moov_money" ? "moov_money" : "airtel_money",
        payerPhone: paiement.numero,
        cgvVersion: CURRENT_CGV_VERSION,
      })
    } catch (cause) {
      setErreur(messageErreur(cause))
    }
  }, [tenue, paiement, confirmer])

  useEffect(() => {
    if (demandee.current) return
    demandee.current = true
    void demander()
  }, [demander])

  useEffect(() => {
    if (dossier?.sale.status === "confirmee") router.replace("/confirmation")
  }, [dossier?.sale.status])

  if (!tenue || !paiement) {
    return (
      <Ecran>
        <BarreApp titre="Paiement en cours" retour={false} />
        <EtatVide titre="Aucun paiement en cours" texte="Vos billets payés sont dans l'onglet Billets." action={<Button title="Mes billets" onPress={() => router.replace("/billets")} />} />
      </Ecran>
    )
  }

  const expireAt = dossier?.sale.priceLockedUntil ?? tenue.expireAt
  const operateur = paiement.moyen === "moov_money" ? "Moov Money" : "Airtel Money"
  const total = dossier?.sale.amounts.ttc ?? tenue.totalTtc
  const termine = dossier && dossier.sale.status !== "en_attente_paiement" && dossier.sale.status !== "confirmee"

  if (termine || expireAt <= maintenant) {
    return (
      <Ecran>
        <BarreApp titre="Paiement en cours" retour={false} />
        <EtatVide
          titre="Le délai est passé"
          texte="Le paiement n'a pas été validé à temps : vos places sont de nouveau en vente."
          action={<Button title="Chercher un train" onPress={() => router.replace("/")} />}
        />
      </Ecran>
    )
  }

  return (
    <Ecran>
      <BarreApp titre="Paiement en cours" retour={false} />
      <Corps centre>
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 24, paddingHorizontal: 16, alignSelf: "stretch" }}>
          <Medaillon taille={76} fond={theme.colors.accentSoft}>
            <Smartphone size={34} strokeWidth={1.8} color={theme.colors.accentInk} />
          </Medaillon>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, color: theme.colors.ink, textAlign: "center" }}>
            Validez le paiement sur votre téléphone
          </Text>
          <Text style={[typo.sous, { color: theme.colors.inkMuted, textAlign: "center", maxWidth: 290 }]}>
            {operateur} vous a envoyé une demande de{" "}
            <Text style={{ fontFamily: fonts.monoSemibold, color: theme.colors.ink }}>{montant(total)} XAF</Text> au {telephoneCourtMasque(paiement.numero ?? "")}. Tapez
            votre code secret pour confirmer.
          </Text>
          <View style={{ alignSelf: "stretch", alignItems: "center", gap: 8, marginTop: 8 }} accessibilityLiveRegion="polite">
            <View style={{ width: "100%", maxWidth: 220 }}>
              <Voie attente />
            </View>
            <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>En attente de votre confirmation…</Text>
          </View>
        </View>
        <BandeauTenue libelle="Places tenues encore" reste={rebours(expireAt - maintenant)} style={{ alignSelf: "stretch", justifyContent: "center" }} />
        <Erreur>{erreur}</Erreur>
        {PAIEMENT_SIMULE ? <NoteM>Paiement simulé : aucune demande n’est envoyée à l’opérateur, la validation est immédiate.</NoteM> : null}
      </Corps>
      <Bas sansBord>
        <Button title="Je n'ai rien reçu" variant="secondary" block onPress={() => void demander()} />
        <LienM titre="Changer de moyen de paiement" onPress={() => router.replace("/paiement")} />
      </Bas>
    </Ecran>
  )
}
