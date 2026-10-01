"use client"

import { ArrowLeftRight, CalendarDays, Check, Info, MapPin, Minus, Plus, Search, TrainFront, TriangleAlert } from "lucide-react"
import { useState } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { Tag } from "@workspace/ui/components/tag"
import { Voie } from "@workspace/ui/components/voie"
import { PastilleDesserte } from "@workspace/ui/voyage/statut"
import { cn } from "@workspace/ui/lib/utils"

import {
  CLASSES,
  SEUIL_PLACES_RARES,
  dateCourte,
  duree,
  heure,
  jourDeService,
  lendemain,
  libelleClasse,
  montant,
  nomTrain,
  xaf,
  type Classe,
} from "@/lib/agent-data"
import type { BrouillonVente } from "@/lib/sale-draft"

import { LimiteErreur } from "./cadre"
import { useLecture, type Categorie, type Desserte, type Gare } from "./donnees"
import { BarreVente } from "./elements"
import {
  MAX_VOYAGEURS,
  categoriesGuichet,
  estPartie,
  etatClasse,
  libelleCategorie,
  resumeVente,
  totalVoyageurs,
} from "./vente-billet"

/* ═══════════════════════════ Critères du trajet ═══════════════════════════ */

function CompteurVoyageurs({
  libelle,
  valeur,
  onChange,
  plafond,
}: {
  libelle: string
  valeur: number
  onChange: (valeur: number) => void
  plafond: boolean
}) {
  const bouton =
    "grid size-11 shrink-0 place-items-center rounded-pill border border-line-strong bg-surface text-accent-ink transition-colors hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-surface"
  return (
    <div role="group" aria-label={libelle} className="flex min-h-13 min-w-0 flex-[1_1_220px] items-center justify-between gap-2 rounded-md border border-line-strong bg-surface py-1 pr-1 pl-3">
      <span className="min-w-0 truncate text-[14px]">{libelle}</span>
      <span className="flex items-center gap-1">
        <button type="button" className={bouton} disabled={valeur <= 0} onClick={() => onChange(valeur - 1)} aria-label={`Retirer : ${libelle.toLowerCase()}`}>
          <Minus aria-hidden className="size-4" />
        </button>
        <output aria-live="polite" className="tabular min-w-[22px] text-center text-[16px] font-semibold">
          {valeur}
        </output>
        <button type="button" className={bouton} disabled={plafond} onClick={() => onChange(valeur + 1)} aria-label={`Ajouter : ${libelle.toLowerCase()}`}>
          <Plus aria-hidden className="size-4" />
        </button>
      </span>
    </div>
  )
}

export interface CriteresRecherche {
  origineId: string
  arriveeId: string
  date: string
}

