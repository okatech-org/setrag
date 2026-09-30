"use client"

import { ChevronDownIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { SigneRuban } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { CLE_ROUVRIR } from "./cartes"
import { useRuban } from "./contexte-ruban"
import { Conversation } from "./conversation"
import { AvatarRuban } from "./fil"

const CLE_BULLE = "setrag:ruban-bulle-vue"
const GRAND_ECRAN = "(min-width: 768px)"

function useGrandEcran() {
  return useSyncExternalStore(
    (rappel) => {
      const requete = window.matchMedia(GRAND_ECRAN)
      requete.addEventListener("change", rappel)
      return () => requete.removeEventListener("change", rappel)
    },
    () => window.matchMedia(GRAND_ECRAN).matches,
    () => true
  )
}

/** En-tête de la fenêtre et de la feuille : l'avatar (tracé une fois par session), le nom, les actions. */
function Tete({ sousTitre, actions }: { sousTitre: string; actions: React.ReactNode }) {
  const { premiereOuverture } = useRuban()
  return (
    <div className="flex shrink-0 items-center gap-2.5 py-2 pr-2.5 pl-3.5">
      <AvatarRuban taille={36} trace={premiereOuverture} />
      <div className="min-w-0 flex-1">
        <b className="block text-[15.5px] font-bold">Ruban</b>
        <small className="block truncate text-[12px] font-medium text-ink-muted">{sousTitre}</small>
      </div>
      <div className="flex gap-0.5">{actions}</div>
    </div>
  )
}

const actionTete = "grid size-11 place-items-center rounded-pill text-ink-muted hover:bg-surface-sunk hover:text-ink [&_svg]:size-[19px]"

/**
 * Sur grand écran : une fenêtre de 404 × 640, ancrée au-dessus du bouton, qui
 * laisse la page utilisable — Ruban voit ce que le voyageur regarde.
 */
function Fenetre() {
  const { fermer } = useRuban()
  useEffect(() => {
    const touche = (event: KeyboardEvent) => event.key === "Escape" && fermer()
    window.addEventListener("keydown", touche)
    return () => window.removeEventListener("keydown", touche)
  }, [fermer])
  return (
    <div
      role="dialog"
      aria-label="Ruban, l'assistant SETRAG"
      className="fixed right-8 bottom-[108px] z-50 flex h-[min(640px,calc(100dvh-140px))] w-[404px] origin-bottom-right animate-in flex-col overflow-hidden rounded-[22px] border border-line bg-canvas shadow-[0_24px_60px_oklch(0.2_0.03_257/0.26)] duration-[320ms] ease-[var(--ease)] fade-in-0 zoom-in-95 slide-in-from-bottom-2"
    >
      <div className="border-b border-line bg-surface">
        <Tete
          sousTitre="Assistant SETRAG"
          actions={
            <>
              <Link href="/assistant" className={actionTete} aria-label="Ouvrir en grand" title="Ouvrir en grand" onClick={fermer}>
                <Maximize2Icon />
              </Link>
              <button type="button" onClick={fermer} className={actionTete} aria-label="Fermer Ruban" title="Fermer">
                <XIcon />
              </button>
            </>
          }
        />
      </div>
      <Conversation autoFocus />
    </div>
  )
}

type Hauteur = "moyenne" | "haute" | "plein"

/**
 * Sur mobile : une feuille, à mi-hauteur pour une question rapide, haute dès
 * que la conversation s'engage, plein écran à la demande. On la tire pour
 * l'agrandir ou la refermer, sans rebond.
 */
function Feuille() {
  const { ouvert, fermer, entrees } = useRuban()
  const [hauteur, setHauteur] = useState<Hauteur>("moyenne")
  const [decalage, setDecalage] = useState(0)
  const depart = useRef<number | null>(null)

  const engagee = entrees.length > 0
  const effective: Hauteur = hauteur === "moyenne" && engagee ? "haute" : hauteur

  const glisser = {
    onPointerDown: (event: React.PointerEvent) => {
      depart.current = event.clientY
      ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (depart.current !== null) setDecalage(event.clientY - depart.current)
    },
    onPointerUp: () => {
      if (decalage > 90) {
        if (effective === "plein") setHauteur("haute")
        else fermer()
      } else if (decalage < -60) {
        setHauteur(effective === "moyenne" ? "haute" : "plein")
      }
      depart.current = null
      setDecalage(0)
    },
  }

  return (
    <DialogPrimitive.Root open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.15_0.02_257/0.42)] data-open:animate-in data-open:fade-in-0 data-open:duration-200 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col bg-canvas text-ink shadow-[0_-10px_34px_oklch(0.15_0.02_257/0.22)] outline-none transition-[height,border-radius] duration-[320ms] ease-[var(--ease)] data-open:animate-in data-open:duration-[320ms] data-open:slide-in-from-bottom data-closed:animate-out data-closed:duration-[160ms] data-closed:slide-out-to-bottom",
            effective === "moyenne" && "h-[62dvh] rounded-t-[24px]",
            effective === "haute" && "h-[calc(100dvh-58px)] rounded-t-[24px]",
            effective === "plein" && "pt-safe h-dvh rounded-none"
          )}
          style={decalage ? { translate: `0 ${Math.max(decalage, -40)}px`, transition: "none" } : undefined}
        >
          <DialogPrimitive.Title className="sr-only">Ruban, l&apos;assistant SETRAG</DialogPrimitive.Title>
          <div {...glisser} className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-0.5" aria-hidden>
            <span className="h-[5px] w-10 rounded-[3px] bg-line-strong" />
          </div>
          <Tete
            sousTitre="Assistant SETRAG"
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setHauteur(effective === "plein" ? "haute" : "plein")}
                  className={actionTete}
                  aria-label={effective === "plein" ? "Réduire" : "Plein écran"}
                >
                  {effective === "plein" ? <Minimize2Icon /> : <Maximize2Icon />}
                </button>
                <DialogPrimitive.Close className={actionTete} aria-label="Fermer Ruban">
                  <XIcon />
                </DialogPrimitive.Close>
              </>
            }
          />
          <Conversation className="pb-safe" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** La bulle de première visite : une fois, trois secondes après l'arrivée. */
