import { expect, test, type Page } from "@playwright/test"

const draft = {
  tripId: "trip-201",
  trainNumber: "TR-201",
  trainType: "omnibus",
  serviceDate: "2026-07-27",
  departureAt: Date.parse("2026-07-27T08:00:00+01:00"),
  arrivalAt: Date.parse("2026-07-27T19:40:00+01:00"),
  originStationId: "station-owendo",
  originName: "Owendo",
  originCode: "OWE",
  destinationStationId: "station-franceville",
  destinationName: "Franceville",
  destinationCode: "FCV",
  fromIndex: 0,
  toIndex: 5,
  serviceClass: "DEUXIEME",
  passengers: [
    {
      firstName: "Ariane",
      lastName: "MBADINGA",
      gender: "F",
      seatId: "seat-1A",
      seatLabel: "1A",
    },
  ],
  distanceKm: 648,
  totalTtc: 23_417,
}

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
    page.getByRole("heading", { name: "Connexion", exact: true })
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
    page.getByRole("heading", { name: "Bonjour, A. MBOUMBA" })
  ).toBeVisible()
})

test("AW-V-01 rend l’accueil et ouvre la vente billet", async ({ page }) => {
  await page.goto("/vente")
  await expect(
    page.getByRole("navigation", {
      name: "Navigation du portail de vente",
    })
  ).toBeVisible()
  await expect(page.getByText("42", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /Billet voyageur/ }).click()
  await expect(page).toHaveURL(/\/vente\/billet/)
})

