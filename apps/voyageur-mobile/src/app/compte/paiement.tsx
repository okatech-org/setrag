import { useState } from "react"
import { View } from "react-native"
import { router } from "expo-router"
import { CreditCard } from "lucide-react-native"

import { Button, Field, Input, useTheme } from "@workspace/mobile-ui/components"

import { MarquePaiement, OptionRadio } from "@/components/achat"
import { Bas, BarreApp, Corps, Ecran, Erreur, NoteM } from "@/components/ecran"
import { normaliserTelephone, telephone } from "@/lib/format"
import type { MoyenPaiement } from "@/lib/journey"
import { useReglages } from "@/lib/reglages"

/** Moyen de paiement préféré : proposé d'office au paiement, gardé sur ce téléphone. */
export default function MoyensDePaiement() {
  const theme = useTheme()
  const { moyenPrefere, choisirMoyen } = useReglages()
  const [moyen, setMoyen] = useState<MoyenPaiement>(moyenPrefere?.moyen ?? "airtel_money")
  const [numero, setNumero] = useState(telephone(moyenPrefere?.numero ?? ""))
  const [carte, setCarte] = useState<"visa" | "mastercard">(moyenPrefere?.carte ?? "visa")
  const [erreur, setErreur] = useState("")
  const mobileMoney = moyen === "airtel_money" || moyen === "moov_money"

  async function enregistrer() {
    const normalise = numero.trim() ? normaliserTelephone(numero) : null
    if (mobileMoney && numero.trim() && !normalise) return setErreur("Le numéro doit compter 8 chiffres.")
    await choisirMoyen({ moyen, numero: normalise ?? undefined, carte })
    router.back()
  }

  return (
    <Ecran>
      <BarreApp titre="Moyens de paiement" />
      <Corps>
        <View accessibilityRole="radiogroup" accessibilityLabel="Moyen préféré" style={{ gap: 8 }}>
          <OptionRadio coche={moyen === "airtel_money"} titre="Airtel Money" droite={<MarquePaiement>AIRTEL</MarquePaiement>} onPress={() => setMoyen("airtel_money")} />
          <OptionRadio coche={moyen === "moov_money"} titre="Moov Money" droite={<MarquePaiement>MOOV</MarquePaiement>} onPress={() => setMoyen("moov_money")} />
          {mobileMoney ? (
            <Field label={`Numéro ${moyen === "airtel_money" ? "Airtel" : "Moov"} Money`}>
              <Input value={numero} onChangeText={setNumero} keyboardType="phone-pad" placeholder="+241 77 12 34 56" />
            </Field>
          ) : null}
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
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["visa", "mastercard"] as const).map((reseau) => (
                <View key={reseau} style={{ flex: 1 }}>
                  <OptionRadio coche={carte === reseau} titre={reseau === "visa" ? "Visa" : "Mastercard"} hauteurMin={48} onPress={() => setCarte(reseau)} />
                </View>
              ))}
            </View>
          ) : null}
          <OptionRadio coche={moyen === "clickpay"} titre="Click-Pay" droite={<MarquePaiement>CLICK</MarquePaiement>} onPress={() => setMoyen("clickpay")} />
        </View>
        <NoteM>Ce choix reste sur ce téléphone : SETRAG n’enregistre aucun numéro de carte.</NoteM>
        <Erreur>{erreur}</Erreur>
      </Corps>
      <Bas>
        <Button title="Enregistrer" size="lg" block onPress={() => void enregistrer()} />
      </Bas>
    </Ecran>
  )
}
