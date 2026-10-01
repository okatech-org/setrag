"use client"

import type { FunctionReturnType } from "convex/server"
import { CalendarDays, Download, MapPin, Printer, Search, TrainFront, UserSearch, Users } from "lucide-react"
import { useState, type FormEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, Panneau, TableauDonnees, suffixeDate, telechargerCsv, type ColonneTableau, type ColonneExport } from "@/components/charte"

import { CadreGestion } from "./cadre"
import { useDroitsGestion } from "./droits"
import { DateFiltre, RetourOperation, SelectFiltre, useOperation } from "./elements"
import { aujourdhuiService, CATEGORIES_REDUCTION, CLASSES, dateHeure, dateService, heure, libelleDesserte, nombre } from "./format"
import { Pastille } from "./statuts"
import { MentionMasquage, RESULTATS_CONTROLE, TagControle, TelephoneMasque } from "./voyageurs-commun"

export type Extraction = FunctionReturnType<typeof api.functions.referentiels.extraireManifeste>
export type Passager = Extraction["lignes"][number]

export const categorie = (p: Pick<Passager, "categorie">) => (p.categorie ? (CATEGORIES_REDUCTION[p.categorie] ?? p.categorie) : "Adulte")
export const placeDe = (p: Pick<Passager, "voiture" | "place" | "debout">) => (p.debout ? `${p.voiture ?? "?"} · debout` : `${p.voiture ?? "?"} · ${p.place ?? "?"}`)
export const controleTexte = (p: Pick<Passager, "controle">) =>
  p.controle ? `${RESULTATS_CONTROLE[p.controle.result]?.libelle ?? p.controle.result} · ${dateHeure(p.controle.at)}` : "À contrôler"

/** Colonnes du manifeste exporté : les téléphones y restent masqués. */
export const COLONNES_MANIFESTE: ColonneExport<Passager>[] = [
  { libelle: "Nom", valeur: (p) => p.nom },
  { libelle: "Prénom", valeur: (p) => p.prenom },
  { libelle: "Catégorie", valeur: categorie },
  { libelle: "Billet", valeur: (p) => p.number },
  { libelle: "Train", valeur: (p) => p.trainNumber },
  { libelle: "Date", valeur: (p) => p.serviceDate },
  { libelle: "Origine", valeur: (p) => p.origine },
  { libelle: "Destination", valeur: (p) => p.destination },
  { libelle: "Classe", valeur: (p) => CLASSES[p.serviceClass].court },
  { libelle: "Place", valeur: placeDe },
  { libelle: "Téléphone (masqué)", valeur: (p) => p.telephone },
  { libelle: "Nationalité", valeur: (p) => p.nationalite },
  { libelle: "Bagages", valeur: (p) => p.bagages },
  { libelle: "Contrôle", valeur: controleTexte },
]

interface Filtres {
  date: string
  tripId: string
  stationId: string
  recherche: string
}