function FormulaireTrajet({
  brouillon,
  gares,
  categories,
  onCriteres,
  onComptes,
}: {
  brouillon: BrouillonVente
  gares: readonly Gare[]
  categories: readonly Categorie[]
  onCriteres: (criteres: CriteresRecherche) => void
  onComptes: (comptes: Record<string, number>) => void
}) {
  const [saisie, setSaisie] = useState<CriteresRecherche>({ origineId: brouillon.origineId, arriveeId: brouillon.arriveeId, date: brouillon.date })
  const [erreur, setErreur] = useState("")
  const total = totalVoyageurs(brouillon.comptes)

  const rechercher = (criteres = saisie) => {
    if (!criteres.origineId || !criteres.arriveeId) return setErreur("Choisissez la gare de départ et la gare d'arrivée.")
    if (criteres.origineId === criteres.arriveeId) return setErreur("Les gares de départ et d'arrivée doivent être différentes.")
    if (!criteres.date) return setErreur("Choisissez la date de départ.")
    setErreur("")
    onCriteres(criteres)
  }

  const listeGares = (id: string) =>
    gares.map((gare) => (
      <option key={gare._id} value={gare._id} disabled={gare._id === id}>
        {gare.name}
      </option>
    ))

  return (
    <form
      className="grid gap-3 rounded-md border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault()
        rechercher()
      }}
    >
      <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <Field label="De" htmlFor="trajet-origine">
          <SelectNative id="trajet-origine" value={saisie.origineId} onChange={(event) => setSaisie({ ...saisie, origineId: event.target.value })}>
            {listeGares(saisie.arriveeId)}
          </SelectNative>
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Inverser le départ et l'arrivée"
          className="justify-self-center md:mb-1"
          onClick={() => {
            const inverse = { ...saisie, origineId: saisie.arriveeId, arriveeId: saisie.origineId }
            setSaisie(inverse)
            rechercher(inverse)
          }}
        >
          <ArrowLeftRight />
        </Button>
        <Field label="À" htmlFor="trajet-arrivee">
          <SelectNative id="trajet-arrivee" value={saisie.arriveeId} onChange={(event) => setSaisie({ ...saisie, arriveeId: event.target.value })}>
            {listeGares(saisie.origineId)}
          </SelectNative>
        </Field>
        <Field label="Date de départ" htmlFor="trajet-date">
          <Input id="trajet-date" type="date" value={saisie.date} min={jourDeService()} onChange={(event) => setSaisie({ ...saisie, date: event.target.value })} />
        </Field>
        <Button type="submit" variant="secondary" size="lg" className="w-full md:w-auto">
          <Search aria-hidden />
          Rechercher
        </Button>
      </div>
      <div className="grid gap-1.5">
        <span className="text-[13px] font-medium">Voyageurs</span>
        <div className="flex flex-wrap gap-2">
          {["", ...categoriesGuichet(categories).map((c) => c.code)].map((code) => (
            <CompteurVoyageurs
              key={code || "adulte"}
              libelle={libelleCategorie(code, categories, "compteur")}
              valeur={brouillon.comptes[code] ?? 0}
              plafond={total >= MAX_VOYAGEURS}
              onChange={(valeur) => {
                const suivants = { ...brouillon.comptes, [code]: Math.max(0, valeur) }
                if (totalVoyageurs(suivants) >= 1) onComptes(suivants)
              }}
            />
          ))}
        </div>
      </div>
      {erreur ? (
        <p role="alert" className="text-[13px] font-medium text-danger-ink">
          {erreur}
        </p>
      ) : null}
    </form>
  )
}

/* ═════════════════════════════ Dessertes ══════════════════════════════════ */

function CaseClasse({
  desserte,
  classe,
  voyageurs,
  choisie,
  onChoisir,
}: {
  desserte: Desserte
  classe: Classe
  voyageurs: number
  choisie: boolean
  onChoisir: () => void
}) {
  const offre = desserte.classes[classe]
  const libelle = CLASSES.find((c) => c.code === classe)!.libelle
  const base = "grid min-h-[76px] grid-cols-[1fr_auto] content-center gap-x-2 gap-y-1 border-t border-line px-4 py-3 text-left lg:border-t-0 lg:border-l"
  if (!offre) {
    return (
      <div className={cn(base, "text-ink-muted")}>
        <b className="text-[14px] font-bold">{libelle}</b>
        <small className="col-span-2 text-[12px]">{desserte.status === "annule" ? "—" : "Pas de voiture"}</small>
      </div>
    )
  }
  const etat = etatClasse(desserte, classe, voyageurs)
  const rares = offre.disponibles > 0 && offre.disponibles <= SEUIL_PLACES_RARES
  return (
    <button
      type="button"
      aria-pressed={choisie}
      disabled={!etat.vendable}
      onClick={onChoisir}
      className={cn(
        base,
        "transition-colors duration-[var(--dur-fast)] hover:bg-surface-sunk disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
        choisie && "bg-accent-soft shadow-[inset_0_0_0_2px_var(--c-accent)] hover:bg-accent-soft"
      )}
    >
      <b className="flex items-center gap-1 text-[14px] font-bold">
        {choisie ? <Check aria-hidden className="size-4 text-accent-ink" /> : null}
        {libelle}
      </b>
      <span className={cn("text-right text-[16px] font-bold tabular-nums", !etat.vendable && "line-through")}>
        {offre.prixAdulteTtc !== null ? montant(offre.prixAdulteTtc) : "—"}
      </span>
      <small className="col-span-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
        {etat.vendable ? (
          <>
            {rares ? <TriangleAlert aria-hidden className="size-3.5 text-warning-ink" /> : null}
            <span className={cn(rares && "text-warning-ink")}>
              {rares ? "Plus que " : ""}
              <span className="tabular">{offre.disponibles}</span> place{offre.disponibles > 1 ? "s" : ""} libre{offre.disponibles > 1 ? "s" : ""}
            </span>
          </>
        ) : (
          etat.raison
        )}
      </small>
    </button>
  )
}

