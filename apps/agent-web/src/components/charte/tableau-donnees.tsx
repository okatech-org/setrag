"use client"

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Printer, Search } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { cn } from "@workspace/ui/lib/utils"

import { signalerNavigation } from "@/coquille/filet-navigation"

import { suffixeDate, telechargerCsv, type ValeurExport } from "./exporter"

export interface ColonneTableau<T> {
  cle: string
  libelle: string
  /** Rendu de la cellule. */
  rendu: (ligne: T) => ReactNode
  /** Valeur de tri ; la colonne n'est triable que si elle est fournie. */
  tri?: (ligne: T) => string | number | null | undefined
  /** Valeur exportée ; par défaut la valeur de tri. `false` exclut la colonne. */
  export?: ((ligne: T) => ValeurExport) | false
  /** Nombres et montants : alignés à droite, chiffres tabulaires. */
  numerique?: boolean
  /** Masquée sous md (garde les colonnes essentielles sur petit écran). */
  secondaire?: boolean
  className?: string
}

export interface TableauDonneesProps<T> {
  colonnes: readonly ColonneTableau<T>[]
  lignes: readonly T[] | undefined
  cle: (ligne: T) => string
  /** Libellé accessible du tableau. */
  libelle: string
  /** Ouvre le dossier d'une ligne (lien). */
  lien?: (ligne: T) => string | undefined
  /** Ou une action au clic (tiroir de détail). */
  surLigne?: (ligne: T) => void
  /** Ligne mise en évidence (dossier ouvert à côté). */
  selection?: string
  /** Recherche plein texte sur ces champs. */
  recherche?: { placeholder: string; texte: (ligne: T) => string }
  /** Filtres propres à l'écran, rendus à gauche de la recherche. */
  filtres?: ReactNode
  /** Nom de base du fichier exporté ; sans lui, pas d'export. */
  exportNom?: string
  /** Bouton d'impression (PDF via le navigateur). */
  imprimable?: boolean
  /** Tri initial. */
  triInitial?: { cle: string; sens: "asc" | "desc" }
  parPage?: number
  vide: { titre: ReactNode; description?: ReactNode; action?: ReactNode }
  /** Ligne de total, rendue en pied. */
  pied?: ReactNode
  /** Actions supplémentaires dans la barre d'outils (à droite). */
  outils?: ReactNode
  className?: string
}

function comparer(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), "fr", { numeric: true, sensitivity: "base" })
}

const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

/**
 * Tableau dense du portail : tri, recherche, pagination, export CSV, lien vers
 * le dossier de chaque ligne. Une liste sans détail ni export n'a pas sa place
 * au back-office ; ce composant les rend systématiques.
 */
