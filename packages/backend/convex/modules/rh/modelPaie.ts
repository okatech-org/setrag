/**
 * Moteur de paie gabonais — logique pure, sans dépendance à Convex.
 *
 * Structure du bulletin et taux : document 05 (« Droit social, paie et
 * charges du Gabon »). Les taux sont regroupés dans `PARAMETRES_PAIE_2026`,
 * daté et sourcé : une évolution légale se traduit par un nouveau jeu de
 * paramètres, jamais par une modification des bulletins déjà calculés (le
 * bulletin conserve le code du jeu appliqué).
 *
 * Tous les montants sont des entiers en francs CFA ; chaque ligne est
 * arrondie à l'unité.
 */

import { ancienneteAnnees, type SituationFamiliale } from "./model"

export interface TrancheIrpp {
  /** Borne basse annuelle par part, en XAF (francs CFA). */
  de: number
  /** Borne haute annuelle par part (exclue pour la dernière tranche). */
  a: number | null
  /** Taux en pour cent. */
  taux: number
}

export const PARAMETRES_PAIE_2026 = {
  code: "GA-PAIE-2026.1",
  libelle: "Paie Gabon 2026 — Code du travail (loi n° 022/2021), CNSS, CNAMGS, CGI",
  applicableDu: "2026-01-01",
  /** Durée légale : 40 h × 52 / 12. */
  heuresMensuelles: 173.33,
  joursMensuels: 30,
  majorations: { hs125: 1.25, hs150: 1.5, hs200: 2 },
  cnss: {
    plafondMensuel: 1_500_000,
    salarieRetraite: 2.5,
    patronalPrestationsFamiliales: 8,
    patronalRisquesProfessionnels: 3,
    patronalRetraite: 5,
  },
  cnamgs: { plafondMensuel: 2_500_000, salarie: 2, patronal: 4.1 },
  tcs: { taux: 5 },
  irpp: {
    /** Abattement forfaitaire pour frais professionnels. */
    abattementFraisPct: 20,
    partsMaximum: 6,
    tranches: [
      { de: 0, a: 1_500_000, taux: 0 },
      { de: 1_500_000, a: 1_920_000, taux: 5 },
      { de: 1_920_000, a: 2_700_000, taux: 10 },
      { de: 2_700_000, a: 3_600_000, taux: 15 },
      { de: 3_600_000, a: 5_160_000, taux: 20 },
      { de: 5_160_000, a: 7_500_000, taux: 25 },
      { de: 7_500_000, a: 11_000_000, taux: 30 },
      { de: 11_000_000, a: null, taux: 35 },
    ] satisfies TrancheIrpp[],
  },
  anciennete: { seuilAnnees: 2, tauxInitialPct: 2, progressionPct: 1, plafondPct: 25 },
  primeTractionParKm: 15,
  indemniteDecoucheParNuit: 12_500,
} as const

export type ParametresPaie = typeof PARAMETRES_PAIE_2026

export interface AgentPaie {
  salaireBaseFcfa: number
  primeFonctionFcfa: number
  primeSujetionFcfa: number
  dateEmbauche: string
  dateSortie?: string
  situationFamiliale: SituationFamiliale
  enfantsACharge: number
}

export interface VariablesPaie {
  heuresSup125: number
  heuresSup150: number
  heuresSup200: number
  kmTraction: number
  nuitsDecouche: number
  primeExceptionnelleFcfa: number
  /** Jours d'absence non rémunérés saisis (en plus des congés sans solde). */
  joursAbsence: number
  avanceSalaireFcfa: number
}

export const VARIABLES_VIDES: VariablesPaie = {
  heuresSup125: 0,
  heuresSup150: 0,
  heuresSup200: 0,
  kmTraction: 0,
  nuitsDecouche: 0,
  primeExceptionnelleFcfa: 0,
  joursAbsence: 0,
  avanceSalaireFcfa: 0,
}

export type SensLigne = "gain" | "gain_non_soumis" | "retenue" | "patronal"

