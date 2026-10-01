"use client"

import type { FunctionReturnType } from "convex/server"
import {
  Accessibility,
  Armchair,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Route as RouteIcon,
  Trash2,
  TrainFront,
  Upload,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type ChangeEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { Fiche, Indicateur, Indicateurs, Panneau, telechargerTexte } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import { Encart, Historique, RetourOperation, useOperation } from "./gestion/referentiels/elements"
import {
  CLASSES,
  dateService,
  libelleDesserte,
  nombre,
  ORDRE_CLASSES,
  ORDRE_TYPES_TRAIN,
  TYPES_TRAIN,
  type ClasseService,
  type TypeTrain,
} from "./gestion/referentiels/format"
import { FenetreFormulaire, texte } from "./gestion/referentiels/formulaire"
import { Pastille, TagActif, TagDesserte } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

type DossierTrain = NonNullable<FunctionReturnType<typeof api.functions.referentiels.train>>
type Voiture = DossierTrain["voitures"][number]

/* ============================================================ Composition */

/** Voiture dessinée : caisse, deux essieux. VIP et 1re se lisent aussi au libellé. */
function Caisse({
  label,
  classe,
  places,
  choisie,
  onClick,
}: {
  label: string
  classe?: ClasseService
  places?: number
  choisie?: boolean
  onClick?: () => void
}) {
  const contenu = (
    <>
      <span
        aria-hidden
        className={cn(
          "relative grid h-12 w-24 place-items-center rounded-[10px] border-2 bg-surface font-mono text-[13px] font-bold text-ink",
          classe === "VIP" ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]" : classe === "PREMIERE" ? "border-accent-line" : "border-line-strong",
          choisie && "bg-accent-soft",
          !classe && "w-28 rounded-[22px_10px_10px_10px] bg-surface-sunk"
        )}
      >
        {classe ? label : <TrainFront className="size-5" />}
        <span className="absolute -bottom-[7px] left-3.5 size-2.5 rounded-full bg-ink-muted" />
        <span className="absolute right-3.5 -bottom-[7px] size-2.5 rounded-full bg-ink-muted" />
      </span>
      <span className="mt-2 text-[12px] leading-tight text-ink-muted">
        {classe ? (
          <>
            <b className="block font-semibold text-ink">{CLASSES[classe].court}</b>
            <span className="tabular-nums">{places}</span> places
          </>
        ) : (
          label
        )}
      </span>
    </>
  )
  if (!onClick) return <div className="grid shrink-0 justify-items-center text-center">{contenu}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={choisie}
      aria-label={`Voiture ${label}, ${classe ? CLASSES[classe].long : ""}, ${places ?? 0} places`}
      className="grid min-h-11 shrink-0 justify-items-center rounded-md px-0.5 pt-1 pb-1 text-center"
    >
      {contenu}
    </button>
  )
}

export function Composition({
  voitures,
  selection,
  onSelect,
  locomotive = "Locomotive",
}: {
  voitures: readonly { label: string; serviceClass: ClasseService; seatCount: number; _id?: string }[]
  selection?: string | null
  onSelect?: (label: string) => void
  locomotive?: string
}) {
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pt-2 pb-3" role="list" aria-label="Composition du train">
      <div role="listitem">
        <Caisse label={locomotive} />
      </div>
      {voitures.map((voiture) => (
        <div role="listitem" key={voiture._id ?? voiture.label}>
          <Caisse
            label={voiture.label}
            classe={voiture.serviceClass}
            places={voiture.seatCount}
            choisie={selection === voiture.label}
            onClick={onSelect ? () => onSelect(voiture.label) : undefined}
          />
        </div>
      ))}
      {voitures.length === 0 ? <p className="text-small self-center text-ink-muted">Aucune voiture : la composition est vide.</p> : null}
    </div>
  )
}

