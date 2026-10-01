"use client"

import { Factory, Plus, TrainFront } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Puces, SelectFiltre } from "@/components/gestion/referentiels/elements"
import { nombre } from "@/components/gestion/referentiels/format"

import {
  CadreGmao,
  ETATS_ECHEANCE,
  FAMILLES,
  FAMILLES_PLURIEL,
  gmaoApi,
  km,
  libelleRestant,
  STATUTS_ENGIN,
  TagEcheance,
  TagEngin,
  useDroitsGmao,
  type FamilleEngin,
  type LigneEngin,
} from "../commun"
import { DialogueCreationEngin } from "./formulaires-engin"

const RANG_STATUT = { immobilise: 0, en_atelier: 1, en_service: 2, reforme: 3 } as const
const RANG_ECHEANCE = { echue: 0, proche: 1, a_jour: 2 } as const

const echeanceTexte = (engin: LigneEngin) =>
  engin.prochaineEcheance
    ? `${engin.prochaineEcheance.planCode} — ${ETATS_ECHEANCE[engin.prochaineEcheance.etat].libelle} — ${libelleRestant(engin.prochaineEcheance)}`
    : "Aucun plan"

export const COLONNES_PARC: ColonneTableau<LigneEngin>[] = [
  {
    cle: "numero",
    libelle: "Engin",
    rendu: (engin) => <CelluleDouble haut={engin.numero} bas={engin.constructeur} mono />,
    tri: (engin) => engin.numero,
  },
  { cle: "serie", libelle: "Série", rendu: (engin) => engin.serie, tri: (engin) => engin.serie },
  { cle: "famille", libelle: "Famille", rendu: (engin) => FAMILLES[engin.famille], tri: (engin) => FAMILLES[engin.famille], secondaire: true },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (engin) => (
      <span className="grid justify-items-start gap-1">
        <TagEngin statut={engin.statut} />
        {engin.motifStatut ? <small className="max-w-[28ch] truncate text-[12px] text-ink-muted">{engin.motifStatut}</small> : null}
      </span>
    ),
    tri: (engin) => RANG_STATUT[engin.statut],
    export: (engin) => `${STATUTS_ENGIN[engin.statut].libelle}${engin.motifStatut ? ` — ${engin.motifStatut}` : ""}`,
  },
  { cle: "atelier", libelle: "Atelier", rendu: (engin) => engin.atelier, tri: (engin) => engin.atelier, secondaire: true },
  {
    cle: "km",
    libelle: "Compteur",
    rendu: (engin) => <span className="tabular">{km(engin.compteurKm)}</span>,
    tri: (engin) => engin.compteurKm,
    numerique: true,
  },
  {
    cle: "echeance",
    libelle: "Prochaine échéance",
    rendu: (engin) =>
      engin.prochaineEcheance ? (
        <span className="grid justify-items-start gap-1">
          <TagEcheance etat={engin.prochaineEcheance.etat} />
          <small className="text-[12.5px] text-ink-muted">
            {engin.prochaineEcheance.planCode} · <span className="tabular">{libelleRestant(engin.prochaineEcheance)}</span>
          </small>
        </span>
      ) : (
        <span className="text-ink-muted">Aucun plan</span>
      ),
    tri: (engin) => (engin.prochaineEcheance ? RANG_ECHEANCE[engin.prochaineEcheance.etat] * 10 - engin.prochaineEcheance.ratio : 99),
    export: echeanceTexte,
  },
  {
    cle: "ot",
    libelle: "OT ouverts",
    rendu: (engin) => <span className="tabular">{nombre(engin.otOuverts)}</span>,
    tri: (engin) => engin.otOuverts,
    numerique: true,
  },
  {
    cle: "train",
    libelle: "Train",
    rendu: (engin) => (engin.train ? <span className="tabular">{engin.train}</span> : <span className="text-ink-muted">—</span>),
    tri: (engin) => engin.train ?? "",
    secondaire: true,
  },
  { cle: "proprietaire", libelle: "Propriétaire", rendu: (engin) => engin.proprietaire, tri: (engin) => engin.proprietaire, secondaire: true },
]

type FiltreFamille = "toutes" | FamilleEngin

