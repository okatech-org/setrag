"use client"

import type { FunctionReturnType } from "convex/server"
import {
  BookOpen,
  CalendarRange,
  Check,
  History,
  Info,
  Pencil,
  Plus,
  Route as RouteIcon,
  Send,
  Trash2,
  TrainFront,
  TriangleAlert,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { Indicateur, Indicateurs, Panneau, telechargerCsv, suffixeDate } from "@/components/charte"
import { useDroitsGestion } from "./gestion/referentiels/droits"
import {
  Encart,
  Historique,
  Onglets,
  RetourOperation,
  useOperation,
} from "./gestion/referentiels/elements"
import {
  agent,
  champDate,
  dateCourte,
  dateHeure,
  debutJour,
  finJour,
  joursCirculation,
  JOURS_COURTS,
  jourMois,
  nombre,
  TYPES_TRAIN,
} from "./gestion/referentiels/format"
import { FenetreFormulaire, texte } from "./gestion/referentiels/formulaire"
import { CycleVie, Pastille, TagApprobation } from "./gestion/referentiels/statuts"
import { ManagementDetailShell } from "./management-detail-shell"

export type DossierLivret = NonNullable<FunctionReturnType<typeof api.functions.referentiels.livret>>
type Circulation = DossierLivret["circulations"][number]

const ETAPES = ["Brouillon", "À valider", "Actif", "Expiré"] as const
const etapeDe = (status: DossierLivret["booklet"]["status"]) =>
  status === "brouillon" || status === "rejete" ? 0 : status === "a_valider" ? 1 : status === "actif" ? 2 : 3

/* ========================================================== Actions */

/** Actions du cycle de vie d'un livret, partagées par l'aperçu et le dossier. */
export function useActionsLivret(dossier: DossierLivret | null | undefined) {
  const droits = useDroitsGestion()
  const operation = useOperation()
  const submit = useMutation(api.functions.booklets.submit)
  const approve = useMutation(api.functions.booklets.approve)
  const reject = useMutation(api.functions.booklets.reject)
  const expirer = useMutation(api.functions.referentiels.expirerLivret)
  const [rejet, setRejet] = useState(false)
  const status = dossier?.booklet.status
  const editable = status === "brouillon" || status === "rejete"
  const peut = {
    modifier: editable && droits.may("livrets_horaires", "modifier"),
    supprimer: status === "brouillon" && droits.may("livrets_horaires", "supprimer"),
    soumettre: editable && droits.may("livrets_horaires", "modifier"),
    valider: status === "a_valider" && droits.may("livrets_horaires", "valider"),
    expirer: status === "actif" && droits.may("livrets_horaires", "valider"),
  }

  const soumettre = () =>
    dossier &&
    operation.executer("soumettre", () => submit({ bookletId: dossier.booklet._id }), "Livret soumis à validation : un validateur le relira avant activation.")
  const valider = () =>
    dossier &&
    operation.executer(
      "valider",
      () => approve({ bookletId: dossier.booklet._id }),
      (r) => `Livret « ${dossier.booklet.label} » validé · ${nombre(r.plannedTrips)} dessertes ouvertes à la génération.`
    )
  const expirerLivret = () => {
    if (!dossier) return
    if (!window.confirm(`Expirer « ${dossier.booklet.label} » ? Les dessertes déjà engendrées et les billets vendus restent valables.`)) return
    void operation.executer("expirer", () => expirer({ bookletId: dossier.booklet._id }), "Le livret est expiré. Il reste consultable.")
  }

  const boutons = (options: { principal?: boolean } = {}) =>
    dossier ? (
      <>
        {peut.valider ? (
          <>
            <Button type="button" variant="danger" onClick={() => setRejet(true)}>
              <X />
              Rejeter
            </Button>
            <Button
              type="button"
              variant={options.principal === false ? "secondary" : "primary"}
              loading={operation.enCours === "valider"}
              loadingLabel="Validation…"
              onClick={() => void valider()}
            >
              <Check />
              Valider le livret
            </Button>
          </>
        ) : null}
        {peut.soumettre ? (
          <Button
            type="button"
            variant={options.principal === false ? "secondary" : "primary"}
            loading={operation.enCours === "soumettre"}
            loadingLabel="Soumission…"
            disabled={dossier.circulations.length === 0}
            onClick={() => void soumettre()}
          >
            <Send />
            Soumettre à validation
          </Button>
        ) : null}
        {peut.expirer ? (
          <Button type="button" variant="secondary" loading={operation.enCours === "expirer"} loadingLabel="Expiration…" onClick={expirerLivret}>
            <History />
            Expirer
          </Button>
        ) : null}
      </>
    ) : null

  const dialogueRejet = dossier ? (
    <FenetreFormulaire
      open={rejet}
      onOpenChange={setRejet}
      titre={`Rejeter « ${dossier.booklet.label} »`}
      description="Le livret revient en brouillon. Le motif s'affiche à son auteur et reste au journal."
      libelleValider={
        <>
          <X />
          Rejeter le livret
        </>
      }
      variante="danger"
      enCours={operation.enCours === "rejeter"}
      onSubmit={async (donnees) => {
        const ok = await operation.executer(
          "rejeter",
          () => reject({ bookletId: dossier.booklet._id, reason: String(donnees.get("motif") ?? "") }),
          "Livret renvoyé en brouillon : le motif est transmis à son auteur."
        )
        if (ok !== undefined) setRejet(false)
      }}
    >
      <Field label="Motif du rejet" hint="Ce que l'auteur doit corriger, précisément." htmlFor="livret-motif-rejet">
        <Textarea id="livret-motif-rejet" name="motif" required minLength={5} />
      </Field>
    </FenetreFormulaire>
  ) : null

  return { droits, operation, peut, boutons, dialogueRejet }
}

/* ========================================================== Pièces */

export function EnTeteCycle({ dossier }: { dossier: DossierLivret }) {
  const { booklet } = dossier
  return (
    <div className="flex flex-wrap items-center gap-3">
      <TagApprobation status={booklet.status} />
      <CycleVie etapes={ETAPES} courante={etapeDe(booklet.status)} />
    </div>
  )
}

function libelleArret(arret: Circulation["arrets"][number]) {
  return arret.station ? arret.station.name : "Gare inconnue"
}

export function TableCirculations({
  circulations,
  actions,
}: {
  circulations: readonly Circulation[]
  actions?: (circulation: Circulation) => ReactNode
}) {
  if (circulations.length === 0) {
    return <p className="text-small px-4 py-6 text-center text-ink-muted">Aucune circulation dans ce livret. Ajoutez un train, ses jours et ses arrêts.</p>
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" aria-label="Circulations du livret">
        <thead>
          <tr className="bg-surface-sunk text-left text-[11.5px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
            <th scope="col" className="px-3.5 py-2.5">Train</th>
            <th scope="col" className="px-3.5 py-2.5">Jours</th>
            <th scope="col" className="px-3.5 py-2.5 text-right">Départ</th>
            <th scope="col" className="px-3.5 py-2.5 text-right">Arrivée</th>
            <th scope="col" className="hidden px-3.5 py-2.5 md:table-cell">Parcours</th>
            <th scope="col" className="hidden px-3.5 py-2.5 lg:table-cell">Composition</th>
            {actions ? <th scope="col" className="px-3.5 py-2.5"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {circulations.map((circulation) => {
            const premier = circulation.arrets[0]
            const dernier = circulation.arrets[circulation.arrets.length - 1]
            return (
              <tr key={circulation._id} className="border-t border-line align-middle">
                <td className="px-3.5 py-2.5">
                  <span className="grid">
                    <span className="tabular text-[13.5px] font-semibold">{circulation.trainName ?? circulation.trainNumber}</span>
                    <small className="text-[12.5px] text-ink-muted">
                      {TYPES_TRAIN[circulation.trainType]} · {circulation.trainNumber}
                    </small>
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {circulation.nouveau ? (
                      <Pastille ton="accent" icone={Plus}>
                        Nouveau
                      </Pastille>
                    ) : null}
                    {joursCirculation(circulation.daysOfWeek)}
                  </span>
                </td>
                <td className="tabular px-3.5 py-2.5 text-right">{circulation.departureTime}</td>
                <td className="tabular px-3.5 py-2.5 text-right whitespace-nowrap">
                  {circulation.heureArrivee}
                  {circulation.joursArrivee > 0 ? <small className="ml-1 text-ink-muted">+{circulation.joursArrivee}</small> : null}
                </td>
                <td className="hidden px-3.5 py-2.5 md:table-cell">
                  {premier && dernier ? `${libelleArret(premier)} → ${libelleArret(dernier)}` : "—"}
                  <small className="block text-[12.5px] text-ink-muted">{circulation.arrets.length} arrêts · {nombre(circulation.circulations)} jours</small>
                </td>
                <td className="hidden px-3.5 py-2.5 lg:table-cell">
                  {circulation.voitures} voiture{circulation.voitures > 1 ? "s" : ""} · <span className="tabular-nums">{circulation.places}</span> pl.
                </td>
                {actions ? <td className="px-3.5 py-2.5 text-right whitespace-nowrap">{actions(circulation)}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ItineraireDetaille({ circulations }: { circulations: readonly Circulation[] }) {
  if (circulations.length === 0) return <p className="text-small text-ink-muted">Aucun itinéraire à afficher.</p>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {circulations.map((circulation) => (
        <section key={circulation._id} className="min-w-0 rounded-md border border-line">
          <h3 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[14px] font-bold">
            <TrainFront aria-hidden className="size-4 text-ink-muted" />
            {circulation.trainName ?? circulation.trainNumber}
            <span className="tabular ml-auto text-[13px] font-medium text-ink-muted">{joursCirculation(circulation.daysOfWeek)}</span>
          </h3>
          <table className="w-full text-[13.5px]" aria-label={`Arrêts de ${circulation.trainNumber}`}>
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-[0.05em] text-ink-muted uppercase">
                <th scope="col" className="px-4 py-2">Gare</th>
                <th scope="col" className="px-4 py-2 text-right">PK</th>
                <th scope="col" className="px-4 py-2 text-right">Arrivée</th>
                <th scope="col" className="px-4 py-2 text-right">Départ</th>
              </tr>
            </thead>
            <tbody>
              {circulation.arrets.map((arret) => (
                <tr key={`${circulation._id}-${arret.sequence}`} className="border-t border-line">
                  <td className="px-4 py-1.5 font-medium">{libelleArret(arret)}</td>
                  <td className="tabular px-4 py-1.5 text-right text-ink-muted">{arret.station?.kilometerPoint ?? "—"}</td>
                  <td className="tabular px-4 py-1.5 text-right">
                    {arret.arrivee ? `${arret.arrivee.heure}${arret.arrivee.jours ? ` +${arret.arrivee.jours}` : ""}` : "—"}
                  </td>
                  <td className="tabular px-4 py-1.5 text-right">
                    {arret.depart ? `${arret.depart.heure}${arret.depart.jours ? ` +${arret.depart.jours}` : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

export function Chevauchements({ dossier }: { dossier: DossierLivret }) {
  if (dossier.chevauchements.length === 0) return null
  return (
    <div className="grid gap-2">
      {dossier.chevauchements.map((autre) => (
        <Encart key={autre.id} icone={autre.status === "actif" ? Info : TriangleAlert} titre={`Chevauchement avec « ${autre.label} »`} ton={dossier.booklet.status === "a_valider" && autre.status === "actif" ? "vigilance" : "neutre"}>
          Du {dateCourte(autre.debut)} au {dateCourte(autre.fin)}, les deux livrets couvrent la même période ({autre.status === "actif" ? "livret actif" : "livret à valider"}). Deux livrets actifs ne peuvent pas se chevaucher : l’activation sera refusée tant que « {autre.label} » reste actif sur ces dates. Les billets déjà vendus restent valables.
        </Encart>
      ))}
    </div>
  )
}

export function MentionSoumission({ dossier }: { dossier: DossierLivret }) {
  const { booklet } = dossier
  if (booklet.status === "actif" && dossier.validePar) {
    return (
      <span>
        Validé le <span className="tabular">{dateHeure(booklet.approvedAt)}</span> par <b>{agent(dossier.validePar)}</b>
      </span>
    )
  }
  if (booklet.submittedAt && dossier.soumisPar) {
    return (
      <span>
        Soumis le <span className="tabular">{dateHeure(booklet.submittedAt)}</span> par <b>{agent(dossier.soumisPar)}</b>
      </span>
    )
  }
  return (
    <span>
      Créé par <b>{agent(dossier.creePar)}</b>
    </span>
  )
}

/* ====================================================== Formulaires */

export function DialogueLivret({
  open,
  onOpenChange,
  livret,
  onEnregistre,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  livret?: DossierLivret["booklet"]
  onEnregistre?: (id: string) => void
}) {
  const create = useMutation(api.functions.booklets.create)
  const update = useMutation(api.functions.booklets.update)
  const operation = useOperation()
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre={livret ? "Modifier le livret" : "Nouveau livret horaire"}
      description={livret ? "Un livret se modifie tant qu'il est en brouillon." : "Le livret naît en brouillon. Ajoutez ses circulations, puis soumettez-le à validation."}
      libelleValider={livret ? "Enregistrer" : (<><Plus />Créer le livret</>)}
      enCours={operation.enCours === "livret"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const valeurs = {
          label: String(donnees.get("label") ?? "").trim(),
          description: texte(donnees, "description"),
          validFrom: debutJour(String(donnees.get("validFrom"))),
          validUntil: finJour(String(donnees.get("validUntil"))),
        }
        const id = await operation.executer("livret", () =>
          livret ? update({ bookletId: livret._id, ...valeurs }) : create(valeurs)
        )
        if (id) {
          onOpenChange(false)
          onEnregistre?.(id)
        }
      }}
    >
      <Field label="Libellé" htmlFor="livret-libelle">
        <Input id="livret-libelle" name="label" defaultValue={livret?.label} placeholder="Fêtes de fin d'année 2026" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Début de validité" htmlFor="livret-debut">
          <Input id="livret-debut" name="validFrom" type="date" defaultValue={champDate(livret?.validFrom)} required />
        </Field>
        <Field label="Fin de validité" htmlFor="livret-fin">
          <Input id="livret-fin" name="validUntil" type="date" defaultValue={champDate(livret?.validUntil)} required />
        </Field>
      </div>
      <Field label="Description" hint="Facultatif : objet du livret, trains ajoutés ou supprimés." htmlFor="livret-description">
        <Textarea id="livret-description" name="description" defaultValue={livret?.description} />
      </Field>
    </FenetreFormulaire>
  )
}

interface ArretSaisi {
  cle: number
  stationId: string
  arrivee: string
  depart: string
}

function DialogueCirculation({
  open,
  onOpenChange,
  bookletId,
  circulation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookletId: string
  circulation?: Circulation
}) {
  const trains = useQuery(api.functions.referential.listTrains, open ? {} : "skip")
  const stations = useQuery(api.functions.referential.listStations, open ? {} : "skip")
  const addSchedule = useMutation(api.functions.booklets.addSchedule)
  const updateSchedule = useMutation(api.functions.booklets.updateSchedule)
  const operation = useOperation()
  const [arrets, setArrets] = useState<ArretSaisi[]>(() =>
    circulation
      ? circulation.stops
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((stop, index) => ({
            cle: index,
            stationId: stop.stationId,
            arrivee: stop.arrivalOffsetMinutes === undefined ? "" : String(stop.arrivalOffsetMinutes),
            depart: stop.departureOffsetMinutes === undefined ? "" : String(stop.departureOffsetMinutes),
          }))
      : [
          { cle: 0, stationId: "", arrivee: "", depart: "0" },
          { cle: 1, stationId: "", arrivee: "", depart: "" },
        ]
  )
  const [prochaineCle, setProchaineCle] = useState(arrets.length)
  const changer = (cle: number, champ: keyof Omit<ArretSaisi, "cle">, valeur: string) =>
    setArrets((liste) => liste.map((arret) => (arret.cle === cle ? { ...arret, [champ]: valeur } : arret)))

  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      large
      titre={circulation ? `Modifier ${circulation.trainName ?? circulation.trainNumber}` : "Ajouter une circulation"}
      description="Les heures des arrêts se saisissent en minutes après le départ de la première gare."
      libelleValider={circulation ? "Enregistrer la circulation" : (<><Plus />Ajouter la circulation</>)}
      enCours={operation.enCours === "circulation"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        const stops = arrets.map((arret, sequence) => ({
          stationId: arret.stationId as never,
          sequence,
          arrivalOffsetMinutes: arret.arrivee === "" ? undefined : Number(arret.arrivee),
          departureOffsetMinutes: arret.depart === "" ? undefined : Number(arret.depart),
        }))
        const valeurs = {
          trainId: String(donnees.get("trainId")) as never,
          departureTime: String(donnees.get("departureTime")),
          daysOfWeek: donnees
            .getAll("jours")
            .map(Number)
            .sort((a, b) => a - b),
          stops,
        }
        const id = await operation.executer("circulation", () =>
          circulation ? updateSchedule({ scheduleId: circulation._id, ...valeurs }) : addSchedule({ bookletId: bookletId as never, ...valeurs })
        )
        if (id) onOpenChange(false)
      }}
    >
      {trains === undefined || stations === undefined ? (
        <SkeletonLines />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Train" htmlFor="circulation-train">
              <SelectNative id="circulation-train" name="trainId" defaultValue={circulation?.trainId} required>
                {trains.map((train) => (
                  <option key={train._id} value={train._id}>
                    {train.number} · {train.name}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Heure de départ" htmlFor="circulation-depart">
              <Input id="circulation-depart" name="departureTime" type="time" defaultValue={circulation?.departureTime ?? "07:40"} required className="tabular" />
            </Field>
          </div>
          <fieldset className="grid gap-1">
            <legend className="text-[13px] font-medium">Jours de circulation</legend>
            <p className="text-[12px] text-ink-muted">Aucun jour coché : le train circule tous les jours.</p>
            <div className="flex flex-wrap gap-x-4">
              {[1, 2, 3, 4, 5, 6, 0].map((jour) => (
                <label key={jour} className="flex min-h-11 items-center gap-2 text-[14.5px]">
                  <input type="checkbox" name="jours" value={jour} defaultChecked={circulation?.daysOfWeek.includes(jour)} className="size-5 accent-[var(--c-accent)]" />
                  {JOURS_COURTS[jour]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="text-[13px] font-medium">Arrêts, dans l’ordre du parcours</legend>
            {arrets.map((arret, index) => (
              <div key={arret.cle} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-md border border-line p-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_auto]">
                <Field label={`Arrêt ${index + 1}`} htmlFor={`arret-${arret.cle}`} className="col-span-2 sm:col-span-1">
                  <SelectNative id={`arret-${arret.cle}`} value={arret.stationId} onChange={(event) => changer(arret.cle, "stationId", event.target.value)} required>
                    <option value="">Choisir une gare</option>
                    {stations.map((station) => (
                      <option key={station._id} value={station._id}>
                        {station.name} · PK {station.kilometerPoint}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field label="Arrivée (min)" htmlFor={`arrivee-${arret.cle}`} disabled={index === 0}>
                  <Input id={`arrivee-${arret.cle}`} type="number" min="0" inputMode="numeric" value={arret.arrivee} onChange={(event) => changer(arret.cle, "arrivee", event.target.value)} className="tabular" />
                </Field>
                <Field label="Départ (min)" htmlFor={`depart-${arret.cle}`} disabled={index === arrets.length - 1}>
                  <Input id={`depart-${arret.cle}`} type="number" min="0" inputMode="numeric" value={arret.depart} onChange={(event) => changer(arret.cle, "depart", event.target.value)} className="tabular" />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Retirer l'arrêt ${index + 1}`}
                  disabled={arrets.length <= 2}
                  onClick={() => setArrets((liste) => liste.filter((a) => a.cle !== arret.cle))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => {
                setArrets((liste) => [...liste.slice(0, -1), { cle: prochaineCle, stationId: "", arrivee: "", depart: "" }, ...liste.slice(-1)])
                setProchaineCle((cle) => cle + 1)
              }}
            >
              <Plus />
              Insérer un arrêt intermédiaire
            </Button>
          </fieldset>
        </>
      )}
    </FenetreFormulaire>
  )
}

/* ========================================================== Dossier */

export function BookletDetail({ bookletId }: { bookletId: string }) {
  const router = useRouter()
  const dossier = useQuery(api.functions.referentiels.livret, { bookletId: bookletId as never })
  const actions = useActionsLivret(dossier)
  const removeSchedule = useMutation(api.functions.booklets.removeSchedule)
  const removeDraft = useMutation(api.functions.booklets.removeDraft)
  const [onglet, setOnglet] = useState<"circulations" | "itineraire" | "historique">("circulations")
  const [edition, setEdition] = useState(false)
  const [circulation, setCirculation] = useState<Circulation | "nouvelle" | null>(null)
  const { peut, operation } = actions

  if (dossier === undefined || dossier === null) {
    return (
      <ManagementDetailShell title={dossier === null ? "Livret introuvable" : "Livret horaire"} eyebrow="Exploitation · livret horaire" backHref="/gestion/livrets" verrouillage="aucun">
        {dossier === null ? <InlineMessage tone="danger" title="Ce livret n'existe plus." /> : <SkeletonLines />}
      </ManagementDetailShell>
    )
  }

  const { booklet } = dossier
  const exporter = () =>
    telechargerCsv(
      `livret-${booklet.label.replace(/\W+/g, "-").toLowerCase()}-${suffixeDate()}`,
      [
        { libelle: "Train", valeur: (c: Circulation) => c.trainNumber },
        { libelle: "Nom", valeur: (c: Circulation) => c.trainName },
        { libelle: "Jours", valeur: (c: Circulation) => joursCirculation(c.daysOfWeek) },
        { libelle: "Départ", valeur: (c: Circulation) => c.departureTime },
        { libelle: "Arrivée", valeur: (c: Circulation) => `${c.heureArrivee}${c.joursArrivee ? ` +${c.joursArrivee}` : ""}` },
        { libelle: "Parcours", valeur: (c: Circulation) => c.arrets.map(libelleArret).join(" → ") },
        { libelle: "Voitures", valeur: (c: Circulation) => c.voitures },
        { libelle: "Places", valeur: (c: Circulation) => c.places },
        { libelle: "Jours de circulation", valeur: (c: Circulation) => c.circulations },
      ],
      dossier.circulations
    )

  return (
    <ManagementDetailShell
      title={booklet.label}
      eyebrow="Exploitation · livret horaire"
      backHref="/gestion/livrets"
      verrouillage="aucun"
      lectureSeule={!actions.droits.chargement && !actions.droits.may("livrets_horaires", "modifier") && !actions.droits.may("livrets_horaires", "valider")}
      description={booklet.description}
      actions={
        <>
          {peut.modifier ? (
            <Button type="button" variant="secondary" onClick={() => setEdition(true)}>
              <Pencil />
              Modifier
            </Button>
          ) : null}
          {peut.supprimer ? (
            <Button
              type="button"
              variant="ghost"
              loading={operation.enCours === "supprimer"}
              onClick={async () => {
                if (!window.confirm("Supprimer définitivement ce brouillon et ses circulations ?")) return
                const ok = await operation.executer("supprimer", () => removeDraft({ bookletId: booklet._id }).then(() => true))
                if (ok !== undefined) router.replace("/gestion/livrets")
              }}
            >
              <Trash2 />
              Supprimer le brouillon
            </Button>
          ) : null}
          {actions.boutons()}
        </>
      }
    >
      <EnTeteCycle dossier={dossier} />
      <RetourOperation retour={operation.retour} />
      {booklet.status === "rejete" && booklet.rejectionReason ? (
        <InlineMessage tone="warning" title="Rejeté : à corriger avant une nouvelle soumission.">
          {booklet.rejectionReason}
        </InlineMessage>
      ) : null}

      <Indicateurs colonnes={4}>
        <Indicateur libelle="Validité" icone={CalendarRange} valeur={<span className="text-[20px]">{jourMois(booklet.validFrom)} → {jourMois(booklet.validUntil)}</span>} evolution={{ sens: "neutre", texte: `${dateCourte(booklet.validFrom)} au ${dateCourte(booklet.validUntil)}` }} />
        <Indicateur libelle="Trains" icone={TrainFront} valeur={new Set(dossier.circulations.map((c) => c.trainNumber)).size} evolution={{ sens: "neutre", texte: `${dossier.circulations.length} circulation(s)` }} />
        <Indicateur libelle="Dessertes prévues" icone={RouteIcon} valeur={nombre(dossier.prevues)} evolution={{ sens: "neutre", texte: "une par jour de circulation" }} />
        <Indicateur
          libelle="Dessertes engendrées"
          icone={BookOpen}
          valeur={nombre(dossier.engendrees)}
          remplissage={dossier.prevues > 0 ? dossier.engendrees / dossier.prevues : undefined}
          evolution={{ sens: "neutre", texte: `${nombre(dossier.ouvertesALaVente)} ouvertes à la vente` }}
        />
      </Indicateurs>

      <Chevauchements dossier={dossier} />

      <Panneau
        plein
        titre={booklet.label}
        icone={BookOpen}
        sousTitre={<MentionSoumission dossier={dossier} />}
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={exporter} disabled={dossier.circulations.length === 0}>
            Exporter (CSV)
          </Button>
        }
      >
        <div className="px-4 pt-2">
          <Onglets
            libelle="Contenu du livret"
            valeur={onglet}
            onChange={setOnglet}
            onglets={[
              { cle: "circulations", libelle: "Circulations", compte: dossier.circulations.length },
              { cle: "itineraire", libelle: "Itinéraire détaillé" },
              { cle: "historique", libelle: "Historique", compte: dossier.historique.length },
            ]}
          />
        </div>
        {onglet === "circulations" ? (
          <div role="tabpanel" className="grid gap-3 pb-3">
            <TableCirculations
              circulations={dossier.circulations}
              actions={
                peut.modifier
                  ? (c) => (
                      <span className="inline-flex gap-1">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Modifier ${c.trainNumber}`} onClick={() => setCirculation(c)}>
                          <Pencil />
                        </Button>
                        {actions.droits.may("livrets_horaires", "supprimer") ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Retirer ${c.trainNumber}`}
                            onClick={() => {
                              if (window.confirm(`Retirer ${c.trainNumber} de ce livret ?`)) {
                                void operation.executer("retirer", () => removeSchedule({ scheduleId: c._id }), `${c.trainNumber} retiré du livret.`)
                              }
                            }}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </span>
                    )
                  : undefined
              }
            />
            {peut.modifier ? (
              <div className="px-4">
                <Button type="button" variant="secondary" onClick={() => setCirculation("nouvelle")}>
                  <Plus />
                  Ajouter une circulation
                </Button>
              </div>
            ) : null}
          </div>
        ) : onglet === "itineraire" ? (
          <div role="tabpanel" className="p-4">
            <ItineraireDetaille circulations={dossier.circulations} />
          </div>
        ) : (
          <div role="tabpanel" className="p-4">
            <Historique historique={dossier.historique} />
          </div>
        )}
      </Panneau>

      <DialogueLivret open={edition} onOpenChange={setEdition} livret={booklet} />
      {circulation ? (
        <DialogueCirculation
          key={circulation === "nouvelle" ? "nouvelle" : circulation._id}
          open
          onOpenChange={(ouvert) => !ouvert && setCirculation(null)}
          bookletId={booklet._id}
          circulation={circulation === "nouvelle" ? undefined : circulation}
        />
      ) : null}
      {actions.dialogueRejet}
    </ManagementDetailShell>
  )
}
