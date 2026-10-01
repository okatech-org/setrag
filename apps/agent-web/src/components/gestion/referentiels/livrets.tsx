"use client"

import type { FunctionReturnType } from "convex/server"
import { ArrowRight, BookOpen, Plus, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import {
  Chevauchements,
  DialogueLivret,
  EnTeteCycle,
  MentionSoumission,
  TableCirculations,
  useActionsLivret,
} from "@/components/booklet-detail"
import { CelluleDouble, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { RetourOperation, SelectFiltre } from "./elements"
import { dateCourte, jourMois, nombre } from "./format"
import { Pastille, TagApprobation, libelleApprobation } from "./statuts"

type Livret = FunctionReturnType<typeof api.functions.referentiels.livrets>[number]

const colonnes: ColonneTableau<Livret>[] = [
  {
    cle: "livret",
    libelle: "Livret",
    rendu: (l) => (
      <CelluleDouble
        haut={l.label}
        bas={
          <>
            <span className="tabular">
              {jourMois(l.validFrom)} → {jourMois(l.validUntil)}
            </span>{" "}
            · {l.trains.length} train{l.trains.length > 1 ? "s" : ""}
          </>
        }
      />
    ),
    tri: (l) => l.label,
  },
  {
    cle: "validite",
    libelle: "Validité",
    rendu: (l) => (
      <span className="tabular text-[13.5px]">
        {dateCourte(l.validFrom)} → {dateCourte(l.validUntil)}
      </span>
    ),
    tri: (l) => l.validFrom,
    export: (l) => `${dateCourte(l.validFrom)} → ${dateCourte(l.validUntil)}`,
    secondaire: true,
  },
  {
    cle: "circulations",
    libelle: "Circulations",
    rendu: (l) => nombre(l.circulations),
    tri: (l) => l.circulations,
    numerique: true,
    secondaire: true,
  },
  {
    cle: "etat",
    libelle: "État",
    rendu: (l) => (
      <span className="flex flex-wrap gap-1.5">
        <TagApprobation status={l.status} />
        {l.chevauchements.length > 0 && l.status !== "expire" ? (
          <Pastille ton="warning" icone={TriangleAlert}>
            Chevauchement
          </Pastille>
        ) : null}
      </span>
    ),
    tri: (l) => ["a_valider", "rejete", "brouillon", "actif", "expire"].indexOf(l.status),
    export: (l) => libelleApprobation(l.status),
  },
]

const ETATS = [
  { valeur: "tous", libelle: "Tous les états" },
  { valeur: "a_valider", libelle: "À valider" },
  { valeur: "brouillon", libelle: "Brouillons et rejetés" },
  { valeur: "actif", libelle: "Actifs" },
  { valeur: "expire", libelle: "Expirés" },
] as const

/** Aperçu du livret sélectionné, avec sa décision (valider, rejeter). */
function ApercuLivret({ bookletId }: { bookletId: string }) {
  const dossier = useQuery(api.functions.referentiels.livret, { bookletId: bookletId as never })
  const actions = useActionsLivret(dossier)
  if (dossier === undefined) return <SkeletonLines />
  if (dossier === null) return <InlineMessage tone="warning" title="Ce livret n'existe plus." />
  const boutons = actions.boutons()
  return (
    <Panneau
      plein
      titre={dossier.booklet.label}
      icone={BookOpen}
      actions={<EnTeteCycle dossier={dossier} />}
      pied={
        <>
          <MentionSoumission dossier={dossier} />
          <div className="ml-auto flex flex-wrap gap-2">
            <LienBouton href={`/gestion/livrets/${dossier.booklet._id}`} taille="sm" variante="ghost">
              Ouvrir le dossier
              <ArrowRight />
            </LienBouton>
            {boutons}
          </div>
        </>
      }
    >
      <div className="grid gap-3 py-3">
        <div className="px-4">
          <RetourOperation retour={actions.operation.retour} />
          {dossier.booklet.status === "rejete" && dossier.booklet.rejectionReason ? (
            <InlineMessage tone="warning" title="Motif du rejet">
              {dossier.booklet.rejectionReason}
            </InlineMessage>
          ) : null}
        </div>
        <TableCirculations circulations={dossier.circulations} />
        <div className="px-4">
          <Chevauchements dossier={dossier} />
        </div>
      </div>
      {actions.dialogueRejet}
    </Panneau>
  )
}

export function LivretsListe() {
  const router = useRouter()
  const droits = useDroitsGestion()
  const livrets = useQuery(api.functions.referentiels.livrets, droits.may("livrets_horaires") ? {} : "skip")
  const [etat, setEtat] = useState<(typeof ETATS)[number]["valeur"]>("tous")
  const [selection, setSelection] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)

  const filtres = livrets?.filter((l) =>
    etat === "tous" ? true : etat === "brouillon" ? l.status === "brouillon" || l.status === "rejete" : l.status === etat
  )
  // Par défaut, le livret qui attend une décision.
  const courant =
    selection ?? livrets?.find((l) => l.status === "a_valider")?._id ?? livrets?.[0]?._id ?? null
  const peutCreer = droits.may("livrets_horaires", "creer")

  return (
    <CadreGestion
      surtitre="Exploitation"
      titre="Livrets horaires"
      description="Un livret fixe les trains réguliers d'une période. Il passe par quatre états ; seul un livret actif ouvre des places à la vente."
      lectureSeule={!droits.chargement && !peutCreer && !droits.may("livrets_horaires", "valider") ? mentionLectureSeule(droits.role, "les livrets") : undefined}
      actions={
        peutCreer ? (
          <Button type="button" variant="secondary" onClick={() => setCreation(true)}>
            <Plus />
            Nouveau livret
          </Button>
        ) : null
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <TableauDonnees
          libelle="Livrets horaires"
          colonnes={colonnes}
          lignes={filtres}
          cle={(l) => l._id}
          selection={courant ?? undefined}
          surLigne={(l) => setSelection(l._id)}
          recherche={{ placeholder: "Livret, train…", texte: (l) => `${l.label} ${l.trains.join(" ")}` }}
          filtres={
            <SelectFiltre libelle="Filtrer par état" value={etat} onChange={(v) => setEtat(v as typeof etat)}>
              {ETATS.map((option) => (
                <option key={option.valeur} value={option.valeur}>
                  {option.libelle}
                </option>
              ))}
            </SelectFiltre>
          }
          exportNom="livrets-horaires"
          triInitial={{ cle: "etat", sens: "asc" }}
          vide={{
            titre: "Aucun livret",
            description: "Créez le premier livret de la période : il naîtra en brouillon.",
            action: peutCreer ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setCreation(true)}>
                <Plus />
                Nouveau livret
              </Button>
            ) : undefined,
          }}
        />
        <div className="grid content-start gap-4">
          {courant ? <ApercuLivret key={courant} bookletId={courant} /> : livrets ? null : <SkeletonLines />}
        </div>
      </div>
      <DialogueLivret open={creation} onOpenChange={setCreation} onEnregistre={(id) => router.push(`/gestion/livrets/${id}`)} />
    </CadreGestion>
  )
}
