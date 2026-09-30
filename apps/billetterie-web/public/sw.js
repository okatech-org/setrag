/**
 * Service worker de la billetterie voyageur.
 *
 * L'enjeu n'est pas la performance : c'est qu'un voyageur qui ouvre son
 * téléphone sur le quai de Lastourville, hors couverture, retrouve son billet
 * et le parcours de son train — pas une page d'erreur réseau.
 *
 * Le worker est délibérément DISCRET. En ligne, il ne s'interpose sur aucune
 * navigation : tout part au réseau comme s'il n'existait pas. Il ne prend la
 * parole que dans deux cas — le téléphone est hors réseau, ou la ressource
 * demandée porte déjà son empreinte dans son nom et ne changera jamais.
 *
 * Ce qui n'est JAMAIS mis en cache : les appels à Convex. Une liste de
 * disponibilités ou un horaire servis depuis un cache muet feraient croire au
 * voyageur qu'il consulte l'état du jour. Les données hors ligne vivent dans
 * IndexedDB, où l'application connaît leur âge et l'affiche.
 */

/**
 * Version du cache, imposée par la page à l'enregistrement.
 *
 * Elle est dérivée des ressources du build en cours : un nouveau déploiement
 * change l'URL du worker, donc son installation, donc le nom de ses caches.
 * Sans cela, un téléphone pourrait servir indéfiniment une page mise en cache
 * qui réclame des ressources supprimées par le déploiement suivant.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "v1"
const SHELL_CACHE = `setrag-voyageur-shell-${VERSION}`
const ASSET_CACHE = `setrag-voyageur-assets-${VERSION}`

/**
 * Ce qui doit être présent avant la première coupure réseau.
 *
 * Uniquement les écrans qui ont un sens sans réseau. Réserver, payer ou
 * comparer des tarifs suppose un serveur : précacher ces pages ne ferait
 * qu'offrir un formulaire qui échoue à l'envoi.
 */
const PRECACHE = ["/", "/billets", "/suivi", "/aide", "/connexion", "/compte"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Un précache partiel vaut mieux qu'une installation refusée : si une
      // seule ressource manque, le reste doit tout de même être disponible.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    })()
  )
  // Pas de `skipWaiting` : un worker qui prend le contrôle d'une page DÉJÀ
  // ouverte l'interrompt, et un voyageur en cours de paiement perdrait son
  // écran. Le nouveau worker attend la prochaine ouverture.
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name))
      )
    })()
  )
  // Pas de `clients.claim()` non plus, pour la même raison : les pages déjà
  // ouvertes gardent le worker sous lequel elles ont démarré.
})

function isConvexRequest(url) {
  return (
    url.hostname.endsWith(".convex.cloud") ||
    url.hostname.endsWith(".convex.site")
  )
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (isConvexRequest(url)) return
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    // En ligne, le worker s'efface : la navigation part au réseau sans passer
    // par lui. Intercepter une navigation qui aboutit n'apporte rien et fait
    // dépendre l'ouverture de l'application du bon fonctionnement du worker.
    //
    // On ne pose surtout PAS de `waitUntil` ici : sur un événement `fetch`,
    // il n'est licite qu'après `respondWith`, et l'appeler seul fait échouer
    // la requête — donc la navigation elle-même.
    if (self.navigator.onLine === false) {
      event.respondWith(offlineDocument(request))
    }
    return
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/marque/")
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (url.pathname.startsWith("/_next/")) {
    // Les données de route de Next changent à chaque déploiement : réseau
    // d'abord, mais on garde une copie pour tenir hors ligne. C'est ce cache
    // qui permet d'ouvrir le détail d'un billet depuis la liste sans réseau.
    event.respondWith(networkFirst(request))
  }
})

/**
 * `ignoreVary` est indispensable ici.
 *
 * Next fait varier ses réponses sur des en-têtes de routage (`RSC`,
 * `Next-Router-State-Tree`). Sans cette option, une page mise en cache par
 * une requête ordinaire ne serait jamais retrouvée par une navigation — le
 * cache paraîtrait vide au moment précis où il doit servir.
 */
const MATCH = { ignoreVary: true }

/**
 * Sert un écran depuis le cache, réseau absent.
 *
 * Trois recours successifs : la page demandée, la même page par son chemin,
 * puis « Mes billets ». Le dernier vaut mieux qu'une page d'erreur : c'est
 * l'écran que le voyageur cherche quand il ouvre l'application sans réseau,
 * et il est servi depuis la base locale.
 */
async function offlineDocument(request) {
  const cache = await caches.open(SHELL_CACHE)
  const url = new URL(request.url)
  const cached =
    (await cache.match(request, MATCH)) ??
    (await cache.match(url.pathname, MATCH)) ??
    (await cache.match("/billets", MATCH))
  if (cached) return cached
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Hors réseau</title>' +
      '<p style="font:16px system-ui;padding:24px">Application non encore ' +
      "mise en mémoire sur ce téléphone. Rouvrez-la une fois connecté.</p>",
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
  )
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const url = new URL(request.url)
    const cached =
      (await cache.match(request, MATCH)) ??
      (await cache.match(url.pathname, MATCH))
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request, MATCH)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
})

/**
 * Retour du réseau.
 *
 * Le rafraîchissement lui-même reste dans la page : il a besoin du client
 * Convex authentifié, que le service worker n'a pas. Le worker se contente de
 * réveiller les onglets ouverts.
 */
self.addEventListener("online", () => {
  void (async () => {
    const clients = await self.clients.matchAll({ type: "window" })
    for (const client of clients) client.postMessage({ type: "RESEAU_REVENU" })
  })()
})
