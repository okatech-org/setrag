"use client"

import { Clock, Factory, Flag, Plus, ShieldAlert, SlidersHorizontal, Wrench } from "lucide-react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { SelectFiltre } from "@/components/gestion/referentiels/elements"
import { dateCourte, nombre } from "@/components/gestion/referentiels/format"

import { DialogueNouvelOt } from "../dialogue-nouvel-ot"
import {
  CadreGmao,
  gmaoApi,
  heures,
  PRIORITES,
  STATUTS_OT,
  TagOt,
  TagPriorite,
  TagRetard,
  TYPES_OT,
  useDroitsGmao,
  xaf,
  type LigneOt,
} from "../commun"

const ORDRE_PRIORITES = ["urgente", "haute", "normale", "basse"] as const
const ORDRE_STATUTS = ["demande", "planifie", "en_cours", "travaux_termines", "cloture", "annule"] as const
const OUVERTS = new Set<string>(["demande", "planifie", "en_cours", "travaux_termines"])

export const colonnesOt: ColonneTableau<LigneOt>[] = [
  {
    cle: "numero",
    libelle: "N° OT",
    rendu: (ot) => <span className="tabular font-semibold">{ot.numero}</span>,
    tri: (ot) => ot.numero,
  },
  {
    cle: "intitule",
    libelle: "Intitulé · engin",
    rendu: (ot) => <CelluleDouble haut={ot.titre} bas={[ot.engin, ot.serie].filter(Boolean).join(" · ")} />,
    tri: (ot) => ot.titre,
    export: (ot) => `${ot.titre} — ${ot.engin}${ot.serie ? ` · ${ot.serie}` : ""}`,
  },
  { cle: "type", libelle: "Nature", rendu: (ot) => TYPES_OT[ot.type], tri: (ot) => TYPES_OT[ot.type], secondaire: true },
  {
    cle: "priorite",
    libelle: "Priorité",
    rendu: (ot) => <TagPriorite priorite={ot.priorite} />,
    tri: (ot) => ORDRE_PRIORITES.indexOf(ot.priorite),
    export: (ot) => PRIORITES[ot.priorite].libelle,
  },
  {
    cle: "statut",
    libelle: "Statut",
    rendu: (ot) => (
      <span className="flex flex-wrap gap-1.5">
        <TagOt statut={ot.statut} />
        {ot.enRetard ? <TagRetard /> : null}
      </span>
    ),
    tri: (ot) => ORDRE_STATUTS.indexOf(ot.statut),
    export: (ot) => `${STATUTS_OT[ot.statut].libelle}${ot.enRetard ? " · en retard" : ""}`,
  },
  {
    cle: "atelier",
    libelle: "Atelier · équipe",
    rendu: (ot) => <CelluleDouble haut={ot.atelier} bas={ot.equipe ?? undefined} />,
    tri: (ot) => ot.atelier,
    export: (ot) => [ot.atelier, ot.equipe].filter(Boolean).join(" · "),
    secondaire: true,
  },
  {
    cle: "demande",
    libelle: "Demandé",
    rendu: (ot) => <span className="tabular">{dateCourte(ot.demandeLe)}</span>,
    tri: (ot) => ot.demandeLe,
    export: (ot) => new Date(ot.demandeLe),
  },
  {
    cle: "echeance",
    libelle: "Fin prévue · clôture",
    rendu: (ot) =>
      ot.clotureLe ? (
        <CelluleDouble haut={<span className="tabular">{dateCourte(ot.clotureLe)}</span>} bas="clôturé" />
      ) : ot.finPrevue ? (
        <CelluleDouble haut={<span className="tabular">{dateCourte(ot.finPrevue)}</span>} bas="fin prévue" />
      ) : (
        <span className="text-ink-muted">Non planifié</span>
      ),
    tri: (ot) => ot.clotureLe ?? ot.finPrevue,
    export: (ot) => (ot.clotureLe ? new Date(ot.clotureLe) : ot.finPrevue ? new Date(ot.finPrevue) : null),
    secondaire: true,
  },
  { cle: "heures", libelle: "Heures", rendu: (ot) => heures(ot.heuresPassees), tri: (ot) => ot.heuresPassees, numerique: true, secondaire: true },
  { cle: "cout", libelle: "Coût", rendu: (ot) => xaf(ot.coutFcfa), tri: (ot) => ot.coutFcfa, numerique: true },
]

/** Filtre de statut lu dans l'URL (`?statut=ouverts`, `?statut=en_retard`…). */
function statutInitial(valeur: string | null) {
  if (!valeur) return "ouverts"
  if (valeur === "tous" || valeur === "ouverts" || valeur in STATUTS_OT) return valeur
  return "ouverts"
}

