import { expect, test, type Page } from "@playwright/test"

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
}

test("AW-00 rend la connexion et le compte de repli", async ({ page }) => {
  await page.goto("/connexion")
  await expect(
    page.getByRole("heading", { name: "Ouvrir une session", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", {
      name: "Se connecter avec mon compte SETRAG",
    })
  ).toBeVisible()
  await expect(page.getByLabel("Adresse e-mail professionnelle")).toBeVisible()
})

test("le compte de repli rejoint l’accueil vendeur en mode E2E", async ({
  page,
}) => {
  await page.goto("/connexion")
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("agent@setrag.ga")
  await page.getByLabel("Mot de passe").fill("secret-e2e")
  await page.getByRole("button", { name: "Connexion" }).click()
  await expect(page).toHaveURL(/\/vente$/)
  await expect(
    page.getByRole("heading", { name: "Bonjour Nadège" })
  ).toBeVisible()
})

test("AW-V-01 rend l’accueil et ouvre la vente billet", async ({ page }) => {
  await page.goto("/vente")
  const produits = page.getByRole("navigation", { name: "Produits du guichet" })
  await expect(produits).toBeVisible()
  await expect(page.getByText("59 500")).toBeVisible()
  await produits.getByRole("link", { name: /Vendre un billet/ }).click()
  await expect(page).toHaveURL(/\/vente\/billet/)
})

test("AW-V-02 choisit une desserte et une classe", async ({ page }) => {
  await page.goto("/vente/billet")
  await expect(
    page.getByRole("heading", { name: "Vendre un billet", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: /2e classe/ }).click()
  await expect(page.getByRole("button", { name: /2e classe/ })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Express 201 · 2e classe")).toBeVisible()
})

test("AW-V-03 place les voyageurs et tient les places", async ({ page }) => {
  await page.goto("/vente/billet")
  await page.getByRole("button", { name: /2e classe/ }).click()
  await page.getByRole("button", { name: /Choisir les places/ }).click()
  await expect(page).toHaveURL(/etape=places/)
  await page.getByRole("button", { name: "Place 2C, libre" }).click()
  await expect(page.getByRole("button", { name: "Place 2C, voyageur 1" })).toBeVisible()
  await page.getByRole("button", { name: /Saisir les voyageurs/ }).click()
  await expect(page).toHaveURL(/etape=voyageurs/)
  await expect(page.getByText(/Places tenues encore/)).toBeVisible()
})

test("AW-V-07 encaisse en espèces et émet la vente", async ({ page }) => {
  await page.goto("/vente/billet")
  await page.getByRole("button", { name: /2e classe/ }).click()
  await page.getByRole("button", { name: /Choisir les places/ }).click()
  await page.getByRole("button", { name: /Placer côte à côte/ }).click()
  await page.getByRole("button", { name: /Saisir les voyageurs/ }).click()
  await page.getByLabel("Nom").first().fill("Nzé")
  await page.getByLabel("Prénom").first().fill("Aimée")
  await page.getByRole("button", { name: /Passer à l’encaissement|Passer à l'encaissement/ }).click()
  await expect(page.getByRole("heading", { name: "Encaissement" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Montant reçu insuffisant/ })).toBeDisabled()
  await page.getByRole("button", { name: "Montant exact" }).click()
  await page.getByRole("button", { name: /Encaisser 32/ }).click()
  await expect(page).toHaveURL(/\/vente\/confirmation\/vente-e2e/)
})

test("AW-V-08 affiche les billets émis et relance une vente", async ({
  page,
}) => {
  await page.goto("/vente/confirmation/vente-e2e")
  await expect(
    page.getByRole("heading", { name: "Vente enregistrée" })
  ).toBeVisible()
  await expect(page.getByText("Aimée NZÉ")).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Réimprimer \(duplicata\)/ })
  ).toBeEnabled()
  await page.keyboard.press("n")
  await expect(page).toHaveURL(/\/vente\/billet/)
})

test("AW-V-04 rattache et étiquette un bagage", async ({ page }) => {
  await page.goto("/vente/bagage")
  await expect(
    page.getByRole("heading", { name: "Enregistrer un bagage" })
  ).toBeVisible()
  await page.getByLabel("N° de billet ou lecture du code").fill("B-OWE-PV-20261001-006002")
  await page.getByRole("button", { name: "Rechercher" }).click()
  await expect(page.getByText("NZÉ Aimée").first()).toBeVisible()
  await page.getByLabel("Poids total (kg)").fill("23,5")
  await expect(page.getByText("3 233 XAF").first()).toBeVisible()
  await page.getByRole("button", { name: "Montant exact" }).click()
  await page.getByRole("button", { name: /Encaisser et étiqueter/ }).click()
  await expect(page.getByText(/Bagage G-OWE-PV/)).toBeVisible()
})

test("AW-V-05 crée une expédition de colis express", async ({ page }) => {
  await page.goto("/vente/colis")
  await expect(
    page.getByRole("heading", { name: "Expédier un colis" })
  ).toBeVisible()
  await page.getByLabel("Nom ou raison sociale").fill("Marie NZENG")
  await page.getByLabel("Téléphone").first().fill("+241 060000001")
  await page.getByLabel("Nom", { exact: true }).fill("Jean OBAME")
  await page.getByLabel("Téléphone").nth(1).fill("+241 060000002")
  await page.getByLabel("Gare d'arrivée").selectOption({ label: "Moanda" })
  await page.getByLabel("Contenu déclaré · article 1").fill("Pièces détachées")
  await page.getByLabel("Poids (kg)").fill("18")
  await page.getByRole("button", { name: "Montant exact" }).click()
  await page.getByRole("button", { name: /Encaisser et étiqueter/ }).click()
  await expect(page.getByText(/Colis C-OWE-PV/)).toBeVisible()
})

test("AW-V-06 gère les deux prestations spéciales", async ({ page }) => {
  await page.goto("/vente/prestation-speciale?type=funeraire")
  await expect(
    page.getByRole("heading", { name: "Prestation spéciale" })
  ).toBeVisible()
  await expect(page.getByText(/certificat de décès/)).toBeVisible()
  await page.getByRole("radio", { name: "Auto accompagné" }).click()
  await expect(page.getByLabel("N° de billet ou lecture du code")).toBeVisible()
})

test("le portail reste opérable au format tablette", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto("/vente")
  await page.getByRole("button", { name: "Ouvrir le menu" }).click()
  await expect(page.getByRole("navigation", { name: "Menu du portail" })).toBeVisible()
  await page.getByRole("button", { name: "Fermer le menu" }).first().click()
  await expect(
    page.getByRole("navigation", { name: "Produits du guichet" }).getByRole("link", { name: /Vendre un billet/ })
  ).toBeVisible()
})

