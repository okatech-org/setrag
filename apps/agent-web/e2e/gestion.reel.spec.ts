import { readFile } from "node:fs/promises"

import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test"

/**
 * Back-office de gestion contre le vrai backend de dev (Convex cloud, données
 * de démonstration). Ces parcours lisent : ils n'écrivent rien de durable, à
 * part les traces que le portail inscrit lui-même au journal d'audit
 * (extraction et export d'un manifeste, export du journal).
 *
 *   E2E_REEL=1 bunx playwright test -c playwright.reel.config.ts
 */

type Profil =
  | "Administrateur fonctionnel"
  | "Chef de vente"
  | "Chef de gare"
  | "Comptable général"
  | "Contrôleur des recettes"
  | "Guichetier"

type EtatSession = Awaited<ReturnType<BrowserContext["storageState"]>>

/** Une connexion par profil et par processus de test : les suivants reprennent la session. */
const sessions = new Map<Profil, Promise<EtatSession>>()

async function connecter(browser: Browser, baseURL: string, profil: Profil) {
  const contexte = await browser.newContext({ baseURL })
  try {
    const page = await contexte.newPage()
    await page.goto("/connexion")
    await page.getByRole("button", { name: /Comptes démo/ }).click()
    const dialogue = page.getByRole("dialog")
    await dialogue.locator("input").fill(profil)
    await dialogue
      .getByRole("button", { name: new RegExp(`^Se connecter avec ${profil}`) })
      .first()
      .click()
    await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), {
      timeout: 60_000,
    })
    return await contexte.storageState()
  } finally {
    await contexte.close()
  }
}

interface Ouverture {
  page: Page
  /** Erreurs JavaScript non rattrapées depuis l'ouverture. */
  erreurs: string[]
}

const test = base.extend<{
  ouvrir: (profil: Profil, largeur?: number) => Promise<Ouverture>
}>({
  ouvrir: async ({ browser, baseURL }, utiliser) => {
    const contextes: BrowserContext[] = []
    await utiliser(async (profil, largeur = 1440) => {
      let session = sessions.get(profil)
      if (!session) {
        session = connecter(browser, baseURL!, profil)
        sessions.set(profil, session)
        session.catch(() => sessions.delete(profil))
      }
      const contexte = await browser.newContext({
        baseURL,
        storageState: await session,
        viewport: { width: largeur, height: 900 },
        acceptDownloads: true,
      })
      contextes.push(contexte)
      // Un manifeste ou un journal s'imprime : la boîte du navigateur bloquerait le test.
      await contexte.addInitScript(() => {
        window.print = () => {}
      })
      const page = await contexte.newPage()
      const erreurs: string[] = []
      page.on("pageerror", (erreur) => erreurs.push(erreur.message))
      return { page, erreurs }
    })
    for (const contexte of contextes) await contexte.close()
  },
})

test.skip(
  process.env.E2E_REEL !== "1",
  "Parcours contre le backend de dev : poser E2E_REEL=1."
)

/* ------------------------------------------------------------- utilitaires */

const TITRES_ERREUR =
  /Impossible d’afficher cet écran|Accès non autorisé|Le module .* est désactivé|This page could not be found/

const titre = (page: Page) => page.getByRole("heading", { level: 1 }).first()

/** La page a fini de charger : titre visible, plus de squelette. */
async function attendreChargement(page: Page, titreAttendu?: string) {
  if (titreAttendu) {
    await expect(titre(page)).toHaveText(titreAttendu)
  } else {
    await expect(titre(page)).toBeVisible()
    await expect(titre(page)).not.toHaveText(/Vérification de la session/)
  }
  await expect(
    page.locator("[data-slot=skeleton], .animate-pulse")
  ).toHaveCount(0)
}

async function sansEcranErreur({ page, erreurs }: Ouverture) {
  await expect(titre(page)).not.toHaveText(TITRES_ERREUR)
  expect(erreurs, "erreurs JavaScript non rattrapées").toEqual([])
}

async function sansDebordement(page: Page) {
  const mesure = await page.evaluate(() => ({
    visible: document.documentElement.clientWidth,
    contenu: document.documentElement.scrollWidth,
  }))
  expect(
    mesure.contenu,
    `largeur du contenu à ${mesure.visible} px`
  ).toBeLessThanOrEqual(mesure.visible)
}