export interface LigneBulletin {
  code: string
  libelle: string
  sens: SensLigne
  base?: number
  /** Taux en pour cent, ou majoration (125 = 125 %). */
  taux?: number
  quantite?: number
  montant: number
}

export interface TotauxBulletin {
  brutSoumis: number
  nonSoumis: number
  brut: number
  assietteCnss: number
  assietteCnamgs: number
  cnssSalarie: number
  cnamgsSalarie: number
  tcs: number
  revenuImposable: number
  parts: number
  irpp: number
  autresRetenues: number
  totalRetenues: number
  net: number
  cnssPatronal: number
  cnamgsPatronal: number
  chargesPatronales: number
  coutEmployeur: number
}

export interface Bulletin {
  parametres: string
  joursPayes: number
  joursAbsenceNonPayee: number
  ancienneteAnnees: number
  lignes: LigneBulletin[]
  totaux: TotauxBulletin
}

const arrondi = (valeur: number) => Math.round(valeur)
const pct = (base: number, taux: number) => arrondi((base * taux) / 100)

/**
 * Nombre de parts du quotient familial gabonais (document 05, §4.1) :
 * 1 part pour une personne seule, 2 pour un couple marié, une demi-part par
 * enfant à charge, plafonné à 6 parts.
 */
export function partsFiscales(
  situation: SituationFamiliale,
  enfants: number,
  parametres: ParametresPaie = PARAMETRES_PAIE_2026
): number {
  if (!Number.isInteger(enfants) || enfants < 0) {
    throw new Error("Le nombre d'enfants à charge doit être un entier positif.")
  }
  const base = situation === "marie" ? 2 : 1
  return Math.min(parametres.irpp.partsMaximum, base + enfants * 0.5)
}

/** Impôt annuel d'une part, au barème progressif par tranches. */
export function impotParPart(
  revenuAnnuelParPart: number,
  tranches: readonly TrancheIrpp[] = PARAMETRES_PAIE_2026.irpp.tranches
): number {
  let impot = 0
  for (const tranche of tranches) {
    if (revenuAnnuelParPart <= tranche.de) break
    const haut =
      tranche.a === null ? revenuAnnuelParPart : Math.min(revenuAnnuelParPart, tranche.a)
    impot += ((haut - tranche.de) * tranche.taux) / 100
  }
  return impot
}

/**
 * IRPP mensuel retenu à la source : revenu net de cotisations sociales,
 * abattement pour frais professionnels, annualisation, quotient familial.
 */
export function irppMensuel(
  revenuImposableMensuel: number,
  parts: number,
  parametres: ParametresPaie = PARAMETRES_PAIE_2026
): number {
  if (revenuImposableMensuel <= 0) return 0
  const annuel =
    revenuImposableMensuel * 12 * (1 - parametres.irpp.abattementFraisPct / 100)
  const impotAnnuel = impotParPart(annuel / parts, parametres.irpp.tranches) * parts
  return arrondi(impotAnnuel / 12)
}

/** Taux de la prime d'ancienneté : 2 % à 2 ans, +1 % par an, plafond 25 %. */
export function tauxAnciennete(
  annees: number,
  parametres: ParametresPaie = PARAMETRES_PAIE_2026
): number {
  const regle = parametres.anciennete
  if (annees < regle.seuilAnnees) return 0
  return Math.min(
    regle.plafondPct,
    regle.tauxInitialPct + (annees - regle.seuilAnnees) * regle.progressionPct
  )
}

