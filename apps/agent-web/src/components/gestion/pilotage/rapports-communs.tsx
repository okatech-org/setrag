"use client"

import {
  Armchair,
  Calculator,
  Download,
  FileClock,
  Printer,
  Receipt,
  RotateCcw,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import type { FunctionArgs } from "convex/server"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Chargeur } from "@workspace/ui/components/voie"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative, Textarea } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"

import { Fiche, Panneau, telechargerTexte } from "@/components/charte"

import { useExecution } from "./elements"
import { ajouterJours, horodatage, jourDeService, jourNumerique, nombre, taille } from "./format"

export type RunId = FunctionArgs<typeof api.functions.pilotage.executionRapport>["runId"]
type PointDeVenteId = NonNullable<FunctionArgs<typeof api.functions.pilotage.demanderRapport>["pointOfSaleId"]>

export type TypeRapport =
  | "ventes"
  | "tracabilite_places"
  | "places_vendues"
  | "remboursements"
  | "etat_caisse"
  | "extraction_voyageurs"

export type TypeProgrammation = TypeRapport | "ventes_canaux" | "remplissage" | "annulations" | "recettes"

type Filtre = "pointOfSale" | "train" | "product"

export const RAPPORTS: Record<
  TypeRapport,
  { titre: string; description: string; icone: LucideIcon; filtres: readonly Filtre[]; base: "comptable" | "circulation"; nominatif?: boolean }
> = {
  ventes: {
    titre: "Ventes",
    description: "Par vente et opération : HT, TVA, CSS, TTC, moyen de paiement, vendeur.",
    icone: Receipt,
    filtres: ["pointOfSale", "train", "product"],
    base: "comptable",
  },
  tracabilite_places: {
    titre: "Traçabilité des places",
    description: "Blocages et déblocages de places, par agent, horodatés.",
    icone: Armchair,
    filtres: ["train"],
    base: "circulation",
  },
  places_vendues: {
    titre: "Places vendues",
    description: "Par train, voiture et place ; voyageur, téléphone et nationalité.",
    icone: Ticket,
    filtres: ["train", "pointOfSale"],
    base: "circulation",
    nominatif: true,
  },
  remboursements: {
    titre: "Remboursements",
    description: "Annulations et remboursements, pénalités retenues, motifs.",
    icone: RotateCcw,
    filtres: ["pointOfSale", "train", "product"],
    base: "comptable",
  },
  etat_caisse: {
    titre: "État de caisse",
    description: "Par caisse : opérations, montants, bagages et colis pesés, écarts, visas.",
    icone: Calculator,
    filtres: ["pointOfSale"],
    base: "comptable",
  },
  extraction_voyageurs: {
    titre: "Extraction voyageurs",
    description: "Liste nominative filtrée, pour l’exploitation et la sûreté. Chaque extraction est tracée.",
    icone: Users,
    filtres: ["train", "pointOfSale"],
    base: "circulation",
    nominatif: true,
  },
}

export const TYPES_RAPPORT = Object.keys(RAPPORTS) as TypeRapport[]

export const LIBELLE_PROGRAMMATION: Record<TypeProgrammation, string> = {
  ventes: "Ventes",
  tracabilite_places: "Traçabilité des places",
  places_vendues: "Places vendues",
  remboursements: "Remboursements",
  etat_caisse: "État de caisse",
  extraction_voyageurs: "Extraction voyageurs",
  ventes_canaux: "Ventes par canal (état des ventes)",
  remplissage: "Remplissage (état des places vendues)",
  annulations: "Annulations (état des remboursements)",
  recettes: "Recettes (état de caisse)",
}

export const LIBELLE_FREQUENCE: Record<string, string> = {
  quotidien: "Quotidienne",
  hebdomadaire: "Hebdomadaire",
  mensuel: "Mensuelle",
}

export const LIBELLE_FORMAT: Record<string, string> = {
  csv: "CSV",
  xlsx: "Excel (CSV)",
  pdf: "État imprimable (CSV + impression)",
}

const LIBELLE_DECLENCHEUR: Record<string, string> = {
  demande: "À la demande",
  programme: "Programmé",
  manuel: "Exécution immédiate",
}