function LigneDesserte({
  desserte,
  voyageurs,
  choix,
  onChoisir,
}: {
  desserte: Desserte
  voyageurs: number
  choix: { tripId: string; classe: Classe } | null
  onChoisir: (classe: Classe) => void
}) {
  const choisie = choix?.tripId === desserte.tripId
  const supprimee = desserte.status === "annule"
  const partie = !supprimee && estPartie(desserte)
  return (
    <article
      className={cn(
        "grid overflow-hidden rounded-md border bg-surface lg:grid-cols-[260px_repeat(3,minmax(0,1fr))]",
        choisie ? "border-accent-line" : "border-line"
      )}
      aria-label={`${nomTrain(desserte.trainType, desserte.trainNumber)}, départ ${heure(desserte.departAt)}`}
    >
      <div className="grid content-center gap-1.5 px-4 py-3">
        <div className={cn("tabular flex items-center gap-2.5 text-[20px] font-semibold", supprimee && "text-ink-muted line-through decoration-2")}>
          {heure(desserte.departAt)}
          {/* Seule la desserte choisie porte le ruban : ailleurs, la voie reste nue. */}
          <Voie etat={choisie ? "pleine" : "vide"} className="min-w-10" />
          {heure(desserte.arriveeAt)}
          {lendemain(desserte.departAt, desserte.arriveeAt) ? <sup className="text-[11px] text-ink-muted">+1</sup> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-ink-muted">
          <Tag tone="neutral">
            <TrainFront aria-hidden />
            {nomTrain(desserte.trainType, desserte.trainNumber)}
          </Tag>
          {partie ? <Tag tone="neutral">Parti</Tag> : <PastilleDesserte statut={desserte.status} retard={desserte.delayMinutes} />}
          <span>
            {duree(desserte.departAt, desserte.arriveeAt)} · {desserte.arretsIntermediaires} arrêt{desserte.arretsIntermediaires > 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 lg:contents">
        {CLASSES.map((c) => (
          <CaseClasse
            key={c.code}
            desserte={desserte}
            classe={c.code}
            voyageurs={voyageurs}
            choisie={choisie && choix?.classe === c.code}
            onChoisir={() => onChoisir(c.code)}
          />
        ))}
      </div>
    </article>
  )
}

function ListeDessertes({
  brouillon,
  dessertes,
  onChoisir,
  onDate,
}: {
  brouillon: BrouillonVente
  dessertes: readonly Desserte[] | undefined
  onChoisir: (desserte: Desserte, classe: Classe) => void
  onDate: (date: string) => void
}) {
  if (dessertes === undefined) {
    return (
      <div className="grid gap-2" role="status" aria-label="Recherche des dessertes">
        <SkeletonLines />
        <SkeletonLines />
      </div>
    )
  }
  if (dessertes.length === 0) {
    const lendemainDate = jourDeService(Date.parse(`${brouillon.date}T12:00:00Z`), 1)
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState
          title={`Aucun train ne relie ces gares le ${dateCourte(brouillon.date)}`}
          description="Le livret horaire en vigueur ne prévoit pas de desserte ce jour-là sur ce trajet."
          action={
            <Button type="button" variant="secondary" onClick={() => onDate(lendemainDate)}>
              <CalendarDays aria-hidden />
              Voir le {dateCourte(lendemainDate)}
            </Button>
          }
        />
      </div>
    )
  }
  const choix = brouillon.desserte ? { tripId: brouillon.desserte.tripId, classe: brouillon.desserte.classe } : null
  return (
    <div className="grid gap-2" aria-label="Dessertes du jour">
      {dessertes.map((desserte) => (
        <LigneDesserte
          key={desserte.tripId}
          desserte={desserte}
          voyageurs={brouillon.voyageurs.length}
          choix={choix}
          onChoisir={(classe) => onChoisir(desserte, classe)}
        />
      ))}
    </div>
  )
}

/* ═══════════════════════════════ Étape ════════════════════════════════════ */

/** Dessertes du trajet saisi, au tarif du guichet pour le groupe. */
function useDessertes(brouillon: BrouillonVente) {
  return useLecture(
    api.functions.guichet.dessertes,
    brouillon.origineId && brouillon.arriveeId && brouillon.origineId !== brouillon.arriveeId
      ? {
          originStationId: brouillon.origineId as never,
          destinationStationId: brouillon.arriveeId as never,
          serviceDate: brouillon.date,
          discountCodes: brouillon.voyageurs.map((v) => v.categorie),
        }
      : "skip"
  )
}

export function EtapeTrajet(props: {
  brouillon: BrouillonVente
  gares: readonly Gare[]
  categories: readonly Categorie[]
  bloque: boolean
  onCriteres: (criteres: CriteresRecherche) => void
  onComptes: (comptes: Record<string, number>) => void
  onChoisir: (desserte: Desserte, classe: Classe) => void
  onSuivant: () => void
}) {
  return (
    <LimiteErreur titre="Les dessertes n'ont pas pu être lues.">
      <ContenuTrajet {...props} />
    </LimiteErreur>
  )
}

function ContenuTrajet({
  brouillon,
  gares,
  categories,
  bloque,
  onCriteres,
  onComptes,
  onChoisir,
  onSuivant,
}: Parameters<typeof EtapeTrajet>[0]) {
  const dessertes = useDessertes(brouillon)
  const reductions = categoriesGuichet(categories)
  const choisie = brouillon.desserte ? dessertes?.find((d) => d.tripId === brouillon.desserte!.tripId) : undefined
  const classe = brouillon.desserte?.classe
  const vendable = choisie && classe ? etatClasse(choisie, classe, brouillon.voyageurs.length).vendable : false
  const total = choisie && classe ? (choisie.classes[classe]?.totalTtc ?? undefined) : undefined
  return (
    <>
      <FormulaireTrajet
        key={`${brouillon.origineId}-${brouillon.arriveeId}-${brouillon.date}`}
        brouillon={brouillon}
        gares={gares}
        categories={categories}
        onCriteres={onCriteres}
        onComptes={onComptes}
      />
      <section className="grid gap-2" aria-label="Dessertes et disponibilités">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
          <MapPin aria-hidden className="size-4" />
          {gares.find((g) => g._id === brouillon.origineId)?.name ?? "—"} → {gares.find((g) => g._id === brouillon.arriveeId)?.name ?? "—"} ·{" "}
          {dateCourte(brouillon.date, true)}
        </div>
        <ListeDessertes
          brouillon={brouillon}
          dessertes={dessertes}
          onChoisir={onChoisir}
          onDate={(date) => onCriteres({ origineId: brouillon.origineId, arriveeId: brouillon.arriveeId, date })}
        />
      </section>
      <p className="flex items-start gap-2 text-[13px] text-ink-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Prix par adulte, taxes comprises.
          {reductions.map((r) => ` ${r.label} : −${r.ratePct} %.`).join("")} Les places restantes se lisent en direct ; les places choisies sont tenues
          pendant la saisie et l&apos;encaissement.
        </span>
      </p>
      <BarreVente
        titre={brouillon.desserte ? `${nomTrain(brouillon.desserte.trainType, brouillon.desserte.trainNumber)} · ${libelleClasse(brouillon.desserte.classe)}` : "Choisissez une desserte et une classe"}
        resume={resumeVente(brouillon)}
        total={total !== undefined ? xaf(total) : undefined}
        action={{ libelle: "Choisir les places", touche: "Entrée", onClick: onSuivant, disabled: bloque || !vendable }}
      />
    </>
  )
}
