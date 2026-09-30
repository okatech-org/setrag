"use client"

import { LuggageIcon, RouteIcon, TicketIcon, TrainFrontIcon } from "lucide-react"

import { SigneRuban } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { useRequeteMedia } from "@/hooks/use-maintenant"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

import { useRuban } from "./contexte-ruban"
import { Fil } from "./fil"
import { Saisie } from "./saisie"
import { BarreVocale, EcranVocal } from "./vocal"
import { useSessionVocale } from "./voix/use-session-vocale"

const RACCOURCIS = [
  { icone: TrainFrontIcon, libelle: "Réserver un trajet", message: "Je voudrais réserver un trajet." },
  { icone: RouteIcon, libelle: "Suivre mon train", message: "Mon train est-il à l'heure ?" },
  { icone: TicketIcon, libelle: "Retrouver mes billets", message: "Je voudrais retrouver mes billets." },
  { icone: LuggageIcon, libelle: "Bagages et colis", message: "Comment voyager avec des bagages ou envoyer un colis ?" },
]

/** L'accueil d'une conversation vide : une question, quatre raccourcis. */
function Accueil() {
  const { envoyer, reflechit } = useRuban()
  const { profile } = useTravelerAuth()
  const prenom = profile?.user.firstName
  return (
    <div className="grid gap-3 pb-2">
      <h2 className="text-[22px] leading-[1.2] font-bold">{prenom ? `Bonjour ${prenom}, que puis-je faire ?` : "Bonjour, que puis-je faire ?"}</h2>
      <p className="text-small text-ink-muted">Je cherche un train, je réserve et je vous guide jusqu&apos;au paiement. Écrivez-moi, ou parlez-moi.</p>
      <div className="grid grid-cols-2 gap-2">
        {RACCOURCIS.map(({ icone: Icone, libelle, message }) => (
          <button
            key={libelle}
            type="button"
            disabled={reflechit}
            onClick={() => void envoyer(message)}
            className="grid min-h-16 content-center justify-items-start gap-0.5 rounded-[16px] border border-line bg-surface px-3.5 py-2.5 text-left text-[14px] font-semibold transition-colors hover:border-accent-line"
          >
            <Icone className="size-[18px] text-accent-ink" aria-hidden />
            {libelle}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Ruban hors réseau, ou pas encore configuré : il le dit, sans faux bouton. */
function Indisponible({ horsLigne }: { horsLigne: boolean }) {
  return (
    <div className="grid justify-items-center gap-2.5 px-3 py-6 text-center">
      <SigneRuban etat="hors-ligne" className="h-[72px] w-auto" />
      <b className="text-[17px]">{horsLigne ? "Ruban a besoin du réseau" : "Ruban arrive bientôt"}</b>
      <p className="max-w-[30ch] text-small text-ink-muted">
        {horsLigne ? "Vos billets restent consultables dans l'onglet Billets." : "L'assistant n'est pas encore activé sur ce site. Toutes les réservations restent possibles depuis les pages."}
      </p>
    </div>
  )
}

/**
 * Une conversation avec Ruban : le fil, puis la saisie — ou la barre vocale.
 * La même pour la fenêtre flottante, la feuille mobile et la page /assistant.
 */
export function Conversation({
  className,
  autoFocus,
  saisieClassName,
}: {
  className?: string
  autoFocus?: boolean
  /** Sur la page dédiée, la saisie se pose sur le fond, sans bandeau. */
  saisieClassName?: string
}) {
  const { enLigne, disponible } = useRuban()
  const session = useSessionVocale()
  // Sur grand écran, la barre vocale suffit : la fenêtre modale plein écran
  // n'est montée que sur mobile, sans quoi elle rendrait la page inerte.
  const grandEcran = useRequeteMedia("(min-width: 768px)", true)
  const inactif = !enLigne || disponible === false

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <Fil accueil={inactif ? <Indisponible horsLigne={!enLigne} /> : <Accueil />} />
      {session.actif ? <BarreVocale session={session} /> : <Saisie autoFocus={autoFocus} className={saisieClassName} onVoix={() => void session.demarrer()} />}
      {session.erreur && !session.actif && (
        <p role="alert" className="border-t border-line bg-surface px-4 py-2 text-center text-[13px] font-medium text-danger-ink">
          {session.erreur}
        </p>
      )}
      {/* Plein écran vocal sur mobile : une fenêtre modale à part entière
          (voir EcranVocal), masquée sur grand écran où la barre vocale suffit. */}
      {session.actif && !grandEcran && <EcranVocal session={session} onEcrire={() => undefined} />}
    </div>
  )
}
