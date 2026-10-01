"use client"

import { Filter, MapPinned, Ruler, ShieldAlert, Spline, TrafficCone } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"

import { CadreInfra, infraApi, kmh, pct, plagePk, TagEtat, type LigneSection } from "../commun"
import { SchemaVoie } from "../schema-voie"
import { ETATS_VOIE, useLigne, zonesLtv } from "../accueil/partage"

const fmtKm = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })
const RANG_ETAT: Record<string, number> = { critique: 0, degrade: 1, moyen: 2, bon: 3 }

export const colonnesSections: ColonneTableau<LigneSection>[] = [
  { cle: "code", libelle: "Code", rendu: (s) => <span className="tabular font-semibold">{s.code}</span>, tri: (s) => s.code },
  { cle: "libelle", libelle: "Section", rendu: (s) => <CelluleDouble haut={s.libelle} bas={`${s.district} · ${s.brigade}`} />, tri: (s) => s.libelle },
  {
    cle: "pk",
    libelle: "PK",
    rendu: (s) => <span className="tabular whitespace-nowrap">{plagePk(s.pkDebut, s.pkFin)}</span>,
    tri: (s) => s.pkDebut,
    export: (s) => plagePk(s.pkDebut, s.pkFin),
  },
  { cle: "longueur", libelle: "Longueur", rendu: (s) => <span className="tabular">{fmtKm.format(s.longueurKm)} km</span>, tri: (s) => s.longueurKm, numerique: true },
  { cle: "district", libelle: "District", rendu: (s) => s.district, tri: (s) => s.district, secondaire: true },
  { cle: "brigade", libelle: "Brigade", rendu: (s) => s.brigade, tri: (s) => s.brigade, secondaire: true },
  {
    cle: "vitesse",
    libelle: "Vitesse nominale / limite",
    rendu: (s) => (
      <span className="tabular">
        {kmh(s.vitesseNominaleKmh)}
        {s.vitesseLimiteKmh < s.vitesseNominaleKmh ? <b className="block text-warning-ink">limitée à {kmh(s.vitesseLimiteKmh)}</b> : null}
      </span>
    ),
    tri: (s) => s.vitesseLimiteKmh,
    export: (s) => `${s.vitesseNominaleKmh} / ${s.vitesseLimiteKmh} km/h`,
    numerique: true,
  },
  {
    cle: "traverses",
    libelle: "Traverses",
    rendu: (s) => <CelluleDouble haut={s.typeTraverseLibelle} bas={<span className="tabular">{pct(s.partBetonPct)} béton</span>} />,
    tri: (s) => s.partBetonPct,
    export: (s) => `${s.typeTraverseLibelle} (${s.partBetonPct} % béton)`,
    secondaire: true,
  },
  { cle: "etat", libelle: "État", rendu: (s) => <TagEtat valeur={s.etat} libelle={s.etatLibelle} />, tri: (s) => RANG_ETAT[s.etat], export: (s) => s.etatLibelle },
  {
    cle: "anomalies",
    libelle: "Anomalies ouvertes",
    rendu: (s) => <span className={s.anomaliesOuvertes > 0 ? "tabular font-semibold" : "tabular text-ink-muted"}>{s.anomaliesOuvertes}</span>,
    tri: (s) => s.anomaliesOuvertes,
    numerique: true,
  },
  {
    cle: "ltv",
    libelle: "LTV actives",
    rendu: (s) => <span className={s.ltvActives > 0 ? "tabular font-semibold" : "tabular text-ink-muted"}>{s.ltvActives}</span>,
    tri: (s) => s.ltvActives,
    numerique: true,
  },
]

