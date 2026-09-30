"use client"

import { toast } from "sonner"

import { ChoixGare } from "@/composants/choix-gare"
import { useMaintenant } from "@/hooks/use-maintenant"
import { deGare, heure } from "@/lib/format"
import type { EmbarkedManifest, EmbarkedStop } from "@/lib/offline/types"
import {
  arretDeRang,
  arretsOrdonnes,
  avancementPropose,
  gareProposee,
  heurePassage,
} from "@/lib/position"
import { leTrain } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"

/** « après Booué », ou « au départ d'Owendo Virié » tant que le train est à quai. */
export function libelleGare(
  arret: EmbarkedStop | undefined,
  premiere: boolean
): string {
  if (!arret) return "position inconnue"
  return premiere ? `au départ ${deGare(arret.name)}` : `après ${arret.name}`
}

/**
 * La gare que l'horaire propose, si elle est au-delà de la gare confirmée.
 * Rien n'avance sans l'agent : c'est une proposition, confirmée d'un geste.
 */
export function usePropositionGare(manifest: EmbarkedManifest | null) {
  const { settings } = useTerminal()
  const maintenant = useMaintenant(60_000)
  if (!manifest || maintenant === null) return undefined
  return avancementPropose(manifest, settings.currentStopIndex, maintenant)
}

/**
 * Dernière gare atteinte : la gare se choisit sur la voie, comme dans la
 * billetterie. Le terminal désigne celle de l'horaire ; l'agent confirme.
 */
export function FeuilleGareAtteinte({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { manifest, settings, confirmStop } = useTerminal()
  const maintenant = useMaintenant(60_000)
  if (!manifest) return null

  const arrets = arretsOrdonnes(manifest)
  const premiere = arrets[0]?.sequence
  const proposee =
    maintenant === null ? undefined : gareProposee(manifest, maintenant)
  const passage = proposee ? heurePassage(proposee) : undefined
  const courante = arretDeRang(manifest, settings.currentStopIndex)
  const designee =
    proposee && proposee.sequence > settings.currentStopIndex
      ? proposee
      : courante

  return (
    <ChoixGare
      open={open}
      onOpenChange={onOpenChange}
      titre="Dernière gare atteinte"
      description={
        proposee && passage !== undefined && proposee.sequence !== premiere
          ? `D'après l'horaire embarqué, ${leTrain(manifest)} est passé à ${proposee.name} à ${heure(passage)}. Confirmez : la portée des titres se vérifie à partir de cette gare.`
          : "La portée des titres se vérifie à partir de la dernière gare atteinte. Choisissez-la sur la voie, puis confirmez."
      }
      arrets={arrets}
      valeur={designee?.sequence}
      confirmer={(arret) =>
        `Confirmer : ${libelleGare(arret, arret.sequence === premiere)}`
      }
      onChoisir={(arret) => {
        void confirmStop(arret.sequence).then(() =>
          toast.success(
            `Position confirmée : ${libelleGare(arret, arret.sequence === premiere)}.`
          )
        )
      }}
    />
  )
}