const menu = (page: Page) =>
  page.getByRole("navigation", { name: "Menu du portail" })

/** Lit un téléchargement CSV : nom, en-tête et nombre de lignes. */
async function lireCsv(telechargement: Download) {
  const nom = telechargement.suggestedFilename()
  const chemin = await telechargement.path()
  const contenu = (await readFile(chemin, "utf8")).replace(/^﻿/, "")
  const lignes = contenu.split(/\r?\n/).filter(Boolean)
  return { nom, entete: lignes[0] ?? "", lignes }
}

async function telecharger(page: Page, bouton: Locator) {
  await expect(bouton).toBeEnabled()
  const [telechargement] = await Promise.all([
    page.waitForEvent("download"),
    bouton.click(),
  ])
  return lireCsv(telechargement)
}

/* ------------------------------------------------- rubriques de la gestion */

const RUBRIQUES = [
  ["/gestion", "Tableau de bord"],
  ["/gestion/livrets", "Livrets horaires"],
  ["/gestion/trains", "Trains et voitures"],
  ["/gestion/places", "Places et quotas"],
  ["/gestion/tarifs", "Tarifs"],
  ["/gestion/yield", "Yield management"],
  ["/gestion/points-de-vente", "Points de vente"],
  ["/gestion/voyageurs", "Voyageurs et manifeste"],
  ["/gestion/apres-vente", "Après-vente du réseau"],
  ["/gestion/recettes", "Contrôle des recettes"],
  ["/gestion/comptabilite", "Comptabilité"],
  ["/gestion/rapports", "Rapports"],
  ["/gestion/incidents", "Incidents et procès-verbaux"],
  ["/gestion/utilisateurs", "Utilisateurs et droits"],
  ["/gestion/audit", "Journal d'audit"],
  ["/gestion/parametrage", "Paramétrage"],
  ["/gestion/integrations", "Intégrations"],
] as const

test.describe("rubriques de l'administrateur fonctionnel", () => {
  for (const [chemin, attendu] of RUBRIQUES) {
    test(`${chemin} affiche « ${attendu} », son menu, et tient à 1440 et 375 px`, async ({
      ouvrir,
    }) => {
      const ouverture = await ouvrir("Administrateur fonctionnel")
      const { page } = ouverture
      await page.goto(chemin)
      await attendreChargement(page, attendu)
      await sansEcranErreur(ouverture)
      await sansDebordement(page)

      // Menu latéral : l'entrée courante est marquée, chaque entrée a son icône.
      const nav = menu(page)
      await expect(nav).toBeVisible()
      const courante = nav.locator('a[aria-current="page"]')
      await expect(courante).toHaveCount(1)
      await expect(courante).toHaveAttribute("href", chemin)
      const entrees = nav.getByRole("link")
      expect(await entrees.count()).toBeGreaterThan(5)
      for (const entree of await entrees.all()) {
        await expect(
          entree.locator("svg"),
          `icône de « ${await entree.textContent()} »`
        ).toHaveCount(1)
      }

      // Téléphone : même écran, sans défilement horizontal.
      await page.setViewportSize({ width: 375, height: 800 })
      await page.reload()
      await attendreChargement(page, attendu)
      await sansEcranErreur(ouverture)
      await sansDebordement(page)
    })
  }
})

/* ---------------------------------------------- d'une liste à son dossier */

/**
 * Listes à aperçu : un clic sur une ligne la sélectionne et ouvre son aperçu,
 * dont le lien mène au dossier complet.
 */
const LISTES_A_APERCU = [
  {
    chemin: "/gestion/livrets",
    tableau: "Livrets horaires",
    lien: "Ouvrir le dossier",
    dossier: /\/gestion\/livrets\/[^/]+$/,
  },
  {
    chemin: "/gestion/trains",
    tableau: "Trains",
    lien: "Ouvrir la composition",
    dossier: /\/gestion\/trains\/[^/]+$/,
  },
  {
    chemin: "/gestion/incidents",
    tableau: "Incidents",
    lien: "Dossier",
    dossier: /\/gestion\/incidents\/[^/]+$/,
  },
] as const

