"use client"

import { Clock, Gauge, Ruler, TrafficCone } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { Onglets } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"

import { CadreInfra, infraApi, kmh, minutes, plagePk, TagEtat, TagRetard, useDroitsInfra, type LigneLtv } from "../commun"
import { SchemaVoie } from "../schema-voie"
import { useLigne, zonesLtv } from "../accueil/partage"
import { DialoguePoseLtv } from "./poser-ltv"

const fmtKm = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

export const colonnesLtv: ColonneTableau<LigneLtv>[] = [
  { cle: "numero", libelle: "Numéro", rendu: (l) => <span className="tabular font-semibold">{l.numero}</span>, tri: (l) => l.numero },
  {
    cle: "plage",
    libelle: "Plage PK",
    rendu: (l) => <CelluleDouble mono haut={plagePk(l.pkDebut, l.pkFin)} bas={`${fmtKm.format(l.longueurKm)} km`} />,
    tri: (l) => l.pkDebut,
    export: (l) => plagePk(l.pkDebut, l.pkFin),
  },
  { cle: "section", libelle: "Section", rendu: (l) => l.sectionLibelle ?? "—", tri: (l) => l.sectionLibelle, secondaire: true },
  {
    cle: "vitesse",
    libelle: "Vitesse / nominale",
    rendu: (l) => (
      <span className="tabular">
        <b>{kmh(l.vitesseKmh)}</b> <span className="text-ink-muted">/ {kmh(l.vitesseNominaleKmh)}</span>
      </span>
    ),
    tri: (l) => l.vitesseKmh,
    export: (l) => `${l.vitesseKmh} / ${l.vitesseNominaleKmh} km/h`,
    numerique: true,
  },
  { cle: "perte", libelle: "Perte / train", rendu: (l) => <span className="tabular">{minutes(l.perteTempsMinutes)}</span>, tri: (l) => l.perteTempsMinutes, numerique: true },
  { cle: "motif", libelle: "Motif", rendu: (l) => (l.motif.length > 60 ? `${l.motif.slice(0, 58)}…` : l.motif), tri: (l) => l.motif, secondaire: true },
  { cle: "depuis", libelle: "Depuis", rendu: (l) => <span className="tabular">{dateCourte(l.debutLe)}</span>, tri: (l) => l.debutLe, export: (l) => dateHeure(l.debutLe) },
  {
    cle: "fin",
    libelle: "Fin prévue",
    rendu: (l) =>
      l.statut === "levee" ? (
        <CelluleDouble haut={<span className="tabular">Levée le {dateCourte(l.leveeLe)}</span>} bas={l.leveeParNom ?? undefined} />
      ) : (
        <span className="grid justify-items-start gap-1">
          <span className="tabular">{l.finPrevueLe ? dateCourte(l.finPrevueLe) : "Non fixée"}</span>
          {l.echeanceDepassee ? <TagRetard texte="Échéance dépassée" /> : null}
        </span>
      ),
    tri: (l) => l.finPrevueLe ?? l.leveeLe,
    export: (l) => (l.statut === "levee" ? `Levée le ${dateCourte(l.leveeLe)}` : `${l.finPrevueLe ? dateCourte(l.finPrevueLe) : "Non fixée"}${l.echeanceDepassee ? " (échéance dépassée)" : ""}`),
  },
  { cle: "statut", libelle: "Statut", rendu: (l) => <TagEtat valeur={l.statut} libelle={l.statutLibelle} />, tri: (l) => l.statut, export: (l) => l.statutLibelle },
  {
    cle: "anomalie",
    libelle: "Anomalie",
    rendu: (l) => (l.anomalieNumero ? <span className="tabular">{l.anomalieNumero}</span> : <span className="text-ink-muted">Aucune</span>),
    tri: (l) => l.anomalieNumero,
    secondaire: true,
  },
]

type Onglet = "actives" | "levees" | "toutes"