function Bulle({ racine }: { racine: boolean }) {
  const { ouvert, ouvrir } = useRuban()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLE_BULLE)) return
    } catch {
      return
    }
    const minuteur = window.setTimeout(() => setVisible(true), 3000)
    return () => window.clearTimeout(minuteur)
  }, [])
  const masquer = () => {
    setVisible(false)
    try {
      window.localStorage.setItem(CLE_BULLE, "1")
    } catch {
      // Sans stockage, la bulle reviendra à la prochaine visite.
    }
  }
  if (!visible || ouvert) return null
  return (
    <div
      role="status"
      className={cn(
        "fixed z-40 animate-in rounded-[16px_16px_4px_16px] border border-line bg-surface py-3 pr-11 pl-3.5 text-[14px] leading-[1.45] font-medium shadow-lg duration-200 fade-in-0 slide-in-from-bottom-2",
        "right-4 left-16 bottom-[calc(58px+env(safe-area-inset-bottom,0px)+84px)] md:right-[104px] md:bottom-10 md:left-auto md:w-[300px]",
        !racine && "max-md:hidden"
      )}
    >
      <button
        type="button"
        onClick={() => {
          masquer()
          ouvrir()
        }}
        className="text-left"
      >
        <b className="mb-0.5 block font-bold">Bonjour, je suis Ruban.</b>
        Je peux chercher un train, suivre un retard ou retrouver une réservation. Écrivez-moi, ou parlez-moi.
      </button>
      <button type="button" onClick={masquer} aria-label="Masquer" className="absolute top-0 right-0 grid size-11 place-items-center rounded-pill text-ink-muted hover:bg-surface-sunk">
        <XIcon className="size-[15px]" />
      </button>
    </div>
  )
}

/**
 * Ruban dans la coquille : le bouton flottant — toujours encre, c'est ce qui
 * le rend reconnaissable —, la fenêtre sur grand écran, la feuille sur
 * mobile. Sur mobile, le bouton ne flotte que sur les écrans racines, au-
 * dessus des onglets ; dans le tunnel, la barre d'action occupe le bas.
 */
export function Ruban({ racine }: { racine: boolean }) {
  const chemin = usePathname()
  const { ouvert, ouvrir, fermer, disponible } = useRuban()
  const grandEcran = useGrandEcran()

  // Retour d'une connexion lancée depuis le fil : la conversation reprend.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(CLE_ROUVRIR)) {
        window.sessionStorage.removeItem(CLE_ROUVRIR)
        if (!chemin.startsWith("/connexion")) ouvrir()
      }
    } catch {
      // Stockage indisponible : rien à reprendre.
    }
  }, [chemin, ouvrir])

  // La fenêtre refermée (Échap, croix, bouton), le focus revient au bouton
  // qui l'avait ouverte : le clavier ne se perd pas en haut de la page.
  const bouton = useRef<HTMLButtonElement>(null)
  const etaitOuvert = useRef(ouvert)
  useEffect(() => {
    if (etaitOuvert.current && !ouvert && grandEcran) bouton.current?.focus()
    etaitOuvert.current = ouvert
  }, [ouvert, grandEcran])

  if (chemin.startsWith("/assistant") || disponible === false) return null

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={ouvert ? fermer : ouvrir}
        aria-label={ouvert ? "Fermer Ruban" : "Ouvrir Ruban, l'assistant"}
        aria-expanded={ouvert}
        className={cn(
          "fixed right-4 z-40 grid size-14 place-items-center rounded-pill bg-brand-encre text-white shadow-[0_10px_28px_oklch(0.2_0.03_257/0.3),inset_0_0_0_1px_oklch(1_0_0/0.08)] transition-transform duration-[var(--dur-micro)] active:scale-[0.96] md:right-8 md:bottom-8 md:size-[60px] dark:bg-[oklch(0.34_0.03_257)]",
          racine ? "bottom-[calc(58px+env(safe-area-inset-bottom,0px)+16px)]" : "max-md:hidden",
          ouvert && "max-md:hidden"
        )}
      >
        {ouvert ? <ChevronDownIcon className="size-6" /> : <SigneRuban fond="sombre" className="h-[35px] w-auto" />}
      </button>
      <Bulle racine={racine} />
      {ouvert && grandEcran && <Fenetre />}
      {!grandEcran && <Feuille />}
    </>
  )
}
