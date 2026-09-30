import { expect, test, type Page } from "@playwright/test"

/**
 * Chaque écran s'ouvre, en bureau comme en mobile, sans erreur de page ni
 * débordement horizontal, avec le bon chrome : l'en-tête du site sur grand
 * écran ; sur mobile, la barre d'onglets sur les seuls écrans racines.
 */
/** Dans deux jours, à Libreville : une date toujours vendable. */
const DANS_DEUX_JOURS = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Libreville" }).format(Date.now() + 2 * 86_400_000)

const ECRANS = [
  { chemin: "/", racine: true },
  { chemin: "/billets", racine: true },
  { chemin: "/compte", racine: true },
  { chemin: `/resultats?de=OWE&a=FCV&le=${DANS_DEUX_JOURS}&adultes=1&enfants=0`, racine: false },
  { chemin: "/suivi", racine: false },
  { chemin: "/connexion", racine: false },
  { chemin: "/notifications", racine: false },
  { chemin: "/compte/messageries", racine: false },
  { chemin: "/compte/ruban", racine: false },
  { chemin: "/tarifs", racine: false },
  { chemin: "/bagages", racine: false },
  { chemin: "/aide", racine: false },
  { chemin: "/conditions", racine: false },
  { chemin: "/presentation", racine: false },
  { chemin: "/charte", racine: false },
  { chemin: "/assistant", racine: false },
] as const

const MOBILE = { width: 390, height: 844 }

async function ouvrir(page: Page, chemin: string) {
  const erreurs: string[] = []
  page.on("pageerror", (erreur) => erreurs.push(String(erreur)))
  const reponse = await page.goto(chemin, { waitUntil: "domcontentloaded" })
  expect(reponse?.status() ?? 0).toBeLessThan(400)
  await page.waitForLoadState("networkidle").catch(() => {})
  return erreurs
}

async function sansDebordement(page: Page) {
  const { visible, contenu } = await page.evaluate(() => ({
    visible: document.documentElement.clientWidth,
    contenu: document.documentElement.scrollWidth,
  }))
  expect(contenu, "débordement horizontal").toBeLessThanOrEqual(visible + 1)
}

for (const { chemin, racine } of ECRANS) {
  test(`bureau · ${chemin}`, async ({ page }) => {
    const erreurs = await ouvrir(page, chemin)
    await expect(page.getByRole("navigation", { name: "Navigation principale", exact: true })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Onglets", exact: true })).toBeHidden()
    expect(erreurs).toEqual([])
  })

  test(`mobile · ${chemin}`, async ({ page }) => {
    await page.setViewportSize(MOBILE)
    const erreurs = await ouvrir(page, chemin)
    await expect(page.getByRole("navigation", { name: "Navigation principale", exact: true })).toBeHidden()
    const onglets = page.getByRole("navigation", { name: "Onglets", exact: true })
    if (racine) await expect(onglets).toBeVisible()
    else await expect(onglets).toHaveCount(0)
    await sansDebordement(page)
    expect(erreurs).toEqual([])
  })
}

test("une adresse inconnue affiche la page introuvable", async ({ page }) => {
  const reponse = await page.goto("/cette-page-n-existe-pas")
  expect(reponse?.status()).toBe(404)
})
