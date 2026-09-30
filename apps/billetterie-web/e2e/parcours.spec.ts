import { expect, test } from "@playwright/test"

/**
 * Parcours sur les données du backend de développement : la recherche d'un
 * trajet depuis l'accueil, et Ruban. Aucun paiement n'est déclenché.
 */

test("chercher un trajet depuis l'accueil, sur mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await page.getByRole("button", { name: /Départ/ }).click()
  await page.getByRole("dialog", { name: "Gare de départ" }).getByRole("button", { name: /^Owendo/ }).click()
  await page.getByRole("button", { name: /Arrivée/ }).click()
  await page.getByRole("dialog", { name: "Gare d'arrivée" }).getByRole("button", { name: /^Franceville/ }).click()
  await page.getByRole("button", { name: "Rechercher" }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/resultats\?de=OWE&a=FCV&le=\d{4}-\d{2}-\d{2}&adultes=1&enfants=0/)
})

test("inverser départ et arrivée échange les gares", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Départ/ }).click()
  await page.getByRole("dialog", { name: "Gare de départ" }).getByRole("button", { name: /^Owendo/ }).click()
  await page.getByRole("button", { name: "Inverser départ et arrivée" }).click()
  await expect(page.getByRole("button", { name: /Arrivée.*Owendo/ })).toBeVisible()
})

test("Ruban s'ouvre en fenêtre sur grand écran et propose ses raccourcis", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Ouvrir Ruban, l'assistant" }).click()
  const fenetre = page.getByRole("dialog", { name: "Ruban, l'assistant SETRAG" })
  await expect(fenetre).toBeVisible()
  await expect(fenetre.getByRole("button", { name: "Réserver un trajet" })).toBeVisible()
  await expect(fenetre.getByLabel("Écrire à Ruban")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(fenetre).toBeHidden()
})

test("la charte montre le logo et ses sections", async ({ page }) => {
  await page.goto("/charte")
  await expect(page.getByRole("heading", { level: 1, name: "Une voie, et le ruban qui glisse dessus" })).toBeVisible()
  for (const titre of ["Le logo", "Couleurs", "Le mouvement", "Les composants", "Ruban, l'assistant"]) {
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(titre) })).toBeVisible()
  }
})
