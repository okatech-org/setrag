import { useCallback, useEffect, useState } from "react"
import { Alert, BackHandler, View } from "react-native"
import { router, useFocusEffect } from "expo-router"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { CreditCard } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { CURRENT_CGV_VERSION } from "@workspace/backend/cgv"
import { Button, Field, Input, useTheme } from "@workspace/mobile-ui/components"

import { Etapes, MarquePaiement, OptionRadio } from "@/components/achat"
import { Bas, BarreApp, Corps, Ecran, Erreur, LienM, NoteM, Total } from "@/components/ecran"
import { BandeauTenue, EtatVide } from "@/components/elements"
import { messageErreur, normaliserTelephone, rebours, telephone, xaf } from "@/lib/format"
import { PAIEMENT_SIMULE, useJourney, type MoyenPaiement } from "@/lib/journey"
import { useReglages } from "@/lib/reglages"
import { classeLongue, useMaintenant } from "@/lib/voyage"

const MOBILE_MONEY: MoyenPaiement[] = ["airtel_money", "moov_money"]

export default function Paiement() {
  const theme = useTheme()
  const { isAuthenticated } = useConvexAuth()
  const { tenue, setTenue, setPaiement } = useJourney()
  const { moyenPrefere, choisirMoyen } = useReglages()
  const profil = useQuery(api.functions.customers.me, isAuthenticated ? {} : "skip")
  const dossier = useQuery(api.functions.bookings.getByReference, tenue ? { reference: tenue.reference, contactPhone: tenue.telephoneContact } : "skip")
  const confirmer = useMutation(api.functions.bookings.confirm)
  const annuler = useMutation(api.functions.bookings.cancelHold)
  const maintenant = useMaintenant()

  const [moyen, setMoyen] = useState<MoyenPaiement>(moyenPrefere?.moyen ?? "airtel_money")
  const [carte, setCarte] = useState<"visa" | "mastercard">(moyenPrefere?.carte ?? "visa")
  // Le numéro proposé suit le profil quand il arrive, tant que rien n'a été saisi.
  const [numeroSaisi, setNumero] = useState<string | null>(null)
  const numeroPropose = [moyenPrefere?.numero, profil?.user.phone, tenue?.telephoneContact].find((candidat) => candidat && normaliserTelephone(candidat))
  const numero = numeroSaisi ?? (numeroPropose ? telephone(normaliserTelephone(numeroPropose)!) : "")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")

  const quitter = useCallback(() => {
    Alert.alert("Annuler la réservation ?", "Vos places seront remises en vente.", [
      { text: "Garder mes places", style: "cancel" },
      {
        text: "Annuler la réservation",
        style: "destructive",
        onPress: () => {
          if (!tenue) return
          void annuler({ reference: tenue.reference, contactPhone: tenue.telephoneContact }).catch(() => undefined)
          setTenue(null)
          router.back()
        },
      },
    ])
  }, [annuler, tenue, setTenue])

  // Retour Android : même question que le chevron.
  useFocusEffect(
    useCallback(() => {
      const abonnement = BackHandler.addEventListener("hardwareBackPress", () => {
        quitter()
        return true
      })
      return () => abonnement.remove()
    }, [quitter]),
  )

  // Dossier déjà payé (app relancée entre le paiement et l'émission) : on montre les billets.
  useEffect(() => {
    if (dossier?.sale.status === "confirmee") router.replace("/confirmation")
  }, [dossier?.sale.status])

  if (!tenue) {
    return (
      <Ecran>
        <BarreApp titre="Paiement" />
        <EtatVide titre="Aucune réservation en cours" texte="Choisissez un train pour réserver vos places." action={<Button title="Chercher un train" onPress={() => router.replace("/")} />} />
      </Ecran>
    )
  }

  const expireAt = dossier?.sale.priceLockedUntil ?? tenue.expireAt
  const reste = expireAt - maintenant
  const expiree = reste <= 0 || dossier?.sale.status === "expiree" || dossier?.sale.status === "annulee"
  const total = dossier?.sale.amounts.ttc ?? tenue.totalTtc

  async function payer() {
    if (!tenue) return
    const mobileMoney = MOBILE_MONEY.includes(moyen)
    const payeur = mobileMoney ? normaliserTelephone(numero) : null
    if (mobileMoney && !payeur) {
      setErreur(`Indiquez le numéro ${moyen === "airtel_money" ? "Airtel" : "Moov"} Money à débiter, 8 chiffres.`)
      return
    }
    setErreur("")
    void choisirMoyen({ moyen, numero: payeur ?? moyenPrefere?.numero, carte })
    if (mobileMoney) {
      // La demande part de l'écran d'attente : c'est lui qui dit qu'on attend le voyageur.
      setPaiement({ moyen, numero: payeur! })
      router.replace("/paiement/attente")
      return
    }
    setEnCours(true)
    try {
      await confirmer({
        reference: tenue.reference,
        contactPhone: tenue.telephoneContact,
        method: moyen === "carte" ? carte : "clickpay",
        cgvVersion: CURRENT_CGV_VERSION,
      })
      router.replace("/confirmation")
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnCours(false)
    }
  }

  if (expiree) {
    return (
      <Ecran>
        <BarreApp titre="Paiement" />
        <EtatVide
          titre="Le délai est passé"
          texte="Vos places n'étaient tenues que 15 minutes ; elles sont de nouveau en vente. Relancez la recherche pour réserver."
          action={
            <Button
              title="Chercher un train"
              onPress={() => {
                setTenue(null)
                router.replace("/")
              }}
            />
          }
        />
      </Ecran>
    )
  }

  const champNumero = (libelle: string) => (
    <View style={{ paddingHorizontal: 2 }}>
      <Field label={libelle}>
        <Input value={numero} onChangeText={setNumero} keyboardType="phone-pad" autoComplete="tel" placeholder="+241 77 12 34 56" />
      </Field>
    </View>
  )

  return (
    <Ecran>
      <BarreApp titre="Paiement" sousTitre="Étape 3 sur 4" onRetour={quitter} />
      <Corps>
        <Etapes courante={2} />
        <BandeauTenue libelle="Vos places sont tenues encore" reste={rebours(reste)} />
        <View accessibilityRole="radiogroup" accessibilityLabel="Moyen de paiement" style={{ gap: 8 }}>
          <OptionRadio
            coche={moyen === "airtel_money"}
            titre="Airtel Money"
            precision="Validation sur votre téléphone"
            droite={<MarquePaiement>AIRTEL</MarquePaiement>}
            onPress={() => setMoyen("airtel_money")}
          />
          {moyen === "airtel_money" ? champNumero("Numéro Airtel Money") : null}
          <OptionRadio
            coche={moyen === "moov_money"}
            titre="Moov Money"
            precision={moyen === "moov_money" ? "Validation sur votre téléphone" : undefined}
            droite={<MarquePaiement>MOOV</MarquePaiement>}
            onPress={() => setMoyen("moov_money")}
          />
          {moyen === "moov_money" ? champNumero("Numéro Moov Money") : null}
          <OptionRadio
            coche={moyen === "carte"}
            titre="Carte bancaire"
            precision="Visa, Mastercard"
            droite={
              <MarquePaiement>
                <CreditCard size={18} color={theme.colors.inkMuted} />
              </MarquePaiement>
            }
            onPress={() => setMoyen("carte")}
          />
          {moyen === "carte" ? (
            <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Réseau de la carte">
              {(["visa", "mastercard"] as const).map((reseau) => (
                <View key={reseau} style={{ flex: 1 }}>
                  <OptionRadio coche={carte === reseau} titre={reseau === "visa" ? "Visa" : "Mastercard"} hauteurMin={48} onPress={() => setCarte(reseau)} />
                </View>
              ))}
            </View>
          ) : null}
          <OptionRadio coche={moyen === "clickpay"} titre="Click-Pay" droite={<MarquePaiement>CLICK</MarquePaiement>} onPress={() => setMoyen("clickpay")} />
        </View>
        {PAIEMENT_SIMULE ? <NoteM>Paiement simulé : aucun montant n’est débité pour l’instant.</NoteM> : null}
        <Erreur>{erreur}</Erreur>
      </Corps>
      <Bas>
        <Total libelle={`${tenue.billets} billet${tenue.billets > 1 ? "s" : ""} · ${classeLongue(tenue.classe)}`} valeur={xaf(total)} />
        <Button title={`Payer ${xaf(total)}`} size="lg" block loading={enCours} onPress={() => void payer()} />
        <LienM titre="En payant, vous acceptez les conditions de vente" onPress={() => router.push("/conditions")} couleur={theme.colors.inkMuted} />
      </Bas>
    </Ecran>
  )
}
