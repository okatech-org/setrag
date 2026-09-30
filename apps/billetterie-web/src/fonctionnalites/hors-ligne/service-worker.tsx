"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Écrans à rendre disponibles hors réseau.
 *
 * Le service worker met en cache les PAGES ; il ne connaît pas les fragments
 * de code que chacune charge à la demande. Les précharger revient à demander
 * au routeur de les télécharger pendant qu'il y a du réseau : ils passent
 * alors par le worker, qui les garde. Sans cela, un écran jamais ouvert avec
 * du réseau resterait inaccessible en cours de trajet — le cas du voyageur qui
 * cherche le parcours de son train pour la première fois entre deux gares.
 */
const ROUTES = ["/billets", "/suivi", "/aide"] as const

/**
 * Empreinte du build servi à cette page.
 *
 * Les noms de fichiers de Next contiennent le hash de leur contenu : leur
 * ensemble identifie donc le déploiement, sans qu'on ait à propager un numéro
 * de version à la main. L'empreinte pilote le nom des caches du service
 * worker, ce qui garantit qu'un déploiement chasse le précédent.
 */
function buildSignature(): string {
  const sources = [
    ...document.querySelectorAll<HTMLScriptElement>(
      'script[src*="/_next/static/"]'
    ),
  ]
    .map((script) => script.src.split("/").pop() ?? "")
    .sort()
    .join("|")

  let hash = 0
  for (let index = 0; index < sources.length; index += 1) {
    hash = (hash * 31 + sources.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

/**
 * Interrupteur du mode hors ligne.
 *
 * Le service worker est la pièce la plus difficile à diagnostiquer à distance :
 * s'il se comporte mal sur un modèle de téléphone, le voyageur n'a aucun moyen
 * de le contourner. Cette variable permet de le neutraliser par un simple
 * redéploiement — l'application perd le hors-ligne, mais reste utilisable.
 */
const DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_SW === "1" ||
  // Jamais en développement : le worker sert les fragments de code en
  // cache-first, ce qui fige la version chargée alors que le rechargement à
  // chaud en produit une nouvelle à chaque frappe. On croit alors déboguer
  // l'application ; on débogue un cache. Le hors-ligne se vérifie sur un build
  // de production (`bun run build && bun run start`).
  process.env.NODE_ENV !== "production"

/**
 * Enregistre le service worker qui rend l'application ouvrable hors réseau.
 *
 * L'enregistrement est différé après le chargement : à la première ouverture,
 * la priorité est que le voyageur puisse chercher son train, pas que le cache
 * se remplisse.
 */
export function ServiceWorker() {
  const router = useRouter()

  useEffect(() => {
    if (typeof navigator === "undefined") return
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
      // sans quoi l'interrupteur n'aurait aucun effet sur les téléphones où
      // l'application est déjà installée.
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister())
          )
        )
        .catch(() => {})
      return
    }
    const register = () => {
      void navigator.serviceWorker
        .register(`/sw.js?v=${buildSignature()}`, { scope: "/" })
        .catch(() => {
          // Un service worker refusé — navigation privée, contexte non
          // sécurisé — dégrade le hors-ligne mais ne doit rien interrompre :
          // les billets déjà enregistrés, eux, restent en base locale.
        })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