function controlerVariables(variables: VariablesPaie) {
  const bornes: [keyof VariablesPaie, string, number][] = [
    ["heuresSup125", "Les heures supplémentaires à 125 %", 200],
    ["heuresSup150", "Les heures supplémentaires à 150 %", 200],
    ["heuresSup200", "Les heures supplémentaires à 200 %", 200],
    ["kmTraction", "Les kilomètres de traction", 20_000],
    ["nuitsDecouche", "Les nuits de découché", 31],
    ["primeExceptionnelleFcfa", "La prime exceptionnelle", 50_000_000],
    ["joursAbsence", "Les jours d'absence", 30],
    ["avanceSalaireFcfa", "L'avance sur salaire", 50_000_000],
  ]
  for (const [cle, libelle, max] of bornes) {
    const valeur = variables[cle]
    if (!Number.isFinite(valeur) || valeur < 0 || valeur > max) {
      throw new Error(`${libelle} doit être compris entre 0 et ${max}.`)
    }
  }
}

/** Jours de présence de l'agent sur la période (prorata d'entrée et de sortie). */
export function joursDePresence(
  agent: Pick<AgentPaie, "dateEmbauche" | "dateSortie">,
  periode: { debut: string; fin: string },
  parametres: ParametresPaie = PARAMETRES_PAIE_2026
): number {
  const debut = agent.dateEmbauche > periode.debut ? agent.dateEmbauche : periode.debut
  const fin =
    agent.dateSortie && agent.dateSortie < periode.fin ? agent.dateSortie : periode.fin
  if (debut > fin) return 0
  if (debut === periode.debut && fin === periode.fin) return parametres.joursMensuels
  const jours =
    Math.round(
      (Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${debut}T12:00:00Z`)) / 86_400_000
    ) + 1
  return Math.min(parametres.joursMensuels, jours)
}

/**
 * Calcule le bulletin d'un agent pour une période.
 *
 * @param absencesNonPayees jours de congé sans solde ou d'absence injustifiée
 *   validés sur la période, ajoutés aux jours d'absence saisis.
 */
export function calculerBulletin(
  agent: AgentPaie,
  periode: { debut: string; fin: string },
  variables: VariablesPaie = VARIABLES_VIDES,
  absencesNonPayees = 0,
  parametres: ParametresPaie = PARAMETRES_PAIE_2026
): Bulletin {
  controlerVariables(variables)
  for (const [valeur, libelle] of [
    [agent.salaireBaseFcfa, "Le salaire de base"],
    [agent.primeFonctionFcfa, "La prime de fonction"],
    [agent.primeSujetionFcfa, "La prime de sujétion"],
  ] as const) {
    if (!Number.isInteger(valeur) || valeur < 0) {
      throw new Error(`${libelle} doit être un montant entier positif.`)
    }
  }

  const lignes: LigneBulletin[] = []
  const joursPresence = joursDePresence(agent, periode, parametres)
  const joursAbsence = Math.min(joursPresence, variables.joursAbsence + absencesNonPayees)
  const joursPayes = Math.max(0, joursPresence - joursAbsence)
  const prorata = joursPayes / parametres.joursMensuels

  const base = arrondi(agent.salaireBaseFcfa * prorata)
  lignes.push({
    code: "1000",
    libelle: "Salaire de base",
    sens: "gain",
    base: agent.salaireBaseFcfa,
    quantite: joursPayes,
    montant: base,
  })

  const annees = ancienneteAnnees(agent.dateEmbauche, periode.fin)
  const taux = tauxAnciennete(annees, parametres)
  if (taux > 0) {
    lignes.push({
      code: "1100",
      libelle: `Prime d'ancienneté (${annees} ans)`,
      sens: "gain",
      base,
      taux,
      montant: pct(base, taux),
    })
  }
  if (agent.primeFonctionFcfa > 0) {
    lignes.push({
      code: "1200",
      libelle: "Prime de fonction et de technicité",
      sens: "gain",
      montant: arrondi(agent.primeFonctionFcfa * prorata),
    })
  }
  if (agent.primeSujetionFcfa > 0) {
    lignes.push({
      code: "1300",
      libelle: "Prime de sujétion (nuit, brousse)",
      sens: "gain",
      montant: arrondi(agent.primeSujetionFcfa * prorata),
    })
  }
  if (variables.kmTraction > 0) {
    lignes.push({
      code: "1400",
      libelle: "Prime de traction",
      sens: "gain",
      quantite: variables.kmTraction,
      base: parametres.primeTractionParKm,
      montant: arrondi(variables.kmTraction * parametres.primeTractionParKm),
    })
  }
  const tauxHoraire = agent.salaireBaseFcfa / parametres.heuresMensuelles
  const heuresSup = [
    ["1510", "Heures supplémentaires à 125 %", variables.heuresSup125, parametres.majorations.hs125],
    ["1520", "Heures supplémentaires à 150 %", variables.heuresSup150, parametres.majorations.hs150],
    ["1530", "Heures supplémentaires à 200 %", variables.heuresSup200, parametres.majorations.hs200],
  ] as const
  for (const [code, libelle, quantite, majoration] of heuresSup) {
    if (quantite > 0) {
      lignes.push({
        code,
        libelle,
        sens: "gain",
        quantite,
        base: arrondi(tauxHoraire),
        taux: majoration * 100,
        montant: arrondi(quantite * tauxHoraire * majoration),
      })
    }
  }
  if (variables.primeExceptionnelleFcfa > 0) {
    lignes.push({
      code: "1600",
      libelle: "Prime exceptionnelle",
      sens: "gain",
      montant: arrondi(variables.primeExceptionnelleFcfa),
    })
  }
  if (variables.nuitsDecouche > 0) {
    lignes.push({
      code: "1900",
      libelle: "Indemnité de découché (non soumise)",
      sens: "gain_non_soumis",
      quantite: variables.nuitsDecouche,
      base: parametres.indemniteDecoucheParNuit,
      montant: arrondi(variables.nuitsDecouche * parametres.indemniteDecoucheParNuit),
    })
  }

  const brutSoumis = lignes
    .filter((ligne) => ligne.sens === "gain")
    .reduce((total, ligne) => total + ligne.montant, 0)
  const nonSoumis = lignes
    .filter((ligne) => ligne.sens === "gain_non_soumis")
    .reduce((total, ligne) => total + ligne.montant, 0)

  const assietteCnss = Math.min(brutSoumis, parametres.cnss.plafondMensuel)
  const assietteCnamgs = Math.min(brutSoumis, parametres.cnamgs.plafondMensuel)
  const cnssSalarie = pct(assietteCnss, parametres.cnss.salarieRetraite)
  const cnamgsSalarie = pct(assietteCnamgs, parametres.cnamgs.salarie)
  lignes.push(
    {
      code: "3100",
      libelle: "CNSS — retraite (part salariale)",
      sens: "retenue",
      base: assietteCnss,
      taux: parametres.cnss.salarieRetraite,
      montant: cnssSalarie,
    },
    {
      code: "3200",
      libelle: "CNAMGS — assurance maladie (part salariale)",
      sens: "retenue",
      base: assietteCnamgs,
      taux: parametres.cnamgs.salarie,
      montant: cnamgsSalarie,
    }
  )

  const tcs = pct(brutSoumis, parametres.tcs.taux)
  lignes.push({
    code: "4100",
    libelle: "TCS — taxe complémentaire sur les salaires",
    sens: "retenue",
    base: brutSoumis,
    taux: parametres.tcs.taux,
    montant: tcs,
  })

  const parts = partsFiscales(agent.situationFamiliale, agent.enfantsACharge, parametres)
  const revenuImposable = Math.max(0, brutSoumis - cnssSalarie - cnamgsSalarie)
  const irpp = irppMensuel(revenuImposable, parts, parametres)
  lignes.push({
    code: "4200",
    libelle: `IRPP — barème progressif (${String(parts).replace(".", ",")} part${parts > 1 ? "s" : ""})`,
    sens: "retenue",
    base: revenuImposable,
    montant: irpp,
  })

  const autresRetenues = arrondi(variables.avanceSalaireFcfa)
  if (autresRetenues > 0) {
    lignes.push({
      code: "5100",
      libelle: "Remboursement d'avance sur salaire",
      sens: "retenue",
      montant: autresRetenues,
    })
  }

  const cnssPf = pct(assietteCnss, parametres.cnss.patronalPrestationsFamiliales)
  const cnssAt = pct(assietteCnss, parametres.cnss.patronalRisquesProfessionnels)
  const cnssRetraite = pct(assietteCnss, parametres.cnss.patronalRetraite)
  const cnamgsPatronal = pct(assietteCnamgs, parametres.cnamgs.patronal)
  lignes.push(
    {
      code: "6100",
      libelle: "CNSS — prestations familiales",
      sens: "patronal",
      base: assietteCnss,
      taux: parametres.cnss.patronalPrestationsFamiliales,
      montant: cnssPf,
    },
    {
      code: "6200",
      libelle: "CNSS — accidents du travail et maladies professionnelles",
      sens: "patronal",
      base: assietteCnss,
      taux: parametres.cnss.patronalRisquesProfessionnels,
      montant: cnssAt,
    },
    {
      code: "6300",
      libelle: "CNSS — retraite (part patronale)",
      sens: "patronal",
      base: assietteCnss,
      taux: parametres.cnss.patronalRetraite,
      montant: cnssRetraite,
    },
    {
      code: "6400",
      libelle: "CNAMGS — assurance maladie (part patronale)",
      sens: "patronal",
      base: assietteCnamgs,
      taux: parametres.cnamgs.patronal,
      montant: cnamgsPatronal,
    }
  )

  const totalRetenues = cnssSalarie + cnamgsSalarie + tcs + irpp + autresRetenues
  const net = brutSoumis + nonSoumis - totalRetenues
  if (net < 0) {
    throw new Error(
      "Le net à payer serait négatif : réduisez l'avance sur salaire retenue ce mois-ci."
    )
  }
  const cnssPatronal = cnssPf + cnssAt + cnssRetraite
  const chargesPatronales = cnssPatronal + cnamgsPatronal

  return {
    parametres: parametres.code,
    joursPayes,
    joursAbsenceNonPayee: joursAbsence,
    ancienneteAnnees: annees,
    lignes,
    totaux: {
      brutSoumis,
      nonSoumis,
      brut: brutSoumis + nonSoumis,
      assietteCnss,
      assietteCnamgs,
      cnssSalarie,
      cnamgsSalarie,
      tcs,
      revenuImposable,
      parts,
      irpp,
      autresRetenues,
      totalRetenues,
      net,
      cnssPatronal,
      cnamgsPatronal,
      chargesPatronales,
      coutEmployeur: brutSoumis + nonSoumis + chargesPatronales,
    },
  }
}