export function TagExecution({ statut }: { statut: "en_cours" | "produit" | "echec" }) {
  if (statut === "produit") return <Tag tone="success">Produit</Tag>
  if (statut === "echec") return <Tag tone="danger">En échec</Tag>
  return <Tag tone="info">En production</Tag>
}

export function libelleDeclencheur(trigger: string) {
  return LIBELLE_DECLENCHEUR[trigger] ?? trigger
}

/** Télécharge le fichier d’une exécution après avoir tracé le téléchargement. */
export function useTelechargementExecution() {
  const tracer = useMutation(api.functions.pilotage.tracerTelechargement)
  return async (runId: RunId, url: string | null, nom: string | null) => {
    if (!url) throw new Error("Fichier indisponible pour ce compte.")
    await tracer({ runId })
    try {
      const reponse = await fetch(url)
      if (!reponse.ok) throw new Error(String(reponse.status))
      const texte = await reponse.text()
      telechargerTexte(nom ?? "setrag-rapport.csv", texte.replace(/^\uFEFF/, ""))
    } catch {
      // Le stockage refuse parfois la lecture croisée : on ouvre le fichier.
      window.open(url, "_blank", "noopener")
    }
    return nom ?? "fichier"
  }
}

/** Dossier d’une exécution : filtres, état, aperçu, téléchargement et impression. */
export function DossierExecution({ runId, surFermeture }: { runId: RunId; surFermeture?: () => void }) {
  const run = useQuery(api.functions.pilotage.executionRapport, { runId })
  const execution = useExecution()
  const telecharger = useTelechargementExecution()

  if (run === undefined) {
    return (
      <Panneau titre="Exécution" icone={FileClock}>
        <SkeletonLines />
      </Panneau>
    )
  }
  if (run === null) {
    return (
      <Panneau titre="Exécution" icone={FileClock}>
        <EmptyState title="Exécution introuvable" />
      </Panneau>
    )
  }
  const info = RAPPORTS[run.reportType]
  return (
    <Panneau
      titre={info.titre}
      icone={info.icone}
      sousTitre={`du ${jourNumerique(run.from)} au ${jourNumerique(run.to)}`}
      actions={
        surFermeture ? (
          <Button type="button" variant="ghost" size="icon" aria-label="Fermer l’exécution" onClick={surFermeture}>
            <X />
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagExecution statut={run.status} />
        {run.nominatif ? <Tag tone="second">Nominatif · téléchargement tracé</Tag> : null}
      </div>
      <Fiche
        elements={[
          ["Demandé le", <span key="d" className="tabular">{horodatage(run.requestedAt)}</span>],
          ["Par", run.requestedBy],
          ["Déclencheur", libelleDeclencheur(run.trigger)],
          run.schedule ? ["Programmation", run.schedule.label] : null,
          ["Point de vente", run.filters.pointOfSale ?? "Tous"],
          ["Train", run.filters.trainNumber ?? "Tous"],
          info.filtres.includes("product") ? ["Produit", run.filters.product ?? "Tous"] : null,
          run.status === "produit" ? ["Lignes", <span key="l" className="tabular">{nombre(run.rowCount)}</span>] : null,
          run.status === "produit" ? ["Fichier", <span key="f" className="tabular break-all">{run.filename} · {taille(run.byteSize)}</span>] : null,
          run.delivery ? ["Envoi", `${run.delivery.message ?? run.delivery.status} · ${run.delivery.recipients.join(", ")}`] : null,
        ]}
      />
      {run.status === "en_cours" ? <Chargeur>Production du fichier : lecture des opérations jour par jour…</Chargeur> : null}
      {run.status === "echec" ? (
        <InlineMessage tone="danger" title="L’état n’a pas pu être produit.">
          {run.error}
        </InlineMessage>
      ) : null}
      {!run.autorise ? (
        <InlineMessage tone="warning" title="État nominatif : votre rôle ne donne pas accès aux données voyageurs." />
      ) : null}
      {execution.retour}
      {run.status === "produit" && run.autorise ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={execution.enCours === "fichier"}
            onClick={() =>
              execution.executer("fichier", () => telecharger(run._id, run.url, run.filename), (nom) => `${nom} téléchargé · téléchargement tracé.`)
            }
          >
            <Download />
            Télécharger ({nombre(run.rowCount)} lignes)
          </Button>
          <Button type="button" variant="ghost" onClick={() => window.print()}>
            <Printer />
            Imprimer l’aperçu
          </Button>
        </div>
      ) : null}
      {run.preview && run.preview.lignes.length > 0 ? (
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">
            Aperçu · {nombre(run.preview.lignes.length)} première(s) ligne(s) sur {nombre(run.rowCount)}
          </span>
          <div className="max-h-80 overflow-auto rounded-md border border-line">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">Aperçu de l’état {info.titre}</caption>
              <thead>
                <tr className="bg-surface-sunk text-left text-[11px] tracking-[0.04em] text-ink-muted uppercase">
                  {run.preview.entete.map((colonne) => (
                    <th key={colonne} scope="col" className="px-2.5 py-2 whitespace-nowrap">
                      {colonne}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.preview.lignes.map((ligne, index) => (
                  <tr key={index} className="border-t border-line">
                    {ligne.map((cellule, i) => (
                      <td key={i} className={typeof cellule === "number" ? "px-2.5 py-1.5 text-right font-mono whitespace-nowrap tabular-nums" : "px-2.5 py-1.5 whitespace-nowrap"}>
                        {cellule === null ? "—" : typeof cellule === "number" ? cellule.toLocaleString("fr-FR") : cellule}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : run.status === "produit" ? (
        <EmptyState title="Aucune ligne sur cette période" description="Élargissez la période ou retirez un filtre, puis relancez." />
      ) : null}
    </Panneau>
  )
}

/** Génération d’un état à la demande, avec ses filtres. */
export function DialogueGeneration({
  type,
  surFermeture,
  surProduction,
}: {
  type: TypeRapport | null
  surFermeture: () => void
  surProduction: (runId: RunId) => void
}) {
  const filtres = useQuery(api.functions.pilotage.filtresRapport, type ? {} : "skip")
  const demander = useMutation(api.functions.pilotage.demanderRapport)
  const execution = useExecution()
  const aujourdhui = jourDeService()
  const info = type ? RAPPORTS[type] : null
  const [du, setDu] = useState(ajouterJours(aujourdhui, -7))
  const [au, setAu] = useState(ajouterJours(aujourdhui, -1))

  async function soumettre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type) return
    const data = new FormData(event.currentTarget)
    const pointOfSaleId = String(data.get("pointOfSale") ?? "") || undefined
    const trainNumber = String(data.get("train") ?? "") || undefined
    const product = (String(data.get("product") ?? "") || undefined) as "billet" | "bagage" | "colis" | "taa" | "funeraire" | undefined
    const runId = await execution.executer(
      "generer",
      () =>
        demander({
          reportType: type,
          from: du,
          to: au,
          pointOfSaleId: pointOfSaleId as PointDeVenteId | undefined,
          trainNumber,
          product,
        }),
      () => "Production lancée."
    )
    if (runId) surProduction(runId)
  }

  return (
    <Dialog open={type !== null} onOpenChange={(open) => (!open ? surFermeture() : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {info && type ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-h3">Générer l’état « {info.titre} »</DialogTitle>
              <DialogDescription>
                {info.description} Le fichier CSV (séparateur « ; », lisible par Excel) est produit sur le serveur puis conservé dans
                l’historique des exécutions.
              </DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={soumettre}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={info.base === "comptable" ? "Journée comptable du" : "Circulation du"}>
                  <Input type="date" value={du} max={au} onChange={(event) => setDu(event.target.value)} required />
                </Field>
                <Field label="au" hint="92 jours au plus.">
                  <Input type="date" value={au} min={du} onChange={(event) => setAu(event.target.value)} required />
                </Field>
                {info.filtres.includes("pointOfSale") ? (
                  <Field label="Point de vente">
                    <SelectNative name="pointOfSale" defaultValue="">
                      <option value="">Tous les points de vente</option>
                      {filtres?.pointsOfSale.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.code} · {p.name}
                          {p.isActive ? "" : " (inactif)"}
                        </option>
                      ))}
                    </SelectNative>
                  </Field>
                ) : null}
                {info.filtres.includes("train") ? (
                  <Field label="Train">
                    <SelectNative name="train" defaultValue="">
                      <option value="">Tous les trains</option>
                      {filtres?.trains.map((t) => (
                        <option key={t.number} value={t.number}>
                          {t.number} · {t.name}
                        </option>
                      ))}
                    </SelectNative>
                  </Field>
                ) : null}
                {info.filtres.includes("product") ? (
                  <Field label="Produit">
                    <SelectNative name="product" defaultValue="">
                      <option value="">Tous les produits</option>
                      <option value="billet">Billets</option>
                      <option value="bagage">Bagages</option>
                      <option value="colis">Colis</option>
                      <option value="taa">Transport de véhicule</option>
                      <option value="funeraire">Transport funéraire</option>
                    </SelectNative>
                  </Field>
                ) : null}
              </div>
              {info.nominatif ? (
                <InlineMessage tone="warning" title="Données personnelles.">
                  L’extraction et chaque téléchargement sont inscrits au journal d’audit : qui, quand, quel filtre.
                </InlineMessage>
              ) : null}
              {execution.retour}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={surFermeture}>
                  Annuler
                </Button>
                <Button type="submit" variant="secondary" loading={execution.enCours === "generer"} loadingLabel="Lancement…">
                  <Download />
                  Générer
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function premiereExecution() {
  const date = new Date(Date.now() + 24 * 3_600_000)
  date.setHours(6, 0, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Programmation d’un envoi récurrent. */
export function DialogueProgrammation({
  type,
  surFermeture,
}: {
  type: TypeRapport | null
  surFermeture: () => void
}) {
  const creer = useMutation(api.functions.reportSchedules.create)
  const execution = useExecution()
  const router = useRouter()

  async function soumettre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const recipients = String(data.get("recipients") ?? "")
      .split(/[,;\n]/)
      .map((value) => value.trim())
      .filter(Boolean)
    const r = await execution.executer(
      "programmer",
      () =>
        creer({
          label: String(data.get("label") ?? "").trim(),
          reportType: String(data.get("reportType")) as TypeRapport,
          frequency: String(data.get("frequency")) as "quotidien" | "hebdomadaire" | "mensuel",
          format: String(data.get("format")) as "csv" | "xlsx" | "pdf",
          recipients,
          nextRunAt: new Date(String(data.get("nextRunAt") ?? "")).getTime(),
        }),
      () => "Envoi récurrent programmé."
    )
    if (r) router.push(`/gestion/rapports/${r.scheduleId}` as Route)
  }

  return (
    <Dialog open={type !== null} onOpenChange={(open) => (!open ? surFermeture() : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {type ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-h3">Programmer « {RAPPORTS[type].titre} »</DialogTitle>
              <DialogDescription>
                À chaque échéance, l’état de la période close précédente (veille, semaine ou trente jours) est produit puis envoyé aux
                destinataires par la passerelle e-mail (simulée tant qu’elle n’est pas raccordée).
              </DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={soumettre}>
              <Field label="Nom de la programmation">
                <Input name="label" required defaultValue={`${RAPPORTS[type].titre} · envoi périodique`} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="État">
                  <SelectNative name="reportType" defaultValue={type}>
                    {TYPES_RAPPORT.map((t) => (
                      <option key={t} value={t}>
                        {RAPPORTS[t].titre}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field label="Fréquence">
                  <SelectNative name="frequency" defaultValue="quotidien">
                    <option value="quotidien">Quotidienne · la veille</option>
                    <option value="hebdomadaire">Hebdomadaire · 7 jours</option>
                    <option value="mensuel">Mensuelle · 30 jours</option>
                  </SelectNative>
                </Field>
                <Field label="Format">
                  <SelectNative name="format" defaultValue="csv">
                    {Object.entries(LIBELLE_FORMAT).map(([valeur, libelle]) => (
                      <option key={valeur} value={valeur}>
                        {libelle}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field label="Première exécution">
                  <Input name="nextRunAt" type="datetime-local" required defaultValue={premiereExecution()} />
                </Field>
              </div>
              <Field label="Destinataires" hint="Séparez les adresses par une virgule.">
                <Textarea name="recipients" rows={2} required defaultValue="controle.recettes@setrag.ga" />
              </Field>
              {execution.retour}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={surFermeture}>
                  Annuler
                </Button>
                <Button type="submit" variant="secondary" loading={execution.enCours === "programmer"} loadingLabel="Programmation…">
                  Programmer l’envoi
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
