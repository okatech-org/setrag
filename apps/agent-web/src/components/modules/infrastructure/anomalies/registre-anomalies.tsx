"use client"

import { Camera, Clock, Filter, Flag, Layers, ShieldAlert, Tags, TriangleAlert } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { dateCourte, dateHeure } from "@/components/gestion/referentiels/format"

import { CadreInfra, infraApi, pk, TagEtat, TagLtv, TagRetard, useDroitsInfra, type LigneAnomalie } from "../commun"
import { CATEGORIES_ANOMALIE, GRAVITES, ORDRE_GRAVITES, STATUTS_ANOMALIE } from "../accueil/partage"
import { DialogueSignalement } from "./signaler-anomalie"

const RANG_GRAVITE: Record<string, number> = { critique: 0, elevee: 1, moyenne: 2, faible: 3 }
const RANG_STATUT: Record<string, number> = { signalee: 0, prise_en_charge: 1, traitee: 2, close: 3, rejetee: 4 }

export const colonnesAnomalies: ColonneTableau<LigneAnomalie>[] = [
  {
    cle: "numero",
    libelle: "Numéro",
    rendu: (a) => <span className="tabular font-semibold">{a.numero}</span>,
    tri: (a) => a.numero,
  },
  {
    cle: "pk",
    libelle: "PK",
    rendu: (a) => <span className="tabular">{pk(a.pk)}</span>,
    tri: (a) => a.pk,
    numerique: true,
  },
  {
    cle: "anomalie",
    libelle: "Anomalie",
    rendu: (a) => <CelluleDouble haut={a.description.length > 70 ? `${a.description.slice(0, 68)}…` : a.description} bas={[a.categorieLibelle, a.sectionLibelle].filter(Boolean).join(" · ")} />,
    tri: (a) => a.categorieLibelle,
    export: (a) => a.description,
  },
  { cle: "categorie", libelle: "Catégorie", rendu: (a) => a.categorieLibelle, tri: (a) => a.categorieLibelle, secondaire: true },
  { cle: "section", libelle: "Section", rendu: (a) => a.sectionLibelle ?? "Hors section", tri: (a) => a.sectionLibelle, secondaire: true },
  {
    cle: "gravite",
    libelle: "Gravité",
    rendu: (a) => <TagEtat valeur={a.gravite} libelle={a.graviteLibelle} />,
    tri: (a) => RANG_GRAVITE[a.gravite],
    export: (a) => a.graviteLibelle,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (a) => <TagEtat valeur={a.statut} libelle={a.statutLibelle} />,
    tri: (a) => RANG_STATUT[a.statut],
    export: (a) => a.statutLibelle,
  },
  {
    cle: "echeance",
    libelle: "Échéance",
    rendu: (a) =>
      a.ouverte ? (
        <span className="grid justify-items-start gap-1">
          <span className="tabular">{dateHeure(a.echeanceLe)}</span>
          {a.enRetard ? <TagRetard /> : null}
        </span>
      ) : (
        <span className="text-ink-muted">Dossier fermé</span>
      ),
    tri: (a) => (a.ouverte ? a.echeanceLe : null),
    export: (a) => (a.ouverte ? `${dateHeure(a.echeanceLe)}${a.enRetard ? " (en retard)" : ""}` : "Dossier fermé"),
  },
  {
    cle: "signale",
    libelle: "Signalé",
    rendu: (a) => <CelluleDouble haut={<span className="tabular">{dateCourte(a.signaleLe)}</span>} bas={a.signaleParNom ?? "Agent inconnu"} />,
    tri: (a) => a.signaleLe,
    export: (a) => `${dateHeure(a.signaleLe)} · ${a.signaleParNom ?? "Agent inconnu"}`,
    secondaire: true,
  },
  {
    cle: "photos",
    libelle: "Photos",
    rendu: (a) =>
      a.nbPhotos > 0 ? (
        <span className="tabular inline-flex items-center gap-1">
          <Camera aria-hidden className="size-4 text-ink-muted" />
          {a.nbPhotos}
        </span>
      ) : (
        <span className="text-ink-muted">Aucune</span>
      ),
    tri: (a) => a.nbPhotos,
    numerique: true,
    secondaire: true,
  },
  {
    cle: "ltv",
    libelle: "LTV",
    rendu: (a) => (a.ltvId ? <TagLtv /> : <span className="text-ink-muted">Non</span>),
    tri: (a) => (a.ltvId ? 1 : 0),
    export: (a) => (a.ltvId ? "oui" : "non"),
    secondaire: true,
  },
]

type FiltreStatut = "ouvertes" | "toutes" | keyof typeof STATUTS_ANOMALIE

