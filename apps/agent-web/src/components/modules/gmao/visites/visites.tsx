"use client"

import { CalendarDays, ClipboardCheck, ClipboardList, Factory, Plus, TrainFront } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useQuery } from "@workspace/api/hooks"
import { Button } from "@workspace/ui/components/button"

import { CelluleDouble, Indicateur, Indicateurs, Panneau, TableauDonnees, type ColonneTableau } from "@/components/charte"
import { DateFiltre, SelectFiltre } from "@/components/gestion/referentiels/elements"
import { aujourdhuiService, dateHeure, dateService, heure, nombre } from "@/components/gestion/referentiels/format"
import { Pastille } from "@/components/gestion/referentiels/statuts"

import { APTITUDES, CadreGmao, gmaoApi, TagAptitude, useDroitsGmao, type LigneDepart, type LigneVisite } from "../commun"
import { LienCellule } from "../parc/partage"
import { libelleDecision, TagDecision } from "./decision"
import { DialogueOuvertureVisite } from "./formulaire-visite"

const STATUTS_VISITE = { en_cours: "En cours", signee: "Signée" } as const

export function TagStatutVisite({ statut }: { statut: keyof typeof STATUTS_VISITE }) {
  return statut === "signee" ? (
    <Pastille ton="accent" icone={ClipboardCheck}>
      Signée
    </Pastille>
  ) : (
    <Pastille ton="info" icone={ClipboardList}>
      En cours
    </Pastille>
  )
}

/* ============================================================== Départs */

function colonnesDeparts(ouvrir: ((tripId: string) => void) | null): ColonneTableau<LigneDepart>[] {
  return [
    { cle: "train", libelle: "Train", rendu: (d) => <span className="tabular font-semibold">{d.train}</span>, tri: (d) => d.train },
    { cle: "heure", libelle: "Départ", rendu: (d) => <span className="tabular">{heure(d.departureAt)}</span>, tri: (d) => d.departureAt, export: (d) => dateHeure(d.departureAt) },
    {
      cle: "trajet",
      libelle: "Origine → destination",
      rendu: (d) => (
        <span>
          {d.origine} → {d.destination}
        </span>
      ),
      tri: (d) => `${d.origine} ${d.destination}`,
      export: (d) => `${d.origine} → ${d.destination}`,
    },
    {
      cle: "visite",
      libelle: "Visite",
      rendu: (d) =>
        d.visite ? (
          <span className="grid justify-items-start gap-1">
            <LienCellule href={`/materiel/visites/${d.visite.id}`} mono>
              {d.visite.numero}
            </LienCellule>
            <TagStatutVisite statut={d.visite.statut} />
          </span>
        ) : ouvrir ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              ouvrir(d.tripId)
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Plus />
            Ouvrir la visite
          </Button>
        ) : (
          <span className="text-ink-muted">Aucune visite</span>
        ),
      tri: (d) => d.visite?.numero ?? "",
      export: (d) => (d.visite ? `${d.visite.numero} — ${STATUTS_VISITE[d.visite.statut]}` : "Aucune visite"),
    },
    {
      cle: "decision",
      libelle: "Décision",
      rendu: (d) => (
        <span className="grid justify-items-start gap-1">
          <TagDecision decision={d.decision} />
          {d.decision.motifs.length > 0 ? (
            <small className="max-w-[44ch] text-[12.5px] text-ink-muted">{d.decision.motifs.join(" ")}</small>
          ) : null}
        </span>
      ),
      tri: (d) => (d.decision.autorise ? 1 : 0),
      export: (d) => `${libelleDecision(d.decision)}${d.decision.motifs.length > 0 ? ` — ${d.decision.motifs.join(" ")}` : ""}`,
    },
  ]
}