export function VoyageursManifeste() {
  const droits = useDroitsGestion()
  const [filtres, setFiltres] = useState<Filtres>({ date: aujourdhuiService(), tripId: "", stationId: "", recherche: "" })
  const [extraction, setExtraction] = useState<(Extraction & { filtres: Filtres }) | null>(null)
  const dessertes = useQuery(api.functions.referentiels.dessertes, droits.may("donnees_voyageurs") ? { serviceDate: filtres.date, pour: "voyageurs" } : "skip")
  const stations = useQuery(api.functions.referential.listStations, {})
  const extraire = useMutation(api.functions.referentiels.extraireManifeste)
  const journaliser = useMutation(api.functions.referentiels.journaliserExportManifeste)
  const operation = useOperation()

  const lancer = async (event?: FormEvent) => {
    event?.preventDefault()
    const demande = { ...filtres }
    const resultat = await operation.executer("extraire", () =>
      extraire({
        tripId: demande.tripId ? (demande.tripId as never) : undefined,
        serviceDate: demande.tripId ? undefined : demande.date,
        stationId: demande.stationId ? (demande.stationId as never) : undefined,
        recherche: demande.recherche.trim() || undefined,
      })
    )
    if (resultat) setExtraction({ ...resultat, filtres: demande })
  }

  const exporter = async () => {
    if (!extraction) return
    const train = extraction.dessertes.length === 1 ? extraction.dessertes[0]!.trainNumber : "dessertes"
    telechargerCsv(`manifeste-${train}-${extraction.filtres.date}-${suffixeDate()}`, COLONNES_MANIFESTE, extraction.lignes)
    await operation.executer("journal", () =>
      journaliser({
        tripId: extraction.filtres.tripId ? (extraction.filtres.tripId as never) : undefined,
        serviceDate: extraction.filtres.date,
        format: "csv",
        voyageurs: extraction.lignes.length,
      }).then(() => true)
    )
  }

  const imprimer = () => {
    const f = extraction?.filtres ?? filtres
    const parametres = new URLSearchParams({ date: f.date })
    if (f.tripId) parametres.set("desserte", f.tripId)
    if (f.stationId) parametres.set("gare", f.stationId)
    if (f.recherche.trim()) parametres.set("q", f.recherche.trim())
    window.open(`/gestion/voyageurs/manifeste?${parametres.toString()}`, "_blank", "noopener")
  }

  const lignes = extraction?.lignes
  const controles = lignes?.filter((p) => p.controle).length ?? 0
  const desserteUnique = extraction?.dessertes.length === 1 ? extraction.dessertes[0] : null

  const colonnes: ColonneTableau<Passager>[] = [
    {
      cle: "voyageur",
      libelle: "Voyageur",
      rendu: (p) => <CelluleDouble haut={`${p.nom} ${p.prenom}`} bas={`${categorie(p)}${p.bagages ? ` · ${p.bagages} bagage${p.bagages > 1 ? "s" : ""}` : ""}`} />,
      tri: (p) => `${p.nom} ${p.prenom}`,
    },
    { cle: "billet", libelle: "Billet", rendu: (p) => <span className="tabular">{p.number}</span>, tri: (p) => p.number },
    { cle: "trajet", libelle: "Trajet", rendu: (p) => `${p.origine} → ${p.destination}`, tri: (p) => p.origine, secondaire: true },
    { cle: "place", libelle: "Place", rendu: (p) => <span className="tabular">{placeDe(p)}</span>, tri: (p) => placeDe(p) },
    { cle: "telephone", libelle: "Téléphone", rendu: (p) => <TelephoneMasque ticketId={p.ticketId} masque={p.telephone} />, tri: (p) => p.telephone ?? "", secondaire: true },
    { cle: "nationalite", libelle: "Nationalité", rendu: (p) => p.nationalite ?? "—", tri: (p) => p.nationalite ?? "", secondaire: true },
    { cle: "controle", libelle: "Contrôle", rendu: (p) => <TagControle controle={p.controle} heure={p.controle ? heure(p.controle.at) : undefined} />, tri: (p) => p.controle?.at ?? 0, export: controleTexte },
  ]

  return (
    <CadreGestion
      surtitre="Commercial · extraction"
      titre="Voyageurs et manifeste"
      description="Liste nominative d'une circulation, pour l'équipe de bord, la sûreté ou une réclamation. Chaque extraction est journalisée : qui, quand, quel filtre."
    >
      <form onSubmit={lancer} className="flex flex-wrap items-center gap-2">
        <DateFiltre libelle="Date de circulation" icone={CalendarDays} value={filtres.date} onChange={(date) => setFiltres((f) => ({ ...f, date, tripId: "" }))} />
        <SelectFiltre libelle="Desserte" icone={TrainFront} value={filtres.tripId} onChange={(tripId) => setFiltres((f) => ({ ...f, tripId }))} className="min-w-[220px]">
          <option value="">Toutes les dessertes du jour</option>
          {dessertes?.map((d) => (
            <option key={d.id} value={d.id}>
              {libelleDesserte(d)}
            </option>
          ))}
        </SelectFiltre>
        <SelectFiltre libelle="Gare de montée ou de descente" icone={MapPin} value={filtres.stationId} onChange={(stationId) => setFiltres((f) => ({ ...f, stationId }))}>
          <option value="">Toutes gares</option>
          {stations?.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </SelectFiltre>
        <label className="flex min-h-11 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14.5px] focus-within:border-accent-base focus-within:shadow-[var(--focus-ring)]">
          <UserSearch aria-hidden className="size-4 text-ink-muted" />
          <span className="sr-only">Nom, numéro de billet ou téléphone</span>
          <input
            type="search"
            value={filtres.recherche}
            onChange={(event) => setFiltres((f) => ({ ...f, recherche: event.target.value }))}
            placeholder="Nom, n° de billet, téléphone"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-faint focus-visible:shadow-none"
          />
        </label>
        <Button type="submit" variant="secondary" loading={operation.enCours === "extraire"} loadingLabel="Extraction…">
          <Search />
          Extraire la liste
        </Button>
        <Button type="button" onClick={() => void exporter()} disabled={!lignes || lignes.length === 0}>
          <Download />
          Exporter le manifeste
        </Button>
      </form>
      <RetourOperation retour={operation.retour?.ton === "danger" ? operation.retour : null} />

      {!extraction ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState
            title="Choisissez une circulation, puis extrayez la liste"
            description="Sans desserte choisie, l'extraction couvre toutes les dessertes du jour. Chaque extraction est inscrite au journal d'audit."
          />
        </div>
      ) : (
        <Panneau
          plein
          titre={`${nombre(extraction.lignes.length)} voyageur${extraction.lignes.length > 1 ? "s" : ""}`}
          icone={Users}
          sousTitre={
            desserteUnique
              ? `${libelleDesserte(desserteUnique)} · ${dateService(desserteUnique.serviceDate)}`
              : `${extraction.dessertes.length} desserte(s) · ${dateService(extraction.filtres.date)}`
          }
          actions={
            <>
              <Pastille ton="success">{nombre(controles)} contrôlés</Pastille>
              <Pastille ton="warning">{nombre(extraction.lignes.length - controles)} à contrôler</Pastille>
              <Button type="button" variant="ghost" size="sm" onClick={imprimer}>
                <Printer />
                Imprimer (PDF)
              </Button>
            </>
          }
          pied={<MentionMasquage />}
        >
          {extraction.tronque ? (
            <div className="px-4 pt-3">
              <InlineMessage tone="warning" title="Liste tronquée à 1 500 voyageurs.">
                Précisez la desserte ou la gare.
              </InlineMessage>
            </div>
          ) : null}
          <div className="p-3">
            <TableauDonnees
              libelle="Manifeste voyageurs"
              colonnes={colonnes}
              lignes={extraction.lignes}
              cle={(p) => p.ticketId}
              lien={(p) => `/gestion/voyageurs/${p.ticketId}`}
              recherche={{ placeholder: "Affiner dans la liste…", texte: (p) => `${p.nom} ${p.prenom} ${p.number} ${p.origine} ${p.destination}` }}
              triInitial={{ cle: "voyageur", sens: "asc" }}
              parPage={50}
              vide={{ titre: "Aucun voyageur", description: "Aucun titre valide ne correspond à ces filtres." }}
            />
          </div>
          <p className="px-4 pb-3 text-[12.5px] text-ink-muted">
            Extraction du <span className="tabular">{dateHeure(extraction.generatedAt)}</span>. La liste ne se met pas à jour seule : relancez l’extraction pour voir les derniers contrôles.
          </p>
        </Panneau>
      )}
    </CadreGestion>
  )
}