test.describe("listes et dossiers", () => {
  for (const liste of LISTES_A_APERCU) {
    test(`${liste.chemin} ouvre l'aperçu puis le dossier d'une ligne`, async ({
      ouvrir,
    }) => {
      const ouverture = await ouvrir("Administrateur fonctionnel")
      const { page } = ouverture
      await page.goto(liste.chemin)
      await attendreChargement(page)

      const lignes = page
        .getByRole("table", { name: liste.tableau, exact: true })
        .locator("tbody tr")
      await expect(lignes.first()).toBeVisible()
      // De préférence une ligne autre que celle choisie d'office ; repérée par
      // son rang, qui ne change pas quand la sélection bouge.
      const rang = await lignes.evaluateAll((trs) =>
        Math.max(0, trs.findIndex((tr) => tr.getAttribute("aria-selected") === "false"))
      )
      const ligne = lignes.nth(rang)
      // Première ligne de la première cellule : le libellé de l'objet.
      const libelle = (await ligne.locator("td").first().innerText())
        .split("\n")[0]!
        .trim()
      expect(libelle).not.toBe("")
      await ligne.click()
      await expect(ligne).toHaveAttribute("aria-selected", "true")

      // L'aperçu porte le libellé de la ligne et mène au dossier.
      const apercu = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { level: 2, name: libelle }) })
        .first()
      await expect(apercu).toBeVisible()
      await apercu.getByRole("link", { name: liste.lien }).click()
      await expect(page).toHaveURL(liste.dossier)
      await attendreChargement(page)
      await sansEcranErreur(ouverture)
      await expect(page.getByText(libelle).first()).toBeVisible()
    })
  }

  test("/gestion/audit ouvre le détail d'une entrée du journal", async ({
    ouvrir,
  }) => {
    const ouverture = await ouvrir("Administrateur fonctionnel")
    const { page } = ouverture
    await page.goto("/gestion/audit")
    await attendreChargement(page, "Journal d'audit")
    const ligne = page
      .getByRole("table", { name: "Journal d'audit", exact: true })
      .locator("tbody tr")
      .first()
    await expect(ligne).toBeVisible()
    await ligne.click()
    await expect(page).toHaveURL(/\/gestion\/audit\/[^/]+$/)
    await attendreChargement(page)
    await sansEcranErreur(ouverture)
  })
})

/* ----------------------------------------------------------- exports CSV */

test.describe("exports CSV", () => {
  test("/gestion/voyageurs exporte le manifeste extrait", async ({ ouvrir }) => {
    const ouverture = await ouvrir("Administrateur fonctionnel")
    const { page } = ouverture
    await page.goto("/gestion/voyageurs")
    await attendreChargement(page, "Voyageurs et manifeste")
    await page.getByRole("button", { name: "Extraire la liste" }).click()
    await expect(
      page.getByRole("table", { name: "Manifeste voyageurs", exact: true })
    ).toBeVisible()

    const csv = await telecharger(
      page,
      page.getByRole("button", { name: "Exporter le manifeste" })
    )
    expect(csv.nom).toMatch(/^manifeste-.+\.csv$/)
    expect(csv.entete.split(";").length).toBeGreaterThan(3)
    expect(csv.lignes.length).toBeGreaterThan(1)
    await sansEcranErreur(ouverture)
  })

  test("/gestion/comptabilite exporte les déversements", async ({ ouvrir }) => {
    const ouverture = await ouvrir("Administrateur fonctionnel")
    const { page } = ouverture
    await page.goto("/gestion/comptabilite")
    await attendreChargement(page, "Comptabilité")
    const deversements = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Déversements" }) })
    const csv = await telecharger(
      page,
      deversements.getByRole("button", { name: /^Exporter \(\d+\)$/ })
    )
    expect(csv.nom).toMatch(/^setrag-deversements-sage-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv.entete).toMatch(/^Journée;Pièces;Ventes TTC/)
    expect(csv.lignes.length).toBeGreaterThan(1)
    await sansEcranErreur(ouverture)
  })

  test("/gestion/audit exporte le journal filtré", async ({ ouvrir }) => {
    const ouverture = await ouvrir("Administrateur fonctionnel")
    const { page } = ouverture
    await page.goto("/gestion/audit")
    await attendreChargement(page, "Journal d'audit")
    await expect(
      page
        .getByRole("table", { name: "Journal d'audit", exact: true })
        .locator("tbody tr")
        .first()
    ).toBeVisible()
    const csv = await telecharger(
      page,
      page.getByRole("button", { name: "Exporter", exact: true })
    )
    expect(csv.nom).toMatch(/^journal-audit-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv.entete).toMatch(/^Horodatage;Agent;Matricule;Rôle;Action/)
    expect(csv.lignes.length).toBeGreaterThan(1)
    await sansEcranErreur(ouverture)
  })
})

