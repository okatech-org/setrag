"use client"

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
export function BandeauHorsLigne({
  recuLe,
  enLigne,
  objet = "Ces informations",
}: {
  recuLe: number | null
  enLigne: boolean
  /** Sujet de la phrase, pour l'accorder à l'écran : billets, parcours… */
  objet?: string
}) {
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