function PanneauDeparts({ peutOuvrir, onOuvrir }: { peutOuvrir: boolean; onOuvrir: (tripId: string) => void }) {
  const [date, setDate] = useState(() => aujourdhuiService())
  const departs = useQuery(gmaoApi.queries.departs, { date })
  const bloques = departs?.filter((d) => !d.decision.autorise).length ?? 0

  return (
    <Panneau
      titre="Départs du jour"
      icone={TrainFront}
      sousTitre={departs ? `${dateService(date)} · ${nombre(departs.length)} départ(s) · ${nombre(bloques)} bloqué(s)` : dateService(date)}
    >
      <TableauDonnees
        libelle={`Départs du ${dateService(date)} et aptitude du matériel`}
        colonnes={colonnesDeparts(peutOuvrir ? onOuvrir : null)}
        lignes={departs}
        cle={(d) => d.tripId}
        lien={(d) => (d.visite ? `/materiel/visites/${d.visite.id}` : undefined)}
        filtres={<DateFiltre libelle="Jour de service" icone={CalendarDays} value={date} onChange={(valeur) => setDate(valeur || aujourdhuiService())} />}
        exportNom={`departs-${date}`}
        triInitial={{ cle: "heure", sens: "asc" }}
        parPage={15}
        vide={{
          titre: "Aucun départ ce jour",
          description: "Aucune circulation n'est programmée à cette date. Choisissez un autre jour de service.",
          action: (
            <Button type="button" variant="secondary" size="sm" onClick={() => setDate(aujourdhuiService(1))}>
              Voir demain
            </Button>
          ),
        }}
      />
    </Panneau>
  )
}

/* ============================================================ Registre */

const colonnesVisites: ColonneTableau<LigneVisite>[] = [
  { cle: "numero", libelle: "Visite", rendu: (v) => <span className="tabular font-semibold">{v.numero}</span>, tri: (v) => v.numero },
  { cle: "convoi", libelle: "Convoi", rendu: (v) => <CelluleDouble haut={v.convoi} bas={v.tripId ? "Circulation au plan de transport" : "Hors horaire"} />, tri: (v) => v.convoi, export: (v) => v.convoi },
  { cle: "debut", libelle: "Ouverte le", rendu: (v) => <span className="tabular">{dateHeure(v.debutLe)}</span>, tri: (v) => v.debutLe },
  { cle: "atelier", libelle: "Atelier", rendu: (v) => v.atelier, tri: (v) => v.atelier, secondaire: true },
  { cle: "engins", libelle: "Engins", rendu: (v) => <span className="tabular">{nombre(v.engins)}</span>, tri: (v) => v.engins, numerique: true },
  {
    cle: "defauts",
    libelle: "Défauts",
    rendu: (v) => (
      <span className="tabular">
        {nombre(v.defauts)}
        {v.bloquants > 0 ? ` dont ${nombre(v.bloquants)} bloquant(s)` : ""}
      </span>
    ),
    tri: (v) => v.bloquants * 1000 + v.defauts,
    export: (v) => `${v.defauts}${v.bloquants > 0 ? ` dont ${v.bloquants} bloquant(s)` : ""}`,
    numerique: true,
  },
  { cle: "statut", libelle: "Statut", rendu: (v) => <TagStatutVisite statut={v.statut} />, tri: (v) => v.statut, export: (v) => STATUTS_VISITE[v.statut] },
  {
    cle: "aptitude",
    libelle: "Aptitude",
    rendu: (v) => (v.aptitude ? <TagAptitude aptitude={v.aptitude} /> : <span className="text-ink-muted">Non prononcée</span>),
    tri: (v) => (v.aptitude ? ["inapte", "apte_sous_reserve", "apte"].indexOf(v.aptitude) : 9),
    export: (v) => (v.aptitude ? APTITUDES[v.aptitude].libelle : "Non prononcée"),
  },
  { cle: "visiteur", libelle: "Visiteur", rendu: (v) => v.visiteur ?? "—", tri: (v) => v.visiteur ?? "", secondaire: true },
]