/** Limitations temporaires de vitesse : l'état de la ligne vu par les trains. */
export function ListeLtv() {
  const parametres = useSearchParams()
  const droits = useDroitsInfra()
  const ltvs = useQuery(infraApi.queries.ltvs, {})
  const ligne = useLigne()
  const [onglet, setOnglet] = useState<Onglet>(parametres.get("onglet") === "levees" ? "levees" : parametres.get("onglet") === "toutes" ? "toutes" : "actives")
  const [pose, setPose] = useState(false)

  const actives = ltvs?.filter((l) => l.statut === "active") ?? []
  const levees = ltvs?.filter((l) => l.statut === "levee") ?? []
  const lignes = ltvs === undefined ? undefined : onglet === "actives" ? actives : onglet === "levees" ? levees : ltvs
  const kmSousLtv = Math.round(actives.reduce((s, l) => s + l.longueurKm, 0) * 10) / 10
  const perte = Math.round(actives.reduce((s, l) => s + l.perteTempsMinutes, 0) * 10) / 10
  const depassees = actives.filter((l) => l.echeanceDepassee).length
  const peutGerer = !droits.chargement && droits.peut("ltv_gerer")

  return (
    <CadreInfra
      titre="Limitations de vitesse"
      description="Les LTV en vigueur sur la ligne, leur vitesse et le temps qu'elles coûtent à chaque train. Une LTV se lève dès que la voie est rendue à sa vitesse nominale."
      actions={
        peutGerer ? (
          <Button type="button" onClick={() => setPose(true)}>
            <Gauge />
            Poser une LTV
          </Button>
        ) : undefined
      }
    >
      <Indicateurs colonnes={4}>
        <Indicateur libelle="LTV actives" icone={TrafficCone} valeur={ltvs ? actives.length : "—"} />
        <Indicateur libelle="Ligne sous LTV" icone={Ruler} valeur={ltvs ? fmtKm.format(kmSousLtv) : "—"} unite="km" />
        <Indicateur
          libelle="Perte de temps cumulée"
          icone={Clock}
          valeur={ltvs ? fmtKm.format(perte) : "—"}
          unite="min"
          evolution={{ sens: "neutre", texte: "Pour un train qui parcourt toute la ligne" }}
        />
        <Indicateur
          libelle="Échéances dépassées"
          icone={Clock}
          valeur={ltvs ? depassees : "—"}
          evolution={{ sens: depassees > 0 ? "vigilance" : "neutre", texte: depassees > 0 ? "À lever ou prolonger" : "Aucune LTV hors délai" }}
        />
      </Indicateurs>

      <Panneau titre="LTV actives sur la ligne" icone={Gauge} sousTitre="Owendo PK 0 → Franceville">
        {ligne === undefined || ltvs === undefined ? (
          <p className="text-small text-ink-muted" role="status">
            Chargement du schéma de ligne…
          </p>
        ) : (
          <SchemaVoie gares={ligne.gares} zones={zonesLtv(actives)} />
        )}
      </Panneau>

      <div className="grid gap-3">
        <Onglets
          libelle="Statut des limitations"
          valeur={onglet}
          onChange={setOnglet}
          onglets={[
            { cle: "actives", libelle: "Actives", compte: ltvs ? actives.length : undefined },
            { cle: "levees", libelle: "Levées", compte: ltvs ? levees.length : undefined },
            { cle: "toutes", libelle: "Toutes", compte: ltvs?.length },
          ]}
        />
        <TableauDonnees
          libelle="Limitations temporaires de vitesse"
          colonnes={colonnesLtv}
          lignes={lignes}
          cle={(l) => l.id}
          lien={(l) => `/infrastructures/ltv/${l.id}`}
          recherche={{ placeholder: "Numéro, motif, section, anomalie…", texte: (l) => [l.numero, l.motif, l.sectionLibelle, l.anomalieNumero, l.poseeParNom, String(l.pkDebut), String(l.pkFin)].filter(Boolean).join(" ") }}
          exportNom={`ltv-${onglet}`}
          imprimable
          vide={{
            titre: onglet === "actives" ? "Aucune LTV active" : onglet === "levees" ? "Aucune LTV levée" : "Aucune LTV enregistrée",
            description: onglet === "actives" ? "Toute la ligne circule à sa vitesse nominale." : "L'historique des levées apparaîtra ici.",
            action:
              peutGerer && onglet !== "levees" ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setPose(true)}>
                  <Gauge />
                  Poser une LTV
                </Button>
              ) : undefined,
          }}
        />
      </div>
      {peutGerer && pose ? <DialoguePoseLtv open onOpenChange={setPose} /> : null}
    </CadreInfra>
  )
}
