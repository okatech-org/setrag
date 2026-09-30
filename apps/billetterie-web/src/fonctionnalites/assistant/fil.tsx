"use client"

import { ArrowDownIcon, CircleAlertIcon, MicIcon, RotateCcwIcon } from "lucide-react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { SigneRuban } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { LimiteErreur } from "@/fonctionnalites/tunnel/limite-erreur"
import { useRequeteMedia } from "@/hooks/use-maintenant"

import { CarteApprobation, CarteDuFil } from "./cartes"
import { useRuban } from "./contexte-ruban"
import type { Entree } from "./types"

/** Avatar du signe : un rond encre, le signe au repos (ou en réflexion). */
export function AvatarRuban({ taille = 26, etat = "repos", trace }: { taille?: number; etat?: "repos" | "reflexion" | "parole" | "ecoute" | "hors-ligne"; trace?: boolean }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-pill bg-brand-encre text-white dark:bg-[oklch(0.34_0.03_257)]"
      style={{ width: taille, height: taille }}
    >
      {/* 58 % du diamètre, comme la maquette : le S reste dans le rond. Une
          hauteur en pourcentage se résoudrait mal dans ce conteneur. */}
      <SigneRuban etat={etat} fond="sombre" trace={trace} className="w-auto" style={{ height: Math.round(taille * 0.58) }} />
    </span>
  )
}

/**
 * Un texte de Ruban, en paragraphes, gras et listes simples. Jamais de HTML
 * interprété : ce qui vient du modèle reste du texte.
 */
