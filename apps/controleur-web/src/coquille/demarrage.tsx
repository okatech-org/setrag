"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { LogoAnime } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { CLE_EN_TOURNEE } from "@/lib/preferences"

const CLE_JOUE = "setrag.controle.demarrage-joue"

function installee(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Faut-il jouer le démarrage ? Décidé une fois, au chargement : application
 * installée, démarrage à froid (pas encore joué dans cette ouverture), sans
 * tournée en cours, sans préférence pour moins d'animations. Rouvrir le
 * terminal en tournée ne rejoue jamais l'animation : l'agent a mieux à faire.
 */
const DOIT_JOUER: boolean =
  typeof window === "undefined"
    ? false
    : (() => {
        try {
          if (!installee() || window.sessionStorage.getItem(CLE_JOUE))
            return false
          window.sessionStorage.setItem(CLE_JOUE, "1")
          if (window.localStorage.getItem(CLE_EN_TOURNEE)) return false
          return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        } catch {
          return false
        }
      })()

const sAbonner = () => () => {}

/**
 * Démarrage à froid : le logo animé, le même que l'app voyageur, une fois.
 * L'écran part dès que le ruban est posé (2,4 s) ; il ne retient jamais
 * l'agent au-delà de 4 s.
 */
export function Demarrage() {
  const joue = useSyncExternalStore(
    sAbonner,
    () => DOIT_JOUER,
    () => false
  )
  const [etat, setEtat] = useState<"visible" | "sortie" | "absent">("visible")
  const sombre =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "dark"

  useEffect(() => {
    if (!joue) return
    const ruban = window.setTimeout(() => setEtat("sortie"), 2400)
    return () => window.clearTimeout(ruban)
  }, [joue])

  useEffect(() => {
    if (etat !== "sortie") return
    const fin = window.setTimeout(() => setEtat("absent"), 200)
    return () => window.clearTimeout(fin)
  }, [etat])

  if (!joue || etat === "absent") return null
  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center bg-surface px-8 pb-16 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-sortie)]",
        etat === "sortie" && "opacity-0"
      )}
    >
      <LogoAnime
        variante="complet"
        fond={sombre ? "sombre" : "clair"}
        onFin={() => setEtat("sortie")}
        className="w-full max-w-[320px]"
      />
      <span className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom,0px),28px)] text-center font-mono text-[12px] tracking-[0.06em] text-ink-muted">
        SETRAG · Contrôle à bord
      </span>
    </div>
  )
}