/** Plan d'une voiture, place par place ; PMR et strapontins portent un repère écrit. */
export function PlanVoiture({ voiture }: { voiture: Voiture }) {
  const colonnes = Math.max(1, voiture.columnCount)
  return (
    <div className="grid gap-2">
      <div
        className="grid w-fit max-w-full gap-1 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${colonnes}, minmax(40px, 44px))` }}
        role="grid"
        aria-label={`Plan de la voiture ${voiture.label}`}
      >
        {voiture.seats.map((seat) => (
          <span
            key={seat._id}
            role="gridcell"
            style={{ gridRow: seat.row, gridColumn: seat.column }}
            title={`${seat.label}${seat.kind === "pmr" ? " · mobilité réduite" : seat.kind === "strapontin" ? " · strapontin" : ""}`}
            className={cn(
              "tabular grid h-9 place-items-center rounded-[6px] border text-[11.5px]",
              seat.kind === "pmr" ? "border-info bg-info-soft text-info-ink" : seat.kind === "strapontin" ? "border-dashed border-line-strong bg-surface" : "border-line bg-surface-sunk",
              !seat.isActive && "opacity-40"
            )}
          >
            <span className="inline-flex items-center gap-0.5">
              {seat.kind === "pmr" ? <Accessibility aria-hidden className="size-3" /> : null}
              {seat.label}
              {seat.kind === "pmr" ? <span className="sr-only"> (mobilité réduite)</span> : seat.kind === "strapontin" ? <span className="sr-only"> (strapontin)</span> : null}
            </span>
          </span>
        ))}
      </div>
      <p className="flex flex-wrap gap-4 text-[12.5px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded-[3px] border border-line bg-surface-sunk" aria-hidden />
          Place standard
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Accessibility aria-hidden className="size-3.5 text-info-ink" />
          Mobilité réduite
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded-[3px] border border-dashed border-line-strong" aria-hidden />
          Strapontin (pointillé)
        </span>
      </p>
    </div>
  )
}

/* ============================================================ Import CSV */

export interface LigneImport {
  rangee: number
  colonne: number
  numero?: string
  type?: string
}

const ENTETES = {
  rangee: ["rangee", "rang", "row"],
  colonne: ["colonne", "col", "column"],
  numero: ["numero", "numéro", "place", "label"],
  type: ["type", "type de place", "kind"],
}

const sansAccent = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

/**
 * Lit un plan CSV (séparateur « ; » ou « , »). L'en-tête est facultatif ;
 * sans lui, l'ordre attendu est rangée, colonne, numéro, type.
 */
export function lirePlanCsv(contenu: string): { lignes: LigneImport[]; erreurs: string[] } {
  const brutes = contenu.replace(/^﻿/, "").split(/\r?\n/).filter((ligne) => ligne.trim() !== "")
  if (brutes.length === 0) return { lignes: [], erreurs: ["Le fichier est vide."] }
  const separateur = brutes[0]!.includes(";") ? ";" : ","
  const cellules = (ligne: string) => ligne.split(separateur).map((c) => c.trim().replace(/^"|"$/g, ""))
  const premiere = cellules(brutes[0]!).map(sansAccent)
  const aEntete = premiere.some((c) => Number.isNaN(Number(c)))
  const index = {
    rangee: aEntete ? premiere.findIndex((c) => ENTETES.rangee.includes(c)) : 0,
    colonne: aEntete ? premiere.findIndex((c) => ENTETES.colonne.includes(c)) : 1,
    numero: aEntete ? premiere.findIndex((c) => ENTETES.numero.includes(sansAccent(c))) : 2,
    type: aEntete ? premiere.findIndex((c) => ENTETES.type.includes(c)) : 3,
  }
  const erreurs: string[] = []
  if (index.rangee < 0 || index.colonne < 0) {
    return { lignes: [], erreurs: ["En-tête incomplet : les colonnes « rangée » et « colonne » sont obligatoires."] }
  }
  const lignes: LigneImport[] = []
  brutes.slice(aEntete ? 1 : 0).forEach((brute, i) => {
    const c = cellules(brute)
    const rangee = Number(c[index.rangee])
    const colonne = Number(c[index.colonne])
    const numeroLigne = i + (aEntete ? 2 : 1)
    if (!Number.isInteger(rangee) || !Number.isInteger(colonne)) {
      erreurs.push(`Ligne ${numeroLigne} : rangée ou colonne illisible.`)
      return
    }
    lignes.push({
      rangee,
      colonne,
      numero: index.numero >= 0 ? c[index.numero] || undefined : undefined,
      type: index.type >= 0 ? c[index.type] || undefined : undefined,
    })
  })
  return { lignes, erreurs }
}

const MODELE_CSV = "rangee;colonne;numero;type\n1;1;1A;pmr\n1;2;1B;standard\n1;3;1C;standard\n1;4;1D;pmr\n2;1;2A;standard\n"

