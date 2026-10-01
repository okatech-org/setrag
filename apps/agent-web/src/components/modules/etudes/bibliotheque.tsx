"use client"

import { ArrowRight, BookOpen, Download, FileDown, ListChecks, MessageSquareText, Search, TriangleAlert } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useEffect, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"

import { Indicateur, Indicateurs, LienBouton, Panneau, suffixeDate, telechargerCsv } from "@/components/charte"
import { dateCourte } from "@/components/gestion/referentiels/format"
import { DocumentButton } from "@/components/document-button"

import { CadreEtudes } from "./cadre"
import { TagGravite, TagStatutConstat } from "./statuts"

const jour = (date: string) => dateCourte(Date.parse(`${date}T12:00:00Z`))

function Recherche() {
  const [saisie, setSaisie] = useState("")
  const [texte, setTexte] = useState("")
  useEffect(() => {
    const minuteur = window.setTimeout(() => setTexte(saisie.trim()), 300)
    return () => window.clearTimeout(minuteur)
  }, [saisie])
  const resultats = useQuery(api.modules.etudes.queries.rechercher, texte.length >= 2 ? { texte } : "skip")
  return (
    <Panneau titre="Rechercher dans les études" icone={Search}>
      <label className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14.5px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
        <Search aria-hidden className="size-4 text-ink-muted" />
        <span className="sr-only">Rechercher dans les études</span>
        <input
          type="search"
          value={saisie}
          onChange={(event) => setSaisie(event.target.value)}
          placeholder="manganèse, SYSCOHADA, parapheur, PCA…"
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-faint"
        />
      </label>
      {texte.length < 2 ? null : resultats === undefined ? (
        <SkeletonLines />
      ) : resultats.length === 0 ? (
        <p className="text-small text-ink-muted" role="status">
          Aucun passage ne contient « {texte} ».
        </p>
      ) : (
        <ul className="grid gap-2" aria-label="Résultats de la recherche">
          {resultats.map((resultat) => (
            <li key={resultat._id}>
              <Link
                href={`/etudes/${resultat.code}#${resultat.ancre}` as Route}
                className="grid gap-0.5 rounded-md border border-line px-3 py-2.5 hover:bg-surface-sunk"
              >
                <small className="text-[12.5px] text-ink-muted">
                  <span className="tabular">{resultat.numero}</span> · {resultat.etude}
                </small>
                <b className="text-[14px] font-semibold">{resultat.section}</b>
                <span className="text-[13.5px] text-ink-muted">{resultat.extrait}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  )
}

/** Accueil de l'espace : la bibliothèque des études et les priorités du plan d'actions. */
export function Bibliotheque() {
  const donnees = useQuery(api.modules.etudes.queries.bibliotheque, {})

  const exporter = () => {
    if (!donnees) return
    telechargerCsv(
      `bibliotheque-etudes-${suffixeDate()}`,
      [
        { libelle: "N°", valeur: (e) => e.numero },
        { libelle: "Titre", valeur: (e) => e.titre },
        { libelle: "Catégorie", valeur: (e) => e.categorie },
        { libelle: "Résumé", valeur: (e) => e.resume },
        { libelle: "Mots", valeur: (e) => e.mots },
        { libelle: "Annotations ouvertes", valeur: (e) => e.annotationsOuvertes },
        { libelle: "Actions ouvertes", valeur: (e) => e.constatsOuverts },
        { libelle: "Mise à jour", valeur: (e) => new Date(e.updatedAt) },
      ],
      donnees.etudes
    )
  }

  return (
    <CadreEtudes
      titre="Audit et documents"
      description="Les études du système d'exploitation intégré, le dossier de recette de la Direction générale et le livre blanc, consultables, annotables et reliés au plan d'actions d'audit."
      actions={
        <Button type="button" variant="secondary" onClick={exporter} disabled={!donnees}>
          <Download />
          Exporter le catalogue
        </Button>
      }
    >
      {donnees === undefined ? (
        <SkeletonLines />
      ) : (
        <>
          <Indicateurs colonnes={5}>
            <Indicateur libelle="Études publiées" icone={BookOpen} valeur={donnees.indicateurs.etudes} />
            <Indicateur
              libelle="Annotations ouvertes"
              icone={MessageSquareText}
              valeur={donnees.indicateurs.annotationsOuvertes}
              evolution={{ sens: "neutre", texte: "Questions et réserves à traiter" }}
            />
            <Indicateur libelle="Actions ouvertes" icone={ListChecks} valeur={donnees.indicateurs.constatsOuverts} />
            <Indicateur
              libelle="Actions en retard"
              icone={TriangleAlert}
              valeur={donnees.indicateurs.constatsEnRetard}
              evolution={
                donnees.indicateurs.constatsEnRetard > 0
                  ? { sens: "baisse", texte: "Échéance dépassée" }
                  : { sens: "neutre", texte: "Aucune échéance dépassée" }
              }
            />
            <Indicateur
              libelle="À vérifier par l'audit"
              valeur={donnees.indicateurs.aVerifier}
              evolution={{ sens: donnees.indicateurs.aVerifier > 0 ? "vigilance" : "neutre", texte: "Actions réalisées" }}
            />
          </Indicateurs>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
            <Recherche />
            <Panneau
              titre="Priorités du plan d'actions"
              icone={ListChecks}
              actions={
                <LienBouton href="/etudes/plan-actions" variante="ghost" taille="sm">
                  Plan d&apos;actions
                  <ArrowRight />
                </LienBouton>
              }
            >
              {donnees.priorites.length === 0 ? (
                <p className="text-small text-ink-muted">Aucune action ouverte.</p>
              ) : (
                <ul className="grid gap-2">
                  {donnees.priorites.map((action) => (
                    <li key={action._id}>
                      <Link
                        href={`/etudes/plan-actions/${action._id}` as Route}
                        className="grid gap-1 rounded-md border border-line px-3 py-2.5 hover:bg-surface-sunk"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="tabular text-[12.5px] text-ink-muted">{action.reference}</span>
                          <TagGravite gravite={action.gravite} />
                          {action.aMoi ? <small className="text-[12.5px] font-semibold text-accent-ink">à vous</small> : null}
                        </span>
                        <b className="text-[14px] font-semibold">{action.titre}</b>
                        <small className={action.enRetard ? "text-[12.5px] font-semibold text-danger-ink" : "text-[12.5px] text-ink-muted"}>
                          {action.enRetard ? "En retard · " : ""}échéance <span className="tabular">{jour(action.echeance)}</span> · {action.responsable}
                        </small>
                        <TagStatutConstat statut={action.statut} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panneau>
          </div>

          {donnees.etudes.length === 0 ? (
            <EmptyState
              title="Bibliothèque vide"
              description="Les études n'ont pas encore été chargées en base : lancez le chargement de la bibliothèque (seed des études)."
            />
          ) : (
            <section aria-label="Études" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {donnees.etudes.map((etude) => (
                <article key={etude._id} className="grid content-between gap-4 rounded-md border border-line bg-surface p-4">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-[13px] font-bold text-ink-muted">{etude.numero}</span>
                      <Tag tone="neutral">{etude.categorie}</Tag>
                    </div>
                    <h2 className="text-[17px] leading-snug font-bold">
                      <Link href={`/etudes/${etude.code}` as Route} className="hover:underline">
                        {etude.titre}
                      </Link>
                    </h2>
                    <p className="text-[14px] text-ink-muted">{etude.resume}</p>
                    <small className="text-[12.5px] text-ink-muted">
                      <span className="tabular">{etude.mots.toLocaleString("fr-FR")}</span> mots ·{" "}
                      <span className="tabular">{etude.annotationsOuvertes}</span> annotation(s) ouverte(s) ·{" "}
                      <span className="tabular">{etude.constatsOuverts}</span> action(s) ouverte(s)
                    </small>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <LienBouton href={`/etudes/${etude.code}`} variante="secondary" taille="sm">
                      <BookOpen />
                      Lire
                    </LienBouton>
                    {etude.fichierPdf ? (
                      <DocumentButton file={etude.fichierPdf} variant="ghost" size="sm">
                        <FileDown className="size-4" />
                        PDF
                      </DocumentButton>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </CadreEtudes>
  )
}
