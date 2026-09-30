"use client"

import { LogOutIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useNaviguer } from "@/coquille/filet-navigation"
import { useDonneesLocales } from "@/fonctionnalites/hors-ligne/donnees-locales"
import { useOnline } from "@/hooks/use-online"
import { seDeconnecter } from "@/lib/offline/deconnexion"
import { reseauDisponible } from "@/lib/reseau"

import { Ligne } from "./elements"

/**
 * « Se déconnecter », avec sa feuille de confirmation. La déconnexion efface
 * les billets enregistrés sur l'appareil (`seDeconnecter`) : on le dit avant,
 * puisqu'ils sont la seule ressource du voyageur sans réseau.
 */
export function LigneDeconnexion() {
  const naviguer = useNaviguer()
  const enLigne = useOnline()
  const { dossiers } = useDonneesLocales()
  const [ouverte, setOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const nombre = dossiers.length

  async function confirmer() {
    // Sans réseau, la session ne se fermerait pas sur le serveur : les billets
    // effacés reviendraient au retour du réseau, sur un appareil qu'on croyait
    // libéré.
    if (
      !reseauDisponible(
        "Hors réseau : la déconnexion demande du réseau. Rien n'a été effacé."
      )
    )
      return
    setEnCours(true)
    try {
      await seDeconnecter()
      setOuverte(false)
      naviguer("/", { remplacer: true })
      toast(
        nombre > 0
          ? "Vous êtes déconnecté. Les billets de cet appareil sont effacés."
          : "Vous êtes déconnecté."
      )
    } catch {
      toast.error("La déconnexion n'a pas abouti. Réessayez dans un instant.")
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <Ligne
        icone={LogOutIcon}
        libelle="Se déconnecter"
        ton="danger"
        chevron={false}
        onClick={() => setOuverte(true)}
      />
      <Feuille
        open={ouverte}
        onOpenChange={(valeur) => !enCours && setOuverte(valeur)}
        titre="Se déconnecter ?"
        description={
          nombre > 0
            ? "Les billets enregistrés sur cet appareil seront effacés."
            : "Un code suffira pour vous reconnecter."
        }
        pied={
          <div className="grid gap-2 md:flex md:justify-end">
            <Button
              variant="danger"
              loading={enCours}
              loadingLabel="Déconnexion…"
              onClick={() => void confirmer()}
              className="md:order-2"
            >
              Se déconnecter
            </Button>
            <Button
              variant="ghost"
              onClick={() => setOuverte(false)}
              disabled={enCours}
            >
              Annuler
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-[15px] leading-normal">
          {nombre > 0 ? (
            <>
              <p>
                {nombre > 1
                  ? `${nombre} réservations sont enregistrées`
                  : "Une réservation est enregistrée"}{" "}
                sur cet appareil, avec les billets et leurs codes de contrôle.
                Ils portent des noms : on ne les laisse pas sur un téléphone qui
                peut être prêté ou perdu.
              </p>
              <p className="text-ink-muted">
                Vous les retrouverez en vous reconnectant, avec du réseau.
              </p>
            </>
          ) : (
            <p>
              Aucun billet n&apos;est enregistré sur cet appareil : rien ne sera
              effacé.
            </p>
          )}
          {!enLigne && (
            <InlineMessage tone="warning" title="Hors réseau.">
              La déconnexion demande du réseau : elle ferme aussi la session sur
              le serveur. Vos billets restent sur l&apos;appareil d&apos;ici là.
            </InlineMessage>
          )}
        </div>
      </Feuille>
    </>
  )
}
