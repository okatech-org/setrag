"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Écrans à rendre disponibles hors réseau.
 *
 * Le service worker met en cache les PAGES ; il ne connaît pas les fragments
 * de code que chacune charge à la demande. Les précharger revient à demander
 * au routeur de les télécharger pendant qu'il y a du réseau : ils passent
 * alors par le worker, qui les garde. Sans cela, un écran jamais ouvert en
 * gare resterait inaccessible en pleine voie — le cas de l'agent qui rédige
 * son premier procès-verbal de la tournée.
 */
const ROUTES = [
  "/tournee",
  "/scan",
  "/recherche",
  "/vente",
  "/pv",
  "/incident",
  "/historique",
  "/conflits",
  "/manifeste",
  "/voiture",
] as const

/**
 * Empreinte du build, inscrite dans le code au moment de la compilation
 * (`next.config.ts`). Elle nomme les caches du service worker : un
 * déploiement chasse le précédent.
 *
 * Elle ne se déduit pas des scripts de la page : chaque écran en charge un
 * jeu différent, et l'empreinte changerait d'un écran à l'autre — le worker
 * se réinstallerait à chaque ouverture d'une autre page.
 */
const EMPREINTE_BUILD = process.env.NEXT_PUBLIC_EMPREINTE_BUILD ?? "v1"

/**
 * Enregistre le service worker qui rend l'application ouvrable hors réseau.
 *
 * L'enregistrement est différé après le chargement : au premier lancement,
 * en gare, la priorité est que l'agent puisse se connecter et télécharger son
 * manifeste, pas que le cache se remplisse.
 */
/**
 * Interrupteur du mode hors ligne.
 *
 * Le service worker est la pièce la plus difficile à diagnostiquer depuis le
 * terrain : s'il se comporte mal sur un modèle de terminal, l'agent n'a aucun
 * moyen de le contourner. Cette variable permet de le neutraliser par un
 * simple redéploiement, sans toucher au code — l'application perd alors le
 * hors-ligne, mais reste utilisable.
 */
const DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_SW === "1" ||
  // Jamais en développement : le worker sert les fragments de code en
  // cache-first, ce qui fige la version chargée alors que le rechargement à
  // chaud en produit une nouvelle à chaque frappe. On croit alors déboguer
  // l'application ; on débogue un cache. Le hors-ligne se vérifie sur un
  // build de production (`bun run build && bun run start`).
  process.env.NODE_ENV !== "production"

export function ServiceWorker() {
  const router = useRouter()

  useEffect(() => {
    if (typeof navigator === "undefined") return
    // Préchargement différé : la priorité du démarrage reste l'ouverture de
    // session et le téléchargement du manifeste.
    const timer = window.setTimeout(() => {
      if (!navigator.onLine) return
      for (const route of ROUTES) {
        router.prefetch(route as Parameters<typeof router.prefetch>[0])
      }
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [router])

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return
    }
    if (DISABLED) {
      // Neutralisé : on désinstalle aussi ce qui aurait été posé auparavant,
      // sans quoi l'interrupteur n'aurait aucun effet sur les terminaux déjà
      // en service.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((r) => r.unregister()))
        )
        .catch(() => {})
      return
    }
    const register = () => {
      void navigator.serviceWorker
        .register(`/sw.js?v=${EMPREINTE_BUILD}`, { scope: "/" })
        .catch(() => {
          // Un service worker refusé — navigation privée, contexte non
          // sécurisé — dégrade le hors-ligne mais ne doit rien interrompre :
          // les écritures locales, elles, restent en base.
        })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