/** Registre des ordres de travail : filtres, indicateurs, demande d'un OT. */
export function RegistreOt() {
  const router = useRouter()
  const parametres = useSearchParams()
  const droits = useDroitsGmao()
  const ots = useQuery(gmaoApi.queries.ordresTravail, {})
  const incidentId = parametres.get("incident") ?? undefined
  const parametreStatut = parametres.get("statut")
  const [statut, setStatut] = useState(statutInitial(parametreStatut === "en_retard" ? "ouverts" : parametreStatut))
  const [type, setType] = useState(parametres.get("type") ?? "tous")
  const [priorite, setPriorite] = useState(parametres.get("priorite") ?? "toutes")
  const [atelier, setAtelier] = useState("tous")
  const [retard, setRetard] = useState(parametreStatut === "en_retard" || parametres.get("retard") === "1" ? "retard" : "tous")
  // Ouvert d'office quand on arrive d'un incident (`?incident=`), tant que
  // l'agent ne l'a pas fermé.
  const [dialogue, setDialogue] = useState<boolean | null>(null)
  const peutDemander = droits.peut("ot_demander")
  const dialogueOuvert = peutDemander && (dialogue ?? Boolean(incidentId))

  const ateliers = useMemo(() => [...new Set((ots ?? []).map((ot) => ot.atelier))].sort((a, b) => a.localeCompare(b, "fr")), [ots])
  const filtres = ots?.filter(
    (ot) =>
      (statut === "tous" || (statut === "ouverts" ? OUVERTS.has(ot.statut) : ot.statut === statut)) &&
      (type === "tous" || ot.type === type) &&
      (priorite === "toutes" || ot.priorite === priorite) &&
      (atelier === "tous" || ot.atelier === atelier) &&
      (retard === "tous" || ot.enRetard)
  )

  const ouverts = ots?.filter((ot) => OUVERTS.has(ot.statut))
  const compte = (filtre: (ot: LigneOt) => boolean) => (ouverts ? nombre(ouverts.filter(filtre).length) : "…")

  return (
    <CadreGmao
      titre="Ordres de travail"
      description="Toutes les interventions sur le parc, de la demande à la remise en service. Un OT se ferme par la réception d'un autre agent que le réparateur."
      actions={
        peutDemander ? (
          <Button type="button" onClick={() => setDialogue(true)}>
            <Plus />
            Demander un OT
          </Button>
        ) : null
      }
    >
      <Indicateurs>
        <Indicateur libelle="OT ouverts" icone={Wrench} valeur={ouverts ? nombre(ouverts.length) : "…"} />
        <Indicateur
          libelle="En retard"
          icone={Clock}
          valeur={compte((ot) => ot.enRetard)}
          evolution={ouverts && ouverts.some((ot) => ot.enRetard) ? { sens: "vigilance", texte: "fin prévue dépassée ou demande non prise en compte" } : undefined}
        />
        <Indicateur libelle="Urgents" icone={ShieldAlert} valeur={compte((ot) => ot.priorite === "urgente")} />
        <Indicateur
          libelle="En réception"
          icone={Flag}
          valeur={compte((ot) => ot.statut === "travaux_termines")}
          evolution={{ sens: "neutre", texte: "travaux finis, remise en service à prononcer" }}
        />
      </Indicateurs>

      <TableauDonnees
        libelle="Ordres de travail"
        colonnes={colonnesOt}
        lignes={filtres}
        cle={(ot) => ot.id}
        lien={(ot) => `/materiel/ordres/${ot.id}`}
        recherche={{
          placeholder: "N° d'OT, intitulé, engin, série, équipe…",
          texte: (ot) => `${ot.numero} ${ot.titre} ${ot.engin} ${ot.serie ?? ""} ${ot.atelier} ${ot.equipe ?? ""}`,
        }}
        filtres={
          <>
            <SelectFiltre libelle="Statut" icone={SlidersHorizontal} value={statut} onChange={setStatut}>
              <option value="ouverts">OT ouverts</option>
              <option value="tous">Tous les statuts</option>
              {ORDRE_STATUTS.map((cle) => (
                <option key={cle} value={cle}>
                  {STATUTS_OT[cle].libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Nature" value={type} onChange={setType}>
              <option value="tous">Toutes natures</option>
              {Object.entries(TYPES_OT).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </SelectFiltre>
            <SelectFiltre libelle="Priorité" value={priorite} onChange={setPriorite}>
              <option value="toutes">Toutes priorités</option>
              {ORDRE_PRIORITES.map((cle) => (
                <option key={cle} value={cle}>
                  {PRIORITES[cle].libelle}
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
            <SelectFiltre libelle="Délai" icone={Clock} value={retard} onChange={setRetard}>
              <option value="tous">Tous délais</option>
              <option value="retard">En retard seulement</option>
            </SelectFiltre>
          </>
        }
        exportNom="ordres-de-travail"
        triInitial={{ cle: "demande", sens: "desc" }}
        vide={{
          titre: ots && ots.length > 0 ? "Aucun OT ne répond à ces filtres" : "Aucun ordre de travail",
          description:
            ots && ots.length > 0
              ? "Élargissez le statut (« Tous les statuts ») ou retirez un filtre."
              : "Les demandes d'intervention, les échéances préventives et les défauts de visite créent des OT.",
          action:
            ots && ots.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStatut("tous")
                  setType("tous")
                  setPriorite("toutes")
                  setAtelier("tous")
                  setRetard("tous")
                }}
              >
                Retirer les filtres
              </Button>
            ) : undefined,
        }}
      />

      {peutDemander ? (
        <DialogueNouvelOt
          open={dialogueOuvert}
          onOpenChange={(ouvert) => setDialogue(ouvert)}
          incidentId={incidentId}
          onCree={({ otId }) => router.push(`/materiel/ordres/${otId}` as Route)}
        />
      ) : null}
    </CadreGmao>
  )
}
