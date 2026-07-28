import { expect, test, type Page } from "@playwright/test"

/**
 * Écrans du parcours voyageur.
 *
 * `desktopHeading` est le titre de la page tel qu'il apparaît au-delà de
 * 768 px. En dessous, la barre de titre du shell le porte à sa place et la
 * page ne le répète pas — `mobileTitle` dit ce qu'on doit alors lire.
 * L'accueil fait exception : il ouvre sur son propre bandeau, sans barre.
 */
const PAGES = [
  {
    path: "/",
    desktopHeading: "Traversez le Gabon en un seul billet.",
    mobileTitle: null,
  },
  {
    path: "/resultats",
    desktopHeading: "Choisissez votre train",
    mobileTitle: "Dessertes",
  },
  {
    path: "/reservation",
    desktopHeading: "Votre voyage et vos passagers",
    mobileTitle: "Votre voyage",
  },
  { path: "/paiement", desktopHeading: "Paiement", mobileTitle: "Paiement" },
  {
    path: "/paiement/attente",
    desktopHeading: "Validez le paiement sur votre téléphone",
    mobileTitle: "Validation en cours",
  },
  {
    path: "/confirmation",
    desktopHeading: "Votre voyage est enregistré",
    mobileTitle: "Billet émis",
  },
  {
    path: "/mes-reservations",
    desktopHeading: "Mes réservations",
    mobileTitle: "Billets",
  },
  { path: "/suivi", desktopHeading: "Suivre un train", mobileTitle: "Trains" },
  { path: "/compte", desktopHeading: "Mon compte", mobileTitle: "Compte" },
  {
    path: "/connexion",
    desktopHeading: "Se connecter",
    mobileTitle: "Connexion",
  },
] as const

/** Onglets du bas : présents sur les quatre destinations, absents ailleurs. */
const TAB_PATHS = ["/", "/mes-reservations", "/suivi", "/compte"]

const MOBILE_VIEWPORT = { width: 390, height: 844 }

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
}

/**
 * Les deux chromes cohabitent dans le DOM et sont triés en CSS.
 *
 * Les assertions passent par `toBeVisible` / `toBeHidden`, qui réessaient :
 * un `isVisible()` immédiat lirait l'état d'avant l'application de la feuille
 * de style, où tout est visible faute de règle `display`.
 */
async function expectDesktopChrome(page: Page) {
  await expect(page.locator("[data-slot='desktop-header']")).toBeVisible()
  await expect(page.locator("[data-slot='mobile-app-bar']")).toBeHidden()
  await expect(page.locator("[data-slot='bottom-nav']")).toBeHidden()
}

async function expectMobileChrome(page: Page) {
  await expect(page.locator("[data-slot='desktop-header']")).toBeHidden()
}

test.describe("bureau", () => {
  for (const pageCase of PAGES) {
    test(`${pageCase.path} rend son écran principal`, async ({ page }) => {
      await page.goto(pageCase.path)
      await expect(
        page.getByRole("heading", {
          name: pageCase.desktopHeading,
          exact: true,
        })
      ).toBeVisible()
      await expectDesktopChrome(page)
    })
  }

  test("le parcours d'achat relie recherche, résultat et réservation", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Rechercher un train" }).click()
    await expect(page).toHaveURL(/\/resultats/)
    await page.getByRole("link", { name: "Choisir TR-201" }).click()
    await expect(page).toHaveURL(/\/reservation/)
    await expect(page.getByRole("heading", { name: "Voyageurs" })).toBeVisible()
    await page
      .getByRole("button", { name: "Continuer vers le paiement" })
      .click()
    await expect(page).toHaveURL(/\/paiement/)
    await page
      .getByRole("checkbox", { name: /conditions générales de vente/ })
      .click()
    await page.getByRole("button", { name: /Payer/ }).last().click()
    await expect(page).toHaveURL(/\/paiement\/attente/)
    await page
      .getByRole("link", { name: "Simuler la confirmation" })
      .last()
      .click()
    await expect(page).toHaveURL(/\/confirmation/)
    await expect(
      page.getByRole("heading", { name: "RS-2026-084517", exact: true })
    ).toBeVisible()
  })
})