export function TableauDonnees<T>({
  colonnes,
  lignes,
  cle,
  libelle,
  lien,
  surLigne,
  selection,
  recherche,
  filtres,
  exportNom,
  imprimable,
  triInitial,
  parPage = 25,
  vide,
  pied,
  outils,
  className,
}: TableauDonneesProps<T>) {
  const router = useRouter()
  const [requete, setRequete] = useState("")
  const [tri, setTri] = useState(triInitial ?? null)
  const [page, setPage] = useState(0)

  const filtrees = useMemo(() => {
    if (!lignes) return undefined
    const q = normaliser(requete.trim())
    const base = q && recherche ? lignes.filter((ligne) => normaliser(recherche.texte(ligne)).includes(q)) : [...lignes]
    const colonne = tri ? colonnes.find((c) => c.cle === tri.cle) : undefined
    if (colonne?.tri) {
      const valeur = colonne.tri
      base.sort((a, b) => comparer(valeur(a), valeur(b)) * (tri!.sens === "asc" ? 1 : -1))
    }
    return base
  }, [lignes, requete, recherche, tri, colonnes])

  const total = filtrees?.length ?? 0
  const pages = Math.max(1, Math.ceil(total / parPage))
  const pageCourante = Math.min(page, pages - 1)
  const visibles = filtrees?.slice(pageCourante * parPage, (pageCourante + 1) * parPage)

  const exporter = () => {
    if (!filtrees || !exportNom) return
    const exportables = colonnes
      .filter((c) => c.export !== false && (c.export || c.tri))
      .map((c) => ({ libelle: c.libelle, valeur: (c.export || c.tri) as (ligne: T) => ValeurExport }))
    telechargerCsv(`${exportNom}-${suffixeDate()}`, exportables, filtrees)
  }

  const ouvrir = (ligne: T) => {
    if (surLigne) return surLigne(ligne)
    const href = lien?.(ligne)
    if (href) {
      signalerNavigation()
      router.push(href as Route)
    }
  }
  const cliquable = Boolean(surLigne || lien)
  const auClavier = (event: KeyboardEvent, ligne: T) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      ouvrir(ligne)
    }
  }

  const barre = recherche || filtres || exportNom || imprimable || outils
  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      {barre ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {filtres}
          {recherche ? (
            <label className="flex min-h-11 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14.5px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
              <Search aria-hidden className="size-4 text-ink-muted" />
              <span className="sr-only">{recherche.placeholder}</span>
              <input
                type="search"
                value={requete}
                onChange={(event) => {
                  setRequete(event.target.value)
                  setPage(0)
                }}
                placeholder={recherche.placeholder}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-faint focus-visible:shadow-none"
              />
            </label>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {outils}
            {imprimable ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
                <Printer />
                Imprimer
              </Button>
            ) : null}
            {exportNom ? (
              <Button type="button" variant="secondary" size="sm" onClick={exporter} disabled={!filtrees || total === 0}>
                <Download />
                Exporter ({total})
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {visibles === undefined ? (
        <SkeletonLines />
      ) : total === 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState
            title={requete ? "Aucun résultat pour cette recherche" : vide.titre}
            description={requete ? "Vérifiez l'orthographe, ou cherchez un numéro complet." : vide.description}
            action={
              requete ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setRequete("")}>
                  Effacer la recherche
                </Button>
              ) : (
                vide.action
              )
            }
          />
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full border-collapse text-[14px]" aria-label={libelle}>
            <thead>
              <tr>
                {colonnes.map((colonne) => {
                  const triee = tri?.cle === colonne.cle
                  const Icone = triee ? (tri!.sens === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
                  return (
                    <th
                      key={colonne.cle}
                      scope="col"
                      aria-sort={triee ? (tri!.sens === "asc" ? "ascending" : "descending") : undefined}
                      className={cn(
                        "bg-surface-sunk px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-[0.05em] whitespace-nowrap text-ink-muted uppercase",
                        colonne.numerique && "text-right",
                        colonne.secondaire && "hidden md:table-cell"
                      )}
                    >
                      {colonne.tri ? (
                        <button
                          type="button"
                          className={cn("inline-flex min-h-8 items-center gap-1 uppercase hover:text-ink", colonne.numerique && "flex-row-reverse")}
                          onClick={() => setTri(triee && tri!.sens === "asc" ? { cle: colonne.cle, sens: "desc" } : { cle: colonne.cle, sens: triee ? "asc" : colonne.numerique ? "desc" : "asc" })}
                        >
                          {colonne.libelle}
                          <Icone aria-hidden className={cn("size-3.5", !triee && "opacity-40")} />
                        </button>
                      ) : (
                        colonne.libelle
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visibles.map((ligne) => {
                const id = cle(ligne)
                const choisie = selection === id
                return (
                  <tr
                    key={id}
                    tabIndex={cliquable ? 0 : undefined}
                    aria-selected={selection !== undefined ? choisie : undefined}
                    onClick={cliquable ? () => ouvrir(ligne) : undefined}
                    onKeyDown={cliquable ? (event) => auClavier(event, ligne) : undefined}
                    className={cn(
                      "border-t border-line",
                      cliquable && "cursor-pointer hover:bg-surface-sunk focus-visible:bg-surface-sunk",
                      choisie && "bg-accent-soft shadow-[inset_3px_0_0_var(--c-accent)] hover:bg-accent-soft"
                    )}
                  >
                    {colonnes.map((colonne) => (
                      <td
                        key={colonne.cle}
                        className={cn(
                          "px-3.5 py-2.5 align-middle",
                          colonne.numerique && "text-right whitespace-nowrap tabular-nums",
                          colonne.secondaire && "hidden md:table-cell",
                          colonne.className
                        )}
                      >
                        {colonne.rendu(ligne)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
            {pied ? <tfoot className="border-t-2 border-line-strong bg-surface-sunk font-bold">{pied}</tfoot> : null}
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-2 text-[13px] text-ink-muted print:hidden">
          <span className="tabular-nums">
            {pageCourante * parPage + 1}–{Math.min((pageCourante + 1) * parPage, total)} sur {total}
          </span>
          <Button type="button" variant="ghost" size="icon" aria-label="Page précédente" disabled={pageCourante === 0} onClick={() => setPage(pageCourante - 1)}>
            <ChevronLeft />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Page suivante" disabled={pageCourante >= pages - 1} onClick={() => setPage(pageCourante + 1)}>
            <ChevronRight />
          </Button>
        </nav>
      ) : null}
    </div>
  )
}

/** Cellule principale : libellé en gras et précision en dessous. */
export function CelluleDouble({ haut, bas, mono }: { haut: ReactNode; bas?: ReactNode; mono?: boolean }) {
  return (
    <span className="grid min-w-0">
      {/* Un numéro (vente, billet, souche) ne se coupe pas : il se dicte d'un trait. */}
      <span className={cn("font-semibold", mono && "tabular text-[13px] whitespace-nowrap")}>{haut}</span>
      {bas ? <small className={cn("text-[12.5px] text-ink-muted", mono && "tabular whitespace-nowrap")}>{bas}</small> : null}
    </span>
  )
}