for (const path of ["/", "/connexion"] as const) {
  test(`${path} se réorganise sans défilement horizontal à 320 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(path)
    await expect(
      page.getByRole("heading", { name: "Ouvrir une session", exact: true })
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}

test("/vente/encaissement reste entièrement visible à 320 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto("/vente/encaissement")
  await expect(page).toHaveURL(/\/vente\/billet/)
  await expectNoHorizontalOverflow(page)
})

test("/vente/billet reste entièrement visible à 320 px après le choix", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto("/vente/billet")
  await expectNoHorizontalOverflow(page)
  await page.getByRole("button", { name: /2e classe/ }).click()
  await expectNoHorizontalOverflow(page)
})

test("/vente/prestation-speciale respecte le reflow WCAG à 320 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto("/vente/prestation-speciale")
  await expect(
    page.getByRole("heading", { name: "Prestation spéciale" })
  ).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test("AW-V-09 ouvre une opération et explique le blocage d’un billet contrôlé", async ({
  page,
}) => {
  await page.goto("/vente/operations")
  await expect(page.getByRole("heading", { name: "Après-vente" })).toBeVisible()
  await page.getByRole("row", { name: /V-OWE-PV-20261001-004812/ }).click()
  await expect(page.getByText(/Contrôlé à bord : ni annulation ni remboursement/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Annuler la vente" })).toBeDisabled()
  await page.getByRole("button", { name: "Fermer le dossier" }).click()
  await page.getByRole("row", { name: /V-OWE-PV-20261001-004820/ }).click()
  await page.getByRole("button", { name: "Annuler la vente" }).click()
  await page.getByRole("button", { name: /Annuler et rendre/ }).click()
  await expect(page.getByText(/Annulation X-OWE-PV/)).toBeVisible()
})

test("AW-V-10 exige une justification avant de clôturer avec écart", async ({ page }) => {
  await page.goto("/vente/caisse")
  await expect(page.getByRole("heading", { name: "Clôturer la caisse" })).toBeVisible()
  await expect(page.getByText("Manque en caisse")).toBeVisible()
  await page.getByRole("button", { name: "Ajouter une coupure de 10 000" }).click()
  await page.getByRole("button", { name: "Clôturer la caisse" }).click()
  await expect(page.getByText(/Justifiez l.écart de .*, ou recomptez le billetage/)).toBeVisible()
  await page.getByLabel("Justification").fill("Fonds recompté : billet de 10 000 manquant")
  await page.getByRole("button", { name: "Clôturer la caisse" }).click()
  await expect(page.getByRole("heading", { name: "Caisse clôturée" })).toBeVisible()
})

test("AW-V-11 ressaisit une souche papier", async ({ page }) => {
  await page.goto("/vente/ventes-manuelles")
  await expect(
    page.getByRole("heading", { name: "Ressaisir les ventes papier" })
  ).toBeVisible()
  await expect(page.getByText("À ressaisir").first()).toBeVisible()
  await expect(page.getByLabel("À")).toContainText("Franceville")
  await page.getByLabel("Heure inscrite").fill("09:47")
  await page.getByLabel("À").selectOption({ label: "Franceville" })
  await page.getByLabel("Voyageur (NOM Prénom)").fill("ESSONO Blaise")
  await page.getByRole("button", { name: "Enregistrer la ressaisie" }).click()
  await expect(page.getByText(/Souche 004202 ressaisie/)).toBeVisible()
})

// Les rubriques de gestion lisent le vrai backend : elles sont couvertes par
// `gestion.reel.spec.ts` (E2E_REEL=1), pas par le mode E2E.
const directionPages = [
  ["/direction", "Vue d’ensemble"],
  ["/direction/activites", "Activité et exploitation"],
  ["/direction/finances", "Finances"],
  ["/direction/risques", "Risques et continuité"],
  ["/direction/decisions", "Décisions attendues"],
] as const

for (const [path, heading] of directionPages) {
  test(`${path} implémente ${heading} et reste responsive`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(path)
    await expect(
      page.getByRole("heading", { name: heading, exact: true })
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}

for (const path of [
  "/vente/operations",
  "/vente/caisse",
  "/vente/ventes-manuelles",
] as const) {
  test(`${path} respecte le reflow à 320 px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(path)
    await expectNoHorizontalOverflow(page)
    await expect(page.getByRole("main")).toBeVisible()
  })
}
