"use client"

import type { FunctionReturnType } from "convex/server"
import { ArrowRight, Plus, TrainFront } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"

import { CelluleDouble, Fiche, LienBouton, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Composition, DialogueTrain } from "@/components/train-detail"

import { CadreGestion, mentionLectureSeule } from "./cadre"
import { useDroitsGestion } from "./droits"
import { SelectFiltre } from "./elements"
import { CLASSES, dateService, libelleDesserte, nombre, ORDRE_CLASSES, ORDRE_TYPES_TRAIN, TYPES_TRAIN } from "./format"
import { TagActif } from "./statuts"

type Train = FunctionReturnType<typeof api.functions.referentiels.trains>[number]

const colonnes: ColonneTableau<Train>[] = [
  {
    cle: "train",
    libelle: "Train",
    rendu: (t) => (
      <CelluleDouble
        haut={t.name}
        bas={`${TYPES_TRAIN[t.type]} · ${t.prochaineDesserte?.origine && t.prochaineDesserte.destination ? `${t.prochaineDesserte.origine.name} → ${t.prochaineDesserte.destination.name}` : t.number}`}
      />
    ),
    tri: (t) => t.number,
    export: (t) => `${t.number} · ${t.name}`,
  },
  { cle: "type", libelle: "Type", rendu: (t) => TYPES_TRAIN[t.type], tri: (t) => TYPES_TRAIN[t.type], secondaire: true },
  { cle: "voitures", libelle: "Voitures", rendu: (t) => t.nbVoitures, tri: (t) => t.nbVoitures, numerique: true, secondaire: true },
  { cle: "places", libelle: "Places", rendu: (t) => (t.placesAssises > 0 ? nombre(t.placesAssises) : "—"), tri: (t) => t.placesAssises, numerique: true },
  { cle: "etat", libelle: "État", rendu: (t) => <TagActif actif={t.isActive} oui="En service" non="Désactivé" />, tri: (t) => (t.isActive ? 0 : 1), export: (t) => (t.isActive ? "En service" : "Désactivé"), secondaire: true },
]

function ApercuTrain({ train }: { train: Train }) {
  return (
    <Panneau
      titre={train.name}
      icone={TrainFront}
      sousTitre={`${TYPES_TRAIN[train.type]} · ${train.number}`}
      actions={
        <LienBouton href={`/gestion/trains/${train._id}`} taille="sm">
          Ouvrir la composition
          <ArrowRight />
        </LienBouton>
      }
    >
      <Composition voitures={train.composition} />
      <Fiche
        elements={[
          ["Places assises", <span key="a" className="tabular">{nombre(train.placesAssises)}</span>],
          ...ORDRE_CLASSES.filter((c) => train.parClasse[c] > 0).map(
            (c) => [`dont ${CLASSES[c].long}`, <span key={c} className="tabular">{nombre(train.parClasse[c])}</span>] as const
          ),
          ["Places debout", <span key="d" className="tabular">{nombre(train.placesDebout)}</span>],
          [
            "Prochaine desserte",
            train.prochaineDesserte ? `${dateService(train.prochaineDesserte.serviceDate)} · ${libelleDesserte(train.prochaineDesserte)}` : "Aucune",
          ],
        ]}
      />
    </Panneau>
  )
}

export function TrainsListe() {
  const router = useRouter()
  const droits = useDroitsGestion()
  const trains = useQuery(api.functions.referentiels.trains, droits.may("referentiel") ? {} : "skip")
  const [type, setType] = useState("tous")
  const [selection, setSelection] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)
  const lignes = trains?.filter((t) => type === "tous" || t.type === type)
  const courant = trains?.find((t) => t._id === selection) ?? trains?.find((t) => t.isActive) ?? trains?.[0]
  const peutCreer = droits.may("referentiel", "creer")

  return (
    <CadreGestion
      surtitre="Exploitation · matériel voyageurs"
      titre="Trains et voitures"
      description="La composition d'un train fixe les places vendables. Modifier une voiture après ouverture à la vente déplace les voyageurs concernés : l'outil le signale avant d'enregistrer."
      lectureSeule={!droits.chargement && !droits.may("referentiel", "modifier") ? mentionLectureSeule(droits.role, "le matériel") : undefined}
      actions={
        peutCreer ? (
          <Button type="button" variant="secondary" onClick={() => setCreation(true)}>
            <Plus />
            Nouveau train
          </Button>
        ) : null
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <TableauDonnees
          libelle="Trains"
          colonnes={colonnes}
          lignes={lignes}
          cle={(t) => t._id}
          selection={courant?._id}
          surLigne={(t) => setSelection(t._id)}
          recherche={{ placeholder: "Numéro, nom…", texte: (t) => `${t.number} ${t.name} ${t.description ?? ""}` }}
          filtres={
            <SelectFiltre libelle="Type de train" value={type} onChange={setType}>
              <option value="tous">Tous les types</option>
              {ORDRE_TYPES_TRAIN.map((t) => (
                <option key={t} value={t}>
                  {TYPES_TRAIN[t]}
                </option>
              ))}
            </SelectFiltre>
          }
          exportNom="trains-et-voitures"
          triInitial={{ cle: "train", sens: "asc" }}
          vide={{ titre: "Aucun train", description: "Le référentiel du matériel est vide." }}
        />
        <div className="grid content-start gap-4">{courant ? <ApercuTrain train={courant} /> : trains === undefined ? <SkeletonLines /> : null}</div>
      </div>
      <DialogueTrain open={creation} onOpenChange={setCreation} onCree={(id) => router.push(`/gestion/trains/${id}`)} />
    </CadreGestion>
  )
}
