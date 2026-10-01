import { useState } from "react"
import { Alert, Share, View } from "react-native"
import { useConvex, useMutation, useQuery } from "convex/react"
import { Download } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button, Field, Input, Text, useTheme } from "@workspace/mobile-ui/components"
import { fonts } from "@workspace/mobile-ui/tokens"

import { BarreApp, Corps, Ecran, Erreur, Etiquette } from "@/components/ecran"
import { Carte, Liste, Ligne } from "@/components/elements"
import { typo } from "@/components/typo"
import { useBookings } from "@/lib/bookings-cache"
import { messageErreur } from "@/lib/format"
import { useSeDeconnecter } from "@/lib/session"
import { useCompte } from "@/lib/compte"

/** Mes données : accord commercial, export, suppression du compte. */
export default function Donnees() {
  const theme = useTheme()
  const convex = useConvex()
  const { actif } = useCompte()
  const consentements = useQuery(api.functions.customers.listConsents, actif ? {} : "skip")
  const consentir = useMutation(api.functions.customers.grantConsent)
  const retirer = useMutation(api.functions.customers.revokeConsent)
  const supprimerCompte = useMutation(api.functions.customers.deleteMyAccount)
  const { clear } = useBookings()
  const seDeconnecter = useSeDeconnecter()
  const [confirmation, setConfirmation] = useState("")
  const [erreur, setErreur] = useState("")
  const offres = consentements?.some((item) => item.type === "marketing" && item.revokedAt === undefined) ?? false

  async function exporter() {
    try {
      const donnees = await convex.query(api.functions.customers.exportMyData, {})
      await Share.share({ title: "Mes données SETRAG", message: JSON.stringify(donnees, null, 2) })
    } catch (cause) {
      setErreur(messageErreur(cause))
    }
  }

  function supprimer() {
    Alert.alert("Supprimer votre compte ?", "Votre profil, vos voyageurs et les souvenirs de Ruban sont effacés, ainsi que les billets enregistrés sur ce téléphone. Les billets payés restent valables : gardez leur référence pour les retrouver.", [
      { text: "Garder mon compte", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () =>
          void supprimerCompte({ confirmation })
            .then(async () => {
              await clear()
              await seDeconnecter()
            })
            .catch((cause) => setErreur(messageErreur(cause))),
      },
    ])
  }

  return (
    <Ecran>
      <BarreApp titre="Mes données" />
      <Corps>
        <Etiquette>Consentements</Etiquette>
        <Liste>
          <Ligne
            libelle="Offres et nouveautés"
            precision="Vous pouvez retirer cet accord à tout moment."
            interrupteur={{
              valeur: offres,
              desactive: consentements === undefined,
              onChange: (actif) => void (actif ? consentir({ type: "marketing", channel: "mobile" }) : retirer({ type: "marketing" })).catch((cause) => setErreur(messageErreur(cause))),
            }}
          />
        </Liste>

        <Etiquette>Vos données</Etiquette>
        <Liste>
          <Ligne icone={Download} libelle="Exporter mes données" precision="Profil, billets, consentements et échanges avec Ruban" onPress={() => void exporter()} />
        </Liste>

        <Etiquette>Supprimer le compte</Etiquette>
        <Carte style={{ padding: 16, gap: 12 }}>
          <Text style={[typo.sous, { color: theme.colors.inkMuted }]}>
            Cette action est définitive. Les ventes restent conservées pour la comptabilité, sans votre nom.
          </Text>
          <Field label="Écrivez SUPPRIMER pour confirmer">
            <Input value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} />
          </Field>
          <View>
            <Button title="Supprimer mon compte" variant="danger" block disabled={confirmation !== "SUPPRIMER"} onPress={supprimer} />
          </View>
        </Carte>
        <Erreur>{erreur}</Erreur>
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.colors.inkFaint }}>
          Données traitées conformément à la loi gabonaise sur la protection des données personnelles (APDPVP).
        </Text>
      </Corps>
    </Ecran>
  )
}
