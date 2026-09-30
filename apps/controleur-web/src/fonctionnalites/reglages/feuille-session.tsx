"use client"

import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"

import { TERRAIN } from "@/composants/boutons"
import { Ligne, Liste } from "@/composants/liste"
import { Message } from "@/composants/message"
import { jourHeure } from "@/lib/format"

import { useSessionControle } from "../session/garde-session"
import { useTerminal } from "../terminal/contexte-terminal"

const ROLES: Record<string, string> = {
  controleur_train: "Contrôleur",
  chef_gare: "Chef de gare",
  chef_train: "Chef de train",
}

/**
 * La session du terminal : qui l'a ouverte, quand, et comment la fermer.
 * Un matricule, jamais une adresse : le terminal peut se perdre.
 */
export function FeuilleSession({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { matricule, role, ouverteLe, fermer, fermeture } = useSessionControle()
  const { settings, queue } = useTerminal()
  return (
    <Feuille
      open={open}
      onOpenChange={onOpenChange}
      titre="Session du terminal"
      description="Ouverte en gare, elle vaut pour toute la tournée."
      pied={
        <Button
          variant="danger"
          size="lg"
          block
          className={TERRAIN}
          loading={fermeture}
          loadingLabel="Fermeture…"
          onClick={() => void fermer()}
        >
          Fermer la session
        </Button>
      }
    >
      <div className="grid gap-3 pb-2">
        <Liste>
          <Ligne libelle="Matricule" fin={<span className="tabular text-ink">{matricule}</span>} />
          <Ligne libelle="Rôle" fin={role ? (ROLES[role] ?? role) : "—"} />
          <Ligne
            libelle="Session ouverte"
            fin={<span className="tabular">{ouverteLe ? jourHeure(ouverteLe) : "—"}</span>}
          />
          <Ligne libelle="Terminal" fin={<span className="tabular">{settings.deviceId}</span>} />
        </Liste>
        {queue.total > 0 && (
          <Message ton="alerte" titre={`${queue.total} écritures attendent l'envoi.`}>
            Elles restent sur ce terminal et partiront à la prochaine session
            ouverte avec du réseau.
          </Message>
        )}
        <Message ton="info" titre="Fermer, c'est rendre le terminal.">
          Sans session, la reprise hors réseau n&apos;est plus possible : il
          faudra en rouvrir une en gare, avec le réseau.
        </Message>
      </div>
    </Feuille>
  )
}