function TexteRuban({ texte }: { texte: string }) {
  const blocs = texte.split(/\n{2,}/)
  const gras = (ligne: string): ReactNode[] =>
    ligne.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
      morceau.startsWith("**") && morceau.endsWith("**") ? <b key={i}>{morceau.slice(2, -2)}</b> : <Fragment key={i}>{morceau}</Fragment>
    )
  return (
    <>
      {blocs.map((bloc, i) => {
        const lignes = bloc.split("\n")
        if (lignes.every((l) => /^\s*([-•*]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="grid list-disc gap-1 pl-5">
              {lignes.map((l, j) => (
                <li key={j}>{gras(l.replace(/^\s*([-•*]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            {lignes.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {gras(l)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}

/**
 * Vrai quand une réponse en cours ne bouge plus : 400 ms sans premier mot,
 * 700 ms sans nouveau morceau (Ruban consulte un outil). Rien ne s'affiche
 * pour une attente plus courte.
 */
function useAttente(texte: string, enCours: boolean): boolean {
  const [immobile, setImmobile] = useState<string | null>(null)
  useEffect(() => {
    if (!enCours) return
    const minuteur = window.setTimeout(() => setImmobile(texte), texte ? 700 : 400)
    return () => window.clearTimeout(minuteur)
  }, [texte, enCours])
  return enCours && immobile === texte
}

/**
 * Une carte dont la lecture a échoué (requête Convex refusée…). Ruban vit dans
 * la coquille, au-dessus de `error.tsx` : sans ce filet, l'erreur d'une carte
 * remonterait jusqu'à `global-error` et emporterait toute l'application.
 */
function CarteIllisible() {
  return <p className="text-small font-medium text-ink-muted">Cette carte n&apos;a pas pu s&apos;afficher. Retrouvez vos réservations dans l&apos;onglet Billets.</p>
}

/**
 * Une réponse de Ruban. Pendant le flux, le texte affiché est celui que le
 * serveur a réellement reçu, sans effet de frappe ; les cartes et les
 * confirmations montent quand la réponse est terminée. La même entrée passe
 * par tous ces états : rien ne se démonte quand elle grandit ou se termine.
 */
function EntreeRuban({ entree, principale }: { entree: Extract<Entree, { role: "ruban" }>; principale: string | null }) {
  const { renvoyer, reflechit } = useRuban()
  const enCours = entree.etat === "en-cours"
  const attente = useAttente(entree.texte, enCours)
  const question = entree.question ?? (entree.id.startsWith("ruban-") ? entree.id.slice("ruban-".length) : null)
  return (
    <div className="grid grid-cols-[26px_minmax(0,1fr)] items-start gap-2.5">
      <span className="mt-px">
        <AvatarRuban etat={attente ? "reflexion" : "repos"} />
      </span>
      <div className="grid min-w-0 gap-2.5 text-[15px] leading-[1.5]">
        {/* Annoncée une fois complète : tant qu'elle s'écrit, la région est
            « occupée » et les lecteurs d'écran attendent. */}
        {/* Vide (rien reçu encore), elle reste en place pour être annoncée,
            sans décaler « Ruban cherche… » : sa marge annule l'espacement. */}
        <div className="grid gap-2 empty:-mb-2.5" aria-live={entree.direct ? "polite" : undefined} aria-busy={entree.direct ? enCours : undefined}>
          {entree.texte && <TexteRuban texte={entree.texte} />}
        </div>
        {attente && (
          <p role="status" className="text-[14px] font-medium text-ink-muted">
            Ruban cherche…
          </p>
        )}
        {entree.etat === "erreur" && (
          <div className="grid justify-items-start gap-0.5">
            <p role="alert" className="flex items-start gap-1.5 text-[14px] font-medium text-danger-ink">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {entree.erreur ?? "Cette réponse n'a pas abouti."}
            </p>
            {question && (
              <button
                type="button"
                disabled={reflechit}
                onClick={() => void renvoyer(question)}
                className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-accent-ink disabled:opacity-50"
              >
                <RotateCcwIcon className="size-4" aria-hidden />
                Relancer la question
              </button>
            )}
          </div>
        )}
        {!entree.etat && (
          <>
            {entree.cartes.map((carte, i) => (
              <LimiteErreur key={`${carte.type}-${i}`} secours={() => <CarteIllisible />}>
                <CarteDuFil carte={carte} />
              </LimiteErreur>
            ))}
            {entree.approbations.map((approbation) => (
              <LimiteErreur key={approbation.callId} secours={() => <CarteIllisible />}>
                <CarteApprobation approbation={approbation} principale={approbation.callId === principale} />
              </LimiteErreur>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function EntreeMoi({ entree }: { entree: Extract<Entree, { role: "moi" }> }) {
  const { renvoyer } = useRuban()
  return (
    <div className="grid justify-items-end gap-1">
      <p
        className={cn(
          "flex max-w-[84%] gap-2 rounded-[18px_18px_4px_18px] bg-accent-base px-3.5 py-2.5 text-[15px] leading-[1.4] font-medium whitespace-pre-wrap text-ink-inverse",
          entree.envoi === "en-cours" && "opacity-80"
        )}
      >
        {entree.vocal && <MicIcon className="mt-0.5 size-4 shrink-0 opacity-80" aria-label="Dit à voix haute" />}
        {entree.texte}
      </p>
      {entree.envoi === "echec" && (
        <button type="button" onClick={() => void renvoyer(entree.id)} className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-danger-ink">
          <RotateCcwIcon className="size-3.5" aria-hidden />
          Non envoyé — réessayer
        </button>
      )}
    </div>
  )
}

/**
 * Le fil de la conversation, à la manière des assistants actuels : quand le
 * voyageur envoie un message, ce message remonte en haut de la zone visible
 * et la réponse de Ruban se déroule dessous — on la lit depuis son début, sous
 * la question. Le fil ne court pas après la fin du texte ; s'il déborde, un
 * bouton ramène en bas. Un seul bouton principal : celui de la dernière
 * action à confirmer.
 *
 * La liste reste plate et stable (rien ne change de parent, rien ne se
 * remonte) : la réponse existe dès l'envoi, vide, et garde sa clé pendant
 * qu'elle s'écrit, quand elle se termine ou s'interrompt. Une réserve sous le
 * dernier échange, mesurée en direct, permet à la dernière question de monter
 * en haut même quand la réponse est courte ; elle rétrécit à mesure que la
 * réponse s'écrit.
 */
export function Fil({ accueil, className }: { accueil?: ReactNode; className?: string }) {
  const { entrees } = useRuban()
  const conteneur = useRef<HTMLDivElement>(null)
  const contenu = useRef<HTMLDivElement>(null)
  const reserve = useRef<HTMLDivElement>(null)
  const [loinDuBas, setLoinDuBas] = useState(false)
  const moinsDeMouvement = useRequeteMedia("(prefers-reduced-motion: reduce)")

  const principale =
    [...entrees]
      .reverse()
      .flatMap((e) => (e.role === "ruban" ? [...e.approbations].reverse() : []))
      .find((a) => a.etat === "ouverte" || a.etat === "en-cours" || a.etat === "echec")?.callId ?? null

  const indexDernier = entrees.map((e) => e.role).lastIndexOf("moi")
  const idDernierMessage = indexDernier >= 0 ? entrees[indexDernier]!.id : null

  /** Haut de la dernière question, dans le repère du contenu défilant. */
  const hautDerniereQuestion = useCallback(() => {
    const el = conteneur.current
    const question = contenu.current?.querySelector<HTMLElement>("[data-derniere-question]")
    if (!el || !question) return null
    return question.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
  }, [])

  /** Réserve = ce qui manque au dernier échange pour remplir la zone visible. */
  const ajusterReserve = useCallback(() => {
    const el = conteneur.current
    const bloc = contenu.current
    const espace = reserve.current
    if (!el || !bloc || !espace) return
    const haut = hautDerniereQuestion()
    if (haut === null) {
      espace.style.height = "0px"
      return
    }
    const finEchange = bloc.offsetTop + bloc.offsetHeight
    espace.style.height = `${Math.max(0, el.clientHeight - (finEchange - haut) - 12)}px`
  }, [hautDerniereQuestion])

  /** Le bouton « aller en bas » n'apparaît que loin du bas (réserve exclue). */
  const majLoinDuBas = useCallback(() => {
    const el = conteneur.current
    if (!el) return
    const espace = reserve.current?.offsetHeight ?? 0
    setLoinDuBas(el.scrollHeight - espace - el.scrollTop - el.clientHeight > 120)
  }, [])

  // La réponse grandit au fil du flux : la réserve rétrécit d'autant (la
  // question ne bouge pas), et le bouton apparaît dès que la réponse dépasse.
  useEffect(() => {
    const el = conteneur.current
    const bloc = contenu.current
    if (!el || !bloc) return
    const observateur = new ResizeObserver(() => {
      ajusterReserve()
      majLoinDuBas()
    })
    observateur.observe(el)
    observateur.observe(bloc)
    return () => observateur.disconnect()
  }, [ajusterReserve, majLoinDuBas])

  // Nouveau message du voyageur (ou ouverture d'une conversation) : la
  // dernière question monte en haut, la réponse se lira dessous.
  const premierPlacement = useRef(true)
  useLayoutEffect(() => {
    const el = conteneur.current
    if (!el) return
    ajusterReserve()
    const haut = hautDerniereQuestion()
    const instantane = premierPlacement.current || moinsDeMouvement
    premierPlacement.current = false
    if (haut === null) {
      el.scrollTo({ top: el.scrollHeight })
      return
    }
    el.scrollTo({ top: Math.max(0, haut - 12), behavior: instantane ? "auto" : "smooth" })
    // Le défilement ne dépend que de l'arrivée d'un nouveau message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDernierMessage])

  const allerEnBas = () => conteneur.current?.scrollTo({ top: conteneur.current.scrollHeight, behavior: moinsDeMouvement ? "auto" : "smooth" })

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div
        ref={conteneur}
        onScroll={majLoinDuBas}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        <div ref={contenu} className="mt-auto grid gap-3.5 px-4 py-4">
          {entrees.length === 0 && accueil}
          {entrees.map((entree, index) =>
            entree.role === "moi" ? (
              <div key={entree.id} data-derniere-question={index === indexDernier || undefined}>
                <EntreeMoi entree={entree} />
              </div>
            ) : (
              <EntreeRuban key={entree.id} entree={entree} principale={principale} />
            )
          )}
        </div>
        <div ref={reserve} aria-hidden className="shrink-0" />
      </div>
      {loinDuBas && (
        <button
          type="button"
          onClick={allerEnBas}
          aria-label="Aller au dernier message"
          className="absolute bottom-3 left-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-pill border border-line bg-surface text-ink shadow-md animate-in fade-in-0"
        >
          <ArrowDownIcon className="size-5" aria-hidden />
        </button>
      )}
    </div>
  )
}
