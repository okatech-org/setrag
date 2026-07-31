/**
 * Service worker de l'application de contrôle.
 *
 * L'enjeu n'est pas la performance : c'est qu'un contrôleur qui ouvre son
 * terminal entre Booué et Lopé trouve une application, et pas une page
 * d'erreur réseau.
 *
 * Le worker est délibérément DISCRET. En ligne, il ne s'interpose sur aucune
 * navigation : tout part au réseau comme s'il n'existait pas. Il ne prend la
 * parole que dans deux cas — le terminal est hors ligne, ou la ressource
 * demandée porte déjà son empreinte dans son nom et ne changera jamais :
 *
 *  — pages : servies depuis le cache UNIQUEMENT hors ligne. Toutes ont été
 *    précachées à l'installation, et chaque déploiement réinstalle le worker ;
 *
 *  — ressources de Next (`/_next/static/…`), icônes : cache d'abord, leur nom
 *    contenant leur hash de contenu ;
 *
 *  — décodeur WebAssembly : cache d'abord, et précaché. Un scanner qui
 *    exigerait un téléchargement au premier code lu serait inutilisable là où
 *    l'on contrôle.
 *
 * Ce qui n'est JAMAIS mis en cache : les appels à Convex. Une réponse
 * d'inventaire ou de manifeste servie depuis un cache muet ferait croire à
 * l'agent qu'il travaille en ligne. Les données hors ligne vivent dans
 * IndexedDB, où l'application sait leur âge et l'affiche.
 */

/**
 * Version du cache, imposée par la page à l'enregistrement.
 *
 * Elle est dérivée des ressources du build en cours : un nouveau déploiement
 * change l'URL du worker, donc son installation, donc le nom de ses caches.
 * Sans cela, un terminal pourrait servir indéfiniment une page mise en cache
 * qui réclame des ressources supprimées par le déploiement suivant — panne
 * silencieuse, et impossible à diagnostiquer depuis un train.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "v1"
const SHELL_CACHE = `setrag-controle-shell-${VERSION}`
const ASSET_CACHE = `setrag-controle-assets-${VERSION}`

/**
 * Ce qui doit être présent avant la première coupure réseau.
 *
 * TOUS les écrans, pas seulement les plus fréquents : un contrôleur qui
 * ouvre « procès-verbal » pour la première fois de la tournée, en pleine
 * voie, doit trouver l'écran. Ces pages sont pré-rendues et légères ; les
 * charger à l'installation coûte moins qu'un écran manquant à bord.
 */
const PRECACHE = [
  "/",
  // La connexion est précachée elle aussi : sans elle, un terminal qui perd
  // sa session hors réseau n'aurait plus aucun écran à afficher.
  "/connexion",
  "/tournee",
  "/scan",
  "/recherche",
  "/vente",
  "/pv",
  "/incident",
  "/historique",
  "/conflits",
  "/manifeste",
  "/wasm/zxing_reader.wasm",
]

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
  // ouverte l'interrompt, et un contrôleur en pleine saisie de procès-verbal
  // perdrait son écran. Le nouveau worker attend la prochaine ouverture.
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
    // dépendre l'ouverture de l'application du bon fonctionnement du worker —
    // un risque sans contrepartie. Les pages sont de toute façon précachées à
    // l'installation, et chaque déploiement réinstalle le worker.
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
    url.pathname.startsWith("/wasm/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (url.pathname.startsWith("/_next/")) {
    // Les données de route de Next changent à chaque déploiement : réseau
    // d'abord, mais on garde une copie pour tenir hors ligne.
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
 * puis l'accueil. Le dernier vaut mieux qu'une page d'erreur : l'application
 * s'ouvre, et l'agent retrouve sa file d'envoi et son manifeste.
 */
async function offlineDocument(request) {
  const cache = await caches.open(SHELL_CACHE)
  const url = new URL(request.url)
  const cached =
    (await cache.match(request, MATCH)) ??
    (await cache.match(url.pathname, MATCH)) ??
    (await cache.match("/tournee", MATCH))
  if (cached) return cached
  return new Response(
    "<!doctype html><meta charset=\"utf-8\"><title>Hors réseau</title>" +
      "<p style=\"font:16px system-ui;padding:24px\">Application non encore " +
      "mise en cache sur ce terminal. Reconnectez-vous une fois en gare.</p>",
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

/**
 * Demande de synchronisation venue de l'application.
 *
 * L'envoi lui-même reste dans la page : il a besoin du client Convex
 * authentifié, que le service worker n'a pas. Le worker se contente de
 * réveiller les onglets ouverts au retour du réseau.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("online", () => {
  void (async () => {
    const clients = await self.clients.matchAll({ type: "window" })
    for (const client of clients) client.postMessage({ type: "RESEAU_REVENU" })
  })()
})