function DialogueImport({ voiture, open, onOpenChange }: { voiture: Voiture; open: boolean; onOpenChange: (open: boolean) => void }) {
  const importer = useMutation(api.functions.referentiels.importerPlanVoiture)
  const operation = useOperation()
  const [fichier, setFichier] = useState<{ nom: string; lignes: LigneImport[]; erreurs: string[] } | null>(null)
  const lire = async (event: ChangeEvent<HTMLInputElement>) => {
    const choisi = event.target.files?.[0]
    if (!choisi) return
    setFichier({ nom: choisi.name, ...lirePlanCsv(await choisi.text()) })
  }
  const pmr = fichier?.lignes.filter((l) => sansAccent(l.type ?? "") === "pmr").length ?? 0
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={`Importer le plan de la voiture ${voiture.label}`}
      description="Fichier CSV : rangée, colonne, numéro, type de place (standard, pmr, strapontin). Le plan remplace l'actuel tant que la voiture n'a servi à aucune desserte."
      libelleValider={
        <>
          <Upload />
          Importer {fichier?.lignes.length ? `${fichier.lignes.length} places` : "le plan"}
        </>
      }
      enCours={operation.enCours === "import"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async () => {
        if (!fichier || fichier.lignes.length === 0 || fichier.erreurs.length > 0) {
          operation.signaler({ ton: "danger", titre: "Import impossible", detail: "Choisissez un fichier lisible, sans erreur." })
          return
        }
        const ok = await operation.executer("import", () =>
          importer({ coachId: voiture._id, places: fichier.lignes, fichier: fichier.nom })
        )
        if (ok) onOpenChange(false)
      }}
    >
      <Field label="Fichier CSV du plan" htmlFor={`import-${voiture._id}`}>
        <Input id={`import-${voiture._id}`} type="file" accept=".csv,text/csv" onChange={lire} className="h-auto py-3" />
      </Field>
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => telechargerTexte("modele-plan-voiture.csv", MODELE_CSV)}>
        <Download />
        Télécharger le modèle CSV
      </Button>
      {fichier ? (
        fichier.erreurs.length > 0 ? (
          <InlineMessage tone="danger" title={`${fichier.erreurs.length} ligne(s) illisible(s)`}>
            {fichier.erreurs.slice(0, 4).join(" ")}
          </InlineMessage>
        ) : (
          <InlineMessage tone="info" title={`${fichier.nom} : ${fichier.lignes.length} places lues`}>
            {pmr} place(s) à mobilité réduite. Le contrôle des doublons se fait à l’enregistrement.
          </InlineMessage>
        )
      ) : null}
    </FenetreFormulaire>
  )
}

/* ============================================================ Formulaires */