test("AW-V-02 recherche les dessertes disponibles", async ({ page }) => {
  await page.goto("/vente/billet")
  await expect(
    page.getByRole("heading", { name: "Billet voyageur", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Rechercher les dessertes" }).click()
  await expect(page.getByText("2 desserte(s) disponible(s)")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Choisir TR-201" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Choisir TR-201" }).click()
  await expect(page.getByText("TR-201 sélectionné.")).toBeVisible()
})

test("AW-V-03 choisit une place et prépare l’encaissement", async ({
  page,
}) => {
  await page.goto("/vente/billet")
  await page.getByRole("button", { name: "Rechercher les dessertes" }).click()
  await page.getByRole("button", { name: "Choisir TR-201" }).click()
  await page.getByLabel("Nom", { exact: true }).fill("Mbadinga")
  await page.getByLabel("Prénom").fill("Ariane")
  await page
    .getByRole("button", { name: "Choisir sur le plan de voiture" })
    .click()
  await page.getByRole("button", { name: "Place 1A · libre" }).click()
  await page.getByRole("button", { name: "Confirmer 1/1" }).click()
  await expect(page.getByText("1A", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Passer à l’encaissement" }).click()
  await expect(page).toHaveURL(/\/vente\/encaissement/)
})

test("AW-V-07 encaisse en espèces et émet la vente", async ({ page }) => {
  await page.addInitScript((saleDraft) => {
    window.sessionStorage.setItem(
      "setrag:agent-web:ticket-sale-draft:v1",
      JSON.stringify(saleDraft)
    )
  }, draft)
  await page.goto("/vente/encaissement")
  await expect(
    page.getByRole("heading", { name: "Encaissement" })
  ).toBeVisible()
  await page.getByLabel("Montant remis (FCFA)").fill("30000")
  await expect(page.getByText(/6.*583.*FCFA/)).toBeVisible()
  const validateSale = page.getByRole("button", {
    name: "Valider et émettre",
  })
  await expect(validateSale).toBeEnabled()
  await validateSale.click()
  await expect(page).toHaveURL(/\/vente\/confirmation\/sale-demo-4822/)
})

test("AW-V-08 affiche les billets émis et relance une vente", async ({
  page,
}) => {
  await page.addInitScript(
    ({ saleDraft }) => {
      window.sessionStorage.setItem(
        "setrag:agent-web:last-confirmation:v1",
        JSON.stringify({
          saleId: "sale-demo-4822",
          number: "V-20260726-4822",
          amounts: {
            ht: 19_845,
            vat: 3_572,
            css: 0,
            ttc: 23_417,
            received: 23_417,
          },
          tickets: [
            {
              id: "ticket-demo-1",
              number: "B-4822-1",
              passengerName: "Ariane MBADINGA",
              seatLabel: "1A",
              unitPriceTtc: 23_417,
            },
          ],
          changeDue: 6_583,
          draft: saleDraft,
        })
      )
    },
    { saleDraft: draft }
  )
  await page.goto("/vente/confirmation/sale-demo-4822")
  await expect(
    page.getByRole("heading", { name: "Billets émis avec succès" })
  ).toBeVisible()
  await expect(page.getByText("Ariane MBADINGA")).toBeVisible()
  await expect(page.getByText("BILLET B-4822-1")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "PDF du billet" })
  ).toBeEnabled()
  await page.getByRole("button", { name: "Nouvelle vente" }).click()
  await expect(page).toHaveURL(/\/vente\/billet/)
})

test("AW-V-04 rattache et étiquette un bagage", async ({ page }) => {
  await page.goto("/vente/bagage")
  await expect(page.getByRole("heading", { name: "Bagage" })).toBeVisible()
  await page.getByRole("button", { name: "Rechercher" }).click()
  await expect(page.getByText("Paul MBADINGA")).toBeVisible()
  await expect(page.getByText(/833.*FCFA/)).toBeVisible()
  await page.getByRole("button", { name: "Enregistrer et encaisser" }).click()
  await expect(page.getByText(/Étiquette G-OWE-PV/)).toBeVisible()
})

test("AW-V-05 crée une expédition de colis express", async ({ page }) => {
  await page.goto("/vente/colis")
  await expect(
    page.getByRole("heading", { name: "Colis express" })
  ).toBeVisible()
  await page.getByLabel("Expéditeur · nom").fill("Marie NZENG")
  await page.getByLabel("Téléphone expéditeur").fill("+241 060000001")
  await page.getByLabel("Destinataire · nom").fill("Jean OBAME")
  await page.getByLabel("Téléphone destinataire").fill("+241 060000002")
  await page.getByRole("button", { name: "Enregistrer et encaisser" }).click()
  await expect(page.getByText(/Expédition C-OWE-PV/)).toBeVisible()
})

test("AW-V-06 gère les deux prestations spéciales", async ({ page }) => {
  await page.goto("/vente/prestation-speciale?type=funeraire")
  await expect(
    page.getByRole("heading", { name: "Prestation spéciale" })
  ).toBeVisible()
  await expect(page.getByText(/certificat de décès/)).toBeVisible()
  await page.getByRole("button", { name: "Enregistrer et encaisser" }).click()
  await expect(page.getByText(/Expédition F-OWE/)).toBeVisible()
})

test("le portail reste opérable au format tablette", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto("/vente")
  await page.getByRole("button", { name: "Ouvrir le menu" }).click()
  await expect(
    page.getByRole("navigation", {
      name: "Navigation du portail de vente",
    })
  ).toBeVisible()
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Fermer le menu" })
    .click()
  await expect(
    page.getByRole("button", { name: /Billet voyageur/ })
  ).toBeVisible()
})

for (const path of ["/", "/connexion"] as const) {
  test(`${path} se réorganise sans défilement horizontal à 320 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(path)
    await expect(
      page.getByRole("heading", { name: "Connexion", exact: true })
    ).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}

test("/vente/encaissement reste entièrement visible à 320 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.addInitScript((saleDraft) => {
    window.sessionStorage.setItem(
      "setrag:agent-web:ticket-sale-draft:v1",
      JSON.stringify(saleDraft)
    )
  }, draft)
  await page.goto("/vente/encaissement")
  await expect(
    page.getByRole("heading", { name: "Encaissement" })
  ).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expect(
    page.getByRole("button", { name: "Valider et émettre" })
  ).toBeVisible()
})

test("/vente/billet reste entièrement visible à 320 px après la recherche", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto("/vente/billet")
  await expectNoHorizontalOverflow(page)
  await page.getByRole("button", { name: "Rechercher les dessertes" }).click()
  await expect(page.getByText("2 desserte(s) disponible(s)")).toBeVisible()
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
  await expect(
    page.getByRole("button", { name: "Enregistrer et encaisser" })
  ).toBeVisible()
})

test("le compte Gestion rejoint le back-office en mode E2E", async ({
  page,
}) => {
  await page.goto("/connexion")
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("gestion@setrag.ga")
  await page.getByLabel("Mot de passe").fill("secret-e2e")
  await page.getByRole("button", { name: "Connexion" }).click()
  await expect(page).toHaveURL(/\/gestion$/)
  await expect(
    page.getByRole("heading", { name: "Vue d’ensemble" })
  ).toBeVisible()
})

test("AW-V-09 recherche et annule une opération avec motif", async ({
  page,
}) => {
  await page.goto("/vente/operations")
  await expect(page.getByRole("heading", { name: "Opérations" })).toBeVisible()
  await page.getByLabel("Numéro de vente ou de billet").fill("V-OWE-4821")
  await page.getByRole("button", { name: "Rechercher" }).click()
  await expect(
    page.getByRole("cell", { name: "V-OWE-4821", exact: true })
  ).toBeVisible()
  await page.getByLabel("Motif obligatoire").fill("Erreur de trajet")
  await page.getByRole("button", { name: "Annuler la vente" }).click()
  await expect(page.getByText(/Annulation enregistrée/)).toBeVisible()
})

test("AW-V-10 rapproche et clôture une caisse équilibrée", async ({ page }) => {
  await page.goto("/vente/caisse")
  await expect(page.getByRole("heading", { name: "Ma caisse" })).toBeVisible()
  await expect(page.getByText("Caisse équilibrée")).toBeVisible()
  await page.getByRole("button", { name: "Clôturer ma caisse" }).click()
  await expect(page.getByText(/Caisse clôturée/)).toBeVisible()
})

test("AW-V-11 régularise une vente papier", async ({ page }) => {
  await page.goto("/vente/ventes-manuelles")
  await expect(
    page.getByRole("heading", {
      name: "Ventes manuelles · régularisation",
    })
  ).toBeVisible()
  await page.getByLabel("Nom du voyageur").fill("Mireille OBAME")
  await page
    .getByRole("button", { name: "Enregistrer la vente manuelle" })
    .click()
  await expect(page.getByText(/régularisé sans réémettre/)).toBeVisible()
})

const managementPages = [
  ["/gestion", "Vue d’ensemble"],
  ["/gestion/livrets", "Livrets horaires"],
  ["/gestion/tarifs", "Tarifs"],
  ["/gestion/yield", "Yield management"],
  ["/gestion/trains", "Trains & voitures"],
  ["/gestion/places", "Places — blocage & traçabilité"],
  ["/gestion/points-de-vente", "Points de vente & agences"],
  ["/gestion/voyageurs", "Voyageurs & manifeste"],
  ["/gestion/recettes", "Contrôle des recettes"],
  ["/gestion/comptabilite", "Comptabilité"],
  ["/gestion/rapports", "Rapports & KPI"],
  ["/gestion/incidents", "Procès-verbaux & incidents"],
  ["/gestion/utilisateurs", "Utilisateurs & habilitations"],
  ["/gestion/parametrage", "Paramétrage"],
  ["/gestion/integrations", "Intégrations & supervision"],
  ["/direction", "Vue d’ensemble"],
  ["/direction/activites", "Activité et exploitation"],
  ["/direction/finances", "Finances"],
  ["/direction/risques", "Risques et continuité"],
  ["/direction/decisions", "Décisions attendues"],
] as const

for (const [path, heading] of managementPages) {
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

test("AW-G-12 crée un procès-verbal depuis la desserte choisie", async ({
  page,
}) => {
  await page.goto("/gestion/incidents")
  await page.getByRole("button", { name: "Nouveau procès-verbal" }).click()
  await page.getByLabel("Desserte contrôlée").selectOption("trip-201")
  await page.getByLabel("Nom du contrevenant", { exact: true }).fill("OBAME")
  await page.getByLabel("Prénom du contrevenant", { exact: true }).fill("Jean")
  await page.getByRole("button", { name: "Créer le procès-verbal" }).click()
  await expect(page.getByText(/PV-DEMO-0143 a été créé/)).toBeVisible()
})

test("AW-G-11 programme un rapport avec ses destinataires", async ({
  page,
}) => {
  await page.goto("/gestion/rapports")
  await page.getByRole("button", { name: "Programmer un envoi" }).click()
  await page
    .getByLabel("Destinataires")
    .fill("direction@setrag.ga, controle@setrag.ga")
  await page.getByRole("button", { name: "Confirmer la programmation" }).click()
  await expect(page.getByText(/envoi récurrent a été programmé/i)).toBeVisible()
})

test("AW-G-10 masque l'export comptable sans droit de création", async ({
  page,
}) => {
  await page.goto("/gestion/comptabilite")
  await expect(
    page.getByRole("button", { name: "Exporter le journal" })
  ).toHaveCount(0)
})

test("AW-G-09 contrôle puis clôture une journée rapprochée", async ({
  page,
}) => {
  await page.goto("/gestion/recettes")
  await page
    .getByRole("button", { name: "Clôturer la journée comptable" })
    .click()
  await page.getByRole("button", { name: "Lancer le contrôle" }).click()
  await expect(page.getByText("Ventes : 42")).toBeVisible()
  await page
    .getByRole("button", { name: "Clôturer la journée contrôlée" })
    .click()
  await expect(
    page.getByText(/journée du 2026-07-27 a été clôturée/i)
  ).toBeVisible()
})

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