export interface TotauxPeriode {
  effectif: number
  brut: number
  net: number
  cnssSalarie: number
  cnssPatronal: number
  cnamgsSalarie: number
  cnamgsPatronal: number
  irpp: number
  tcs: number
  coutEmployeur: number
}

export function totaliserPeriode(totaux: readonly TotauxBulletin[]): TotauxPeriode {
  return totaux.reduce<TotauxPeriode>(
    (cumul, t) => ({
      effectif: cumul.effectif + 1,
      brut: cumul.brut + t.brut,
      net: cumul.net + t.net,
      cnssSalarie: cumul.cnssSalarie + t.cnssSalarie,
      cnssPatronal: cumul.cnssPatronal + t.cnssPatronal,
      cnamgsSalarie: cumul.cnamgsSalarie + t.cnamgsSalarie,
      cnamgsPatronal: cumul.cnamgsPatronal + t.cnamgsPatronal,
      irpp: cumul.irpp + t.irpp,
      tcs: cumul.tcs + t.tcs,
      coutEmployeur: cumul.coutEmployeur + t.coutEmployeur,
    }),
    {
      effectif: 0,
      brut: 0,
      net: 0,
      cnssSalarie: 0,
      cnssPatronal: 0,
      cnamgsSalarie: 0,
      cnamgsPatronal: 0,
      irpp: 0,
      tcs: 0,
      coutEmployeur: 0,
    }
  )
}
