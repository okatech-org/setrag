/**
 * Exports de données du portail : CSV lisible par Excel en français
 * (séparateur « ; », BOM UTF-8, décimales à virgule) et impression PDF via la
 * feuille de style d'impression du navigateur.
 */

export type ValeurExport = string | number | boolean | null | undefined | Date

export interface ColonneExport<T> {
  libelle: string
  valeur: (ligne: T) => ValeurExport
}

const dateHeure = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})

function cellule(valeur: ValeurExport) {
  if (valeur === null || valeur === undefined) return ""
  if (valeur instanceof Date) return dateHeure.format(valeur)
  if (typeof valeur === "boolean") return valeur ? "oui" : "non"
  if (typeof valeur === "number") return Number.isInteger(valeur) ? String(valeur) : String(valeur).replace(".", ",")
  const texte = String(valeur)
  return /[";\n\r]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte
}

/** Contenu CSV (sans BOM) — séparé pour les tests. */
export function versCsv<T>(colonnes: readonly ColonneExport<T>[], lignes: readonly T[]) {
  const entete = colonnes.map((colonne) => cellule(colonne.libelle)).join(";")
  const corps = lignes.map((ligne) => colonnes.map((colonne) => cellule(colonne.valeur(ligne))).join(";"))
  return [entete, ...corps].join("\r\n")
}

/** Déclenche le téléchargement d'un fichier texte produit dans le navigateur. */
export function telechargerTexte(nomFichier: string, contenu: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([type.startsWith("text/csv") ? `﻿${contenu}` : contenu], { type })
  const url = URL.createObjectURL(blob)
  const lien = document.createElement("a")
  lien.href = url
  lien.download = nomFichier
  document.body.append(lien)
  lien.click()
  lien.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function telechargerCsv<T>(nomFichier: string, colonnes: readonly ColonneExport<T>[], lignes: readonly T[]) {
  telechargerTexte(nomFichier.endsWith(".csv") ? nomFichier : `${nomFichier}.csv`, versCsv(colonnes, lignes))
}

/** Suffixe daté pour les noms de fichiers : « 2026-10-01 ». */
export function suffixeDate(date = new Date()) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(date)
}
