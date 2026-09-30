"use client"

import { useTheme } from "next-themes"
import { useEffect, useState, useSyncExternalStore } from "react"

import { LogoAnime } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

const CLE = "setrag:demarrage-joue"

function installee(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true
  // Safari sur iOS ne renseigne pas `display-mode` : il pose ce drapeau non
  // standard sur `navigator`.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Faut-il jouer le démarrage ? Décidé une fois, au chargement de l'app :
 * installée, pas encore jouée dans cette ouverture, et sans préférence pour
 * moins d'animations. Une constante de module, pas un calcul par rendu.
 */
const DOIT_JOUER: boolean =
  typeof window === "undefined"
    ? false
    : (() => {
        try {
          if (!installee() || window.sessionStorage.getItem(CLE)) return false
          window.sessionStorage.setItem(CLE, "1")
          return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        } catch {
          return false
        }
      })()

const sAbonner = () => () => {}

/**
 * Écran de démarrage de la billetterie installée : le logo animé, une fois
 * par ouverture. Jamais dans un onglet de navigateur — sur le site, le logo
 * de l'en-tête reste fixe —, jamais au retour d'une page à l'autre.
 *
 * L'écran s'efface dès la fin de l'animation (3,3 s) ; si le voyageur a
 * demandé moins d'animations, il n'apparaît pas.
 */
export function Demarrage() {
  const { resolvedTheme } = useTheme()
  const joue = useSyncExternalStore(sAbonner, () => DOIT_JOUER, () => false)
  const [etat, setEtat] = useState<"visible" | "sortie" | "absent">("visible")

  // Filet de sécurité : l'écran ne doit jamais retenir l'app.
  useEffect(() => {
    if (!joue) return
    const secours = window.setTimeout(() => setEtat("sortie"), 4000)
    return () => window.clearTimeout(secours)
  }, [joue])

  useEffect(() => {
    if (etat !== "sortie") return
    const fin = window.setTimeout(() => setEtat("absent"), 200)
    return () => window.clearTimeout(fin)
  }, [etat])

  if (!joue || etat === "absent") return null
  const sombre = resolvedTheme === "dark"
  return (
    <div
      aria-hidden
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center px-8 pb-16 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-sortie)]",
        sombre ? "bg-brand-encre" : "bg-[var(--c-surface)]",
        etat === "sortie" && "opacity-0"
      )}
    >
      <LogoAnime variante="complet" fond={sombre ? "sombre" : "clair"} onFin={() => setEtat("sortie")} className="w-full max-w-[360px]" />
    </div>
  )
}