/** Voie et sections : l'armement et l'état de la ligne, section par section. */
export function ListeSections() {
  const parametres = useSearchParams()
  const sections = useQuery(infraApi.queries.sections, {})
  const ligne = useLigne()
  const [etat, setEtat] = useState(parametres.get("etat") ?? "tous")
  const [district, setDistrict] = useState(parametres.get("district") ?? "tous")

  const districts = useMemo(() => [...new Set((sections ?? []).map((s) => s.district))].sort((a, b) => a.localeCompare(b, "fr")), [sections])
  const filtrees = sections?.filter((s) => (etat === "tous" || s.etat === etat) && (district === "tous" || s.district === district))
  const longueur = sections?.reduce((t, s) => t + s.longueurKm, 0) ?? 0
  const partBeton = longueur > 0 ? (sections ?? []).reduce((t, s) => t + s.partBetonPct * s.longueurKm, 0) / longueur : 0
  const sensibles = sections?.filter((s) => s.etat === "degrade" || s.etat === "critique").length ?? 0
  const filtresActifs = etat !== "tous" || district !== "tous"

  return (
    <CadreInfra
      titre="Voie et sections"
      description="La ligne découpée en sections de maintenance : armement, traverses, vitesse nominale et état relevé par les brigades. Ouvrez une section pour son dossier et sa mise à jour."
    >
      <Panneau titre="Ligne Owendo–Franceville" icone={Spline} sousTitre="Zones sous limitation de vitesse">
        {ligne === undefined ? (
          <p className="text-small text-ink-muted" role="status">
            Chargement du schéma de ligne…
          </p>
        ) : (
          <SchemaVoie gares={ligne.gares} zones={zonesLtv(ligne.ltv)} />
        )}
      </Panneau>

      <Indicateurs colonnes={4}>
        <Indicateur libelle="Sections" icone={MapPinned} valeur={sections ? sections.length : "—"} />
        <Indicateur libelle="Longueur couverte" icone={Ruler} valeur={sections ? fmtKm.format(longueur) : "—"} unite="km" />
        <Indicateur libelle="Traverses béton" icone={Spline} valeur={sections ? pct(partBeton) : "—"} remplissage={sections ? partBeton / 100 : undefined} evolution={{ sens: "neutre", texte: "Part pondérée par la longueur" }} />
        <Indicateur
          libelle="Sections dégradées ou critiques"
          icone={ShieldAlert}
          valeur={sections ? sensibles : "—"}
          evolution={{ sens: sensibles > 0 ? "vigilance" : "neutre", texte: `${sections?.filter((s) => s.ltvActives > 0).length ?? 0} section(s) sous LTV` }}
        />
      </Indicateurs>

      <TableauDonnees
        libelle="Sections de voie"
        colonnes={colonnesSections}
        lignes={filtrees}
        cle={(s) => s.id}
        lien={(s) => `/infrastructures/voie/${s.id}`}
        recherche={{ placeholder: "Code, section, brigade, district…", texte: (s) => [s.code, s.libelle, s.district, s.brigade, s.armement, s.noteEtat].filter(Boolean).join(" ") }}
        exportNom="sections-voie"
        imprimable
        triInitial={{ cle: "pk", sens: "asc" }}
        parPage={50}
        filtres={
          <>
            <SelectFiltre libelle="État de la voie" icone={Filter} value={etat} onChange={setEtat}>
              <option value="tous">Tous les états</option>
              {Object.entries(ETATS_VOIE).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="District" icone={TrafficCone} value={district} onChange={setDistrict}>
              <option value="tous">Tous les districts</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectFiltre>
          </>
        }
        vide={{
          titre: sections && sections.length === 0 ? "Aucune section de voie renseignée" : "Aucune section pour ces filtres",
          description:
            sections && sections.length === 0
              ? "Le découpage de la ligne en sections n'est pas encore chargé : les LTV et le rattachement des anomalies en dépendent."
              : "Changez l'état ou le district retenu.",
          action: filtresActifs ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setEtat("tous")
                setDistrict("tous")
              }}
            >
              Réinitialiser les filtres
            </Button>
          ) : undefined,
        }}
      />
    </CadreInfra>
  )
}
