"use client"

import { KeyboardIcon, MicIcon, MicOffIcon, XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { SigneRuban, type SigneEtat } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { LimiteErreur } from "@/fonctionnalites/tunnel/limite-erreur"

import { CarteApprobation } from "./cartes"
import { useRuban } from "./contexte-ruban"
import type { EtatVocal, useSessionVocale } from "./voix/use-session-vocale"

type Session = ReturnType<typeof useSessionVocale>

const LIBELLES: Record<EtatVocal, string> = {
  inactif: "",
  connexion: "Connexion…",
  ecoute: "Je vous écoute",
  reflexion: "Je cherche",
  parole: "Ruban répond",
  erreur: "Voix indisponible",
}

function etatSigne(etat: EtatVocal): SigneEtat {
  if (etat === "ecoute") return "ecoute"
  if (etat === "parole") return "parole"
  if (etat === "reflexion" || etat === "connexion") return "reflexion"
  return "repos"
}

/**
 * Sur grand écran, la barre de saisie devient une barre vocale ; les cartes
 * restent à confirmer d'un clic dans le fil.
 */
export function BarreVocale({ session }: { session: Session }) {
  const texte =
    session.etat === "parole"
      ? "Ruban vous répond… parlez pour l'interrompre."
      : session.transcriptionMoi ||
        (session.etat === "ecoute"
          ? "Je vous écoute. Parlez naturellement."
          : LIBELLES[session.etat])
  return (
    <div className="grid gap-2 border-t border-line bg-surface px-3 pt-2.5 pb-3">
      <div className="flex min-h-[58px] items-center gap-3 rounded-[29px] bg-brand-encre pr-2 pl-3 text-white dark:bg-[oklch(0.3_0.03_257)]">
        <SigneRuban
          etat={etatSigne(session.etat)}
          niveau={session.niveau}
          fond="sombre"
          className="h-[30px] w-auto shrink-0"
        />
        <p
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-[14px] font-medium text-white/85"
        >
          {texte}
        </p>
        <button
          type="button"
          onClick={session.basculerMicro}
          aria-pressed={session.micCoupe}
          aria-label={
            session.micCoupe ? "Rétablir le micro" : "Couper le micro"
          }
          className="grid size-11 place-items-center rounded-pill bg-white/12 text-white"
        >
          {session.micCoupe ? (
            <MicOffIcon className="size-5" />
          ) : (
            <MicIcon className="size-5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void session.arreter()}
          aria-label="Terminer la conversation à voix haute"
          className="grid size-11 place-items-center rounded-pill bg-danger text-white"
        >
          <XIcon className="size-5" />
        </button>
      </div>
      <p className="text-center text-[11.5px] font-medium text-ink-faint">
        L&apos;audio n&apos;est pas enregistré. Ruban ne vous demandera jamais
        votre code secret.
      </p>
    </div>
  )
}

/**
 * Sur mobile, la conversation à voix haute prend tout l'écran : le grand
 * signe suit la voix, vos mots s'écrivent, la carte à confirmer reste à
 * portée du pouce.
 */
export function EcranVocal({
  session,
  onEcrire,
}: {
  session: Session
  onEcrire: () => void
}) {
  const { entrees } = useRuban()
  const derniere = [...entrees].reverse().find((e) => e.role === "ruban")
  const aConfirmer =
    derniere?.role === "ruban"
      ? derniere.approbations.find(
          (a) =>
            a.etat === "ouverte" || a.etat === "en-cours" || a.etat === "echec"
        )
      : undefined
  const reponse =
    session.transcriptionRuban ||
    (derniere?.role === "ruban" && derniere.vocal ? derniere.texte : "")

  return (
    // Une vraie fenêtre modale (focus piégé, reste de la page inerte), même
    // sur /assistant où elle n'est pas dans la feuille de Ruban.
    <DialogPrimitive.Root
      open
      modal
      onOpenChange={(ouvert) => !ouvert && void session.arreter()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-theme="dark"
          className="pt-safe fixed inset-0 z-[80] flex flex-col bg-[radial-gradient(120%_70%_at_50%_34%,oklch(0.3_0.05_257),var(--brand-encre)_70%)] text-white outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Conversation à voix haute avec Ruban
          </DialogPrimitive.Title>
          <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-6 pt-6">
            <span className="flex items-center gap-2 text-[12px] font-bold tracking-[0.1em] text-[oklch(0.82_0.1_257)] uppercase">
              {LIBELLES[session.etat]}
            </span>
            <SigneRuban
              etat={etatSigne(session.etat)}
              niveau={session.niveau}
              fond="sombre"
              className={cn(
                "w-auto transition-[height] duration-[var(--dur-slow)]",
                aConfirmer ? "h-[86px]" : "h-[160px]",
                "mt-3"
              )}
            />
            {session.transcriptionMoi && (
              <p
                className="text-center text-[23px] leading-[1.35] font-semibold tracking-[-0.005em]"
                aria-live="polite"
              >
                {session.transcriptionMoi}
              </p>
            )}
            {reponse && !session.transcriptionMoi && (
              <p
                className="text-center text-[17px] leading-[1.45] font-medium text-[oklch(0.9_0.02_257)]"
                aria-live="polite"
              >
                {reponse}
              </p>
            )}
            {session.erreur && (
              <p className="text-center text-[15px] font-medium text-[oklch(0.9_0.08_25)]">
                {session.erreur}
              </p>
            )}
            {aConfirmer && (
              <div
                data-theme="light"
                className="w-full rounded-[20px] bg-canvas p-3 text-ink shadow-[0_8px_30px_oklch(0_0_0/0.35)]"
              >
                {/* Comme dans le fil : une lecture refusée ne fait pas tomber l'application. */}
                <LimiteErreur
                  key={aConfirmer.callId}
                  secours={() => (
                    <p className="text-small font-medium text-ink-muted">
                      Cette action n&apos;a pas pu s&apos;afficher.
                    </p>
                  )}
                >
                  <CarteApprobation approbation={aConfirmer} principale />
                </LimiteErreur>
              </div>
            )}
          </div>
          <div className="pb-safe flex shrink-0 items-center justify-center gap-6 pt-4">
            <div className="flex items-center gap-6 pb-8">
              <button
                type="button"
                onClick={session.basculerMicro}
                aria-pressed={session.micCoupe}
                aria-label={
                  session.micCoupe ? "Rétablir le micro" : "Couper le micro"
                }
                className="grid size-[60px] place-items-center rounded-pill bg-white/12"
              >
                {session.micCoupe ? (
                  <MicOffIcon className="size-6" />
                ) : (
                  <MicIcon className="size-6" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  void session.arreter()
                  onEcrire()
                }}
                aria-label="Écrire plutôt que parler"
                className="grid size-[60px] place-items-center rounded-pill bg-white/12"
              >
                <KeyboardIcon className="size-6" />
              </button>
              <button
                type="button"
                onClick={() => void session.arreter()}
                aria-label="Terminer"
                className="grid size-[60px] place-items-center rounded-pill bg-danger"
              >
                <XIcon className="size-6" />
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