/* ----------------------------------------------------------------- droits */

test.describe("droits par profil", () => {
  for (const chemin of ["/gestion/parametrage", "/gestion/utilisateurs"]) {
    test(`le chef de gare est écarté de ${chemin}`, async ({ ouvrir }) => {
      const ouverture = await ouvrir("Chef de gare")
      const { page } = ouverture
      await page.goto(chemin)
      await expect(page).not.toHaveURL(new RegExp(`${chemin}$`))
      await attendreChargement(page)
      await sansEcranErreur(ouverture)
      // Renvoyé vers sa propre page d'accueil, toujours connecté.
      expect(new URL(page.url()).pathname).toMatch(/^\/(gestion|vente)/)
      await expect(menu(page).getByRole("link").first()).toBeVisible()
      await expect(
        menu(page).locator(`a[href="${chemin}"]`)
      ).toHaveCount(0)
    })
  }

  test("le comptable n'a pas les livrets horaires dans son menu", async ({
    ouvrir,
  }) => {
    const ouverture = await ouvrir("Comptable général")
    const { page } = ouverture
    await page.goto("/gestion")
    await attendreChargement(page)
    const nav = menu(page)
    await expect(nav.getByRole("link", { name: "Comptabilité" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Livrets horaires" })).toHaveCount(0)
    await expect(nav.locator('a[href="/gestion/livrets"]')).toHaveCount(0)
  })

  test("le guichetier ne voit que le menu Guichet", async ({ ouvrir }) => {
    const ouverture = await ouvrir("Guichetier")
    const { page } = ouverture
    await page.goto("/vente")
    const nav = menu(page)
    await expect(nav.getByRole("link", { name: "Vendre un billet" })).toBeVisible()
    await expect(nav.getByRole("heading", { level: 2 })).toHaveText(["Guichet"])
    await expect(nav.locator('a[href^="/gestion"]')).toHaveCount(0)

    // La gestion lui reste fermée.
    await page.goto("/gestion")
    await expect(page).toHaveURL(/\/vente/)
    await sansEcranErreur(ouverture)
  })
})

/* ------------------------------------------------------- tableau de bord */

/** « +1 234,5 % » → 1234.5 ; seules les évolutions signées sont relevées. */
function evolutionsSignees(texte: string) {
  const motif = /[+−-]\s?(\d[\d\s  ]*(?:,\d+)?)\s?%/g
  return [...texte.matchAll(motif)].map((m) =>
    Number(m[1]!.replace(/[\s  ]/g, "").replace(",", "."))
  )
}

test("le tableau de bord n'affiche aucune évolution absurde", async ({
  ouvrir,
}) => {
  const ouverture = await ouvrir("Administrateur fonctionnel")
  const { page } = ouverture
  await page.goto("/gestion")
  await attendreChargement(page, "Tableau de bord")
  const periodes = page
    .getByRole("radiogroup", { name: "Période" })
    .getByRole("radio")
  const libelles = await periodes.allTextContents()
  expect(libelles.length).toBeGreaterThan(1)

  for (const libelle of libelles) {
    await periodes.filter({ hasText: libelle }).click()
    await page.waitForTimeout(1_500)
    await expect(
      page.locator("[data-slot=skeleton], .animate-pulse")
    ).toHaveCount(0)
    const recette = page.locator("main em").filter({ hasText: /période précédente/ })
    await expect(recette, `évolution de la recette · ${libelle}`).toBeVisible()
    const texte = (await recette.textContent()) ?? ""
    if (!texte.includes("pas de période précédente comparable")) {
      const [valeur] = evolutionsSignees(texte)
      expect(valeur, `évolution lue : « ${texte} »`).toBeDefined()
      expect(valeur!).toBeLessThan(1000)
    }
    const page_ = (await page.locator("main").innerText()) ?? ""
    expect(page_).not.toMatch(/Infinity|NaN/)
    for (const valeur of evolutionsSignees(page_)) {
      expect(valeur, `évolution affichée · ${libelle}`).toBeLessThan(1000)
    }
  }
  await sansEcranErreur(ouverture)
})
