"use client"

import type { FunctionReturnType } from "convex/server"
import { ArrowRight, BadgePercent, FileSpreadsheet, Plus, Tags } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type ChangeEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { CelluleDouble, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import {
  AvisSeparation,
  ChampsGrille,
  ETAPES_GRILLE,
  etapeGrille,
  GrilleKilometrique,
  lireGrilleCsv,
  MentionAuteur,
  Simulateur,
  TableReductions,
  useDecisionGrille,
} from "@/components/fare-schedule-detail"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { RetourOperation, useOperation } from "./elements"
import { agent, dateCourte, debutJour, finJour, jourMois, nombre, TYPES_TRAIN } from "./format"
import { FenetreFormulaire, nombreSaisi } from "./formulaire"
import { CycleVie, TagApprobation, libelleApprobation } from "./statuts"

type Grille = FunctionReturnType<typeof api.functions.referentiels.grillesTarifaires>[number]

const colonnes: ColonneTableau<Grille>[] = [
  {
    cle: "grille",
    libelle: "Grille",
    rendu: (g) => (
      <CelluleDouble
        haut={g.label}
        bas={
          <>
            application au <span className="tabular">{dateCourte(g.validFrom)}</span> · {g.types.map((t) => TYPES_TRAIN[t]).join(", ") || "vide"}
          </>
        }
      />
    ),
    tri: (g) => g.validFrom,
    export: (g) => g.label,
  },
  { cle: "validite", libelle: "Validité", rendu: (g) => <span className="tabular text-[13.5px]">{jourMois(g.validFrom)} → {dateCourte(g.validUntil)}</span>, tri: (g) => g.validUntil, export: (g) => `${dateCourte(g.validFrom)} → ${dateCourte(g.validUntil)}`, secondaire: true },
  { cle: "modifiees", libelle: "Valeurs modifiées", rendu: (g) => (g.reference ? nombre(g.modifiees) : "—"), tri: (g) => g.modifiees, numerique: true, secondaire: true },
  { cle: "auteur", libelle: "Soumise par", rendu: (g) => agent(g.soumisPar ?? g.creePar), tri: (g) => g.soumisPar?.nom ?? g.creePar?.nom, secondaire: true },
  { cle: "etat", libelle: "État", rendu: (g) => <TagApprobation status={g.status} genre="feminin" />, tri: (g) => ["a_valider", "rejete", "brouillon", "actif", "expire"].indexOf(g.status), export: (g) => libelleApprobation(g.status, "feminin") },
]


function ApercuGrille({ scheduleId }: { scheduleId: string }) {
  const dossier = useQuery(api.functions.referentiels.grilleTarifaire, { scheduleId: scheduleId as never })
  const decision = useDecisionGrille(dossier)
  if (dossier === undefined) return <SkeletonLines />
  if (dossier === null) return <InlineMessage tone="warning" title="Cette grille n'existe plus." />
  return (
    <div className="grid gap-4">
      <RetourOperation retour={decision.operation.retour} />
      <AvisSeparation dossier={dossier} peutDecider={decision.peut.decider} />
      <Panneau
        plein
        titre={dossier.schedule.label}
        icone={Tags}
        sousTitre={`application au ${dateCourte(dossier.schedule.validFrom)}`}
        actions={<CycleVie etapes={ETAPES_GRILLE} courante={etapeGrille(dossier.schedule)} />}
        pied={
          <>
            <MentionAuteur dossier={dossier} />
            <div className="ml-auto flex flex-wrap gap-2">
              <LienBouton href={`/gestion/tarifs/${dossier.schedule._id}`} taille="sm" variante="ghost">
                {decision.peut.modifier ? "Éditer la grille" : "Ouvrir la grille"}
                <ArrowRight />
              </LienBouton>
              {decision.boutons()}
            </div>
          </>
        }
      >
        <GrilleKilometrique bases={dossier.bases} reference={dossier.reference?.bases ?? null} />
      </Panneau>
      {decision.dialogueRefus}
    </div>
  )
}

function DialogueNouvelleGrille({ grilles, open, onOpenChange }: { grilles: readonly Grille[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const creer = useMutation(api.functions.referentiels.creerGrille)
  const enregistrer = useMutation(api.functions.referentiels.enregistrerGrille)
  const operation = useOperation()
  const [fichier, setFichier] = useState<{ nom: string; contenu: string } | null>(null)
  const active = grilles.find((g) => g.status === "actif")
  const lire = async (event: ChangeEvent<HTMLInputElement>) => {
    const choisi = event.target.files?.[0]
    setFichier(choisi ? { nom: choisi.name, contenu: await choisi.text() } : null)
  }
  return (
    <FenetreFormulaire
      open={open}
      onOpenChange={onOpenChange}
      titre="Nouvelle grille tarifaire"
      description="La grille naît en brouillon. Elle s'édite, se soumet, puis s'approuve par un second administrateur avant de s'appliquer à sa date."
      libelleValider={
        <>
          <Plus />
          Créer la grille
        </>
      }
      enCours={operation.enCours === "creer"}
      erreur={operation.retour?.ton === "danger" ? operation.retour.detail : null}
      onSubmit={async (donnees) => {
        let bases: ReturnType<typeof lireGrilleCsv> | null = null
        if (fichier) {
          try {
            bases = lireGrilleCsv(fichier.contenu)
          } catch (cause) {
            operation.signaler({ ton: "danger", titre: "Import impossible", detail: cause instanceof Error ? cause.message : undefined })
            return
          }
        }
        const source = String(donnees.get("copierDe") ?? "")
        const id = await operation.executer("creer", async () => {
          const scheduleId = await creer({
            label: String(donnees.get("label") ?? ""),
            validFrom: debutJour(String(donnees.get("validFrom"))),
            validUntil: finJour(String(donnees.get("validUntil"))),
            roundingBasis: String(donnees.get("roundingBasis")) as "HT" | "TTC",
            vatPct: nombreSaisi(donnees, "vatPct") ?? 0,
            cssPct: nombreSaisi(donnees, "cssPct") ?? 0,
            copierDe: source ? (source as never) : undefined,
          })
          if (bases) await enregistrer({ scheduleId, bases })
          return scheduleId
        })
        if (id) {
          onOpenChange(false)
          router.push(`/gestion/tarifs/${id}`)
        }
      }}
    >
      <ChampsGrille valeurs={active ? { label: "", validFrom: 0, validUntil: 0, roundingBasis: "TTC", vatPct: active.vatPct, cssPct: active.cssPct } : undefined} />
      <Field label="Partir de" hint="La nouvelle version reprend barème et réductions ; vous modifiez ensuite ce qui change." htmlFor="grille-source">
        <SelectNative id="grille-source" name="copierDe" defaultValue={active?._id ?? ""}>
          <option value="">Une grille vierge</option>
          {grilles.map((g) => (
            <option key={g._id} value={g._id}>
              {g.label} · {libelleApprobation(g.status, "feminin")}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Ou importer le barème (CSV, facultatif)" hint="Colonnes : type de train ; classe ; taux 0–99 km ; taux 100 km et plus." htmlFor="grille-import">
        <input id="grille-import" type="file" accept=".csv,text/csv" onChange={lire} className="min-h-11 text-[14px]" />
      </Field>
      {fichier ? (
        <InlineMessage tone="info" title={`${fichier.nom} sera importé`}>
          Le barème du fichier remplace celui de la grille copiée.
        </InlineMessage>
      ) : null}
    </FenetreFormulaire>
  )
}

export function TarifsListe() {
  const droits = useDroitsGestion()
  const grilles = useQuery(api.functions.referentiels.grillesTarifaires, droits.may("tarifs") ? {} : "skip")
  const [selection, setSelection] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)
  const courant = selection ?? grilles?.find((g) => g.status === "a_valider")?._id ?? grilles?.find((g) => g.status === "actif")?._id ?? grilles?.[0]?._id
  const active = grilles?.find((g) => g.status === "actif")
  const reductionsActives = useQuery(api.functions.fareSchedules.publicDiscounts, {})
  const peutCreer = droits.may("tarifs", "creer")

  return (
    <CadreGestion
      surtitre="Commercial · tarification"
      titre="Tarifs"
      description="Base kilométrique par type de train, tranche de distance et classe (XAF/km, HT). Une grille se crée en brouillon, s'approuve par un second administrateur, puis s'applique à une date."
      lectureSeule={!droits.chargement && !peutCreer && !droits.may("tarifs", "valider") ? mentionLectureSeule(droits.role, "les grilles tarifaires") : undefined}
      actions={
        peutCreer ? (
          <Button type="button" variant="secondary" onClick={() => setCreation(true)}>
            <FileSpreadsheet />
            Nouvelle grille ou import
          </Button>
        ) : null
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <div className="grid content-start gap-5">
          {courant ? <ApercuGrille key={courant} scheduleId={courant} /> : grilles === undefined ? <SkeletonLines /> : null}
          <TableauDonnees
            libelle="Grilles tarifaires"
            colonnes={colonnes}
            lignes={grilles}
            cle={(g) => g._id}
            selection={courant}
            surLigne={(g) => setSelection(g._id)}
            recherche={{ placeholder: "Grille, auteur…", texte: (g) => `${g.label} ${g.creePar?.nom ?? ""} ${g.soumisPar?.nom ?? ""}` }}
            exportNom="grilles-tarifaires"
            triInitial={{ cle: "etat", sens: "asc" }}
            parPage={10}
            vide={{ titre: "Aucune grille", description: "Créez la première grille tarifaire en brouillon." }}
          />
        </div>
        <div className="grid content-start gap-4">
          <Simulateur discounts={reductionsActives?.map((d) => ({ ...d, isActive: true })) ?? []} />
          <Panneau titre="Réductions en vigueur" icone={BadgePercent} sousTitre={active ? `grille « ${active.label} »` : "aucune grille active"} plein>
            {reductionsActives === undefined ? (
              <SkeletonLines />
            ) : (
              <TableReductions discounts={reductionsActives} />
            )}
          </Panneau>
        </div>
      </div>
      {grilles ? <DialogueNouvelleGrille grilles={grilles} open={creation} onOpenChange={setCreation} /> : null}
    </CadreGestion>
  )
}