/** Liste du parc : locomotives, voitures et wagons suivis par la GMAO. */
export function ListeParc() {
  const engins = useQuery(gmaoApi.queries.equipements, {})
  const droits = useDroitsGmao()
  const router = useRouter()
  const [famille, setFamille] = useState<FiltreFamille>("toutes")
  const [statut, setStatut] = useState("actifs")
  const [atelier, setAtelier] = useState("tous")
  const [creation, setCreation] = useState(false)

  const ateliers = useMemo(() => [...new Set((engins ?? []).map((engin) => engin.atelier))].sort((a, b) => a.localeCompare(b, "fr")), [engins])

  const filtres = engins?.filter(
    (engin) =>
      (famille === "toutes" || engin.famille === famille) &&
      (statut === "tous" || (statut === "actifs" ? engin.statut !== "reforme" : engin.statut === statut)) &&
      (atelier === "tous" || engin.atelier === atelier)
  )
  const utiles = filtres?.filter((engin) => engin.statut !== "reforme") ?? []
  const enService = utiles.filter((engin) => engin.statut === "en_service").length

  return (
    <CadreGmao
      titre="Parc"
      description="Chaque engin a sa fiche de vie : compteurs, échéances préventives, ordres de travail, visites. Cliquez une ligne pour l'ouvrir."
      actions={
        droits.peut("parc_administrer") ? (
          <Button type="button" onClick={() => setCreation(true)}>
            <Plus />
            Ajouter un engin
          </Button>
        ) : null
      }
    >
      {filtres ? (
        <Indicateurs colonnes={4}>
          <Indicateur libelle="Engins affichés" icone={TrainFront} valeur={nombre(filtres.length)} />
          <Indicateur
            libelle="En service"
            valeur={nombre(enService)}
            unite={`sur ${nombre(utiles.length)}`}
            remplissage={utiles.length === 0 ? undefined : enService / utiles.length}
          />
          <Indicateur
            libelle="Immobilisés ou en atelier"
            valeur={nombre(utiles.filter((engin) => engin.statut === "immobilise" || engin.statut === "en_atelier").length)}
          />
          <Indicateur
            libelle="Échéance échue"
            valeur={nombre(utiles.filter((engin) => engin.prochaineEcheance?.etat === "echue").length)}
            evolution={{ sens: "neutre", texte: `${nombre(utiles.filter((engin) => engin.prochaineEcheance?.etat === "proche").length)} proche(s)` }}
          />
        </Indicateurs>
      ) : null}

      <Puces<FiltreFamille>
        libelle="Famille"
        valeur={famille}
        onChange={setFamille}
        options={[
          { cle: "toutes", libelle: "Tout le parc" },
          ...(Object.keys(FAMILLES_PLURIEL) as FamilleEngin[]).map((cle) => ({ cle, libelle: FAMILLES_PLURIEL[cle] })),
        ]}
      />

      <TableauDonnees
        libelle="Parc du matériel roulant"
        colonnes={COLONNES_PARC}
        lignes={filtres}
        cle={(engin) => engin.id}
        lien={(engin) => `/materiel/parc/${engin.id}`}
        recherche={{
          placeholder: "Numéro, série, constructeur, train…",
          texte: (engin) => `${engin.numero} ${engin.serie} ${engin.constructeur} ${engin.train ?? ""} ${engin.atelier} ${engin.proprietaire}`,
        }}
        filtres={
          <>
            <SelectFiltre libelle="Statut" value={statut} onChange={setStatut}>
              <option value="actifs">Hors réformés</option>
              <option value="tous">Tous les statuts</option>
              {Object.entries(STATUTS_ENGIN).map(([cle, def]) => (
                <option key={cle} value={cle}>
                  {def.libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Atelier" icone={Factory} value={atelier} onChange={setAtelier}>
              <option value="tous">Tous les ateliers</option>
              {ateliers.map((nom) => (
                <option key={nom} value={nom}>
                  {nom}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        exportNom="parc-materiel"
        imprimable
        triInitial={{ cle: "numero", sens: "asc" }}
        vide={{
          titre: engins && engins.length > 0 ? "Aucun engin pour ces filtres" : "Le parc est vide",
          description:
            engins && engins.length > 0
              ? "Élargissez la famille, le statut ou l'atelier."
              : "Aucun engin n'est encore enregistré. Ajoutez les locomotives, voitures et wagons pour suivre leur maintenance.",
          action:
            engins && engins.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFamille("toutes")
                  setStatut("tous")
                  setAtelier("tous")
                }}
              >
                Effacer les filtres
              </Button>
            ) : undefined,
        }}
      />

      <DialogueCreationEngin
        open={creation}
        onOpenChange={setCreation}
        onCree={({ equipementId }) => router.push(`/materiel/parc/${equipementId}` as Route)}
      />
    </CadreGmao>
  )
}
