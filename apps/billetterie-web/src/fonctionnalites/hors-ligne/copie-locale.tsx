"use client"

import * as React from "react"

import { InlineMessage } from "@workspace/ui/components/inline-message"

const instantFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/**
 * Date à laquelle remontent les informations affichées.
 *
 * Toujours en clair, jamais en « il y a un moment » : sur un quai, l'écart
 * entre un horaire relevé il y a dix minutes et un horaire de la veille change
 * la décision du voyageur, et lui seul peut en juger.
 */
export function dateDeReception(recuLe: number | null): string {
  if (recuLe === null) return "date inconnue"
  return instantFormatter.format(new Date(recuLe))
}

/**
 * Signale que ce qui est affiché vient de l'appareil, et non du serveur.
 *
 * Le bandeau ne s'excuse pas d'être hors réseau : il donne l'information qui
 * manque à la lecture des données, leur âge. Un billet reste valable sans
 * réseau — son code a été émis à l'achat — mais un horaire, lui, a pu bouger.
 */
/**
 * Délai avant d'alerter un appareil qui se croit connecté.
 *
 * En ligne, la copie locale s'affiche d'abord, le temps que le serveur
 * réponde : c'est voulu, l'écran est utile tout de suite. Avertir dans cet
 * intervalle ferait clignoter une alerte à chaque ouverture, et un signal qui
 * se déclenche sans raison cesse d'être lu. Passé ce délai en revanche, le
 * silence du serveur n'est plus une latence — antenne saturée, portail
 * captif — et le voyageur doit savoir qu'il lit une copie.
 */
const DELAI_ALERTE_MS = 2_500

export function AvisCopieLocale({
  recuLe,
  enLigne,
  objet = "Ces informations",
}: {
  recuLe: number | null
  enLigne: boolean
  /** Sujet de la phrase, pour l'accorder à l'écran : billets, parcours… */
  objet?: string
}) {
  const [attenteEcoulee, setAttenteEcoulee] = React.useState(false)

  React.useEffect(() => {
    if (!enLigne) return
    const timer = window.setTimeout(
      () => setAttenteEcoulee(true),
      DELAI_ALERTE_MS
    )
    return () => window.clearTimeout(timer)
  }, [enLigne])

  // Hors réseau, l'information est immédiate : le voyageur sait déjà qu'il ne
  // reçoit rien, il lui manque seulement la date de ce qu'il regarde.
  if (enLigne && !attenteEcoulee) return null

  return (
    <InlineMessage
      tone="warning"
      title={
        enLigne
          ? "Affichage depuis cet appareil, le serveur n’a pas encore répondu."
          : "Vous êtes hors réseau."
      }
    >
      {objet} datent du {dateDeReception(recuLe)}. Votre billet reste valable :
      son code a été émis à l’achat et le contrôleur le vérifie sans réseau.
    </InlineMessage>
  )
}