function RegistreVisites() {
  const visites = useQuery(gmaoApi.queries.visites, {})
  const [aptitude, setAptitude] = useState("toutes")
  const [statut, setStatut] = useState("tous")
  const [atelier, setAtelier] = useState("tous")
  const ateliers = [...new Set((visites ?? []).map((v) => v.atelier))].sort((a, b) => a.localeCompare(b, "fr"))
  const filtrees = visites?.filter(
    (v) =>
      (aptitude === "toutes" || (aptitude === "aucune" ? v.aptitude === null : v.aptitude === aptitude)) &&
      (statut === "tous" || v.statut === statut) &&
      (atelier === "tous" || v.atelier === atelier)
  )

  return (
    <Panneau titre="Registre des visites" icone={ClipboardList} sousTitre="500 dernières visites">
      <TableauDonnees
        libelle="Registre des visites avant départ"
        colonnes={colonnesVisites}
        lignes={filtrees}
        cle={(v) => v.id}
        lien={(v) => `/materiel/visites/${v.id}`}
        recherche={{ placeholder: "Numéro, convoi, visiteur…", texte: (v) => `${v.numero} ${v.convoi} ${v.visiteur ?? ""} ${v.atelier}` }}
        filtres={
          <>
            <SelectFiltre libelle="Aptitude" value={aptitude} onChange={setAptitude}>
              <option value="toutes">Toutes les aptitudes</option>
              {Object.entries(APTITUDES).map(([cle, def]) => (
                <option key={cle} value={cle}>
                  {def.libelle}
                </option>
              ))}
              <option value="aucune">Non prononcée</option>
            </SelectFiltre>
            <SelectFiltre libelle="Statut de la visite" value={statut} onChange={setStatut}>
              <option value="tous">Tous les statuts</option>
              <option value="en_cours">En cours</option>
              <option value="signee">Signées</option>
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
        exportNom="visites-avant-depart"
        triInitial={{ cle: "debut", sens: "desc" }}
        vide={{
          titre: visites && visites.length > 0 ? "Aucune visite pour ces filtres" : "Aucune visite enregistrée",
          description:
            visites && visites.length > 0
              ? "Élargissez l'aptitude, le statut ou l'atelier."
              : "Les visites avant départ ouvertes par les visiteurs de rames apparaîtront ici.",
        }}
      />
    </Panneau>
  )
}

/* ================================================================ Page */

/** Visites techniques avant départ : départs du jour et registre. */
export function PageVisites() {
  const droits = useDroitsGmao()
  const router = useRouter()
  const visites = useQuery(gmaoApi.queries.visites, {})
  const [ouverture, setOuverture] = useState<{ cle: number; tripId?: string } | null>(null)
  const peutOuvrir = droits.peut("visite_signer")
  const ouvrir = (tripId?: string) => setOuverture((actuelle) => ({ cle: (actuelle?.cle ?? 0) + 1, tripId }))

  const enCours = visites?.filter((v) => v.statut === "en_cours").length

  return (
    <CadreGmao
      titre="Visites avant départ"
      description="Un convoi ne part qu'avec une visite signée apte (ou apte sous réserve) et aucun engin immobilisé. Chaque défaut majeur ou bloquant ouvre un OT à la signature."
      actions={
        peutOuvrir ? (
          <Button type="button" onClick={() => ouvrir()}>
            <Plus />
            Ouvrir une visite
          </Button>
        ) : null
      }
    >
      {visites ? (
        <Indicateurs colonnes={3}>
          <Indicateur libelle="Visites en cours" icone={ClipboardList} valeur={nombre(enCours ?? 0)} evolution={{ sens: "neutre", texte: "À terminer et signer" }} />
          <Indicateur
            libelle="Convois déclarés inaptes"
            icone={ClipboardCheck}
            valeur={nombre(visites.filter((v) => v.aptitude === "inapte").length)}
            evolution={{ sens: "neutre", texte: `sur ${nombre(visites.filter((v) => v.statut === "signee").length)} visites signées` }}
          />
          <Indicateur libelle="Visites au registre" icone={ClipboardCheck} valeur={nombre(visites.length)} />
        </Indicateurs>
      ) : null}
      <PanneauDeparts peutOuvrir={peutOuvrir} onOuvrir={(tripId) => ouvrir(tripId)} />
      <RegistreVisites />
      {ouverture ? (
        <DialogueOuvertureVisite
          key={ouverture.cle}
          open
          tripId={ouverture.tripId}
          onOpenChange={(ouvert) => {
            if (!ouvert) setOuverture(null)
          }}
          onCree={({ visiteId }) => router.push(`/materiel/visites/${visiteId}` as Route)}
        />
      ) : null}
    </CadreGmao>
  )
}