test.describe("mobile", () => {
  test.use({ viewport: MOBILE_VIEWPORT })

  for (const pageCase of PAGES) {
    test(`${pageCase.path} porte son titre dans la barre du haut`, async ({
      page,
    }) => {
      await page.goto(pageCase.path)

      if (pageCase.mobileTitle === null) {
        // L'accueil n'a pas de barre de titre : son bandeau en tient lieu.
        await expect(page.locator('[data-slot="mobile-app-bar"]')).toHaveCount(
          0
        )
      } else {
        await expect(
          page.locator('[data-slot="mobile-app-bar"]')
        ).toContainText(pageCase.mobileTitle)
      }

      const pageHeading = page.getByRole("heading", {
        name: pageCase.desktopHeading,
        exact: true,
      })
      if (pageCase.path === "/connexion") {
        // Le titre du formulaire reste son h1 sémantique ; la barre mobile
        // indique seulement le contexte de navigation.
        await expect(pageHeading).toBeVisible()
      } else {
        await expect(pageHeading).toBeHidden()
      }

      await expectNoHorizontalOverflow(page)
    })
  }

  for (const path of TAB_PATHS) {
    test(`${path} affiche la barre d'onglets`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('[data-slot="bottom-nav"]')).toBeVisible()
      await expectMobileChrome(page)
    })
  }

  test("les écrans empilés masquent la barre d'onglets", async ({ page }) => {
    await page.goto("/paiement")
    await expect(page.locator('[data-slot="bottom-nav"]')).toHaveCount(0)
    // Et proposent un retour arrière à la place.
    await expect(
      page.locator('[data-slot="mobile-app-bar-button"]')
    ).toBeVisible()
  })

  test("la barre d'onglets mène aux quatre destinations", async ({ page }) => {
    await page.goto("/")
    const nav = page.locator('[data-slot="bottom-nav"]')
    for (const [label, url] of [
      ["Billets", /\/mes-reservations/],
      ["Trains", /\/suivi/],
      ["Compte", /\/compte/],
      ["Accueil", /\/$/],
    ] as const) {
      // Le bouton flottant des Dev Tools de Next recouvre le premier onglet
      // uniquement en développement. L'activation clavier valide le même lien
      // sans laisser cet artefact du runner intercepter le pointeur.
      await nav.getByRole("link", { name: label }).press("Enter")
      await expect(page).toHaveURL(url)
    }
  })

  test("le parcours d'achat se fait de bout en bout au pouce", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Rechercher une desserte" }).click()
    await expect(page).toHaveURL(/\/resultats/)

    await page
      .getByRole("link", { name: "Choisir cette desserte" })
      .first()
      .click()
    await expect(page).toHaveURL(/\/reservation/)

    // Le dossier se remplit en trois phases, reprises par le sélecteur du haut.
    // `exact` : les options de classe portent elles aussi le rôle `radio`.
    await expect(
      page.getByRole("radio", { name: "Classe", exact: true })
    ).toBeVisible()
    await page.getByRole("radio", { name: "Prix", exact: true }).click()
    await page.getByRole("button", { name: /Passer au paiement/ }).click()
    await expect(page).toHaveURL(/\/paiement/)

    await page
      .getByRole("checkbox", { name: /conditions générales de vente/ })
      .click()
    await page.getByRole("button", { name: /^Payer/ }).click()
    await expect(page).toHaveURL(/\/paiement\/attente/)

    await page.getByRole("link", { name: "Simuler la confirmation" }).click()
    await expect(page).toHaveURL(/\/confirmation/)
  })

  test("le plan de voiture respecte la cible tactile de 44 px", async ({
    page,
  }) => {
    await page.goto("/reservation")
    const seats = page.locator('[data-slot="seat-grid"] button')
    const count = await seats.count()
    if (count === 0) test.skip(true, "Aucun plan de voiture en mode de test")
    const box = await seats.first().boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  })
})

test.describe("reflow WCAG", () => {
  test.use({ viewport: { width: 320, height: 800 } })

  for (const pageCase of PAGES) {
    test(`${pageCase.path} ne déborde pas à 320 px`, async ({ page }) => {
      await page.goto(pageCase.path)
      await expectNoHorizontalOverflow(page)
    })
  }
})