/** Registre des anomalies terrain : la file de traitement des brigades. */
export function RegistreAnomalies() {
  const parametres = useSearchParams()
  const droits = useDroitsInfra()
  const anomalies = useQuery(infraApi.queries.anomalies, {})
  const [statut, setStatut] = useState<FiltreStatut>((parametres.get("statut") as FiltreStatut | null) ?? "ouvertes")
  const [gravite, setGravite] = useState(parametres.get("gravite") ?? "toutes")
  const [categorie, setCategorie] = useState(parametres.get("categorie") ?? "toutes")
  const [section, setSection] = useState(parametres.get("section") ?? "toutes")
  const [retard, setRetard] = useState(parametres.get("retard") === "1" ? "retard" : "tous")
  const [signalement, setSignalement] = useState(false)

  const sections = useMemo(() => {
    const vues = new Map<string, string>()
    for (const a of anomalies ?? []) if (a.sectionId && a.sectionLibelle) vues.set(a.sectionId, a.sectionLibelle)
    return [...vues.entries()].sort((x, y) => x[1].localeCompare(y[1], "fr"))
  }, [anomalies])

  const filtrees = anomalies?.filter(
    (a) =>
      (statut === "toutes" || (statut === "ouvertes" ? a.ouverte : a.statut === statut)) &&
      (gravite === "toutes" || a.gravite === gravite) &&
      (categorie === "toutes" || a.categorie === categorie) &&
      (section === "toutes" || (section === "hors" ? a.sectionId === null : a.sectionId === section)) &&
      (retard === "tous" || a.enRetard)
  )
  const ouvertes = anomalies?.filter((a) => a.ouverte) ?? []
  const filtresActifs = statut !== "ouvertes" || gravite !== "toutes" || categorie !== "toutes" || section !== "toutes" || retard !== "tous"
  const reinitialiser = () => {
    setStatut("ouvertes")
    setGravite("toutes")
    setCategorie("toutes")
    setSection("toutes")
    setRetard("tous")
  }
  const peutSignaler = !droits.chargement && droits.peut("anomalie_signaler")

  return (
    <CadreInfra
      titre="Anomalies terrain"
      description="Ce que les brigades et les techniciens relèvent sur la ligne. Chaque anomalie a une échéance de traitement fixée par sa gravité ; la clôture revient à un autre agent que celui qui l'a traitée."
      actions={
        peutSignaler ? (
          <Button type="button" onClick={() => setSignalement(true)}>
            <Flag />
            Signaler une anomalie
          </Button>
        ) : undefined
      }
    >
      <Indicateurs colonnes={4}>
        <Indicateur libelle="Anomalies ouvertes" icone={TriangleAlert} valeur={anomalies ? ouvertes.length : "—"} />
        <Indicateur
          libelle="Critiques ouvertes"
          icone={ShieldAlert}
          valeur={anomalies ? ouvertes.filter((a) => a.gravite === "critique").length : "—"}
          evolution={{ sens: ouvertes.some((a) => a.gravite === "critique") ? "vigilance" : "neutre", texte: "Traitement sous 24 heures" }}
        />
        <Indicateur
          libelle="En retard"
          icone={Clock}
          valeur={anomalies ? ouvertes.filter((a) => a.enRetard).length : "—"}
          evolution={{ sens: ouvertes.some((a) => a.enRetard) ? "baisse" : "neutre", texte: "Échéance dépassée" }}
        />
        <Indicateur libelle="Traitées, à clore" icone={Flag} valeur={anomalies ? ouvertes.filter((a) => a.statut === "traitee").length : "—"} />
      </Indicateurs>

      <TableauDonnees
        libelle="Registre des anomalies"
        colonnes={colonnesAnomalies}
        lignes={filtrees}
        cle={(a) => a.id}
        lien={(a) => `/infrastructures/anomalies/${a.id}`}
        recherche={{ placeholder: "Numéro, description, brigade, section…", texte: (a) => [a.numero, a.description, a.brigade, a.sectionLibelle, a.categorieLibelle, a.signaleParNom, String(a.pk)].filter(Boolean).join(" ") }}
        exportNom="anomalies-infrastructure"
        imprimable
        filtres={
          <>
            <SelectFiltre libelle="Statut" icone={Filter} value={statut} onChange={(v) => setStatut(v as FiltreStatut)}>
              <option value="ouvertes">Ouvertes</option>
              <option value="toutes">Tous les statuts</option>
              {Object.entries(STATUTS_ANOMALIE).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Gravité" icone={ShieldAlert} value={gravite} onChange={setGravite}>
              <option value="toutes">Toutes gravités</option>
              {ORDRE_GRAVITES.map((valeur) => (
                <option key={valeur} value={valeur}>
                  {GRAVITES[valeur].libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Catégorie" icone={Tags} value={categorie} onChange={setCategorie}>
              <option value="toutes">Toutes catégories</option>
              {Object.entries(CATEGORIES_ANOMALIE).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Section" icone={Layers} value={section} onChange={setSection}>
              <option value="toutes">Toutes sections</option>
              {sections.map(([id, libelle]) => (
                <option key={id} value={id}>
                  {libelle}
                </option>
              ))}
              <option value="hors">Hors section</option>
            </SelectFiltre>
            <SelectFiltre libelle="Échéance" icone={Clock} value={retard} onChange={setRetard}>
              <option value="tous">Toutes échéances</option>
              <option value="retard">En retard seulement</option>
            </SelectFiltre>
          </>
        }
        vide={{
          titre: anomalies && anomalies.length === 0 ? "Aucune anomalie enregistrée" : "Aucune anomalie pour ces filtres",
          description:
            anomalies && anomalies.length === 0
              ? "Les signalements des brigades apparaîtront ici dès leur saisie."
              : "Élargissez les filtres : statut, gravité, section ou échéance.",
          action: filtresActifs ? (
            <Button type="button" variant="secondary" size="sm" onClick={reinitialiser}>
              Réinitialiser les filtres
            </Button>
          ) : peutSignaler ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setSignalement(true)}>
              <Flag />
              Signaler une anomalie
            </Button>
          ) : undefined,
        }}
      />
      {peutSignaler ? <DialogueSignalement open={signalement} onOpenChange={setSignalement} /> : null}
    </CadreInfra>
  )
}
