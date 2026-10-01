import { useState } from "react"
import { Linking } from "react-native"
import { useAction, useMutation, useQuery } from "convex/react"
import { MessageSquare } from "lucide-react-native"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/mobile-ui/components"

import { Bas, BarreApp, Corps, Ecran, Erreur, Etiquette, SousTitre } from "@/components/ecran"
import { EtatVide, Liste, Ligne } from "@/components/elements"
import { messageErreur } from "@/lib/format"
import { useCompte } from "@/lib/compte"

/** Parler avec Ruban depuis Telegram : un lien à usage unique relie le compte. */
export default function Messageries() {
  const { actif } = useCompte()
  const reliees = useQuery(api.messaging.linking.listMine, actif ? {} : "skip")
  const preparer = useAction(api.messaging.linking.startFromSite)
  const delier = useMutation(api.messaging.linking.unlink)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")

  async function relier() {
    setEnCours(true)
    setErreur("")
    try {
      const lien = await preparer({ canal: "telegram" })
      if (!lien.disponible) return setErreur("Telegram n'est pas encore disponible.")
      await Linking.openURL(lien.url)
    } catch (cause) {
      setErreur(messageErreur(cause))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Ecran>
      <BarreApp titre="Messageries reliées" />
      <Corps>
        <SousTitre>Écrivez à Ruban depuis Telegram : il retrouve vos billets et vos voyageurs.</SousTitre>
        {reliees?.length ? (
          <>
            <Etiquette>Reliées</Etiquette>
            <Liste>
              {reliees.map((item) => (
                <Ligne
                  key={item.identityId}
                  icone={MessageSquare}
                  libelle={item.canal === "telegram" ? "Telegram" : item.canal}
                  precision={item.nomAffiche ?? "Compte relié"}
                  valeur="Délier"
                  onPress={() => void delier({ identityId: item.identityId }).catch((cause) => setErreur(messageErreur(cause)))}
                />
              ))}
            </Liste>
          </>
        ) : reliees ? (
          <EtatVide titre="Aucune messagerie reliée" texte="Le lien s'ouvre dans Telegram, sur ce téléphone. Il ne sert qu'une fois." />
        ) : null}
        <Erreur>{erreur}</Erreur>
      </Corps>
      <Bas>
        <Button title="Relier Telegram" size="lg" block loading={enCours} onPress={() => void relier()} />
      </Bas>
    </Ecran>
  )
}