function ChampsTrain({ train }: { train?: DossierTrain["train"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Numéro commercial" htmlFor="train-number">
        <Input id="train-number" name="number" defaultValue={train?.number} placeholder="E201" required className="tabular" />
      </Field>
      <Field label="Nom" htmlFor="train-name">
        <Input id="train-name" name="name" defaultValue={train?.name} placeholder="Express 201" required />
      </Field>
      <Field label="Type" htmlFor="train-type">
        <SelectNative id="train-type" name="type" defaultValue={train?.type ?? "EXPRESS"}>
          {ORDRE_TYPES_TRAIN.map((type) => (
            <option key={type} value={type}>
              {TYPES_TRAIN[type]}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Description" htmlFor="train-description" className="sm:col-span-2">
        <Textarea id="train-description" name="description" defaultValue={train?.description} placeholder="Parcours, particularités, affectation…" />
      </Field>
    </div>
  )
}

export function DialogueTrain({
  open,
  onOpenChange,
  train,
  onCree,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  train?: DossierTrain["train"]
  onCree?: (id: string) => void
}) {
  const creer = useMutation(api.functions.referential.upsertTrain)
  const modifier = useMutation(api.functions.referential.updateTrain)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={train ? `Modifier ${train.name}` : "Nouveau train"}
      description={train ? undefined : "Le train naît sans voiture ; ajoutez sa composition sur son dossier."}
      libelleValider={train ? "Enregistrer" : (<><Plus />Créer le train</>)}
      enCours={operation.enCours === "train"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const valeurs = {
          number: String(donnees.get("number") ?? ""),
          name: String(donnees.get("name") ?? ""),
          description: texte(donnees, "description"),
          type: String(donnees.get("type")) as TypeTrain,
        }
        const id = await operation.executer("train", () =>
          train ? modifier({ trainId: train._id, ...valeurs }) : creer({ ...valeurs, isActive: true })
        )
        if (id) {
          onOpenChange(false)
          if (!train) onCree?.(id)
        }
      }}
    >
      <ChampsTrain train={train} />
    </FenetreFormulaire>
  )
}

function DialogueVoiture({
  open,
  onOpenChange,
  trainId,
  voiture,
  position,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trainId: string
  voiture?: Voiture
  position: number
}) {
  const ajouter = useMutation(api.functions.referential.addCoach)
  const modifier = useMutation(api.functions.referential.updateCoach)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={voiture ? `Modifier la voiture ${voiture.label}` : "Ajouter une voiture"}
      description="Rangées × colonnes engendrent le plan de sièges. La classe et les capacités d'une voiture déjà engagée sur une desserte ne changent plus."
      libelleValider={voiture ? "Enregistrer la voiture" : (<><Plus />Ajouter la voiture</>)}
      enCours={operation.enCours === "voiture"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const valeurs = {
          label: String(donnees.get("label") ?? ""),
          serviceClass: String(donnees.get("serviceClass")) as ClasseService,
          serialNumber: texte(donnees, "serialNumber"),
          rowCount: Number(donnees.get("rowCount")),
          columnCount: Number(donnees.get("columnCount")),
          seatCount: Number(donnees.get("seatCount")),
          standingCapacity: Number(donnees.get("standingCapacity")),
          position: Number(donnees.get("position")),
        }
        const id = await operation.executer("voiture", () =>
          voiture ? modifier({ coachId: voiture._id, ...valeurs }) : ajouter({ trainId: trainId as never, ...valeurs })
        )
        if (id) onOpenChange(false)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Repère" htmlFor="voiture-label">
          <Input id="voiture-label" name="label" defaultValue={voiture?.label ?? `V${position}`} required className="tabular" />
        </Field>
        <Field label="Classe" htmlFor="voiture-classe">
          <SelectNative id="voiture-classe" name="serviceClass" defaultValue={voiture?.serviceClass ?? "DEUXIEME"}>
            {ORDRE_CLASSES.map((classe) => (
              <option key={classe} value={classe}>
                {CLASSES[classe].long}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Série" htmlFor="voiture-serie">
          <Input id="voiture-serie" name="serialNumber" defaultValue={voiture?.serialNumber} placeholder="B-2208" />
        </Field>
        <Field label="Position" htmlFor="voiture-position">
          <Input id="voiture-position" name="position" type="number" min="1" defaultValue={voiture?.position ?? position} required className="tabular" />
        </Field>
        <Field label="Rangées" htmlFor="voiture-rangees">
          <Input id="voiture-rangees" name="rowCount" type="number" min="1" defaultValue={voiture?.rowCount ?? 16} required className="tabular" />
        </Field>
        <Field label="Colonnes" htmlFor="voiture-colonnes">
          <Input id="voiture-colonnes" name="columnCount" type="number" min="1" max="26" defaultValue={voiture?.columnCount ?? 4} required className="tabular" />
        </Field>
        <Field label="Places assises" hint="Rangées × colonnes." htmlFor="voiture-places">
          <Input id="voiture-places" name="seatCount" type="number" min="1" defaultValue={voiture?.seatCount ?? 64} required className="tabular" />
        </Field>
        <Field label="Places debout" htmlFor="voiture-debout">
          <Input id="voiture-debout" name="standingCapacity" type="number" min="0" defaultValue={voiture?.standingCapacity ?? 0} required className="tabular" />
        </Field>
      </div>
    </FenetreFormulaire>
  )
}

/* ================================================================ Écrans */

export function TrainCreateScreen() {
  const router = useRouter()
  const droits = useDroitsGestion()
  return (
    <ManagementDetailShell title="Nouveau train" eyebrow="Exploitation · matériel voyageurs" backHref="/gestion/trains" verrouillage="aucun">
      {droits.may("referentiel", "creer") ? (
        <DialogueTrain open onOpenChange={(ouvert) => !ouvert && router.push("/gestion/trains")} onCree={(id) => router.replace(`/gestion/trains/${id}`)} />
      ) : (
        <InlineMessage tone="warning" title="Consultation seule">
          Votre profil ne permet pas de créer un train.
        </InlineMessage>
      )}
    </ManagementDetailShell>
  )
}

/** Carte d'une voiture du dossier : chiffres, plan et actions. */
function CarteVoiture({
  voiture,
  verrouillee,
  peutModifier,
  peutRetirer,
  onModifier,
}: {
  voiture: Voiture
  verrouillee: boolean
  peutModifier: boolean
  peutRetirer: boolean
  onModifier: () => void
}) {
  const retirer = useMutation(api.functions.referential.removeCoach)
  const operation = useOperation()
  const [importer, setImporter] = useState(false)
  const pmr = voiture.seats.filter((s) => s.kind === "pmr")
  return (
    <Panneau
      titre={`Voiture ${voiture.label.replace(/^V/, "")}`}
      icone={Armchair}
      sousTitre={`${CLASSES[voiture.serviceClass].long}${voiture.serialNumber ? ` · série ${voiture.serialNumber}` : ""}`}
      actions={
        <>
          {peutModifier ? (
            <Button type="button" variant="ghost" size="sm" onClick={onModifier}>
              <Pencil />
              Modifier
            </Button>
          ) : null}
          {peutRetirer && !verrouillee ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={operation.enCours === "retirer"}
              onClick={() => {
                if (window.confirm(`Retirer la voiture ${voiture.label} et ses places ?`)) {
                  void operation.executer("retirer", () => retirer({ coachId: voiture._id }))
                }
              }}
            >
              <Trash2 />
              Retirer
            </Button>
          ) : null}
        </>
      }
    >
      <RetourOperation retour={operation.retour} />
      <Fiche
        className="sm:max-w-md"
        elements={[
          ["Rangées", <span key="r" className="tabular">{voiture.rowCount}</span>],
          ["Colonnes", <span key="c" className="tabular">{voiture.columnCount}</span>],
          ["Numérotation", <span key="n" className="tabular">{voiture.seats[0]?.label ?? "—"} → {voiture.seats[voiture.seats.length - 1]?.label ?? "—"}</span>],
          ["Places assises · debout", <span key="p" className="tabular">{voiture.seatCount} · {voiture.standingCapacity}</span>],
          pmr.length > 0 && ["Mobilité réduite", <span key="m" className="tabular">{pmr.map((s) => s.label).join(", ")}</span>],
        ]}
      />
      <PlanVoiture voiture={voiture} />
      {peutModifier ? (
        <Encart
          icone={FileSpreadsheet}
          titre="Importer un plan de voiture"
          action={
            <Button type="button" variant="secondary" size="sm" disabled={verrouillee} onClick={() => setImporter(true)}>
              <Upload />
              Importer
            </Button>
          }
        >
          {verrouillee
            ? "Voiture engagée sur des dessertes : son plan ne peut plus être remplacé."
            : "Fichier CSV : rangée, colonne, numéro, type de place (standard, pmr, strapontin)."}
        </Encart>
      ) : null}
      {importer ? <DialogueImport voiture={voiture} open onOpenChange={setImporter} /> : null}
    </Panneau>
  )
}

export function TrainDetailScreen({ trainId }: { trainId: string }) {
  const droits = useDroitsGestion()
  const dossier = useQuery(api.functions.referentiels.train, { trainId: trainId as never })
  const activer = useMutation(api.functions.referential.setTrainActive)
  const operation = useOperation()
  const [edition, setEdition] = useState(false)
  const [voitureEditee, setVoitureEditee] = useState<Voiture | "nouvelle" | null>(null)
  const [selection, setSelection] = useState<string | null>(null)

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Train introuvable" : "Train"} eyebrow="Exploitation · matériel voyageurs" backHref="/gestion/trains" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Ce train n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }
  const { train, voitures } = dossier
  const peutModifier = droits.may("referentiel", "modifier")
  const choisie = voitures.find((v) => v.label === selection) ?? null
  const affichees = choisie ? [choisie] : voitures

  return (
    <ManagementDetailShell
      title={train.name}
      eyebrow={`Exploitation · ${TYPES_TRAIN[train.type]} · ${train.number}`}
      backHref="/gestion/trains"
      verrouillage="aucun"
      lectureSeule={!droits.chargement && !peutModifier}
      description={train.description}
      actions={
        peutModifier ? (
          <>
            <Button type="button" variant="ghost" loading={operation.enCours === "actif"} onClick={() => void operation.executer("actif", () => activer({ trainId: train._id, isActive: !train.isActive }), train.isActive ? "Train désactivé : il n'entre plus dans un nouveau livret. Son historique reste." : "Train réactivé.")}>
              {train.isActive ? <PowerOff /> : <Power />}
              {train.isActive ? "Désactiver" : "Réactiver"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEdition(true)}>
              <Pencil />
              Modifier le train
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagActif actif={train.isActive} oui="En service" non="Désactivé" />
        <Pastille ton="neutral">{TYPES_TRAIN[train.type]}</Pastille>
      </div>
      <RetourOperation retour={operation.retour} />
      {dossier.aDesDessertes ? (
        <Encart icone={RouteIcon} titre="Composition engagée sur des dessertes" ton="vigilance">
          Modifier une voiture après ouverture à la vente déplacerait des voyageurs : l’outil refuse tout changement de classe ou de capacité d’une voiture déjà engagée, et l’explique avant d’enregistrer.
        </Encart>
      ) : null}

      <Panneau
        titre="Composition"
        icone={TrainFront}
        sousTitre="Dans l'ordre de circulation · choisissez une voiture pour n'afficher qu'elle"
        actions={
          droits.may("referentiel", "creer") ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setVoitureEditee("nouvelle")}>
              <Plus />
              Ajouter une voiture
            </Button>
          ) : null
        }
      >
        <Composition voitures={voitures} selection={selection} onSelect={(label) => setSelection((courant) => (courant === label ? null : label))} />
        <Indicateurs colonnes={4}>
          <Indicateur libelle="Places assises" icone={Armchair} valeur={nombre(dossier.placesAssises)} evolution={{ sens: "neutre", texte: ORDRE_CLASSES.filter((c) => dossier.parClasse[c] > 0).map((c) => `${CLASSES[c].court} ${dossier.parClasse[c]}`).join(" · ") || "aucune" }} />
          <Indicateur libelle="Places debout" valeur={nombre(dossier.placesDebout)} evolution={{ sens: "neutre", texte: train.type === "EXPRESS" ? "interdites en Express" : "contingent sans numéro" }} />
          <Indicateur libelle="Accès mobilité réduite" icone={Accessibility} valeur={nombre(dossier.placesPmr)} evolution={{ sens: "neutre", texte: dossier.pmr.slice(0, 3).join(", ") || "aucune place désignée" }} />
          <Indicateur libelle="Voitures" valeur={nombre(dossier.nbVoitures)} />
        </Indicateurs>
      </Panneau>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <div className="grid content-start gap-4">
          {affichees.map((voiture) => (
            <CarteVoiture
              key={voiture._id}
              voiture={voiture}
              verrouillee={dossier.aDesDessertes}
              peutModifier={peutModifier}
              peutRetirer={droits.may("referentiel", "supprimer")}
              onModifier={() => setVoitureEditee(voiture)}
            />
          ))}
          {voitures.length === 0 ? (
            <InlineMessage tone="info" title="Composition vide">
              Ajoutez une première voiture : son plan de sièges est engendré aussitôt.
            </InlineMessage>
          ) : null}
        </div>
        <div className="grid content-start gap-4">
          <Panneau titre="Prochaines dessertes" icone={RouteIcon} plein>
            {dossier.prochainesDessertes.length === 0 ? (
              <p className="text-small p-4 text-ink-muted">Aucune desserte à venir pour ce train.</p>
            ) : (
              <ul className="divide-y divide-line">
                {dossier.prochainesDessertes.map((desserte) =>
                  desserte ? (
                    <li key={desserte.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13.5px]">
                      <span className="min-w-0 flex-1">
                        <b className="font-semibold">{dateService(desserte.serviceDate)}</b>
                        <small className="block text-ink-muted">{libelleDesserte(desserte)}</small>
                      </span>
                      <TagDesserte status={desserte.status} retard={desserte.delayMinutes} />
                    </li>
                  ) : null
                )}
              </ul>
            )}
          </Panneau>
          <Panneau titre="Historique" icone={Pencil}>
            <Historique historique={dossier.historique} />
          </Panneau>
        </div>
      </div>

      <DialogueTrain open={edition} onOpenChange={setEdition} train={train} />
      {voitureEditee ? (
        <DialogueVoiture
          key={voitureEditee === "nouvelle" ? "nouvelle" : voitureEditee._id}
          open
          onOpenChange={(ouvert) => !ouvert && setVoitureEditee(null)}
          trainId={train._id}
          voiture={voitureEditee === "nouvelle" ? undefined : voitureEditee}
          position={voitures.length + 1}
        />
      ) : null}
    </ManagementDetailShell>
  )
}
