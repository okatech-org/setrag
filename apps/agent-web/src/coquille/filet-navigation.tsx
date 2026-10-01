"use client"

import type { Route } from "next"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

/**
 * Le filet du haut : pendant le chargement d'une page, le ruban le traverse.
 *
 * Le routeur de Next n'annonce pas le début d'une navigation. On la déduit
 * donc de ce qui la déclenche — un clic sur un lien interne, ou un appel à
 * `useNaviguer` — et on la tient pour finie quand l'adresse a changé. Le
 * filet n'apparaît qu'après 150 ms (marque.css) : une page servie depuis le
 * cache ne le montre jamais.
 */

const EVENEMENT = "setrag:navigation"

/** Annonce une navigation lancée par le code (après un formulaire…). */
export function signalerNavigation() {
  window.dispatchEvent(new Event(EVENEMENT))
}

/** `router.push`, avec le filet. */
export function useNaviguer() {
  const router = useRouter()
  return useCallback(
    (href: Route, options?: { remplacer?: boolean }) => {
      signalerNavigation()
      if (options?.remplacer) router.replace(href)
      else router.push(href)
    },
    [router]
  )
}

function lienInterne(cible: EventTarget | null): HTMLAnchorElement | null {
  const lien = cible instanceof Element ? cible.closest("a[href]") : null
  if (!(lien instanceof HTMLAnchorElement)) return null
  if (lien.target && lien.target !== "_self") return null
  if (lien.hasAttribute("download")) return null
  const url = new URL(lien.href, window.location.href)
  if (url.origin !== window.location.origin) return null
  // Une ancre dans la même page n'est pas une navigation.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null
  return lien
}

export function FiletNavigation() {
  const chemin = usePathname()
  const parametres = useSearchParams()
  const [actif, setActif] = useState(false)

  useEffect(() => {
    const demarrer = () => setActif(true)
    const clic = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (lienInterne(event.target)) demarrer()
    }
    document.addEventListener("click", clic)
    window.addEventListener(EVENEMENT, demarrer)
    window.addEventListener("popstate", demarrer)
    return () => {
      document.removeEventListener("click", clic)
      window.removeEventListener(EVENEMENT, demarrer)
      window.removeEventListener("popstate", demarrer)
    }
  }, [])

  // L'adresse a changé : la page est là.
  const cle = `${chemin}?${parametres.toString()}`
  const [cleVue, setCleVue] = useState(cle)
  if (cle !== cleVue) {
    setCleVue(cle)
    setActif(false)
  }

  // Une navigation vers la page courante ne change pas l'adresse : on ne
  // laisse pas le filet tourner indéfiniment.
  useEffect(() => {
    if (!actif) return
    const minuteur = window.setTimeout(() => setActif(false), 8000)
    return () => window.clearTimeout(minuteur)
  }, [actif])

  return <span aria-hidden data-actif={actif || undefined} className="filet-ruban" />
}
